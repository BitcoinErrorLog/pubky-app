# Local Pickup and Scheduled Pickup — Design

Status: proposed design, 2026-09-07. No code yet. Read
[`shipping.md`](shipping.md) (address privacy boundary) and ADR-0019 §8 first;
this document extends both.

## Policy this design must satisfy

A physical address is shared only when its owner chooses to, for a reason
shown to them, with the one person who needs it. Buyer → seller: only the
delivery address, only for shipped items, only once the order exists (the
existing `checkout.create` path, withheld from all read projections).
Seller → buyer: nothing by default beyond a tracking number — except local
pickup, where the seller deliberately publishes a meeting point per listing,
revealed only to the paying buyer, and the meeting point may be a public
pickup spot instead of a home. No third party, including the operator, reads
an address in the clear beyond what the transaction service needs to deliver
it to the entitled peer.

## Prior art and what this design fixes

A teammate branch (`marketplace/local-pickup`) prototyped this with seller
pickup details held **device-locally** and revealed on payment through the
sandbox adapter only. (The branch was not reachable from this repo's remotes
at writing; this section works from its described behavior.) Known issues,
and how this design answers each:

| Prior-art issue                                              | Fix here                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Mixed carts silently fall back to shipping                   | One order per (seller, fulfillment); the buyer's choice is never overridden (§2)                  |
| Reveal reads only the first line                             | Reveal is per order line, every line of the order (§3)                                            |
| Details built onto the public record, then stripped          | Details never touch the public record; only `fulfillmentMethods` is public (§1)                   |
| No DB version bump                                           | Postgres migration + Dexie schema bump are both in the plan (§10)                                 |
| No cross-device recovery                                     | The service is the source of truth; a new device re-reads the seller's own details (§5)           |
| No durable-service counterpart                               | Full service design: commands, state machines, sealed storage, reveal entitlement (§1, §7, §8)    |

## 1. Data model

| Data                                                            | Lives                                                                                          | Who can read it                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Listing `fulfillmentMethods` (`shipping` \| `pickup` \| both)   | Owner-signed listing record; echoed to the service at `listing.register`/`listing.sync`        | Public, like the rest of the listing                                   |
| Optional coarse pickup area (city/neighborhood, free text)      | Owner-signed listing record                                                                    | Public — the seller's own choice to publish an **approximate** area; never the meeting point |
| Seller pickup details (address **or** spot, instructions, availability) | Transaction service, `listing_pickup_details` table, **sealed** (below)                 | The seller (owner read) and the paying buyer (reveal read, §3). Nobody else |
| Buyer delivery address (shipped orders)                         | Transaction service `orders.delivery_address` — unchanged                                      | Nobody through reads, per ADR-0019 §8                                  |
| Device copies of any of the above                               | Account-scoped Dexie, this device only                                                         | This browser profile; a read-through cache, never a source of truth    |

The public listing record carries `fulfillmentMethods` and optionally the
coarse area — and nothing else about pickup. Details are never placed on the
record and stripped later; they are authored in a separate surface and sent
only to the service.

**Encrypted at rest? Yes — sealed service-side, like Locks bundle ids.** The
service already seals `bundle_id` with XChaCha20-Poly1305 under an
operator-held env key (`locks.rs`), with a fresh random nonce per seal and no
serialization path for the plaintext. Pickup details reuse that pattern:
`details_ciphertext` (address-or-spot, instructions, availability windows as
one JSON blob), AAD-bound to the listing aggregate id and details version,
under a new `PICKUP_DETAILS_ENCRYPTION_KEY` that must be distinct from the
Locks key (the existing distinctness check is the template).

Why sealed rather than plaintext-in-service (the buyer-address precedent):
ADR-0019 §8 says private data is encrypted at rest, and the sealing module
now exists, so the marginal cost is small. A database dump, backup, or
replica snapshot then yields no meeting points, and ad-hoc operator SQL reads
ciphertext. The honest limit: the operator holds the key, so the operator
*can* decrypt — sealing does not remove the operator from the trust boundary,
it removes casual and bulk exposure. The policy's operator clause is met
because the service legitimately needs the plaintext at reveal time, and the
only two read paths that ever decrypt are the seller's own read and the
paying buyer's reveal read; support/moderation projections stay redacted.

