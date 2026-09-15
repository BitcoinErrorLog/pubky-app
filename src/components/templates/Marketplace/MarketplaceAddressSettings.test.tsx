import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { MarketplaceAddressSettings } from './MarketplaceAddressSettings';

const routerPush = vi.hoisted(() => vi.fn());
const saveAddress = vi.hoisted(() => vi.fn(async () => true));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: routerPush }),
  useSearchParams: () =>
    new URLSearchParams({
      returnTo: '/marketplace/drop/ssssssssssssssssssssssssssssssssssssssssssssssssssss/vol1',
    }),
}));

vi.mock('@/hooks/useMarketplaceAddressBook/useMarketplaceAddressBook', () => ({
  bareDeliveryAddressId: (address: { id: string }) => address.id,
  useMarketplaceAddressBook: () => ({
    addresses: [],
    isLoading: false,
    save: saveAddress,
    remove: vi.fn(async () => {}),
    setDefault: vi.fn(async () => {}),
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

describe('MarketplaceAddressSettings', () => {
  it('explains that sellers cannot yet read addresses in the Shop', () => {
    render(<MarketplaceAddressSettings />);

    expect(
      screen.getByText(
        'Your delivery addresses are sent with your orders for the seller of each order only. Sellers cannot yet read them in the Shop; the packing slip asks the seller to confirm the destination with you.',
      ),
    ).toBeInTheDocument();
  });

  it('returns to the originating drop after saving a new address', async () => {
    const user = userEvent.setup();
    render(<MarketplaceAddressSettings />);

    await user.click(screen.getByRole('button', { name: 'Add address' }));
    await user.type(screen.getByRole('textbox', { name: 'Label' }), 'Home');
    await user.type(screen.getByRole('textbox', { name: 'Recipient' }), 'Alice Buyer');
    await user.type(screen.getByRole('textbox', { name: 'Address line 1' }), '1 Market Street');
    await user.type(screen.getByRole('textbox', { name: 'City' }), 'New York');
    await user.type(screen.getByRole('textbox', { name: 'Region' }), 'NY');
    await user.type(screen.getByRole('textbox', { name: 'Postal code' }), '10001');
    await user.clear(screen.getByRole('textbox', { name: 'Country' }));
    await user.type(screen.getByRole('textbox', { name: 'Country' }), 'US');
    await user.click(screen.getByRole('button', { name: 'Save address' }));

    await vi.waitFor(() => {
      expect(saveAddress).toHaveBeenCalled();
      expect(routerPush).toHaveBeenCalledWith(
        '/marketplace/drop/ssssssssssssssssssssssssssssssssssssssssssssssssssss/vol1',
      );
    });
  });
});
