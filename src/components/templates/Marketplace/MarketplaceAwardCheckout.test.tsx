import { hydrateRoot } from 'react-dom/client';
import { renderToString } from 'react-dom/server';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceAwardCheckout } from './MarketplaceAwardCheckout';

const state = vi.hoisted(() => ({
  offers: [] as Array<Record<string, unknown>>,
  outcome: { ok: true, orderId: '00000000-0000-4000-8000-000000000803' } as
    | { ok: true; orderId: string }
    | { ok: false; code: string },
  remove: vi.fn(async () => {}),
  refresh: vi.fn(async () => {}),
  submit: vi.fn(),
  addresses: [
    {
      id: 'home',
      label: 'Home',
      name: 'Alice Buyer',
      line1: '1 Market Street',
      line2: '',
      city: 'New York',
      region: 'NY',
      postal_code: '10001',
      country_code: 'US',
    },
  ],
}));

const offer = {
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

vi.mock('next/navigation', () => ({
  useSearchParams: () => new URLSearchParams('offer=offer-1'),
  usePathname: () => '/marketplace/award-checkout',
}));
vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));
vi.mock('@/hooks/useMarketplaceOffers/useMarketplaceOffers', () => ({
  useMarketplaceOffers: () => ({ offers: state.offers, refresh: state.refresh }),
}));
vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', () => ({
  useMarketplaceCart: () => ({
    awardItems: [{ awardId: 'award-1', listingId: 's:boots', variantId: 'variant_42' }],
    remove: state.remove,
  }),
}));
vi.mock('@/hooks/useMarketplaceAddressBook/useMarketplaceAddressBook', () => ({
  useMarketplaceAddressBook: () => ({ addresses: state.addresses }),
}));
vi.mock('@/hooks/useMarketplaceOfferCheckout/useMarketplaceOfferCheckout', () => ({
  useMarketplaceOfferCheckout: () => ({ submit: state.submit, isSubmitting: false }),
}));
vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'b'.repeat(52) }),
}));
vi.mock('@/hooks/useMarketplaceCartCount/useMarketplaceCartCount', () => ({ useMarketplaceCartCount: () => 0 }));
vi.mock('@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread', () => ({
  useMarketplaceActivityUnread: () => 0,
}));

