# Pubky Marketplace Implementation Plan

Status: active  
Goal: a working, feature-complete eBay/Depop-class prototype integrated with Paykit and Pubky Locks.

## Definition of complete

The prototype is complete only when:

1. Every capability in the acceptance matrix below has a reachable desktop and mobile flow.
2. Commerce state survives reloads and account changes without leaking data between users.
3. Public marketplace records sync through Pubky homeserver paths and work locally first.
4. A real adapter exercises the Locks → Paykit Server invoice and payment-status flow.
5. A deterministic sandbox adapter exercises every payment, timeout, failure, refund, and dispute branch without real funds.
6. Automated tests cover domain transitions, persistence, adapters, forms, routes, accessibility-critical behavior, and representative visual surfaces.
7. End-to-end walkthroughs cover buyer, seller, bidder, and moderator journeys.
8. The final verification ledger contains no unresolved required finding.
9. Final videos demonstrate all feature groups.

This is a pre-production prototype, not a claim of production eBay parity. Paykit, Locks, and Paykit Server explicitly describe themselves as WIP or pre-production. Paykit discovers and exchanges payment data but does not execute payments. Locks gates resources after proofs; it is not escrow. Paykit Server currently observes BTC payments but cannot spend, refund, issue receipts, or process payer proof events. The UI must label simulated, detected, confirmed, refund-pending, and externally-refunded states accurately.

## Verified upstream constraints

