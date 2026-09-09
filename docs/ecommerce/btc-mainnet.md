# Bitcoin Mainnet Switch And Payment-Journey Proof — Design (r3)

## Review history

- **r1 — `e72fec77`** (Claude Opus). First design: second mainnet paykit-server
  beside the regtest one, and a "payment journey" proof that used the public
  BIP84 test-vector account's pre-existing mainnet history as the payment.
- **W0 adversarial review — GPT-5.6 Sol: FIX-FIRST.** Four P1s.
  **P1-A:** accepting pre-invoice history is not a harness trick, it is a
  production defect — a legitimate seller's old receipts at `0/0` auto-confirm
  their first unpaid order.
  **P1-B:** the r1 PASS and a safe watcher are mutually exclusive, and W1.4's
  deny-list denies the exact key W2.2 must claim; the proof must be split and
  its claims narrowed.
  **P1-C:** staging/proof and production must not share a mainnet paykit-server
  or database; one poisoned row stops every seller in the shared batch.
  **P1-D:** rollback by repointing `PAYKIT_SERVER_URL` strands buyers who
  already hold a mainnet Payment Request.
  Plus P2-E…P2-I and P3-J, all addressed below.
- **Kimi design audit of r1 — FIX-FIRST.** Independently reached the same two
  P1s: the height floor is scheduled after real-money launch when the exposure
  is the *default* case, and the deny-list collides with the proof on an
  unsequenced deploy order. Both are closed here (§B.4, §B.6). Its P2/P3 items
  are folded in and attributed inline: production watcher leak and observation
  TTL, TLS pinning as a stated decision, Electrum surveillance disclosure,
  fail-closed behaviour for an unset network variable, sibling-account
  deny-list coverage, gap-limit exhaustion, cross-instance replay, and a
  funded-wallet precondition asserted rather than written in prose. Its
  concurrent-allocation P2 is refuted with evidence in §E.
- **r2 — `135271c1f`** (Claude Opus). Post-invoice height floor, claim-time
  index scan, three separate proofs with honest claims, isolated production and
  proof rails, Bitcoin creation kill switch, bounded Electrum policy.
- **r2 adversarial review — GPT-5.6 Sol: FIX-FIRST.** Verified every code claim
  in r2 against the source; its citations are treated as ground truth here.
  Closed r1's B, C, E, F, H, I, J, K and all but two Kimi items. Left **A, D, G
  PARTIAL** and raised five new findings, three of them P1 false-paid or
  lost-funds paths: **NEW-1** the height floor has an ordering race (a
  pre-invoice mempool transaction mined before tick 1 is seen first as
  confirmed, above the floor, and pays the invoice); **NEW-2** the seller's
  wallet and paykit-server are independent allocators, so a busy wallet can
  reach an index already assigned to a live Shop invoice; **NEW-3** Payment
  Requests have no expiry (`create_payment_request.rs:230`), so the §C.16 drain
  boundary strands still-payable requests; **NEW-4** the three proofs do not
  compose over one deployed artifact; **NEW-5** fail-closed creation is a
  checkout-wide DoS with no stated budget.
