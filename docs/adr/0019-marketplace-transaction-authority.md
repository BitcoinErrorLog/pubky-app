# ADR 0019: Marketplace Transaction Authority

## Status

Accepted — 2026-08-19

> **Current state (2026-08-20)**: this ADR describes the target architecture. The implemented service (`services/marketplace/`) is the in-memory sandbox adapter only: no PostgreSQL persistence, no Pubky authentication (a plain actor header), and sandbox-only commands. The production implementation is specified in [ADR 0022](0022-marketplace-transaction-service-rust.md) (Rust) and must land before any non-sandbox transactional endpoint is enabled.

## Context

Pubky App is local-first. Existing posts, profiles, follows, bookmarks, and settings can commit to Dexie first and synchronize to a user's homeserver because one user owns each write and temporary divergence is acceptable.

A marketplace introduces invariants that cannot be decided by one browser or one user's homeserver:

- one unit of inventory cannot be sold to two buyers;
- an accepted offer and a public purchase must have one winner;
- proxy bids need one ordering, server time, deterministic tie-breaking, and one auction result;
- order terms must remain immutable after purchase;
- payment confirmation, refunds, holds, and adjustments must be idempotent;
- every monetary posting must balance;
- private order, address, message, evidence, and moderation data needs object-level authorization;
- retries, process crashes, callbacks, and reconnects must not duplicate side effects.

Dexie has no cross-user authority. Pubky homeserver files do not provide a multi-owner serializable transaction across seller stock, buyer order, bids, and payment facts. Nexus is a read index, not a command sequencer. Locks verifies proof-backed access, while Paykit exchanges payment metadata; neither is a marketplace order or ledger authority.

Treating a local optimistic state as final would let stale or malicious clients claim that they won, paid, reserved stock, refunded, or released funds. Treating every marketplace write as local-first would therefore violate the guarantees users see in eBay/Depop-class flows.

## Decision

### 1. Split data by authority

| Data                                                            | Authority                                       | Client behavior                             |
| --------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------- |
| Public shop, listing, and public review documents               | Pubky homeserver records signed by the owner    | Cache and reconcile locally                 |
| Drafts, carts, saved searches, UI preferences                   | Account-scoped Dexie                            | Local-first                                 |
| Follows, favorites, and safe unsent messages                    | Pubky records or a reviewed encrypted transport | Optimistic with visible sync state          |
| Stock reservation, offers, auctions, bids                       | Marketplace Transaction Service                 | Online server acknowledgement required      |
| Orders, immutable terms, ledger, fulfillment, returns, disputes | Marketplace Transaction Service                 | Cache role-appropriate projections          |
| Payment endpoint discovery and private requests                 | Paykit                                          | Consume through supported bindings/services |
| Paid digital entitlement                                        | Locks backed by Paykit Server observation       | Verify through the Locks lifecycle          |
| Real Bitcoin refund                                             | Seller's external wallet                        | Record only independently verified evidence |

The UI may optimistically show a transactional command as **submitting**, but it must not show **reserved**, **won**, **paid**, **refunded**, **released**, or **paid out** until it receives an authoritative result.

### 2. Add a Marketplace Transaction Service

The service is a separately deployable process with PostgreSQL as its production persistence boundary. Next.js API routes may proxy requests and keep deployment secrets out of the browser, but they are not the durable authority.

The service owns:

- inventory reservations and expiration;
- offer and counteroffer revisions;
- proxy-bid ordering, anti-sniping, and auction close;
- checkout idempotency and immutable order snapshots;
- payment/Locks correlation and reconciliation;
- integer-minor-unit double-entry ledger postings;
- fulfillment, cancellation, return, external refund, dispute, and review eligibility;
- role-scoped support, risk, finance, and moderation commands;
- append-only aggregate events and audit records;
- outbox work for notifications and external adapters.

The service does not own or receive Pubky identity secrets, wallet spending keys, Bitkit xpubs, Paykit receiver secrets, Locks creator-authority secrets, or raw telemetry payloads.

### 3. Require command envelopes

Every transactional mutation uses a closed, versioned command envelope:

