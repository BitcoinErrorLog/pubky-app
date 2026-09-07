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

The prior art is PR 22 on `BitcoinErrorLog/pubky-app` (the
`services/marketplace` prototype engine plus its client). It stored
`pickupDetails` on the **service-side listing aggregate**, written by
`listing.register`, and revealed them by copying the first order line's
listing details onto the order projection when the payment confirmed. The
naming defect: **the details rode `listing.register`, which `listing.sync`
converges** — a sync replays the owner-signed record (which carries no
details) over the listing aggregate, so any sync from a device without the
details nulls them. A second defect: the reveal copied the address onto the
cached, shape-logged order projection. Known issues, and how this design
answers each:

| Prior-art issue                                              | Fix here                                                                                          |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------- |
| Mixed carts silently fall back to shipping (`?? 'shipping'`) | One order per (seller, fulfillment, pickup_location); the buyer's choice is never overridden (§2) |
| Reveal reads only the first line                             | Reveal is per order line, every line of the order (§3)                                            |
| Details ride `listing.register`, which `listing.sync` converges | Details are a separate service aggregate written only by `pickup_details.set`/`pickup_details.clear`; sync carries no details and cannot null them (§1, §5) |
| Reveal copies details onto the cached order projection       | Dedicated reveal read; the projection never carries details (§3)                                  |
| No DB version bump                                           | Postgres migration + Dexie schema bump are both in the plan (§10)                                 |
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
The decrypted plaintext must never reach logs, traces, or Sentry: the
details types get a redacted `Debug` impl (the `locks.rs` pattern), the two
entitled responses are excluded from request/response-body logging, and a
redaction-scanning test mirrors the one in `locks.rs` (§10.1).

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