Why not end-to-end encrypted to the buyer: the buyer is unknown when the
seller authors the details. E2E would require the seller to be online after
every payment to encrypt to that buyer — which is exactly the device-local
failure mode the prior art hit (no cross-device recovery, no durable reveal).
The service must be able to reveal to the entitled peer on payment without
seller involvement.

Pickup details may be a full address **or** a pickup spot (free-text meeting
point such as "Central Station, north entrance" plus optional instructions).
The UI presents the spot option first and says why: the seller never has to
publish their home.

## 2. Checkout

Each cart seller group gets one `fulfillmentChoice`: `shipping` or `pickup`,
defaulting to `shipping`, selectable only among the methods the group's
listings actually publish. The choice rides `checkout.create` as an optional
`fulfillment` field per line (snake_case on the wire, camelCase client-side
via the wire-casing layer, as with variants); the service validates that all
lines of one seller group share one choice and that every line's listing
allows it.

**Mixed carts: one order per (seller, fulfillment).** The service already
splits a checkout into one order per seller (`handlers/checkout.rs` groups
lines by seller). The split key becomes `(seller, fulfillment)`, so a cart
with seller A shipping + pickup and seller B shipping produces three orders.
Justification over the alternatives: silently falling back to shipping (the
prior art) overrides a choice the buyer was shown and breaks the policy's
"for a reason shown to them"; blocking the whole cart forces cart surgery for
a common case (one heavy item the buyer wants to collect, the rest posted).
Splitting keeps every order single-fulfillment, so reveal, shipping charge,
packing slip, and scheduling logic stay uniform per order. The checkout UI
states the split plainly before submit ("This places 3 orders").

**Pickup charges no shipping.** The seller-signed flat rate applies only to
shipped orders; a pickup order's `shipping_minor` is 0 and its totals reflect
that. The client must show the shipping line drop to 0 when the buyer picks
pickup — never charge shipping and refund it later.

`delivery_address` in the checkout payload becomes optional: required when
any group ships (and it is then stored only on the shipped orders), absent
when every group is pickup. Pickup-only checkouts therefore send **no** buyer
address at all — the strictest reading of the policy, and less data held.

v1 scope: pickup applies to fixed-price checkout. Auction listings are
shipping-only (auction orders carry no address and no checkout step; pickup
auctions are future work). Offers on a listing whose `fulfillmentMethods` is
not `shipping` are refused with a typed error rather than silently converted
to shipping.

## 3. Reveal

The meeting point is revealed **exactly on payment confirmation** — the
service's exactly-once `confirm_order` path (`payment_confirmation` /
`payment.sandbox_advance`) — **to the buyer only, per order line**:

- Reveal is a dedicated read, `GET /v1/orders/{id}/pickup-details`, not a
  field on the order projection. The standard projection (which clients
  cache, log shapes of, and render in lists) never carries details, so a
  replayed or cached projection cannot leak them.
- Authorization: the actor must be the order's buyer **and** the order must
  have reached `paid` (or any later state). `pending_payment` orders get a
  typed refusal. Sellers never call this endpoint; they read their own
  details through their seller-scoped read (§5).
- Per order line: the response maps each line's listing to its current
  details (kind, address-or-spot, instructions) plus `version` and
  `updated_at`. Every line is served, fixing the prior art's first-line-only
  read.
- At confirmation the service records, per line, the details version
  revealed (`revealed_version` on the order line). That pins what the buyer
  was shown at payment for later dispute reading.

**Seller edits after payment.** `pickup_details.set` always bumps the
version (append-only history is kept per listing; old versions are retained
for evidence, latest is served). For every paid, non-terminal pickup order
on that listing, the outbox carries a `pickup_details_updated` notification
to the buyer, and the order view flags "meeting point updated since you
ordered" when current version > `revealed_version`. Editing is always
allowed — a seller who moves house cannot be blocked — but it is never
silent. Changing the meeting point does not change an already-agreed slot
(§4); the peers re-arrange or use cancel/return.

