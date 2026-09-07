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
| Mixed carts silently fall back to shipping (`?? 'shipping'`) | One order per (seller, fulfillment, pickup location), via a deterministic `location_key`; the buyer's choice is never overridden (§2) |
| Reveal reads only the first line                             | Reveal is per order line, every line of the order (§3)                                            |
| Details ride `listing.register`, which `listing.sync` converges | Details are a separate service aggregate written only by `pickup_details.set`/`pickup_details.clear`; sync carries no details and cannot null them (§1, §5) |
| Reveal copies details onto the cached order projection       | Dedicated reveal read; the projection never carries details (§3)                                  |
| No DB version bump                                           | Postgres migration + Dexie schema bump are both in the plan (§10)                                 |
| No durable-service counterpart                               | Full service design: commands, state machines, sealed storage, reveal entitlement (§1, §7, §8)    |

## 1. Data model

| Data                                                            | Lives                                                                                          | Who can read it                                                        |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| Listing `fulfillmentMethods` (`shipping` \| `pickup` \| both)   | Owner-signed listing record; echoed to the service at `listing.register`/`listing.sync`        | Public, like the rest of the listing                                   |
| Optional coarse pickup area (city/neighborhood, free text, capped at 80 characters) | Owner-signed listing record                                              | Public — the seller's own choice to publish an **approximate** area; never the meeting point. The editor warns that this text is public, signed, and indexable **forever** (slice 7.2) |
| Seller pickup details (address **or** spot, instructions, availability) | Transaction service, `listing_pickup_details` table, **sealed** (below)                 | The seller (owner read) and the paying buyer (reveal read, §3). Nobody else |
| Buyer delivery address (shipped orders)                         | Transaction service `orders.delivery_address` — unchanged                                      | Nobody through reads, per ADR-0019 §8                                  |
| Device copies of any of the above                               | Seller's own details: account-scoped Dexie, this device only. **Buyer's revealed address: memory only — never persisted to Dexie or any storage**, fetched from the reveal read on each view (slice 7.2) | This browser profile; a read-through cache, never a source of truth    |

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

**Key rotation is supported, not deferred.** The env config accepts an
optional previous key (`PICKUP_DETAILS_ENCRYPTION_KEY_PREVIOUS`): opens try
the current key, then the previous one (a dual-key read window), and a
re-seal job walks rows still sealed under the previous key and re-seals them
under the current one, in batches, on server time. Rotation is therefore:
deploy with both keys, run the re-seal job to completion, remove the
previous key. A row's key vintage needs no marker column — the open simply
tries current-then-previous, and the re-seal job's progress is observable
by count. Deleted-version ciphertext also lives in DB backups and replicas
until those rotate (§3 retention); sealing bounds, but does not erase, that
lifetime.

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
redaction-scanning test mirrors the one in `locks.rs` (slice 7.1).

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

**Mixed carts: one order per (seller, fulfillment, pickup location).** The
service already splits a checkout into one order per seller
(`handlers/checkout.rs` groups lines by seller). The split key becomes
`(seller, fulfillment, location_key)`, where `location_key` is a
**deterministic, non-secret lookup token** for the line's listing pickup
details: HMAC-SHA256 over the canonical location plaintext (normalized
kind + address-or-spot fields), keyed by a server-held lookup key — the
same lookup-HMAC pattern `locks.rs` uses for bundle-id lookups. Sealed
ciphertext can never be compared for equality (fresh nonce per seal), so
the HMAC token is what lets the service group lines: two lines whose
listings publish the **identical** spot share one `location_key` and one
order; two different spots split. The token is stored on the order line,
is not the plaintext, and reveals nothing about it. All shipped lines
share one null location. One order therefore has exactly one meeting
point and exactly one agreed slot (§4): a schedule, a reveal, and a
reminder set never span two places. A cart with seller A shipping +
pickup at two different spots and seller B shipping produces four orders. There is no silent fallback: a
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
`(seller, fulfillment, location_key)` split key (their orders keep
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
- Per order line: the response serves the **pinned snapshot** recorded at
  payment (below) — kind, address-or-spot, instructions, **availability
  windows and their IANA zone** (the buyer cannot propose a slot against
  windows they cannot see, §4) — plus `version` and `updated_at`. After a
  `pickup_details.clear`, the pinned snapshot is served flagged
  withdrawn-by-seller. The reveal **never serves the listing's current
  details**: a paid buyer is entitled to the terms they paid against, not
  to whatever the seller publishes later. Every line is served, fixing
  the prior art's first-line-only read.
- **The entitlement ends.** The reveal read stops once the order is
  terminal **and** its return window is closed (the auto-complete deadline
  passed with no open return, or the return is finished): a buyer of a
  long-terminal order has no remaining need, and holding the entitlement
  open forever would leak every future version. After that point the read
  is a typed refusal and the pinned snapshot is purged with the retained
  versions (retention below).
- **Pinning happens inside `confirm_order`, in the receipt transaction.**
  The exactly-once confirmation function (`handlers/payment.rs`
  `confirm_order`, shared by `payment.sandbox_advance` and the
  verification worker) records, per pickup line, the details version
  (`version_at_payment`) **and a sealed snapshot of the details as shown
  at payment** — kind, address-or-spot, instructions, availability windows
  with their IANA zone — and creates the order's `pickup_schedule`
  aggregate in `awaiting_proposal`, all in the same transaction as the
  receipt insert. Because both confirmation paths call this one function,
  sandbox confirmations pin exactly like worker-confirmed payments — no
  worker-side afterthought that a sandbox advance would skip (slice 7.1). The
  pin drives the version-change flag, the buyer's unilateral-cancel
  unlock and bounded withdrawal (§7), the return hand-back location (§7),
  and later dispute reading. An absent `version_at_payment` JSON key on a
  line reads as "no terms version pinned" (pre-migration rows).

**Seller edits after payment.** `pickup_details.set` always bumps the
version (append-only history; retention below). Versions are **monotonic
per listing and never restart**: a per-listing version counter lives on
the listing's details row and survives `pickup_details.clear`, so a
clear-then-set continues the sequence and no version number is ever
reused — terms-change detection (`current version > version_at_payment`)
therefore cannot be fooled by a delete-and-recreate. For every paid,
non-terminal pickup order on that listing, the outbox carries a
`pickup_details_updated` notification to the buyer, and the order view
flags "meeting point updated since you ordered" when current version >
`version_at_payment` (the reveal itself keeps serving the pinned
snapshot). Editing is
always allowed — a seller who moves house cannot be blocked — but it is
never silent, and it is never free: every edit after payment resets any
confirmed slot on those orders back to `awaiting_proposal` (§7 schedule
machine), a seller-actor `fulfillment.confirm_pickup` is refused while
the change is unresolved (§7), and the edit unlocks the buyer's
unilateral cancel — `order.cancel_request` moves the order straight to
`cancelled`, no seller approval, while the pickup terms changed after
payment (current version > `version_at_payment`, or the details were
cleared). The seller is notified; the refund remains seller-recorded
external evidence per ADR-0019.

**Buyer withdrawal after the first reveal.** Independently of any seller
edit, the buyer holds a **bounded withdrawal right**: from `paid`,
`order.cancel_request` moves the order straight to `cancelled` — no
seller approval — until the seller marks the order ready
(`fulfillment.mark_ready`) or either party confirms handover
(`fulfillment.confirm_pickup`), whichever comes first. The exit
therefore never depends on the seller editing or approving anything: a
buyer who reveals the meeting point and finds it unusable-as-revealed
(even with `current version == version_at_payment`) can leave. Both
unilateral exits emit a distinct event kind,
`order.cancelled_terms_change`, **not** `order.cancelled`, and the
reputation worker's `terminated_badly` window excludes it (§9,
slice 7.1): a buyer can never ding the seller's completion rate by
exercising a buyer-protection exit. Cancelling moves no money — the
client copy says so (slice 7.2); the refund stays seller-recorded external
evidence (`refund.record_external`, ADR-0019).

