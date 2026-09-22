import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { MARKETPLACE_DELIVERY_ADDRESS_DISCLOSURE } from '@/config/commerce-copy';
import { MarketplaceCheckout } from './MarketplaceCheckout';

beforeAll(() => {
  Element.prototype.scrollIntoView = vi.fn();
  Element.prototype.hasPointerCapture = vi.fn();
  Element.prototype.releasePointerCapture = vi.fn();
  Element.prototype.setPointerCapture = vi.fn();
});

const view = vi.hoisted(() => ({
  items: [] as unknown[],
  isLoading: false,
  adapterMode: 'sandbox' as string,
  deployEnv: 'production' as 'production' | 'staging' | undefined,
  hasMarketplaceSession: false,
  needsSession: false,
  sessionError: null as string | null,
  addresses: [] as unknown[],
  selectedAddressId: null as string | null,
  fulfillmentOptions: {} as Record<string, Array<'shipping' | 'pickup'>>,
  fulfillmentEffective: {} as Record<string, 'shipping' | 'pickup'>,
  requiresDeliveryAddress: true,
  hasFulfillmentConflict: false,
  isPickupCapabilityLoading: false,
  orderCount: 1,
  payResult: { ok: false, orderIds: [] as string[], boundOrders: [] as unknown[] },
}));

const checkoutActions = vi.hoisted(() => ({
  pay: vi.fn(async () => view.payResult),
  setFulfillmentChoice: vi.fn(),
}));

const listing = {
  id: 'seller:boots',
  listing_id: 'boots',
  record: {
    ownerPubky: 's'.repeat(52),
    listingId: 'boots',
    title: 'Vintage boots',
    media: [],
    variants: [{ id: 'variant_42', options: { size: '42' }, quantity: 3 }],
    sale: { format: 'fixed_price', unitPrice: { amountMinor: 1200, currency: 'USD', exponent: 2 } },
  },
};

const secondSellerListing = {
  ...listing,
  id: 'other:camera',
  listing_id: 'camera',
  record: {
    ...listing.record,
    ownerPubky: 'o'.repeat(52),
    listingId: 'camera',
    title: 'Rangefinder camera',
    variants: [{ id: 'variant_01', options: {}, quantity: 2 }],
    sale: { format: 'fixed_price', unitPrice: { amountMinor: 15000, currency: 'BTC', exponent: 8 } },
  },
};

const searchParams = vi.hoisted(() => ({ current: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => '/marketplace/checkout',
  useSearchParams: () => searchParams.current,
}));

vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return { ...actual, getCommerceAdapterMode: () => view.adapterMode };
});

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>();
  return { ...actual, getDeployEnv: () => view.deployEnv };
});

vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/useMarketplaceCart/useMarketplaceCart')>();
  const { sumMoneyByAsset } = await import('@/libs/commerce/pricing');
  return {
    ...actual,
    useMarketplaceCart: () => {
      const items = view.items as Array<{
        listingId: string;
        quantity: number;
        variantId: string;
        listing: {
          record: {
            variants: Array<{
              id: string;
              priceOverride?: { amountMinor: number; currency: string; exponent: number };
            }>;
            sale: { format: string; unitPrice?: { amountMinor: number; currency: string; exponent: number } };
          };
        };
        pricingSource?: 'listing' | 'offer';
      }>;
      return {
        items,
        ordinaryItems: items,
        awardItems: [],
        itemCount: items.reduce((total, item) => total + item.quantity, 0),
        subtotals: sumMoneyByAsset(
          items.flatMap((item) => {
            const variant = item.listing.record.variants.find(({ id }) => id === item.variantId);
            const price =
              variant?.priceOverride ??
              (item.listing.record.sale.format === 'fixed_price' ? item.listing.record.sale.unitPrice : null);
            return price ? [{ money: price, quantity: item.quantity }] : [];
          }),
        ),
        isLoading: view.isLoading,
        add: vi.fn(),
        update: vi.fn(),
        remove: vi.fn(),
        clear: vi.fn(),
        groups: actual.groupMarketplaceCartItems(items as never),
      };
    },
  };
});