Cancellation does not revoke the reveal. A buyer who paid and then cancelled
(or was cancelled) already saw the address; pretending otherwise is security
theater. The entitlement check is "reached `paid`", which stays true for
`cancel_requested`, `cancelled`, returns, and refunds. An order cancelled
from `pending_payment` never revealed anything.

## 4. Scheduling

Scheduling is optional per listing. The seller sets, alongside the pickup
details, either **availability windows** (recurring weekly windows, e.g.
Saturdays 10:00–14:00) or **arrange after payment** (no windows; the buyer
proposes any sensible time and the seller responds).

Flow, per pickup order:

1. Payment confirms → the service creates a `pickup_schedule` aggregate for
   the order in `awaiting_proposal` and notifies the buyer.
2. The buyer proposes a slot (`pickup_schedule.propose`). With windows, the
   slot must fall inside one; the service validates this server-side. With
   arrange-after-payment, any valid future instant goes.
3. The seller confirms (`pickup_schedule.confirm`) or proposes a change
   (`pickup_schedule.propose` again from the other party — a counter). The
   buyer can likewise counter a counter. Only the party that did **not**
   make the current proposal may confirm it.
4. On confirm, the agreed slot (start/end UTC instants) is written onto the
   order's participant-visible projection, so both peers see the same fact.
5. Reminders: an outbox worker emits `pickup_reminder` notifications to both
   peers at slot−24 h and slot−1 h, deduplicated by (order, slot, kind).
6. No-show: no new states. If the buyer doesn't show, the seller keeps the
   funds and the peers sort it out with the existing cancel/return flows;
   if the seller doesn't show, the buyer requests cancellation and the
   external-refund path applies. The agreed slot passing without a pickup
   confirmation lets the peers re-propose.

**All timestamps are server-authoritative** (ADR-0019 §3): slot validity,
lead time (proposal must be at least 1 h ahead of server time), horizon
(≤ 60 days), reminder times, and the proposal TTL (an unconfirmed proposal
expires after 72 h) are all computed on the service clock. `issued_at` is
diagnostic only.

**Timezones.** Availability windows are authored in the pickup location's
IANA timezone, stored with the details as `{ day, start, end, zone }` local
wall-clock entries. The service expands windows to UTC instants with a tz
database (DST-correct) when validating proposals and when scheduling
reminders. Everything stored and served is UTC RFC 3339 with milliseconds,
the existing `format_timestamp` convention; clients render the slot twice —
pickup-location local time (labeled with the zone) and the viewer's local
time — so neither peer does mental arithmetic.

## 5. Cross-device recovery (seller)

The service is the source of truth for pickup details; the seller's Dexie
copy is a read-through cache for offline editing convenience. A seller on a
new device opens the sell studio, the client issues the seller-scoped details
read, gets the sealed row opened for its owner, and the editor is populated.
Nothing was ever on the homeserver, so there is nothing to lose with a
browser profile.

The self-heal rule that must hold: **no sync path may null service-side
details.** `listing.sync` converges only the public record's
`fulfillmentMethods`; it carries no details and therefore cannot overwrite
them. The only write to details is the explicit seller command
`pickup_details.set`, which requires the full payload (details are replaced
whole, version + 1, `expected_version` compare-and-swap against lost-update).
A client that has a stale or empty local cache and issues a sync heals the
listing aggregate, not the details. A details read that fails leaves the
cache marked stale; the editor refuses to save over an unread row.

## 6. Packing slip

The packing slip is suppressed for pickup orders: there is nothing to pack
and post, and printing the buyer's withheld-address notice for an order that
never had an address would confuse. The seller's order row for a pickup
order shows instead: line items and variant snapshots, the seller's own
meeting-point details (owner read, already theirs), and the agreed slot once
confirmed. The print affordance is hidden, not disabled-with-explanation —
nothing about a pickup order needs paper.