- **r3 — this commit** (Claude Opus). **This is the last round under the
  3-round cap.** Changes: the height floor is demoted to a secondary defence
  behind a **creation-time baseline snapshot** of confirmed history *and*
  mempool, with publication conditional on snapshot success (§B.4, NEW-1);
  a decision on independent allocators taken as **both (a) and (b)** —
  Shop-exclusive Bitkit-issued account xpubs at account index ≥ 1, which both
  wallets can already export, plus an exact-amount predicate with a per-invoice
  amount nonce, with the residual written as a number and raised as **Q9**
  (§B.8, NEW-2); an **enforceable Payment Request expiry** that both wallets
  already parse and enforce, which becomes the drain boundary and the carrier
  for the observation TTL contract (§B.9, NEW-3, and partial G); **one pinned
  image digest** across all three proofs plus a split of MAINNET-DERIVE into
  seller-side and buyer-side legs (§D, NEW-4); and an **availability budget
  with auto-hide** for Bitcoin at checkout (§B.7, NEW-5). §B.6's account-0
  restriction is revised, not weakened, because NEW-2(a) requires account ≥ 1.
  Two residuals are named and gated rather than closed: **R1** (a mempool
  transaction the server's single Electrum has not yet seen at snapshot time)
  and **R2** (a seller who restores the same seed into a third-party wallet
  configured to the Shop account). Both are stated in §B.10 with their gates.

## Owner decisions required

These carry the global question numbers used throughout this document; the
decided ones are in §G. **Q3, Q4 and Q8 are unchanged from r2 and remain open.
Q9 is new in r3 and is the one the owner must answer before general
availability.**

- **Q3 — Confirmation depth.** Recommended: **2 confirmations** before an order is `paid` (a fork change at `invoices.rs:702-707`); 1-conf has no un-confirm edge anywhere (`marketplace-service/…/workers.rs:822-826`), so a 1-block reorg leaves an unpaid order `paid`. Cost: ~10–20 min added wait, well inside the 3600 s hold window.
- **Q4 — Single-Electrum trust.** Recommended: **accept for launch.** `ssl://bitkit.to:9999` is first-party Synonym infrastructure — the same trust Bitkit already extends. A dishonest one can mark an unpaid order `paid`; the loss falls on the seller. Two-server corroboration is scheduled, not shipped. Q4 also carries residual **R1** (§B.10): a single Electrum is the reason a creation-time mempool snapshot cannot be complete.
- **Q8 — Independent security review.** Recommended: **waive in writing, bounded** — Kimi audit plus §D's proofs, with production restricted to the W5 canary (named sellers, small amounts) for one week before general availability. Do not delete `status.md:150`; record the waiver in those words.
- **Q9 — Residual false-paid from independent allocators (new in r3).** §B.8 reduces this from "near-certain for a busy shared-account seller" to **≈1 × 10⁻³ false-paid events per exposed-seller-month** under the assumptions written there, and to **zero by construction** for a seller who uses a Bitkit-issued Shop-exclusive account. The harm is stated plainly: **the seller ships an item a Shop buyer never paid for.** Recommended: **accept the residual only for the population that cannot use a Bitkit-issued account, and gate that population** — at general availability, mainnet Shop claims accept the Bitkit watch-only-account claim path only, and manual xpub paste is disabled on mainnet. If the owner wants manual paste at GA, the accepted residual is the 10⁻³ figure and that acceptance must be written down. This is an **owner decision, not an engineering one**, because it trades seller loss against seller reach.
- **Q10 — Reorg and late-settlement policy.** Recommended: **accept**, with seller copy that says "wait for the confirmations shown before shipping", and with settlements that land after the hold window continuing to route to `manual_review` (`workers.rs:787-820`) rather than auto-confirming.

---

Status: design only. No code in this document has been written. Read
[`status.md`](status.md) (what is actually proven today) and
[`runbook-production.md`](runbook-production.md) (kill switch and rollback)
first; this document changes the premise of both.

Owner decision this design implements: switch the Bitcoin rail to **mainnet**
this week, and prove as much of the payment user journey as can be proven
without an agent spending money. Fiat rails stay in test mode. The prior
`pubky-payment-rails` policy line ("REGTEST ONLY. Nothing in this repo may ever
be configured for Bitcoin mainnet." — `pubky-payment-rails/README.md:12-13`) is
reversed by the owner; §C.11 states what replaces it.

Every behavioural claim below cites a file and line that was opened and read
while writing this. Anything not verified that way is marked **UNVERIFIED**.

---

## Errors corrected in the input survey

The read-only survey at `/tmp/btc-mainnet-map.md` was used as a map. Ten of its
claims are wrong or materially incomplete; they change the shape of the work.

| # | Survey claim | Verified reality |
| --- | --- | --- |
| 1 | The Dockerfile applies `regtest-endpoint-identifier.patch`; "remove the regtest patch" is a required step | The patch was folded into the fork tree (`pubky-payment-rails/paykit-server/Dockerfile:3-5`). The identifier is selected at runtime: `PaykitIntentBuilder::for_network` maps Mainnet → `btc-bitcoin-p2wpkh` (`paykit-server-fork/…/create_invoice.rs:163-173`), wired at `src/server.rs:190`, `:208`. The Dockerfile's only reference is a fail-closed *presence* grep (`Dockerfile:57`) that still passes on mainnet. **No Dockerfile change is required.** |
| 2 | "Confirmation threshold: `LOCKS_PAYKIT_MIN_CONFIRMATIONS` (default 1)" | That variable only templates the **Lock Server's** `[paykit] minimum_confirmations` (`locks-server/entrypoint.sh:32`, `:100`). The marketplace physical-bitcoin path never touches the Lock Server. Its effective threshold is `confirmations >= 1`, hardcoded at `paykit-server-fork/…/persistence/invoices.rs:702-707`. Changing the variable has **no effect** on marketplace orders. |
| 3 | "paykit-server checks for an exact amount match" | Greater-or-equal **today**: `let amount_matched = present && observed_sats >= required;` (`invoices.rs:694`). Overpayment confirms; underpayment does not. **r3 changes this deliberately** — §B.8.2 makes the predicate exact so that the per-invoice amount nonce is load-bearing, and overpayment routes to `manual_review` instead of confirming. The survey's claim is wrong about the current code and describes the target. |
| 4 | The BTC checkout flow runs proof-bundle → Lock Server → invoice | That is the **digital-content Locks** path (`mp-oneauth/…/commerce.ts:863-918`). A **physical** bitcoin order binds at `POST /v0/orders/{id}/payment-method` and marketplace-service creates a lock-free payment request itself via `POST /v0/payment-requests` (`marketplace-service/…/payments.rs:737-775`). No Lock Server, no content lock, no proof bundle. |
| 5 | Implied: the window is `LOCKS_PAYMENT_WINDOW_SECONDS` | Bitcoin orders are bounded by `FIAT_PAYMENT_WINDOW_SECONDS` — the payment-method bind is the lock point for all three rails (`config.rs:37-41`, armed at `payment_methods.rs:548-553`). `LOCKS_PAYMENT_WINDOW_SECONDS` arms only `payment.register_locks` (`executor.rs:226`). |
| 6 | "Can the watcher be pointed at an arbitrary existing mainnet address? No." | Correct as to *arbitrary* addresses, but it hides the defect: the observer does a **full address-history scan from genesis** (`observer.rs:136-155`; bdk calls `batch_script_get_history` and fetches every transaction — `bdk_electrum_client.rs:290-292`, `:316-318`). Pre-existing outputs count, and **already-spent** outputs count, because the observer enumerates each transaction's outputs by script (`observer.rs:190-206`) and never consults the UTXO set. §B.4 is the fix. |
| 7 | "The client validates the key with `isPlausibleAccountXpub`." | That function checks prefix, length 100–120 and base58 charset — nothing else (`mp-oneauth/src/libs/commerce/payment-methods.ts:84-94`). It accepts `zpub`/`vpub`, which paykit-server's `Xpub::from_str` rejects outright (only `0488B21E`/`043587CF` — `bitcoin-0.32/src/bip32.rs:791-803`), so a `zpub` is a client-side false accept and a server-side `invalid_xpub`. |
| 8 | "There are no environment variables for the Bitcoin network" | True but misleading: the network is a **literal** at `pubky-payment-rails/paykit-server/entrypoint.sh:150`. Switching it is a code change plus redeploy. |
| 9 | The client sends `{auth_token, account_xpub, account_index}` | It does, but `account_index` is hardcoded to `0` (`mp-oneauth/src/core/services/marketplace/marketplace-paykit-claim.ts:122`), while the server accepts an arbitrary index (`http/accounts.rs:149`, `:164`). §C.10 closes that asymmetry deliberately. |
| 10 | Not mentioned at all | **Both stacks share one paykit-server.** Staging reaches it at `PAYKIT_SERVER_URL=http://paykit-server.railway.internal:3001`; production reaches the **same** Railway service in project `pubky-marketplace-staging` over its public domain `https://paykit-server-production.up.railway.app` (Railway CLI, 2026-09-09; consistent with `HANDOFF.md`). Since the Bitcoin network is a property of that one service, "staging first" is impossible without new services. This shapes §B and §C. |

Two smaller corrections: the survey's Electrum inventory omits the mainnet hosts
(`ssl://bitkit.to:9999` on both wallets — `bitkit-android/…/Env.kt:285`,
`bitkit-ios/…/Env.swift:184`), and calls bitkit-android's mainnet constant
Esplora when it is an Electrum URL named `ESPLORA`.

---

## A. Current state (verified)

| Layer | Where it is set | Today (both stacks) | Citation |
| --- | --- | --- | --- |
| Bitcoin network | Literal in the generated TOML | `regtest` | `pubky-payment-rails/paykit-server/entrypoint.sh:150` |
| Network is immutable per database | `deployment_metadata` written on first boot, compared on every boot | mismatch ⇒ `StartupError::Deployment` | `persistence/deployment.rs:30-64`; `startup.rs:47-50` |
| Endpoint identifier advertised to wallets | Derived from the network at construction | `btc-regtest-p2wpkh` | `create_invoice.rs:163-173`; wired `server.rs:190`, `:208` |
| Chain data source | `PAYKIT_ELECTRUM_ENDPOINT` | `tcp://fulcrum.railway.internal:50001` (Railway CLI, 2026-09-09) | `entrypoint.sh:24`, `:152-153` |
| Poll cadence | Literal `[electrum] poll_interval` | `1s` | `entrypoint.sh:154`; loop `server.rs:576-608` |
| Address derivation | BIP84 `m/84'/…'/account'/0/index` from the seller's claimed xpub; network kind checked | `bcrt1…` | `create_invoice.rs:246-280` |
| Derivation index | `creators.next_child_index`, `DEFAULT 0`, `+1` per new (reader, bundle) | starts at 0 | `invoices.rs:733-741`, `:795-797`, `:822-829`; `migrations/0001_initial.sql` |
| Seller claim (server) | `POST /v0/accounts/claim`; parsed by `Xpub::from_str`, canonicalized to 78 bytes, validated by `validate_xpub` (which derives `0/0` as its check) | tpub only | `manual_claim.rs:288-295`; `real_setup.rs:343-353`; immutable once set (`bitkit_claim.rs:69-74`) |
| Seller claim (client) | `isPlausibleAccountXpub` — prefix, length, charset. No network awareness. | identical on both stacks | `payment-methods.ts:84-94`; `account_index: 0` at `marketplace-paykit-claim.ts:122` |
| Confirmation threshold | Hardcoded: `confirmed` once `reported_confirmations != 0` | 1 conf | `invoices.rs:695-707`; consumed `payments.rs:812-818` |
| Amount predicate | `observed_sats >= required` | ≥ | `invoices.rs:694` |
| Hold window (bitcoin) | `FIAT_PAYMENT_WINDOW_SECONDS`, default 3600 | 3600 s | `config.rs:37-41`, `:127-130` |
| Late settlement | A confirmation arriving after the payment expired routes to `manual_review`, never to `paid` | correct today | `workers.rs:787-820` |
| Marketplace poll cadence | `PAYKIT_POLL_SECONDS`, default 15 | 15 s | `marketplace-service/…/config.rs:143-145` |
| Sandbox gate | `SANDBOX_PAYMENTS_ENABLED` | staging `true`, production `false` (read live) | `config.rs:84-94`; gate `executor.rs:202-207` |
| Bitkit mainnet Electrum | Build-flavour constant | `ssl://bitkit.to:9999` | `Env.kt:285`; `Env.swift:184` |

### What the flow actually is, for a physical bitcoin order

1. Buyer checks out. Order `pending_payment`, payment `awaiting_entitlement`, `payments.adapter = 'sandbox'` (schema default, `0009_payment_methods.sql:25`).
2. Buyer binds Bitcoin: `POST /v0/orders/{id}/payment-method`. This is the lock point — it takes the inventory hold, arms `FIAT_PAYMENT_WINDOW_SECONDS` (`payment_methods.rs:548-553`), requires a SAT/BTC-denominated order (`:435-446`), and flips the adapter to `paykit` (`:593`, `:675-681`).
3. In the same request marketplace-service signs and calls `POST /v0/payment-requests` with `{amount_sats, creator, reader, reference}` (`payments.rs:737-758`). If paykit refuses, nothing is bound.
4. paykit-server validates the signature, discovers the **buyer's** Paykit receiver marker, loads the **seller's** xpub, derives the next BIP84 address, persists the invoice atomically, and queues outbox delivery of the Payment Request (`create_payment_request.rs:109-205`).
5. The observer scans that address on every tick (`server.rs:576-608` → `observer.rs:245-257` → `invoices.rs:520-713`).
6. marketplace-service polls `POST /transactions/status` (`payments.rs:778-822`) and applies the outcome (`workers.rs:966-1006`).
7. The buyer never sees an address in Shop; the Payment Request is delivered privately to the wallet and Shop shows status only.

### Regtest-only assumptions that actually bite

- `[bitcoin] network = "regtest"` (`entrypoint.sh:150`) is the only place the chain is named.
- Every persisted claim is a tpub, and `derive_bip84_p2wpkh_address` refuses a network-kind mismatch (`create_invoice.rs:257-270`). Flipping the existing service to mainnet makes every existing seller un-derivable.
- **Flipping is impossible, and not for the reason r1 gave** (P3-J). r1 said a flipped service would run with a poisoned observer. It would not run at all: `deployment_metadata` records `bitcoin_network` on first boot and `DeploymentStore::initialize` returns `DeploymentMismatch` on any change (`deployment.rs:53-64`), which `initialize_database` maps to `StartupError::Deployment` **before the HTTP listener binds** (`startup.rs:39-50`). The poisoned-observer failure (`observer.rs:126-134`, `:236-241`: one `bcrt1…` target fails the entire batch, permanently, for every seller) is what *would* happen if that guard were removed — which is exactly why §C never shares a database between networks. This behaviour is also the free negative miswiring gate in §B.1.
- `mp-oneauth/src/test/live/locks-payment.live.ts` drives `bitcoin-cli -regtest` and exercises the Locks/digital path, not the marketplace order path. Prior art for style only.

---

## B. Target state

**Mainnet BTC on isolated rails: a production mainnet paykit-server + Postgres,
and a separate staging/proof mainnet paykit-server + Postgres, standing beside
the untouched regtest service — plus a post-invoice eligibility rule in the fork
without which none of this is safe to run with real money.**

### B.1 Three stacks, no shared database (P1-C, Q1)

| Stack | Project | Service | Database | Purpose |
| --- | --- | --- | --- | --- |
| regtest | `pubky-marketplace-staging` (`c991d768`) | `paykit-server` (existing, untouched) | existing `paykit-postgres` | development, REGTEST-POS proof |
| proof | `pubky-marketplace-staging` | `paykit-server-proof` (new) | `paykit-proof-postgres` (new) | MAINNET-NEG, MAINNET-DERIVE, staging Shop |
| production | `pubky-marketplace-production` (`75faa4fe`) | `paykit-server-mainnet` (new) | `paykit-mainnet-postgres` (new) | real money only |

Rules that follow from this, and are not negotiable:

- **The proof database is never promoted.** After §D it is dropped, not cleaned.
  Row-level cleanup is unreliable: `0001_initial.sql:21-108` is
  `ON DELETE RESTRICT` throughout, so a partial delete leaves orphan targets
  that keep hammering Electrum forever (§E).
- **Production is created empty, after the fork changes land**, so it never
  contains a pre-floor (record V1) invoice.
- **Separate trust keys per stack.** `PAYKIT_MASTER_KEY`,
  `PAYKIT_REQUEST_SIGNING_KEY` and the `MARKETPLACE_TRUSTED_PUBLIC_KEYS` entry
  are per-stack and generated at the moment that stack needs them. Production
  keys are not created while the proof stack is being built.
- **Stack role is a deployment invariant.** Add `stack_role` (`production` |
  `proof`) to `DeploymentInvariants` alongside `bitcoin_network` and
  `receiver_path`. Because `DeploymentStore::initialize` compares every field
  (`deployment.rs:53-58`), a proof database can never be booted by a production
  config, or vice versa — the server refuses to boot. This is also what gates
  the deny-list in §B.6.
- **Negative miswiring gate, tested not assumed:** point a mainnet config at a
  regtest-initialised database and assert the process exits before binding, with
  `StartupError::Deployment`. Same for a proof database under a production
  config. Both are CI tests in the fork *and* a scripted pre-cutover check.

### B.2 Chain data source

**Recommended: `PAYKIT_ELECTRUM_ENDPOINT=ssl://bitkit.to:9999`** — Synonym's own
mainnet electrs, the exact server both Bitkit mainnet builds use
(`Env.kt:285`, `Env.swift:184`). `ssl://` passes the adapter's scheme check
(`observer.rs:61`) and TLS is compiled in (`Cargo.toml:18`, `use-rustls-ring`).
It adds no new third party.

Rejected for this week: running mainnet bitcoind + Fulcrum on Railway. Fulcrum
needs a non-pruned node — >700 GB of blocks plus roughly 100 GB of index — and a
multi-day-to-multi-week IBD on shared vCPU, redone from scratch if the volume is
lost. Railway's per-volume ceiling is **UNVERIFIED**; the storage figure alone
makes it a project. Keep it as the scheduled sovereign-infrastructure item.
`ssl://electrum.blockstream.info:50002` is documented in the runbook as the
failover value only — an unrelated operator with no SLA and aggressive limits.

### B.3 Address trust: what the watcher can and cannot detect

A dishonest Electrum supplies the address history, the transaction bytes, the
headers and the merkle proofs. The only cross-check bdk performs is that a
merkle proof reconstructs the root of a header **the same server supplied**
(`bdk_electrum_client.rs:527-551`). No proof-of-work validation, no header-chain
continuity beyond a single genesis agreement point (`:608-657`, driven from the
genesis checkpoint at `observer.rs:136-139`).

It **can** fabricate a confirmed payment and drive an unpaid order to `paid`
(the loss falls on the **seller**; the marketplace holds no funds); withhold, so
real payments never confirm and orders expire; and head-of-line the whole
deployment, because all non-final invoices go in one batch and one malformed
observation fails the batch (`observer.rs:259-322`).

It **cannot** steal or move funds — the rail is watch-only end to end:
paykit-server persists an account xpub and nothing else
(`manual_claim.rs:288-295`), derives with `Secp256k1::verification_only()`
(`create_invoice.rs:276`), and has no Bitcoin signing path; the ed25519 keys
present (`PAYKIT_MASTER_KEY`, `PAYKIT_REQUEST_SIGNING_KEY`, `LOCKS_KEYPAIR_SEED`)
authenticate requests and seal records and cannot produce a Bitcoin signature.
It cannot redirect payment — the address is derived server-side from the
seller's own claimed xpub and committed with a lookup hash before any
observation is accepted (`invoices.rs:880-897`, re-verified on every read at
`:269-284`). It cannot confirm on the wrong chain — genesis agreement fails as
`ObserverError::WrongNetwork` (`observer.rs:226-233`).

**Certificate pinning: decided against, explicitly** (Kimi P3). rustls does
standard CA validation, which blocks the network MITM. Pinning `bitkit.to`'s
certificate would turn a routine certificate rotation into a silent total
confirmation outage — the failure mode this design is most concerned about —
and it does not defend against the case that actually matters, which is the
endpoint operator itself being wrong or compromised. Corroboration by a second
independent server is the defence that addresses that, and it is scheduled.

Reorg exposure is real and is Q10: paykit-server watches to 6
confirmations and would see a disappearance (`observer.rs:208-221`), but
marketplace-service confirms at the first confirmation and has no un-confirm
edge (`workers.rs:822-826`). Do not describe 1-conf as reorg-safe.

Two independent Electrum servers are not in this switch: the config carries one
endpoint string (`entrypoint.sh:152-153`) and `ElectrumPort` is a single-source
trait (`observer.rs:28-33`); corroboration means new code, an agreement policy
and a disagreement escalation path — a wave of its own, and it must be audited.

### B.4 Post-invoice eligibility — the fix for P1-A and NEW-1 (blocking, before production)

The defect in one sentence: an established seller claims their real BIP84
account, the server derives `0/0` of that account, and their **own old
receipts** at that address confirm their first unpaid order. Nothing about this
requires a dishonest party, and §C.10's "confirm the address in your wallet"
gate makes it *more* likely by encouraging use of an existing account.

**What r2 got wrong, and what changed.** r2 made a chain-height floor the
primary defence and classified mempool outputs by the invoice's own first
observation tick. Sol's NEW-1 showed that ordering is unsound: an unrelated
transaction sitting in the mempool *before* the invoice exists can be mined at
`H+1` and be seen for the first time as **confirmed above the floor** on tick 1.
It never appears as an unconfirmed output at all, so the first-tick rule never
classifies it, and the height rule admits it. r2's stated reason for avoiding a
creation-time snapshot — that the derived address is not known until inside
`create_atomic` — was a real constraint but the wrong conclusion. §B.4 now
resolves it by moving the snapshot **after** the allocating transaction commits
and **before** the Payment Request is published, which is a window that already
exists in the code.

**The baseline snapshot is now the primary defence. The height floor is
secondary.** Neither is sufficient alone and both ship.

#### B.4.1 Creation-time baseline snapshot (primary)

Ordering, precisely:

1. `create_atomic` runs unchanged: `SELECT … FROM creators … FOR UPDATE`
   (`invoices.rs:733-740`) allocates the index, and allocation, increment,
   invoice and outbox row persist in one transaction committed at `:940`. The
   invoice is written in a new non-observable state **`awaiting_baseline`**, and
   the outbox row is written **not deliverable**.
2. `observation_targets()` (`invoices.rs:239-251`) is amended to exclude
   `awaiting_baseline`. Until the baseline exists the address is not watched, so
   no observation can bind, and there is nothing to race.
3. The application layer, now knowing the derived address, issues **one Electrum
   round** for that scripthash that returns *both* confirmed history and mempool
   entries, together with the tip height from the same round.
4. On success it persists, in one transaction: the **baseline outpoint set**
   (`txid:vout` for every output paying the derived address, confirmed or
   unconfirmed), the **baseline input set** (see B.4.3), `creation_chain_height`
   from that same round's tip, and flips the invoice to `observing` and the
   outbox row to deliverable. **Publication of the Payment Request happens only
   after this commit.**
5. On any failure — Electrum unreachable, partial response, tip staleness check
   failed (B.4.4) — the invoice is flipped to the final state
   **`void_baseline_failed`** and `CreateInvoiceError::Unavailable` is returned.
   That propagates to the marketplace bind, which refuses the bind and rolls the
   marketplace transaction back cleanly; **that rollback path already exists and
   is exercised today** (`payment_methods.rs:447-553`). Nothing is bound, no
   address was published, and the buyer sees Bitcoin as unavailable rather than
   an order that cannot be paid.

`void_baseline_failed` is final, so the invoice leaves the target set
immediately and cannot accumulate (§B.7's TTL concern).

**A failed baseline burns a derivation index.** The counter was already
incremented and committed in step 1, and it is never rewound — rewinding it
would reintroduce exactly the concurrent-allocation race the `FOR UPDATE` lock
closes. A burned index is harmless: derivation is monotonic, the address was
never published to anyone, and the gap it leaves is bounded by the Electrum
failure rate. It must **not** be retried onto the same index; a retry allocates
the next one. This is stated so a reviewer does not mistake the gap for a leak.

#### B.4.2 Eligibility rule

Evaluated in `apply_bitcoin_observation_in_tx` before any binding decision.
`ObservedOutput` (`bitcoin.rs:77-85`) gains `confirmed_height: Option<u32>`,
taken from `anchor.block_id.height`, which the observer already iterates
(`observer.rs:167-173`), and carried through `validate_batch` into
`BitcoinObservationInput`.

An outpoint is **eligible** iff both hold:

- it is **not in the baseline outpoint set** and does not inherit baseline
  status by B.4.3; **and**
- it is either confirmed at `height > creation_chain_height`, or it was first
  seen unconfirmed after the baseline and has since confirmed.

Consequences worth stating explicitly, because they are where r2 was wrong:

- Baseline membership is keyed on **`txid:vout` only, never on height**. A
  pre-existing mempool transaction that is mined at `H+1` after the baseline is
  in the baseline set, so it stays ineligible even though its height is above
  the floor. **This is the exact NEW-1 case and it is closed by the key choice,
  not by the ordering of ticks.**
- The height floor now only catches confirmed outputs that the baseline round
  legitimately could not contain, which after B.4.1 means outputs mined after
  the snapshot. It is a cheap second gate, not the mechanism.
- An ineligible output writes **no** observation row, changes **no** status, and
  returns `Ok(true)` — it must never return an error, or one old output would
  head-of-line the entire batch (`observer.rs:259-322`).
- Eligibility is re-evaluated on every observation, so a payer whose transaction
  entered the mempool after the baseline confirms normally, with `detected` at
  0 confirmations on the first tick that sees it.

#### B.4.3 RBF replacement of a baseline transaction

A baseline mempool transaction that is fee-bumped is rebroadcast under a **new
txid**, so its outputs are not in the baseline outpoint set and would otherwise
become eligible the moment they confirm above the floor. That is the same
false-paid outcome by another route, and a reviewer should expect it to be
handled.

The baseline therefore also records the **input outpoints** of every
*unconfirmed* baseline transaction. Any later transaction paying the derived
address that spends **any** baseline input is a replacement of a baseline
transaction, and its outputs to that address **inherit baseline status** and are
permanently ineligible. Confirmed baseline transactions contribute no inputs —
they cannot be replaced.

This over-rejects in one narrow case: a payer who deliberately spends a UTXO
that a pre-existing baseline transaction was also spending. That resolves to
non-payment and `manual_review`, never to false paid, which is the correct
direction to fail.

#### B.4.4 Stale tip, slow Electrum, reorg

- **Stale tip.** `creation_chain_height` is taken from the **same Electrum round
  as the snapshot**, never from an earlier or cached read, so the floor and the
  baseline describe the same moment. Before the flip to `observing`, that tip is
  compared against the §B.7 active health probe's tip: creation fails closed
  unless the snapshot tip is within **3 blocks** and the probe response is less
  than **two poll intervals** old. A stale tip therefore cannot silently widen
  the confirmed-height interval; and because baseline membership dominates the
  height rule, a stale tip cannot reopen the NEW-1 case at all.
- **Slow Electrum.** A snapshot that returns an error, a timeout, or a response
  the adapter cannot fully parse is a failure, not an empty baseline. There is
  no "assume no history" branch anywhere on this path. The residual is narrower
  and real: a transaction that is **in the network's mempool but has not reached
  the server's single Electrum** at snapshot time is absent from the baseline
  and can later confirm above the floor. One Electrum cannot close this. It is
  carried as residual **R1** in §B.10, is bounded by §B.8's amount nonce, and is
  eliminated for sellers on a Shop-exclusive account because nobody else knows
  the address. It is a stated reason Q4 (single-Electrum trust) matters.
- **Reorg across the floor.** A reorg can move a transaction's height. Because
  baseline membership is by `txid:vout`, **a reorg-moved baseline outpoint stays
  baseline** — its height changing is irrelevant to the test that excludes it.
  In the other direction, a deep reorg can re-mine a legitimate post-invoice
  payment at a height at or below `creation_chain_height`; the height gate then
  refuses it and the order resolves to expiry and `manual_review` rather than
  `paid`. That is a fail-safe degradation, not a false paid, and it is disclosed
  under Q10 with the rest of the reorg exposure.

#### B.4.5 Record and migration

Bump `InvoicePaymentRecordV1` (`invoices.rs:55-60`) to **V2**, adding
`creation_chain_height: u32` and the SHA-256 of the canonicalized baseline set,
so the floor and the baseline are sealed and authenticated with the amount and
the address and are already decrypted at observation time
(`invoices.rs:550-565`). On mainnet a V1 record is a hard error, not a fallback;
production and proof databases are created after this lands, so V1 never exists
there.

Migration `0002`: `invoices.baseline_state` (`awaiting_baseline` | `observing` |
`void_baseline_failed`), `invoices.creation_chain_height INTEGER NOT NULL`,
`invoice_baseline_outpoints (invoice_id, txid, vout, kind)` where `kind` is
`output` or `replaced_input`, the outbox deliverability flag, and the V2 record.
Rollback is forward-only; the mainnet databases are new.

### B.5 Address-index safety at claim time (P1-A, part 2)

The floor stops old outputs from paying an invoice. It does not stop the server
from deriving onto an address with 176 transactions of history, which is a
privacy leak for the seller, an Electrum-budget problem (§B.7), and a
correctness cliff if the floor is ever bypassed. So the claim path also scans.

**Both mechanisms, with the scan as the enforcing one:**

- Seller-facing copy recommends a **dedicated, unused account** (§C.10), because
  it makes everything else trivially safe. **r3 makes this more than a
  recommendation:** §B.8.1 supplies a Bitkit-issued Shop-exclusive account, and
  under the recommended answer to Q9 it is the only mainnet claim path. The scan
  below stays regardless — it is what covers a hand-pasted account, the proof
  stack, and any future non-Bitkit wallet.
- The server does not trust that. At `POST /v0/accounts/claim`, a new
  `ChainHistoryPort` (same adapter) derives `0/0 … 0/19` and issues a single
  batched `blockchain.scripthash.get_history` for the 20 scripts. Only presence
  of history is needed, so no transactions are fetched. Windows of 20 continue
  forward until a fully-empty window is found — the BIP44 gap limit means a
  standards-compliant wallet cannot have a used address beyond an empty window
  of 20. If no usage is found the start index stays **0**; only when usage is
  found is it initialised to `last_used_index + 1 + 20`. Keeping the offset at
  zero for the recommended dedicated-account case matters: the offset consumes
  the seller's own gap limit before Shop has derived anything (Kimi, §E).
- **Electrum cost:** 1 batched round-trip (20 scripthash queries) for the
  common unused-account case; worst case 50 round-trips (1,000 addresses) before
  the claim is refused with "use a fresh account" — which also bounds the cost.
  Claims are already rate-limited (`http/accounts.rs:153-160`).
- If the scan cannot reach Electrum, the claim is **refused**, not defaulted to
  index 0. An unscanned claim is exactly the P1-A condition.
- The claim response returns the resulting `next_child_index` so the client can
  show the seller the *actual* first address (§B.6), not an assumed `0/0`.

### B.6 Ownership, key identity, and the deny-list (P2-F, claim 9, G)

- **Preview derives from the exact bytes submitted.** The client normalizes
  (`zpub` → `xpub` by SLIP-132 version rewrite, after base58check validation and
  exact version-byte recognition), and derives the preview address from the
  **normalized string it is about to POST** — never from the pasted text. A
  preview computed from different bytes than the server stores proves nothing.
- **Server returns a fingerprint.** `validate_xpub` already receives the
  canonical `&[u8; 78]` serialization (`real_setup.rs:343-353`) and already
  derives `0/0` as its validity check. The claim response
  (`http/accounts.rs:170-174`) gains `key_fingerprint` (hex of the first 8 bytes
  of SHA-256 over those 78 bytes), `first_derived_address` (at the scanned start
  index) and `next_child_index`. The client recomputes the fingerprint locally
  and refuses to enable `bitcoinEnabled` on mismatch. Future work, not this
  wave: a signed ownership challenge, which requires a message-signing path the
  wallet does not expose today.
- **Deny-list on canonical key data, not on strings.** `Xpub::encode()`
  normalizes version bytes, so the xpub and zpub encodings of the same key
  produce identical 78 bytes; deny on the 65-byte tail (33-byte public key +
  32-byte chain code) inside `validate_xpub` and both are caught by one entry.
  The list contains the **first 20 accounts** of the BIP39 `abandon…about`
  mnemonic, not just account 0 (Kimi P3), plus their derived first addresses
  (belt-and-braces, using the address `validate_xpub` already derives). It is
  enforced on **every stack whose role is not `proof`**, including regtest —
  refusing everywhere is simpler to test than a mainnet-only condition and
  costs nothing.
- **Bounded account range, revised in r3 — this is a tightening, not a
  relaxation.** r2 restricted the server to `account_index == 0` because a
  deny-list cannot enumerate account 7 of the same public mnemonic.
  §B.8 makes the opposite requirement: a Shop-exclusive account is by
  construction **account index ≥ 1**, because that is what Bitkit reserves.
  Both are satisfiable at once. `http/accounts.rs:149` accepts an arbitrary
  `account_index` while the client hardcodes `0`
  (`marketplace-paykit-claim.ts:122`); on mainnet the server instead accepts
  `1 <= account_index <= 99` and rejects   `0` and anything above 99 with named
  reasons. The bound is what keeps the deny-list enumerable: it covers accounts
  **0–99** of every known-public mnemonic rather than r2's first 20, which is
  1,000 entries at 65 bytes and is computed once at build time. Account 0 is
  refused on mainnet because it is the account a wallet spends from, which is
  precisely the collision §B.8 exists to prevent. The client stops hardcoding
  `0` and sends the index carried in the Bitkit claim payload. §C.10 surfaces
  the requirement in the UI instead of failing silently.
- **Both mainnet claim exemptions ride the same role gate.** `stack_role = proof`
  exempts a claim from the deny-list **and** from the account-0 refusal, because
  MAINNET-NEG must claim account 0 of the public test vector — that is where the
  176-transaction history lives (§D.1). There is still no bypass branch in the
  claim handler: it is one condition on a deployment invariant that a production
  database physically cannot boot under (§B.1). CI asserts both exemptions in
  both directions — refused under `production`, accepted under `proof`.
- **Deny-list sequencing (resolves the r1 contradiction).** The deny-list is
  enforced **unless `stack_role = proof`**, which is a deployment invariant
  (§B.1) and therefore cannot be set on a production database. There is no
  allow-listed claim path in the code — a permanent bypass branch in the claim
  handler is worse than a role gate that a production database physically
  refuses to boot under. The production boot line asserts `role=production`, and
  a CI test asserts the test-vector key is refused under `production` and
  accepted under `proof`.

### B.7 Bounded Electrum policy and an honest health probe (P2-G, P2-H)

- **Budget.** `estimated_requests = target_count + Σ history_tx_count` per tick.
  Required: `estimated_requests / poll_interval <= 5 req/s`, and a hard cap of
  **1,000 requests per tick**. `history_tx_count` is persisted per invoice from
  the previous tick's response, so the estimate is real rather than assumed.
- **Batching and deferral.** Targets are processed oldest-unobserved-first; when
  the budget is exhausted the remainder defers to the next tick. This turns
  today's "everything in one batch" into a bounded round-robin and reduces the
  head-of-line blast radius as a side effect.
- **Jitter and backoff.** ±20% jitter on the poll interval; on
  `ObserverError::Unavailable`, exponential backoff 30 s → 60 s → … → 15 min,
  reset on success.
- **Backlog alert.** Alert when the oldest target's last successful observation
  is more than 5 minutes old. That is the signal that matters: silent
  non-confirmation, not process liveness.
- **Observation TTL (Kimi P2).** A never-matching invoice is never final and so
  never leaves `observation_targets()` (`invoices.rs:249-250`). In production
  that is not harness residue: every real underpayment, and every dust output a
  griefing buyer sends to the address they were given, becomes a permanent
  per-tick rescan of that address's whole history. **The TTL is defined in §B.9
  and keyed on the Payment Request expiry, which paykit-server mints itself** —
  r2 left this underspecified because it assumed paykit-server had to be told
  the marketplace's resolution. It does not. This ships with §B.7, not after it.
- **Active health probe.** Replace `server.rs:592-597`, which reports Electrum
  `available` **without making a request** when the target set is empty. Every
  tick issues `blockchain.headers.subscribe`, checks the genesis hash for the
  configured network, and records tip height and tip age. `/health` reports
  those; `available` requires a probe response no older than two intervals.
- `[electrum] poll_interval` must be `30s` before any mainnet endpoint is
  configured. At `1s` (`entrypoint.sh:154`), a single 176-transaction history
  is ~176 requests/second against a third party — a ban, and a silent one.

#### B.7.1 Availability budget and auto-hide (NEW-5)

Sol is right that fail-closed creation is correct and that r2 never priced it.
Two separate fail-closed gates now refuse invoice creation on Electrum trouble —
the §B.4 baseline snapshot and the §B.5 claim scan — and each one turns a single
Electrum outage into **every Bitcoin checkout failing at the bind**. Refusing is
still the right behaviour: the alternative is an invoice with no baseline, which
is NEW-1 live. But it must be budgeted, visible, and degrade to "Bitcoin is not
offered" rather than "Bitcoin fails when you pick it".

- **Budget.** The Bitcoin rail carries a **99.0% monthly availability objective**
  for *offering* Bitcoin at checkout — about 7h 12m per month — measured as the
  fraction of active health probes (§B.7) that succeed. It deliberately does not
  carry the marketplace's own objective: the rail depends on one third-party-shaped
  dependency and Q4 accepts that. An outage that hides Bitcoin is a **degradation**;
  an outage that marks an unpaid order paid is an **incident**. They are not
  traded against each other.
- **Auto-hide, not fail-at-bind.** After **3 consecutive failed active health
  probes** (≈90 s at a 30 s interval), the server reports Bitcoin unavailable on
  a status field the marketplace already polls, and Shop stops offering Bitcoin
  at checkout. It re-offers after **3 consecutive successful probes**, so a
  flapping endpoint does not flip the checkout surface every tick. A buyer who
  never sees the option is a lost conversion; a buyer who picks Bitcoin and gets
  an error at the bind is a support ticket and a suspicion that money was taken.
- **Observation continues throughout.** Auto-hide gates **creation only**. Every
  existing invoice keeps being observed under the §B.7 backoff, so a buyer
  holding a delivered Payment Request is never abandoned. This is the same
  separation the §C.16 kill switch makes, and it is the reason the kill switch
  and auto-hide can coexist without a combined state to reason about.
- **Alerts.** Page on: Bitcoin auto-hidden for more than 15 minutes; auto-hide
  triggered more than 3 times in an hour (flapping, which the probe hysteresis
  masks from users but not from the operator); and the §B.7 backlog-age alert,
  which is the one that catches an endpoint answering probes while failing
  histories. Auto-hide firing at all is a ticket, not a page.
- **Runbook.** §C.17 carries the failover endpoint and the exact sequence to
  switch to it, because the operator response to a sustained auto-hide is an
  endpoint change, not a restart.

### B.8 Independent allocators — the fix for NEW-2 (blocking, before general availability)

This is the hardest finding in the review and it deserves to be stated without
softening. §B.5's claim-time scan establishes a **momentary** starting point and
nothing more. After the claim, paykit-server allocates from `next_child_index`
and the seller's wallet allocates from its own counter, with no coordination.
A busy wallet eventually reaches an index paykit has already assigned to a live
Shop invoice. When an unrelated customer then pays that address, the observation
is post-baseline and above the floor, so §B.4 admits it — correctly, because it
genuinely is a new payment to the derived address. The order flips to `paid`.

**The harm, plainly: the seller ships an item a Shop buyer never paid for.** The
buyer's money was never sent, the marketplace holds nothing, and the seller
absorbs the loss. §B.4 cannot help; it is not a history problem.

r2's answer was seller-facing copy recommending a dedicated account. Sol is
right that advice is not an invariant.

#### B.8.1 Option (a) — a Shop-exclusive account xpub

**Bitkit can export an account xpub at account index ≥ 1, on both platforms,
today.** This was checked in the source rather than assumed, and it is the fact
that decides this section:

| Fact | Android | iOS |
| --- | --- | --- |
| Exports an account xpub at an arbitrary account index | `node.exportOnchainWalletAccountXpub(NATIVE_SEGWIT, accountIndex)` — `WatchOnlyAccountRepo.kt:227-230` | `exportWatchOnlyAccountXpub(accountIndex:addressType:)` — `LightningService.swift:508` |
| Reserves a fresh index, monotonic, never reissued | `reserveAccountIndex` = `highestAccountIndex + 1`, persisted in `highestAccountIndexByWallet` — `WatchOnlyAccountStore.kt:150-174` | `reserveAccountIndex` = `highestAccountIndex + 1` — `WatchOnlyAccountService.swift:201-231` |
| Reserved indexes are always ≥ 1 | `isUsableAccount` requires `accountIndex > 0` — `WatchOnlyAccountStore.kt:259-263` | `isValidAccountIndex` requires `> 0` — `WatchOnlyAccountService.swift:282-283` |
| Derivation path | `m/84'/coinType'/accountIndex'` | same — `WatchOnlyAccountService.swift:28` |
| The wallet's **own** receive allocator is account-unscoped | `onchainPayment().newAddress()`, `newAddressInfoForType`, `revealReceiveAddressesTo` take **no account index** — `LightningService.kt:613-676` | `newAddress()` — `LightningService.swift:635-641` |
| The exported account is tracked, not spent from | `addOnchainWalletAccount` + `revealReceiveAddressesToAccount(…, 999)` — `WatchOnlyAccountRepo.kt:250-257` | `LightningService.swift:537-540` |
| Claim payload | version(1) + accountIndex(4) + addressType(1) + **78-byte** xpub — `WatchOnlyAccountRepo.kt:330-353`; 78 bytes matches `validate_xpub`'s canonical form exactly (`real_setup.rs:343-353`) | same wire format |

Two consequences follow, and both are load-bearing:

1. **A Bitkit-issued Shop account cannot collide, by construction, not by
   probability.** The wallet's spending and receiving path derives inside its
   primary account and takes no account-index argument anywhere; the Shop
   account is a different hardened BIP32 account. There is no counter to race.
2. **Gap-limit exhaustion (Kimi P3 in §E) is largely closed as a side effect.**
   Bitkit pre-reveals addresses `0…999` on a tracked account
   (`WATCH_ONLY_ACCOUNT_HIGHEST_PRE_REVEALED_ADDRESS_INDEX = 999`,
   `WatchOnlyAccount.kt:9`), so the ceiling on outstanding orders before receipts
   go invisible in the seller's wallet moves from ~20 to ~1,000.

**What is honestly not free.** The claim is delivered over a Pubky auth URL
carrying `x-bitkit-claim=watch-only-account-v1` (`PubkyAuthRequest.kt:9-14`), and
Bitkit grants it only when the requested capabilities match **exactly**
`"/pub/paykit/v0/bitkit/server/:rw,/pub/paykit/v0/private/bitkit/server/:rw"` —
set equality, not coverage (`PubkyAuthRequest.kt:17-27`,
`matchesWatchOnlyAccountCapabilities`). So there are two paths and the owner
should know which one is being taken:

- Shop requests exactly that capability set and the claim works against **already
  shipped Bitkit builds**, with no wallet release. The cost is that Shop asks for
  read-write on the seller's Paykit server paths, which is a broader grant than
  Shop needs for this purpose.
- Or Bitkit adds a Shop-specific claim type and capability set, which is the
  cleaner grant but puts general availability behind wallet distribution.

**Recommendation: take the first path for the W5 canary, and open the second as
a wallet item.** Requesting a grant broader than the purpose is worth flagging to
the owner, but it is a privacy and least-privilege concern, not a funds-loss
concern, and it is reversible; the alternative delays a P1 fix behind app-store
release cycles.

**What (a) cannot do on its own.** The server cannot tell a Bitkit-reserved
account xpub from a hand-pasted one — both are depth-3 account xpubs with a
hardened child number. So (a) is an invariant **only if Shop accepts the Bitkit
claim path alone on mainnet and disables manual xpub paste**. That is enforceable
and testable client-side, and it excludes sellers who do not use Bitkit. That
exclusion is why this is Q9 and not an engineering call.

#### B.8.2 Option (b) — make collision harmless: exact amount plus a nonce

**A correction that determines the whole mechanism: the amount predicate today
is `>=`, not exact.** `let amount_matched = present && observed_sats >= required;`
(`invoices.rs:694`, and correction #3 above). Under `>=`, an amount nonce buys
**nothing** — any colliding receipt at or above the price still matches. So the
nonce is only worth adding together with a predicate change, and they ship as one
unit:

- **Predicate.** `invoices.rs:694` becomes `observed_sats == required`.
  `observed_sats > required` reports confirmed with `amount_matched: false` and
  routes to `manual_review` (`workers.rs:827-859`) — the same path underpayment
  already takes. No funds are lost in that case; the money is at the seller's own
  address and a human resolves the order. This **deliberately reverses** the
  overpayment behaviour recorded in correction #3 and in §E, and §E is updated.
- **Nonce.** Each invoice draws `nonce ∈ [1, 999]` satoshis from a CSPRNG —
  never derived from the order id, the price, or a counter, because a predictable
  nonce is not a nonce. `required = price + nonce`.
- **The buyer sees the total.** The order's recorded total *is* `price + nonce`,
  so the buyer's checkout figure, the Payment Request amount, the receipt and the
  seller's payout all agree. The nonce is absorbed in the price, **not refunded
  on chain** — an on-chain refund would need a signing path this rail must never
  have (§C.11). At ≤ 999 sats it is far below a typical mainnet fee.
- **Honest buyers are unaffected.** Both wallets already require an exact amount
  before paying a Payment Request: iOS `acceptsPaymentAmount` is
  `amountSats == self.amountSats` (`PaykitPaymentRequestService.swift:71-73`),
  with `amountMismatch` / `wallet__payment_request_mismatch` at `:128,:138-139`;
  Android has the same equality check and error in `PaykitPaymentRequestRepo`.
  The tightened server predicate matches what the wallets already enforce.

For a colliding third-party payment to produce a false paid, it must now land on
the right address **and** equal a random amount that only the legitimate buyer
was told, at an index the third party did not choose.

#### B.8.3 Decision: (c) — both, with (a) as the invariant and (b) as the residual bound

Neither alone is sufficient, and the reasons are different rather than
symmetric. (a) is a true invariant but only for the population it covers, and it
cannot be verified server-side. (b) covers every population including sellers on
shared accounts and the R1 snapshot residual in §B.4.4, but it is a probability,
not an invariant. Together, (a) removes the collision and (b) bounds what
happens when the (a) precondition is violated in a way nobody detected — which
is exactly the failure mode a design review should assume.

#### B.8.4 The residual, as a number

**Assumptions, stated so they can be disagreed with:**

- **A1.** The exposed population is sellers **not** on a Bitkit-issued Shop
  account. On a Bitkit-issued account, collision probability is **0** — a
  different hardened account, and the wallet's receive path is account-unscoped.
- **A2.** §B.5 starts the server at `last_used + 21`.
- **A3.** The seller's wallet issues `k = 20` fresh external addresses per day
  for non-Shop business — a genuinely busy merchant.
- **A4.** The nonce is uniform on `[1, 999]` and unknown to third parties.

**Collision is near-certain, not rare, for this population.** The 21-address
buffer is consumed in about one day at `k = 20`, and after that the wallet is
allocating continuously inside the range paykit is assigning from. Over a
30-day month, P(at least one address shared with a live Shop invoice) ≈ **1**.
This is why NEW-2 is a P1 and not a hardening item.

| Configuration | P(false paid per exposed-seller-month) |
| --- | --- |
| Today (`>=`, no nonce) | ≈ 1 collision × `p_amt` ⇒ **order 10⁻¹**, where `p_amt` is the fraction of the seller's non-Shop receipts at or above the Shop listing price (plausibly 0.1–0.5). Unacceptable. |
| (b) alone — exact match + nonce | ≈ 1 collision × 1/999 ⇒ **≈ 1.0 × 10⁻³**, i.e. about one event per 83 seller-years; across 100 such sellers, about one event every 10 months. |
| (a) enforced (+ (b)) | **0 by construction** for the collision path. Remaining exposure is residual **R2** in §B.10, itself bounded by (b) at 10⁻³. |

The 1.0 × 10⁻³ figure is an **upper bound** and assumes the worst case that the
colliding receipt already falls in the correct 999-satoshi band — the seller
selling the identical item off-Shop at the identical nominal price. If the
unrelated receipt is for an arbitrary amount, it must hit one of 999 specific
satoshi values out of a very large space, and the probability is negligible.

What would move the number: widening the nonce to `[1, 9999]` buys another
factor of 10 at the cost of up to 9,999 sats of unrefunded overpayment, which
starts to be visible to a buyer; `[1, 999]` is the point where the defence is
free in practice. The number is worthless without the exact-match predicate,
which is why B.8.2 ships them together.

**This residual is Q9 and is the owner's to accept or refuse.** The engineering
recommendation is in the Q9 entry at the top: enforce (a) at general
availability by accepting only the Bitkit claim path on mainnet, which drives the
exposed population — and therefore the residual — to zero, and accept the 10⁻³
bound only if the owner chooses to keep manual xpub paste for reach.

### B.9 Payment Request expiry, observation TTL, and the drain boundary (NEW-3, and closes partial G)

`create_payment_request.rs:230` sets `proposal_expires_at: None`. A delivered
Payment Request is therefore payable forever, which is what makes r2's §C.16
drain boundary ("hold window elapsed") unsafe: the marketplace stops caring, the
observer may stop watching, and a buyer who pays afterwards moves real money and
gets neither confirmation nor `manual_review`.

Sol offered two fixes — enforceable expiry, or dual-polling the old backend.
**Pick expiry.** Dual-polling means the marketplace holds two paykit clients and
reconciles two answers for one order, which is new code on the money path with a
split-brain failure mode and no natural end. Expiry is one field that paykit
already has a slot for, and — decisively — **both wallets already parse and
enforce it, so no wallet release is required.** That was verified rather than
assumed:

- iOS refuses to even surface an already-expired request: `terms.proposalExpiresAt`
  is parsed and the initializer returns `nil` unless `parsedExpiration > now`
  (`PaykitPaymentRequestService.swift:42-50`); `isExpired(at:)` at `:61-63`;
  `accept` throws `requestExpired` at `:184-187`; the buyer-visible string is
  `wallet__payment_request_expired` (`:134-135`); pending requests are rescheduled
  on the earliest expiry.
- Android is at parity in `PaykitPaymentRequestRepo`: an `expiresAt` instant,
  `isExpired(now)`, a `RequestExpired` error, and a lifecycle state that flips to
  expired for a `PROPOSED` request past its expiry.

**Mechanism.**

- The marketplace passes `expires_at` in `POST /v0/payment-requests`
  (`payments.rs:737-758`), taken from the same hold deadline it arms at
  `payment_methods.rs:548-553`, so the two cannot drift. paykit-server refuses a
  request with a missing `expires_at`, one already in the past, or one further out
  than a configured maximum — fail closed, consistent with §B.4.
- paykit-server sets `proposal_expires_at` from that value, so the expiry is
  carried **in the request the buyer's wallet receives** and is enforced by the
  wallet before it will pay.
- Invoice states after `observing`: at `expires_at` the invoice moves to
  **`expired_tail`**, and after a bounded **24-hour** tail to **`expired_final`**,
  which leaves `observation_targets()`.
- **Observation does not stop at expiry, and nothing is silently dropped.**
  Through `expired_tail` the invoice is still observed, deprioritized behind live
  targets in the §B.7 budget. Any eligible observation in the tail is recorded
  with `late_settlement = true` and can **never** drive `paid`; the marketplace's
  existing late-settlement path routes it to `manual_review`
  (`workers.rs:787-820`), which is already correct today. A buyer who pays late
  gets a human, not silence.

**Observation TTL (closes partial G).** TTL = `expires_at` + 24 h. r2 left this
underspecified because it assumed paykit-server had to learn the marketplace's
hold and `manual_review` resolution. It does not: **paykit-server mints and
stores the expiry itself, so the TTL is computable locally with no new
contract.** Removing the dependency is the fix; adding a protocol was the wrong
shape.

**The one contract that is still needed** is for the marketplace to *shorten*
the tail and to record the money outcome: `POST /v0/invoices/{id}/resolve` with
`{resolution: paid_manually | refunded | abandoned, resolved_at}`, signed with
the same marketplace key as `POST /v0/payment-requests` and idempotent on
`(invoice_id, resolution)`.

**The state when the marketplace resolves `manual_review` after expiry** —
stated explicitly because it is the case that has no obvious answer:

- In `expired_tail`: the invoice finalizes immediately, the tail ends early, and
  it leaves the target set. This is the common case and the reason the endpoint
  exists.
- In `expired_final`: the resolution is **recorded on the invoice for audit and
  observation does not resume.** There is no un-final edge anywhere in this
  design, matching the marketplace's own one-way confirmation
  (`workers.rs:862-918`). Any funds that arrived after `expired_final` are at the
  seller's own address and are the seller's; the marketplace's record is
  authoritative for the money outcome and the reconciliation is off-rail and
  human. Stated so nobody builds expecting paykit to reconcile it.
- For an unknown invoice, or one in `awaiting_baseline` or `void_baseline_failed`:
  rejected with a named error, never silently accepted.

**The drain boundary changes** from "hold window elapsed" to **"every delivered
Payment Request is expired or final"**: no invoice in `observing` or
`expired_tail`, and `observation_targets()` empty. Because expiry is now carried
in the request and enforced by the wallet, that boundary is bounded and
computable — hold window (3600 s) plus tail (24 h). §C.16 is updated to match,
and the rollback is correspondingly slower and honest about it.

### B.10 Residuals that are named and gated rather than closed

Two exposures survive this design. Neither is papered over; each has a gate.

- **R1 — a mempool transaction the server's Electrum has not yet seen at
  snapshot time** (§B.4.4). It is absent from the baseline and can later confirm
  above the floor. One Electrum cannot close this: the baseline is only as
  complete as the single view it is taken from. **Gates:** it requires a
  transaction in flight to the exact derived address at the exact moment of
  creation, so it is empty for a Shop-exclusive account (§B.8.1) where no third
  party knows the address; it is bounded by the exact-amount nonce at ≈10⁻³
  (§B.8.4); and it is a stated reason **Q4** matters, since two-server
  corroboration is what would actually close it. Scheduled with corroboration,
  not before.
- **R2 — a seller who restores the same seed into a third-party wallet and
  points it at the Shop account index.** (a) is an invariant over Bitkit, not
  over the seed. **Gates:** §C.10 seller copy states that the Shop account is
  exclusive and that using it in another wallet can cause an order to be marked
  paid when it was not; the exposure is bounded by (b) at ≈10⁻³; and it requires
  a deliberate act against written guidance. Not closed, and not claimed to be.

Both are listed in §E and both are in scope for the W3 Kimi audit and the W3b
review, so a reviewer sees them named rather than discovering them.

---

## C. Per-layer switch table

Order of operations is the numbered column. Nothing in steps 1–10 touches
production.

| # | Layer | Exact change | Rollback | Blast radius if wrong |
| --- | --- | --- | --- | --- |
| 1 | Fork: creation baseline and post-invoice eligibility | §B.4 in full: `awaiting_baseline` state excluded from `observation_targets()`, the post-commit/pre-publication baseline snapshot of confirmed history **and** mempool with the tip from the same round, baseline outpoint and replaced-input sets, `void_baseline_failed` on any snapshot failure, V2 payment record with `creation_chain_height` and the baseline digest, `confirmed_height` on `ObservedOutput`, migration `0002`. | Revert; the mainnet databases do not exist yet. | **Critical.** Without it a legitimate seller's old receipts confirm unpaid orders (P1-A), and a pre-invoice mempool transaction mined before the first tick does the same (NEW-1). This is the gate on real money, not a hardening item. |
| 1b | Fork: exact amount predicate and invoice amount nonce | §B.8.2: `invoices.rs:694` `>=` → `==`; overpayment reports `amount_matched: false` and routes to `manual_review`; CSPRNG nonce `[1,999]` added to the required amount and carried as the order total. | Revert to `>=`; the nonce is inert without it, so revert both together. | **Critical.** This is the bound on NEW-2's residual and on R1. Reverting only one half silently removes the defence while leaving the code looking defended. |
| 2 | Fork: claim-time index scan | §B.5: `ChainHistoryPort`, gap-limit windows, `next_child_index` initialised above the last used index, refuse on Electrum failure or >1,000 scanned. | Revert. | High. Without it the server derives onto used addresses. |
| 3 | Fork: deny-list, bounded account range, fingerprint in the claim response, `stack_role` invariant | §B.6, including the revised mainnet rule `1 <= account_index <= 99` (account 0 refused) and the deny-list widened to accounts 0–99 of every known-public mnemonic. | Revert. | High — the public test key reaching a real listing is unrecoverable. Note the account rule must land **with** step 9/10, or Bitkit-issued Shop accounts are refused. |
| 4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe, **availability auto-hide** | §B.7 and §B.7.1, including the 3-probe auto-hide with 3-probe recovery hysteresis and the status field the marketplace polls. | Revert to the unbounded path only on the proof stack, never production. | High: a ban stops all confirmation silently and `/health` currently says "available". Without auto-hide, one Electrum outage fails every Bitcoin checkout at the bind (NEW-5). |
| 4b | Fork: Payment Request expiry, tail observation, resolve endpoint | §B.9: `expires_at` required on `POST /v0/payment-requests` and set into `proposal_expires_at` (`create_payment_request.rs:230`); `expired_tail` → `expired_final` with a 24 h tail; `late_settlement` observations; `POST /v0/invoices/{id}/resolve`. | Revert; but note the §C.16 drain boundary reverts with it and becomes unsafe again. | **Critical.** Without it a delivered Payment Request is payable forever and the rollback drain strands buyers (NEW-3). |
| 5 | Fork: Bitcoin creation kill switch | §C.16. | Revert. | High if absent — see P1-D and §C.16. |
| 6 | Rails repo: configurable network and cadence | `entrypoint.sh:150` → `network = "${PAYKIT_BITCOIN_NETWORK:-regtest}"`, validated against `mainnet\|testnet\|signet\|regtest` and failing closed; `:154` → `poll_interval = "${PAYKIT_ELECTRUM_POLL_INTERVAL:-1s}"`; add `PAYKIT_STACK_ROLE` and `PAYKIT_BITCOIN_CREATION_ENABLED`. Defaults leave the existing service unchanged. Update the header comment at `:14-16`. | `git revert`; defaults unchanged. | Low while the defaults hold. A typo'd network reaches `BitcoinNetwork::parse` and the server refuses to boot (`config.rs:61`) — fails closed. |
| 7 | Dockerfile | **No change** (correction #1). Recorded because the survey asked for a patch removal that does not exist. | n/a | n/a |
| 8 | **One pinned image digest across every stack** (NEW-4) | The commit containing steps 1–6 is built **once** to an immutable image digest `D`. `D` is recorded in this document's proof section and deployed to the regtest, proof and production services — a variable change alone does not rebuild (`HANDOFF.md`, Known Decisions). Every boot line prints the digest, and each of the three proofs asserts the digest it observed **equals `D`** rather than asserting "the same binary" in prose. | Redeploy the prior digest, on all three stacks together. | **Critical.** Running the old image on mainnet is P1-A live. Running *different* images under the three proofs is NEW-4: each proof passes and their conjunction proves nothing. |
| 9 | Client: network-aware validator | `payment-methods.ts:84-94`: accept `xpub`/`zpub` on a mainnet stack and `tpub`/`vpub` on regtest/testnet, each rejection named; convert `zpub`→`xpub` after checksum and exact version-byte validation; source the network from a new `PUBKY_RUNTIME_BITCOIN_NETWORK`, not from `PUBKY_RUNTIME_ENV`. If that variable is unset or unrecognised the client **refuses claims with a named reason** and never guesses a network (Kimi P3), matching the existing fail-closed treatment of unset real-payment URLs (`runtime-config.schema.ts:195`). | Revert; the server stays authoritative. | Medium. Too permissive ⇒ opaque `invalid_xpub` (today). Too strict ⇒ sellers blocked. Never loosen the server. |
| 10 | Client: **Bitkit Shop-account claim path**, first-address preview, confirmation gate, disclosures | Add the Bitkit watch-only claim flow (§B.8.1): Shop presents a Pubky auth URL with `x-bitkit-claim=watch-only-account-v1` and exactly the capability set Bitkit matches on, receives the 84-byte payload, and submits its `account_index` (≥ 1) and 78-byte xpub — the client stops hardcoding `account_index: 0` (`marketplace-paykit-claim.ts:122`). On mainnet this is the **only** claim path if Q9 is answered as recommended; manual paste stays available on regtest and proof. Keep everything r2 required: preview derived from the exact normalized bytes being POSTed (§B.6), `key_fingerprint` and `first_derived_address` compared after the claim, address shown at the **scanned start index**, and `bitcoinEnabled` gated on the seller confirming that address in their own wallet. Disclose, before the claim: irreversibility, xpub privacy, **the chain-data operator's view** (every watched address is queried every 30 s from one client, so that operator can cluster a seller's addresses over time and correlate order timing — Kimi P3), **that the Shop account is exclusive and using it in another wallet can mark an order paid when it was not** (residual R2, §B.10), and that the order total includes a small unique amount (§B.8.2) which must be paid exactly. | Revert to manual paste; that re-exposes NEW-2 to the 10⁻³ bound, so it is a Q9-level decision, not an operator one. | High if skipped — §E, "Seller pastes a valid but wrong xpub", and NEW-2. |
| 11 | Rails README policy | Replace `README.md:12-13`: "This repo deploys Bitcoin networks side by side: regtest for development, mainnet for the live marketplace rail. The mainnet stacks are **watch-only**: no component here may hold a Bitcoin private key, seed, mnemonic, or a descriptor containing private material. paykit-server persists account xpubs and derives with `Secp256k1::verification_only()`; any change that gives it the ability to sign must be refused. A mainnet service may only use a first-party Electrum endpoint; a third-party endpoint, or sharing a database between networks or stack roles, requires owner sign-off and a Kimi audit." | Revert. | Low mechanically, high as governance: the replacement must name the invariant that still holds, or the reversal reads as "no rules". |
| 12 | Railway objects (proof, then production) | Per §B.1, created by the IaC script in W1.6, not by hand. Variables per stack (names only): `PAYKIT_BITCOIN_NETWORK`, `PAYKIT_STACK_ROLE`, `PAYKIT_ELECTRUM_ENDPOINT`, `PAYKIT_ELECTRUM_POLL_INTERVAL`, `PAYKIT_BITCOIN_CREATION_ENABLED`, `PAYKIT_DATABASE_URL`, `PAYKIT_MASTER_KEY`, `PAYKIT_REQUEST_SIGNING_KEY`, `PAYKIT_TRUSTED_LOCKS_PUBLIC_KEY`, `PAYKIT_SETUP_ALLOWED_ORIGINS`, `MARKETPLACE_TRUSTED_PUBLIC_KEYS`. Production keys are generated at production time, not earlier. | `railway down` the service; drop the database. | **Critical if wrong.** Sharing a database across networks or roles is refused at boot (§A), which is the intended outcome; sharing one *between stacks of the same role* is the P1-C failure and is not refused by anything. |
| 13 | Boot and miswiring verification | Boot line shows network, `stack_role`, endpoint and built revision (`entrypoint.sh:163`). Run the negative gate: a regtest-initialised database under mainnet config must exit with `StartupError::Deployment`; a proof database under a production config likewise. `/health` shows a real tip height and age (§B.7), not an empty-target "available". | n/a | Low. |
| 14 | **Staging/proof cutover** | Staging `marketplace-service`: `PAYKIT_SERVER_URL` → `http://paykit-server-proof.railway.internal:3001`, then `railway redeploy -s marketplace-service`. Vercel `pubky-marketplace-staging`: `PUBKY_RUNTIME_PAYKIT_SETUP_URL` → the proof service's public URL; redeploy. | Both back to the regtest service. | Medium. Staging sellers must re-claim; in-flight staging orders stall and expire at 3600 s. Announce before, not after. |
| 15 | Hold window and confirmation floor | Leave `FIAT_PAYMENT_WINDOW_SECONDS` unset (3600 s). `LOCKS_PAYKIT_MIN_CONFIRMATIONS` does nothing here (correction #2). If Q3 is answered "2 confirmations", that is a fork change at `invoices.rs:702-707` plus a status-contract note, landed with step 1. | n/a | Low if left alone; the danger is believing a variable did something it did not. |
| 16 | Bitcoin creation kill switch and drain-safe rollback (P1-D, NEW-3) | `PAYKIT_BITCOIN_CREATION_ENABLED` (default `true`). When `false`, `create_payment_request` refuses new binds with a distinct `bitcoin_creation_disabled` error and the marketplace bind fails cleanly; **the observer keeps polling every existing mainnet invoice**. Rollback order, exactly: (1) set it `false` on the mainnet service and redeploy; (2) confirm Shop no longer offers Bitcoin at checkout; (3) **drain to the NEW-3 boundary** — wait until **every delivered Payment Request is expired or final**: no invoice in `observing` or `expired_tail`, `observation_targets()` empty, and no `awaiting_entitlement` paykit payments. Bounded by the hold window (3600 s) plus the §B.9 tail (24 h), so the honest worst case is **just over a day, not an hour**; (4) only then repoint `PAYKIT_SERVER_URL` and redeploy; (5) announce. r2's boundary — "hold window elapsed" — was unsafe: expiry of the marketplace hold does not invalidate a delivered address, so repointing at that point strands buyers who pay correctly into a database nobody polls, and the late-settlement `manual_review` net (`workers.rs:787-820`) never fires. §B.9's enforceable expiry is what makes the safe boundary finite; without it the drain never completes. | The kill switch is itself the rollback. | **Highest.** This is the difference between a reversible cutover and lost buyer money. |
| 17 | Docs | `pubky-payment-rails/README.md` (env sections `:121`, `:134`, pinned revisions); `pubky-payment-rails/docs/wallet-leg.md:37-40` (not an `mp-oneauth` path) becomes network-specific; `mp-oneauth/docs/ecommerce/status.md:7` and `:150` ("Could this take real money today?" now answers **yes**, with the review waiver stated in the owner's words); `runbook-production.md` gains a Bitcoin-rail section carrying §C.16 verbatim plus the failover endpoint, **the §B.7.1 auto-hide behaviour and its alerts** (so an operator paged at 3 a.m. knows Bitcoin hiding itself is the designed response, not the incident), and **the §B.9 drain boundary with its ~25 h worst case** stated in hours rather than implied; `HANDOFF.md` loses "Money rails remain test networks". | Revert. | Low mechanically. High if skipped: the runbook is what an operator reads at 3 a.m., and r2's runbook would have told them to drain in an hour. |
| 18 | **Production cutover — owner sign-off gate** | Only after §D's proofs (MAINNET-NEG, D.2-S, D.2-B, REGTEST-POS), W3 Kimi SHIP, W3b and W3c SHIP, and Q3, Q4, Q8, Q9 and Q10 answered. Add the production Shop origin to `PAYKIT_SETUP_ALLOWED_ORIGINS`; set `PAYKIT_SERVER_URL` on production `marketplace-service` and redeploy; set `PUBKY_RUNTIME_PAYKIT_SETUP_URL` on Vercel and redeploy. | §C.16, then both variables back to the regtest service. Independently, `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable` remains the whole-rail kill switch (`runbook-production.md`). | **Highest.** Real funds from here. Every production seller must re-claim; a seller who does not re-claim sees Bitcoin unavailable rather than losing money (`payment_methods.rs:570-585` refuses the bind). |
| 19 | Bitkit | **No wallet-side change.** Users already hold mainnet Bitkit; it already uses `ssl://bitkit.to:9999` and already accepts the `btc-bitcoin-p2wpkh` identifier the mainnet server advertises. Confirmed by reading both Env files. | n/a | n/a |
| 20 | `SANDBOX_PAYMENTS_ENABLED` interplay | **Leave staging `true`.** `payment.sandbox_advance` refuses any payment whose `adapter != "sandbox"` (`handlers/payment.rs:60-65`) and binding Bitcoin sets `paykit` (`payment_methods.rs:593`). The residual risk is a sandbox-advance **before** any rail is bound, so every §D harness asserts `payments.adapter == 'paykit'` immediately after the bind and before any status assertion. Side effect: `true` disables local pickup on staging (`lib.rs:76`, `handlers/pickup.rs:70`), so the proofs use **shipping** listings. | n/a | Low, given the adapter gate. Worth a runbook line because the flag's name suggests more reach than it has. |

---

## D. The proofs

r1 proposed one proof whose PASS depended on the watcher accepting pre-invoice
history. §B.4 removes that behaviour, so that PASS is now impossible by
construction — correctly. The work splits into four proof units with narrower
and honest claims — MAINNET-NEG, MAINNET-DERIVE's seller and buyer legs, and
REGTEST-POS — plus a fifth leg that only a human with money can perform.

**Stated plainly, up front: no agent proves a live mainnet positive
confirmation.** The owner will not fund an on-chain transaction for an agent,
and historical replay is not a payment simulation once the floor exists. The
first live mainnet confirmation is the commerce team's own small real payment in
the W5 canary. Everything below is what *can* be proven without spending.

### D.0 One artifact, or the proofs do not compose (NEW-4)

Sol's NEW-4 is the observation that three passing proofs of three different
binaries prove nothing about the binary that takes real money. r2 invited exactly
that: §B.1 called regtest "existing, untouched" while §D.3 claimed REGTEST-POS
exercised the same new binary and floor, and W2.4 never asserted a redeploy.

The rule for r3, and it is mechanical rather than aspirational:

- The commit containing §C steps 1–6 is built **once**, to an immutable image
  digest **`D`** (§C.8). `D` is recorded in the wave's proof log.
- `D` is deployed to **all three** services: regtest, proof-mainnet, and later
  production. Regtest is no longer "untouched" — it is **redeployed onto `D`**,
  and W2.4 asserts that before running.
- Every boot line prints the digest, and **each proof begins by asserting the
  digest it observed is byte-equal to `D`.** A proof that cannot read the digest
  fails rather than proceeding.
- The proofs then compose over one artifact: MAINNET-NEG shows `D` refuses
  real mainnet history and mempool; MAINNET-DERIVE shows `D` produces a Payment
  Request a real mainnet Bitkit ingests; REGTEST-POS shows `D` completes a
  positive payment transition. Production runs `D`.
- The claim this licenses, stated exactly: **every leg of the journey has been
  exercised on the deployed artifact, and only the on-chain mainnet payment leg
  has not.** That is the honest conjunction; §D.4 remains the list of what it
  still does not cover.

### D.1 MAINNET-NEG — the primary mainnet calibration

Runs on the **proof** stack (`stack_role = proof`, so the §B.6 deny-list does
not block the claim; there is no code bypass, and production physically cannot
boot with that role — §B.1).

**Asserted preconditions, not prose** (Kimi P3): the harness refuses to run
unless the target origin is the staging Shop, `stack_role` reported by
`/health` is `proof`, and the buyer's Paykit receiver marker belongs to the
throwaway identity this run just created. The third is the one that matters —
a real Bitkit receiving a Payment Request for 2,243,167 sats to a publicly
spendable address can really pay it, and anyone sweeps it within seconds.

Setup: fresh throwaway Pubky seller identity claims the public BIP84 test-vector
account. paykit-server rejects the published `zpub` form outright
(`bip32.rs:791-803`), so the harness submits the xpub-version encoding of the
same key.

| Field | Value |
| --- | --- |
| Published test vector (zpub, **not accepted by the server**) | `zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs` |
| Same key, xpub version bytes (**submitted**) | `xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V` |
| Depth / child number | 3 / `0'` — satisfies `xpub.depth != 3` and the hardened-index check (`create_invoice.rs:263-270`) with `account_index = 0`, which mainnet refuses except under `stack_role = proof` (§B.6) |
| `0/0` | `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu` — 176 txs, 88 received outputs, 4,082,661 sats, all spent, max single output 2,243,167 at height 882,346 (blockstream.info Esplora, 2026-09-09) |
| `0/1` | `bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g` — also funded (4 outputs, 101,720 sats). Not an "unfunded index". |

**NEG-1 — the claim-time scan.** Claim the account. Assert the response's
`next_child_index` is above the last used index found by the gap scan (§B.5),
that `first_derived_address` has empty history when queried independently, and
that it is **not** `bc1qcr8te…`. Then run a full order: listing priced at
2,243,167 sats, fresh throwaway buyer with a published receiver marker, bind
Bitcoin, and assert the payment stays `awaiting_entitlement` and paykit reports
`undetected` across at least three marketplace poll cycles.

**NEG-2 — the baseline against real mainnet history.** NEG-1 alone would pass
for the wrong reason (an address with no history cannot pay anything). So: on the
**proof database only**, the parent forces that creator's `next_child_index` back
to the last used index, so the next derivation lands exactly on
`bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu` with its 88 historical received
outputs. Create a new order at 2,243,167 sats. Every historical output is in the
creation baseline (§B.4.1) and every one is also confirmed at or below
`creation_chain_height`, so **every one is ineligible under both defences**.
Expected: no observation row is written, paykit reports `undetected`, the
payment stays `awaiting_entitlement`, and the order expires at the hold window.
This is the run that proves P1-A is closed against real mainnet history at
scale (176 transactions).

**Positive control inside NEG-2 (proves the baseline is not simply "nothing ever
matches"):** the same tick must show the observer *fetched* that history — the
`/health` tip probe advanced and the invoice's persisted `history_tx_count` is
176 — and the persisted baseline must contain **exactly 88 outpoints**, compared
against the independently fetched Esplora set. A baseline that works because the
scan silently returned empty is not a baseline, and an empty baseline must be
indistinguishable from a failure to the code (`void_baseline_failed`, §B.4.1).

**NEG-3 — a pre-existing mempool transaction mined before tick 1 (the exact
NEW-1 case).** This is the variant Sol's finding names, and it is the one that
would have passed r2's design. It cannot be staged against the public test-vector
address without spending, so it is run on the proof stack against a **synthetic
mempool view**: the harness drives the proof stack's Electrum adapter through a
recorded-response fixture (captured from the real endpoint, per the
`contract-faithful-tests` discipline) that, at the moment of the baseline
snapshot, returns one unconfirmed transaction paying the derived address for
exactly the order amount; and then, on tick 1 and every tick after, returns that
same transaction **only** as confirmed at `creation_chain_height + 1` — never
again as unconfirmed. Under r2's first-tick rule this output is never classified
as pre-existing, clears the height floor, and marks the order paid. Expected
under §B.4: the outpoint is in the baseline set by `txid:vout`, so it is
ineligible forever regardless of the height it appears at; no observation row,
`undetected`, `awaiting_entitlement` through expiry.
**Required negative calibration:** the same fixture with the baseline snapshot
suppressed must mark the order `paid`. If it does not, the fixture is not
reproducing NEW-1 and the passing result is worthless.

**NEG-4 — RBF replacement of a baseline transaction (§B.4.3).** Same fixture
shape: a baseline unconfirmed transaction, then a replacement with a **different
txid** that spends the same input and pays the derived address the order amount,
mined above the floor. Expected: the replacement inherits baseline status through
the recorded input set and is ineligible. Its calibration is the mirror — a
transaction paying the same address that spends a **wholly unrelated** input is
eligible and does confirm, proving B.4.3 rejects by input provenance and not by
rejecting everything.

**NEG-5 — fail-closed baseline.** Point creation at an Electrum that errors on
the history call. Expected: `void_baseline_failed`, `CreateInvoiceError::Unavailable`,
the marketplace bind refused and rolled back (`payment_methods.rs:447-553`),
**no Payment Request published**, the derivation index burned and not reused, and
the invoice absent from `observation_targets()`. Then assert §B.7.1: after three
such failed probes, Bitcoin is auto-hidden at checkout, and existing invoices are
still being observed.

**Drift guard (P2-E), mandatory before every NEG run.** Anyone can send a new
output to this public address. Immediately before each run the harness refetches
the full history from two independent read-only sources (blockstream Esplora and
the configured Electrum), canonicalizes it as sorted
`(txid, vout, value, height)` lines, SHA-256s it, and compares against a digest
pinned in the harness. On mismatch it **aborts** and prints the diff. With the
baseline in place a *new* output arriving after the snapshot would legitimately
confirm the NEG invoice — i.e. it would look like a product failure when it is address drift —
so this guard is what keeps the negative result interpretable.

### D.2 MAINNET-DERIVE — split into a seller leg and a buyer leg (NEW-4)

Also on the proof stack, on image digest `D`. r2 ran these as one item, which
conflated two different claims: that a seller's own wallet recognizes the derived
address, and that a *buyer's* wallet ingests and parses the Payment Request. They
involve different people, different devices and different code, and one passing
does not imply the other. They are now separate proofs with separate evidence,
and **no funds are sent in either.**

**D.2.0 — Connectivity and chain identity** (precondition for both legs).
`/health` reports Electrum available on evidence: TLS handshake to
`ssl://bitkit.to:9999` succeeds, the genesis hash matches Bitcoin mainnet, and
the tip height is within 3 blocks of an independent public reference. Assert an
explicit negative too: point a throwaway configuration at a testnet Electrum and
confirm `ObserverError::WrongNetwork` (`observer.rs:226-233`) and `/health`
unavailable.

**D.2-S — Seller side: xpub → derived address, confirmed in the seller's own
Bitkit.** A team member creates a **Shop-exclusive account** through the §B.8.1
Bitkit claim flow on their **mainnet** Bitkit, and claims it on the proof stack
as the seller. Assert: the account index in the claim payload is **≥ 1**; the
server accepted it under the §B.6 revised range; the client-computed
`key_fingerprint` over the exact normalized bytes submitted equals the server's,
and a deliberately altered byte produces a mismatch that blocks `bitcoinEnabled`
(§B.6); and the address the claim response returns as `first_derived_address`
**appears in that team member's own Bitkit**, evidenced by a screenshot the
parent opens. Also assert the account is exclusive in the direction that matters:
Bitkit's own receive screen, driven repeatedly, never issues that address —
consistent with the account-unscoped receive path in §B.8.1.

**D.2-B — Buyer side: a real Bitkit receives and parses the Payment Request,
unfunded.** A **different** team member's mainnet Bitkit is the buyer. A real
order is created against the D.2-S seller for a small amount; the buyer's Bitkit
receives the Payment Request over Paykit and must, without any send taking place:
render it as payable; show the amount equal to the order total **including the
§B.8.2 nonce**; show the §B.9 expiry; and accept `btc-bitcoin-p2wpkh` as a
supported endpoint identifier for its configured network. Assert the wire shape
against the server: identifier `btc-bitcoin-p2wpkh` (`create_invoice.rs:166`),
asset `"btc"` (`:213`), payload `{"value": <address>}` (`:241`), and that the
address the wallet received equals the locally derived one.
Then assert the expiry is genuinely enforced rather than merely displayed: after
`expires_at` passes, the request is no longer payable in that wallet — iOS
returns `requestExpired` from `accept` (`PaykitPaymentRequestService.swift:184-187`)
and Android returns `RequestExpired`. **The harness never sends.** The evidence
is screenshots the parent opens, plus the server-side assertion that the invoice
moved `observing → expired_tail` (§B.9).

Together these close the leg r1 omitted entirely: r1's buyer was a Paykit reader
script, which proves a reader, not production wallet ingestion.

Does **not** demonstrate: that a payment sent to that address confirms. That is
D.3 on regtest and W5 on mainnet.

### D.3 REGTEST-POS — the positive transition, including the new baseline and floor

On the regtest stack with the local Fulcrum, where an agent can create
transactions without spending real money. **The regtest service is redeployed
onto image digest `D` before this proof runs, and the proof asserts the digest it
observed equals `D`** (§D.0) — r2's "existing, untouched" regtest stack is
exactly the NEW-4 gap, because a positive transition proven on an older binary
says nothing about the one production runs. Same binary and same code paths as
mainnet; only the network literal differs.

Positive run: create the order and record the baseline and the floor at tip `H`;
assert the persisted baseline is **empty** for a fresh address and that the
invoice reached `observing` rather than `void_baseline_failed`; assert
`payments.adapter == 'paykit'`; `bitcoin-cli sendtoaddress` **exactly**
`price + nonce` to the derived address, taking the amount from the Payment
Request rather than recomputing it; observe `detected` at 0 confirmations on a
**later** tick (proving the baseline admits a post-baseline transaction rather
than blanket-rejecting unconfirmed outputs); mine one block; observe `confirmed`
with `amount_matched: true`; the order becomes `paid` with a durable receipt;
both buyer and seller UIs render paid, evidenced by screenshots the parent
opens. If Q3 is answered 2 confirmations, assert `paid` occurs at the
second block and not the first.

FAIL calibrations, all six required before the positive run is trusted:

- **F1 — one satoshi short.** Send `price - 1`. Expected: paykit reports
  `confirmed` with `amount_matched: false`, marketplace routes to
  `manual_review` and emits `payment.manual_review` (`workers.rs:827-859`);
  order never `paid`. Isolates the amount predicate and nothing else.
- **F2 — pre-baseline confirmed output (the regtest mirror of NEG-2).** Send the
  exact amount to the address that index *N* will derive, mine 6 blocks, force
  `next_child_index` to *N*, then create the order. Expected: the output is
  captured in the baseline, ineligible, no observation, `awaiting_entitlement`
  until expiry. This is the calibration that proves the baseline rejects, on a
  chain where the parent controls the history.
- **F2b — pre-baseline *mempool* output mined after creation (the regtest mirror
  of NEG-3, and the direct NEW-1 case on a controlled chain).** Send the exact
  amount to the address index *N* will derive but **do not mine**; force
  `next_child_index` to *N*; create the order, so the transaction is in the
  mempool at snapshot time and lands in the baseline; **then** mine a block, so
  the output first becomes visible to the observer as confirmed at
  `creation_chain_height + 1`. Expected: ineligible by `txid:vout`, no
  observation, `awaiting_entitlement` until expiry. This is the highest-value
  calibration in the set, because it is the exact sequence that defeats a
  height-floor-only design and it runs without any fixture.
- **F3 — unfunded address.** No transaction at all. Expected: empty history,
  no observation ever written, `undetected`, no-op branch
  (`workers.rs:1002-1005`), `awaiting_entitlement` through ≥3 cycles.
- **F4 — partial payment in two transactions.** Send the price as two outputs.
  Expected: never confirms — the binding is a single output and
  `action_for_values` replaces rather than sums (`bitcoin.rs:176-195`).
- **F5 — overpayment by one satoshi (new in r3, calibrates §B.8.2).** Send
  `price + nonce + 1`. Expected: `confirmed` with `amount_matched: false`,
  routed to `manual_review` (`workers.rs:827-859`), order never `paid`. Under the
  r2 `>=` predicate this run would have marked the order paid, so F5 is what
  proves the exact-match change actually landed — and therefore that the §B.8.4
  residual number describes the deployed code rather than the design document.
- **F6 — wrong-nonce payment (calibrates the nonce itself).** Send exactly
  `price` — the correct listing price with the nonce omitted, which is what a
  colliding third-party payment at the same nominal price looks like. Expected:
  underpayment, `amount_matched: false`, `manual_review`, never `paid`.

Also assert on regtest, cheaply: a second order for the same seller derives the
next index and never reuses an address (`invoices.rs:786-829`); that a burned
index after a forced baseline failure is skipped and never reissued (§B.4.1);
that two invoices for the same seller draw **different** nonces; and that
`payment.sandbox_advance` is refused once the adapter is `paykit`.

### D.4 What is still unproven when all of them pass

Even with §D.0's single artifact, these remain open and no wording in this
document should be read as covering them:

- Live mainnet confirmation; a real wallet constructing, signing and
  broadcasting to a derived mainnet address; mainnet mempool and fee behaviour.
- Reorg handling — no code handles it (Q10).
- The seller's ability to actually spend what arrives.
- Whether the Electrum endpoint is honest. The proofs demonstrate only that the
  pipeline believes it (Q4).
- **Residual R1** (§B.10): a mempool transaction the server's Electrum had not
  seen at snapshot time. NEG-3 proves the baseline closes the *observable*
  ordering race; it cannot prove completeness of a single Electrum's mempool
  view, and no proof in this wave can.
- **Residual R2** (§B.10): a seller who restores the Shop account seed into a
  third-party wallet. Out of reach of any harness; bounded by §B.8.2 and by
  §C.10 copy.
- **The §B.8.4 residual number itself** is a model, not a measurement. F5 and F6
  prove the mechanism it depends on is deployed; the collision-rate assumptions
  (A1–A4) are not measured anywhere and should be revisited once real seller
  behaviour exists.

**W5 canary closes the first three**, and it is a human procedure, not an agent
run: one named commerce-team seller re-claims through the §B.8.1 **Bitkit
Shop-exclusive account** flow (not a hand-pasted xpub — the canary should
exercise the path GA is meant to use), confirms the derived address in Bitkit,
publishes a small listing (order of tens of thousands of sats), a second team
member buys it and pays from a real mainnet Bitkit **at the exact nonce'd total**,
and the team observes `detected` → `confirmed` → `paid` → receipt, then **spends
the received funds** to prove the seller controls them. The canary must also let
one order **expire unpaid** and confirm the buyer's wallet shows it expired and
refuses to pay it (§B.9), because expiry is the mechanism the rollback drain
depends on and it should be seen working once with real money before it is
trusted at 3 a.m. Nothing goes to general availability until that has happened at
least once, and not before Q9 is answered.

---

## E. Self-attack table

| Attack | Precondition | Result | Mitigation |
| --- | --- | --- | --- |
| **Legitimate seller's own old receipts confirm their first unpaid order** | An established BIP84 account is claimed; the server derives `0/0`; any historical output ≥ the listing price exists | **Was the r1 design's premise. Closed by §B.4** — the output is in the creation baseline and is also at or below `creation_chain_height`. Proven by NEG-2 and F2. | Baseline snapshot plus height floor plus the claim-time index scan (§B.5). Neither alone: the scan can be defeated by history arriving after the claim; the floor alone still derives onto a used address. |
| **Pre-existing mempool transaction mined before the first observation tick** (Sol NEW-1) | An unrelated transaction sits in the mempool before the invoice exists and is mined at `H+1`; the observer sees it for the first time already confirmed | **Defeated r2.** The first-tick rule never classified it (it was never seen unconfirmed) and the height rule admitted it, so an unpaid order goes `paid`. **Closed by §B.4.1/B.4.2** — it is in the baseline by `txid:vout`, and baseline membership never keys on height. | The baseline snapshot is taken after allocation and **before publication**, over confirmed history *and* mempool, with publication conditional on success. Proven by NEG-3 with a mandatory negative calibration, and by F2b on regtest with no fixture at all. |
| **RBF replacement of a baseline transaction** | A baseline mempool transaction is fee-bumped and rebroadcast under a new txid | Would escape a naive outpoint-only baseline and confirm above the floor — the same false paid by another route. | The baseline also records the **input outpoints** of unconfirmed baseline transactions; anything spending a baseline input inherits baseline status (§B.4.3). Proven by NEG-4 and its mirror calibration. |
| **Slow Electrum omits a mempool transaction from the baseline** | The transaction is in the network's mempool but has not reached the server's single Electrum at snapshot time | **Not closed. Residual R1** (§B.10). A single view cannot be proven complete. | Bounded, not eliminated: empty for a Shop-exclusive account because nobody else knows the address; bounded at ≈10⁻³ by the exact-amount nonce (§B.8.2); named as a reason **Q4** matters, since two-server corroboration is what would close it. |
| **Stale tip widens the eligible height interval** | The snapshot's tip read lags the real tip | Would enlarge the window in which a pre-existing confirmed output looks post-invoice. | `creation_chain_height` comes from the **same Electrum round as the baseline**, and creation fails closed unless that tip is within 3 blocks of a health probe less than two intervals old (§B.4.4). Baseline membership dominates the height rule regardless. |
| **Reorg moves a baseline outpoint across the floor** | Any reorg deep enough to re-mine a baseline transaction | **Harmless by construction:** baseline membership is `txid:vout` and never height, so a reorg-moved baseline outpoint stays baseline. In the other direction a legitimate payment re-mined at or below the floor is refused and resolves to `manual_review`. | Stated explicitly in §B.4.4 so the fail-safe direction is a decision rather than an accident. Disclosed with the rest of the reorg exposure under Q10. |
| **Seller wallet and paykit-server are independent allocators** (Sol NEW-2) | A busy seller shares one account between their wallet and Shop; the wallet's counter reaches an index paykit already assigned to a live invoice; an unrelated customer pays it | **Succeeds against r2, and collision is near-certain rather than rare** for a busy shared account (§B.8.4). Harm: **the seller ships an item a Shop buyer never paid for.** | Both defences (§B.8.3): **(a)** a Bitkit-issued Shop-exclusive account at index ≥ 1, which makes collision impossible by construction because Bitkit's own receive path is account-unscoped; **(b)** exact-amount matching plus a CSPRNG nonce in `[1,999]`, which bounds the residual at **≈1 × 10⁻³ per exposed-seller-month**. (a) is only an invariant if manual paste is disabled on mainnet — that is **Q9**, an owner decision. |
| **Seller restores the Shop account seed into a third-party wallet** | Deliberate act against written guidance; the other wallet allocates from the Shop account | **Not closed. Residual R2** (§B.10). (a) is an invariant over Bitkit, not over the seed. | §C.10 copy states the account is exclusive and what goes wrong; bounded by the nonce at ≈10⁻³; requires deliberate action. Named rather than claimed closed. |
| **Delivered Payment Request outlives the marketplace hold** (Sol NEW-3) | `proposal_expires_at: None` (`create_payment_request.rs:230`); the rollback drains on "hold elapsed" and repoints | Buyer pays a still-valid address into a database nobody polls; no confirmation, and the late-settlement `manual_review` net never fires. Real funds moved, silently. | Enforceable expiry carried in the request (§B.9), **already parsed and enforced by both wallets** so no wallet release is needed; observation continues through a 24 h `expired_tail` where the only outcome is `manual_review`; the drain boundary becomes "every delivered PR expired or final" (§C.16). |
| **Fail-closed creation becomes a checkout-wide outage** (Sol NEW-5) | One Electrum outage, with two fail-closed creation gates (§B.4, §B.5) | Every Bitcoin checkout fails at the bind — correct for safety, but indistinguishable from "the marketplace took my money and broke". | A 99.0% monthly availability objective for *offering* Bitcoin, auto-hide after 3 failed probes with 3-probe recovery hysteresis, observation of existing invoices continuing throughout, and paging on sustained or flapping auto-hide (§B.7.1). A degradation is never traded against a false paid. |
| Server child index 0 collides with wallet-used addresses | `next_child_index DEFAULT 0` on a used account | **Closed by §B.5** — the scan starts above the last used index plus a gap buffer. | Also a privacy and Electrum-cost fix. Refuse the claim if Electrum is unreachable; never default to 0. |
| Creation-height protection vs a historical PASS | Both cannot be true | Acknowledged as mutually exclusive; the floor ships and the proof is redesigned around it (§D), not the reverse. | r1 chose the proof; r2 chooses the product. |
| Deny-list vs the harness claim | W1.4 denies the exact key the proof must claim | Resolved by `stack_role` as a deployment invariant (§B.6), not by a code bypass. | A production database cannot boot with `role=proof`; a CI test asserts both directions. |
| Public test-vector history changes between calibration and run | Anyone can fund `bc1qcr8te…` | Would make a correct negative result look like a product failure. | Two-source recompute + pinned SHA-256 immediately before every run; abort on drift (§D.1). |
| Alternate account index bypasses the deny-list | Same public mnemonic, account 7 | A key-material deny-list cannot catch it by key material alone. | **Revised in r3, because §B.8 requires account ≥ 1 and r2's account-0 rule would have refused every Bitkit Shop account.** Mainnet accepts only `1..=99`, and the deny-list is widened to accounts **0–99** of every known-public mnemonic so the bounded range stays fully enumerable (§B.6). The bound is the mitigation; without it the deny-list is unbounded and therefore incomplete. |
| Unpaid order marked paid — malicious or compromised Electrum | Control of the endpoint host, or TLS MITM | **Succeeds.** Merkle proofs are checked only against headers the same server supplied, with no proof-of-work check (`bdk_electrum_client.rs:527-551`). | First-party endpoint, so this collapses into "compromised Synonym infrastructure" (Q4). TLS via `use-rustls-ring` blocks the network MITM. Wrong chain fails closed at genesis agreement. Corroboration is the real fix and is scheduled. |
| Reorg after confirmation | 1-block reorg drops the payment | **Not handled.** paykit-server would see the disappearance (`observer.rs:208-221`); marketplace-service confirms at 1 and has no un-confirm edge (`workers.rs:822-826`). | Q3 (2 confirmations) and Q10 (disclosure + seller guidance). A disappearance-driven `manual_review` edge is the code fix; it is not in this wave. |
| Staging/proof rows enter production's observation batch | A shared mainnet database | **Would be total**: one poisoned row fails the whole batch for every seller (`observer.rs:259-322`). | Separate service and database per stack from day one (§B.1); `stack_role` in the deployment invariants; the proof database is dropped, never promoted. |
| Rollback orphans delivered mainnet Payment Requests | `PAYKIT_SERVER_URL` repointed while invoices are live | Buyers pay correctly and the order expires; the late-settlement `manual_review` net never fires because nothing polls that server. | Creation kill switch, then drain, then repoint — in that order (§C.16). |
| Empty-target `/health` reports Electrum available | No invoices exist | **Reports available without making a request** (`server.rs:592-597`). A dead endpoint looks healthy until the first real order. | Active genesis/tip probe every tick, with tip age in `/health` (§B.7). |
| Unbounded Electrum load / ban | A large history, or many targets, at a short interval | Silent total non-confirmation. | Request budget, cap, batching, jitter, backoff, backlog-age alert (§B.7). |
| Harness residue keeps hammering Electrum | A never-matching invoice left in a mainnet database | **Permanent load**: a non-final invoice never leaves `observation_targets()` (`invoices.rs:249-250`). | The proof database is **dropped**, not row-deleted: `0001_initial.sql:21-108` is `ON DELETE RESTRICT` throughout, so FK-safe row cleanup is error-prone and partial cleanup leaves live targets. Scripted in W1.6. |
| **Dust griefing → permanent production watcher load** (Kimi P2) | The buyer is the only party who sees the derived address, and can send dust to it cheaply | Every underpayment and every dust output leaves a confirmed-but-unmatched invoice that is never final and is rescanned in full on every tick, forever. Not harness-only — this is the production shape of the row above. | Observation TTL bounded by the order's payment window plus `manual_review` resolution, shipped with §B.7. Note `manual_review` payments are deliberately never swept (`workers.rs:1050-1052`), so the TTL cannot key on the payment alone. |
| **Concurrent first-bind race** (Kimi P2) | Two buyers' first orders from the same seller allocate `next_child_index` simultaneously | **Does not happen.** `create_atomic` takes the creator row with `SELECT … FROM creators WHERE creator_lookup_hash = $1 FOR UPDATE` (`invoices.rs:733-741`) and increments inside the same transaction (`:822-829`), so allocation is serialized by a row lock, not by an optimistic read. Kimi's concern is refuted by the code it could not read. | Refuted, not dismissed: W1.1 adds a concurrent-bind test asserting two simultaneous first orders derive distinct indices, plus a unique constraint on (creator, child index) as a cheap invariant that turns any future regression into a failed write rather than two buyers paying one address. |
| **Cross-instance replay across stacks** (Kimi, newly live in r2) | A seller claims the **same** account xpub on the proof stack and on production | Both instances derive the same addresses from the same key, with no domain separation in BIP84. A payment intended for one stack's order can satisfy the other's same-index invoice. r1's single shared service made this impossible; §B.1's isolation creates it. | `PAYKIT_SETUP_ALLOWED_ORIGINS` on the proof stack is the staging Shop origin only, and proof sellers are throwaway identities — no real seller ever claims on both. Seller copy reinforces one dedicated account per Shop. Must be re-examined before any second marketplace shares the rail. |
| **Gap-limit exhaustion at the seller's wallet** (Kimi P3) | More than ~20 unpaid orders from distinct buyers, or a scan-applied start offset on top of that | Derivation marches past the wallet's gap limit; funds are spendable but invisible in the seller's wallet, which a non-technical seller cannot distinguish from loss. | **Largely closed as a side effect of §B.8.1.** Bitkit pre-reveals addresses `0…999` on a tracked account (`WATCH_ONLY_ACCOUNT_HIGHEST_PRE_REVEALED_ADDRESS_INDEX = 999`, `WatchOnlyAccount.kt:9`; `revealReceiveAddressesToAccount`, `WatchOnlyAccountRepo.kt:253-257`), so a Bitkit-issued Shop account tolerates ~1,000 outstanding orders rather than ~20. The scan offset is applied only when usage is found (§B.5). For a hand-pasted account the original exposure stands and seller copy must say to raise the gap limit. Indices advance per new (reader, bundle) triple and never come back (`invoices.rs:786-829`). |
| **Chain-data operator surveillance** (Kimi P3) | Normal operation | The Electrum sees only scripthashes, but it sees every watched seller address every 30 s from one client, so it can cluster a seller's indices over time and correlate order timing with polling. The paykit database is what links creator ↔ xpub ↔ addresses. | Disclosed in seller copy (§C.10) rather than left implicit. It is a consequence of any watch-only rail with one chain-data source; the honest statement is the mitigation. |
| One poisoned row stops every seller | Any unparseable address or failing merkle proof | **Total confirmation outage** today. | Reduced, not eliminated, by the §B.7 budget/deferral (smaller batches). Per-target error isolation in the fork remains the real fix, scheduled. Alert on backlog age, not just `/health`. |
| Seller pastes a valid but **wrong** xpub | An old wallet's key, a colleague's key, a blog example | **Funds are lost, irreversibly.** Base58check catches typos; it cannot catch a well-formed key the seller does not control. The claim is immutable per creator (`bitkit_claim.rs:69-74`). | §C.10 is load-bearing: preview derived from the exact normalized bytes POSTed, fingerprint compared against the server's, address confirmed in the seller's own wallet before `bitcoinEnabled`. Copy says irreversible and unrecoverable in those words. |
| The test-vector xpub reaches a real listing | Harness leaks, or a seller copies it from this document | **Catastrophic and irreversible** — the mnemonic is public. | Canonical 78-byte deny-list in `validate_xpub`, enforced on every non-proof stack; harness refuses to run unless the target origin is the staging Shop; fresh identities per run; derived-first-address check as belt-and-braces (§B.6). |
| Key or secret exposure on this path | Operator DB read, log capture, compromised server | **No Bitcoin private key exists anywhere on this path.** Addresses, outpoints and amounts are redacted in every `Debug` impl (`bitcoin.rs:33-40`, `:64-71`, `:87-99`, `:126-135`) and sealed at rest under `PAYKIT_MASTER_KEY` (`invoices.rs:660-671`). Full compromise buys the ability to lie about payments and to read seller xpubs — a privacy loss, since an xpub reveals a seller's whole receive history. | §C.11 records watch-only as a repo invariant. Seller copy must state the xpub-privacy consequence plainly. |
| Overpayment | Buyer sends more than the required amount | **Changed in r3.** r2 recorded that overpayment confirms as matched under `observed_sats >= required` (`invoices.rs:694`). §B.8.2 makes the predicate exact, so overpayment now reports `amount_matched: false` and routes to `manual_review` (`workers.rs:827-859`). Nothing is lost — the funds are at the seller's own address — but a human resolves the order. | This is a tightening required by §B.8: under `>=` the amount nonce provides no defence at all. Both wallets already refuse to pay a mismatched amount, so honest Bitkit buyers are unaffected. Buyer copy must say the total is exact and that overpayment delays the order rather than completing it. Proven by F5. |
| Harness or design assumes three proofs compose when they ran on different binaries (Sol NEW-4) | Regtest left on an old image while proof-mainnet runs the new one | Each proof passes, the conjunction proves nothing, and the gap is invisible in every individual report. | One image digest `D` built once and deployed to all three stacks, printed in every boot line, and **asserted equal to `D` by each proof before it runs** (§D.0, §C.8). W2.4 asserts the regtest redeploy explicitly. |
| Partial payment across two transactions | Price split into two outputs | **Never confirms** (`bitcoin.rs:176-195` replaces, does not sum). Silent stall for the buyer. | Buyer copy: "pay the full amount in one transaction". Proven by F4. |
| Buyer drives an order to paid with the sandbox command | Staging `SANDBOX_PAYMENTS_ENABLED=true` | **Refused** once Bitcoin is bound (`handlers/payment.rs:60-65`); possible only before any rail is bound. | Every harness asserts `adapter == 'paykit'` immediately after the bind. Production has the flag `false`. |
| Production runs the pre-floor image | Variables changed without a rebuild | P1-A live, on real money. | §C.8: redeploy from the commit containing steps 1–6 and assert the built revision in the boot line before cutover. |
| Production trust keys exist before production needs them | Keys generated alongside the proof stack | Longer exposure window for material that authenticates real-money requests. | Per-stack keys, generated at the moment the stack is created (§B.1). |

---

## F. Sequencing and agent choreography

Six concurrent agents maximum; one agent per working tree. Kimi (OpenCode,
newest flagship `kimi-k*`) is the required external auditor for **every** slice
touching the watcher, xpub handling, key material, operator configuration, or
the harness, and Kimi's SHIP gates production.

| Wave | Slice | Repo / tree | Tier | Depends on | Proof command → expected output |
| --- | --- | --- | --- | --- | --- |
| W0 | This design reviewed adversarially (r1) | — | deep reasoning, different family | — | Verdict recorded. **Done:** Sol FIX-FIRST → r2 |
| W0b | Design audit (r1) | OpenCode Kimi | **Kimi** | — | Verdict line present in the log. **Done:** FIX-FIRST, same two P1s as Sol, folded in |
| W0c | r2 reviewed adversarially | — | deep reasoning, different family | r2 | **Done:** Sol FIX-FIRST, NEW-1…NEW-5, closed in this r3. **Round 3 of 3 — see the cap note below.** |
| W1.1 | Fork: creation baseline and post-invoice eligibility (§B.4) — `awaiting_baseline`, the post-commit/pre-publication snapshot of history **and** mempool, baseline outpoint and replaced-input sets, `void_baseline_failed`, V2 record, `confirmed_height`, migration `0002` | `paykit-server-fork` | **Kimi** | W0c | `cargo test -p paykit-server` → **the NEW-1 case first:** an outpoint present in the baseline as unconfirmed, later seen only as confirmed above the floor, never binds; an outpoint spending a baseline input never binds while one spending an unrelated input does; a post-baseline output binds; an output at `height <= floor` writes no observation; a failed snapshot yields `void_baseline_failed` + `Unavailable` with no outbox delivery and no target-set membership; a burned index is never reissued; a stale tip beyond 3 blocks refuses creation; a V1 record on mainnet is a hard error; two concurrent first binds derive distinct indices and the (creator, index) unique constraint holds |
| W1.1b | Fork: exact amount predicate + invoice nonce (§B.8.2) | same fork, serialized after W1.1 | **Kimi** | W1.1 | `cargo test -p paykit-server` → `observed_sats == required` binds; `required + 1` reports `amount_matched: false`; `required - 1` unchanged; nonces are CSPRNG-drawn, in `[1,999]`, and differ across invoices for one seller; the order total the marketplace records equals `price + nonce` |
| W1.2 | Fork: claim-time index scan (§B.5) | same fork, serialized after W1.1 | **Kimi** | W1.1 | `cargo test -p paykit-server manual_claim` → unused account starts at 0; account with usage at index *k* starts at `k+21`; Electrum failure refuses the claim; >1,000 scanned refuses |
| W1.3 | Fork: deny-list on canonical key data, **revised account range**, `key_fingerprint`/`first_derived_address` in the claim response, `stack_role` invariant (§B.6) | same fork, serialized after W1.2 | **Kimi** | W1.2 | `cargo test -p paykit-server` → the test-vector key is refused under `production` in both xpub and zpub-normalized form and accepted under `proof`; on mainnet `account_index = 0` is refused and `1..=99` accepted, with `100` refused; **account 0 is accepted under `role=proof` and refused under `role=production`**, asserted in both directions; the deny-list covers accounts 0–99; a proof DB under a production config exits `StartupError::Deployment` |
| W1.4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe, **availability auto-hide** (§B.7, §B.7.1) | same fork, serialized after W1.3 | **Kimi** | W1.3 | Unit tests: budget arithmetic caps at 1,000/tick and ≤5 req/s; deferral is oldest-first; `/health` reports tip height and age; an empty target set no longer reports `available` without a probe; 3 failed probes set Bitcoin unavailable and 3 successes clear it, with no flap in between; **auto-hide gates creation only — existing invoices are still observed while hidden** |
| W1.4b | Fork: Payment Request expiry, `expired_tail`, resolve endpoint (§B.9) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test -p paykit-server` → a request with missing, past, or over-maximum `expires_at` is refused; `proposal_expires_at` is set on the published request; at expiry the invoice moves to `expired_tail` and after 24 h to `expired_final`, leaving `observation_targets()`; an eligible observation during the tail is recorded with `late_settlement` and never yields `paid`; `resolve` is idempotent, finalizes early from `expired_tail`, is **recorded but does not resume observation** from `expired_final`, and is refused for `awaiting_baseline` / `void_baseline_failed` / unknown invoices |
| W1.5 | Fork: `PAYKIT_BITCOIN_CREATION_ENABLED` kill switch (§C.16) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test` → creation refused with `bitcoin_creation_disabled` while observation of existing invoices continues |
| W1.6 | Rails: entrypoint variables (§C.6) **plus** the IaC/script for §B.1 — create both services and databases, wire variables, run the negative miswiring gate, and a separate destructive script that drops the proof database | `pubky-payment-rails` | **Kimi** (operator config gates the watcher) | W0 | `sh paykit-server/tests/entrypoint_test.sh` → pass; `PAYKIT_ENTRYPOINT_RENDER_ONLY=1` with mainnet vars → TOML contains `network = "mainnet"`, `poll_interval = "30s"`, the stack role; bogus network → non-zero exit; the IaC script run twice is idempotent; the miswiring gate fails to boot as expected |
| W1.7 | Client: network-aware validator, `zpub`→`xpub` normalization, deny-list, `PUBKY_RUNTIME_BITCOIN_NETWORK` | `mp-oneauth` worktree | **Kimi** (client xpub conversion is key handling) | W0 | `npm run test -- payment-methods` → `zpub` converts to the same 78 bytes the server stores; `vpub`/`tpub` rejected on mainnet with named reasons; the test-vector key rejected in both forms and for accounts 0–19; an unset `PUBKY_RUNTIME_BITCOIN_NETWORK` refuses the claim; the published BIP84 test vectors are asserted directly |
| W1.8 | Client: preview from the exact normalized bytes, fingerprint comparison, confirmation gate, disclosures (§C.10) | separate `mp-*` worktree | **Kimi** — in-browser BIP84 derivation is the gate §C.10 rests on, so the preamble's rule applies (Kimi P2 on r1's tiering) | W1.7 | Component tests green; the published BIP84 test vectors are asserted against the preview derivation; a mutated byte blocks `bitcoinEnabled`; VRT regenerated if a baseline exists for the settings surface |
| W1.8b | Client: **Bitkit Shop-account claim path** (§B.8.1, §C.10) — auth URL with `x-bitkit-claim=watch-only-account-v1` and the exact capability set, payload decode, `account_index` ≥ 1 submitted instead of a hardcoded `0`, manual paste disabled on mainnet behind a flag pending Q9 | separate `mp-*` worktree, after W1.8 | **Kimi** (this is a credential-delivery path) | W1.8 | Tests: the requested capability set is byte-equal to `PubkyAuthClaim.WATCH_ONLY_ACCOUNT_CAPABILITIES`, asserted against a fixture captured from Bitkit rather than retyped; an 84-byte payload decodes to version 1, an `account_index` ≥ 1 and a 78-byte xpub; a payload with `account_index = 0` is rejected client-side; with the mainnet flag on, manual paste is unreachable |
| W1.9 | Docs pass (§C.17) | umbrella + `mp-oneauth` | **deep reasoning** — this is money-affecting operator text, not a mechanical edit | W1.5 | `git diff --stat` shows exactly the listed files; the parent reads the replacement policy line and the §C.16 rollback order end to end |
| W2.0 | **Build image digest `D` once** from the commit containing §C steps 1–6, and redeploy **regtest, proof and (later) production** onto it (§D.0) | operator (parent) | parent-only | W1.* merged | `D` recorded in the wave log; all three boot lines print the same digest; the parent reads all three, not one |
| W2.1 | Proof stack stood up on `D` | operator (parent) | parent-only | W2.0 | Boot line shows `mainnet`, `role=proof`, `ssl://bitkit.to:9999`, and digest `D`; `/health` shows a real tip height; the miswiring gate refuses to boot |
| W2.2 | Harness: MAINNET-NEG (NEG-1…NEG-5, drift guard) | `mp-oneauth` worktree | **Kimi** (the harness is the evidence) | W2.1, W1.7 | Digest asserted `== D` first; NEG-1 and NEG-2 `awaiting_entitlement`/`undetected` after ≥3 cycles; `history_tx_count == 176` and **baseline size == 88** on NEG-2 against an independently fetched set; **NEG-3 passes and its negative calibration — baseline suppressed — marks the order `paid`**, without which NEG-3 is not evidence; NEG-4 and its mirror; NEG-5 gives `void_baseline_failed` with no published request and then auto-hide; drift guard aborts on a mutated pinned digest |
| W2.3 | Harness: MAINNET-DERIVE split into **D.2-S (seller)** and **D.2-B (buyer)** | same worktree, after W2.2 | **Kimi** | W2.2, W1.8b | Digest asserted `== D`. D.2-S: account index ≥ 1 accepted, fingerprint round-trip passes and its negative fails, the derived address appears in the seller's own Bitkit (screenshot the parent opens), and Bitkit's receive screen never issues it. D.2-B: a **different** team member's Bitkit renders the request, shows the nonce'd total and the expiry, and after expiry refuses to pay it (`requestExpired` / `RequestExpired`), with the server showing `observing → expired_tail`. **No send in either leg** |
| W2.4 | Harness: REGTEST-POS with F1–F6 | separate worktree, regtest stack | **Kimi** | W2.0 | **First assertion: the regtest service was redeployed and reports digest `== D`** — the run aborts if not, which is the NEW-4 gate. Then all six FAILs observed first, F2b included, then the positive run: `detected` on a later tick → `confirmed` → `paid` with receipt; screenshots the parent opens |
| W3 | Kimi audit of the full diff | OpenCode, own `OPENCODE_DB` lane | **Kimi** | W1.*, W2.* | Report contains an explicit `SHIP` or `FIX-FIRST`; exit 0 is not a report — grep the log for the verdict |
| W3b | Deep-reasoning review: do the proofs prove what they claim **over one artifact**, does the runbook rollback order actually drain under §B.9's boundary, and are R1/R2 correctly scoped | — | deep reasoning | W2.2–W2.4, W1.9 | Verdict recorded; the parent opens the screenshots, re-runs one proof command per proof, and checks the digest in each proof log against `D` |
| W3c | **Protocol/state-machine review of §B.9's expiry and resolve contract**, both sides modeled as state machines with every credential's provenance traced | — | deep reasoning, different family from the implementer | W1.4b | Verdict recorded before W5. This is a new session/handoff contract on the money path, so it gets the review that catches what a diff audit does not |
| W4 | **Owner sign-off** | — | — | W3 SHIP + W3b SHIP + all proofs | Owner answers Q3, Q4, Q8, Q9 and Q10 in writing, having read §B.8.4, §B.10 and §D.4 |
| W5 | Production stack, cutover (§C.18), canary (§D.4) | operator (parent) + commerce team | parent-only | W4 | Production boot line shows `role=production` and digest `== D`; one real seller re-claims **through the Bitkit Shop-account flow**, confirms the address in their wallet, one real payment completes end to end at the exact nonce'd total and is spendable, and one order is left to expire and is confirmed unpayable in the buyer's wallet |

Parent duties, never delegated: commits, all remote git and GitHub writes,
secret handling, Railway and Vercel variable changes, plan edits, and the owner
conversation. Sub-agents never run `git push`, `gh pr create`, or any remote
write; every OpenCode prompt restates that prohibition explicitly.

Verification the parent performs rather than accepts on claim: read the rendered
TOML from the render-only entrypoint run; read each boot line including the
built revision; open every harness screenshot; run `git status --short` and
`git log -1` on every tree an agent touched; grep the Kimi log for the verdict.

W1.1, W1.1b, W1.2, W1.3, W1.4, W1.4b and W1.5 are one fork tree and therefore
serialize; W1.6, W1.7 and W2.4 are independent trees and run in parallel with
them, which is where the concurrency budget is spent. W1.8b serializes behind
W1.8 in its own client tree.

### F.1 The round cap, and what ships if r3 is not accepted

This is **round 3 of 3**. If the round-3 reviewer returns FIX-FIRST, the mainnet
switch is **demoted to the safe subset** rather than iterated again, and the
demotion is mechanical rather than a judgement call at the time:

- **Ships:** everything in W1.* and W1.6–W1.9 — the baseline, the exact-amount
  predicate and nonce, the claim scan, the deny-list and account range, the
  Electrum budget and auto-hide, the Payment Request expiry and resolve
  contract, the kill switch, the IaC, the client work, and the docs. All of it
  is pre-production hardening that is correct on regtest and improves the rail
  whether or not mainnet is switched on.
- **Ships:** the **isolated proof-mainnet stack** (W2.0–W2.3), because its value
  is exactly the evidence a later wave needs and it takes no real money.
- **Does not ship:** §C.18. Production stays on regtest, `PAYKIT_SERVER_URL`
  is not repointed, and Bitcoin stays hidden at production checkout. The
  production mainnet service and database are not created, so no production
  trust keys are generated (§B.1).
- The r3 reviewer's findings are carried into that later wave as its opening
  position rather than being re-litigated here, and Q9 stays open.

Stated so the demotion is a known outcome rather than a defeat, and so nobody
is tempted to widen the third round to avoid it.

---

## G. Engineering questions, decided

Owner-facing items are Q3, Q4, Q8, Q9 and Q10 at the top of this document. These are decided
here and recorded so the decision is reviewable.

- **Q1 — Second server, or flip?** Neither: **three isolated stacks** (§B.1).
  Flipping is impossible anyway — the server refuses to boot against a database
  initialised on another network (§A).
- **Q2 — Electrum endpoint.** `ssl://bitkit.to:9999`, with an active genesis/tip
  probe and a request budget (§B.2, §B.7). Blockstream is the documented
  failover; own bitcoind + Fulcrum is scheduled separately.
- **Q5 — Creation-time baseline and height floor.** **Before production, not
  after** (§B.4) — the reverse of r1, which planned to use their absence and land
  them later. r3 additionally makes the baseline snapshot, not the height floor,
  the primary defence.
- **Q6 — Staging `SANDBOX_PAYMENTS_ENABLED`.** Leave `true`; the adapter gate is
  sufficient and setting it `false` would enable local pickup as a side effect.
- **Q7 — Account indexes (revised in r3).** r2 decided `account_index = 0` only.
  §B.8.1 reverses the direction because a Shop-exclusive Bitkit account is always
  index ≥ 1: mainnet now accepts `1 <= account_index <= 99` and **refuses 0**,
  with the deny-list widened to accounts 0–99 so the range stays enumerable
  (§B.6). This is a tightening — account 0 is the account a wallet spends from,
  which is the collision §B.8 exists to prevent.
- **Q11 — Seller re-onboarding.** In-app banner for every existing seller with a
  Bitcoin claim: the rail moved to mainnet, re-claim through the Bitkit
  Shop-account flow (§B.8.1), confirm the first derived address in your wallet,
  and note that the claim is immutable and the Shop account is exclusive to Shop.
  Silent breakage is not acceptable — the failure mode looks like "Bitcoin
  unavailable" with no reason given.
- **Q12 — Amount predicate.** Exact match, not `>=` (§B.8.2). Overpayment routes
  to `manual_review` instead of confirming. Decided here rather than left to the
  owner because it is the precondition that makes the §B.8 nonce mean anything,
  and because both wallets already enforce exact amounts client-side.
- **Q13 — Certificate pinning for the Electrum endpoint.** No, with the reason
  recorded rather than left unstated (§B.3).

Scheduled, explicitly not in this wave, each with the reason it can wait:
per-target error isolation in the observer (the §B.7 budget shrinks the batch
and therefore the blast radius); two-server Electrum corroboration (owner
Q4); a disappearance-driven `manual_review` edge for reorgs (Q10
discloses the gap); own bitcoind + Fulcrum (§B.2); a signed
ownership challenge (§B.6, needs wallet support); and domain separation in
derivation, which must be settled before any second marketplace shares the
rail (§E, cross-instance replay).