```json
{
  "version": 1,
  "command_id": "uuid",
  "aggregate_id": "seller:list-id",
  "expected_revision": 7,
  "issued_at": "2026-08-19T22:00:00.000Z",
  "payload": {}
}
```

Rules:

- `command_id` is the idempotency key and is unique per authenticated actor.
- Exact replay returns the prior result without repeating effects.
- Reusing a command ID with changed canonical input is a conflict.
- `expected_revision` prevents stale accepted-offer, stock, auction, and order writes.
- Server time decides deadlines. `issued_at` is diagnostic and cannot extend a deadline.
- Unknown fields and unsupported versions are rejected.
- Client-supplied actor, price totals, permissions, settlement facts, and ledger postings are never trusted.

### 4. Use PostgreSQL transactions and constraints

Each accepted command atomically persists:

1. the aggregate state/revision;
2. one immutable domain event;
3. any balanced ledger transaction;
4. the idempotency result;
5. complete outbox intents.

Uniqueness and check constraints enforce:

- one accepted result per actor/command ID;
- one winning result and at most one order per auction;
- non-negative inventory and one reservation conversion/release;
- one payment-confirmed event per payment/order;
- cumulative external refunds not exceeding confirmed value;
- balanced ledger transaction debits and credits;
- one participant review per order/item/role;
- one current aggregate revision.

Workers use leases and retry complete outbox intents at least once. Consumers deduplicate by event ID. Marking an outbox record delivered never implies the external party acknowledged it unless the adapter contract explicitly says so.

### 5. Authenticate Pubky identity and authorize every object

The transaction service accepts a short-lived server-verifiable Pubky authentication assertion. The exact wire mechanism will be specified and contract-tested before transactional endpoints are enabled. It must bind:

- actor Pubky;
- intended service/audience;
- nonce and expiry;
- request/session key or equivalent anti-replay material.

The service maps the actor to roles and checks object participation on every query and command. URLs and body fields cannot select a different actor. Elevated support, moderator, risk, finance, and operator roles are independent; no broad admin role is assumed.

Step-up authorization is required for payment destination changes, high-risk moderation, external-refund confirmation, payout simulation changes, and role administration.

### 6. Keep local-first behavior where it is safe

ADR 0001 still applies to:

- listing/shop drafts and owner-authored public documents;
- carts, saved searches, and preferences;
- safe social actions;
- unsent messages and retryable non-transactional outbox items.

For server-authoritative aggregates, Dexie stores a projection with:

- server revision;
- sync/freshness status;
- last successful fetch;
- pending command ID;
- retryable failure metadata;
- tombstone when applicable.

Offline transactional commands are disabled with an explanation. Reconnect refreshes the aggregate before allowing a command. A stale cache never becomes evidence of finality.

### 7. Treat Paykit and Locks as external facts

Only the configured Lock Server may call signed Paykit Server business routes. Pubky App and the Marketplace Transaction Service do not call them directly.

The transaction service stores an encrypted correlation between an order and a Locks lifecycle. It advances payment exactly once only after independently verifying a completed Locks result. It treats marketplace payment-window expiry separately from upstream payment failure because Locks v1 leaves transport/status failures pending.

Real Bitcoin refund state advances only after independent verification of seller-provided external transaction evidence. The service does not claim to spend, custody, escrow, release, or refund Bitcoin.

### 8. Protect private data and telemetry

Public homeserver/Nexus records contain no:

- delivery/contact details;
- private message or offer content;
- order evidence;
- access credentials or `bundle_id`;
- payment addresses/correlations;
- support/moderation notes.

Bearer material and private projections are encrypted at rest. Logs, traces, metrics, analytics, and Sentry use opaque internal correlation IDs and must pass redaction tests. Operator queries return role-scoped, deliberately redacted views.

## Consequences

### Positive ✅

- Scarce inventory, offers, auctions, and financial transitions have one authority.
- Pubky identity and seller-signed public catalog ownership remain intact.
- The browser can remain responsive through local projections without inventing transaction finality.
- PostgreSQL constraints and immutable events make concurrency, replay, reconciliation, and audit behavior testable.
- Locks and Paykit are integrated according to their actual trust and API boundaries.