**Seller deletes the details.** `pickup_details.clear` removes the seller's
pickup details entirely (§8). Retention keeps only the versions referenced
as `version_at_payment` by a paid, non-terminal order **or by an order with
an open return window** (a pickup-method return still needs the hand-back
meeting point, §7); every other version is hard-deleted. The per-listing
version counter is **not** deleted (above — versions never restart). The
read path for a buyer whose order references a retained version: the
reveal endpoint keeps working and serves the pinned snapshot, flagged as
withdrawn-by-seller, in place of the current details (there are none).
Once every referencing order is terminal **and** its return window is
closed, the retained versions and snapshots are purged — hard-deleted;
their ciphertext persists only inside DB backups and replicas until those
rotate (§1). Clearing notifies the paid buyers
(`pickup_details_cleared`), resets confirmed slots like an edit, and
unlocks the same unilateral cancel. The seller's owner read after a clear
returns "no details".

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
| `paid`            | `cancelled`        | command `order.cancel_request` (bounded post-reveal withdrawal, §3 — before `mark_ready` or handover confirm) | buyer, unilateral |

`fulfillment.ship` is refused for pickup orders and `mark_ready`/`confirm_pickup`
for shipped ones (`InvalidState`, typed). `confirm_pickup` is allowed for
**either party** — the buyer or the seller, whoever is standing there with
the item taps confirm — from `paid` as well as `ready_for_pickup`, so a
seller who never taps `mark_ready` cannot strand a paid order. One
asymmetry is binding: a **seller-actor** `fulfillment.confirm_pickup` is
refused (`InvalidState`, typed) while an unresolved post-payment terms
change exists on the order (current version > `version_at_payment`, or the
details were cleared, §3); a buyer-actor confirm stays allowed. Without
this, a seller could edit the meeting point and immediately self-confirm
the handover, deleting the buyer's unilateral-cancel exit before the buyer
ever saw the change. There is no proof either way; the he-said/she-said
limitation is stated in §9.

**`confirm_pickup` writes a handover record.** The record carries who
confirmed and the **server instant** of the confirmation, and the order
event kind stays `fulfillment.delivered` — the same kind a shipped order's
`fulfillment.confirm_delivery` emits — so reputation and feed consumers see
one delivery fact. The auto-complete sweep
(`complete_due_delivered_orders_batch`, which today reads
`shipment->>'delivered_at'` and would warn-and-skip a pickup order
forever) **coalesces the two sources**: the handover record's server
instant for pickup orders, the shipment `delivered_at` for shipped ones.
Auto-complete therefore applies to pickup orders exactly as to shipped
ones: a delivered pickup order with no return completes on the same
deadline, and `fulfillment.delivered`-based reputation counts it.

`order.cancel_request` stays buyer-only (`cancellation.rs` rejects any
non-buyer actor), and its allowed-from list gains `ready_for_pickup`
(slice 7.1). The unilateral rows fire only while a post-payment
pickup-terms change exists (version bump or clear, §3) or, from `paid`
only, while the bounded withdrawal window is open (neither
`fulfillment.mark_ready` nor a handover confirm has happened yet, §3);
outside those conditions, the same command from
`paid`/`ready_for_pickup` yields `cancel_requested` awaiting the
seller, as today.

**Unattended slots: hold, never assume.** There is no automatic delivery
assumption from an elapsed slot — no `delivery_assume`-style server
transition and no assumption flag of any kind. When an agreed slot passes
with no confirmation, the order simply holds in `ready_for_pickup`; the
peers re-propose or use cancel/return. The UI may prompt either party to
confirm or report a no-show, but the service records nothing on its own.

`next_actor()` keeps its `Option<&'static str>` shape and its
`'buyer' | 'seller'` value set — no `'either'`: clients and tests assert on
those two literals. For a pickup order in `paid` or `ready_for_pickup` the
rule is: `'buyer'` when a schedule proposal is awaited from the buyer (the
schedule sits in `awaiting_proposal`, or the current proposal is the
seller's and only the buyer may confirm it), otherwise `'seller'` (the
seller's move: propose, mark ready, or confirm the buyer's proposal).
Shipped orders keep today's mapping unchanged. From `delivered` the
existing transitions (return, complete) apply as-is.