| Dependency            | Verified capability                                                                                                             | Integration consequence                                                                                                                             |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pubky/paykit-rs`     | Public/private payment endpoints, encrypted links, payment requests/proofs, encrypted receipts; Rust plus Swift/Kotlin bindings | No browser binding exists. Web integration must use a service boundary; Bitkit/Pubky Ring can own companion approval and wallet execution.          |
| `pubky/paykit-server` | Signed invoice creation/status routes, Bitkit companion setup, unique BIP84 addresses, confirmation observation                 | Only a trusted Locks service may call business routes. It is receiver-side, BTC-only, single-process, and cannot refund.                            |
| `pubky/locks`         | Lock policies, proof submission, verification polling, entitlement/access credentials, browser JS/WASM SDK, Paykit verifier     | Use for paid digital delivery and proof-backed access, never as custody or general buyer protection.                                                |
| `@synonymdev/pubky`   | Browser Pubky sessions, homeserver storage, public storage, auth URLs                                                           | Reuse current app auth and homeserver service. Existing app grant is `/pub/pubky.app/:rw`; private Locks creator authority remains a separate flow. |
| `pubky-app-specs`     | Posts support a `lock` link                                                                                                     | Marketplace previews may point at a Locks policy without changing post wire format.                                                                 |

Upstream references:

- <https://github.com/pubky/paykit-rs>
- <https://github.com/pubky/paykit-server>
- <https://github.com/pubky/locks>

The requested `pubky/design.md` is not a GitHub repository and no `design.md` file is currently discoverable in the Pubky organization. Until an authoritative file is located, the implementation follows this repository's Shadcn/Tailwind design tokens and component rules.

## Product roles

- Guest: browse, search, filter, inspect sellers, listings, bids, and reviews.
- Buyer: favorite/follow, message, offer, bid, cart, pay, track, cancel, return, dispute, and review.
- Seller: create a shop, list inventory, negotiate, fulfill, refund externally, resolve disputes, and inspect analytics.
- Moderator: review reports, restrict listings/users, record decisions, and audit actions.
- Operator: configure adapters, inspect health, run migrations, and execute the verification suite.

## Acceptance matrix

### Identity, shop, and trust

- Existing Pubky sign-in and recovery continue to work.
- A signed-in user can create and edit shop name, bio, policies, location granularity, vacation mode, and default shipping/return settings.
- Public seller pages show active/sold listings, followers, sales, ratings, response time, and policy summaries.
- Follow/block/report actions are auth-gated and immediately reflected locally.
- Trust indicators distinguish verified facts from self-declared profile fields.

### Listings and inventory

- Sellers can create draft, fixed-price, auction, and digital listings.
- Required fields include title, description, category, condition, price/currency, quantity, location granularity, delivery options, and media.
- Variants/SKUs support independent price, quantity, and status.
- Media can be reordered, captioned, validated, retried, and removed.
- Drafts autosave. Publish, edit, duplicate, pause, reserve, sell, relist, and delete transitions are enforced.
- Quantity cannot become negative; reserved inventory expires or converts atomically.
- Public records carry a schema version and stable `seller:listId` identifier.

### Discovery and social shopping

- Marketplace home exposes recommended, following, new, ending-soon, and category sections.
- Search supports text, seller, category, condition, format, price range, delivery, location, sort, and saved searches.
- Listing grids support pagination, empty/error/loading states, responsive layouts, and deep links.
- Buyers can favorite listings, follow sellers, save searches, and receive relevant notifications.
- Related items and seller inventory are visible without authentication.

### Messaging and negotiation

- Buyer and seller can open a listing-scoped conversation.
- Conversations support text, listing cards, offer cards, system events, unread state, report/block, and retry after send failure.
- Buyers can make, withdraw, accept, reject, and counter offers.
- Sellers can send private offers to watchers.
- Offer expiry, currency, quantity, and inventory reservation are enforced.
- Duplicate events are idempotent and transitions reject stale revisions.

### Auctions

- Sellers set start price, optional reserve, optional buy-now, bid increment policy, start/end times, and anti-sniping extension.
- Buyers see bid count, current price, reserve status, minimum next bid, end time, and their standing.
- Bids reject closed auctions, seller self-bids, invalid increments, stale revisions, and unaffordable sandbox balances.
- Proxy maximum bidding determines the winner and visible price deterministically.
- Buy-now closes the auction when policy allows it.
- Closing creates one winning order or an unsold result exactly once.

### Cart and checkout

- Fixed-price items can be added, edited, removed, and grouped by seller.
- Cart validation refreshes price, stock, delivery availability, and listing state before checkout.
- Checkout captures delivery/contact details without placing raw private data in public records or telemetry.
- Totals itemize subtotal, shipping, discount, tax estimate, and total in one currency per seller order.
- Buyers select an eligible Paykit payment endpoint and explicitly confirm order creation.
- Duplicate checkout submission reuses the same idempotency key and cannot create duplicate orders/invoices.

### Paykit, Locks, and payment confirmation

- Seller payment setup launches the Paykit Server/Bitkit companion approval flow and reports setup state without exposing wallet secrets.
- Checkout can create a Locks proof lifecycle that causes Locks to request a Paykit invoice.
- Desktop shows a QR/copy flow; mobile exposes a wallet deep link.
- Payment status distinguishes awaiting payment, detected/underpaid/overpaid, confirming, confirmed, expired, failed, and manual review.
- Polling is abortable, bounded, resumable after reload, and tolerant of duplicate/reordered responses.
- A confirmed payment advances the order once; later duplicate confirmations are harmless.
- Digital goods use a Locks access credential and verify content hashes.
- Sandbox mode reproduces all statuses deterministically and is visibly labeled.

### Orders and fulfillment

- Buyer and seller order views show a shared timeline with role-appropriate actions.
- Physical orders support address confirmation, handling deadline, shipment, carrier/tracking, delivery, and pickup.
- Digital orders support locked delivery, credential refresh, download/access audit, and content-integrity failure.
- Sellers can print a packing summary and mark ready/shipped.
- Buyers can confirm receipt; deterministic sandbox delivery can advance automatically.
- Cancellation rules depend on payment and fulfillment state and preserve an immutable event history.

### Returns, refunds, and disputes

- Buyers can request a return with reason, notes, and evidence within policy.
- Sellers can approve, reject, offer partial resolution, or request return shipment.
- Return tracking and inspection lead to full, partial, denied, or externally-refunded outcomes.
- Because Paykit Server cannot spend, real refunds are recorded only after seller-provided external transaction evidence; the app never claims it moved funds.
- Buyers can escalate eligible orders to a dispute.
- Both parties can add evidence; moderators can decide, annotate, and close.
- Every transition is role-checked, time-bounded, idempotent, and auditable.

### Reviews and reputation

- Only completed transactions can produce one buyer review and one seller review per role.
- Rating, text, optional media, item accuracy, shipping, and communication dimensions are supported.
- Reviews can be edited during a bounded window, replied to once, and reported.
- Aggregate ratings update deterministically and exclude removed reviews.

### Seller tools and analytics

- Dashboard shows revenue-equivalent totals, paid orders, conversion, views, favorites, offers, sell-through, and fulfillment health.
- Inventory supports search, filters, bulk pause/relist/delete, low-stock state, and CSV export/import preview.
- Order work queues expose awaiting payment, to ship, returns, disputes, and completed states.
- Shop settings cover policies, notifications, payment setup, shipping presets, blocked buyers, and vacation mode.
- Analytics clearly distinguish local prototype estimates from settled payment facts.

### Notifications

- In-app notifications cover listing, favorite/follow, message, offer, bid/outbid/won, payment, shipment, return, dispute, and review events.
- Read/unread, mark-all-read, deep links, deduplication, and per-category preferences work.
- Sensitive order/payment data is not embedded in public notification payloads.

### Trust, safety, and moderation

- Users can report listings, messages, reviews, and accounts with structured reasons and evidence.
- Prohibited-item/category policy warnings are shown during listing creation.
- Moderator queues support assignment, notes, decisions, reversals, and an append-only audit log.
- Restricted listings disappear from discovery but remain visible to authorized parties for disputes.
- Rate limits, size limits, URL safety, file validation, and unsafe-state guards have failure tests.

### Accessibility, responsiveness, and local-first behavior

- Keyboard navigation, visible focus, semantic labels, dialog focus management, status announcements, and contrast pass automated checks plus manual review.
- Core journeys work at 390×844 and desktop widths without hidden actions or horizontal overflow.
- Public reads render cached data offline; writes commit locally first and show pending/synced/failed status.
- Retry queues preserve idempotency and never silently drop a transaction action.
- Sign-out clears private commerce state and adapter credentials for the prior account.

## Architecture

### Bounded contexts

```text
UI / hooks
  -> Marketplace controllers
    -> Listing | Discovery | Negotiation | Checkout | Order | Trust applications
      -> local services -> Dexie models
      -> homeserver services -> Pubky public records
      -> commerce gateway services -> Locks / Paykit adapters
