# Checkout delivery address

A US buyer types City / Region / Postal code / Country. Region is required only where the postal system needs a subdivision. US and CA use a searchable closed list. US ZIP fills City and State on the device. Street autocomplete stays off until John puts a restricted Places key in runtime config.

## Why Region was required

Checkout, the address book, pickup, and `checkout.create` / `offer.checkout` copied the durable service rule: `delivery_address.region` is `validate_trimmed` min 1, max 100, for every country (`crates/domain/src/commands.rs` `validate_delivery_address`). That is Shop's contract, not a universal carrier rule.

Ship-from already allows an empty region (shipping-contract drift). USPS still needs a state for a US label (New Bedford, MA 02740). GB, DE, NL, FR, JP do not. The live failure was a free-text **Region** field that was always required, including on the default US checkout.

Region is required only for countries whose postal system uses a subdivision (US, CA, AU, BR, IN, MX, and a short free-text set). The label follows the country: **State** (US/AU/MX/BR/IN), **Province** (CA), **Prefecture** (JP), **Region** otherwise. Closed lists store ISO 3166-2 suffixes (`NY`, `ON`), not `US-NY`.

The Shop command schema now matches that table. The live Rust service still rejects an empty `region` on every country until a service change; sandbox checkout uses the Shop command schema, so GB-without-region works there. Default country is US, which still requires State.

## Subdivision lists

| Country        | Control                                                             | Stored value            |
| -------------- | ------------------------------------------------------------------- | ----------------------- |
| US             | Searchable combobox: 50 states + DC + AS, GU, MP, PR, VI + AA/AE/AP | ISO suffix (`MA`)       |
| CA             | Searchable combobox: 10 provinces + 3 territories                   | ISO suffix (`ON`)       |
| AU             | Searchable combobox: 6 states + 2 territories                       | ISO suffix (`NSW`)      |
| Other required | Free text                                                           | Trimmed string, max 100 |
| Other optional | Free text, not required                                             | Empty string allowed    |

## Address autocomplete (USA)

Street suggest-as-you-type always sends the prefix to a geocoder. Delivery addresses are sensitive (W10.5 sealed path + shipping contract). No provider is called with the street until John creates a key.

| Provider                         | Fit                                                             | Cost / key                                                                                              | What leaves the device                                                                                |
| -------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| Google Places Autocomplete (New) | Best US rooftop; session token ties suggest → one Place Details | Per-session SKU on John's Google Cloud project; public browser key with HTTP-referrer + API restriction | Google sees the typed prefix and the selected place id                                                |
| Mapbox Search Box                | Good US data; token + URL restriction                           | Per-request; John-owned token                                                                           | Mapbox sees prefix + retrieve                                                                         |
| Smarty / USPS-backed validation  | Excellent US delivery points                                    | Auth-id/token is server-shaped                                                                          | A Shop BFF would see the finished address — a second plaintext holder besides sealed / `plaintext_v1` |
| Privacy-preserving ZIP fill      | ZIP → city + state; postal-shape checks per country             | None                                                                                                    | Nothing. Bundled GeoNames US ZIPs (CC-BY 4.0) + USPS ZIP3 prefixes                                    |

**Recommendation:** ship ZIP → City + State and per-country format validation now. Scaffold Google Places Autocomplete (New) behind `PUBKY_RUNTIME_GOOGLE_PLACES_API_KEY` so the type-ahead can turn on when John creates a referrer-restricted Places key. Do not send street keystrokes to Google, Mapbox, or Smarty without that key.

Cost is Google's per-session Autocomplete (New) SKU, billed to the Cloud project that owns the key. Key ownership is John: create it, restrict it, paste it into Vercel. Privacy trade-off: with the key on, Google sees US address keystrokes and the selected place; Shop origin and any BFF never see Places traffic. With the key off, only the bundled ZIP table runs.

### Input inventory

| Input                                 | Type               | Source                                                                  | Missing                                                |
| ------------------------------------- | ------------------ | ----------------------------------------------------------------------- | ------------------------------------------------------ |
| `PUBKY_RUNTIME_GOOGLE_PLACES_API_KEY` | Public browser key | Vercel runtime; Google Cloud key, HTTP referrers, Places API (New) only | Autocomplete off; ZIP fill and typed fields still work |
| Session token                         | UUID in the tab    | Minted per typing session; rotated after Place Details                  | New session on the next suggest                        |

### Key (only if type-ahead should go live)

1. Google Cloud Console → enable **Places API (New)**.
2. Create an API key. Application restriction: **HTTP referrers** `https://shop.pubky.app/*`, `https://*.vercel.app/*`, `http://localhost:*`. API restriction: **Places API (New)** only.
3. Vercel Production + Preview: `PUBKY_RUNTIME_GOOGLE_PLACES_API_KEY`. Redeploy.

ZIP fill does not wait on that key. GeoNames US postal file: https://download.geonames.org/export/zip/US.zip, Creative Commons Attribution 4.0.