**Contract shape.** The order aggregate's `states` gains
`ready_for_pickup` and its `transitions` gain the rows above.
`pickup_schedule` is declared as a new aggregate with its command
transitions (`pickup_schedule.propose`, `pickup_schedule.confirm`,
`fulfillment.confirm_pickup`) and
`unreachable_states: []` — the
`unreachable_states_are_exactly_the_untargeted_non_initial_states` rule
requires every non-initial state to be targeted, and the table below
targets all of them. The Actor column in these tables is documentation
only: the contract format has no actor field; actors are enforced in the
handlers (slice 7.1).

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
| `awaiting_proposal` | `completed`         | command `fulfillment.confirm_pickup`   | buyer or seller  |
| `proposed`          | `completed`         | command `fulfillment.confirm_pickup`   | buyer or seller  |
| `expired`           | `completed`         | command `fulfillment.confirm_pickup`   | buyer or seller  |
| `confirmed`         | `awaiting_proposal` | server `pickup_details_changed` (post-payment edit or clear, §3) | server |
| `awaiting_proposal` | `cancelled`         | server `order_cancelled` (propagation) | server           |
| `proposed`          | `cancelled`         | server `order_cancelled` (propagation) | server           |
| `expired`           | `cancelled`         | server `order_cancelled` (propagation) | server           |
| `confirmed`         | `cancelled`         | server `order_cancelled` (propagation) | server           |

`completed` and `cancelled` are terminal. Only `confirm_pickup` completes a
schedule; nothing auto-completes, and an elapsed slot changes nothing. The
handover confirm completes the schedule from **any** non-terminal
schedule state — including `awaiting_proposal`, `proposed`, and `expired` —
because the peers may have arranged the slot offline and simply met; the
order machine's `paid`/`ready_for_pickup` → `delivered` edge cannot be
allowed to strand its schedule aggregate in a non-terminal state. A
post-payment details edit or clear on the order's listing propagates a
reset: a `confirmed` schedule returns to `awaiting_proposal` and the buyer
is notified (§3). The schedule never drives money:
it informs reminders and displays; funds stay governed by the order machine.

### Returns on a pickup order

The existing return states (`return_requested` → `return_approved` →
`return_received` → `refunded_external`) apply to a pickup order unchanged —
but the return method is chosen anew: receiving by pickup does not imply
returning by pickup, and the buyer holds no postal address for the seller.
`return.request` carries a requested `return_method: pickup | shipping`,
which the seller sees when approving. **The seller decides at
`return.approve`, and must supply the means there** — there is no
stalemate state: the seller either accepts the buyer's requested method or
counters with the other one, and the approve command is refused
(`INVALID_COMMAND`, typed) unless it carries that method's means — a
label, an address, or a hand-back schedule — so an approved return always
has a next step and never sits in `return_approved` with nothing to do:

- **Pickup hand-back.** On `return.approve` with method `pickup`, the
  service creates a second `pickup_schedule` aggregate for the return (one
  per return, keyed to it) in `awaiting_proposal`, and the same
  propose/confirm flow (§4) runs for the hand-back. `return.receive` then
  marks the item back with the seller, as today. The hand-back location is
  the order's **pinned snapshot** (§3 — retained precisely because the
  return window is open) unless the seller supplies a fresh return address
  at approve time (sealed, single-return, same reveal rules as below).
  `return_method: pickup` is **refused with a typed error when no details
  exist** — no pinned snapshot on the order (a shipped order, or a
  pre-migration row) and no fresh address supplied at approve — so a
  pickup hand-back can never be agreed against a nonexistent place.
- **Shipping.** Two variants, by agreement at approve time:
  - The seller supplies a shipping label — an upload or a URL today, a
    Shippo purchase later — via `return.provide_label`, when both agree;
    the buyer posts the item with it. A label **URL** is rendered
    client-side behind the threat model's unsafe-link warning (MSG-03)
    and validated server-side against a carrier-domain allowlist, so a
    "label" cannot be an arbitrary phishing link or an identity-leaking
    tracking page on an unknown domain.
  - Otherwise the buyer ships at their own cost to an address the seller
    provides for that return only, via `return.provide_address`. The
    address is sealed like pickup details (§1), seller-chosen, scoped to
    that one return, and revealed buyer-only through a dedicated read
    with the same rules as the pickup reveal (§3: entitlement re-checked
    on every read, `Cache-Control: no-store`, service-worker exclusion,
    redacted from logs; route and entitlement in §8). It is not the
    listing's pickup details and is never reused. `return.provide_address`
    may be **re-issued** while the return is open: the new address
    supersedes the old (the old sealed row is hard-deleted), and the
    buyer is re-notified — a seller who gave a stale address is not
    locked into it. Once the return finishes (`refunded_external`), the
    read is a typed refusal and the sealed address is purged.

## 8. Commands and roles

All commands use the existing versioned envelope with `command_id`
idempotency and `expected_revision`/`expected_version` CAS. Authorization is
object-level, as today.