**Mixed carts: one order per (seller, fulfillment, pickup_location).** The
service already splits a checkout into one order per seller
(`handlers/checkout.rs` groups lines by seller). The split key becomes
`(seller, fulfillment, pickup_location)`, where `pickup_location` is the
identity of the line's listing pickup details (all shipped lines share one
null location). One order therefore has exactly one meeting point and exactly
one agreed slot (§4): a schedule, a reveal, and a reminder set never span
two places. A cart with seller A shipping + pickup at two different spots
and seller B shipping produces four orders. There is no silent fallback: a
group whose chosen fulfillment is not published by every one of its lines is
refused with a typed error — the buyer's choice is never rewritten to
shipping (the prior art's `?? 'shipping'`). Justification over blocking the
whole cart: blocking forces cart surgery for a common case (one heavy item
the buyer wants to collect, the rest posted). Splitting keeps every order
single-fulfillment, single-meeting-point, so reveal, shipping charge,
packing slip, and scheduling logic stay uniform per order. The checkout UI
states the split plainly before submit ("This places 4 orders").

**Pickup charges no shipping.** The seller-signed flat rate applies only to
shipped orders; a pickup order's `shipping_minor` is 0 and its totals reflect
that. The client must show the shipping line drop to 0 when the buyer picks
pickup — never charge shipping and refund it later.

`delivery_address` in the checkout payload becomes optional: required when
any group ships (and it is then stored only on the shipped orders), absent
when every group is pickup. Pickup-only checkouts therefore send **no** buyer
address at all — the strictest reading of the policy, and less data held.
Omission is not enough: a pickup-only checkout that **presents** a
`delivery_address` is rejected with `INVALID_COMMAND` (the PR 22 behavior),
so a buggy or malicious client cannot smuggle an address into storage the
policy says should not exist.

**Axis reconciliation: item type vs fulfillment.** The listing form's
existing `physical` | `digital` axis is the item type; PR 22's
`Array<'physical' | 'digital' | 'pickup'>` conflated that axis with
fulfillment. This design keeps them separate: item type stays
`physical` | `digital`; `fulfillmentMethods` (`shipping` | `pickup` | both)
is a distinct field, meaningful only for physical items. Digital listings
have no fulfillment choice: they are excluded from the
`(seller, fulfillment, pickup_location)` split key (their orders keep
today's behavior) and from the migration backfill (§10).

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
  carry a durable payment fact — not merely sit in a state set. `cancelled`
  is reachable from `pending_payment`, so a "reached `paid`" state-membership
  check would reveal the meeting point to a buyer who never paid. The gate is
  the order's `receipt_id IS NOT NULL` — the durable paid fact recorded by
  the exactly-once confirmation path. Orders without it get a typed refusal.
  Sellers never call this endpoint; they read their own details through their
  seller-scoped read (§5).
- The response is `Cache-Control: no-store` and the route is excluded from
  the service worker's cache (threat model WEB-03): the entitlement is
  re-evaluated against the durable fact on every read, and no intermediary or
  browser cache may serve the address.
- Per order line: the response maps each line's listing to its current
  details (kind, address-or-spot, instructions) plus `version` and
  `updated_at` — or, after a `pickup_details.clear`, to the pinned retained
  version flagged withdrawn-by-seller (below). Every line is served, fixing
  the prior art's first-line-only read.
- At confirmation the service records, per line, the details version
  revealed (`version_at_payment` on the order line). That pins the pickup
  terms version the buyer was shown at payment: it drives the version-change
  flag, the buyer's unilateral-cancel unlock (§7), and later dispute
  reading. An absent `version_at_payment` JSON key on a line reads as "no
  terms version pinned" (pre-migration rows).

**Seller edits after payment.** `pickup_details.set` always bumps the
version (append-only history; retention below). For every paid, non-terminal
pickup order on that listing, the outbox carries a `pickup_details_updated`
notification to the buyer, and the order view flags "meeting point updated
since you ordered" when current version > `version_at_payment`. Editing is
always allowed — a seller who moves house cannot be blocked — but it is
never silent, and it is never free: every edit after payment resets any
confirmed slot on those orders back to `awaiting_proposal` (§7 schedule
machine) and unlocks the buyer's unilateral cancel — `order.cancel_request`
moves the order straight to `cancelled`, no seller approval, while the
pickup terms changed after payment (current version > `version_at_payment`,
or the details were cleared). The seller is notified; the refund remains
seller-recorded external evidence per ADR-0019.

**Seller deletes the details.** `pickup_details.clear` removes the seller's
pickup details entirely (§8). Retention keeps only the versions referenced
as `version_at_payment` by a paid, non-terminal order; every other version
is hard-deleted. The read path for a buyer whose order references a retained
version: the reveal endpoint keeps working and serves the pinned retained
version, flagged as withdrawn-by-seller, in place of the current details
(there are none). Once every referencing order is terminal, the retained
versions are purged. Clearing notifies the paid buyers
(`pickup_details_cleared`), resets confirmed slots like an edit, and unlocks
the same unilateral cancel. The seller's owner read after a clear returns
"no details".

Cancellation does not revoke the reveal. A buyer who paid and then cancelled
(or was cancelled) already saw the address; pretending otherwise is security
theater. The entitlement check is the durable payment fact, which stays true
for `cancel_requested`, `cancelled`, returns, and refunds that passed through
payment — and was never established for an order cancelled from
`pending_payment`, which never revealed anything.

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
    make the current proposal may confirm it. Proposals are capped at 6 per
    order; a seventh `propose` is refused with a typed error naming the cap,
    so a hostile peer cannot counter forever, and `pickup_schedule.propose`
    on an order with no schedule (any shipped order) is refused with a typed
    error.
4. On confirm, the agreed slot (start/end UTC instants) is written onto the
   order's participant-visible projection, so both peers see the same fact.
5. Reminders: an outbox worker emits `pickup_reminder` notifications to both
   peers at slot−24 h and slot−1 h, deduplicated by (order, slot, kind).
   Reminders are **in-app pull only** — no push — so a lock screen never
   announces a meeting. The UI says so plainly: "Reminders appear here when
   you open the app; there are no push notifications."
6. No-show: no new states and no automatic assumption. The order holds in
   `ready_for_pickup` (§7); the peers re-propose a new slot or use the
   existing cancel/return flows. If the buyer doesn't show, the seller keeps
   the funds; if the seller doesn't show, the buyer requests cancellation
   and the external-refund path applies.

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
them. The only writes to details are the explicit seller commands
`pickup_details.set` (which requires the full payload — details are replaced
whole, version + 1, `expected_version` compare-and-swap against lost-update)
and `pickup_details.clear` (§3, §8). A client that has a stale or empty
local cache and issues a sync heals the listing aggregate, not the details. A details read that fails leaves the
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

| From              | To                 | Trigger                                       | Actor           |
| ----------------- | ------------------ | --------------------------------------------- | --------------- |
| `paid`            | `ready_for_pickup` | command `fulfillment.mark_ready`              | seller          |
| `paid`            | `delivered`        | command `fulfillment.confirm_pickup`          | buyer or seller |
| `ready_for_pickup`| `delivered`        | command `fulfillment.confirm_pickup`          | buyer or seller |
| `ready_for_pickup`| `cancel_requested` | command `order.cancel_request`                | buyer           |
| `paid`            | `cancelled`        | command `order.cancel_request` (terms changed after payment, §3) | buyer, unilateral |
| `ready_for_pickup`| `cancelled`        | command `order.cancel_request` (terms changed after payment, §3) | buyer, unilateral |

`fulfillment.ship` is refused for pickup orders and `mark_ready`/`confirm_pickup`
for shipped ones (`InvalidState`, typed). `confirm_pickup` is allowed for
**either party** — the buyer or the seller, whoever is standing there with
the item taps confirm — from `paid` as well as `ready_for_pickup`, so a
seller who never taps `mark_ready` cannot strand a paid order. There is no
proof either way; the he-said/she-said limitation is stated in §9.
`order.cancel_request` stays buyer-only (`cancellation.rs` rejects any
non-buyer actor), and its allowed-from list gains `ready_for_pickup`
(§10.1). The unilateral rows fire only while a post-payment pickup-terms
change exists (version bump or clear, §3); without one, the same command
from `paid`/`ready_for_pickup` yields `cancel_requested` awaiting the
seller, as today.

**Unattended slots: hold, never assume.** There is no automatic delivery
assumption from an elapsed slot — no `delivery_assume`-style server
transition and no assumption flag of any kind. When an agreed slot passes
with no confirmation, the order simply holds in `ready_for_pickup`; the
peers re-propose or use cancel/return. The UI may prompt either party to
confirm or report a no-show, but the service records nothing on its own.

`next_actor()` gains `ready_for_pickup` → either: once the order is paid,
the hand-off is either party's move — buyer or seller may confirm. From
`delivered` the existing transitions (return, complete) apply as-is.

### New aggregate: `pickup_schedule` (one per pickup order, and one per pickup-method return)

`awaiting_proposal` is the machine's `initial` state: the server creates the
aggregate in that state on payment confirmation. The contract format has no
creation transitions — every row must name a literal declared from-state
(`transitions_reference_declared_states` in `state_machines.rs` rejects
from-states that are not declared states, so "any non-terminal" is not
expressible) — and the cancellation propagation is therefore enumerated row
by row below.

| From                | To                  | Trigger                                | Actor            |
| ------------------- | ------------------- | -------------------------------------- | ---------------- |
| `awaiting_proposal` | `proposed`          | command `pickup_schedule.propose`      | buyer            |
| `proposed`          | `proposed`          | command `pickup_schedule.propose`      | the non-proposer |
| `proposed`          | `confirmed`         | command `pickup_schedule.confirm`      | the non-proposer |
| `proposed`          | `expired`           | server `proposal_expiry` (72 h)        | server           |
| `expired`           | `proposed`          | command `pickup_schedule.propose`      | either           |
| `confirmed`         | `completed`         | command `fulfillment.confirm_pickup`   | buyer or seller  |
| `confirmed`         | `awaiting_proposal` | server `pickup_details_changed` (post-payment edit or clear, §3) | server |
| `awaiting_proposal` | `cancelled`         | server `order_cancelled` (propagation) | server           |
| `proposed`          | `cancelled`         | server `order_cancelled` (propagation) | server           |
| `expired`           | `cancelled`         | server `order_cancelled` (propagation) | server           |

`completed` and `cancelled` are terminal. Only `confirm_pickup` completes a
schedule; nothing auto-completes, and an elapsed slot changes nothing. A
post-payment details edit or clear on the order's listing propagates a
reset: a `confirmed` schedule returns to `awaiting_proposal` and the buyer
is notified (§3). The schedule never drives money:
it informs reminders and displays; funds stay governed by the order machine.

### Returns on a pickup order

The existing return states (`return_requested` → `return_approved` →
`return_received` → `refunded_external`) apply to a pickup order unchanged —
but the return method is chosen anew: receiving by pickup does not imply
returning by pickup, and the buyer holds no postal address for the seller.
`return.request` carries a required `return_method: pickup | shipping`,
which the seller sees when approving:

- **Pickup hand-back.** On `return.approve` the service creates a second
  `pickup_schedule` aggregate for the return (one per return, keyed to it)
  in `awaiting_proposal`, and the same propose/confirm flow (§4) runs for
  the hand-back. `return.receive` then marks the item back with the seller,
  as today.
- **Shipping.** Two variants, by agreement:
  - The seller supplies a shipping label — an upload or a URL today, a
    Shippo purchase later — via `return.provide_label`, when both agree; the
    buyer posts the item with it.
  - Otherwise the buyer ships at their own cost to an address the seller
    provides for that return only, via `return.provide_address`. The address
    is sealed like pickup details (§1), seller-chosen, scoped to that one
    return, and revealed buyer-only through a dedicated read with the same
    rules as the pickup reveal (§3: entitlement re-checked on every read,
    `Cache-Control: no-store`, service-worker exclusion, redacted from
    logs). It is not the listing's pickup details and is never reused.

## 8. Commands and roles

All commands use the existing versioned envelope with `command_id`
idempotency and `expected_revision`/`expected_version` CAS. Authorization is
object-level, as today.

| Command                       | Role                                   | Effect                                                              |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `pickup_details.set`          | Seller, own listing only               | Sealed upsert of details + availability; version + 1; notifies paid buyers on change; refused when pickup is off (no key or sandbox adapter, §10.1) |
| `pickup_details.clear`        | Seller, own listing only               | Deletes the details; retains only versions referenced by a paid, non-terminal order; everything else hard-deleted; notifies paid buyers (§3) |
| `checkout.create` (extended)  | Buyer                                  | Per-line `fulfillment`; splits per (seller, fulfillment, pickup_location); optional `delivery_address` |
| `pickup_schedule.propose`     | Order participant (buyer first, then either, never twice in a row by the same party) | Proposes/counters a slot; server-time validated against windows; capped at 6 per order (§4); refused on orders with no schedule |
| `pickup_schedule.confirm`     | Order participant, non-proposer only   | Fixes the agreed slot onto the order                                |
| `fulfillment.mark_ready`      | Seller, own order, state `paid`        | Order → `ready_for_pickup`; notifies buyer                          |
| `fulfillment.confirm_pickup`  | Buyer **or** seller, own order, state `paid` or `ready_for_pickup` | Order → `delivered`; schedule → `completed`        |
| `return.request` (extended)   | Buyer, own order                       | Carries a required `return_method: pickup \| shipping` (§7)         |
| `return.provide_label`        | Seller, own return                     | Attaches a shipping label (upload or URL today; Shippo later) for a shipping return |
| `return.provide_address`      | Seller, own return                     | Sealed, single-return address for a shipping return; revealed buyer-only (§7) |

Reads (not commands): `GET /v1/listings/{aggregate_id}/pickup-details` —
seller only (owner read, §5); `GET /v1/orders/{aggregate_id}/pickup-details`
— buyer only, order carries the durable payment fact (reveal, §3). Both are
keyed by aggregate id, matching the existing `/v1/listings/{aggregate_id}`
route keying. The version prefix stays `/v1` deliberately: these are new,
additive routes on the existing versioned API, and a `/v2` prefix exists to
signal breaking changes to routes clients already call — introducing one
here would split the API surface over no incompatibility. The schedule rides
the ordinary order projection (slots are participant facts, not addresses).
The service's public config/health surface reports a `pickup_available`
capability flag — on iff `PICKUP_DETAILS_ENCRYPTION_KEY` is configured
**and** the payment adapter is not sandbox (§10.1). The client hides the
pickup option everywhere when the flag is off (§10.2).

No role outside the two participants can call any of these. Operator and
support projections contain no pickup-details read path — ciphertext only.

## 9. Threat model — self-attack table

Extends [`threat-model.md`](threat-model.md); assets: seller meeting point
(restricted personal data), buyer delivery address (unchanged), agreed slots
(participant facts).

| Attack | Precondition | Result | Mitigation |
| ------ | ------------ | ------ | ---------- |
| Unpaid buyer reads the meeting point | Controls a buyer account, order never paid (including one cancelled from `pending_payment`) | Refused: reveal read requires the durable payment fact, not state membership; projection never carries details | Fact-gated entitlement at the service, not the client; typed refusal |
| Replay of a paid order projection | Stale/cached projection from any source | Useless: details are not on the projection at all | Dedicated reveal endpoint; caches hold no address material |
| Seller swaps the address after payment | Seller edits details on a paid order | Buyer is notified (`pickup_details_updated`), any confirmed slot resets to `awaiting_proposal`, the buyer may cancel unilaterally while the terms changed after payment, and `version_at_payment` pins what was shown at payment | Versioning + notification + slot reset + unilateral cancel; editing is allowed but never silent or free |
| Seller deletes the details after payment | Seller issues `pickup_details.clear` on a paid order | Paid, non-terminal orders keep their pinned `version_at_payment` copy; the buyer's reveal read still serves what they were shown, flagged withdrawn; buyers are notified and may cancel unilaterally | Retention of referenced versions only; everything else hard-deleted; purge once referencing orders go terminal |
| Handover dispute (he-said/she-said) | Either party marks `fulfillment.confirm_pickup`; the other claims otherwise | The service cannot tell who is lying — it records who confirmed and when, nothing more. There is no escrow and no arbiter: a false confirm by the buyer strands the buyer's own funds, and a false confirm by the seller is indistinguishable from a real handover | None at protocol level — stated plainly as a limitation. Reviews and the external-refund evidence trail (ADR-0019) are the recourse; both parties accept this risk by design |
| Real meeting points on a sandbox deployment | Operator runs the sandbox payment adapter | Refused: `pickup_details.set` is rejected whenever the payment adapter is sandbox, so no real address can ever be stored against fake money | Refusal at the command handler plus the `pickup_available` capability flag; staging testing uses fake spots in durable mode only (§10) |
| Return-address reuse or leak | Seller provides an address for one return | Scoped: sealed, single-return, buyer-only reveal read with the same no-store/redaction rules as the pickup reveal; never the listing's pickup details, never reused | Dedicated reveal per return; support/operator projections carry ciphertext only |
| Buyer shares the address onward | Buyer is entitled and malicious | Unpreventable — the buyer must know where to go; same as telling a friend where you're meeting | Reveal only after payment (the seller is paid before the address exists for the buyer); spot-first UX keeps most listings off home addresses; reviews give the seller recourse |
| Operator DB read | Operator runs SQL or exfiltrates a backup | Ciphertext only: XChaCha20-Poly1305, AAD-bound, fresh nonce per seal; key is an env secret distinct from the Locks key | Sealing (§1); operator with env access can still decrypt — acknowledged, bounded by policy's "what the service needs" clause; no operator/support read path exists |
| Second-device seller | Seller signs in elsewhere | Owner read returns their details; recovery works | Service is truth (§5); no sync path can null details; save requires a successful read (CAS version) |
| Cancelled after reveal | Order paid, then cancelled | Buyer retains what they saw; the entitlement honestly reflects that | Reveal happens only after money moved; cancellation post-payment is a real-world dispute handled by cancel/return, not by pretending the address is secret again |
| Slot proposed outside availability | Malicious buyer client | Refused server-side | Window validation on the service clock, never client-side |
| Reminder/notification spoof | Forged outbox intent | Consumers deduplicate by event id; notifications carry no address material | Existing outbox invariants (ADR-0019 §4) |

## 10. Migration plan and implementation sketch

### Migration

1. **Prototype engine first** (`services/marketplace/src/transaction-service.ts`,
   which ADR-0022 designates the executable specification — see the
   `state_machines.rs` module header — folded explicitly into the service
   slice rather than shipped as its own slice): the prototype gains the same
   semantics alongside the Rust service, and its contract tests are extended
   to cover: pickup details withheld until payment confirms, then revealed
   per line; a pickup checkout presenting a `deliveryAddress` →
   `INVALID_COMMAND` (and a shipped checkout missing one → `INVALID_COMMAND`,
   the PR 22 pair); mixed-cart split per `(seller, fulfillment,
   pickup_location)` with shipping zeroed on pickup orders; proposal cap
   (6) and window validation; `version_at_payment` pinned per line at
   confirmation; unilateral buyer cancel after a post-payment terms change.
2. **Service Postgres migration** (new version, applied before code that
   uses it): `listing_pickup_details` (aggregate id, seller, version,
   `details_ciphertext`, append-only versions with the retention rule of §3 —
   on `pickup_details.clear`, hard-delete every version not referenced as
   `version_at_payment` by a paid, non-terminal order, and purge retained
   versions once their referencing orders go terminal); `pickup_schedules`
   (order id or return id, state, proposals, agreed slot, revision); return
   rows gain `return_method`, an optional label (upload reference or URL),
   and an optional sealed single-return address; order lines gain
   `fulfillment` and `version_at_payment` (nullable — an absent
   `version_at_payment` JSON key on a line reads as "no terms version
   pinned"); orders gain a **required** `fulfillment` column — not optional,
   not merely derivable: every order is exactly one fulfillment kind, and
   queries should not have to derive it. The reveal gate needs no new
   column: it is the existing `orders.receipt_id IS NOT NULL` (§3).
   Backfill: all existing **physical** rows `fulfillment = 'shipping'`;
   digital listings are excluded from the backfill (§2 — they carry no
   fulfillment choice).
3. **Contract version**: new commands and the extended `checkout.create` are
   additive; old clients default to shipping and are unaffected.
   `state-machines.json` gains §7 with `contract_version` **staying 1** —
   the change is additive, and no client pins the version (verified: the
   client contract test, `src/libs/commerce/state-machines.contract.test.ts`
   in the app repo, covers aggregate names, states, and transitions against
   the artifact but never reads `contract_version`). The service's
   `contract_document_is_stable_json` test asserts exactly 8 aggregates
   today; it is updated to 9 for the new `pickup_schedule` aggregate.
4. **Client Dexie**: schema version bump adding the pickup-details cache
   table (account-scoped, sealed-blob-free — it caches the owner's plaintext
   like the address book caches addresses, this device only).
5. Rollout: service first (accepts new commands, defaults keep old behavior),
   client second. The sandbox payment adapter never accepts pickup details —
   `pickup_details.set` is refused whenever the adapter is sandbox (§10.1),
   so no real meeting point can be stored against fake money. Staging and
   local dev exercise pickup in durable mode only, with fake meeting spots.

### 10.1 Service sketch

- `crates/domain/src/commands.rs`: `SetPickupDetailsPayload` (listing
  aggregate, `expected_version`, details: kind address|spot, fields,
  instructions, availability windows | arrange-after-payment, IANA zone),
  `ClearPickupDetailsPayload`, `ProposePickupSlotPayload`,
  `ConfirmPickupSlotPayload`, `MarkReadyForPickupPayload`,
  `ConfirmPickupPayload`, `ProvideReturnLabelPayload`,
  `ProvideReturnAddressPayload`; `fulfillment` on `CheckoutLine`;
  `delivery_address` optional on `CreateCheckoutPayload` (required iff any
  shipped group); `return_method` (required `pickup | shipping`) on the
  return-request payload. Validation mirrors the address-field limits
  already used for `DeliveryAddress`.
- New `crates/service/src/handlers/pickup.rs`: details set (seller-only,
  seal, version bump, paid-buyer notifications), details clear (retention
  rule of §3: hard-delete unreferenced versions, keep and later purge the
  pinned ones), schedule propose/confirm, mark-ready/confirm-pickup, both
  reveal reads with their entitlement checks (`receipt_id IS NOT NULL` for
  the buyer read).
- `handlers/returns.rs`: `return.request` gains the required
  `return_method`; `return.approve` on a pickup-method return creates the
  hand-back `pickup_schedule` aggregate; `return.provide_label` (upload or
  URL; Shippo later) and `return.provide_address` (sealed, single-return)
  for shipping returns; the buyer-only return-address reveal read, with the
  same no-store / service-worker-exclusion / redaction rules as the pickup
  reveal.
- `handlers/checkout.rs`: group physical lines by `(seller, fulfillment,
  pickup_location)` (digital lines stay outside the split key, §2); refuse
  disallowed choices with typed errors — never fall back to shipping;
  reject a pickup-only checkout that presents a `delivery_address` with
  `INVALID_COMMAND`; zero shipping on pickup orders; store address only on
  shipped orders.
- `handlers/cancellation.rs`: `order.cancel_request` stays buyer-only (the
  actor check at line 56); the allowed-from list (line 61, today
  `pending_payment` | `paid` | `processing`) gains `ready_for_pickup`. New
  unilateral path: from `paid` or `ready_for_pickup`, when a post-payment
  pickup-terms change exists (any line's current details version >
  `version_at_payment`, or the details were cleared), the request
  transitions the order straight to `cancelled` — no seller approval — and
  notifies the seller (`order_cancelled`); otherwise it yields
  `cancel_requested` as today. The refund remains seller-recorded external
  evidence (`refund.record_external`, ADR-0019) either way.
- `workers.rs`: on payment confirmation, create the `pickup_schedule`
  aggregate and record `version_at_payment` per line; reminder sweep at
  slot−24 h/−1 h (in-app pull only); `proposal_expiry` sweep; the
  details-changed propagation that notifies paid buyers and resets
  `confirmed` schedules to `awaiting_proposal`; the retention purge of
  pinned details versions once their referencing orders go terminal — all
  server-time, deduplicated through the existing outbox. There is no
  unattended-slot sweep: an elapsed slot changes nothing (§7).
- `model.rs`: `PickupDetailsRow` (no plaintext serialization path — only the
  two entitled reads open the seal), `PickupScheduleRow`, order line
  extension.
- Encryption: extract the seal/open helpers from `locks.rs` into a shared
  module; add `PICKUP_DETAILS_ENCRYPTION_KEY` with the same
  key-distinctness check. All-or-none config gating, binding: pickup is OFF
  unless `PICKUP_DETAILS_ENCRYPTION_KEY` is configured — the service refuses
  `pickup_details.set` without it and refuses to start if sealed rows exist
  without a key; details are never stored plaintext. Independently,
  `pickup_details.set` is refused whenever the payment adapter is sandbox —
  staging testing uses fake spots in durable mode only (§10). The public
  config/health surface reports `pickup_available` (key configured AND
  adapter not sandbox) so clients can hide the pickup option (§8, §10.2).
- Redaction: the details types get a redacted `Debug` impl and the two
  entitled responses are excluded from request/response-body logging and
  tracing (the `locks.rs` pattern), so the decrypted reveal cannot reach
  logs, traces, or Sentry (§1).
- Notifications: new types `pickup_slot_proposed`, `pickup_slot_confirmed`,
  `pickup_reminder`, `pickup_details_updated`, `pickup_details_cleared`,
  `pickup_ready`.

Service tests:

- unpaid buyer reveal → typed refusal; paid buyer → full per-line details;
  buyer reveal on an order cancelled from `pending_payment` → typed refusal
  (`receipt_id` is null — no durable payment fact was ever recorded);
  cancelled-after-payment buyer reveal still serves the pinned details;
- seller reveal read → own details; other seller → unauthorized;
- projection replay contains no details fields (shape assertion);
- redaction scan, mirroring the `locks.rs` test: no serialization surface
  (command results, projections, notifications, logs) contains plaintext
  details or return addresses, and the redacted `Debug` impls hold;
- mixed cart splits per (seller, fulfillment, pickup_location) with digital
  lines outside the split key and the backfill; two pickup spots for one
  seller produce two pickup orders; shipping charged only on shipped orders;
  pickup-only checkout sends and stores no address; pickup-only checkout
  presenting a `delivery_address` → `INVALID_COMMAND`;
- details edit after payment bumps version, notifies exactly the paid
  buyers, and resets `confirmed` schedules to `awaiting_proposal`;
- unilateral cancel: with a post-payment version bump (or a clear),
  `order.cancel_request` from `paid`/`ready_for_pickup` → `cancelled`
  immediately, seller notified; without a terms change the same command →
  `cancel_requested`; a non-buyer actor is rejected either way;
- `pickup_details.clear`: unreferenced versions hard-deleted; versions
  pinned by paid, non-terminal orders retained and served
  pinned-and-flagged-withdrawn on the buyer reveal; retained versions purged
  once the referencing orders go terminal; owner read returns none;
- propose outside windows refused; propose inside accepted; only the
  non-proposer confirms; the seventh proposal is refused with a typed error
  naming the cap; propose on an order with no schedule refused; 72 h
  proposal expiry; reminders deduplicated;
- `confirm_pickup` by buyer and by seller, from `paid` and from
  `ready_for_pickup`, all succeed; an elapsed slot changes nothing — no
  transition, no flag;
- returns: `return.request` without `return_method` → typed refusal; a
  pickup-method return spawns the hand-back schedule on `return.approve`;
  `return.provide_label` stores the upload/URL; `return.provide_address` is
  sealed, revealed buyer-only with `Cache-Control: no-store`, and unreadable
  by anyone else;
- `listing.sync` never alters details; `pickup_details.set` with stale
  `expected_version` conflicts;
- 100 concurrent proposes produce one current proposal; command replay
  idempotent;
- sealed round-trip with wrong key / wrong AAD fails; distinct-key check
  enforced; key absent → `pickup_details.set` refused, startup refused when
  sealed rows exist, and `pickup_available` reports off; sandbox adapter →
  `pickup_details.set` refused and `pickup_available` reports off.

### 10.2 Client sketch

- Capability: when the service's config/health surface reports
  `pickup_available` off, the pickup option is hidden everywhere — sell
  studio, listing form, checkout selector (§8). The sell studio copy says
  why when a seller asks: pickup details cannot be saved while the service
  runs without pickup encryption configured or in sandbox mode ("Pickup is
  unavailable in this environment").
- Sell studio: pickup section per listing — method toggle
  (`fulfillmentMethods`), spot-first details form, availability editor
  (windows or arrange-after-payment), optional coarse area, and a delete
  affordance (`pickup_details.clear`) that warns what paid buyers keep
  (§3). `react-hook-form` + `zod` with a sibling `*.types.ts`, per the
  forms convention; submission wrapped in a hook (`usePickupDetailsForm`)
  calling the controller.
- Checkout: per-seller-group fulfillment selector with the shipping line
  dropping to 0 on pickup; address form hidden when every group is pickup;
  explicit "places N orders" copy for mixed carts, counting separate pickup
  locations as separate orders.
- Orders: buyer pickup panel (details after payment, version-change and
  withdrawn-by-seller notices, unilateral-cancel affordance shown only when
  the service flags a post-payment terms change), scheduling UI
  (propose/confirm/counter, slot shown in pickup-zone and viewer-local
  time) with the reminders copy "Reminders appear here when you open the
  app; there are no push notifications", seller ready/hand-off actions —
  both parties get the confirm-hand-off action — notifications rendering
  for the new types. Packing-slip affordance suppressed on pickup orders.
- Returns: the return request opens with a method chooser (`pickup` |
  `shipping`); a pickup return reuses the scheduling UI for the hand-back;
  a shipping return shows the seller's label (link/upload) when provided,
  otherwise the seller's single-return address through the buyer-only
  reveal panel.
- Dexie cache + self-heal: owner-read populates cache; stale-marked on read
  failure; save blocked over an unread row; sync paths never write details.
- Wire casing: new payloads through the existing casing layer.
- VRT: order detail and sell-studio surfaces change; regenerate the
  affected baselines and add coverage for the pickup panel and scheduling
  states.

Client tests:

- capability off → pickup hidden in sell studio, listing form, and checkout;
  sandbox/unavailable copy renders in the sell studio;
- checkout groups get independent choices; mixed cart submits one command
  and surfaces the N-orders copy (separate pickup spots counted);
  pickup zeroes the shipping line;
- pickup-only checkout renders no address form and sends no address;
- reveal panel renders only when the reveal read succeeds (the service
  gates on the durable payment fact, not the projection state); version
  notice and withdrawn notice appear when the service reports them;
  unilateral-cancel affordance appears only on a flagged terms change;
- scheduling: propose/confirm/counter flows; dual-timezone slot rendering;
  reminder notifications render with the in-app-only copy;
- returns: method chooser is required; pickup return runs the scheduling
  flow; label link renders when provided; return-address reveal panel
  renders buyer-only;
- sell studio recovers details on a fresh profile (mocked owner read);
  stale-cache save is blocked; delete affordance issues
  `pickup_details.clear`;
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
