# Marketplace Status: What Is Real and What Is Not

Read this before evaluating the marketplace. It exists so nobody has to reverse-engineer which behavior is genuine and which is simulated.

This is a **pre-production prototype under review**. It is not proposed for production, and nothing here has handled real funds.

Last updated: 2026-08-20.

## Real

| Capability                              | Notes                                                                                                                                                                                                                                                                                                                                                                                                                                                                     |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public shop, listing, and media records | Written to the owner's homeserver, signed by the owner's session. Real Pubky data you own and can take elsewhere.                                                                                                                                                                                                                                                                                                                                                         |
| Marketplace object specs                | Shop, listing, and review are specified in a `pubky-app-specs` fork with full validation and tests, so they are parseable protocol objects rather than client-private JSON.                                                                                                                                                                                                                                                                                               |
| Local-first state                       | Carts, drafts, favorites, and shop follows in account-scoped IndexedDB.                                                                                                                                                                                                                                                                                                                                                                                                   |
| Catalog browse, filter, search          | Renders from the local cache first, then refreshes from the Nexus marketplace index in every mode except sandbox; keeps working cache-only when Nexus is unreachable and with no transaction service running.                                                                                                                                                                                                                                                             |
| Nexus catalog discovery                 | The catalog is populated from the Nexus listing stream (`GET /v0/stream/listings`, implemented on the `feat/marketplace-indexing` branch of `pubky-nexus`). The index supplies listing identity and revision freshness only — full records are always hydrated from the seller's homeserver, which stays canonical per ADR 0020. Sale format and single-condition filters run server-side; text search, hierarchical category, price range, and sorting stay client-side. |
| Listing studio                          | Variants, SKUs, media with content hashing, draft autosave, publish.                                                                                                                                                                                                                                                                                                                                                                                                      |
| Durable transaction service             | Separate Rust service: PostgreSQL, constraint-enforced invariants, Pubky AuthToken authentication, proven one-winner concurrency. **Connected**: in `transaction-service` mode the client executes its ported commands there over authenticated sessions (see below for what that does and does not cover).                                                                                                                                                               |
| Transaction-service transport & auth    | Real Pubky auth: the SDK auth flow yields an `AuthToken` after signer approval, its bytes buy an opaque bearer session, commands go over snake_case wire per ADR 0019. The token lives in memory only and dies on sign-out. Verified end to end against the running service by `npm run test:marketplace:service`.                                                                                                                                                        |
| Contract lockstep                       | The service's canonical `contracts/state-machines.json` is vendored into the client and a CI test fails on any drift between it and the TypeScript state tables/enums.                                                                                                                                                                                                                                                                                                    |
| Locks browser SDK                       | Built and smoke-tested from the pinned upstream commit; provenance recorded.                                                                                                                                                                                                                                                                                                                                                                                              |

## Simulated, and labeled as such in the UI

Everything transactional currently runs against the in-memory sandbox service:

| Capability                         | What is fake about it                                                                                                                      |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Offers, counters, bids, auctions   | Real rules, but state lives in memory and is lost on restart.                                                                              |
| Cart checkout, orders, fulfillment | Orders are created and advanced, but by a service with no durable storage.                                                                 |
| Payments                           | No Bitcoin anywhere. Payment states advance because a buyer presses a visibly-labeled simulate button.                                     |
| Actor identity                     | The sandbox service trusts an `x-pubky-actor` HTTP header. **Any client can claim to be any user.** This is why it must never be deployed. |
| Messaging                          | Stored in service memory, readable by the service operator. Not encrypted transport.                                                       |
| Moderation                         | Report queue works; moderator identity is config-driven (see below).                                                                       |

The UI labels simulated states, and the catalog hero carries a persistent "Sandbox — no real funds" marker.

## Not done, and why

### Real payments are not exercised end to end

The Locks browser SDK is built and its API verified. What is missing is deliberate, not overlooked:

- `pubky/paykit-server` has **no releases**, so it must be built from a pinned commit.
- A composed environment is required: Lock Server, Paykit Server, Bitcoin regtest, and an Electrum-compatible indexer.
- The buyer step needs **a Bitkit wallet** to receive the Paykit payment request and execute payment on regtest.

