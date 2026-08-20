# ADR 0023: Single Deliberate Dexie Version Reset for Marketplace Tables

## Status

Accepted — 2026-08-20

## Context

The marketplace adds `commerce_*` tables to the Dexie database. Franky recreates the entire local database whenever `NEXT_PUBLIC_DB_VERSION` changes (see ADR 0007), which wipes all local IndexedDB data for every user on upgrade. The prototype branch bumped the version 2→5 across several intermediate schema iterations, which would have shipped three wipes' worth of churn as one uncoordinated jump.

Local data is a cache of homeserver/Nexus state for almost everything; the exceptions are device-local-only records (drafts, carts, unsent content), which a wipe permanently loses.

## Decision

Ship exactly **one** coordinated version bump, `NEXT_PUBLIC_DB_VERSION` 2→3, carrying the complete `commerce_*` schema. The bump ships only with the first Dexie-touching marketplace PR and is release-noted: users are told the upgrade resets local data, that feeds/profiles re-sync automatically, and that device-local drafts are lost.

No additive Dexie migration machinery is built for this release. Franky's existing recreate-on-mismatch behavior is the migration.

## Amendment — 2026-08-20 (version 3→4)

Consuming the Nexus auction-terms fields added a `commerce_catalog_entries` table (the index-projection cache the catalog grid renders from). Per the neutral consequence below, this is an explicit second reset decision, not silent churn: `NEXT_PUBLIC_DB_VERSION` moves 3→4 in the same PR that introduces the table, with the same cost profile (device-local drafts and unsent content are lost once; everything else re-syncs).

## Consequences

### Positive ✅

- One wipe instead of several; the cost is paid once and communicated once.
- No new migration framework to build, test, and maintain for a schema that is still settling.

### Negative ❌

- Users lose device-local drafts and unsent content on upgrade, once.

### Neutral ⚠️

- Subsequent marketplace schema changes before launch must batch into the same version or accept another reset decision explicitly; silent version churn is not permitted.

## Alternatives Considered

### Additive Dexie versioning for commerce tables

**Pros**: no data loss on upgrade.

**Cons**: builds migration machinery the app deliberately avoids (ADR 0007's recreate model); the commerce schema is new and will still change, multiplying migration paths that must each be tested.

**Why not chosen**: the one-time cost of a reset is lower than the permanent cost of a migration framework, given local data is mostly re-syncable cache.

## Related Decisions

- [ADR 0007: Dexie Version Normalization](0007-dexie-version-normalization.md)
- [ADR 0019: Marketplace Transaction Authority](0019-marketplace-transaction-authority.md)