## 7. State machines

Additions to `contracts/state-machines.json`. Existing transitions are
untouched; shipped orders behave exactly as today.

### Order aggregate (pickup path)

| From              | To                 | Trigger                                       | Actor  |
| ----------------- | ------------------ | --------------------------------------------- | ------ |
| `paid`            | `ready_for_pickup` | command `fulfillment.mark_ready`              | seller |
| `ready_for_pickup`| `delivered`        | command `fulfillment.confirm_pickup`          | buyer  |
| `ready_for_pickup`| `delivered`        | server `pickup_assume` (slot + assume window) | server |
| `ready_for_pickup`| `cancel_requested` | command `order.cancel_request`                | either |

`fulfillment.ship` is refused for pickup orders and `mark_ready`/`confirm_pickup`
for shipped ones (`InvalidState`, typed). `pickup_assume` mirrors
`delivery_assume`: it fires only when an agreed slot (or, with no slot, a
fixed window after `ready_for_pickup`) has passed by the assume window, and
sets `delivery_assumed` so the UI can ask the buyer to report a no-show.
From `delivered` the existing transitions (return, complete) apply as-is.

### New aggregate: `pickup_schedule` (one per pickup order)

| From                | To                  | Trigger                                | Actor            |
| ------------------- | ------------------- | -------------------------------------- | ---------------- |
| —                   | `awaiting_proposal` | server `payment_confirmation` (create) | server           |
| `awaiting_proposal` | `proposed`          | command `pickup_schedule.propose`      | buyer            |
| `proposed`          | `proposed`          | command `pickup_schedule.propose`      | the non-proposer |
| `proposed`          | `confirmed`         | command `pickup_schedule.confirm`      | the non-proposer |
| `proposed`          | `expired`           | server `proposal_expiry` (72 h)        | server           |
| `expired`           | `proposed`          | command `pickup_schedule.propose`      | either           |
| `confirmed`         | `completed`         | command `fulfillment.confirm_pickup`   | buyer            |
| `confirmed`         | `completed`         | server `pickup_assume`                 | server           |
| any non-terminal    | `cancelled`         | server `order_cancelled` (propagation) | server           |

`completed` and `cancelled` are terminal. The schedule never drives money:
it informs reminders and displays; funds stay governed by the order machine.

## 8. Commands and roles

All commands use the existing versioned envelope with `command_id`
idempotency and `expected_revision`/`expected_version` CAS. Authorization is
object-level, as today.

| Command                       | Role                                   | Effect                                                              |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `pickup_details.set`          | Seller, own listing only               | Sealed upsert of details + availability; version + 1; notifies paid buyers on change |
| `checkout.create` (extended)  | Buyer                                  | Per-line `fulfillment`; splits per (seller, fulfillment); optional `delivery_address` |
| `pickup_schedule.propose`     | Order participant (buyer first, then either, never twice in a row by the same party) | Proposes/counters a slot; server-time validated against windows |
| `pickup_schedule.confirm`     | Order participant, non-proposer only   | Fixes the agreed slot onto the order                                |
| `fulfillment.mark_ready`      | Seller, own order, state `paid`        | Order → `ready_for_pickup`; notifies buyer                          |
| `fulfillment.confirm_pickup`  | Buyer, own order, state `ready_for_pickup` | Order → `delivered`; schedule → `completed`                     |

Reads (not commands): `GET /v1/listings/{seller}/{id}/pickup-details` —
seller only (owner read, §5); `GET /v1/orders/{id}/pickup-details` — buyer
only, order reached `paid` (reveal, §3); the schedule rides the ordinary
order projection (slots are participant facts, not addresses).

No role outside the two participants can call any of these. Operator and
support projections contain no pickup-details read path — ciphertext only.

## 9. Threat model — self-attack table

Extends [`threat-model.md`](threat-model.md); assets: seller meeting point
(restricted personal data), buyer delivery address (unchanged), agreed slots
(participant facts).