vi.mock('@/hooks/useMarketplaceCheckout/useMarketplaceCheckout', async () => {
  const { useForm } = await import('react-hook-form');
  const { zodResolver } = await import('@hookform/resolvers/zod');
  const { marketplaceCheckoutDefaults, marketplaceCheckoutSchema } =
    await import('@/hooks/useMarketplaceCheckout/useMarketplaceCheckout.types');
  return {
    useMarketplaceCheckout: () => ({
      form: useForm({
        resolver: zodResolver(marketplaceCheckoutSchema),
        defaultValues: marketplaceCheckoutDefaults,
        mode: 'onTouched',
      }),
      submit: vi.fn(async () => false),
      pay: checkoutActions.pay,
      isPaying: false,
      needsSession: view.needsSession,
      sessionError: view.sessionError,
      hasMarketplaceSession: view.hasMarketplaceSession,
      addresses: view.addresses,
      selectedAddressId: view.selectedAddressId,
      selectAddress: vi.fn(),
      fulfillmentOptionsForSeller: (sellerPubky: string) => view.fulfillmentOptions[sellerPubky] ?? ['shipping'],
      fulfillmentForSeller: (sellerPubky: string) => view.fulfillmentEffective[sellerPubky] ?? 'shipping',
      setFulfillmentChoice: checkoutActions.setFulfillmentChoice,
      requiresDeliveryAddress: view.requiresDeliveryAddress,
      hasFulfillmentConflict: view.hasFulfillmentConflict,
      isPickupCapabilityLoading: view.isPickupCapabilityLoading,
      orderCount: view.orderCount,
    }),
  };
});

vi.mock('@/hooks/useMarketplaceOrders/useMarketplaceOrders', () => ({
  useMarketplaceOrders: () => ({
    orders: [],
    isLoading: false,
    error: null,
    needsSession: false,
    adapterMode: view.adapterMode,
    refresh: vi.fn(),
    advancePayment: vi.fn(),
    actOnOrder: vi.fn(),
  }),
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getSellerPaymentConfig: vi.fn(async () => ({
      bitcoinAvailable: true,
      bitcoinOfferAvailable: true,
      stripePaymentLink: 'https://buy.stripe.com/test_checkout',
      paypalMerchantEmail: 'seller@example.com',
    })),
    getIndicativeBtcRate: vi.fn(async () => null),
  },
}));

vi.mock('@/organisms/Marketplace/MarketplaceIndicativePrice', () => ({
  MarketplaceIndicativePrice: ({ money }: { money: { currency: string } }) =>
    money.currency === 'USD' ? <span>≈ ₿137,000</span> : null,
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceSessionConnectDialog', () => ({
  MarketplaceSessionConnectDialog: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel ?? 'Approve in Pubky Ring'}</button>
  ),
}));

vi.mock('@/hooks/useMarketplaceSellerSummary/useMarketplaceSellerSummary', () => ({
  useMarketplaceSellerSummary: (sellerPubky: string, options?: { includeReputation?: boolean }) => ({
    shop: null,
    reputation: options?.includeReputation === false ? { status: 'unavailable' } : { status: 'new_seller' },
    displayName: sellerPubky === listing.record.ownerPubky ? 'Satoshi Vintage' : 'Film Camera Supply',
  }),
}));

function seededCart() {
  view.items = [
    {
      id: 'seller:boots:variant_42',
      listingId: listing.id,
      variantId: 'variant_42',
      quantity: 1,
      listing,
    },
  ];
  view.isLoading = false;
}

async function fillValidDelivery(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText('Recipient'), 'Alice Buyer');
  await user.type(screen.getByLabelText('Address line 1'), '1 Market Street');
  await user.type(screen.getByLabelText('City'), 'New York');
  await user.type(screen.getByLabelText('State'), 'NY');
  await user.type(screen.getByLabelText('ZIP code'), '10001');
}