That last item is a person with a mobile wallet. It cannot be automated, and simulating it would produce exactly the kind of false confidence this document exists to prevent. **Real-payment verification is therefore explicitly deferred**, and `locks-paykit` mode is not usable until it happens. Build provenance and the remaining steps are in [`locks-sdk-provenance.md`](locks-sdk-provenance.md).

### The durable service is connected for commands, not yet for the shopping UI

The client now has a real transport for the Rust service (`transaction-service` mode): authenticated sessions from Pubky AuthTokens, snake_case wire, the ported command set, and reports. What it deliberately does **not** give you yet:

- **No interactive shopping flows.** The service exposes no query projections (listings, orders, payments, conversations), and the UI needs those to compose `expected_revision` values — so buy/offer/bid/checkout screens do not operate against it and say so instead of simulating. They remain sandbox-only.
- **No in-app session UX.** Establishing a session requires a signer approval, and whether that prompt is folded into sign-in or kept separate is an open product decision recorded in [`service-auth.md`](service-auth.md). Until it is made, sessions are established programmatically (the integration suite does exactly this), not by a button in the app.
- **Payments are still the sandbox adapter** on the durable service too — no Bitcoin anywhere, and the client refuses to send `payment.sandbox_advance` to it at all.

So: outcomes produced through the transaction-service transport are durable and authoritative; everything you can _click through_ today still runs on the sandbox and is labeled as such.

### Other deferred items

| Item                                     | Status                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ---------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Independent security review              | Required before any real-funds deployment. Not started by design — a self-review is not a security review.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           |
| Private messaging on encrypted transport | Messages are operator-readable today. Needs Paykit encrypted links or another reviewed encrypted transport.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                          |
| Nexus marketplace index deployment       | The client consumes the index (see Real), but the index itself lives on the `feat/marketplace-indexing` branch of `pubky-nexus` and is not deployed to the staging or production Nexus. Against a Nexus without the marketplace endpoints the catalog degrades gracefully to cache-only, so discovery in such a deployment is still limited to followed sellers and direct links until the index ships.                                                                                                                                                                                                                                                                                                                                                                                                              |
| Cold-cache catalog fetch cost            | Discovery asks Nexus for a page of listings, then hydrates each unknown or stale listing from its seller's homeserver — so a cold cache costs one index request plus up to one homeserver request per listing. A warm cache only refetches listings whose indexed revision moved, which is cheap. The index already carries almost everything a listing card renders (title, price, media urls, condition, category, sale format, location); the one card field it lacks is an auction's `ends_at`. Adding auction terms to the Nexus projection would let the grid render straight from the index and hydrate only on opening a listing, collapsing the cold-cache cost to a single request. Not done: the current shape is correct per ADR 0020 and acceptable warm, so this is an optimization rather than a fix. |
| Returns, disputes, reviews               | UI exists against the sandbox; not yet on the durable service.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       |

## Configuration implementers must set

### Moderators

The moderator set is **configuration, not code** — there is no hardcoded moderator identity. Supply the moderator pubky list to the transaction service via its documented environment configuration; entries are validated as z-base-32 pubkys at startup. An empty list means no one can access moderation queues, which is the correct default for a deployment that has not chosen moderators.

Moderation roles are independent: there is no broad admin role, and non-moderators cannot read another user's reports.

### Commerce adapter mode

`PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE` defaults to `unavailable` and must stay that way outside explicitly local or demo deployments. See [`RUNNING.md`](RUNNING.md).

## How to judge this work

Fair questions to ask:

- Do public records belong to the user and survive without our infrastructure? (Yes — they are on your homeserver, and now specified.)
- Are the transactional invariants actually enforced, or asserted? (Enforced by database constraints, with 100-way concurrency proofs.)
- Does the UI ever claim finality it does not have? (It should not; simulated states are labeled. Report any case that is not.)
- Could this take real money today? (No, and it is gated so it cannot try.)