| Command                       | Role                                   | Effect                                                              |
| ----------------------------- | -------------------------------------- | ------------------------------------------------------------------- |
| `pickup_details.set`          | Seller, own listing only               | Sealed upsert of details + availability; version + 1 (monotonic per listing, §3); notifies paid buyers on change; refused when pickup is off (no key, or sandbox payments enabled on the deployment, slice 7.1) |
| `pickup_details.clear`        | Seller, own listing only               | Deletes the details; retains only versions referenced by a paid, non-terminal order or an open return window; everything else hard-deleted; notifies paid buyers (§3) |
| `checkout.create` (extended)  | Buyer                                  | Per-line `fulfillment`; splits per (seller, fulfillment, location_key); optional `delivery_address` |
| `pickup_schedule.propose`     | Order participant (buyer first, then either, never twice in a row by the same party) | Proposes/counters a slot; server-time validated against windows; capped at 6 per order (§4); refused on orders with no schedule |
| `pickup_schedule.confirm`     | Order participant, non-proposer only   | Fixes the agreed slot onto the order                                |
| `fulfillment.mark_ready`      | Seller, own order, state `paid`        | Order → `ready_for_pickup`; notifies buyer                          |
| `fulfillment.confirm_pickup`  | Buyer **or** seller, own order, state `paid` or `ready_for_pickup`; seller-actor refused while a post-payment terms change is unresolved (§7) | Order → `delivered`; writes the handover record (server instant); schedule → `completed` from any non-terminal schedule state |
| `return.request` (extended)   | Buyer, own order                       | Carries a requested `return_method: pickup \| shipping` (§7); `pickup` refused when no details exist |
| `return.approve` (extended)   | Seller, own return                     | Accepts or counters the return method and must supply its means — label, address, or hand-back schedule (§7) |
| `return.provide_label`        | Seller, own return                     | Attaches a shipping label (upload or URL today; Shippo later) for a shipping return; URLs validated against a carrier-domain allowlist (§7) |
| `return.provide_address`      | Seller, own return                     | Sealed, single-return address for a shipping return; revealed buyer-only (§7); re-issuable while the return is open, superseding and re-notifying |

Reads (not commands):

- `GET /v1/orders/{id}/pickup-details` — buyer only; keyed by **order id**
  (`Path<Uuid>`), matching the existing `GET /v1/orders/{id}` route keying.
  The order must carry the durable payment fact (reveal, §3), and the read
  serves the **pinned snapshot** (`version_at_payment`), never the
  listing's current details — pinned-version precedence applies on every
  read, non-terminal or not; once the order is terminal and its return
  window is closed the read is a typed refusal (§3). Refused outright on
  deployments with sandbox payments enabled (slice 7.1).
- `GET /v1/listings/{aggregate_id}/pickup-details` — seller only (owner
  read, §5); keyed by **listing aggregate id**, matching the existing
  `/v1/listings/{aggregate_id}` route keying.
- `GET /v1/returns/{id}/address` — buyer only, keyed by return id; serves
  the sealed single-return address while the return is open (approved and
  not yet `refunded_external`), then refuses and the row is purged (§7).
  Same no-store / service-worker-exclusion / redaction rules as the pickup
  reveal.

The version prefix stays `/v1` deliberately: these are new,
additive routes on the existing versioned API, and a `/v2` prefix exists to
signal breaking changes to routes clients already call — introducing one
here would split the API surface over no incompatibility. The schedule rides
the ordinary order projection (slots are participant facts, not addresses).
The service's public config/health surface reports a `pickup_available`
capability flag — on iff `PICKUP_DETAILS_ENCRYPTION_KEY` is configured
**and** sandbox payments are disabled on the deployment
(`config.sandbox_payments_enabled`, slice 7.1). The client hides the
pickup option everywhere when the flag is off (slice 7.2).

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
| Handover dispute (he-said/she-said) | Either party marks `fulfillment.confirm_pickup`; the other claims otherwise | The service cannot tell who is lying — the handover record carries who confirmed and the server instant, nothing more. There is no escrow and no arbiter: a false confirm by the buyer strands the buyer's own funds, and a false confirm by the seller keeps funds **and** item | None at protocol level — stated plainly as a limitation. The buyer gets a prominent dispute/report affordance on a seller-confirmed handover they dispute, and the review hook copy names the risk before confirm ("Only confirm once the item is in your hands"); reviews and the external-refund evidence trail (ADR-0019) are the recourse |
| Buyer induces a terms change to ding the seller | Buyer cancels via a buyer-protection exit (terms-change or bounded withdrawal, §3) | The exit emits `order.cancelled_terms_change`, a distinct event kind the reputation worker's `terminated_badly` window excludes — the seller's completion rate is untouched | Distinct event kind, excluded at the reputation aggregation (slice 7.1); ordinary `order.cancelled` keeps its existing reputation meaning |
| Real meeting points on a sandbox deployment | Operator runs a deployment with sandbox payments enabled | Refused at the **deployment boundary**: `pickup_details.set` **and** the buyer reveal read are both rejected whenever `config.sandbox_payments_enabled` is on (the executor.rs gate), so no real address can ever be stored against — or revealed under — fake money. The per-order payment `adapter` column is `"sandbox"` for every order at checkout until a rail is chosen, so it cannot be the gate | Refusal at the command handler and the reveal read, plus the `pickup_available` capability flag (§8). Staging runs durable mode against **test rails** (testnet BTC, Stripe test, PayPal sandbox) — real flow, never real money — so fake meeting spots on staging are fine (§10) |
| Return-address reuse or leak | Seller provides an address for one return | Scoped: sealed, single-return, buyer-only reveal read with the same no-store/redaction rules as the pickup reveal; never the listing's pickup details, never reused | Dedicated reveal per return; support/operator projections carry ciphertext only |
| Buyer shares the address onward | Buyer is entitled and malicious | Unpreventable — the buyer must know where to go; same as telling a friend where you're meeting | Reveal only after payment (the seller is paid before the address exists for the buyer); spot-first UX keeps most listings off home addresses; reviews give the seller recourse |
| Operator DB read | Operator runs SQL or exfiltrates a backup | Ciphertext only: XChaCha20-Poly1305, AAD-bound, fresh nonce per seal; key is an env secret distinct from the Locks key | Sealing (§1); operator with env access can still decrypt — acknowledged, bounded by policy's "what the service needs" clause; no operator/support read path exists |
| Second-device seller | Seller signs in elsewhere | Owner read returns their details; recovery works | Service is truth (§5); no sync path can null details; save requires a successful read (CAS version) |
| Cancelled after reveal | Order paid, then cancelled | Buyer retains what they saw; the entitlement honestly reflects that | Reveal happens only after money moved; cancellation post-payment is a real-world dispute handled by cancel/return, not by pretending the address is secret again |
| Slot proposed outside availability | Malicious buyer client | Refused server-side | Window validation on the service clock, never client-side |
| Reminder/notification spoof | Forged outbox intent | Consumers deduplicate by event id; notifications carry no address material | Existing outbox invariants (ADR-0019 §4) |

