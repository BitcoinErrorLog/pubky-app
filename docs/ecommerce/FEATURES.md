# Marketplace Feature Inventory

Every feature in the Pubky marketplace, organized hierarchically. Honesty
labels follow [`status.md`](status.md) (the authoritative real-vs-simulated
ledger with live-proof records): anything unlabeled is built, tested, and
deployed to the staging stack; **experiment-grade** and **sandbox-only**
mean exactly that.

## 1. Catalog and discovery

- **Browse**
  - Catalog grid and list layouts, served by the deployed marketplace Nexus
    index with a local-first Dexie cache
  - Auction browsing with seller terms on cards (starting bid, buy-now, end
    date) and lazy live-bid reads once a card scrolls into view
  - Hot-marketplace modules and a followed-sellers shelf
- **Search and filters**
  - Text search; filters for category, price, condition, sale format, and
    location
  - Attribute facet chips derived from the taxonomy (size, brand, color, …)
  - Saved searches in a compact popover with per-search NEW badges
- **Category taxonomy (v2)**
  - Hierarchical category tree with category-scoped attribute sets, brand
    lists, size charts, and controlled vocabularies
  - Attributes render on catalog cards and drive browse facets
- **SEO and sharing**
  - Open Graph / Twitter preview images and descriptions for listings,
    shops, profiles, and posts (Satori-rendered, serverless-traced fonts)

## 2. Selling

- **Sell studio**
  - Up to 8 photos: sanitized, metadata-stripped, BLAKE3 content-hashed
  - Title, description, condition (with optional details), adult-content flag
  - Category picker with per-category attribute fields
  - Drafts autosave locally; legacy-draft migration
- **Pricing**
  - USD or Bitcoin pricing; BIP-177 display everywhere (₿ symbol, whole base
    units, never "sats")
  - Indicative fiat/bitcoin conversion display (labeled as indicative)
- **Variants and inventory**
  - Up to three option dimensions per variant with independent SKU,
    quantity, and price override
- **Package and shipping**
  - Unit-aware package dimensions with an inline in/oz ⇄ cm/g toggle
    (loss-free conversion; stored canonically in millimeters and grams;
    device-wide measurement preference also settable in settings)
  - Shipping label, flat cost, delivery estimate range, reusable presets
  - Return policy (window or no-returns)
- **Listing management**
  - Edit, unlist/relist (fixed-price), delete, copy public link
  - Owner panel self-heals transaction-service registration (re-runs on
    session connect)
- **Shop profile**
  - Shop record on the seller's homeserver: name, bio, avatar and banner
    uploads, vacation mode
- **Digital delivery**
  - Locks-guarded content entitlements delivered on completed payment

## 3. Buying and transactions

All transactional invariants are enforced by the durable, event-sourced
transaction service (PostgreSQL, exactly-one-winner concurrency proofs).

- **Cart and checkout**
  - Multi-seller cart with per-asset subtotals; cart entry points (toast
    action, header cart pill with count)
  - Checkout with delivery address book (save, reuse, last-used ordering);
    the address travels only inside the checkout command
  - Variant snapshots ride order lines (packing slip and order rows)
  - Unregistered listings self-heal at read and checkout time via
    service-side `listing.sync` (the service fetches the canonical
    seller-signed record from the homeserver)
- **Offers**
  - Make, counter, accept, reject — revision-guarded
- **Auctions**
  - Bids with reserve prices, minimum increments, anti-sniping extensions;
    scheduled close workers; `auction_won` / `auction_ended` notifications
- **Orders**
  - Full lifecycle: awaiting payment → paid → shipped (carrier + tracking,
    soft carrier vocabulary) → delivered → completed
  - Cancellation request/approve with inventory release
  - Packing slip dialog
- **Post-purchase**
  - Returns, disputes with evidence submission, moderator dispute queue
  - Per-order reviews (see Trust)

## 4. Payments

Three rails, one contract: the same lock and proof-bundle flow settles over
any of them. All three are live-proven on the deployed stack (see the proof
ledger).

- **Bitcoin (Locks + Paykit)**
  - Regtest rails deployed (bitcoind, Fulcrum, Lock Server, Paykit Server)
  - Proof bundle → invoice → on-chain payment → worker confirmation →
    receipt → access credential
  - Real-wallet proof: Bitkit iOS seller watch-only claim AND buyer
    swipe-to-pay confirmed on-chain
  - Payment status UI with fail-closed `locks-paykit` adapter mode
- **Stripe**
  - Hosted Checkout via the fiat-verifier gateway; webhook + poll detection,
    settlement delay, refund/dispute annotation; test-mode key guard
