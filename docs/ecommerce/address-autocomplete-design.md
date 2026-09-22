# US delivery-address autocomplete

Delivery addresses stay on the sealed/seller path. Autocomplete may not give Shop, a BFF, or a second vendor the finished address.

## Why Region was required

Checkout, the address book, pickup, and `checkout.create` / `offer.checkout` copied the service `delivery_address.region` rule (1–100 chars, every country). USPS still needs a state for New Bedford, MA 02740. The live failure is the control: a free-text **Region** field, not “US should skip it.” Region is required only where the postal system needs a subdivision; the label follows the country; US/CA/AU use a closed, type-to-filter list.

## Provider

| Provider | Fit | Cost / key | Leak |
| --- | --- | --- | --- |
| **Google Places Autocomplete (New)** | Best US rooftop; session token ties suggest → one Place Details | Per-session; public key + HTTP referrer | Google sees prefix + selected place id |
| Mapbox Search Box | Browser token + URL restriction | Per-request | Mapbox sees prefix + retrieve |
| Radar | Autocomplete + details | Server-leaning auth | Often wants a backend |
| Smarty US Autocomplete Pro | Excellent US | Auth-id/token is typically server | A Shop BFF would see the selected address |

**Choice: Google Places Autocomplete (New)** behind `AddressAutocompleteProvider` (`suggest(input, sessionToken)`, `retrieve(placeId, sessionToken)`). Other adapters slot in. US line 1 only.

**Key location: public browser key** `PUBKY_RUNTIME_GOOGLE_PLACES_API_KEY` (same injection as Prelude). HTTP referrer restriction; API restriction = Places API (New). **Not a Shop BFF:** a proxy would see Place Details (the full address) and become a second plaintext holder besides today’s sealed / `plaintext_v1` seller path.

## Data flow

1. Browser → Google Autocomplete: the characters typed + a per-session token. Included region `US`.
2. On pick, browser → Google Place Details: that place id + the same token. Field mask: address components only.
3. The form fills line1 / line2 / city / state / postal on device. Manual typing always works.
4. Shop origin never sees the Places traffic. On place order the address takes the existing `checkout.create` path (device Dexie if saved; service `orders.delivery_address`; seller `plaintext_v1` while W10.5 is STOPPED; Shippo from that column when the seller buys a label).
5. No key, blocked referrer, or network failure: suggestions stay closed; native `autocomplete` attributes remain.

On-device US ZIP → city/state fill (GeoNames, CC-BY 4.0) does not call a vendor. See [`checkout-address-design.md`](checkout-address-design.md).

## Input inventory

| Input | Type | Source | Missing |
| --- | --- | --- | --- |
| `PUBKY_RUNTIME_GOOGLE_PLACES_API_KEY` | Public browser key | Vercel runtime; Google Cloud key with HTTP referrers | Autocomplete off; plain fields |
| Session token | UUID in the tab | Minted per typing session; rotated after retrieve | New session on next suggest |

## John ACTION — create the key

1. Google Cloud Console → APIs & Services → enable **Places API (New)**.
2. Credentials → Create API key.
3. Application restriction: **HTTP referrers**. Add `https://shop.pubky.app/*`, `https://*.vercel.app/*`, `http://localhost:*`.
4. API restriction: **Places API (New)** only.
5. Vercel project env (Production + Preview): `PUBKY_RUNTIME_GOOGLE_PLACES_API_KEY=<key>`. Redeploy.

Without that env, checkout keeps working with typed fields and the State dropdown.