```

Rules:

- UI components call form/action hooks; hooks call controllers.
- Controllers normalize intent, update UI stores, and call one application workflow.
- Applications never access Zustand stores and do not call other applications.
- Services own all IndexedDB, homeserver, HTTP, wallet/deep-link, and clock IO.
- Pipes are pure schema/version normalization.
- Cross-domain invariants are implemented by one owning application using transactional local services, not application-to-application calls.
- Payment and order state machines use explicit transition tables; UI labels never infer settlement from a generic success response.

### Data ownership

Public homeserver paths:

```text
/pub/pubky.app/marketplace/v1/shop.json
/pub/pubky.app/marketplace/v1/listings/{listId}.json
/pub/pubky.app/marketplace/v1/reviews/{reviewId}.json
/pub/pubky.app/marketplace/v1/collections/{collectionId}.json
```

Locks-owned paths follow the upstream Locks protocol:

```text
/pub/locks.app/{lockId}.json
/pub/locks.app/config.json
/priv/locks.app/content/{resource}
/priv/locks.app/proofs/{bundleId}.json
```

Private buyer/seller records remain in Dexie in the first vertical slice. Networked private exchange must use Paykit encrypted links or another reviewed encrypted Pubky protocol before multi-device claims are made. Raw addresses, messages, evidence, access credentials, and payment correlations must never be written to public marketplace paths.

### Local tables

- `commerce_shops`, `commerce_listings`, `commerce_listing_media`, `commerce_inventory`
- `commerce_favorites`, `commerce_saved_searches`, `commerce_conversations`, `commerce_messages`
- `commerce_offers`, `commerce_auctions`, `commerce_bids`, `commerce_carts`
- `commerce_orders`, `commerce_order_events`, `commerce_payments`, `commerce_shipments`
- `commerce_returns`, `commerce_disputes`, `commerce_reviews`, `commerce_reports`
- `commerce_notifications`, `commerce_sync_jobs`, `commerce_audit_events`

Indexes are derived from actual query plans. Schema changes require a database version change, migration/reset decision, and database tests.

### State machines

- Listing: `draft -> active <-> paused -> reserved -> sold|expired|removed`
- Offer: `pending -> countered|accepted|rejected|withdrawn|expired`
- Auction: `scheduled -> active -> sold|unsold|cancelled`
- Payment: `created -> awaiting -> detected -> confirming -> confirmed|expired|failed|manual_review`
- Order: `pending_payment -> paid -> processing -> shipped|ready_for_pickup -> delivered -> completed`
- Exceptional order branches: `cancel_requested`, `cancelled`, `return_requested`, `return_in_transit`, `return_inspection`, `disputed`, `refunded_external`, `closed`

All events include stable ID, aggregate ID, actor, revision, timestamp, idempotency key, and payload schema version.

### Adapter modes

- `sandbox`: deterministic local adapter for complete demos and failure testing; always labeled.
- `locks-paykit`: real Locks HTTP lifecycle backed by Paykit Server.
- `unavailable`: fail closed with setup guidance; never silently fall back during a real checkout.

Runtime configuration will include service URLs, adapter mode, polling/backoff limits, confirmation policy, and public keys. Secrets and trusted signing keys stay server-side.

## Task graph

### T0 — Evidence and protocol audit

- Inventory existing auth, storage, media, notifications, routes, tests, and design primitives.
- Pin upstream revisions and contracts for Paykit, Paykit Server, Locks, Homeserver, Ring/Bitkit, and Docker.
- Resolve or explicitly replace the unavailable `pubky/design.md` source.
- Produce the acceptance-to-test traceability ledger.

### T1 — Architecture and contracts

- Add marketplace ADRs for bounded contexts, public/private protocol, state machines, and adapter trust boundaries.
- Define Zod v4 wire schemas, domain types, IDs, money rules, clocks, and idempotency.
- Threat-model public records, private delivery data, access credentials, payment status, file uploads, reports, and telemetry.

### T2 — Local-first foundation

- Add Dexie schemas/models, database version handling, local services, sync outbox, stores, controllers, and applications.
- Add deterministic fixtures and sandbox clock/payment/carrier adapters.
- Verify account isolation, recovery, conflict handling, replay, and offline behavior.

### T3 — Catalog and discovery

- Build shop/listing forms, media, variants, inventory, lifecycle actions, marketplace routes, cards, grids, search/filter/sort, recommendations, favorites, follows, and saved searches.
- Add public homeserver write/read adapters and preview-post support.

### T4 — Messaging, offers, and auctions

- Build listing-scoped conversations, system events, offers/counters, watcher offers, auction setup, proxy bidding, anti-sniping, close jobs, and notifications.
- Verify concurrent bids, stale revisions, expiry, inventory reservation, and idempotent close.

### T5 — Checkout, Paykit, and Locks

- Build cart, checkout, totals, private delivery capture, order creation, seller payment setup, invoice presentation, polling, recovery, and status UI.
- Integrate Locks proof/credential APIs and Paykit-backed invoice/status lifecycle.
- Add digital delivery and explicit external-refund evidence.

### T6 — Fulfillment and post-purchase

- Build order work queues/timelines, shipping presets/tracking, pickup, digital access, cancellations, returns, partial resolutions, disputes, reviews, and reputation.
- Add moderation queues and immutable audit history.

### T7 — Seller operations

- Build dashboard, analytics, inventory bulk actions, CSV preview/export, policies, payment status, vacation mode, notification settings, and blocked-buyer controls.

### T8 — Hardening and parity audit

- Run unit, integration, component, VRT, E2E, accessibility, responsive, security, migration, offline, retry, and adapter contract suites.
- Compare every acceptance item with authoritative runtime evidence.
- Fix findings and repeat the complete affected verification scope.

### T9 — Documentation and demonstrations

- Document local sandbox, real Docker topology, runtime configuration, wallet approval, operational limitations, recovery, and threat model.
- Record buyer, seller, auction, Paykit/Locks, fulfillment, dispute/moderation, and responsive/accessibility videos.
- Review every video and retain only successful, minimal demonstrations.

## Verification loop

Each implementation task closes only through this loop:

1. **Address** — map requirement IDs to files, tests, commands, routes, and expected runtime evidence.
2. **Verify** — run the narrowest authoritative checks plus impacted broader gates.
3. **Findings** — record failures, missing coverage, indirect evidence, and upstream limitations.
4. **Fix** — change implementation or tests without weakening the requirement.
5. **Re-verify** — rerun the failed check and all affected integration/E2E paths.
6. **Audit** — independently compare current code and artifacts with every mapped requirement.

Ledger format:

| Requirement                                 | Verification address                                    | Expected evidence                                 | Finding | Fix     | Re-verification | Status |
| ------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------- | ------- | ------- | --------------- | ------ |
| Example: payment confirmation is idempotent | payment transition test + checkout E2E + order timeline | one paid transition after duplicate confirmations | Pending | Pending | Pending         | Open   |

Required gates:

```text
npm run typecheck
npm run lint
npm run format:check
npm run test -- <changed suites>
npm run test:vrt
npm run build
npm run test:e2e
Locks/Paykit Docker contract smoke tests
manual desktop and 390x844 walkthroughs
```

Full unit and E2E suites run at milestone boundaries and before completion. External staging failures are separated from product defects only with captured evidence; they do not convert an unverified requirement into a pass.

## Delivery slices

Every slice must remain demonstrable:

1. Marketplace shell + sandbox catalog + listing creation.
2. Discovery + favorites/follows + seller shop.
3. Messaging + offers + auctions.
4. Cart + checkout + sandbox order/payment lifecycle.
5. Real Locks/Paykit adapter + Bitkit/Ring setup.
6. Fulfillment + returns/refunds/disputes/reviews.
7. Seller analytics + moderation + hardening.
8. Full parity audit, documentation, and final videos.

No slice may silently remove already visible Pubky functionality or reduce existing feed/profile behavior.
