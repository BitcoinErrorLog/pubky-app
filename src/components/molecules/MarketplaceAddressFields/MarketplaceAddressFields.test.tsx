import { zodResolver } from '@hookform/resolvers/zod';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useForm, useWatch } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import {
  type MarketplaceAddressFormData,
  marketplaceAddressFormDefaults,
  marketplaceAddressFormSchema,
} from '@/hooks/useMarketplaceAddressBook/useMarketplaceAddressBook.types';
import type { AddressAutocompleteProvider } from '@/libs/commerce/address-autocomplete';
import { MarketplaceAddressFields } from './MarketplaceAddressFields';

const mockProvider: AddressAutocompleteProvider = {
  suggest: vi.fn(async () => [
    {
      placeId: 'ChIJTest',
      primary: '42 Union Street',
      secondary: 'New Bedford, MA, USA',
    },
  ]),
  retrieve: vi.fn(async () => ({
    line1: '42 Union Street',
    line2: '',
    city: 'New Bedford',
    region: 'MA',
    postalCode: '02740',
    countryCode: 'US',
  })),
};

function Harness({ provider }: { provider?: AddressAutocompleteProvider | null }) {
  const form = useForm<MarketplaceAddressFormData>({
    resolver: zodResolver(marketplaceAddressFormSchema),
    defaultValues: { ...marketplaceAddressFormDefaults, label: 'Home', name: 'Alice Buyer' },
    mode: 'onChange',
  });
  const city = useWatch({ control: form.control, name: 'city' });
  const region = useWatch({ control: form.control, name: 'region' });
  const postal = useWatch({ control: form.control, name: 'postalCode' });

  return (
    <div>
      <MarketplaceAddressFields
        control={form.control}
        setValue={form.setValue}
        autocompleteProvider={provider === undefined ? null : provider}
      />
      <output data-testid="filled-city">{city}</output>
      <output data-testid="filled-region">{region}</output>
      <output data-testid="filled-postal">{postal}</output>
    </div>
  );
}

describe('MarketplaceAddressFields', () => {
  it('labels US subdivision State and ZIP, and keeps suggestions closed without a provider', async () => {
    const user = userEvent.setup();
    render(<Harness provider={null} />);

    expect(screen.getByLabelText('State')).toBeInTheDocument();
    expect(screen.getByLabelText('ZIP code')).toBeInTheDocument();
    await user.type(screen.getByLabelText('Address line 1'), '42 Union Street');
    expect(screen.queryByRole('listbox')).not.toBeInTheDocument();
  });

  it('filters the US state list as the buyer types', async () => {
    const user = userEvent.setup();
    render(<Harness provider={null} />);

    await user.click(screen.getByLabelText('State'));
    await user.type(screen.getByLabelText('State'), 'Mass');
    expect(screen.getByRole('option', { name: /Massachusetts/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /New York/ })).not.toBeInTheDocument();
  });

  it('fills the form from a mocked US autocomplete selection', async () => {
    const user = userEvent.setup();
    render(<Harness provider={mockProvider} />);

    await user.type(screen.getByLabelText('Address line 1'), '42 Union');
    const option = await screen.findByRole('option', { name: /42 Union Street/ });
    await user.click(option);

    await waitFor(() => {
      expect(screen.getByTestId('filled-city')).toHaveTextContent('New Bedford');
      expect(screen.getByTestId('filled-region')).toHaveTextContent('MA');
      expect(screen.getByTestId('filled-postal')).toHaveTextContent('02740');
    });
    expect(mockProvider.retrieve).toHaveBeenCalledWith('ChIJTest', expect.any(String));
  });

  it('fills City and State from a US ZIP without sending the street anywhere', async () => {
    const user = userEvent.setup();
    render(<Harness provider={null} />);

    await user.type(screen.getByLabelText('ZIP code'), '02740');
    await waitFor(() => {
      expect(screen.getByTestId('filled-city')).toHaveTextContent('New Bedford');
      expect(screen.getByTestId('filled-region')).toHaveTextContent('MA');
    });
  });

  it('leaves a typed city alone when ZIP fill runs', async () => {
    const user = userEvent.setup();
    render(<Harness provider={null} />);

    await user.type(screen.getByLabelText('City'), 'Fairhaven');
    await user.type(screen.getByLabelText('ZIP code'), '02740');
    await waitFor(() => {
      expect(screen.getByTestId('filled-region')).toHaveTextContent('MA');
    });
    expect(screen.getByTestId('filled-city')).toHaveTextContent('Fairhaven');
  });

  it('relabels to Province for CA and optional Region for GB', async () => {
    const user = userEvent.setup();
    render(<Harness provider={null} />);

    await user.clear(screen.getByLabelText('Country'));
    await user.type(screen.getByLabelText('Country'), 'CA');
    expect(screen.getByLabelText('Province')).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Country'));
    await user.type(screen.getByLabelText('Country'), 'GB');
    expect(screen.getByLabelText('Region')).toBeInTheDocument();
    expect(screen.getByLabelText('Postal code')).toBeInTheDocument();
  });
});