Two exit guarantees close the loop on post-payment terms changes (§3, §7):

1. **The seller cannot self-confirm away the buyer's exit.** A
   seller-actor `fulfillment.confirm_pickup` is refused while an
   unresolved post-payment terms change exists, so editing the meeting
   point and immediately self-confirming the handover cannot delete the
   buyer's unilateral-cancel window before the buyer has seen the change.
   The buyer's own confirm stays allowed — the buyer may accept the new
   terms by showing up.
2. **The buyer's exit does not depend on the seller editing.** The
   bounded post-reveal withdrawal (`paid` → `cancelled` until the seller
   marks ready or handover is confirmed, whichever first) covers the
   unusable-as-revealed spot where `current version == version_at_payment`
   and no terms-change flag could ever fire. Both exits move no money and
   are reputation-neutral for the seller (the `order.cancelled_terms_change`
   row above).

## 10. Migration plan and implementation sketch

The work ships in three explicit slices, each with its own test list and
gate — no slice merges until its gate is green:

- **Slice 7.0** — the TypeScript prototype engine
  (`services/marketplace/src/transaction-service.ts`, which ADR-0022
  designates the executable specification — see the `state_machines.rs`
  module header) plus its contract tests. Gate: the prototype's extended
  contract tests pass and the prototype emits the same
  `state-machines.json` shape the service will vendor.
- **Slice 7.1** — the Rust service (schema, commands, handlers, workers,
  sealing, reveal reads). Gate: the full service test list below passes,
  including the redaction scan and the contract stability tests.
- **Slice 7.2** — the client (sell studio, checkout, orders, returns,
  Dexie, re-vendored contract artifacts). Gate: the client test list
  below passes, including the contract test against the re-vendored
  artifact, plus regenerated VRT baselines.

### Migration

1. **Prototype engine first** — slice 7.0, below. The prototype gains the
   new semantics before the Rust service, so the executable specification
   exists to diff against.