describe('MarketplaceAwardCheckout', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    state.offers = [offer];
    state.addresses = [
      {
        id: 'home',
        label: 'Home',
        name: 'Alice Buyer',
        line1: '1 Market Street',
        line2: '',
        city: 'New York',
        region: 'NY',
        postal_code: '10001',
        country_code: 'US',
      },
    ];
    state.outcome = { ok: true, orderId: '00000000-0000-0000-0000-000000000803' };
    state.submit.mockResolvedValue(state.outcome);
  });

  it('renders server-projected agreed price, fixed terms, shipping, total, and deadline', () => {
    render(<MarketplaceAwardCheckout />);

    expect(screen.getByRole('heading', { name: 'Pay agreed price' })).toBeInTheDocument();
    expect(screen.getByText('Vintage boots')).toBeInTheDocument();
    expect(screen.getByText(/42 · Quantity 1/)).toBeInTheDocument();
    expect(screen.getByText('Subtotal').parentElement).toHaveTextContent('$6.00');
    expect(screen.getByText('Shipping').parentElement).toHaveTextContent('$1.00');
    expect(screen.getByText('Merchandise total').parentElement).toHaveTextContent('$7.00');
    expect(screen.getByText(/Checkout window closes/)).toBeInTheDocument();
    expect(screen.queryByText('$10.00')).not.toBeInTheDocument();
    expect(screen.queryByText(/discount/i)).not.toBeInTheDocument();
  });

  it('releases the pay button after hydration preserves the saved address', async () => {
    const container = document.createElement('div');
    container.innerHTML = renderToString(<MarketplaceAwardCheckout />);
    const serverButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Pay agreed price'),
    );
    expect(serverButton).toBeDisabled();

    const root = hydrateRoot(container, <MarketplaceAwardCheckout />);
    const hydratedButton = [...container.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Pay agreed price'),
    );
    await waitFor(() => expect(hydratedButton).toBeEnabled());
    root.unmount();
  });

  it('links buyers without a saved address to address settings', () => {
    state.addresses = [];
    render(<MarketplaceAwardCheckout />);

    expect(screen.getByRole('link', { name: 'delivery address' })).toHaveAttribute(
      'href',
      '/marketplace/settings/addresses',
    );
  });

  it('removes the award line and refreshes offers only after successful checkout', async () => {
    const user = userEvent.setup();
    render(<MarketplaceAwardCheckout />);

    await user.click(screen.getByRole('button', { name: 'Pay agreed price' }));

    expect(state.submit).toHaveBeenCalled();
    expect(state.remove).toHaveBeenCalledWith('s:boots', 'variant_42', 'award-1');
    expect(state.refresh).toHaveBeenCalledTimes(1);
    expect(screen.getByRole('heading', { name: 'Order created' })).toBeInTheDocument();
    expect(screen.getByText(/agreed merchandise total is \$7.00/)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View order' })).toHaveAttribute(
      'href',
      '/marketplace/orders#00000000-0000-0000-0000-000000000803',
    );
  });

  it('shows expiry copy, removes the line, refreshes offers, and offers both next actions', async () => {
    state.submit.mockResolvedValue({ ok: false, code: 'AWARD_EXPIRED' });
    const user = userEvent.setup();
    render(<MarketplaceAwardCheckout />);

    await user.click(screen.getByRole('button', { name: 'Pay agreed price' }));

    expect(
      screen.getByText('This accepted offer expired before the order was placed. Nothing was ordered.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View offers' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Buy at current price' })).toBeInTheDocument();
    expect(state.remove).toHaveBeenCalledTimes(1);
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it.each(['AWARD_ALREADY_CONVERTED', 'REVISION_CONFLICT'])('shows the converted state for %s', async (code) => {
    state.submit.mockResolvedValue({ ok: false, code });
    const user = userEvent.setup();
    render(<MarketplaceAwardCheckout />);

    await user.click(screen.getByRole('button', { name: 'Pay agreed price' }));

    expect(screen.getByText('This accepted offer has already been converted to an order.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'View orders' })).toBeInTheDocument();
    expect(state.remove).toHaveBeenCalledWith('s:boots', 'variant_42', 'award-1');
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('removes the award line and refreshes offers when the award is unavailable', async () => {
    state.submit.mockResolvedValue({ ok: false, code: 'AWARD_UNAVAILABLE' });
    const user = userEvent.setup();
    render(<MarketplaceAwardCheckout />);

    await user.click(screen.getByRole('button', { name: 'Pay agreed price' }));

    expect(screen.getByText('This offer is no longer available.')).toBeInTheDocument();
    expect(state.remove).toHaveBeenCalledWith('s:boots', 'variant_42', 'award-1');
    expect(state.refresh).toHaveBeenCalledTimes(1);
  });

  it('shows mapped refusal copy and Retry for other checkout refusal codes', async () => {
    state.submit.mockResolvedValue({ ok: false, code: 'AWARD_QUANTITY_MISMATCH' });
    const user = userEvent.setup();
    render(<MarketplaceAwardCheckout />);

    await user.click(screen.getByRole('button', { name: 'Pay agreed price' }));

    expect(screen.getByText('The checkout quantity does not match the accepted offer.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry' })).toBeInTheDocument();
  });

  it('withholds checkout for a malformed award projection', () => {
    state.offers = [{ ...offer, award: undefined }];
    render(<MarketplaceAwardCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay agreed price' })).not.toBeInTheDocument();
  });

  it.each(['subtotal', 'shipping', 'merchandiseTotal'])('withholds checkout when %s is absent', (field) => {
    const incomplete = { ...offer, award: { ...offer.award } };
    delete incomplete.award[field as keyof typeof incomplete.award];
    state.offers = [incomplete];
    render(<MarketplaceAwardCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay agreed price' })).not.toBeInTheDocument();
  });

  it('withholds checkout when award money currencies do not match', () => {
    state.offers = [
      {
        ...offer,
        award: { ...offer.award, shipping: { ...offer.award.shipping, currency: 'EUR' } },
      },
    ];
    render(<MarketplaceAwardCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
  });

  it('withholds checkout from the seller on the award route', () => {
    state.offers = [{ ...offer, buyerPubky: 's'.repeat(52) }];
    render(<MarketplaceAwardCheckout />);
    expect(screen.getByText('Checkout for this offer is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Pay agreed price' })).not.toBeInTheDocument();
  });
});
