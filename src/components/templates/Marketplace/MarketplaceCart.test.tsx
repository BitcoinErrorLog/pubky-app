import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MarketplaceCart } from './MarketplaceCart';

const view = vi.hoisted(() => ({
  items: [] as unknown[],
  isLoading: false,
  adapterMode: 'sandbox' as string,
  hasMarketplaceSession: false,
  needsSession: false,
  sessionError: null as string | null,
  addresses: [] as unknown[],
  selectedAddressId: null as string | null,
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

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/cart',
}));

vi.mock('@/config/commerce', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/config/commerce')>();
  return { ...actual, getCommerceAdapterMode: () => view.adapterMode };
});

vi.mock('@/hooks/useMarketplaceCart/useMarketplaceCart', async () => {
  const { sumMoneyByAsset } = await import('@/libs/commerce/pricing');
  return {
    useMarketplaceCart: () => {
      const items = view.items as Array<{
        quantity: number;
        variantId: string;
        listing: {
          record: {
            variants: Array<{ id: string; priceOverride?: { amountMinor: number; currency: string; exponent: number } }>;
            sale: { format: string; unitPrice?: { amountMinor: number; currency: string; exponent: number } };
          };
        };
      }>;
      return {
        items,
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
      };
    },
  };
});

vi.mock('@/hooks/useMarketplaceCheckout/useMarketplaceCheckout', async () => {
  const { useForm } = await import('react-hook-form');
  const { zodResolver } = await import('@hookform/resolvers/zod');
  const { marketplaceCheckoutDefaults, marketplaceCheckoutSchema } = await import(
    '@/hooks/useMarketplaceCheckout/useMarketplaceCheckout.types'
  );
  return {
    useMarketplaceCheckout: () => ({
      form: useForm({
        resolver: zodResolver(marketplaceCheckoutSchema),
        defaultValues: marketplaceCheckoutDefaults,
        mode: 'onTouched',
      }),
      submit: vi.fn(async () => false),
      needsSession: view.needsSession,
      sessionError: view.sessionError,
      hasMarketplaceSession: view.hasMarketplaceSession,
      addresses: view.addresses,
      selectedAddressId: view.selectedAddressId,
      selectAddress: vi.fn(),
    }),
  };
});

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceSessionConnectDialog', () => ({
  MarketplaceSessionConnectDialog: ({ triggerLabel }: { triggerLabel?: string }) => (
    <button type="button">{triggerLabel ?? 'Approve in Pubky Ring'}</button>
  ),
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
  await user.type(screen.getByLabelText('Region'), 'NY');
  await user.type(screen.getByLabelText('Postal code'), '10001');
}

describe('MarketplaceCart', () => {
  beforeEach(() => {
    view.items = [];
    view.isLoading = false;
    view.adapterMode = 'sandbox';
    view.hasMarketplaceSession = false;
    view.needsSession = false;
    view.sessionError = null;
    view.addresses = [];
    view.selectedAddressId = null;
  });

  it('disables Place order without a marketplace session in durable mode', () => {
    seededCart();
    view.adapterMode = 'transaction-service';
    view.hasMarketplaceSession = false;

    render(<MarketplaceCart />);

    expect(screen.getByRole('heading', { name: '1 Approve in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
    expect(screen.getByText('Approve purchases in Pubky Ring before placing the order.')).toBeInTheDocument();
    expect(screen.queryByText('Accept the guarantee terms.')).not.toBeInTheDocument();
  });

  it('enables Place order after session plus a valid form', async () => {
    const user = userEvent.setup();
    seededCart();
    view.adapterMode = 'transaction-service';
    view.hasMarketplaceSession = true;

    render(<MarketplaceCart />);

    expect(screen.getByText(/Purchases approved in Pubky Ring/)).toBeInTheDocument();
    const placeOrder = screen.getByRole('button', { name: 'Place order' });
    expect(placeOrder).toBeDisabled();

    await fillValidDelivery(user);
    expect(placeOrder).toBeDisabled();
    expect(screen.getByRole('checkbox', { name: /I accept guarantee policy v1/ })).not.toBeChecked();

    await user.click(screen.getByRole('checkbox', { name: /I accept guarantee policy v1/ }));
    expect(placeOrder).toBeEnabled();
  });

  it('requires the guarantee after a submit attempt and leaves it unchecked by default', async () => {
    const user = userEvent.setup();
    seededCart();

    render(<MarketplaceCart />);

    const guarantee = screen.getByRole('checkbox', { name: /I accept sandbox guarantee policy v1/ });
    expect(guarantee).not.toBeChecked();
    expect(screen.queryByText('Accept the guarantee terms.')).not.toBeInTheDocument();

    await fillValidDelivery(user);
    expect(screen.getByRole('button', { name: 'Place sandbox order' })).toBeDisabled();
    expect(screen.getByText('Fill in delivery details and accept the guarantee to place the order.')).toBeInTheDocument();
  });

  it('re-opens step 1 when a session expires mid-flow', () => {
    seededCart();
    view.adapterMode = 'locks-paykit';
    view.hasMarketplaceSession = true;
    view.needsSession = true;
    view.sessionError = 'Marketplace session required.';

    render(<MarketplaceCart />);

    expect(screen.getByRole('heading', { name: 'Approve purchases in Pubky Ring' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Place order' })).toBeDisabled();
  });

  it('renders a two-column loading skeleton', () => {
    view.isLoading = true;
    view.items = [];

    render(<MarketplaceCart />);

    const skeleton = screen.getByTestId('marketplace-cart-skeleton');
    expect(skeleton).toBeInTheDocument();
    expect(skeleton.className).toContain('lg:grid-cols-[1fr_420px]');
    expect(within(skeleton).getAllByRole('generic').length).toBeGreaterThan(1);
  });
});