2. **Service Postgres migration** (new version, applied before code that
   uses it): `listing_pickup_details` (aggregate id, seller, version,
   `details_ciphertext`, append-only versions with the retention rule of §3 —
   on `pickup_details.clear`, hard-delete every version not referenced as
   `version_at_payment` by a paid, non-terminal order **or an order with an
   open return window**, and purge retained versions once their referencing
   orders go terminal and their return windows close); a per-listing
   version counter that survives `pickup_details.clear` (versions are
   monotonic, never reused, §3); per-order-line sealed pinned snapshots
   written at payment (§3); `pickup_schedules`
   (order id or return id, state, proposals, agreed slot, revision);
   `pickup_handovers` (order id, confirming actor, server instant) written
   by `fulfillment.confirm_pickup` (§7); return
   rows gain `return_method`, an optional label (upload reference or URL),
   and an optional sealed single-return address; order lines gain
   `fulfillment`, `location_key` (the deterministic HMAC token, §2), and
   `version_at_payment` (nullable — an absent
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
   today; it is updated to 9 for the new `pickup_schedule` aggregate, and
   the listing machine's `sold → available` edge gains
   `order.cancel_request` in its `via` list (slice 7.1).
4. **Client Dexie**: schema version bump adding the pickup-details cache
   table (account-scoped, sealed-blob-free — it caches the owner's plaintext
   like the address book caches addresses, this device only). The buyer's
   revealed address is **never** persisted — no table, memory only (§1).
5. Rollout: service first (accepts new commands, defaults keep old behavior),
   client second. Deployments with sandbox payments enabled never store or
   reveal pickup details — `pickup_details.set` and the reveal read are
   refused whenever `config.sandbox_payments_enabled` is on (slice 7.1),
   so no real meeting point can be stored against fake money. Staging runs
   durable mode against **test rails** — testnet BTC, Stripe test, PayPal
   sandbox — which exercise the real confirmation flow without real money,
   so fake meeting spots on staging are fine; local dev does the same.

### Slice 7.0 — prototype engine and contract tests

The prototype (`services/marketplace/src/transaction-service.ts`) gains the
new semantics first, as the executable specification. Its contract tests
are extended to cover:

- pickup details withheld until payment confirms, then revealed per line
  from the pinned snapshot;
- a pickup checkout presenting a `deliveryAddress` → `INVALID_COMMAND`
  (and a shipped checkout missing one → `INVALID_COMMAND`, the PR 22 pair);
- mixed-cart split per `(seller, fulfillment, location_key)` with identical
  spots grouping into one order and shipping zeroed on pickup orders;
- proposal cap (6), window validation, and schedule completion from any
  non-terminal schedule state on handover confirm;
- `version_at_payment` pinned per line inside confirmation; unilateral
  buyer cancel after a post-payment terms change, and the bounded
  post-reveal withdrawal before `mark_ready`/handover;
- seller-actor `confirm_pickup` refused while a terms change is
  unresolved; auto-complete of a delivered pickup order from the handover
  instant;
- returns: approve must carry the method's means; `return_method: pickup`
  refused when no details exist.

Gate: the extended prototype contract tests pass, and the prototype's
emitted machine document matches the `state-machines.json` shape the
service will vendor (same aggregates, states, transitions).

### Slice 7.1 — service sketch

- `crates/domain/src/commands.rs`: `SetPickupDetailsPayload` (listing
  aggregate, `expected_version`, details: kind address|spot, fields,
  instructions, availability windows | arrange-after-payment, IANA zone),
  `ClearPickupDetailsPayload`, `ProposePickupSlotPayload`,
  `ConfirmPickupSlotPayload`, `MarkReadyForPickupPayload`,
  `ConfirmPickupPayload`, `ProvideReturnLabelPayload`,
  `ProvideReturnAddressPayload`; `fulfillment` on `CheckoutLine`;
  `delivery_address` optional on `CreateCheckoutPayload` (required iff any
  shipped group); `return_method` (requested `pickup | shipping`) on the
  return-request payload; the return-approve payload gains the method
  decision plus its means (label | address | schedule, §7). Validation
  mirrors the address-field limits already used for `DeliveryAddress`.
- New `crates/service/src/handlers/pickup.rs`: details set (seller-only,
  seal, monotonic version bump via the per-listing counter, paid-buyer
  notifications), details clear (retention rule of §3: hard-delete
  unreferenced versions, keep and later purge the pinned ones; the
  per-listing version counter survives), schedule propose/confirm, and
  both reveal reads with their entitlement checks (`receipt_id IS NOT
  NULL` plus the terminal-and-return-window-closed cutoff for the buyer
  read, §3; pinned snapshot served, never current details).
- `handlers/payment.rs`: `confirm_order` — the one exactly-once writer,
  shared by `payment.sandbox_advance` and the verification worker — gains
  the pickup pinning **in the receipt transaction**: per pickup line,
  record `version_at_payment` and the sealed pinned snapshot (kind,
  address-or-spot, instructions, availability windows with IANA zone),
  and create the order's `pickup_schedule` aggregate in
  `awaiting_proposal`. Sandbox confirmations therefore pin exactly like
  worker-confirmed payments (§3).
- `handlers/fulfillment.rs` (all `fulfillment.*` commands stay here):
  `fulfillment.ship` (allowed from `paid`/`processing` today) and
  `fulfillment.confirm_delivery` gain the fulfillment guard — refused for
  pickup orders, `InvalidState`; `fulfillment.mark_ready` and
  `fulfillment.confirm_pickup` are added here, guarded the other way for
  shipped orders. `confirm_pickup` enforces the seller-actor refusal while
  an unresolved post-payment terms change exists (§7), writes the
  handover record (confirming actor + server instant), emits event kind
  `fulfillment.delivered`, and completes the order's schedule from any
  non-terminal schedule state.
- `handlers/returns.rs`: `return.request` gains the requested
  `return_method`, refused when `pickup` and no details exist (§7);
  `return.approve` accepts or counters the method and is refused unless it
  carries the means — on a pickup-method return it creates the hand-back
  `pickup_schedule` aggregate (location from the pinned snapshot or a
  fresh sealed return address), on a shipping return it carries
  `return.provide_label` (upload or URL, validated against the
  carrier-domain allowlist; Shippo later) or `return.provide_address`
  (sealed, single-return, re-issuable with supersede + re-notify); the
  buyer-only return-address reveal read, with the same no-store /
  service-worker-exclusion / redaction rules as the pickup reveal and a
  typed refusal once the return finishes.
- `handlers/checkout.rs`: group physical lines by `(seller, fulfillment,
  location_key)` — the deterministic HMAC lookup token over the canonical
  location plaintext, the `locks.rs` lookup-HMAC pattern, so identical
  spots group and different spots split (digital lines stay outside the
  split key, §2); refuse
  disallowed choices with typed errors — never fall back to shipping;
  reject a pickup-only checkout that presents a `delivery_address` with
  `INVALID_COMMAND`; zero shipping on pickup orders; store address only on
  shipped orders.
- `handlers/cancellation.rs`: `order.cancel_request` stays buyer-only (the
  existing actor check); the allowed-from list (today
  `pending_payment` | `paid` | `processing`) gains `ready_for_pickup`. New
  unilateral path: from `paid` or `ready_for_pickup`, when a post-payment
  pickup-terms change exists (any line's current details version >
  `version_at_payment`, or the details were cleared) — and from `paid`
  only, while the bounded withdrawal window is open (§3) — the request
  transitions the order straight to `cancelled`, no seller approval, and
  **reuses `approve`'s release path verbatim**: `credit_order_drop` plus
  `release_lines(HeldQuantity::Sold)`, so held-then-sold inventory returns
  to the listing exactly as an approved cancel does today. The event kind
  is the distinct `order.cancelled_terms_change` (not `order.cancelled`),
  and the reputation worker's `terminated_badly` aggregation excludes that
  kind (§9). The listing machine contract is updated to match:
  `sold → available` gains `order.cancel_request` in its `via` list, and
  the `listing_machine_enforces_inventory_flow` test is extended to assert
  it. Otherwise the command yields `cancel_requested` as today. The refund
  remains seller-recorded external evidence (`refund.record_external`,
  ADR-0019) either way.
- `workers.rs`: reminder sweep at slot−24 h/−1 h (in-app pull only);
  `proposal_expiry` sweep; the details-changed propagation that notifies
  paid buyers and resets `confirmed` schedules to `awaiting_proposal`;
  the retention purge of pinned versions and snapshots once referencing
  orders go terminal and return windows close; the key-rotation re-seal
  job (§1) — all server-time, deduplicated through the existing outbox.
  The auto-complete sweep (`complete_due_delivered_orders_batch`)
  coalesces the delivery instant from the handover record (pickup) or
  `shipment->>'delivered_at'` (shipped), so pickup orders auto-complete
  on the same deadline instead of warn-and-skipping every sweep (§7).
  There is no unattended-slot sweep: an elapsed slot changes nothing (§7).
  The version pin and schedule creation are **not** here — they live in
  `confirm_order` (above), the only writer both confirmation paths share.
- Boot-time probe: a named `assert_pickup_sealing_coherent` check runs at
  startup **after migrations** (schema must exist first) and refuses to
  start if sealed pickup-details rows exist without
  `PICKUP_DETAILS_ENCRYPTION_KEY` configured — the pickup counterpart of
  the Locks env all-or-none check, explicit rather than a lazy first-read
  failure.
- `model.rs`: `PickupDetailsRow` (no plaintext serialization path — only
  the two entitled reads open the seal), `PickupScheduleRow`,
  `PickupHandoverRow`, order line extension (`fulfillment`,
  `location_key`, `version_at_payment`). `next_actor()` implements the
  pickup rule of §7 (buyer when a proposal is awaited from the buyer,
  else seller; `'buyer' | 'seller'` only).
- Encryption: extract the seal/open helpers from `locks.rs` into a shared
  module; add `PICKUP_DETAILS_ENCRYPTION_KEY` (plus the optional
  `PICKUP_DETAILS_ENCRYPTION_KEY_PREVIOUS` dual-key read window and
  re-seal job, §1) with the same key-distinctness check. All-or-none
  config gating, binding: pickup is OFF unless
  `PICKUP_DETAILS_ENCRYPTION_KEY` is configured — the service refuses
  `pickup_details.set` without it and refuses to start via the boot probe
  above; details are never stored plaintext. Independently, both
  `pickup_details.set` **and the buyer reveal read** are refused whenever
  `config.sandbox_payments_enabled` is on — the deployment boundary
  (executor.rs), not the per-order adapter column, which reads `sandbox`
  for every order at checkout until a rail is chosen. Staging uses test
  rails (§10 rollout). The public config/health surface reports
  `pickup_available` (key configured AND sandbox payments disabled) so
  clients can hide the pickup option (§8, slice 7.2).
- Redaction: the details types get a redacted `Debug` impl and the two
  entitled responses are excluded from request/response-body logging and
  tracing (the `locks.rs` pattern), so the decrypted reveal cannot reach
  logs, traces, or Sentry (§1).
- Notifications: new types `pickup_slot_proposed`, `pickup_slot_confirmed`,
  `pickup_reminder`, `pickup_details_updated`, `pickup_details_cleared`,
  `pickup_ready`.

Service tests (slice 7.1 gate — all must pass):

- unpaid buyer reveal → typed refusal; paid buyer → the pinned snapshot per
  line (never current details, even after later edits);
  buyer reveal on an order cancelled from `pending_payment` → typed refusal
  (`receipt_id` is null — no durable payment fact was ever recorded);
  cancelled-after-payment buyer reveal still serves the pinned details;
  terminal order with a closed return window → typed refusal (the
  entitlement ends, §3);
- seller reveal read → own details; other seller → unauthorized;
- projection replay contains no details fields (shape assertion);
- redaction scan, mirroring the `locks.rs` test: no serialization surface
  (command results, projections, notifications, logs) contains plaintext
  details or return addresses, and the redacted `Debug` impls hold;
- mixed cart splits per (seller, fulfillment, location_key) with digital
  lines outside the split key and the backfill; two listings publishing
  the identical spot share one order; two different spots for one seller
  produce two pickup orders; shipping charged only on shipped orders;
  pickup-only checkout sends and stores no address; pickup-only checkout
  presenting a `delivery_address` → `INVALID_COMMAND`;
- pinning: both confirmation paths (`payment.sandbox_advance` and the
  verification worker) pin `version_at_payment` + snapshot and create the
  schedule in the receipt transaction; the snapshot survives later edits
  and clears;
- versions are monotonic per listing across clear: clear-then-set
  continues the sequence, and terms-change detection still fires against
  a pre-clear `version_at_payment`;
- details edit after payment bumps version, notifies exactly the paid
  buyers, and resets `confirmed` schedules to `awaiting_proposal`;
- unilateral cancel: with a post-payment version bump (or a clear),
  `order.cancel_request` from `paid`/`ready_for_pickup` → `cancelled`
  immediately, seller notified, event kind `order.cancelled_terms_change`,
  and inventory released via the same path as an approved cancel (drop
  credited, sold lines released, listing back to `available`); bounded
  withdrawal from `paid` with no terms change → `cancelled` the same way,
  and → `cancel_requested` once `mark_ready` or a handover confirm has
  happened; with neither condition the same command → `cancel_requested`;
  a non-buyer actor is rejected in every case;
- `order.cancelled_terms_change` is excluded from the reputation worker's
  `terminated_badly` window; ordinary `order.cancelled` still counts;
- the listing machine contract declares `sold → available` via
  `order.cancel_request` as well as `order.cancel_approve`
  (`listing_machine_enforces_inventory_flow` extended);
- `pickup_details.clear`: unreferenced versions hard-deleted; versions
  pinned by paid, non-terminal orders **or open return windows** retained
  and served pinned-and-flagged-withdrawn on the buyer reveal; retained
  versions purged once the referencing orders go terminal and return
  windows close; owner read returns none;
- propose outside windows refused; propose inside accepted; only the
  non-proposer confirms; the seventh proposal is refused with a typed
  error naming the cap; propose on an order with no schedule refused; 72 h
  proposal expiry; reminders deduplicated;
- `confirm_pickup` by buyer and by seller, from `paid` and from
  `ready_for_pickup`, all succeed; seller-actor `confirm_pickup` with an
  unresolved terms change → typed refusal while buyer-actor succeeds; the
  handover record carries the actor and a server instant; the schedule
  completes from `awaiting_proposal`, `proposed`, and `expired` as well as
  `confirmed`; an elapsed slot changes nothing — no transition, no flag;
- auto-complete: a delivered pickup order completes from the handover
  instant on the same deadline as a shipped order from
  `shipment->>'delivered_at'`; the sweep emits no per-order warnings for
  pickup rows; `fulfillment.delivered`-based reputation counts pickup
  completions;
- `fulfillment.ship` and `fulfillment.confirm_delivery` refused on pickup
  orders; `mark_ready`/`confirm_pickup` refused on shipped orders;
- `next_actor` for pickup orders in `paid`/`ready_for_pickup`: `'buyer'`
  when a proposal is awaited from the buyer, `'seller'` otherwise — never
  any other value;
- returns: `return.approve` without the method's means → typed refusal;
  seller counter of the requested method at approve works; a
  pickup-method return spawns the hand-back schedule on `return.approve`
  with the pinned snapshot as its location; `return_method: pickup` with
  no details → typed refusal; a label URL outside the carrier allowlist →
  typed refusal; `return.provide_address` is sealed, revealed buyer-only
  with `Cache-Control: no-store`, re-issue supersedes and re-notifies, the
  read refuses once the return is `refunded_external`, and the sealed row
  is purged;
- `listing.sync` never alters details; `pickup_details.set` with stale
  `expected_version` conflicts;
- 100 concurrent proposes produce one current proposal; command replay
  idempotent;
- sealed round-trip with wrong key / wrong AAD fails; distinct-key check
  enforced; key absent → `pickup_details.set` refused, the
  `assert_pickup_sealing_coherent` boot probe (run after migrations)
  refuses startup when sealed rows exist, and `pickup_available` reports
  off; dual-key read window opens rows sealed under the previous key and
  the re-seal job re-seals them under the current one;
- sandbox payments enabled (`config.sandbox_payments_enabled`) →
  `pickup_details.set` refused, the buyer reveal read refused, and
  `pickup_available` reports off.

### Slice 7.2 — client sketch

- Contract artifacts: re-vendor `src/libs/commerce/contracts/state-machines.json`
  from the service artifact; add `pickup_schedule` to
  `commerceAggregateMachines` and to the contract test's
  `stateEnumsByAggregate`; add `ready_for_pickup` to the order state enum
  and to the machine's transitions map (every new state needs a key
  there). The existing contract test then covers the new shape unchanged.