| Attack | Precondition | Result | Mitigation |
| ------ | ------------ | ------ | ---------- |
| Unpaid buyer reads the meeting point | Controls a buyer account, order in `pending_payment` | Refused: reveal read requires the order to have reached `paid`; projection never carries details | State-gated entitlement at the service, not the client; typed refusal |
| Replay of a paid order projection | Stale/cached projection from any source | Useless: details are not on the projection at all | Dedicated reveal endpoint; caches hold no address material |
| Seller swaps the address after payment | Seller edits details on a paid order | Buyer is notified (`pickup_details_updated`), order view flags the version change, `revealed_version` pins what was shown at payment, version history is retained | Versioning + notification + evidence retention; editing is allowed but never silent |
| Buyer shares the address onward | Buyer is entitled and malicious | Unpreventable — the buyer must know where to go; same as telling a friend where you're meeting | Reveal only after payment (the seller is paid before the address exists for the buyer); spot-first UX keeps most listings off home addresses; reviews give the seller recourse |
| Operator DB read | Operator runs SQL or exfiltrates a backup | Ciphertext only: XChaCha20-Poly1305, AAD-bound, fresh nonce per seal; key is an env secret distinct from the Locks key | Sealing (§1); operator with env access can still decrypt — acknowledged, bounded by policy's "what the service needs" clause; no operator/support read path exists |
| Second-device seller | Seller signs in elsewhere | Owner read returns their details; recovery works | Service is truth (§5); no sync path can null details; save requires a successful read (CAS version) |
| Cancelled after reveal | Order paid, then cancelled | Buyer retains what they saw; the entitlement honestly reflects that | Reveal happens only after money moved; cancellation post-payment is a real-world dispute handled by cancel/return, not by pretending the address is secret again |
| Slot proposed outside availability | Malicious buyer client | Refused server-side | Window validation on the service clock, never client-side |
| Reminder/notification spoof | Forged outbox intent | Consumers deduplicate by event id; notifications carry no address material | Existing outbox invariants (ADR-0019 §4) |

## 10. Migration plan and implementation sketch

### Migration

1. **Service Postgres migration** (new version, applied before code that
   uses it): `listing_pickup_details` (aggregate id, seller, version,
   `details_ciphertext`, history table or append-only versions,
   created/updated); `pickup_schedules` (order id, state, proposals,
   agreed slot, revision); order lines gain `fulfillment` and
   `revealed_version`; orders gain nothing (fulfillment is derivable, but a
   denormalized `fulfillment` column on orders is acceptable for query
   simplicity). Backfill: all existing rows `fulfillment = 'shipping'`.
2. **Contract version**: new commands and the extended `checkout.create` are
   additive; old clients default to shipping and are unaffected. The
   command contract version bumps; `state-machines.json` gains §7.
3. **Client Dexie**: schema version bump adding the pickup-details cache
   table (account-scoped, sealed-blob-free — it caches the owner's plaintext
   like the address book caches addresses, this device only).
4. Rollout: service first (accepts new commands, defaults keep old behavior),
   client second. Sandbox adapter gains the same commands so local dev keeps
   working — the prior art's sandbox-only reveal becomes a sandbox mirror of
   the durable contract.

### 10.1 Service sketch

- `crates/domain/src/commands.rs`: `SetPickupDetailsPayload` (listing
  aggregate, `expected_version`, details: kind address|spot, fields,
  instructions, availability windows | arrange-after-payment, IANA zone),
  `ProposePickupSlotPayload`, `ConfirmPickupSlotPayload`,
  `MarkReadyForPickupPayload`, `ConfirmPickupPayload`; `fulfillment` on
  `CheckoutLine`; `delivery_address` optional on `CreateCheckoutPayload`
  (required iff any shipped group). Validation mirrors the address-field
  limits already used for `DeliveryAddress`.
- New `crates/service/src/handlers/pickup.rs`: details set (seller-only,
  seal, version bump, paid-buyer notifications), schedule propose/confirm,
  mark-ready/confirm-pickup, both reveal reads with their entitlement
  checks.
