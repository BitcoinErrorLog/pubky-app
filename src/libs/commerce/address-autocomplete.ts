export type AddressSuggestion = {
  placeId: string;
  primary: string;
  secondary: string;
};

export type ResolvedPostalAddress = {
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
};

export type AddressAutocompleteProvider = {
  suggest: (input: string, sessionToken: string) => Promise<AddressSuggestion[]>;
  retrieve: (placeId: string, sessionToken: string) => Promise<ResolvedPostalAddress | null>;
};

type GooglePlacePrediction = {
  placeId?: string;
  text?: { text?: string };
  structuredFormat?: { mainText?: { text?: string }; secondaryText?: { text?: string } };
};

type GoogleAutocompleteResponse = {
  suggestions?: Array<{ placePrediction?: GooglePlacePrediction }>;
};

type GoogleAddressComponent = {
  longText?: string;
  shortText?: string;
  types?: string[];
};

type GooglePlaceDetailsResponse = {
  addressComponents?: GoogleAddressComponent[];
};

const AUTOCOMPLETE_URL = 'https://places.googleapis.com/v1/places:autocomplete';
const AUTOCOMPLETE_FIELD_MASK =
  'suggestions.placePrediction.placeId,suggestions.placePrediction.text,suggestions.placePrediction.structuredFormat';
const DETAILS_FIELD_MASK = 'addressComponents';

export function googlePlaceResourcePath(placeId: string): string {
  const id = placeId.trim().replace(/^places\//, '');
  return `places/${id}`;
}

function componentOf(components: GoogleAddressComponent[], type: string): GoogleAddressComponent | undefined {
  return components.find((component) => component.types?.includes(type));
}

export function addressFromGoogleComponents(components: GoogleAddressComponent[]): ResolvedPostalAddress | null {
  const streetNumber = componentOf(components, 'street_number')?.longText?.trim() ?? '';
  const route = componentOf(components, 'route')?.longText?.trim() ?? '';
  const line1 = [streetNumber, route].filter(Boolean).join(' ').trim();
  if (!line1) return null;
  const line2 =
    componentOf(components, 'subpremise')?.longText?.trim() ||
    componentOf(components, 'premise')?.longText?.trim() ||
    '';
  const city =
    componentOf(components, 'locality')?.longText?.trim() ||
    componentOf(components, 'postal_town')?.longText?.trim() ||
    componentOf(components, 'sublocality_level_1')?.longText?.trim() ||
    '';
  const region = componentOf(components, 'administrative_area_level_1')?.shortText?.trim().toUpperCase() ?? '';
  const postalCode = componentOf(components, 'postal_code')?.longText?.trim() ?? '';
  const country = componentOf(components, 'country')?.shortText?.trim().toUpperCase() ?? 'US';
  return {
    line1,
    line2,
    city,
    region,
    postalCode,
    countryCode: country,
  };
}

async function readJson(response: Response): Promise<unknown> {
  try {
    return await response.json();
  } catch {
    return null;
  }
}

export function createGooglePlacesAutocompleteProvider(apiKey: string): AddressAutocompleteProvider {
  return {
    async suggest(input, sessionToken) {
      const trimmed = input.trim();
      if (!trimmed || !apiKey) return [];
      try {
        const response = await fetch(AUTOCOMPLETE_URL, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': AUTOCOMPLETE_FIELD_MASK,
          },
          body: JSON.stringify({
            input: trimmed,
            sessionToken,
            includedRegionCodes: ['US'],
            includedPrimaryTypes: ['street_address', 'premise', 'subpremise'],
          }),
        });
        if (!response.ok) return [];
        const body = (await readJson(response)) as GoogleAutocompleteResponse | null;
        return (body?.suggestions ?? [])
          .map((suggestion) => suggestion.placePrediction)
          .filter((prediction): prediction is GooglePlacePrediction => Boolean(prediction?.placeId))
          .map((prediction) => ({
            placeId: prediction.placeId ?? '',
            primary: prediction.structuredFormat?.mainText?.text?.trim() || prediction.text?.text?.trim() || '',
            secondary: prediction.structuredFormat?.secondaryText?.text?.trim() || '',
          }))
          .filter((suggestion) => suggestion.placeId && suggestion.primary);
      } catch {
        return [];
      }
    },
    async retrieve(placeId, sessionToken) {
      const id = placeId.trim();
      if (!id || !apiKey) return null;
      try {
        const url = new URL(`https://places.googleapis.com/v1/${googlePlaceResourcePath(id)}`);
        url.searchParams.set('sessionToken', sessionToken);
        const response = await fetch(url, {
          headers: {
            'X-Goog-Api-Key': apiKey,
            'X-Goog-FieldMask': DETAILS_FIELD_MASK,
          },
        });
        if (!response.ok) return null;
        const body = (await readJson(response)) as GooglePlaceDetailsResponse | null;
        return addressFromGoogleComponents(body?.addressComponents ?? []);
      } catch {
        return null;
      }
    },
  };
}

export function mintAddressAutocompleteSessionToken(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