- Capability: when the service's config/health surface reports
  `pickup_available` off, the pickup option is hidden everywhere — sell
  studio, listing form, checkout selector (§8). The sell studio copy says
  why when a seller asks: pickup details cannot be saved while the service
  runs without pickup encryption configured or on a sandbox-payments
  deployment ("Pickup is unavailable in this environment").
- Sell studio: pickup section per listing — method toggle
  (`fulfillmentMethods`), spot-first details form, availability editor
  (windows or arrange-after-payment), optional coarse area with the
  80-character cap and the warning that the text is public, signed, and
  indexable **forever** (§1), and a delete
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
  the service flags a post-payment terms change or the bounded withdrawal
  window is open), scheduling UI
  (propose/confirm/counter, slot shown in pickup-zone and viewer-local
  time) with the reminders copy "Reminders appear here when you open the
  app; there are no push notifications", seller ready/hand-off actions —
  both parties get the confirm-hand-off action — notifications rendering
  for the new types. Packing-slip affordance suppressed on pickup orders.
  The confirm-hand-off action carries the review-hook copy "Only confirm
  once the item is in your hands", and a seller-confirmed handover the
  buyer disputes gets a prominent dispute/report affordance (§9).
  `next_actor` renders only `'buyer' | 'seller'` per the §7 rule.