### Negative ❌

- The marketplace gains a stateful service and PostgreSQL operational dependency.
- Transactional actions do not work offline.
- A centralized sequencer is required for prototype invariants even though public catalog ownership remains decentralized.
- Private data retention, backups, migrations, access control, and incident response become operational responsibilities.
- Multi-region active-active sequencing is out of scope until a tested consistency design replaces the single authority.

### Neutral ⚠️

- Dexie remains valuable as a read model and draft store but is no longer the universal write authority.
- Public records and transaction projections can temporarily diverge; reconciliation must show stale/ended states safely.
- The service is non-custodial, but its order decisions and sandbox guarantee states still require transparent policy and audit.

## Alternatives Considered

### Use Dexie as the only authority

Fast to implement and fully offline, but any buyer can fork state and multiple clients can win the same stock or auction. It cannot satisfy the required invariants.

### Use owner homeserver files as compare-and-swap records

This preserves owner control but does not atomically coordinate buyer, seller, payment, auction, ledger, and private order records. Event timing and malicious/stale owner writes remain unresolved.

### Use Nexus as the transaction service

Nexus is an index/read system. Expanding it into a private command, ledger, and moderation authority would mix unrelated responsibilities and require a separate transactional persistence design anyway.

### Use Locks as escrow/order authority

Locks verifies criteria and grants guarded-resource access. It has no general inventory, auction, order, shipment, return, ledger, custody, or refund contract.

### Use Paykit Server as marketplace backend

Paykit Server is a receiver-side Bitcoin invoice observer trusted by Locks. It explicitly lacks spending, refund, receipt, payer-proof, marketplace order, and horizontal-replica support.

### Put PostgreSQL behind Next.js route handlers only

This could share deployment code, but Next.js process lifecycle and scaling would couple durable workers, auction timers, reconciliation, and web rendering. A separate service gives explicit health, migrations, leases, and failure isolation. Next.js may still act as a narrow BFF.

## Implementation Notes

Initial delivery:

1. Define closed Zod contracts shared by the web adapter and service.
2. Implement pure state machines and money/ledger invariants with exhaustive tests.
3. Add a service process with health/readiness and an in-memory test adapter.
4. Add PostgreSQL migrations and repository adapters.
5. Implement Pubky authentication verification before enabling non-test commands.
6. Add inventory and fixed-price checkout as the first concurrency-tested vertical slice.
7. Add offers and auctions after the same revision/idempotency primitives pass.
8. Add Locks/Paykit correlation after the local sandbox transaction lifecycle is stable.

Mandatory tests:

- 100 concurrent attempts for one unit produce one accepted reservation;
- 100 concurrent proxy bids produce one deterministic leader and one close result;
- exact replay returns one result; changed replay conflicts;
- worker crash/restart does not lose or duplicate complete outbox intents;
- duplicate/reordered Locks completion creates one payment event and ledger result;
- every ledger transaction balances and cumulative refund cannot exceed confirmed value;
- object-level authorization rejects every cross-user order/message/evidence query;
- account switch clears or isolates all private Dexie projections;
- backup/restore does not replay external side effects.

Feature flags and runtime config must default the transaction adapter to `unavailable` outside explicit sandbox/test environments. A real deployment fails closed when service identity, database, Locks, or Paykit trust configuration is missing.

## Related Decisions

- [ADR 0001: Local-First Writes](0001-local-first-writes.md)
- [ADR 0004: Layering and Dependency Rules](0004-layering-and-dependency-rules.md)
- [ADR 0009: Application Cross-Domain Orchestration](0009-application-cross-domain-orchestration.md)
- [ADR 0011: Dexie PSD and TanStack Query](0011-dexie-psd-and-tanstack-query.md)
- [ADR 0015: Error Handling](0015-error-handling.md)
- [Marketplace implementation plan](../ecommerce/implementation-plan.md)
- [Marketplace upstream integration contract](../ecommerce/upstream-integration.md)

## References

- <https://github.com/pubky/paykit-rs>
- <https://github.com/pubky/paykit-server>
- <https://github.com/pubky/locks>
- <https://www.postgresql.org/docs/current/transaction-iso.html>
