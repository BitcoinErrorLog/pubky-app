# Trust & Reputation: Phased Implementation Plan

Companion to [trust-reputation-design.md](trust-reputation-design.md) and [ADR 0024](../adr/0024-portable-reputation.md) (Accepted 2026-08-21). Sizing is coarse: S ≈ ≤1 day, M ≈ 2–4 days, L ≈ a week-plus, for one person familiar with the repo in question.

## Progress — updated 2026-08-21 (Phases 0–1 landed; parts of Phase 3 pre-built)

- [x] **P0.1** — ADR 0024 accepted; D1–D8 ratified (D2 as custom both-sides band consent; design doc §11 records all eight).
- [x] **P1.1** — Attestation claim format in the specs fork (`0.6.2-marketplace.3`): `PubkyAppPurchaseAttestation` with closed-world `v: 1` claims, compact-JWS parsing, offline Ed25519 verification against the self-certifying `iss` pubky, review-binding checks, and test vectors (valid / wrong key / mismatched binding / unknown version / malformed forms). SPEC.md carries the normative claim table and recipe.
- [ ] **P1.2** — Attestor record specs (attestor profile with `successor` rotation, `seller_stats/{seller}`, `annotations/{order_ref}`) — **not started**; needed before the Phase 3 publisher.
- [x] **P1.3** — `PubkyAppReviewResponse` at `review_responses/{review_id}` with the structural subject-authorization helper, URI parser variant, builder, wasm binding, tests.
- [x] **P1.4** — Attestor identity + signing module in the service (`attestor.rs`): Ed25519 key + order-ref salt from env (fail-closed pair), z-base-32 pubky derivation, JWS issuance, append-only `review_attestations` audit rows.
- [x] **P1.5** — Issuance inside the `review.create` transaction, returned in the command result (echoed by `review.update`); idempotent participant-scoped `GET /v1/orders/{id}/review-attestation`; integration tests including third-party-style signature verification against the attestor pubky. **Added scope (ratified D2):** seller standing band consent (`attestation.set_band_consent` command + `attestation_band_consents` table + `GET /v1/sellers/{pubky}/band-consent`), buyer per-review `allow_amount_band` payload flag, both-sides gating tests; dispute/refund **annotations** (`attestation_annotations`, keyed by salted `order_ref`, dispute outcomes stored per winning side for the Phase 3 publisher to map to reviewer-relative vocabulary) and the moderator-only `attestation.disavow` escape hatch.
- [x] **P1.6** — Client publishes the review record: builds `PubkyAppMarketplaceReview` via the specs builder, embeds the JWS, PUTs to the reviewer's homeserver with the staged-job retryable outbox (pending rows retry when the orders surface loads); `review.update` republishes with `revision + 1` and the original `createdAt`; buyer band opt-in rendered only when the seller consented; own-review verified status re-verified offline before display. Unit + VRT coverage. *Honest gap:* the e2e leg against the live service + homeserver is exercised by unit tests with the real crypto but not yet by a live two-party proof.
- [x] **P1.7** — Specs release [`v0.6.2-marketplace.3`](https://github.com/BitcoinErrorLog/pubky-app-specs/releases/tag/v0.6.2-marketplace.3) published and vendored by the client. Nexus consumption happens with P2.1.
- [ ] **P2.1–P2.5** — Nexus indexing/aggregation — **not started** (next critical-path step).
- [~] **P3.1** — Stat computation landed early inside the weekly worker task (median paid→shipped hours via `receipt.issued`→`fulfillment.shipped` events, dispute rate, completion rate, completed-order band; integration-tested). Property tests against synthetic event streams remain open.
- [~] **P3.2** — The signing + storage half exists (weekly `seller_stat_attestations` rows, signed JWS, cadence-guarded worker task; annotations accumulate per order_ref). The **attestor-homeserver publisher is not built** — nothing is public yet, and it needs P1.2's record specs first.
- [ ] **P3.3, Phase 4, Phase 5** — not started.

Repos touched: `pubky-app-specs` fork (**specs**), `marketplace-service` (**service**), `pubky-nexus` branch `feat/marketplace-indexing` (**nexus**), `pubky-app` (**client**).

## Ground rules

- The **verified-purchase attestation is the critical path** (bold chain below). Every reputation surface that claims "verified" depends on it; UX-only tasks that don't claim verification can proceed in parallel against unverified data but must not ship user-visible "verified" language until the chain is complete.
- Per the workspace honesty rules: no phase ships with simulated attestations or placeholder verification. If a surface renders before its data source exists, it renders the honest absent state (design doc §10.2), which is itself specified work, not a stopgap.
- Every phase ends with a `status.md` truth update (the file is the audit trail of real vs. not).

## Phase 0 — Ratification (blocking, small)

| ID | Task | Repo | Size | Depends on |
| --- | --- | --- | --- | --- |
| P0.1 | Review + accept ADR 0024; resolve or default open decisions D1–D8 (design doc §11) | client (docs) | S | — |

D1 (review-per-listing vs per-order) is the only decision that would change Phase 1 interfaces; all others have safe defaults.

## Phase 1 — Attestation foundation

| ID | Task | Repo | Size | Depends on |
| --- | --- | --- | --- | --- |
| **P1.1** | **Attestation claim format**: JWS claim schema (v1), canonicalization, test vectors (valid/expired-epoch/mismatched-binding/wrong-key), documented in the specs fork so third parties have a normative reference | specs | **M** | P0.1 |
| P1.2 | Attestor record specs: attestor profile (incl. `successor` rotation), `seller_stats/{seller}`, `annotations/{order_ref}`; validation + tests, URI parser variants | specs | M | P0.1 (parallel with P1.1) |
| P1.3 | `PubkyAppReviewResponse` spec: path `review_responses/{review_id}`, ID-equals-review-ID rule, validation + tests, parser variant | specs | S | P0.1 (parallel with P1.1, P1.2) |
| **P1.4** | **Attestor identity + signing module** in the service: Ed25519 key from KMS/env, pubky derivation, JWS issuance, `order_ref` salting, issuance audit rows | service | **M** | **P1.1** |
| **P1.5** | **Issuance wiring**: attestation created in the `review.create` transaction and returned in the result; idempotent participant-scoped `GET /v1/orders/{id}/review-attestation`; contract tests | service | **S** | **P1.4** |
| **P1.6** | **Client publishes the review record**: after `review.create` success, build `PubkyAppMarketplaceReview` (schema already exists), embed JWS, publish to reviewer homeserver via the retryable-outbox pattern; `review.update` republishes with `revision+1`; e2e test against the running service | client | **M** | **P1.5** |
| P1.7 | Specs npm/crate release consumed by client + nexus (version bump, changelog) | specs | S | P1.1–P1.3 |

Parallelism: P1.1, P1.2, P1.3 are three independent specs tasks (three people or three sequential short efforts). P1.4 starts the moment P1.1's claim format is frozen — it does not wait for P1.2/P1.3.

## Phase 2 — Indexing and aggregation (Nexus)

| ID | Task | Repo | Size | Depends on |
| --- | --- | --- | --- | --- |
| **P2.1** | **Review event handler**: route `Resource::MarketplaceReview` PUT/DEL, spec validation, JWS verification against configured attestor trust list, graph edge + Redis details, missing-dependency retry, `edited_late` detection | nexus | **L** | **P1.1**, P1.7 |
| **P2.2** | **Reputation aggregates + endpoints**: incremental `ReputationSummary` per subject (per role); `GET /v0/marketplace/reputation/{pubky}`, `GET /v0/marketplace/reviews/{pubky}`; **compact `reputation` object embedded in `/v0/stream/listings` and shop views**; one-shot backfill/recompute migration (auction-terms pattern) | nexus | **L** | **P2.1** |
| P2.3 | Response record indexing: handler for `review_responses`, structural authorization check (`owner == subjectPubky`), join into review views, response-rate in summary | nexus | S | P2.1, P1.3 |
| P2.4 | `taggers_verified` annotation on listing/shop tag aggregates (graph join against attested `REVIEWED` edges) | nexus | M | P2.1 (parallel with P2.2) |
| P2.5 | Attestor-record ingest: index attestor homeserver `seller_stats` + `annotations` (signature-verified, origin-labeled), serve within the reputation endpoint | nexus | M | P2.1, P1.2 (data arrives in Phase 3; ingest code needs only the spec) |

Parallelism: after P2.1, three lanes — P2.2 (aggregates), P2.4 (tags), P2.5 (attestor ingest) — are independent; P2.3 is a small add-on to the P2.1 pipeline.

## Phase 3 — Fulfillment stat attestations (service)

Independent of Phase 2 except where noted; can run concurrently with it.

| ID | Task | Repo | Size | Depends on |
| --- | --- | --- | --- | --- |
| P3.1 | Stat computation from the events table: per-seller period stats (median/p90 paid→shipped, dispute rate, completion rate, completed-order bands); property tests against synthetic event streams | service | M | P0.1 (no attestation dependency — pure event-table work; can start with Phase 1) |
| P3.2 | Attestor homeserver publisher: the service signs stat records and annotations and writes them to the attestor identity's homeserver on a schedule + on `dispute.resolve`/`refund.record_external`; **new operational dependency (attestor homeserver session) — document in RUNNING.md** | service | M | P1.4, P1.2, P3.1 |
| P3.3 | Consistency guard: stat attestation refuses to publish `ordersCompletedBand` below the publicly attested-review floor (design doc §7.3 cross-check) | service | S | P3.2, P2.2 (read-side floor query) |

## Phase 4 — Client UX surfaces

P4.1–P4.2 are the visible payoff and gate the "suite exists" claim; the rest can land incrementally.

| ID | Task | Repo | Size | Depends on |
| --- | --- | --- | --- | --- |
| **P4.1** | **Reputation on cards**: stars/count/verified affix from the stream projection; explicit "New seller" state; honest-absence state when index lacks reputation | client | **S** | **P2.2** |
| **P4.2** | **Listing + shop reputation surfaces**: full reputation block, review list with verified badges, seller responses inline, `edited_late` flags, stat display with origin labeling ("signed by attestor X") | client | **M** | **P2.2**, P2.3 |
| P4.3 | Seller response composer: publish `PubkyAppReviewResponse` to own homeserver (local-first + outbox), edit via revision | client | M | P1.3, P1.7 (renders locally before P2.3 indexes it) |
| P4.4 | Buyer-side history: "reviews you wrote" (own homeserver, local-first), "about you as buyer" via reputation endpoint with role filter; buyer summary in offer/order contexts | client | M | P2.2 |
| P4.5 | Cold-start treatment: shop age, completed-orders band pre-first-review, cross-role bootstrap display | client | S | P4.2, P2.5 |
| P4.6 | Tag reputation overlay: verified-tagger ranking + "✓ n verified buyers" chips on tag clouds | client | S | P2.4 |
| P4.7 | Degradation matrix tests: every surface × (no Nexus reputation / no attestor reachable / unverified-only data) renders the specified honest state | client | M | P4.1–P4.4 |

## Phase 5 — Portability proof and truth

| ID | Task | Repo | Size | Depends on |
| --- | --- | --- | --- | --- |
| P5.1 | Standalone verification tool: a small script/CLI (outside the app) that executes the design doc §9 recipe end to end against a live homeserver — the artifact that makes the portability claim demonstrable to a skeptic | any (new, small) | M | P1.6 (real records to verify) |
| P5.2 | Third-party recompute demo: re-derive one seller's aggregate from records alone and diff against the Nexus endpoint | extends P5.1 | S | P2.2, P5.1 |
| P5.3 | `status.md` + threat-model updates; attestor key operations runbook | client (docs) | S | each phase end |

## Task graph (dependency edges; **bold** = critical path)

```text
P0.1 ─┬─► **P1.1** ─┬─► **P1.4** ─► **P1.5** ─► **P1.6** ─────────────┬─► P5.1 ─► P5.2
      ├─► P1.2 ─────┼──────────────► P3.2 ◄─ P3.1 ◄─ P0.1             │
      ├─► P1.3 ─────┤                 │                               │
      └─► P3.1      └─► P1.7 ─► **P2.1** ─┬─► **P2.2** ─┬─► **P4.1**  │
                                          │             ├─► **P4.2** ◄┼─ P2.3
                                          ├─► P2.3      ├─► P4.4      │
                                          ├─► P2.4 ─► P4.6            │
                                          └─► P2.5 ─► P4.5 ◄─ P3.2    │
                                                      P3.3 ◄─ P2.2    │
P1.3 ──► P4.3 (parallel to all of Phase 2)                            │
P4.1..P4.4 ─► P4.7                                                    │
every phase ─► P5.3 ◄─────────────────────────────────────────────────┘
```

**Critical path**: P0.1 → P1.1 → P1.4 → P1.5 → P1.6 → P2.1 → P2.2 → P4.1/P4.2 — spec claim format, service issuance, client publication, Nexus verification+aggregation, cards. Everything else hangs off it or runs beside it.

Maximum useful concurrency by stage:

| Stage | Parallel lanes |
| --- | --- |
| After P0.1 | 4: P1.1 ∥ P1.2 ∥ P1.3 ∥ P3.1 |
| After P1.1 freeze | 3: P1.4→P1.5 (service) ∥ remaining specs ∥ P3.1 (service stats — different modules, coordinate merges) |
| After P1.7 | 3: P2.1 (nexus) ∥ P1.6 (client) ∥ P4.3 (client response composer) |
| After P2.1 | 4: P2.2 ∥ P2.4 ∥ P2.5 ∥ P2.3 |
| After P2.2 | 3–4: P4.1 ∥ P4.2 ∥ P4.4 ∥ P3.3 |

## Explicit non-goals of this plan

Deferred by design (see design doc §12): cross-marketplace federation machinery, on-chain anchoring, ZK purchase proofs, web-of-trust ranking, tag sentiment analysis, message-responsiveness stats (impossible under E2EE), and any blended single trust score.