describe('MarketplaceCheckout', () => {
  beforeEach(() => {
    checkoutActions.pay.mockClear();
    checkoutActions.setFulfillmentChoice.mockReset();
    view.items = [];
    view.isLoading = false;
    view.adapterMode = 'sandbox';
    view.deployEnv = 'production';
    view.hasMarketplaceSession = false;
    view.needsSession = false;
    view.sessionError = null;
    view.addresses = [];
    view.selectedAddressId = null;
    view.fulfillmentOptions = {};
    view.fulfillmentEffective = {};
    view.requiresDeliveryAddress = true;
    view.hasFulfillmentConflict = false;
    view.isPickupCapabilityLoading = false;
    view.orderCount = 1;
    view.payResult = { ok: false, orderIds: [], boundOrders: [] };
    window.history.replaceState(null, '', '/marketplace/checkout');
  });

  it('disables Pay without a marketplace session in durable mode', () => {
    seededCart();
    view.adapterMode = 'transaction-service';
    view.hasMarketplaceSession = false;

    render(<MarketplaceCheckout />);

    expect(screen.getByRole('heading', { name: 'Approve in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
    const pay = screen.getByTestId('marketplace-checkout-pay');
    expect(pay).toBeDisabled();
    expect(pay).not.toHaveAttribute('aria-describedby');
  });

  it.each(['transaction-service', 'locks-paykit', 'unavailable'] as const)(
    'shows muted seller-direct helper in %s production checkout, not an amber money warning',
    (adapterMode) => {
      seededCart();
      view.adapterMode = adapterMode;
      view.hasMarketplaceSession = true;
      view.deployEnv = 'production';

      render(<MarketplaceCheckout />);

      expect(screen.queryByRole('note')).not.toBeInTheDocument();
      expect(
        screen.queryByText('Real money. Payments are final and go directly to the seller.'),
      ).not.toBeInTheDocument();
      expect(screen.getByText('Paid directly to the seller.')).toBeInTheDocument();
      expect(screen.getByText(MARKETPLACE_DELIVERY_ADDRESS_DISCLOSURE)).toBeInTheDocument();
    },
  );

  it('does not show a production money warning when the deploy environment is unknown', () => {
    seededCart();
    view.adapterMode = 'sandbox';
    view.deployEnv = undefined;

    render(<MarketplaceCheckout />);

    expect(screen.queryByRole('note')).not.toBeInTheDocument();
    expect(screen.queryByText(/Real money/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Staging environment/)).not.toBeInTheDocument();
  });

  it('shows the staging notice regardless of adapter mode', () => {
    seededCart();
    view.adapterMode = 'sandbox';
    view.deployEnv = 'staging';

    render(<MarketplaceCheckout />);

    expect(screen.getByRole('note')).toHaveTextContent('Staging environment — test rails, no real funds move');
    expect(screen.queryByText('Real money. Payments are final and go directly to the seller.')).not.toBeInTheDocument();
    expect(screen.queryByText('Paid directly to the seller.')).not.toBeInTheDocument();
  });

  it.each([false, true])('renders truthful address copy exactly once with saved addresses=%s', (hasSavedAddress) => {
    seededCart();
    view.addresses = hasSavedAddress ? [{ id: 'home', label: 'Home', city: 'New York', is_default: true }] : [];

    render(<MarketplaceCheckout />);

    expect(screen.getAllByText(MARKETPLACE_DELIVERY_ADDRESS_DISCLOSURE)).toHaveLength(1);
    expect(screen.queryByText(/not sent/)).not.toBeInTheDocument();
  });

  it('enables Pay after session plus a valid form', async () => {
    const user = userEvent.setup();
    seededCart();
    view.adapterMode = 'transaction-service';
    view.hasMarketplaceSession = true;

    render(<MarketplaceCheckout />);

    expect(screen.getByText(/Purchases approved in Pubky Ring/)).toBeInTheDocument();
    const pay = screen.getByTestId('marketplace-checkout-pay');
    expect(pay).toBeDisabled();

    await fillValidDelivery(user);
    expect(pay).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /I accept guarantee policy v1/ })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: /I accept guarantee policy v1/ }));
    await waitFor(() => expect(pay).toBeEnabled());
  });

  it('pays on the checkout screen instead of routing to orders', async () => {
    const user = userEvent.setup();
    seededCart();
    view.payResult = { ok: true, orderIds: ['018f47d2-6a27-7c23-a49d-000000000001'], boundOrders: [] };

    render(<MarketplaceCheckout />);
    await fillValidDelivery(user);
    await user.click(screen.getByRole('checkbox', { name: /I accept sandbox guarantee policy v1/ }));
    await user.click(screen.getByTestId('marketplace-checkout-pay'));

    expect(checkoutActions.pay).toHaveBeenCalled();
  });

  it('requires the guarantee after a pay attempt and leaves it unchecked by default', async () => {
    seededCart();

    render(<MarketplaceCheckout />);

    const guarantee = screen.getByRole('checkbox', { name: /I accept sandbox guarantee policy v1/ });
    expect(guarantee).not.toBeChecked();
    expect(screen.queryByText('Accept the guarantee terms.')).not.toBeInTheDocument();

    await fillValidDelivery(userEvent.setup());
    expect(screen.getByTestId('marketplace-checkout-pay')).toBeDisabled();
    expect(
      screen.getByText('Fill in delivery details, accept the guarantee, and choose a payment method to pay.'),
    ).toBeInTheDocument();
  });

  it('re-opens Ring approval when a session expires mid-flow', () => {
    seededCart();
    view.adapterMode = 'locks-paykit';
    view.hasMarketplaceSession = true;
    view.needsSession = true;
    view.sessionError = 'Marketplace session required.';

    render(<MarketplaceCheckout />);

    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByTestId('marketplace-checkout-pay')).toBeDisabled();
  });

  it('shows an empty checkout when the cart has no ordinary items', () => {
    render(<MarketplaceCheckout />);

    expect(screen.getByText('Nothing to check out')).toBeInTheDocument();
  });
});

