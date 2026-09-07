import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as commerceConfig from '@/config/commerce';
import { buildMarketplaceListingAggregateId } from '@/libs/commerce/transaction-commands';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';
import { COMMERCE_FIXTURE_SELLER } from '@/test/fixtures/commerce/commerce';
import { CommerceApplication } from './commerce';

const SELLER = COMMERCE_FIXTURE_SELLER;
const LISTING_ID = 'boots_01';
const LISTING_AGGREGATE_ID = buildMarketplaceListingAggregateId(SELLER, LISTING_ID);
const ORDER_ID = '018f47d2-6a27-7c23-a62f-000000000740';

const spotDetails = {
  kind: 'spot' as const,
  spot: 'Central Station, north entrance',
  instructions: 'Ask for the blue backpack.',
  availability: {
    windows: [{ day: 'sat' as const, start: '10:00', end: '14:00' }],
    zone: 'Europe/Berlin',
  },
};

const okResponse = { ok: true as const, result: { kind: 'pickup_details', version: 1 } };

describe('CommerceApplication local pickup (Wave 7)', () => {
  beforeEach(() => {
    vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('transaction-service');
    // The multi-operator guard fails open when the seller declares no
    // transaction-service authority; keep it out of these tests.
    vi.spyOn(LocalCommerceService, 'getShop').mockResolvedValue({ record: {} } as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('delegates the capability, reveal, and owner reads to the gateway', async () => {
    const availability = vi.spyOn(MarketplaceGatewayService, 'getPickupAvailability').mockResolvedValue(true);
    const reveal = vi.spyOn(MarketplaceGatewayService, 'getOrderPickupDetails').mockResolvedValue({} as never);
    const ownerRead = vi.spyOn(MarketplaceGatewayService, 'getListingPickupDetails').mockResolvedValue({} as never);

    await expect(CommerceApplication.fetchPickupAvailable()).resolves.toBe(true);
    await CommerceApplication.fetchPickupReveal(SELLER, ORDER_ID);
    await CommerceApplication.fetchSellerPickupDetails(SELLER, LISTING_AGGREGATE_ID);

    expect(reveal).toHaveBeenCalledWith(SELLER, ORDER_ID);
    expect(ownerRead).toHaveBeenCalledWith(SELLER, LISTING_AGGREGATE_ID);
    expect(availability).toHaveBeenCalledTimes(1);
  });

  it('builds pickup_details.set on the listing aggregate with the payload CAS and envelope revision 0', async () => {
    const execute = vi.spyOn(MarketplaceGatewayService, 'execute').mockResolvedValue(okResponse as never);

    const response = await CommerceApplication.commitSetPickupDetails(SELLER, {
      sellerPubky: SELLER,
      listingId: LISTING_ID,
      expectedVersion: 3,
      details: spotDetails,
    });

    expect(response.ok).toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
    const [actor, command] = execute.mock.calls[0];
    expect(actor).toBe(SELLER);
    expect(command).toMatchObject({
      aggregateId: LISTING_AGGREGATE_ID,
      expectedRevision: 0,
      kind: 'pickup_details.set',
      payload: { expectedVersion: 3, details: spotDetails },
    });
  });

  it('builds pickup_details.clear with the same CAS envelope', async () => {
    const execute = vi.spyOn(MarketplaceGatewayService, 'execute').mockResolvedValue(okResponse as never);

    await CommerceApplication.commitClearPickupDetails(SELLER, {
      sellerPubky: SELLER,
      listingId: LISTING_ID,
      expectedVersion: 4,
    });

    expect(execute.mock.calls[0][1]).toMatchObject({
      aggregateId: LISTING_AGGREGATE_ID,
      expectedRevision: 0,
      kind: 'pickup_details.clear',
      payload: { expectedVersion: 4 },
    });
  });

  it.each(['commitMarkReady', 'commitConfirmPickup'] as const)(
    '%s targets the order aggregate with the order revision',
    async (method) => {
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute').mockResolvedValue(okResponse as never);

      await CommerceApplication[method](SELLER, { orderId: ORDER_ID, expectedRevision: 5 });

      expect(execute.mock.calls[0][1]).toMatchObject({
        aggregateId: `order:${ORDER_ID}`,
        expectedRevision: 5,
        kind: method === 'commitMarkReady' ? 'fulfillment.mark_ready' : 'fulfillment.confirm_pickup',
        payload: { orderId: ORDER_ID },
      });
    },
  );

  it.each(['commitSetPickupDetails', 'commitClearPickupDetails', 'commitMarkReady', 'commitConfirmPickup'] as const)(
    '%s is refused outside durable modes before any command is built (the client-side sandbox boundary)',
    async (method) => {
      vi.spyOn(commerceConfig, 'getCommerceAdapterMode').mockReturnValue('sandbox');
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute');

      const input =
        method === 'commitSetPickupDetails'
          ? { sellerPubky: SELLER, listingId: LISTING_ID, expectedVersion: 0, details: spotDetails }
          : method === 'commitClearPickupDetails'
            ? { sellerPubky: SELLER, listingId: LISTING_ID, expectedVersion: 0 }
            : { orderId: ORDER_ID, expectedRevision: 1 };

      // @ts-expect-error the union of input shapes is exercised per branch above
      await expect(CommerceApplication[method](SELLER, input)).rejects.toMatchObject({
        code: 'BAD_REQUEST',
        message: 'Pickup is unavailable on this deployment.',
      });
      expect(execute).not.toHaveBeenCalled();
    },
  );

  describe('commitCreateMarketplaceCheckout (§A2 fulfillment plumbing)', () => {
    const sellerB = 'b'.repeat(52);
    const address = {
      name: 'Alice Buyer',
      line1: '1 Market Street',
      line2: '',
      city: 'New York',
      region: 'NY',
      postalCode: '10001',
      countryCode: 'US',
    };
    const lineA = {
      listingAggregateId: LISTING_AGGREGATE_ID,
      sellerPubky: SELLER,
      publishedFulfillmentMethods: ['shipping', 'pickup'],
      expectedRevision: 3,
      quantity: 1,
    } as const;
    const lineB = {
      listingAggregateId: `listing:${sellerB}_chair`,
      sellerPubky: sellerB,
      publishedFulfillmentMethods: ['shipping', 'pickup'],
      expectedRevision: 2,
      quantity: 2,
    } as const;

    it('assigns each seller group its choice and sends no address on a pickup-only checkout', async () => {
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute').mockResolvedValue(okResponse as never);

      await CommerceApplication.commitCreateMarketplaceCheckout(SELLER, {
        lines: [lineA, lineB],
        fulfillmentChoiceBySeller: { [SELLER]: 'pickup', [sellerB]: 'pickup' },
      });

      const command = execute.mock.calls[0][1];
      expect(command.kind).toBe('checkout.create');
      const payload = command.payload as { lines: { fulfillment: string }[]; deliveryAddress?: unknown };
      expect(payload.lines.map((line) => line.fulfillment)).toEqual(['pickup', 'pickup']);
      expect(payload.deliveryAddress).toBeUndefined();
    });

    it('defaults unchosen groups to shipping and carries the address when any group ships', async () => {
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute').mockResolvedValue(okResponse as never);

      await CommerceApplication.commitCreateMarketplaceCheckout(SELLER, {
        lines: [lineA, lineB],
        fulfillmentChoiceBySeller: { [sellerB]: 'pickup' },
        deliveryAddress: address,
      });

      const payload = execute.mock.calls[0][1].payload as { lines: { fulfillment: string }[]; deliveryAddress?: unknown };
      expect(payload.lines.map((line) => line.fulfillment)).toEqual(['shipping', 'pickup']);
      expect(payload.deliveryAddress).toEqual(address);
    });

    it('refuses a choice a line does not publish with a typed validation error — never a silent fallback', async () => {
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute');

      await expect(
        CommerceApplication.commitCreateMarketplaceCheckout(SELLER, {
          lines: [{ ...lineB, publishedFulfillmentMethods: ['shipping'] }],
          fulfillmentChoiceBySeller: { [sellerB]: 'pickup' },
        }),
      ).rejects.toMatchObject({
        category: 'validation',
        code: 'INVALID_INPUT',
        context: { sellerPubky: sellerB, fulfillment: 'pickup', listingAggregateId: lineB.listingAggregateId },
      });
      expect(execute).not.toHaveBeenCalled();
    });

    it('refuses a pickup-only checkout that presents an address (the §A2 smuggling rule)', async () => {
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute');

      await expect(
        CommerceApplication.commitCreateMarketplaceCheckout(SELLER, {
          lines: [lineA],
          fulfillmentChoiceBySeller: { [SELLER]: 'pickup' },
          deliveryAddress: address,
        }),
      ).rejects.toMatchObject({ category: 'validation' });
      expect(execute).not.toHaveBeenCalled();
    });

    it('refuses a shipping checkout without an address', async () => {
      const execute = vi.spyOn(MarketplaceGatewayService, 'execute');

      await expect(
        CommerceApplication.commitCreateMarketplaceCheckout(SELLER, { lines: [lineA] }),
      ).rejects.toMatchObject({ category: 'validation' });
      expect(execute).not.toHaveBeenCalled();
    });
  });
});
