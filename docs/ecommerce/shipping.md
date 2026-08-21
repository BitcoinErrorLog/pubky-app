# Shipping Tooling: Address Book, Presets, Tracking, Packing Slips

Post-purchase logistics for the marketplace: where each piece of shipping
data lives, who can read it, and what is deliberately not built. Read
[`status.md`](status.md) first for the general real-vs-simulated map.

Last updated: 2026-08-21.

## Where shipping data lives

| Data                         | Lives                                                                      | Who can read it                                                                                                                                                   |
| ---------------------------- | -------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Buyer address book           | Account-scoped IndexedDB (`commerce_delivery_addresses`), this device only | Only this browser profile. Never on the homeserver, never in any public record, never in telemetry.                                                               |
| Delivery address of an order | The transaction service's `orders.delivery_address` column                 | **Nobody, through reads.** Sent once inside the buyer's own `checkout.create` command; withheld from every read projection by design (ADR-0019 §8, below).        |
| Seller shipping presets      | Account-scoped IndexedDB (`commerce_shipping_presets`), this device only   | Only this browser profile. Presets are authoring convenience; nothing about them is published.                                                                    |
| Listing shipping option      | The owner-signed listing record (`shippingOptions`, one flat-rate entry)   | Public, like the rest of the listing record. The sell studio now authors its label, price, and min/max day estimates (previously label and days were fixed copy). |
| Shipment carrier + tracking  | The transaction service's order `shipment` object                          | Both order participants, via their scoped order reads. `carrier` and `tracking_number` are structured fields in the existing ship command contract.               |

## The delivery-address privacy boundary (exact)

This is load-bearing and verified against the service source
(`pubky-marketplace-service`):

1. The buyer's address travels **exactly once**: inside the buyer's own
   `checkout.create` command payload (`payload.delivery_address`, validated
   field-by-field: name 1–100, line1 1–200, line2 0–200, city 1–100, region
   1–100, postal code 1–32, ISO 3166-1 alpha-2 country).
2. The service stores it on the order row and echoes it back **once**, in the
   checkout command result — which only the buyer, the command's author,
   receives.
3. **Every** read projection strips it: `OrderRow::projection()` removes
   `delivery_address` before serving, and both the order list and
   single-order reads (buyer's and seller's alike) serve projections
   (ADR-0019 §8). There is no seller-facing read path for the address, and
   auction-won orders carry no address at all (the winner never supplied
   one).
4. Consequently **the seller's client never legitimately holds the buyer's
   address**, and this client does not invent a side channel for it.

What that means for the tooling here:

- The **address book** is buyer-side only and purely device-local. The
  checkout picker fills the same form checkout always had; the address still
  goes only into the buyer's own command.
- The **packing slip** renders from the seller's participant order projection
  and therefore has **no address block**. It says so explicitly ("Not
  printed: the delivery address is withheld from all transaction-service
  reads — including yours as the seller — by design") and leaves ruled space
  for the seller to write the destination obtained from the buyer directly
  (e.g. the end-to-end-encrypted conversation). Printing a fabricated or
  cached address the seller was never served would falsify the privacy
  model, so the slip does not.
- The slip (and the order rows) now show the buyer's **variant snapshot**
  when the checkout carried one: `checkout.create` lines accept an optional
  `variant_id` plus up to three `{name, value}` option pairs (an ordered
  array, safe through the wire-casing layer), which both engines echo
  verbatim onto the order line. It is a buyer-supplied display snapshot —
  listing registration carries no variant inventory, so the service
  validates its shape, not its truth against the owner-signed listing
  content; like `quantity`, the seller sees the claim and fulfills or
  refuses it. Orders placed before the field existed simply have no
  variant line.

## Structured carrier tracking

The service's `fulfillment.ship` command already takes structured fields —
`carrier` (trimmed free string, 1–100 chars) and `tracking_number` — and
stores them in the participant-visible `shipment` object. **No contract
change was needed and none was made**; wire casing stays snake_case per
ADR-0019 §3 via the existing wire-casing layer. The service now additionally
rejects control characters in both fields (a charset floor, not a vocabulary
lock — international carrier names stay valid) and documents this client's
canonical carrier names as its soft vocabulary on `ShipOrderPayload.carrier`,
deliberately without an enum so foreign clients can ship other carriers.

Encoding decision: the ship dialog offers a curated carrier select, and the
client writes the selected carrier's **canonical display name** (e.g.
`Royal Mail`) into the existing `carrier` field. "Other" passes the seller's
free-text carrier name through verbatim. On read, the client resolves the
stored string back against the registry (case-insensitive, plus known
aliases like "Hermes" → Evri); resolution failure renders the carrier as
plain text with **no** tracking link — an unknown carrier never produces a
dead or wrong URL, and neither does a tracking number that does not look
like a real reference.