describe('MarketplaceCheckout local pickup (Wave 7, §A2)', () => {
  beforeEach(() => {
    checkoutActions.setFulfillmentChoice.mockReset();
    view.items = [];
    view.isLoading = false;
    view.adapterMode = 'sandbox';
    view.hasMarketplaceSession = false;
    view.needsSession = false;
    view.sessionError = null;
    view.addresses = [];
    view.selectedAddressId = null;
    view.fulfillmentOptions = {};
    view.fulfillmentEffective = {};
    view.requiresDeliveryAddress = true;
    view.hasFulfillmentConflict = false;
    view.isPickupCapabilityLoading = false;
    view.orderCount = 1;
    window.history.replaceState(null, '', '/marketplace/checkout');
  });

  it('offers the fulfillment choice only when every line in the group publishes both', async () => {
    const user = userEvent.setup();
    seededCart();
    view.fulfillmentOptions = { [listing.record.ownerPubky]: ['shipping', 'pickup'] };

    render(<MarketplaceCheckout />);

    const select = screen.getByLabelText(`Fulfillment for items from ${listing.record.ownerPubky}`);
    expect(select).toHaveTextContent('Ship it');
    await user.click(select);
    await user.click(screen.getByRole('option', { name: 'Local pickup' }));
    expect(checkoutActions.setFulfillmentChoice).toHaveBeenCalledWith(listing.record.ownerPubky, 'pickup');
  });

  it('renders a pickup group with no shipping line and the reveal note', () => {
    seededCart();
    view.fulfillmentEffective = { [listing.record.ownerPubky]: 'pickup' };
    view.requiresDeliveryAddress = false;

    render(<MarketplaceCheckout />);

    expect(screen.getByText(/Local pickup — no delivery address or shipping for these items/)).toBeInTheDocument();
    expect(document.querySelector('[data-surface="checkout-pickup-group"]')).toBeTruthy();
  });

  it('hides the delivery-address step on a pickup-only checkout and says why', () => {
    seededCart();
    view.fulfillmentEffective = { [listing.record.ownerPubky]: 'pickup' };
    view.requiresDeliveryAddress = false;

    render(<MarketplaceCheckout />);

    expect(screen.queryByLabelText('Recipient')).not.toBeInTheDocument();
    expect(screen.getByText(/No delivery address is needed/)).toBeInTheDocument();
    expect(screen.getByText('No shipping — pickup is arranged with the seller after payment.')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: /I accept sandbox guarantee policy v1/ })).toBeInTheDocument();
  });

  it('states the (seller, fulfillment) split plainly before pay', () => {
    view.items = [
      { id: 'seller:boots:variant_42', listingId: listing.id, variantId: 'variant_42', quantity: 1, listing },
      {
        id: 'other:camera:variant_01',
        listingId: secondSellerListing.id,
        variantId: 'variant_01',
        quantity: 1,
        listing: secondSellerListing,
      },
    ];
    view.orderCount = 2;

    render(<MarketplaceCheckout />);

    expect(screen.getByText('This starts 2 checkouts — one per seller and delivery method.')).toBeInTheDocument();
  });

  it('blocks pay and explains when a group has no common fulfillment', () => {
    seededCart();
    view.fulfillmentOptions = { [listing.record.ownerPubky]: [] };
    view.fulfillmentEffective = {};
    view.hasFulfillmentConflict = true;

    render(<MarketplaceCheckout />);

    expect(screen.getByRole('alert')).toHaveTextContent(/can't be checked out together/);
    expect(screen.getByTestId('marketplace-checkout-pay')).toBeDisabled();
    expect(screen.getByText("Some items can't be checked out together — see the note above.")).toHaveAttribute(
      'id',
      'checkout-pay-reason',
    );
  });

  it('shows a skeleton instead of pickup or conflict copy while pickup capability is loading', () => {
    seededCart();
    view.isPickupCapabilityLoading = true;
    view.fulfillmentOptions = { [listing.record.ownerPubky]: [] };
    view.hasFulfillmentConflict = true;

    render(<MarketplaceCheckout />);

    expect(screen.getByTestId('pickup-capability-skeleton')).toHaveAttribute(
      'aria-label',
      'Checking pickup availability',
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.queryByText(/Local pickup — no delivery address/)).not.toBeInTheDocument();
  });
});
