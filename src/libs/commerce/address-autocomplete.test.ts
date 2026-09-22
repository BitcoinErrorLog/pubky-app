import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  addressFromGoogleComponents,
  createGooglePlacesAutocompleteProvider,
  googlePlaceResourcePath,
} from './address-autocomplete';

const PLACE_ID = 'ChIJTest';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('googlePlaceResourcePath', () => {
  it('accepts a bare place id or a places/ resource name', () => {
    expect(googlePlaceResourcePath('ChIJTest')).toBe('places/ChIJTest');
    expect(googlePlaceResourcePath('places/ChIJTest')).toBe('places/ChIJTest');
  });
});

describe('addressFromGoogleComponents', () => {
  it('builds a US street address from Places address components', () => {
    expect(
      addressFromGoogleComponents([
        { longText: '42', shortText: '42', types: ['street_number'] },
        { longText: 'Union Street', shortText: 'Union St', types: ['route'] },
        { longText: 'New Bedford', shortText: 'New Bedford', types: ['locality'] },
        { longText: 'Massachusetts', shortText: 'MA', types: ['administrative_area_level_1'] },
        { longText: '02740', shortText: '02740', types: ['postal_code'] },
        { longText: 'United States', shortText: 'US', types: ['country'] },
      ]),
    ).toEqual({
      line1: '42 Union Street',
      line2: '',
      city: 'New Bedford',
      region: 'MA',
      postalCode: '02740',
      countryCode: 'US',
    });
  });
});

describe('createGooglePlacesAutocompleteProvider', () => {
  it('returns no suggestions without a key, on HTTP failure, or on network failure', async () => {
    const empty = createGooglePlacesAutocompleteProvider('');
    expect(await empty.suggest('42 Union', 'session')).toEqual([]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('nope', { status: 403 })),
    );
    const provider = createGooglePlacesAutocompleteProvider('test-key');
    expect(await provider.suggest('42 Union', 'session')).toEqual([]);

    vi.stubGlobal(
      'fetch',
      vi.fn(async () => {
        throw new Error('offline');
      }),
    );
    expect(await provider.suggest('42 Union', 'session')).toEqual([]);
    expect(await provider.retrieve(PLACE_ID, 'session')).toBeNull();
  });

  it('maps Autocomplete (New) suggestions and Place Details for a session', async () => {
    const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.includes(':autocomplete')) {
        expect(init?.headers).toMatchObject({ 'X-Goog-Api-Key': 'test-key' });
        const body = JSON.parse(String(init?.body));
        expect(body.sessionToken).toBe('session-1');
        expect(body.includedRegionCodes).toEqual(['US']);
        return Response.json({
          suggestions: [
            {
              placePrediction: {
                placeId: PLACE_ID,
                structuredFormat: {
                  mainText: { text: '42 Union Street' },
                  secondaryText: { text: 'New Bedford, MA, USA' },
                },
              },
            },
          ],
        });
      }
      expect(url).toContain(`/places/${PLACE_ID}`);
      expect(url).not.toContain('/places/places/');
      expect(url).toContain('sessionToken=session-1');
      return Response.json({
        addressComponents: [
          { longText: '42', types: ['street_number'] },
          { longText: 'Union Street', types: ['route'] },
          { longText: 'New Bedford', types: ['locality'] },
          { longText: 'Massachusetts', shortText: 'MA', types: ['administrative_area_level_1'] },
          { longText: '02740', types: ['postal_code'] },
          { longText: 'United States', shortText: 'US', types: ['country'] },
        ],
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    const provider = createGooglePlacesAutocompleteProvider('test-key');
    expect(await provider.suggest('42 Union', 'session-1')).toEqual([
      { placeId: PLACE_ID, primary: '42 Union Street', secondary: 'New Bedford, MA, USA' },
    ]);
    expect(await provider.retrieve(PLACE_ID, 'session-1')).toMatchObject({
      line1: '42 Union Street',
      city: 'New Bedford',
      region: 'MA',
      postalCode: '02740',
    });
    expect(await provider.retrieve(`places/${PLACE_ID}`, 'session-1')).toMatchObject({
      region: 'MA',
      postalCode: '02740',
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