- **PayPal**
  - Orders v2 with capture-on-approval; postback-verified webhooks treated
    as hints with authoritative order pulls; same settlement machine
  - Buyer-side processor choice at checkout when both are configured;
    binding is permanent per purchase
- **Sessions and auth**
  - Marketplace transaction session from a Pubky AuthToken (single-use,
    verified with `pubky-common`), bearer token with 30-day TTL, persisted
    in `localStorage` across tabs and restarts

## 5. Trust and reputation

- **Attested reviews**
  - Per-order reviews attested by the transaction service (JWS, Ed25519,
    salted order refs); 24-hour edit window with `edited_late` flags
  - Portable by construction: review records live on the reviewer's
    homeserver, anchored to Pubky identities, indexable by anyone
- **Verification at ingest**
  - Nexus cryptographically verifies attestations when indexing; unverified
    reviews index labeled, never dropped
- **Reputation surfaces**
  - Aggregates (count, verified count, average, histogram, per-attestor
    breakdown) served by Nexus and embedded in the listing stream
  - Stars on catalog cards, rating headers on shops and listings, paged
    review sections with three-state labeling, explicit new-seller state
  - Seller responses: one revisable response per review, a pure homeserver
    record threaded by Nexus
  - "My reviews" panel with attestation and publication status
- **Moderation**
  - Configuration-defined moderator roles (no hardcoded identities), report
    flows, dispute queue with evidence read surface

## 6. Social

- **Community tags** on listings (Nexus-indexed, separate from seller
  keywords)
- **Collections**: save listings into post collections; collection pages
  hydrate listing cards through the commerce read path
- **Shop follows** and followed-seller discovery
- **Watchlist / favorites**
  - Watch toggles on cards and listing pages (bell for auctions, heart for
    fixed price)
  - **Cross-device private sync** over homeserver-enforced `/priv` storage:
    local-first, per-item last-write-wins with tombstones, coalescing push,
    pull on sign-in; capability-gated with an honest re-approval notice on
    legacy sessions
- **Notifications**
  - Marketplace events (offers, bids, outbid, auction won/ended, orders,
    disputes) in the app's notification UI, with §8-permitted amounts
    rendered in BIP-177 / fiat

## 7. Messaging

- **End-to-end encrypted messaging** (durable modes): Noise XX over Paykit
  Encrypted Links via the vendored WASM binding — marketplace listing
  conversations and general direct messages on one link per counterparty.
  **Experiment grade**; live browser e2e 16/16 across engines
- Receiver markers with messaging-only capability advertisement
- Session persistence across reloads and tabs (secret-free metadata;
  the credential is a browser-held HTTP-only cookie)
- Unencrypted key-snapshot storage is disclosed in the UI (backup-key
  encryption is a deliberate open decision)
- **Sandbox mode**: plaintext transport, labeled as operator-readable at
  every point of use

## 8. Identity and sessions

- **Single Ring grant**: one sign-in approval covers the app's public
  storage, the Paykit messaging tree, and the private watchlist scope —
  immune to the homeserver's one-cookie-per-user session replacement
- Sessions persist across tabs and browser restarts, bounded by service
  TTLs; account-scoped restore validation; sign-out clears everything

## 9. Infrastructure and operations

- **Transaction service** (Rust): event-sourced PostgreSQL with outbox,
  registration drain, auction close, reservation expiry workers; health,
  readiness, metrics; Docker + Railway deploy
- **Marketplace Nexus** (fork): listing/shop/review/tag indexing, reputation
  aggregation, auction-terms backfill migration, replay runbooks, poll
  deadlines against dead homeservers
- **Specs fork** (`pubky-app-specs`): marketplace objects (listing, shop,
  review, response, attestation, private watchlist), entity-ID validation,
  WASM/npm packaging
- **Fiat verifier gateway** (Rust): Stripe + PayPal bridging to Locks,
  fail-closed configuration, live-mode guards
- **Payment rails**: per-service Dockerfiles and Railway entrypoints for
  bitcoind, Fulcrum, Lock Server, Paykit Server; verification driver
- **Testing discipline**: unit suites, visual regression (timezone-frozen
  harness), contract drift tests against the canonical service contract,
  live staging proofs — all recorded with reproduction commands in the
  [proof ledger](status.md)

## Explicitly not included (honest boundaries)

- Real funds anywhere: mainnet is gated on the independent security review
- Seller-direct fiat payouts (Stripe Connect / PayPal Platform): designed,
  not built
- Nexus review backfill migration for pre-deployment history (documented
  requirement for pointing a shared Nexus at old event logs)
- Messaging backup-key encryption (open product decision, disclosed in UI)