Curated registry (`src/libs/commerce/carriers.ts`), each with a public
tracking URL template: USPS, UPS, FedEx, DHL, Royal Mail, DPD, Evri
(Hermes), PostNL, Correos, La Poste, An Post, Deutsche Post, plus "Other"
(no template). Every template is unit-tested
(`src/libs/commerce/carriers.test.ts`).

The buyer's order timeline renders "Track package" linking to the carrier's
public tracking page when — and only when — the stored carrier resolves and
the tracking number is linkable. Existing orders shipped before the select
existed (arbitrary free-text carriers) keep rendering as plain text.

## Seller shipping presets

Sellers previously re-entered the flat shipping price per listing while the
option's label ("Seller shipping") and 3–7 day estimate were fixed copy. The
sell studio now authors all four fields (label, flat price, min/max days),
and presets template them:

- **Save as preset** in the sell studio's shipping section stores the current
  four fields; **Apply a saved preset** fills them while composing or
  editing.
- Presets are managed at `/marketplace/settings/shipping` (linked from My
  shop).
- The published record shape is **unchanged**: one flat-rate
  `shippingOptions` entry either way. A preset is never published, referenced,
  or synced.

## Buyer address book

- Saved/labeled addresses at `/marketplace/settings/addresses` and inline
  from checkout ("Save this address on this device for next time" + label).
- The checkout picker orders addresses default-first, then by most recent
  use; the top address pre-fills the form once (never over typed input), and
  editing a picked address turns the entry back into a new one.
- Validation mirrors the checkout command contract exactly, so a saved
  address is always submittable.
- The first saved address becomes the default; the default is exclusive and
  changeable from the settings surface.

## Packing slip

From a paid/processing/shipped order's **seller** view: a print-friendly
slip (browser `@media print` CSS keyed on `data-packing-slip` in
`globals.css` — no PDF dependency) with the order id, order date, line items
and quantities, totals, the buyer's short pubky, shipment facts once
tracking exists, the truthful no-address notice with ruled space to write
the destination, and a notes area. The order contract's line items carry no
variant detail (title, quantity, and prices only — variants never enter the
checkout command), so the slip honestly shows what the order record holds.

## Follow-ups (deliberately not built)

- **Seller-facing address delivery.** The right mechanism for the seller to
  receive the delivery address without weakening ADR-0019 §8 is a product
  decision — candidates include buyer-initiated sharing over the existing
  end-to-end-encrypted messaging, or a service-side sealed exchange. Until
  then the packing slip's manual space is the honest state.
- **Service-side shipment enrichment** (shipped-at estimates, delivery-day
  windows, carrier enum server-side). The `carrier` field staying a free
  string is the service's contract; a server-side curated enum would be a
  service change, not a client one.
- **Label purchase / carrier APIs.** Buying postage, rate quotes, and live
  tracking status require carrier accounts and server-side credentials —
  out of scope for a client-only change and gated on the independent
  security review like everything real-funds-adjacent.
- **Variant detail on order lines.** The checkout command carries only
  listing aggregate + quantity; putting the chosen variant on the order
  record is a service contract change.
- **Multiple shipping options per listing.** The record supports up to 20;
  the sell studio still authors exactly one flat-rate option. Presets make
  the single option cheap to reuse; a multi-option composer is future work.