- Cancelling moves no money — required buyer-facing copy: both unilateral
  exits (terms-change and bounded withdrawal) state plainly in the confirm
  dialog that cancelling moves no money and any refund stays between the
  peers as seller-recorded external evidence (`refund.record_external`,
  ADR-0019), e.g. "Cancelling does not move any money. If you already
  paid, the refund is arranged with the seller and recorded as external
  evidence."
- Returns: the return request opens with a method chooser (`pickup` |
  `shipping`); the seller's approve screen accepts or counters the method
  and requires the means (label upload/URL, return address, or hand-back
  schedule) before it can submit; a pickup return reuses the scheduling UI
  for the hand-back; a shipping return shows the seller's label behind the
  MSG-03 unsafe-link warning when it is a URL, otherwise the seller's
  single-return address through the buyer-only reveal panel.
- Telemetry masking (binding): every surface that renders pickup details
  or a return address — the buyer reveal panel, the seller owner-read
  editor, the return-address panel — carries `data-sentry-mask`; Sentry
  Replay keeps `maskAllText`/`maskAllInputs` on these surfaces (the
  shipping.md precedent); the decrypted payload is never logged, sent to
  analytics, or included in error reports.
- Buyer-side caching: the revealed address is held in memory only — never
  persisted to Dexie or any storage (§1) — and fetched from the reveal
  read on each view. The seller's own details keep the Dexie read-through
  cache + self-heal: owner-read populates cache; stale-marked on read
  failure; save blocked over an unread row; sync paths never write details.
- Wire casing: new payloads through the existing casing layer.
- VRT: order detail and sell-studio surfaces change; regenerate the
  affected baselines and add coverage for the pickup panel and scheduling
  states.

Client tests (slice 7.2 gate — all must pass, VRT baselines regenerated):

- contract test passes against the re-vendored `state-machines.json`:
  `pickup_schedule` in `commerceAggregateMachines` and
  `stateEnumsByAggregate`, `ready_for_pickup` in the order enum with its
  transitions-map key;
- capability off → pickup hidden in sell studio, listing form, and checkout;
  sandbox/unavailable copy renders in the sell studio;
- checkout groups get independent choices; mixed cart submits one command
  and surfaces the N-orders copy (separate pickup spots counted);
  pickup zeroes the shipping line;
- pickup-only checkout renders no address form and sends no address;
- reveal panel renders only when the reveal read succeeds (the service
  gates on the durable payment fact, not the projection state); version
  notice and withdrawn notice appear when the service reports them;
  unilateral-cancel affordance appears on a flagged terms change and
  during the bounded withdrawal window, and its dialog carries the
  "cancelling moves no money" copy;
- scheduling: propose/confirm/counter flows; dual-timezone slot rendering;
  reminder notifications render with the in-app-only copy;
- returns: method chooser is required; the approve screen cannot submit
  without the method's means; pickup return runs the scheduling flow;
  label URL renders behind the MSG-03 warning; return-address reveal panel
  renders buyer-only;
- telemetry: reveal panel, owner-read editor, and return-address panel
  carry `data-sentry-mask`, and the revealed payload appears in no log or
  analytics call;
- buyer's revealed address is written to no Dexie table (memory-only
  assertion);
- sell studio recovers details on a fresh profile (mocked owner read);
  stale-cache save is blocked; delete affordance issues
  `pickup_details.clear`; coarse-area editor enforces the cap and renders
  the public-forever warning;
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
