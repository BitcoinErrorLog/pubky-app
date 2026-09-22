import { useForm } from 'react-hook-form';
import { describe, expect, it, vi } from 'vitest';
import type { AddressAutocompleteProvider } from '@/libs/commerce/address-autocomplete';
import { MarketplaceAddressFields } from '@/molecules/MarketplaceAddressFields/MarketplaceAddressFields';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP } from '@/test-utils/vrt.viewports';

const mockProvider: AddressAutocompleteProvider = {
  suggest: async () => [
    {
      placeId: 'ChIJTest',
      primary: '42 Union Street',
      secondary: 'New Bedford, MA, USA',
    },
    {
      placeId: 'ChIJOther',
      primary: '42 Union Avenue',
      secondary: 'Framingham, MA, USA',
    },
  ],
  retrieve: async () => ({
    line1: '42 Union Street',
    line2: '',
    city: 'New Bedford',
    region: 'MA',
    postalCode: '02740',
    countryCode: 'US',
  }),
};

function AddressFieldsScene({
  provider,
  countryCode = 'US',
}: {
  provider: AddressAutocompleteProvider | null;
  countryCode?: string;
}) {
  const form = useForm({
    defaultValues: {
      line1: '',
      line2: '',
      city: '',
      region: '',
      postalCode: '',
      countryCode,
    },
  });

  return (
    <div className="max-w-xl bg-background p-6">
      <MarketplaceAddressFields control={form.control} setValue={form.setValue} autocompleteProvider={provider} />
    </div>
  );
}

describe('Marketplace address fields — visual regression', () => {
  it('renders idle US fields labelled State and ZIP', async () => {
    const screen = await renderForVRT(<AddressFieldsScene provider={null} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('address-fields-us-idle-desktop');
  });

  it('renders optional Region for GB', async () => {
    const screen = await renderForVRT(<AddressFieldsScene provider={null} countryCode="GB" />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('address-fields-gb-region-desktop');
  });

  it('renders the open US state dropdown', async () => {
    const screen = await renderForVRT(<AddressFieldsScene provider={null} />, { viewport: VRT_VIEWPORT_DESKTOP });
    await screen.getByLabelText('State').click();
    await screen.getByLabelText('State').fill('Mass');
    await vi.waitFor(() => {
      if (!screen.container.querySelector('[data-testid="marketplace-region-options"]')) {
        throw new Error('The state list has not opened yet.');
      }
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('address-fields-state-dropdown-desktop');
  });

  it('renders US address suggestions and fills the form from a selection', async () => {
    const screen = await renderForVRT(<AddressFieldsScene provider={mockProvider} />, {
      viewport: VRT_VIEWPORT_DESKTOP,
    });
    await screen.getByLabelText('Address line 1').fill('42 Union');
    await vi.waitFor(() => {
      if (!screen.container.querySelector('[data-testid="marketplace-address-suggestions"]')) {
        throw new Error('The address suggestions have not opened yet.');
      }
    });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('address-fields-suggestions-desktop');

    await screen.getByRole('option', { name: /42 Union Street/ }).click();
    await vi.waitFor(() => {
      const city = screen.container.querySelector('#city');
      if (!(city instanceof HTMLInputElement) || city.value !== 'New Bedford') {
        throw new Error('Selecting a suggestion did not fill the city.');
      }
    });
    expect((screen.container.querySelector('#region') as HTMLInputElement).value).toBe('MA');
    expect((screen.container.querySelector('#postalCode') as HTMLInputElement).value).toBe('02740');
  });
});
