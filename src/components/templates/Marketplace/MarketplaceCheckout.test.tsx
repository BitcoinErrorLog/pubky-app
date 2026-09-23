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
  awardItems: [] as Array<{ awardId: string; listingId: string; variantId: string }>,
}));

const checkoutActions = vi.hoisted(() => ({
  pay: vi.fn(async () => view.payResult),
  setFulfillmentChoice: vi.fn(),
  remove: vi.fn(async () => {}),
  rememberAddress: vi.fn(async () => {}),
}));

const offerState = vi.hoisted(() => ({
  offers: [] as Array<Record<string, unknown>>,
  isLoading: false,
  refresh: vi.fn(async () => {}),
  submit: vi.fn(),
  outcome: { ok: true, orderId: '00000000-0000-4000-8000-000000000803', boundOrder: null } as
    | { ok: true; orderId: string; boundOrder: null }
    | { ok: false; code: string },
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
        awardItems: view.awardItems,
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
        remove: checkoutActions.remove,
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
      rememberAddress: checkoutActions.rememberAddress,
      fulfillmentOptionsForSeller: (sellerPubky: string) => view.fulfillmentOptions[sellerPubky] ?? ['shipping'],
      fulfillmentForSeller: (sellerPubky: string) => view.fulfillmentEffective[sellerPubky] ?? 'shipping',
      setFulfillmentChoice: checkoutActions.setFulfillmentChoice,
      requiresDeliveryAddress: view.requiresDeliveryAddress,
      hasFulfillmentConflict: view.hasFulfillmentConflict,
      isPickupCapabilityLoadingForSeller: () => view.isPickupCapabilityLoading,
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
    getOrFetchListing: vi.fn(async () => listing.record),
    getListing: vi.fn(async () => listing),
    getCartItems: vi.fn(async () => []),
    getManyListings: vi.fn(async () => new Map()),
  },
}));

vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({
  useMarketplaceCartCount: () => 0,
}));

vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => 0,
}));

vi.mock('@/hooks/useMarketplaceOffers/useMarketplaceOffers', () => ({
  useMarketplaceOffers: () => ({
    offers: offerState.offers,
    isLoading: offerState.isLoading,
    refresh: offerState.refresh,
  }),
}));

