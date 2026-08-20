# Marketplace Status: What Is Real and What Is Not

Read this before evaluating the marketplace. It exists so nobody has to reverse-engineer which behavior is genuine and which is simulated.

This is a **pre-production prototype under review**. It is not proposed for production, and nothing here has handled real funds.

Last updated: 2026-08-20.

## Real

| Capability                              | Notes                                                                                                                                                                                               |
| --------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Public shop, listing, and media records | Written to the owner's homeserver, signed by the owner's session. Real Pubky data you own and can take elsewhere.                                                                                   |
| Marketplace object specs                | Shop, listing, and review are specified in a `pubky-app-specs` fork with full validation and tests, so they are parseable protocol objects rather than client-private JSON.                         |
| Local-first state                       | Carts, drafts, favorites, and shop follows in account-scoped IndexedDB.                                                                                                                             |
| Catalog browse, filter, search          | Reads the local cache; works with no transaction service running.                                                                                                                                   |
| Listing studio                          | Variants, SKUs, media with content hashing, draft autosave, publish.                                                                                                                                |
| Durable transaction service             | Separate Rust service: PostgreSQL, constraint-enforced invariants, real ed25519 challenge–response auth, proven one-winner concurrency. Exists and is tested, but **not yet connected to the app**. |
| Locks browser SDK                       | Built and smoke-tested from the pinned upstream commit; provenance recorded.                                                                                                                        |

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

### The app is not connected to the durable service

The Rust service is the intended authority, but the client still speaks to the sandbox: different auth (header vs. challenge–response session) and different wire casing (camelCase vs. snake_case per ADR 0019). Until that swap lands, **order, payment, and auction outcomes in the UI are not authoritative**.

### Other deferred items

| Item                                     | Status                                                                                                      |
| ---------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Independent security review              | Required before any real-funds deployment. Not started by design — a self-review is not a security review.  |
| Private messaging on encrypted transport | Messages are operator-readable today. Needs Paykit encrypted links or another reviewed encrypted transport. |
| Nexus discovery                          | In progress. Until it lands, discovery is limited to followed sellers and direct links.                     |
| Returns, disputes, reviews               | UI exists against the sandbox; not yet on the durable service.                                              |

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
