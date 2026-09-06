# Shop Changelog

Public changelog for Shop, the Pubky marketplace vibe. Newest changes first.

## 2026-09-05

- [implemented] Shared pubky.app sign-in was added in consumer mode. A signed-in pubky.app user can arrive in Shop without a second sign-in once pubky.app deploys its session bridge; until then Shop's normal Ring sign-in remains the path.
- [implemented] Step-up approval was made explicit for commerce and private scopes. First checkout uses an empty-capability marketplace service token; private storage, receipts, watchlist sync, and messaging ask for the wider homeserver grant only when needed.
- [implemented] Receipt publication under a narrow grant no longer disappears silently. Shop records a visible reconnect state when private receipt storage needs a fresh approval.
- [implemented] Messaging custody was hardened. The receiver Noise secret and link snapshots are wrapped at rest with AES-GCM-256 under a non-extractable device keyring key, with no plaintext fallback on new writes.
- [implemented] Disputes, reports, the moderator role, and tax were removed from Shop. The owner decision is peer-to-peer trade with no operator authority over trades.
- [implemented] The production homeserver stack was stood up separately from staging. The public alias is `https://pubky-marketplace-production.vercel.app` until the `shop.pubky.app` cutover; commerce stays on `locks-paykit` with testnet money.
- [proven live] The production client alias was reachable, the production marketplace service health check returned 200, and production Nexus replay had reached cursor 201,061 of about 213,000 while the owner's first production listing already appeared in `/v0/stream/listings`.
- [known gap] `shop.pubky.app` still pointed at staging in the plan state. Bridged entry from real production pubky.app depends on upstream deployment of the session bridge.
- [known gap] Paykit request signing still uses the shared staging key because the reused Paykit server trusts one marketplace key; the backlog is to support a trusted-key list and rotate.
- [known gap] Production `/priv` durability needs a new production cadence. Staging had passed T+1h and T+25h.

## 2026-08-28

- [implemented] The marketplace Nexus review backfill gap was closed. `ReviewBackfill1787905961` listed every indexed user's review directory, ran normal attestation verification and reputation recompute, and completed across 1,948 indexed users in about 4.5 minutes.
- [known gap] The backfill found zero pre-cursor reviews on staging because staging had no review records; the earlier reviews proof ran against a testnet homeserver.

## 2026-08-27

- [implemented] Social/v1 record-layer alignment was recorded. Marketplace records need zero additions to the planned social/v1 spec, five conflicting fork rules were reversed without a wire break, records became open-world, and the never-written tombstone record type was deleted.
- [known gap] The v1 break still waits on the `app.marketplace` namespace, PostEnvelope listing/drop records, private bookmarks, media-by-hash, microsecond time, and editId-based listing sync.

## 2026-08-24

- [implemented] Shippo shipping labels were implemented end to end with seller-direct custody. The seller stores their own sealed Shippo token, quotes real rates, buys the label, prints the PDF, and reuses the label tracking number for the ship transition.
- [known gap] Shippo labels are not yet proven against Shippo's live API; the ledger says this needs a seller with a real Shippo test token.
- [implemented] Checkout inventory rules changed: ordinary checkout no longer holds stock. Stock is acquired only when payment starts, with bounded server-time windows; drop claims remain the deliberate FCFS exception.

## 2026-08-23

- [proven live] FCFS drops passed a two-buyer race on the fully deployed staging stack. Exactly one buyer won the last unit, the loser received the pinned sold-out refusal after refetch, the drop ended sold out, and the winner's private receipt carried a verified edition 1 of 1.
- [implemented] Drops use server time and service-side stock redaction. The client shows `live` and `sold out` only from the service projection and labels calendar buckets as estimates.
- [implemented] The durable service rejects sandbox payment advance unless the deployment opts in with `SANDBOX_PAYMENTS_ENABLED`; durable deployments do not fake payment.

## 2026-08-22

- [proven live] Real payments were proven through the Bitkit wallet leg on deployed regtest rails: seller watch-only claim in Bitkit, buyer in-app Payment Request, swipe-to-pay, broadcast, on-chain confirmation, service completion, credential, and guarded read.
- [proven live] Stripe test-mode payment was proven on the deployed stack from USD lock through hosted Checkout, webhook detection, settlement delay, confirmation, completion, credential, and guarded content read.
- [proven live] PayPal sandbox payment was proven on the deployed stack with hosted approval, gateway-notified detection, settlement, confirmation, completion, credential, and guarded content read.
- [proven live] Cross-device private watchlist sync passed against the real staging homeserver, including private read and directory-list denial to another identity.
- [proven live] A live DM reached the real app UI: a throwaway identity completed Noise XX with a signed-in app account and the message appeared in `/messages` with an unread badge.

## 2026-08-21

- [proven live] Durable-mode messaging was proven against the real staging homeserver over public relays, with token-gated signup, marker publish/discovery, Noise XX handshake, bidirectional chat, and snapshot restore.
- [implemented] The durable transaction service architecture described by ADR 0019 was implemented in Rust with PostgreSQL and Pubky AuthToken authentication; the in-memory service remains a labeled sandbox only.
- [implemented] Portable reputation was accepted: reviews embed long-lived, publicly verifiable purchase attestations signed by an attestor Pubky identity.

## Sources

- `docs/ecommerce/status.md`
- `docs/ecommerce/FEATURES.md`
- `docs/adr/0019-marketplace-transaction-authority.md`
- `docs/adr/0020-marketplace-public-records.md`
- `docs/adr/0024-portable-reputation.md`
- `docs/adr/0026-marketplace-drops.md`
- `docs/adr/0027-social-v1-migration.md`
- `docs/adr/0029-vibe-session-consumer.md`
- `/Users/johncarvalho/.cursor/plans/vibes-first_marketplace_master_plan_d8646c7a.plan.md`