vi.mock('@/hooks/useMarketplaceOfferCheckout/useMarketplaceOfferCheckout', () => ({
  useMarketplaceOfferCheckout: () => ({ submit: offerState.submit, isSubmitting: false }),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'b'.repeat(52) }),
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

function resetCheckoutView() {
  checkoutActions.pay.mockClear();
  checkoutActions.setFulfillmentChoice.mockReset();
  checkoutActions.remove.mockClear();
  checkoutActions.rememberAddress.mockClear();
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
  view.awardItems = [];
  offerState.offers = [];
  offerState.isLoading = false;
  offerState.refresh.mockClear();
  offerState.submit.mockReset();
  offerState.outcome = { ok: true, orderId: '00000000-0000-4000-8000-000000000803', boundOrder: null };
  offerState.submit.mockResolvedValue(offerState.outcome);
  searchParams.current = new URLSearchParams();
  window.history.replaceState(null, '', '/marketplace/checkout');
}

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
    resetCheckoutView();
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
    resetCheckoutView();
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

const acceptedOffer = {
  id: 'offer-1',
  state: 'accepted',
  buyerPubky: 'b'.repeat(52),
  award: {
    id: 'award-1',
    state: 'active',
    listing: {
      sellerPubky: 's'.repeat(52),
      listingId: 'boots',
      title: 'Vintage boots',
      aggregateId: 'listing:s_boots',
      listingRevision: 3,
      listingRecordSha256: 'a'.repeat(64),
    },
    variant: { id: 'variant_42', options: [{ name: 'Size', value: '42' }] },
    unitPrice: { amountMinor: 600, currency: 'USD', exponent: 2 },
    quantity: 1,
    convertBy: '2026-09-15T12:00:00.000Z',
    subtotal: { amountMinor: 600, currency: 'USD', exponent: 2 },
    shipping: { amountMinor: 100, currency: 'USD', exponent: 2 },
    merchandiseTotal: { amountMinor: 700, currency: 'USD', exponent: 2 },
  },
};

describe('MarketplaceCheckout accepted-offer path', () => {
  beforeEach(() => {
    resetCheckoutView();
    searchParams.current = new URLSearchParams('offer=offer-1');
    view.awardItems = [{ awardId: 'award-1', listingId: 's:boots', variantId: 'variant_42' }];
    offerState.offers = [acceptedOffer];
    view.addresses = [
      {
        id: 'home',
        label: 'Home',
        city: 'New York',
        is_default: true,
      },
    ];
    window.history.replaceState(null, '', '/marketplace/checkout?offer=offer-1');
  });

  async function fillAndPay(user: ReturnType<typeof userEvent.setup>) {
    await fillValidDelivery(user);
    await user.click(screen.getByRole('checkbox', { name: /I accept sandbox guarantee policy v1/ }));
    const pay = screen.getByTestId('marketplace-checkout-pay');
    await waitFor(() => expect(pay).toBeEnabled());
    await user.click(pay);
  }

  it('renders server-projected agreed price, shipping, total, and deadline on the one Checkout screen', () => {
    render(<MarketplaceCheckout />);

    expect(screen.getByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(screen.getByText('Vintage boots')).toBeInTheDocument();
    expect(screen.getByText(/42 · Quantity 1/)).toBeInTheDocument();
    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent('$6.00');
    expect(screen.getByText('Shipping').parentElement).toHaveTextContent('$1.00');
    expect(screen.getByText('Merchandise total').parentElement).toHaveTextContent('$7.00');
    expect(screen.getByText(/Checkout window closes/)).toBeInTheDocument();
    expect(screen.getByTestId('marketplace-checkout-pay')).toBeInTheDocument();
    expect(screen.getByLabelText('Saved addresses')).toBeInTheDocument();
  });

  it('keeps the new-address form when the book is empty instead of gating to settings', () => {
    view.addresses = [];
    render(<MarketplaceCheckout />);

    expect(screen.getByLabelText('Recipient')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Add delivery address' })).not.toBeInTheDocument();
    expect(screen.getByTestId('marketplace-checkout-pay')).toBeDisabled();
  });

  it('removes the award line and continues checkout after a successful pay', async () => {
    const user = userEvent.setup();
    render(<MarketplaceCheckout />);
    await fillAndPay(user);

    expect(offerState.submit).toHaveBeenCalled();
    expect(checkoutActions.remove).toHaveBeenCalledWith('s:boots', 'variant_42', 'award-1');
    expect(offerState.refresh).toHaveBeenCalledTimes(1);
    expect(checkoutActions.rememberAddress).toHaveBeenCalled();
  });

  it('shows expiry copy, removes the line, refreshes offers, and offers both next actions', async () => {
    offerState.submit.mockResolvedValue({ ok: false, code: 'AWARD_EXPIRED' });
    const user = userEvent.setup();
    render(<MarketplaceCheckout />);
    await fillAndPay(user);

    expect(screen.getByText('This accepted offer expired before checkout. Nothing was reserved.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View offers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buy at current price' })).toBeInTheDocument();
    expect(checkoutActions.remove).toHaveBeenCalledTimes(1);
    expect(offerState.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['AWARD_ALREADY_CONVERTED', 'REVISION_CONFLICT'])('shows the converted state for %s', async (code) => {
    offerState.submit.mockResolvedValue({ ok: false, code });
    const user = userEvent.setup();
    render(<MarketplaceCheckout />);
    await fillAndPay(user);

    expect(screen.getByText('This accepted offer has already been converted.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View orders' })).toBeInTheDocument();
    expect(checkoutActions.remove).toHaveBeenCalledWith('s:boots', 'variant_42', 'award-1');
  });

  it('removes the award line and refreshes offers when the award is unavailable', async () => {
    offerState.submit.mockResolvedValue({ ok: false, code: 'AWARD_UNAVAILABLE' });
    const user = userEvent.setup();
    render(<MarketplaceCheckout />);
    await fillAndPay(user);

    expect(screen.getByText('This offer is no longer available.')).toBeInTheDocument();
    expect(checkoutActions.remove).toHaveBeenCalledWith('s:boots', 'variant_42', 'award-1');
  });

  it('shows mapped refusal copy and Retry for other checkout refusal codes', async () => {
    offerState.submit.mockResolvedValue({ ok: false, code: 'AWARD_QUANTITY_MISMATCH' });
    const user = userEvent.setup();
    render(<MarketplaceCheckout />);
    await fillAndPay(user);

    expect(screen.getByText('The checkout quantity does not match the accepted offer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('withholds checkout for a malformed award projection', () => {
    offerState.offers = [{ ...acceptedOffer, award: undefined }];
    render(<MarketplaceCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByTestId('marketplace-checkout-pay')).not.toBeInTheDocument();
  });

  it.each(['subtotal', 'shipping', 'merchandiseTotal'])('withholds checkout when %s is absent', (field) => {
    const incomplete = { ...acceptedOffer, award: { ...acceptedOffer.award } };
    delete incomplete.award[field as keyof typeof incomplete.award];
    offerState.offers = [incomplete];
    render(<MarketplaceCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByTestId('marketplace-checkout-pay')).not.toBeInTheDocument();
  });

  it('withholds checkout when award money currencies do not match', () => {
    offerState.offers = [
      {
        ...acceptedOffer,
        award: { ...acceptedOffer.award, shipping: { ...acceptedOffer.award.shipping, currency: 'EUR' } },
      },
    ];
    render(<MarketplaceCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
  });

  it('withholds checkout from the seller on the award route', () => {
    offerState.offers = [{ ...acceptedOffer, buyerPubky: 's'.repeat(52) }];
    render(<MarketplaceCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByTestId('marketplace-checkout-pay')).not.toBeInTheDocument();
  });
});

describe('MarketplaceCheckout drop-claim path', () => {
  beforeEach(() => {
    resetCheckoutView();
    searchParams.current = new URLSearchParams({
      seller: listing.record.ownerPubky,
      drop: 'vol1',
      listing: 'boots',
    });
    window.history.replaceState(
      null,
      '',
      `/marketplace/checkout?seller=${listing.record.ownerPubky}&drop=vol1&listing=boots`,
    );
  });

  it('loads the drop listing as quantity 1 on the one Checkout screen', async () => {
    render(<MarketplaceCheckout />);

    expect(await screen.findByRole('heading', { name: 'Checkout' })).toBeInTheDocument();
    expect(await screen.findByText('Vintage boots')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to drop' })).toHaveAttribute(
      'href',
      `/marketplace/drop/${listing.record.ownerPubky}/vol1`,
    );
    expect(screen.getByTestId('marketplace-checkout-pay')).toBeInTheDocument();
    expect(screen.getByLabelText('Recipient')).toBeInTheDocument();
  });
});