- `handlers/checkout.rs`: group by `(seller, fulfillment)`; refuse
  disallowed choices with typed errors; zero shipping on pickup orders;
  store address only on shipped orders.
- `workers.rs`: on payment confirmation, create the `pickup_schedule`
  aggregate and record `revealed_version` per line; reminder sweep at
  slot−24 h/−1 h; `proposal_expiry` and `pickup_assume` sweeps — all
  server-time, deduplicated through the existing outbox.
- `model.rs`: `PickupDetailsRow` (no plaintext serialization path — only the
  two entitled reads open the seal), `PickupScheduleRow`, order line
  extension.
- Encryption: extract the seal/open helpers from `locks.rs` into a shared
  module; add `PICKUP_DETAILS_ENCRYPTION_KEY` with the same
  all-or-none config gating and key-distinctness check.
- Notifications: new types `pickup_slot_proposed`, `pickup_slot_confirmed`,
  `pickup_reminder`, `pickup_details_updated`, `pickup_ready`.

Service tests:

- unpaid buyer reveal → typed refusal; paid buyer → full per-line details;
- seller reveal read → own details; other seller → unauthorized;
- projection replay contains no details fields (shape assertion);
- mixed cart splits per (seller, fulfillment); shipping charged only on
  shipped orders; pickup-only checkout sends and stores no address;
- details edit after payment bumps version, notifies exactly the paid
  buyers, keeps history;
- propose outside windows refused; propose inside accepted; only the
  non-proposer confirms; 72 h proposal expiry; reminders deduplicated;
- `listing.sync` never alters details; `pickup_details.set` with stale
  `expected_version` conflicts;
- 100 concurrent proposes produce one current proposal; command replay
  idempotent;
- sealed round-trip with wrong key / wrong AAD fails; distinct-key check
  enforced.

### 10.2 Client sketch

- Sell studio: pickup section per listing — method toggle
  (`fulfillmentMethods`), spot-first details form, availability editor
  (windows or arrange-after-payment), optional coarse area. `react-hook-form`
  + `zod` with a sibling `*.types.ts`, per the forms convention; submission
  wrapped in a hook (`usePickupDetailsForm`) calling the controller.
- Checkout: per-seller-group fulfillment selector with the shipping line
  dropping to 0 on pickup; address form hidden when every group is pickup;
  explicit "places N orders" copy for mixed carts.
- Orders: buyer pickup panel (details after payment, version-change notice),
  scheduling UI (propose/confirm/counter, slot shown in pickup-zone and
  viewer-local time), seller ready/hand-off actions, notifications
  rendering for the new types. Packing-slip affordance suppressed on pickup
  orders.
- Dexie cache + self-heal: owner-read populates cache; stale-marked on read
  failure; save blocked over an unread row; sync paths never write details.
- Wire casing: new payloads through the existing casing layer.
- VRT: order detail and sell-studio surfaces change; regenerate the
  affected baselines and add coverage for the pickup panel and scheduling
  states.

Client tests:

- checkout groups get independent choices; mixed cart submits one command
  and surfaces the N-orders copy; pickup zeroes the shipping line;
- pickup-only checkout renders no address form and sends no address;
- reveal panel renders only when the order projection is `paid`+; version
  notice appears when the service reports a newer version;
- scheduling: propose/confirm/counter flows; dual-timezone slot rendering;
  reminder notifications render;
- sell studio recovers details on a fresh profile (mocked owner read);
  stale-cache save is blocked;
- packing slip hidden on pickup orders, unchanged on shipped ones;
- account switch clears the pickup-details cache with other private
  projections.

## Deliberately not built (v1)

- Pickup for auctions and offers (shipping-only; typed refusals, no silent
  fallback).
- Public display of availability windows before payment.
- Operator/support tooling that reads pickup details (no read path exists;
  incidents are handled with the participants, not by reading the address).
- Deposit/no-show penalties — funds semantics stay exactly as today.
