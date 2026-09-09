# Bitcoin Mainnet Switch And Payment-Journey Proof — Design (r4)

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
- **r3 adversarial review — GPT-5.6 Sol: FIX-FIRST**
  (`/tmp/btc-design-r4-sol-findings.md`, 2026-09-09). Every code citation in r3
  was re-verified against source; those citations are ground truth here, and
  three of them refuted r3's own prose. **CLOSED:** G, NEW-4, Kimi TTL.
  **PARTIAL:** A, D, NEW-1, NEW-2, NEW-3, NEW-5, Kimi floor. Six new findings:
  **R3-1 (P1)** — marketplace-service calls paykit *before* its own commit
  (`payment_methods.rs:713-759`) and paykit's outbox is queued immediately on
  commit (`invoices.rs:1023-1040`), so a crash or a failed local commit leaves a
  payable published request against an order that stays `adapter='sandbox'` and
  is never polled; **R3-2** the ≈10⁻³ residual conflated "one or more
  collisions" with "one trial" and is not an upper bound; **R3-3** the nonce is
  assigned server-side but `POST /v0/payment-requests` returns 204
  (`http/payment_requests.rs:42-51`), so the marketplace records the wrong
  total; **R3-4** both wallets' account allocators are monotonic only while
  allocation state survives; **R3-5** exact replay ignores lifecycle state
  (`create_payment_request.rs:129-142`, `invoices.rs:363-427`); **R3-6** the
  auto-hide wiring r3 claimed the marketplace "already polls" does not exist
  (`payment_methods.rs:279-333` checks only account existence).
- **Owner instruction, 2026-09-09 08:38: finish things correctly.** No cutting
  to a safe subset and no papering over. Every open finding in r4 gets a real
  mechanism or an explicit, quantified owner decision. r3's §F.1 demotion
  clause is therefore removed rather than exercised.
- **Owner decision, 2026-09-09 08:39 — Q9 is decided, and it reshapes §B.8.**
  In the owner's words: *"Sellers should be able to provide their own xpub
  however that is conventionally done, file or paste, whatever is normal, but it
  should get placed into paykit data if possible as normal, so the user is using
  paykit and locks, not a side hack."* Consequences, carried through this
  revision: **manual xpub entry stays allowed on mainnet** (paste, plus file
  import in the one format that is actually conventional — §C.10); the
  Bitkit-issued Shop-exclusive account becomes the **recommended** path, not the
  invariant (§B.8.3); the false-paid **bound must stand on its own** for pasted
  keys, which is why §B.8.4 replaces r3's single number with a parameterised
  model and a sensitivity table; **account 0 is no longer refused** (§B.6),
  because refusing it excludes the commonest paste case while buying nothing
  measurable; and every mechanism this design adds is required to live **inside
  Paykit's own data and endpoints** — the receiver marker on the seller's
  homeserver and paykit-server's encrypted creator store — rather than in a
  marketplace-side table (§B.0).
- **r4 — this commit** (Claude Opus). Answers all six r3 findings with
  mechanisms rather than qualifications, and folds in the 08:39 owner decision.
  Changes: a **two-phase prepare/activate protocol** with both sides written as
  state machines, every message named, and a failure matrix (§B.11, R3-1) —
  which also closes R3-3 (phase 1 returns the nonce and total) and R3-5 (replay
  is state-inspecting); the **residual model** replaced with N as a function of
  the seller's receive rate, the Shop invoice rate, the live window and the gap
  start offset, with a sensitivity table (§B.8.4, R3-2); **server-side
  fingerprint↔seller binding** in paykit-server to close the wallet-reset half
  of R3-4, with the wallet's own reuse named and quantified as the residual
  (§B.8.5); the **composed baseline + first-tick rule** that bounds R1 with a
  stated argument and a stated cost (§B.4.6); the `bitcoin_offer_available`
  contract from paykit `/health/ready` through the marketplace payment-config
  endpoint to the Shop client, as a W1 slice with tests (§B.7.2, R3-6); a
  restated drain boundary that includes `prepared` invoices (§C.16, NEW-3); and
  a rewritten §F in which every mechanism in this document has exactly one
  slice, one owner tier, a test list and a proof row.

## Owner decisions required

These carry the global question numbers used throughout this document; the
decided ones are in §G. **Q3, Q4, Q8 and Q10 remain open. Q9 was decided by the
owner on 2026-09-09 at 08:39 and is recorded in §G, not here.**

- **Q3 — Confirmation depth.** Recommended: **2 confirmations** before an order is `paid` (a fork change at `invoices.rs:702-707`); 1-conf has no un-confirm edge anywhere (`marketplace-service/…/workers.rs:822-826`), so a 1-block reorg leaves an unpaid order `paid`. Cost: ~10–20 min added wait, well inside the 3600 s hold window.
- **Q4 — Single-Electrum trust.** Recommended: **accept for launch.** `ssl://bitkit.to:9999` is first-party Synonym infrastructure — the same trust Bitkit already extends. A dishonest one can mark an unpaid order `paid`; the loss falls on the seller. Two-server corroboration is scheduled, not shipped. Q4 also carries residual **R1** (§B.10): a single Electrum is the reason a creation-time mempool snapshot cannot be complete.
- **Q8 — Independent security review.** Recommended: **waive in writing, bounded** — Kimi audit plus §D's proofs, with production restricted to the W5 canary (named sellers, small amounts) for one week before general availability. Do not delete `status.md:150`; record the waiver in those words.
- **Q10 — Reorg and late-settlement policy.** Recommended: **accept**, with seller copy that says "wait for the confirmations shown before shipping", and with settlements that land after the hold window continuing to route to `manual_review` (`workers.rs:787-820`) rather than auto-confirming.

**Q9 — decided 2026-09-09 08:39, recorded here because the number it accepts
changed.** Manual xpub entry stays allowed on mainnet. The residual the owner is
accepting is therefore **not** r3's ≈10⁻³: §B.8.4 models it properly and, at the
live window this design actually ships (`L = 1 h`, tied to
`FIAT_PAYMENT_WINDOW_SECONDS` — `config.rs:37-41`), a busy pasted-xpub seller
(`r = 100` non-Shop receive addresses/day, `s = 10` Shop invoices/day) carries
**E[false-paid] ≈ 6 × 10⁻² events per exposed-seller-month, P(any) ≈ 6%**, worst
case on the amount distribution. The harm is unchanged and is the seller's:
**they ship an item a Shop buyer never paid for.** The decision is recorded in
§G with what makes the number smaller and what the disclosure must say.

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

### B.0 Everything rides Paykit data — no marketplace-side side channel

This is a constraint on every mechanism below, taken from the owner's 08:39
decision, and it is satisfied by the code that exists today rather than by new
plumbing. Stated once here so no later section quietly violates it.

**The seller's claim already flows through Paykit, including the manual path.**
`POST /v0/accounts/claim` takes `{auth_token, account_xpub, account_index}`
(`http/accounts.rs:144-152`) and hands it to `ManualClaimRequest`
(`manual_claim.rs:52-61`). The auth token is not a marketplace credential: it is
a Pubky `AuthToken` whose capabilities must exactly match the receiver-path
session capabilities the Bitkit companion flow requests, and it is exchanged for
a **real homeserver session** by looping it through the configured HTTP relay
into the SDK's own auth flow — "the exact channel a signer (Pubky Ring / Bitkit)
would use", so session minting, capability validation and cookie handling stay
owned by the `pubky` crate (`manual_claim.rs:12-17`, `:96-118`). After the
session exists, the manual path **reuses the companion flow's commit path
unchanged**: `CreatorSetupCommit { session, … marker_publisher, receiver_path,
marker_capabilities }` → `publish_readback_and_commit` (`manual_claim.rs:243-262`),
which calls `paykit_lib::publish_paykit_receiver_marker(session, marker)` and
then independently reads it back through public storage with
`paykit_lib::get_paykit_receiver_marker` (`real_setup.rs:58-80`,
`DirectMarkerPublisher`). The published artifact is a **Paykit receiver marker at
the seller's own `receiver_path` on the seller's own homeserver**, with
capabilities `private_payments` and `payment_requests` enabled and `receipts` /
`outgoing_payments` disabled (`real_setup.rs:355-364`). The `bitkit/server`
receiver path and its two `:rw` capabilities
(`/pub/paykit/v0/bitkit/server/:rw`, `/pub/paykit/v0/private/bitkit/server/:rw`
— `PubkyAuthRequest.kt:15-33`, `PubkyAuthRequest.swift:7-22`) are the same for
paste and for the Bitkit companion flow.

**Consequences this design commits to:**

- **A pasted xpub is a Paykit claim, not a marketplace record.** Paste and file
  import (§C.10) differ from the Bitkit flow only in how the seller's browser
  obtains the `AuthToken` and the xpub bytes. Both land in the same endpoint,
  mint the same session, publish the same marker, and persist into the same
  encrypted `CreatorStore`. There is no "manual mode" branch in the commit path
  and r4 does not add one.
- **The marketplace stores no key material and must not start.** Its only
  Bitcoin column is `bitcoin_enabled BOOLEAN`
  (`0009_payment_methods.sql:11`, `payment_methods.rs:51`); availability is
  answered by asking paykit (`account_exists`, `payment_methods.rs:310-325` →
  `payments.rs:701`). Verified: no `xpub`, `account_index`, `fingerprint` or
  address column exists in any marketplace migration.
- **Every r4 mechanism lives inside paykit-server.** The amount nonce and the
  exact predicate (§B.8.2) are inside the invoice/observation path; the expiry
  (§B.9) is `proposal_expires_at` on the Paykit Payment Request the wallet
  already parses; the baseline (§B.4) is invoice state; the two-phase
  prepare/activate (§B.11) is two paykit endpoints and one paykit invoice state
  machine; the deny-list and `validate_xpub` checks (§B.6) are inside the claim
  path; and the **fingerprint↔seller binding (§B.8.5) is a new paykit-server
  table, deliberately not a marketplace one** — it must be authoritative for
  every claim on that stack, and the marketplace is not in the claim path at all.
- **What the marketplace does gain, and why it is not duplication.** Three
  fields: `paykit_invoice_id`, `paykit_total_sats` and `paykit_expires_at`
  (§B.11), alongside the `paykit_request_reference` it already stores
  (`0009_payment_methods.sql:38-41`). These are **correlation and the buyer's
  authoritative total**, not key material and not a second source of truth for
  the rail. The marketplace must know the total it charges the buyer, and after
  R3-3 that total is minted by paykit; recording it is the fix, not the leak.
- **The one thing that genuinely cannot live in Paykit data**, named as the
  owner asked: `bitcoin_offer_available` (§B.7.2). It is a property of *this
  deployment's Electrum reachability*, not of any seller's identity or receiver
  marker, so there is nothing on a homeserver it could correctly be written to;
  publishing rail health into a seller's public Paykit data would also leak
  operator state to anyone reading that path. It stays a paykit-server
  `/health/ready` field that the marketplace caches (§B.7.2).

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

**Revised in r4.** Steps 1–5 below are the interior of **phase 1** of the
two-phase protocol in §B.11. r3 flipped the invoice straight to `observing` and
published; that is precisely what R3-1 showed is unsafe, because paykit commits
and publishes before the marketplace has committed its bind. In r4 a successful
baseline lands the invoice in **`prepared`** — baselined, not observed, not
published — and only the signed activation of §B.11 phase 2 moves it to
`observing` and releases the outbox. The baseline mechanics themselves are
unchanged and remain the primary defence against P1-A and NEW-1.

Ordering, precisely:

1. `create_atomic` runs unchanged: `SELECT … FROM creators … FOR UPDATE`
   (`invoices.rs:733-740`) allocates the index, and allocation, increment,
   invoice and outbox row persist in one transaction committed at `:940`. The
   invoice is written in a new non-observable state **`awaiting_baseline`**, and
   both outbox rows are inserted with `status = 'prepared'` instead of
   `'queued'` (`invoices.rs:1023-1040`). That single literal is what makes them
   undeliverable: the claim query selects only
   `status IN ('queued','leased','retryable')` (`outbox.rs:196-206`), so a
   `'prepared'` row is invisible to the delivery worker with no new predicate.
2. `observation_targets()` (`invoices.rs:239-251`) is amended to exclude
   `awaiting_baseline`. Until the baseline exists the address is not watched, so
   no observation can bind, and there is nothing to race.
3. The application layer, now knowing the derived address, issues **one Electrum
   round** for that scripthash that returns *both* confirmed history and mempool
   entries, together with the tip height from the same round.
4. On success it persists, in one transaction: the **baseline outpoint set**
   (`txid:vout` for every output paying the derived address, confirmed or
   unconfirmed), the **baseline input set** (see B.4.3), `creation_chain_height`
   from that same round's tip, the drawn `nonce_sats` and `total_sats`
   (§B.8.2), the `prepare_expires_at` deadline, and flips the invoice
   `awaiting_baseline → prepared`. The outbox rows stay `'prepared'`.
   **Nothing is published by phase 1** — that is §B.11 phase 2, after the
   marketplace has committed its bind. This is the r4 change that closes R3-1;
   in r3 this step flipped to `observing` and released delivery.
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
  **r4 bounds it further with a second snapshot at the first observation tick —
  §B.4.6 — which is the mitigation r3 did not have.**
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

#### B.4.6 Bounding R1: the same-server argument, and the composed first-tick rule (NEW-1, A, Kimi floor)

Sol left A, NEW-1 and the Kimi floor item PARTIAL for one reason, and it is the
right one: the baseline is only as complete as the single Electrum view it was
taken from. r4 does not claim to close that. It does two things r3 did not:
states the completeness argument precisely enough to see where it fails, and
adds a second rule that composes with the baseline so that the window in which
R1 can fire is one poll interval rather than the whole live window.

**The same-server argument, stated precisely.** The baseline snapshot
(§B.4.1 step 3) is taken from **the same Electrum endpoint the observer
subsequently polls** — one endpoint string in the config
(`entrypoint.sh:152-153`), one single-source `ElectrumPort` trait
(`observer.rs:28-33`). So for a transaction `T` paying the derived address:

1. If `T` was in that server's mempool at snapshot time, it is in the baseline
   (the snapshot requests confirmed history *and* mempool in one round), and by
   §B.4.2 it is permanently ineligible regardless of the height it later
   appears at.
2. Therefore, if the observer *later* sees `T` and `T` is not in the baseline,
   `T` must have **entered that server's mempool after the snapshot**.
3. A transaction that entered the server's mempool after the invoice was
   baselined is, from the only chain view this deployment has, a
   post-invoice transaction — which is exactly what the rail is supposed to
   accept.

The argument is sound and it is *not* a completeness claim about the Bitcoin
network. It is a claim about one server's view, and it fails in two identified
ways:

- **Server restart or reload between snapshot and tick.** An electrs/Fulcrum
  process that restarts loses and rebuilds its mempool view. A transaction that
  the server had *not* indexed at snapshot time — because it was still
  propagating to that node — but which the network had, appears as "new" on a
  later tick while being older than the invoice. Nothing in a single view
  distinguishes it.
- **Mempool eviction and re-entry.** A transaction evicted for fee-rate or
  expiry and later rebroadcast leaves and re-enters the same server's mempool
  under the **same txid**. Under rule 1 it is in the baseline only if it was
  present at snapshot time; if it was evicted before the snapshot and
  re-entered after, it is absent from the baseline and rule 2's conclusion is
  wrong about it.

Both are narrow and neither is detectable from one view, which is why R1 stays
a named residual with Q4 as its gate.

**The mitigation: a second snapshot at the first observation tick, composed with
the baseline.** r2 had a first-tick rule and r3 discarded it because NEW-1
proved it insufficient on its own. It is insufficient alone; it is not useless.
The two rules compose:

- **Rule 1 (baseline, §B.4.2).** Any outpoint in the creation baseline set, or
  inheriting baseline status through §B.4.3's input set, is permanently
  ineligible. Keyed on `txid:vout`, never on height.
- **Rule 2 (first-tick, restored in r4).** At the invoice's **first observation
  tick after activation**, the observer takes a second snapshot of the derived
  address. Any transaction seen at tick 1 that is **unconfirmed** and **was not
  in the creation baseline** is written into the baseline set with
  `kind = 'pre_existing'` and is thereafter treated exactly like a baseline
  member — permanently ineligible.
- **Composition.** An outpoint can pay the invoice only if it was **first seen
  at tick ≥ 2**. Rule 1 catches everything the snapshot saw; rule 2 catches
  everything that was already unconfirmed one poll interval later. R1 therefore
  requires a transaction that reached the server's mempool in the window
  *between* the baseline snapshot and tick 1 while having been broadcast before
  the invoice existed — a sub-poll-interval race, not a live-window-wide
  exposure.

**Why rule 2 needs rule 1 and vice versa.** NEW-1's transaction — pre-existing
in the mempool, mined at `H+1`, first *seen* by the observer as confirmed — is
never unconfirmed at tick 1, so rule 2 never classifies it; rule 1 does, by
`txid:vout`. Conversely R1's transaction is absent from the baseline by
construction, so rule 1 cannot classify it; rule 2 does, if it is still
unconfirmed at tick 1. Neither rule subsumes the other and both ship. This is
the same "neither alone is sufficient" shape as §B.8.3, and for the same reason.

**The cost, stated because it is a real product cost.** A legitimate buyer who
broadcasts within the first poll interval — 30 s (§B.7) — has their payment seen
as unconfirmed at tick 1 and therefore classified `pre_existing` and refused.
That is a false *negative*: the order will not confirm and will resolve to
expiry and `manual_review` with the buyer's funds at the seller's own address.
**This is unacceptable as stated and is fixed by ordering, not by accepting it.**
The fix is that rule 2's second snapshot is taken **before the Payment Request
is published**, not after: §B.11 phase 2 performs the tick-1 snapshot *inside
activation*, in the same transaction that flips `prepared → observing` and
releases the outbox rows. Because the buyer cannot obtain the address until the
outbox has published (§B.11.5), no honest buyer can have broadcast before rule
2's snapshot, and the false-negative window is empty. The cost that remains is
one extra Electrum round per invoice at activation (~1 request, inside the §B.7
budget) and roughly one extra poll interval of latency on the *first* status the
buyer sees, because activation now does chain work before publishing. Both are
acceptable; a false negative that strands a real payment would not be.

**What this does not do.** It does not make the mempool view complete, it does
not detect the restart or eviction cases above, and it does not change Q4's
standing as the decision that actually closes R1. It converts R1 from "any
in-flight transaction to this address during the live window" into "an
in-flight transaction that reaches this one server between the baseline snapshot
and the activation snapshot", and it is proven by NEG-3b and F2c (§D).

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
- **Bounded account range — revised again in r4, and account 0 is no longer
  refused (owner decision 08:39).** r2 restricted the server to
  `account_index == 0`; r3 reversed that to `1 <= account_index <= 99` with 0
  refused, on the reasoning that account 0 is the account a wallet spends from.
  With manual paste and file import staying allowed on mainnet, that rule
  refuses the commonest legitimate case — **most wallets export only account
  0's xpub**, and several export nothing else — so r3's rule would have
  converted the owner's decision into a silent exclusion of most sellers.
  **r4 accepts `0 <= account_index <= 99`.** The upper bound stays, and stays
  for the same reason: it is what keeps the deny-list enumerable at accounts
  **0–99** of every known-public mnemonic (1,000 entries at 65 bytes, computed
  once at build time). `100` and above are refused with a named reason.
- **What the server can and cannot tell about a bare xpub — corrected, because
  r3 and the framing of this decision both overstated it in opposite
  directions.** The account index is **not** unknowable from the key: a BIP84
  account xpub is depth 3 and its child number *is* the hardened account index,
  and `derive_bip84_p2wpkh_address` already enforces
  `xpub.depth == 3 && xpub.child_number == ChildNumber::from_hardened_idx(account_index)`
  (`create_invoice.rs:249-270`), which `validate_xpub` invokes on every claim
  (`real_setup.rs:343-353`). So the submitted `account_index` is cross-checked
  against the key bytes and cannot be misdeclared. What the server genuinely
  **cannot** tell is the thing that actually matters: **whether that account is
  also the account the seller's wallet issues receive addresses from.** A
  Bitkit-reserved Shop account and a hand-pasted main account are both depth-3
  hardened account xpubs, and account 0 is a *convention* for "the wallet's main
  account", not a fact about the key. A seller can equally paste account 3 of a
  wallet that spends from account 3. Refusing index 0 would therefore refuse the
  common case while leaving the actual collision condition — a shared allocator
  — undetected at every other index. The defence has to be the §B.8.4 bound and
  the §B.8.5 binding, and it is. This is stated so no future round re-derives
  r3's rule from the same wrong premise.
- **The deny-list of known public test vectors stays, unchanged and
  unconditional** on every non-`proof` stack. It is the one claim-time
  refusal that is about key material the server *can* recognise, and paste being
  allowed makes it more load-bearing, not less: a seller copying the test-vector
  xpub out of a tutorial — or out of §D.1 of this document — is now a reachable
  path, and it is catastrophic and irreversible (§E).
- **Fingerprint↔seller binding (§B.8.5) is enforced in this same claim path.**
  A claim whose canonical 65-byte key tail has ever been claimed by a different
  seller pubky on this stack is refused with `key_claimed_by_other_seller`.
  That check is paykit-server state, in the claim handler, beside the deny-list
  — not a marketplace table (§B.0).
- **The mainnet claim exemption rides the role gate, and now covers only the
  deny-list.** `stack_role = proof` exempts a claim from the deny-list, because
  MAINNET-NEG must claim account 0 of the public test vector — that is where the
  176-transaction history lives (§D.1). With account 0 accepted on production,
  the second r3 exemption is gone, which is a simplification: one exemption, on
  one deployment invariant that a production database physically cannot boot
  under (§B.1). There is still no bypass branch in the claim handler. CI asserts
  the exemption in both directions — refused under `production`, accepted under
  `proof` — and asserts that `account_index = 0` is accepted under **both**
  roles, which is the r4 behaviour change and therefore needs a test that would
  have failed under r3.
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
  probes** (≈90 s at a 30 s interval), the server reports Bitcoin unavailable
  and Shop stops offering Bitcoin at checkout. It re-offers after **3
  consecutive successful probes**, so a flapping endpoint does not flip the
  checkout surface every tick. **Correction, r4 (R3-6, and NEW-5 which stayed
  PARTIAL because of it):** r3 said this rides "a status field the marketplace
  already polls". It does not — no such field exists, and the marketplace's
  payment-config endpoint checks only whether the seller's account is claimed
  (`payment_methods.rs:279-333`, verified). The full contract from paykit
  through the marketplace to the Shop client is specified in **§B.7.2** and is
  a W1 slice with an owner and tests, not an assumption. A buyer who
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

#### B.7.2 The `bitcoin_offer_available` contract, end to end (R3-6, closes NEW-5)

Three hops, each with a named owner and tests in §F (W1.4c, W1.10). Nothing here
is "already polled".

**Hop 1 — paykit-server publishes rail health it already computes.**
paykit-server exposes `/health/live` and `/health/ready`; readiness already
reports per-component state including `electrum`
(`http/health.rs:19-25`, `:37-57`). `ReadyResponse` gains one field:

```json
{
  "status": "ready",
  "postgres": "ready",
  "electrum": "ready",
  "paykit_delivery": "ready",
  "outbox": "ready",
  "bitcoin_offer_available": true,
  "electrum_tip_height": 882431,
  "electrum_tip_age_seconds": 12
}
```

`bitcoin_offer_available` is **not** a restatement of `electrum`. It is the
hysteresis-filtered creation gate: `false` after 3 consecutive failed active
probes, `true` again only after 3 consecutive successes (§B.7.1), and `false`
whenever `PAYKIT_BITCOIN_CREATION_ENABLED=false` (§C.16) — so the kill switch
and the auto-hide surface through **one** field and the marketplace never has to
combine two. The hysteresis counter lives in paykit-server's runtime beside the
probe that feeds it (`runtime.rs` readiness), because that is the only process
that sees every probe.

**Hop 2 — marketplace-service consumes it and caches it server-side.**
A new `paykit.rail_health()` client call against `/health/ready`, called from a
cached read rather than per checkout. Caching rules, chosen so that a paykit
outage cannot become a marketplace outage:

- TTL **15 s**, matching `PAYKIT_POLL_SECONDS` (`config.rs:143-145`) so the rail
  is not probed on a second cadence.
- On a paykit error or timeout, the **last known value is served until it is
  60 s stale**, then the value becomes `false`. This is fail-closed on the
  *offer*, which is a degradation, and deliberately not fail-closed on the
  request path — see the next bullet.
- **This endpoint stops returning 503.** Today `get_payment_config` returns
  `paykit_unavailable` / `UpstreamUnavailable` when `account_exists` fails
  (`payment_methods.rs:310-325`), which turns a paykit blip into a broken
  product page rather than a hidden payment option. r4 changes that: the
  seller's claim status is cached under the same rules and a stale-out resolves
  to `bitcoin_available: false`. A hidden option is the designed degradation
  (§B.7.1); a 503 on the buyer's product page is not.

The public response becomes:

```json
{
  "bitcoin_available": true,
  "bitcoin_offer_available": true,
  "stripe_payment_link": null,
  "paypal_merchant_email": null
}
```

`bitcoin_available` keeps its current meaning — this seller enabled Bitcoin and
has a claimed account — and `bitcoin_offer_available` is the rail-wide gate.
Both must be true for the client to offer Bitcoin. They are kept separate
because they have different owners and different copy: one is the seller's
setup, the other is this deployment's chain connectivity, and collapsing them
would make a rail outage look to a seller like a broken claim.

**Hop 3 — the Shop client hides the option with static copy.** When
`bitcoin_offer_available` is `false`, the Bitcoin choice is not rendered at
checkout. The copy is **static** and never interpolates operator state:
"Bitcoin is temporarily unavailable. Other payment methods are unaffected." No
tip height, no endpoint name, no retry countdown — that is operator information
and it belongs in §C.17's runbook, not in a buyer's browser. If the seller
supports no other rail, the existing no-rail empty state is shown; this is not a
new surface.

**The bind stays fail-closed regardless.** Auto-hide reduces the *probability*
that a buyer reaches the bind during an outage; it is not a guarantee, because
the cache can be up to 15 s stale and a buyer can hold a stale page. So
`POST /v0/orders/{id}/payment-method` keeps refusing cleanly on
`CreateInvoiceError::Unavailable` (`payment_methods.rs:447-553`) and keeps
rolling the bind back. Auto-hide is a conversion and trust measure, never a
correctness one; §B.4's fail-closed baseline is the correctness one.

### B.8 Independent allocators — the fix for NEW-2 (blocking, before general availability)

**Reshaped in r4 by the owner's 08:39 decision.** r3 aimed this section at an
invariant it could only reach by excluding every seller who does not use Bitkit.
The owner decided the opposite: manual xpub entry stays on mainnet. So the
Bitkit-issued Shop-exclusive account is the **recommended** path — one tap, and
`N = 0` while allocation state survives (§B.8.5) — and it is **not** the
invariant. The false-paid bound therefore has to stand on its own for pasted
keys, and it is now written as a model with named parameters instead of a single
number. For a pasted xpub the defence is the conjunction of five mechanisms, all
inside paykit-server (§B.0): the exact-amount predicate and the per-invoice
CSPRNG nonce (§B.8.2), the creation baseline (§B.4.1), the composed first-tick
rule (§B.4.6), and the fingerprint↔seller binding (§B.8.5). §B.8.4 gives the
number that conjunction produces, across the sensitivity table.

**The seller-side harm, stated plainly and stated once at claim time.** If the
seller's own wallet issues a receive address at an index paykit has assigned to
a live Shop invoice, and an unrelated customer pays that address the exact
nonce'd total, the order is marked paid and **the seller ships an item a Shop
buyer never paid for.** The marketplace holds nothing and the buyer sent nothing;
the loss is entirely the seller's. §C.10 states it in one sentence in the
pre-claim disclosure, in those terms — not "may cause unexpected behaviour".

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
right that advice is not an invariant — and r4 does not treat it as one. Advice
plus a quantified bound plus a server-side binding is what r4 ships, and each of
the three is named separately so nobody mistakes the advice for the mechanism.

#### B.8.1 Option (a) — a Shop-exclusive account xpub (recommended, not required)

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
hardened child number (§B.6). So (a) would be an invariant only if Shop accepted
the Bitkit claim path alone on mainnet and disabled manual entry. **The owner
decided on 2026-09-09 at 08:39 not to do that**, because it excludes every
seller who does not use Bitkit, and reach was judged to outweigh a residual that
the seller bears and is told about. (a) is therefore the recommended path and the
default in the UI, promoted with one-tap prominence and the honest reason
("Shop watches this account and nothing else does"), and **the design's
correctness does not rest on it**. Its second limitation is in §B.8.5: (a)'s
`N = 0` holds only while the wallet's allocation state survives, and r4 closes
the server-side half of that and quantifies the rest.

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
- **The buyer sees the total, and r4 says how the marketplace learns it
  (R3-3).** The order's recorded total *is* `price + nonce`, so the buyer's
  checkout figure, the Payment Request amount, the receipt and the seller's
  payout all agree. r3 asserted that agreement without a mechanism: the nonce is
  minted inside paykit-server while `POST /v0/payment-requests` returns **204
  No Content** (`http/payment_requests.rs:42-51`), so the marketplace had no way
  to learn it and would have recorded the pre-nonce price — under the exact
  predicate, every Bitcoin order would then silently fail to confirm. **Phase 1
  of §B.11 returns `{nonce_sats, total_sats, …}` in a 200 body**, the
  marketplace persists `paykit_total_sats`, and `activate` echoes `total_sats`
  so a disagreement is caught as `activation_total_mismatch` rather than
  discovered by a buyer. The nonce is absorbed in the price, **not refunded on
  chain** — an on-chain refund would need a signing path this rail must never
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

#### B.8.3 Decision: (c) — both, with (b) load-bearing and (a) recommended (revised r4)

Both ship. r3 called (a) the invariant and (b) the bound; **r4 inverts which one
is load-bearing**, because the owner's decision means (a)'s precondition is now
a seller's choice rather than a product constraint.

- **(b) — exact amount plus per-invoice nonce — is the mechanism.** It applies
  to every seller on every claim path, needs no cooperation from the seller's
  wallet, and cannot be silently switched off by a seller decision. It is a
  probability rather than an invariant, which is why §B.8.4 has to state that
  probability honestly across the parameter space instead of quoting one number.
- **(a) — a Bitkit-issued Shop-exclusive account — is the recommendation, and
  it is a strong one.** It drives `N` to zero rather than shrinking a
  probability, so a seller who takes it is not relying on (b) at all. It is the
  UI default (§C.10), the path the W5 canary exercises, and the path §G's Q9
  entry tells the owner to keep promoting.
- **The other three mechanisms are not optional either**, and it is worth
  stating that (b) alone would be much weaker without them: the baseline
  (§B.4.1) and the composed first-tick rule (§B.4.6) remove *history* as an
  attack surface so that (b) only has to cover genuinely new payments, and the
  fingerprint binding (§B.8.5) removes the cross-seller case entirely.

The reasoning that survives from r3 is the shape: neither (a) nor (b) is
sufficient alone, for different reasons rather than symmetric ones. What changed
is that the design can no longer assume (a) is present, so every claim it makes
must be true with (a) absent.

#### B.8.4 The residual, as a model (R3-2 — replaces r3's ≈10⁻³ claim)

**Sol's objection, accepted in full.** r3 wrote "≈1 collision × 1/999 ⇒
≈1.0 × 10⁻³" and called it an upper bound. It is neither. It silently replaced
"P(at least one collision over a month) ≈ 1" with "**one** collision trial per
month", which is a different quantity, and the assumptions A1–A4 do not justify
it. A busy seller does not get one trial per month; they get one trial per
non-Shop receipt that lands on a live Shop index, which is a rate, not a count.
r4 models that rate.

**Definitions.** Per **exposed-seller-month** — 30 days for one seller who is
*not* on a Bitkit-issued Shop-exclusive account:

| Symbol | Meaning | Where it comes from |
| --- | --- | --- |
| `r` | the seller's non-Shop receive rate, in fresh external addresses issued per day | seller behaviour; unmeasured (§D.4) |
| `s` | the Shop invoice rate, in invoices per day for this seller | seller behaviour; one index consumed per invoice (`invoices.rs:786-829`) |
| `L` | the live window, in hours — the `expires_at` horizon during which an assigned index can bind | §B.9; **ships at 1 h**, tied to `FIAT_PAYMENT_WINDOW_SECONDS` (`config.rs:37-41`) |
| `G` | the gap start offset, in indices — how far ahead of the wallet's frontier §B.5 starts paykit | §B.5 sets `last_used + 1 + 20`, so **`G = 21`** |
| `W` | the index window inside which the two allocators can coincide | the wallet's revealed look-ahead: **20** for a standards-compliant gap limit, **999** for a Bitkit tracked account (`WatchOnlyAccount.kt:9`) |
| `p_band` | P(an unrelated receipt's amount falls inside this invoice's 999-sat nonce band, i.e. in `[price+1, price+999]`) | amount distribution; `1` is the worst case |

**N — the expected number of non-Shop receipts landing on an address assigned to
a live Shop invoice, per exposed-seller-month.**

```
D = max(0, 30 − G/r)          exposed days: the wallet's frontier needs G/r days to reach paykit's start index
R = r × D                      non-Shop receipts during the exposed days (one per issued address, upper bound)
A = s × L/24                   Shop invoices live at any instant
N = R × min(1, A/W)            receipts × P(a receipt's index is one of the live Shop indices)
```

`A/W` is the load-bearing step and the assumption most worth attacking: it says
the live Shop indices sit inside the wallet's revealed look-ahead window of `W`
indices, and a receipt is equally likely to land on any of them. That is a
consequence of this design's own choice, not an arbitrary guess — §B.5 starts
paykit at `last_used + 21`, i.e. **just past the end of a 20-address revealed
window**, so once the wallet's frontier catches up the two allocators are
interleaved inside exactly that window. `min(1, ·)` caps the case where Shop has
more live invoices than the window has indices.

**The false-paid rate follows.** Under the §B.8.2 exact predicate, a colliding
receipt pays only if its amount equals `price + nonce` exactly:

```
E[false-paid per exposed-seller-month] = N × p_band / 999
P(any false-paid in the month)         = 1 − (1 − p_band/999)^N
```

**Sensitivity table**, `W = 20` (pessimistic: a standards-compliant wallet, not
a Bitkit tracked account), `G = 21`, `p_band = 1` (worst case — the seller sells
the identical item off-Shop at the identical nominal price):

| `r` (addr/day) | `s` (inv/day) | `L` (h) | `N` | `E[false-paid]` | `P(any)` |
| --- | --- | --- | --- | --- | --- |
| 1 | 1 | 1 | 0.019 | 1.9 × 10⁻⁵ | 1.9 × 10⁻⁵ |
| 1 | 1 | 24 | 0.45 | 4.5 × 10⁻⁴ | 4.5 × 10⁻⁴ |
| 1 | 10 | 1 | 0.19 | 1.9 × 10⁻⁴ | 1.9 × 10⁻⁴ |
| 1 | 10 | 24 | 4.5 | 4.5 × 10⁻³ | 4.5 × 10⁻³ |
| 20 | 1 | 1 | 1.21 | 1.2 × 10⁻³ | 1.2 × 10⁻³ |
| 20 | 1 | 24 | 29.0 | 2.9 × 10⁻² | 2.9 × 10⁻² |
| 20 | 10 | 1 | 12.1 | 1.2 × 10⁻² | 1.2 × 10⁻² |
| 20 | 10 | 24 | 289 | 0.29 | 0.25 |
| 100 | 1 | 1 | 6.21 | 6.2 × 10⁻³ | 6.2 × 10⁻³ |
| 100 | 1 | 24 | 149 | 0.149 | 0.14 |
| **100** | **10** | **1** | **62.1** | **6.2 × 10⁻²** | **6.0 × 10⁻²** |
| 100 | 10 | 24 | 1490 | 1.49 | 0.77 |

`E` scales linearly in `p_band`; `P(any)` scales approximately linearly while
`N·p_band/999 ≪ 1`.

**Reading the table honestly.**

- **The operating point that ships is `L = 1 h`**, because §B.9 ties `expires_at`
  to the hold deadline the marketplace already arms
  (`payment_methods.rs:548-553`) and that default is 3600 s. The `L = 24`
  rows exist to price a policy change, not to describe the product. Anyone
  proposing a longer hold window should read them: 24 h multiplies `N` by 24.
- **The headline number for the paste path is the bolded row**: a genuinely busy
  merchant (100 fresh non-Shop receive addresses a day, 10 Shop orders a day) at
  the shipped live window carries **E ≈ 6 × 10⁻² false-paid events per
  exposed-seller-month, P(any) ≈ 6%** — worst case on the amount distribution.
  That is roughly **60× worse than r3's claim**, and it is the number the owner
  accepted at 08:39. Across 100 such sellers it is about six events a month, and
  the design should not pretend otherwise.
- **A typical small seller is three to four orders of magnitude better off**:
  `r = 1, s = 1, L = 1` gives `E ≈ 2 × 10⁻⁵`. The risk is concentrated almost
  entirely in high-`r` sellers, which is actionable — see below.
- **`p_band = 1` is genuinely worst-case.** It requires the unrelated receipt to
  be within 999 sats of the Shop listing price. For a seller whose off-Shop
  receipts are unrelated amounts, `p_band` is small (a few times 10⁻³ or less
  for amounts spread over a typical range), which moves every row down by two to
  three orders of magnitude. The table is quoted at `p_band = 1` so the number
  cannot be accused of hiding behind a favourable distribution.

**What moves the number, in descending order of effect:**

1. **Use a Bitkit-issued Shop-exclusive account (§B.8.1).** `N = 0`: a different
   hardened account, and the wallet's own receive allocator takes no account
   index (`LightningService.kt:613-676`, `LightningService.swift:635-641`).
   This is a change of kind, not degree, and it is why (a) stays the
   recommendation under a decision that does not require it.
2. **A dedicated account in any wallet.** `r → 0` for that account, so `N → 0`
   by the same argument without needing Bitkit. This is what §C.10's disclosure
   asks for, and it is the reason the disclosure is worth its space.
3. **`W = 999` instead of 20** — a Bitkit tracked account's pre-revealed range —
   divides every row by 50.
4. **Widening the nonce to `[1, 9999]`** divides by 10, at the cost of up to
   9,999 unrefunded sats, which starts to be visible to a buyer. `[1, 999]` is
   where the defence is still free. Not taken, recorded as available.
5. **Shortening `L`.** Already at 1 h; shortening it further trades against
   buyers who need time to pay.

**Two things this model does not claim.** It is a model, not a measurement —
`r`, `s` and `p_band` are unmeasured and stay on the §D.4 list until real seller
behaviour exists. And it is worthless without the exact-amount predicate: under
today's `>=` (`invoices.rs:694`) every row's `1/999` becomes `p_amt` — the
fraction of the seller's non-Shop receipts at or above the listing price,
plausibly 0.1–0.5 — which puts the bolded row at `E ≈ 6`–`31` events per
seller-month. That is the r3 correction (#3) restated as the reason B.8.2 ships
the predicate and the nonce as one unit, and F5/F6 (§D.3) are what prove the
predicate is actually deployed.

#### B.8.5 Allocator resets, restores, and the fingerprint binding (R3-4)

Sol checked r3's "never reissued" claim and found it false as written, on both
platforms. r4 states the invariant with its actual precondition, closes the half
that can be closed server-side, and quantifies the half that cannot.

**What is verified, in both directions.** The monotonic reservation is real:
Android's `reserveAccountIndex` is `highestAccountIndex + 1` persisted in
`highestAccountIndexByWallet` (`WatchOnlyAccountStore.kt:150-174`), iOS's is the
same (`WatchOnlyAccountService.swift:201-231`), and both refuse index 0
(`WatchOnlyAccountStore.kt:259-263`, `WatchOnlyAccountService.swift:282-283`).
But it is monotonic **only over surviving allocation state**:

- Android: `WatchOnlyAccountStore.clear()` replaces the store with a fresh
  `WatchOnlyAccountData()` (`WatchOnlyAccountStore.kt:86-89`), and
  `WipeWalletUseCase` calls it as `watchOnlyAccountRepo.clear()` alongside the
  keychain wipe (`WipeWalletUseCase.kt:57-72`).
- iOS: `clear()` removes the defaults key (`WatchOnlyAccountService.swift:250-252`)
  and `AppReset` both calls `WatchOnlyAccountManager.shared.clear()` and
  removes the whole persistent domain (`AppReset.swift:45-49`).

**A fact r3 missed that matters in the seller's favour, verified here.** Both
wallets **back up and restore the allocation high-water mark**, so a seed
restore does not necessarily lose it. Android snapshots
`watchOnlyAccountStore.backupSnapshot()` into the backup payload as
`watchOnlyAccounts` + `watchOnlyAccountAllocationState`
(`BackupRepo.kt:592-599`) and restores it via `watchOnlyAccountRepo.restore(...)`
followed by `lightningService.reconcileWatchOnlyAccounts()`
(`BackupRepo.kt:715-719`). iOS's `restore(records:allocationState:)` merges the
restored high-water mark with the local one using
`max(local, restored)` per wallet key (`WatchOnlyAccountService.swift:125-166`),
which is a monotonic merge and cannot move the counter backwards.

**So the precise invariant is:** a Bitkit-reserved Shop account index is never
reissued **while allocation state survives, including across a seed restore whose
backup category restores successfully.** The residual is narrower than Sol's
finding implies but real: a wipe or reinstall followed by **no** restore, a
restore whose backup is unavailable or fails, or a restore from a snapshot taken
**before** the Shop account was reserved. In those cases the counter is 0 again
and the wallet may reissue account 1 **for a different purpose** while
paykit-server is still watching account 1's xpub for this seller.

**Mechanism to close the cross-seller half: server-side fingerprint↔seller
binding, in paykit-server (§B.0).** A new table
`claimed_key_fingerprints (key_fingerprint BYTEA PRIMARY KEY, creator_lookup_hash BYTEA NOT NULL, first_claimed_at TIMESTAMPTZ NOT NULL)`,
written in the same transaction as the claim commit, keyed on the canonical
65-byte tail (33-byte public key + 32-byte chain code) that §B.6's deny-list
already uses — so the xpub and zpub encodings of one key produce one entry.

- **The rule:** a claim is refused with `key_claimed_by_other_seller` if its
  fingerprint has **ever** been claimed by a different seller pubky on this
  stack, whether or not that claim is still active. Never-expiring, because the
  risk it prevents never expires: two sellers watching one key means one
  seller's payment can confirm the other's order.
- **Re-claim by the same seller is unaffected**, which matters because the claim
  is already immutable per creator (`bitkit_claim.rs:69-74`) and because Q11's
  re-onboarding banner asks every existing seller to re-claim.
- **Scope, stated because it is a real limit:** the table is per stack, so it
  binds within production and within proof but not across them. That is the
  cross-instance replay item already in §E, and it is unchanged.
- **The seller UI shows the bound account after a restore** (§C.10): the claim
  response's `key_fingerprint`, `first_derived_address` and `next_child_index`
  (§B.6) are rendered as "Shop is watching account *n* of this wallet — do not
  use it for anything else", so a seller who has just restored from seed is told
  which account is still being watched rather than discovering it by shipping a
  free item.

**The half that cannot be closed server-side, quantified rather than waved
away.** After a wipe-and-restore with no allocation state, the seller's *own*
wallet may reissue account 1 for an unrelated purpose. paykit-server cannot see
that: it is the same seller, the same key, and a legitimate claim. To produce a
false paid, that seller must (1) lose allocation state, **and** (2) have the
wallet reserve account 1 again for something that receives, **and** (3) receive
on an index inside the live Shop window, **and** (4) receive the exact nonce'd
total. Steps (3) and (4) are the §B.8.4 model with `r` set to the reissued
account's own receive rate — which for a freshly reserved watch-only account is
low, because it starts empty. The composite is well below the bolded paste-path
row, and it is bounded by the same nonce. It is added to §B.10 as **residual
R3** with its gate, rather than being claimed closed.

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

**Three** exposures survive this design, one more than r3 named. None is papered
over; each has a gate, and each is now bounded by the §B.8.4 model rather than by
r3's single number.

- **R1 — a mempool transaction the server's Electrum has not yet seen at
  snapshot time** (§B.4.4). It is absent from the baseline and can later confirm
  above the floor. One Electrum cannot close this: the baseline is only as
  complete as the single view it is taken from. **Gates:** **§B.4.6 narrows the
  window from the whole live window to the interval between the baseline
  snapshot and the activation snapshot** by composing the baseline rule with a
  restored first-tick rule, and states the two ways the same-server argument
  fails (server restart, mempool eviction and re-entry); it requires a
  transaction in flight to the exact derived address inside that interval, so it
  is empty for a Shop-exclusive account (§B.8.1) where no third party knows the
  address; it is bounded by the exact-amount nonce per §B.8.4; and it is a
  stated reason **Q4** matters, since two-server corroboration is what would
  actually close it. Scheduled with corroboration, not before.
- **R2 — a seller who restores the same seed into a third-party wallet and
  points it at the Shop account index.** (a) is an invariant over Bitkit, not
  over the seed. **Gates:** §C.10 seller copy states in one sentence that the
  Shop account is exclusive and that using it in another wallet can cause an
  order to be marked paid when it was not and the seller to ship for free; the
  exposure is bounded by (b) at the §B.8.4 rate with `r` set to that wallet's
  receive rate; and it requires a deliberate act against written guidance. Not
  closed, and not claimed to be.
- **R3 — new in r4: a seller's own wallet reissuing the Shop account index after
  losing allocation state** (§B.8.5). A wipe or reinstall with no successful
  backup restore, or a restore from a snapshot predating the Shop reservation,
  resets the wallet's high-water mark; the wallet may then reserve account 1
  again for an unrelated purpose while paykit still watches it. **Gates:** both
  wallets back up and restore the allocation state and iOS merges it with
  `max()` (`BackupRepo.kt:592-599`, `:715-719`;
  `WatchOnlyAccountService.swift:125-166`), so the common restore path preserves
  the invariant; the server-side fingerprint↔seller binding (§B.8.5) closes the
  cross-seller variant outright; the seller UI names the bound account after a
  restore (§C.10); and the remainder needs four independent conditions to
  coincide and is bounded by the same nonce. Named, not closed.

All three are listed in §E and all three are in scope for the W3 Kimi audit and
the W3b review, so a reviewer sees them named rather than discovering them.

### B.11 Two-phase creation and activation (R3-1, P1 — the gating finding)

#### B.11.0 The defect, from the code

Two verified facts compose into a lost-money path that every earlier round
missed:

1. **marketplace-service calls paykit before its own commit.** Inside
   `POST /v0/orders/{id}/payment-method`, the comment says the request is made
   first "so a refusal leaves the order unbound", and the call is made on the
   open transaction, with `tx.rollback()` on error and `tx.commit()` only after
   (`payment_methods.rs:713-759`, verified).
2. **paykit queues publication immediately on commit.** `create_atomic` inserts
   both outbox rows with `status = 'queued'` in the same transaction as the
   invoice (`invoices.rs:1023-1040`), and the delivery worker claims any
   `'queued'` row whose dependency is delivered (`outbox.rs:196-206`).

So between paykit's commit and the marketplace's commit there is a window in
which a **valid, published, payable** Payment Request exists for an order that
the marketplace has rolled back or never committed. The order keeps
`adapter = 'sandbox'` (schema default, `0009_payment_methods.sql:25`), and the
paykit poller only ever claims orders with `p.adapter = 'paykit'`
(`workers.rs:721-758`, verified). Nothing polls that invoice, ever. A buyer whose
wallet already received the request can pay it, on mainnet, and the payment is
observed by paykit and seen by nobody: not `paid`, not `manual_review`, not
expired-with-a-human. **Real funds, moved, silently orphaned.** It needs no
adversary — a marketplace commit failure, a pod restart, or a lost response is
enough.

r3's §B.4.1 made this *more* reachable, not less, by moving publication to a
post-commit application step: the invoice is now committed and then published
from a second transaction, widening the window.

The fix is not to reorder the two calls — the marketplace cannot commit a bind
to an invoice that does not exist yet, and paykit cannot publish an address it
has not allocated. The fix is to split paykit's side so that **allocation and
baseline happen before the marketplace commits, and publication happens after**.

#### B.11.1 paykit-server as a state machine

States on `invoices` (the `baseline_state` column from §B.4.5, extended):

| State | Observed? | Published? | Meaning |
| --- | --- | --- | --- |
| `awaiting_baseline` | no | no | allocated and committed; baseline snapshot in flight |
| `prepared` | no | no | baseline persisted, nonce and total minted, waiting for activation |
| `observing` | yes | yes | activated; outbox released; the only payable state |
| `expired_tail` | yes | yes | past `expires_at`; observations can only reach `manual_review` (§B.9) |
| `expired_final` | no | — | final; left `observation_targets()` (§B.9) |
| `void_baseline_failed` | no | no | final; snapshot failed (§B.4.1 step 5) |
| `void_prepare_expired` | no | no | final; reaped after `prepare_ttl` without activation |
| `void_cancelled` | no | no | final; marketplace voided the prepare |

Transitions, each with its trigger, and no others:

| From | To | Trigger |
| --- | --- | --- |
| — | `awaiting_baseline` | `create_atomic` commits (phase 1 interior) |
| `awaiting_baseline` | `prepared` | baseline snapshot persisted (§B.4.1 step 4) |
| `awaiting_baseline` | `void_baseline_failed` | snapshot failure (§B.4.1 step 5) |
| `prepared` | `observing` | **`activate`** verifies signature + total, takes the §B.4.6 tick-1 snapshot, flips outbox rows `'prepared' → 'queued'` — one transaction |
| `prepared` | `void_prepare_expired` | reaper: `now > prepare_expires_at` |
| `prepared` | `void_cancelled` | **`void`** |
| `observing` | `expired_tail` | `now > expires_at` (§B.9) |
| `expired_tail` | `expired_final` | 24 h tail elapsed, or `resolve` (§B.9) |

**`prepare_ttl` = 15 minutes**, so `prepare_expires_at = created_at + 15 min`.
Chosen to be far longer than any plausible marketplace commit-plus-outbox
latency (single-digit seconds) and far shorter than the 1 h hold window, so a
reaped prepare is always distinguishable from an expired order. It is a
paykit-server config value, not a marketplace-supplied one, for the same reason
the observation TTL is (§B.9): fewer contracts.

**The reaper.** One query per §B.7 tick:
`UPDATE invoices SET baseline_state='void_prepare_expired' WHERE baseline_state='prepared' AND prepare_expires_at < NOW()`.
`void_prepare_expired` is final, so the invoice never enters
`observation_targets()` — a reaped prepare costs nothing to hold and one burned
derivation index (§B.4.1), which is already an accepted cost.

#### B.11.2 marketplace-service as a state machine

State on `orders`: a new `paykit_activation_state` column, alongside the
existing `paykit_request_reference` / `paykit_request_state`
(`0009_payment_methods.sql:38-41`).

| State | Meaning | Buyer sees |
| --- | --- | --- |
| `preparing` | phase 1 returned, bind committed, activation not yet confirmed | "Preparing your Bitcoin payment…" |
| `active` | `activate` returned 2xx | the Payment Request in their wallet |
| `voided` | prepare voided or reaped; the bind is released | "Bitcoin payment could not be prepared — choose a payment method again" |

Transitions:

| From | To | Trigger |
| --- | --- | --- |
| — | `preparing` | phase 1 succeeded **and** the local bind transaction committed |
| `preparing` | `active` | activation outbox row delivered (2xx from `activate`) |
| `preparing` | `voided` | activation returned `prepare_expired` or `unknown_invoice` |
| `active` | — | normal payment lifecycle takes over (`paykit_request_state`) |

`paykit_request_state`'s check constraint gains `'preparing'` as its initial
value, and the poll query is unchanged in shape: it claims
`o.paykit_request_state IN ('pending','detected')` (`workers.rs:745-750`), so a
`preparing` order is **not polled** until activation flips it to `pending`. That
is the correct behaviour and it falls out of the existing query rather than
needing a new predicate.

#### B.11.3 The messages, verbatim

**Phase 1 — `POST /v0/payment-requests`.** Same route, same signed-body
authentication (canonical JSON body, one `x-paykit-signature` header verified
against the configured trusted keys — `http/payment_requests.rs:1-6`,
`http/auth.rs`). Two fields are added to the request and **the response changes
from 204 to 200 with a body, which is what closes R3-3.**

Request:

```json
{
  "creator": "pubky:o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngy",
  "reader": "pubky:8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo",
  "reference": "01HZ8QK3M4N5P6R7S8T9V0W1XY",
  "amount_sats": 250000,
  "expires_at": "2026-09-09T09:39:00Z",
  "idempotency_key": "01HZ8QK3M4N5P6R7S8T9V0W1XY:1"
}
```

`amount_sats` stays the **listing price**; the nonce is minted server-side
(§B.8.2) and never supplied by the caller. `expires_at` is required, is taken
from the same hold deadline the marketplace arms at
`payment_methods.rs:548-553`, and is refused if missing, past, or beyond the
configured maximum (§B.9). `idempotency_key` is `{order_reference}:{bind_attempt}`
and is what §B.11.6's replay rules key on, in addition to the existing
`(creator, bundle)` binding.

Response `200 OK`:

```json
{
  "invoice_id": "9f2b1c4e-7a56-4d18-b0e3-2c81f5a9d740",
  "state": "prepared",
  "nonce_sats": 437,
  "total_sats": 250437,
  "expires_at": "2026-09-09T09:39:00Z",
  "prepare_expires_at": "2026-09-09T08:54:00Z",
  "derived_address_fingerprint": "3f7a1c9e5b204d86"
}
```

`total_sats` is authoritative: it is `amount_sats + nonce_sats` and it is the
figure the marketplace must charge, display and record. `derived_address_fingerprint`
is the first 8 bytes of SHA-256 over the derived address string, hex-encoded —
**deliberately not the address**. It lets the marketplace and the §D proofs
assert that the address the buyer's wallet received is the one paykit derived,
without the marketplace ever holding a Bitcoin address (§B.0), and without the
response becoming a way to obtain a payable address before activation
(§B.11.5).

**Phase 2 — `POST /v0/payment-requests/{invoice_id}/activate`.** Signed with the
same marketplace trusted key as phase 1, same body-signature scheme, idempotent.

Request:

```json
{
  "invoice_id": "9f2b1c4e-7a56-4d18-b0e3-2c81f5a9d740",
  "total_sats": 250437,
  "activation_attempt": 3
}
```

`invoice_id` is repeated in the body because the signature covers the body, not
the path — signing only the body while trusting the path would let a valid
signature be replayed against a different invoice id. `total_sats` is echoed as
a **guard, not an instruction**: a mismatch against the stored total returns
`activation_total_mismatch` and does **not** activate, which catches a
marketplace that persisted the pre-nonce amount (the exact R3-3 bug) instead of
silently publishing a request the buyer's order total disagrees with.
`activation_attempt` is the retry counter, logged, never trusted.

Response `200 OK`:

```json
{
  "invoice_id": "9f2b1c4e-7a56-4d18-b0e3-2c81f5a9d740",
  "state": "observing",
  "activated_at": "2026-09-09T08:39:07Z",
  "expires_at": "2026-09-09T09:39:00Z",
  "total_sats": 250437
}
```

**Cancellation — `POST /v0/payment-requests/{invoice_id}/void`.** Idempotent.

```json
{
  "invoice_id": "9f2b1c4e-7a56-4d18-b0e3-2c81f5a9d740",
  "reason": "marketplace_bind_rolled_back"
}
```

Response `200 OK`:
`{"invoice_id": "9f2b1c4e-…", "state": "void_cancelled", "voided_at": "2026-09-09T08:39:07Z"}`

**`DELETE` was considered and rejected**, for a mechanical reason rather than a
stylistic one: authentication on this router is a signature over the **canonical
JSON body** (`http/payment_requests.rs:1-6`), so a bodyless `DELETE` has nothing
to sign and would need a second auth scheme on the money path. `POST …/void`
reuses the existing one exactly.

**Named errors**, all returned as the existing `ApiError` shapes with distinct
codes so the marketplace can branch without string-matching prose:

| Code | HTTP | When | Marketplace action |
| --- | --- | --- | --- |
| `prepare_expired` | 409 | `activate` or `void` on a `void_prepare_expired` invoice | void the bind; buyer retries |
| `invoice_finalized` | 409 | `activate` on `void_baseline_failed` / `void_cancelled` | void the bind; buyer retries |
| `activation_total_mismatch` | 409 | echoed `total_sats` ≠ stored | **alert**; do not retry; do not bind |
| `unknown_invoice` | 404 | no such invoice on this stack | void the bind; alert (indicates a stack mixup) |
| `bitcoin_creation_disabled` | 503 | kill switch, phase 1 only (§C.16) | bind refused cleanly, as today |

#### B.11.4 Failure matrix

Every window in the protocol, what is durable at that instant, and the outcome.
"Payable" means a buyer could move money to the derived address.

| # | Failure | Durable state | Payable? | Resolution | Buyer experience |
| --- | --- | --- | --- | --- | --- |
| 1 | Crash **between phase 1 and the marketplace commit** | paykit: `prepared`, outbox `'prepared'`. Marketplace: nothing (transaction rolled back) | **No** — unpublished (§B.11.5) | Reaper voids it at `prepare_ttl` (15 min) → `void_prepare_expired`. One burned index. No marketplace record to reconcile | Bind failed; Bitcoin still offered; picks again |
| 2 | Phase 1 response **lost** (paykit committed, marketplace saw a timeout) | same as #1 | **No** | Marketplace rolls back and, on retry, replays phase 1 with the same `idempotency_key` → the **same prepared body** (§B.11.6). No second index burned | Retry succeeds transparently |
| 3 | Crash **after the marketplace commit, before `activate`** | paykit: `prepared`. Marketplace: bind committed, `paykit_activation_state='preparing'`, activation row in its outbox | **No** — this is the case R3-1 is about, and it is now the safe one | Marketplace outbox retries `activate` until 2xx or `prepare_expired` (§B.11.8) | Checkout shows **"Preparing your Bitcoin payment…"** until activation; no address exists to pay |
| 4 | `activate` **response lost** | paykit: `observing`, published. Marketplace: still `preparing` | Yes (correctly — the order is committed) | Outbox retries; `activate` is **idempotent** and returns the same `observing` body (§B.11.6) | Wallet may receive the request slightly before Shop shows it active; both converge |
| 5 | `activate` arrives **after** `prepare_ttl` reaped the invoice | paykit: `void_prepare_expired`. Marketplace: `preparing` | No | `prepare_expired` (409) → marketplace **voids the bind**, releases the inventory hold, sets `paykit_activation_state='voided'` | "Bitcoin payment could not be prepared — choose a payment method again." Buyer retries; a retry is a fresh phase 1 |
| 6 | Marketplace **commit fails** after phase 1 returned | as #1 | No | Marketplace calls `void` best-effort inline; if that call also fails, the reaper is the backstop | Bind failed; picks again |
| 7 | Marketplace **outbox never drains** (worker down) | paykit: `prepared`; marketplace: `preparing` | No | Reaper voids at 15 min; the order's own hold expires at 1 h; §B.7.1 backlog alerting covers the worker | Stuck on "Preparing…" then a clean failure — never a payable-but-unpolled request |
| 8 | Two concurrent binds for the same order | Serialized by `create_atomic`'s `FOR UPDATE` on the creator row (`invoices.rs:733-741`) and by the `(creator, bundle)` replay check (`:745-757`) | n/a | The second is an exact replay and returns the same prepared body (§B.11.6) | One invoice, one index, one total |
| 9 | `activate` with the wrong `total_sats` | paykit stays `prepared` | No | `activation_total_mismatch`, no activation, **alert** — this is R3-3 caught at runtime | Bind fails; the mismatch is an engineering bug, not a buyer action |
| 10 | Baseline snapshot fails (Electrum down) | `void_baseline_failed` before any response | No | Phase 1 returns `Unavailable`; the marketplace bind is refused and rolled back on the existing path (`payment_methods.rs:447-553`); §B.7.1 auto-hide follows | Bitcoin unavailable at checkout, not broken at bind |

**The property the matrix establishes, stated as a single invariant:** *no state
of the protocol has a payable Payment Request without a committed marketplace
bind that polls it.* Rows 1, 2, 3, 5, 6, 7 and 10 are all "prepared but
unpublished"; rows 4 and 8 have a committed bind. There is no row with
"payable + no committed bind", which is exactly the row R3-1 found in r3.

#### B.11.5 Verifying that a `prepared` invoice is unreachable by a buyer

The matrix's safety rests entirely on "unpublished ⇒ unpayable", so that claim
is traced through the code rather than asserted.

**How a Payment Request reaches Bitkit today:**

1. `create_atomic` inserts **two** outbox rows: an **endpoint-publication**
   intent and a **payment-request-proposal** intent, the second with
   `depends_on_id` pointing at the first (`invoices.rs:847`, `:934`;
   `insert_outbox`, `:1023-1040`).
2. The delivery worker claims only rows whose
   `status IN ('queued','leased','retryable')` **and** whose dependency is
   `'delivered'` (`outbox.rs:196-206`).
3. A claimed row is dispatched by intent type (`workers/outbox.rs:132-145`):
   `EndpointPublication` → `enqueue_private_payment_list_with_receiving_details`,
   `PaymentRequestProposal` → `propose_payment_request`. Both are Paykit SDK
   calls that write an **encrypted private message to the reader's Paykit
   receiver path**, after `ensure_link_with_peer` and a marker-fingerprint check
   (`workers/outbox.rs:103-131`).
4. Bitkit ingests by calling `receivePrivateMessagesFromLinkedPeers()` and then
   reading `paymentRequests()` from the SDK
   (`PaykitPaymentRequestRepo.kt:383-385`, with
   `processPendingPrivateMessages()` at `:523`); iOS is at parity via
   `PaykitPaymentRequestService`.

**Where the address is.** The buyer's payable address is in the
**endpoint-publication** intent's `receiving_details` — the
`{"value": <address>}` payload built at `create_invoice.rs:213`, `:241` — which
is row 1 of the two. So the address is not merely unannounced while the invoice
is `prepared`: **it has never left paykit-server's database in any form a buyer
can read.** The payment-request row cannot even be claimed ahead of it, because
its `depends_on_id` requires row 1 to be `'delivered'` (`outbox.rs:205`).

**Therefore, with both rows written `'prepared'` (§B.4.1 step 1):** the worker
never claims either row; no private message is written to the buyer's receiver
path; `receivePrivateMessagesFromLinkedPeers()` has nothing to return;
`paymentRequests()` does not list it; and no Bitkit surface can display or pay
it. The buyer cannot obtain the address from the marketplace either — the buyer
never sees an address in Shop at all (§A, step 7), and phase 1 returns only a
**fingerprint** of it (§B.11.3). The only remaining source would be the
seller's own xpub plus the derivation index, which the buyer does not have.

**And the invoice is not observed while prepared**, so even a buyer who somehow
obtained the address and paid it could not drive a status change:
`observation_targets()` is amended to exclude every non-`observing`/`expired_tail`
state (§B.4.1 step 2, on `invoices.rs:239-251`). Such a payment would sit at the
seller's own address, unobserved, and is the same off-rail case as a payment
after `expired_final` (§B.9).

This is the claim W1.1c's tests must prove directly, not by inspection: a
`prepared` invoice yields **zero** claimable outbox rows from
`OutboxStore::claim` and **zero** entries from `observation_targets()`, and a
funded payment to its derived address while prepared changes no status.

#### B.11.6 Replay semantics, per state (R3-5)

Sol verified that exact replay today returns success without inspecting
lifecycle state (`create_payment_request.rs:129-142` →
`invoices.rs:363-427` / `:745-780`): the replay branch loads the assignment and
the outbox row and returns `replayed: true` regardless of what state the invoice
is in. With `prepared` and the void states existing, that is a correctness bug —
a replay could report success for an invoice that has been reaped.

**Phase 1 replay, by state.** `InvoicePreflight::ExactReplay` (same `creator`,
same `bundle`, same `payment_request_binding`, same `idempotency_key`) resolves
as:

| Invoice state | Phase 1 replay returns |
| --- | --- |
| `awaiting_baseline` | **Waits** for the in-flight baseline to reach `prepared` or `void_baseline_failed`, bounded by the request deadline (`elapsed_remaining`, `create_payment_request.rs:118-127`); on deadline, `DependencyTimeout`. Never a second snapshot, never a second index |
| `prepared` | `200` with the **same prepared body** — same `invoice_id`, `nonce_sats`, `total_sats`, `prepare_expires_at`, `derived_address_fingerprint`. Idempotent by construction |
| `observing` | `200` with the **same body**, `state: "observing"`. A marketplace that lost its record after activation recovers the total from here |
| `expired_tail` | `200` with `state: "expired_tail"`. Informational; the marketplace's own hold has expired too |
| `void_baseline_failed` | `409 invoice_finalized` — a **finalized failure**, not a success. This is the r3 bug |
| `void_prepare_expired` | `409 prepare_expired` |
| `void_cancelled` | `409 invoice_finalized` |
| `expired_final` | `409 invoice_finalized` |

A **different** `payment_request_binding` for the same `(creator, bundle)` stays
`Conflict` as today (`invoices.rs:745-748`) — that is a different order total or
a different reader against the same bundle and must never silently reuse the
address.

**Phase 2 replay.** `activate` is idempotent on `invoice_id`: `prepared` →
activates and returns `observing`; `observing` → returns the same `observing`
body without re-enqueuing outbox rows or retaking the tick-1 snapshot;
`expired_tail` → returns `expired_tail` (the request was published and has since
expired — the marketplace's retry was simply very late); the three void states →
the 409s above. The flip `'prepared' → 'queued'` is
`UPDATE … WHERE status = 'prepared'`, so a concurrent second activation affects
zero rows and cannot double-enqueue.

**`void` replay.** `prepared` → `void_cancelled`; `void_cancelled` → the same
body (idempotent); `void_prepare_expired` → `200` with
`state: "void_prepare_expired"`, since the caller's intent is already satisfied;
`observing` or `expired_tail` → `409 invoice_finalized`, because a published
request must expire through §B.9's tail rather than vanish, or the NEW-3 orphan
returns.

#### B.11.7 Interaction with `awaiting_entitlement` and `sandbox_advance`

**`awaiting_entitlement` is unchanged, and that is the point.** The payment row
is created `awaiting_entitlement` with `adapter='sandbox'` at checkout
(`0009_payment_methods.sql:25`) and the bind flips the adapter to `paykit`
(`payment_methods.rs:593`, `:675-681`). r4 does not touch that sequence: the
adapter flip and `paykit_activation_state='preparing'` commit **together**, in
the transaction phase 1 precedes. So the invariant the poller relies on holds
from the first committed instant — any order that could ever have a payable
Bitcoin request already has `adapter='paykit'` and is therefore already
reachable by `claim_due_paykit_orders` (`workers.rs:721-758`) as soon as
activation moves `paykit_request_state` to `'pending'`. The R3-1 window where an
order was payable while still `'sandbox'` is closed by construction rather than
by a reconciliation job.

**`sandbox_advance` gets safer, not weaker.** `payment.sandbox_advance` refuses
any payment whose `adapter != "sandbox"` (`handlers/payment.rs:60-65`), so it is
already refused once Bitcoin is bound. The r3 residual — a sandbox advance in
the gap *before* any rail is bound — is unchanged in kind, but the two-phase
protocol removes its dangerous overlap: previously a sandbox advance could race
a paykit invoice that was already published; now, during `preparing`, the
adapter is already `paykit` **and** nothing is published, so neither side of the
race exists. Every §D harness keeps asserting `payments.adapter == 'paykit'`
immediately after the bind (§C.20), and W2.4 adds the assertion that
`sandbox_advance` is refused while the order is `preparing`.

#### B.11.8 The marketplace's activation outbox

**It has one, and it needs a small extension rather than a new table** —
verified rather than assumed. `crates/service/migrations/0001_init.sql:194-204`
defines `outbox (id, event_id, kind, payload, created_at, lease_until,
delivered_at)` with an undelivered index; `claim_outbox_batch` leases a batch
(`workers.rs:260-275`) and `drain_outbox` delivers it (`workers.rs:338-352`),
driven by the `TASK_OUTBOX` worker (`workers.rs:66`, `:1573-1575`).

**The one real obstacle, stated because it is a code change and not a
configuration one:** `deliver_claimed` routes **only** `notification.*` kinds and
`anyhow::bail!`s on anything else — "outbox row {} has unroutable kind {}"
(`workers.rs:292-294`). A `paykit.activate` row inserted today would fail the
whole batch. So W1.11 (§F) adds a dispatch arm:

- **Kind** `paykit.activate`, payload
  `{"invoice_id": …, "order_id": …, "total_sats": …}`, inserted in the **same
  transaction as the bind** — which is what makes activation durable: the bind
  and the intent to activate commit atomically, so failure mode #3 is a retry
  rather than a loss.
- **Delivery** calls `activate`, then in one transaction stamps `delivered_at`
  and sets `paykit_activation_state='active'` and
  `paykit_request_state='pending'` — the same "effect and mark commit together"
  discipline the notification arm already uses (`workers.rs:281-284`,
  `:305-327`), so a redelivered row cannot apply twice.
- **Terminal errors** (`prepare_expired`, `invoice_finalized`, `unknown_invoice`)
  stamp `delivered_at`, set `paykit_activation_state='voided'`, release the
  inventory hold, and emit a `payment.bitcoin_prepare_voided` notification
  intent. `activation_total_mismatch` is **not** treated as terminal-and-quiet:
  it stamps `delivered_at`, voids, and alerts, because it means the two services
  disagree about money.
- **Retry** is the existing lease-and-retry behaviour; the reaper (15 min) and
  the hold window (1 h) bound it, so there is no unbounded retry loop.

The refusal path in `payment_methods.rs:713-759` stays exactly as it is for
phase 1 — a phase-1 refusal still rolls the bind back before commit, which is
the behaviour Sol verified and the reason phase 1 is the right place to keep the
fail-closed baseline.

---

## C. Per-layer switch table

Order of operations is the numbered column. Nothing in steps 1–10 touches
production.

| # | Layer | Exact change | Rollback | Blast radius if wrong |
| --- | --- | --- | --- | --- |
| 1 | Fork: creation baseline and post-invoice eligibility | §B.4 in full: `awaiting_baseline` state excluded from `observation_targets()`, the post-commit/pre-publication baseline snapshot of confirmed history **and** mempool with the tip from the same round, baseline outpoint and replaced-input sets, `void_baseline_failed` on any snapshot failure, V2 payment record with `creation_chain_height` and the baseline digest, `confirmed_height` on `ObservedOutput`, migration `0002`. | Revert; the mainnet databases do not exist yet. | **Critical.** Without it a legitimate seller's old receipts confirm unpaid orders (P1-A), and a pre-invoice mempool transaction mined before the first tick does the same (NEW-1). This is the gate on real money, not a hardening item. |
| 1b | Fork: exact amount predicate and invoice amount nonce | §B.8.2: `invoices.rs:694` `>=` → `==`; overpayment reports `amount_matched: false` and routes to `manual_review`; CSPRNG nonce `[1,999]` added to the required amount and carried as the order total. | Revert to `>=`; the nonce is inert without it, so revert both together. | **Critical.** This is the bound on NEW-2's residual and on R1, and after the 08:39 owner decision it is the *primary* defence for pasted xpubs rather than a backstop (§B.8.3). Reverting only one half silently removes the defence while leaving the code looking defended. |
| 1c | **Fork: two-phase prepare/activate (R3-1)** | §B.11 in full: `prepared` / `void_prepare_expired` / `void_cancelled` states; both outbox rows inserted `status='prepared'` instead of `'queued'` (`invoices.rs:1030`); `POST /v0/payment-requests` returns **200 with a body** instead of 204 (`http/payment_requests.rs:42-51`) carrying `{invoice_id, nonce_sats, total_sats, expires_at, prepare_expires_at, derived_address_fingerprint}` (closes R3-3); new signed idempotent `POST /v0/payment-requests/{id}/activate` and `…/void`; the 15-minute `prepare_ttl` reaper; the §B.4.6 tick-1 snapshot inside activation; state-inspecting replay (closes R3-5). | Revert **together with step 4d** — a reverted paykit side with an activating marketplace bricks every Bitcoin bind. Because production is created empty, there is no data migration to reverse. | **Highest.** Without it, a marketplace crash or a failed commit leaves a published, payable mainnet Payment Request that nothing polls, and the buyer's funds are silently orphaned (R3-1). This is the gating change for real money, ahead of every other item in this table. |
| 2 | Fork: claim-time index scan | §B.5: `ChainHistoryPort`, gap-limit windows, `next_child_index` initialised above the last used index, refuse on Electrum failure or >1,000 scanned. | Revert. | High. Without it the server derives onto used addresses. Also sets `G = 21`, the gap start offset the §B.8.4 model depends on. |
| 3 | Fork: deny-list, bounded account range, fingerprint in the claim response, **fingerprint↔seller binding**, `stack_role` invariant | §B.6 and §B.8.5: mainnet accepts `0 <= account_index <= 99` — **account 0 is accepted, reversing r3** (owner decision 08:39); the deny-list covers accounts 0–99 of every known-public mnemonic and stays unconditional off `proof`; `key_fingerprint` / `first_derived_address` / `next_child_index` in the claim response; new `claimed_key_fingerprints` table refusing a key ever claimed by a different seller pubky. | Revert. Reverting the binding re-opens the cross-seller half of R3-4. | High — the public test key reaching a real listing is unrecoverable, and paste being allowed makes that path reachable from a tutorial or from §D.1 of this document. |
| 4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe, **availability auto-hide** | §B.7 and §B.7.1, including the 3-probe auto-hide with 3-probe recovery hysteresis. | Revert to the unbounded path only on the proof stack, never production. | High: a ban stops all confirmation silently and `/health/ready` currently reports Electrum without hysteresis. Without auto-hide, one Electrum outage fails every Bitcoin checkout at the bind (NEW-5). |
| 4c | **Fork: `bitcoin_offer_available` on `/health/ready` (R3-6)** | §B.7.2 hop 1: `ReadyResponse` (`http/health.rs:19-25`) gains `bitcoin_offer_available`, `electrum_tip_height`, `electrum_tip_age_seconds`; the field folds the 3-probe hysteresis **and** the `PAYKIT_BITCOIN_CREATION_ENABLED` kill switch into one boolean so no consumer has to combine two. | Revert; the marketplace then treats a missing field as `true` and behaviour returns to fail-at-bind. | Medium. Its absence is a conversion and trust cost, never a correctness one — the bind stays fail-closed regardless (§B.7.2). |
| 4d | **marketplace-service: two-phase client, activation outbox, availability consumer** | §B.11.2/§B.11.8 and §B.7.2 hop 2: persist `{paykit_invoice_id, paykit_total_sats, paykit_expires_at, paykit_activation_state}` and commit the bind with a `paykit.activate` outbox row in **one** transaction; add the `paykit.activate` dispatch arm to `deliver_claimed`, which today `bail!`s on any non-`notification.*` kind (`workers.rs:292-294`); add `'preparing'` to the `paykit_request_state` check (`0009_payment_methods.sql:39-40`); consume `bitcoin_offer_available` with a 15 s TTL and a 60 s stale-out, and **stop returning 503** from `get_payment_config` (`payment_methods.rs:310-325`). | Revert together with step 1c. | **Highest**, jointly with 1c — this is the half that makes activation durable. A marketplace that calls `activate` inline instead of from its outbox reintroduces R3-1's window in a narrower form. |
| 4b | Fork: Payment Request expiry, tail observation, resolve endpoint | §B.9: `expires_at` required on `POST /v0/payment-requests` and set into `proposal_expires_at` (`create_payment_request.rs:230`); `expired_tail` → `expired_final` with a 24 h tail; `late_settlement` observations; `POST /v0/invoices/{id}/resolve`. | Revert; but note the §C.16 drain boundary reverts with it and becomes unsafe again. | **Critical.** Without it a delivered Payment Request is payable forever and the rollback drain strands buyers (NEW-3). |
| 5 | Fork: Bitcoin creation kill switch | §C.16. | Revert. | High if absent — see P1-D and §C.16. |
| 6 | Rails repo: configurable network and cadence | `entrypoint.sh:150` → `network = "${PAYKIT_BITCOIN_NETWORK:-regtest}"`, validated against `mainnet\|testnet\|signet\|regtest` and failing closed; `:154` → `poll_interval = "${PAYKIT_ELECTRUM_POLL_INTERVAL:-1s}"`; add `PAYKIT_STACK_ROLE` and `PAYKIT_BITCOIN_CREATION_ENABLED`. Defaults leave the existing service unchanged. Update the header comment at `:14-16`. | `git revert`; defaults unchanged. | Low while the defaults hold. A typo'd network reaches `BitcoinNetwork::parse` and the server refuses to boot (`config.rs:61`) — fails closed. |
| 7 | Dockerfile | **No change** (correction #1). Recorded because the survey asked for a patch removal that does not exist. | n/a | n/a |
| 8 | **One pinned image digest across every stack** (NEW-4) | The commit containing steps 1–6 is built **once** to an immutable image digest `D`. `D` is recorded in this document's proof section and deployed to the regtest, proof and production services — a variable change alone does not rebuild (`HANDOFF.md`, Known Decisions). Every boot line prints the digest, and each of the three proofs asserts the digest it observed **equals `D`** rather than asserting "the same binary" in prose. | Redeploy the prior digest, on all three stacks together. | **Critical.** Running the old image on mainnet is P1-A live. Running *different* images under the three proofs is NEW-4: each proof passes and their conjunction proves nothing. |
| 9 | Client: network-aware validator | `payment-methods.ts:84-94`: accept `xpub`/`zpub` on a mainnet stack and `tpub`/`vpub` on regtest/testnet, each rejection named; convert `zpub`→`xpub` after checksum and exact version-byte validation; source the network from a new `PUBKY_RUNTIME_BITCOIN_NETWORK`, not from `PUBKY_RUNTIME_ENV`. If that variable is unset or unrecognised the client **refuses claims with a named reason** and never guesses a network (Kimi P3), matching the existing fail-closed treatment of unset real-payment URLs (`runtime-config.schema.ts:195`). | Revert; the server stays authoritative. | Medium. Too permissive ⇒ opaque `invalid_xpub` (today). Too strict ⇒ sellers blocked. Never loosen the server. |
| 10 | Client: **Bitkit Shop-account claim path (recommended default) plus manual paste and file import (kept, owner decision 08:39)**, first-address preview, confirmation gate, disclosures | Add the Bitkit watch-only claim flow (§B.8.1) as the **prominent default**: Shop presents a Pubky auth URL with `x-bitkit-claim=watch-only-account-v1` and exactly the capability set Bitkit matches on, receives the 84-byte payload, and submits its `account_index` and 78-byte xpub — the client stops hardcoding `account_index: 0` (`marketplace-paykit-claim.ts:122`). **Manual entry stays on mainnet** as a secondary but fully supported path: paste of an `xpub`/`zpub`, plus **file import of the artifacts wallets conventionally export** — a plain-text key file, a BIP380 `wpkh` output descriptor, or a Coldcard-style generic JSON export's `bip84` object (§C.10 states exactly what is accepted and what is refused; **no new format is invented**). Both paths land in the same `POST /v0/accounts/claim` and publish the same Paykit receiver marker (§B.0). Keep everything r2 required: preview derived from the exact normalized bytes being POSTed (§B.6), `key_fingerprint` and `first_derived_address` compared after the claim, address shown at the **scanned start index**, and `bitcoinEnabled` gated on the seller confirming that address in their own wallet. Disclose, before the claim: irreversibility, xpub privacy, **the chain-data operator's view** (every watched address is queried every 30 s from one client, so that operator can cluster a seller's addresses over time and correlate order timing — Kimi P3), **in one sentence, that if this account is used by any other wallet a Shop order can be marked paid when nobody paid it and the seller ships for free** (§B.8, residuals R2/R3), the recommendation to use a dedicated account with the reason, and that the order total includes a small unique amount (§B.8.2) which must be paid exactly. After a wallet restore, show the bound account (§B.8.5). | Revert to Bitkit-only claims; that contradicts the 08:39 owner decision, so it is an owner-level revert, not an operator one. | High if skipped — §E, "Seller pastes a valid but wrong xpub", and NEW-2. The disclosure is the only thing standing between a paste-path seller and the §B.8.4 residual they are carrying. |
| 11 | Rails README policy | Replace `README.md:12-13`: "This repo deploys Bitcoin networks side by side: regtest for development, mainnet for the live marketplace rail. The mainnet stacks are **watch-only**: no component here may hold a Bitcoin private key, seed, mnemonic, or a descriptor containing private material. paykit-server persists account xpubs and derives with `Secp256k1::verification_only()`; any change that gives it the ability to sign must be refused. A mainnet service may only use a first-party Electrum endpoint; a third-party endpoint, or sharing a database between networks or stack roles, requires owner sign-off and a Kimi audit." | Revert. | Low mechanically, high as governance: the replacement must name the invariant that still holds, or the reversal reads as "no rules". |
| 12 | Railway objects (proof, then production) | Per §B.1, created by the IaC script in W1.6, not by hand. Variables per stack (names only): `PAYKIT_BITCOIN_NETWORK`, `PAYKIT_STACK_ROLE`, `PAYKIT_ELECTRUM_ENDPOINT`, `PAYKIT_ELECTRUM_POLL_INTERVAL`, `PAYKIT_BITCOIN_CREATION_ENABLED`, `PAYKIT_DATABASE_URL`, `PAYKIT_MASTER_KEY`, `PAYKIT_REQUEST_SIGNING_KEY`, `PAYKIT_TRUSTED_LOCKS_PUBLIC_KEY`, `PAYKIT_SETUP_ALLOWED_ORIGINS`, `MARKETPLACE_TRUSTED_PUBLIC_KEYS`. Production keys are generated at production time, not earlier. | `railway down` the service; drop the database. | **Critical if wrong.** Sharing a database across networks or roles is refused at boot (§A), which is the intended outcome; sharing one *between stacks of the same role* is the P1-C failure and is not refused by anything. |
| 13 | Boot and miswiring verification | Boot line shows network, `stack_role`, endpoint and built revision (`entrypoint.sh:163`). Run the negative gate: a regtest-initialised database under mainnet config must exit with `StartupError::Deployment`; a proof database under a production config likewise. `/health` shows a real tip height and age (§B.7), not an empty-target "available". | n/a | Low. |
| 14 | **Staging/proof cutover** | Staging `marketplace-service`: `PAYKIT_SERVER_URL` → `http://paykit-server-proof.railway.internal:3001`, then `railway redeploy -s marketplace-service`. Vercel `pubky-marketplace-staging`: `PUBKY_RUNTIME_PAYKIT_SETUP_URL` → the proof service's public URL; redeploy. | Both back to the regtest service. | Medium. Staging sellers must re-claim; in-flight staging orders stall and expire at 3600 s. Announce before, not after. |
| 15 | Hold window and confirmation floor | Leave `FIAT_PAYMENT_WINDOW_SECONDS` unset (3600 s). `LOCKS_PAYKIT_MIN_CONFIRMATIONS` does nothing here (correction #2). If Q3 is answered "2 confirmations", that is a fork change at `invoices.rs:702-707` plus a status-contract note, landed with step 1. | n/a | Low if left alone; the danger is believing a variable did something it did not. |
| 16 | Bitcoin creation kill switch and drain-safe rollback (P1-D, NEW-3, restated in r4 for two-phase) | `PAYKIT_BITCOIN_CREATION_ENABLED` (default `true`). When `false`, **phase 1** (`POST /v0/payment-requests`) refuses with `bitcoin_creation_disabled` and the marketplace bind fails cleanly; `bitcoin_offer_available` goes `false` in the same field the checkout already reads (§B.7.2), so Shop hides Bitcoin rather than failing at the bind. **`activate` and `void` keep working** — refusing them would strand exactly the `prepared` invoices this switch is trying to drain. The observer keeps polling every existing mainnet invoice. Rollback order, exactly: (1) set it `false` on the mainnet service and redeploy; (2) confirm Shop no longer offers Bitcoin at checkout (`bitcoin_offer_available: false` on the payment-config endpoint, not by eyeballing the page); (3) **drain to the restated boundary — see below**; (4) only then repoint `PAYKIT_SERVER_URL` and redeploy; (5) announce. | The kill switch is itself the rollback. | **Highest.** This is the difference between a reversible cutover and lost buyer money. |

| 17 | Docs | `pubky-payment-rails/README.md` (env sections `:121`, `:134`, pinned revisions); `pubky-payment-rails/docs/wallet-leg.md:37-40` (not an `mp-oneauth` path) becomes network-specific; `mp-oneauth/docs/ecommerce/status.md:7` and `:150` ("Could this take real money today?" now answers **yes**, with the review waiver stated in the owner's words); `runbook-production.md` gains a Bitcoin-rail section carrying §C.16 verbatim plus the failover endpoint, **the §B.7.1 auto-hide behaviour and its alerts** (so an operator paged at 3 a.m. knows Bitcoin hiding itself is the designed response, not the incident), and **the §B.9 drain boundary with its ~25 h worst case** stated in hours rather than implied; `HANDOFF.md` loses "Money rails remain test networks". | Revert. | Low mechanically. High if skipped: the runbook is what an operator reads at 3 a.m., and r2's runbook would have told them to drain in an hour. |
| 18 | **Production cutover — owner sign-off gate** | Only after §D's proofs (MAINNET-NEG, D.2-S, D.2-B, REGTEST-POS), W3 Kimi SHIP, W3b and W3c SHIP, and Q3, Q4, Q8, Q9 and Q10 answered. Add the production Shop origin to `PAYKIT_SETUP_ALLOWED_ORIGINS`; set `PAYKIT_SERVER_URL` on production `marketplace-service` and redeploy; set `PUBKY_RUNTIME_PAYKIT_SETUP_URL` on Vercel and redeploy. | §C.16, then both variables back to the regtest service. Independently, `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable` remains the whole-rail kill switch (`runbook-production.md`). | **Highest.** Real funds from here. Every production seller must re-claim; a seller who does not re-claim sees Bitcoin unavailable rather than losing money (`payment_methods.rs:570-585` refuses the bind). |
| 19 | Bitkit | **No wallet-side change.** Users already hold mainnet Bitkit; it already uses `ssl://bitkit.to:9999` and already accepts the `btc-bitcoin-p2wpkh` identifier the mainnet server advertises. Confirmed by reading both Env files. | n/a | n/a |
| 20 | `SANDBOX_PAYMENTS_ENABLED` interplay | **Leave staging `true`.** `payment.sandbox_advance` refuses any payment whose `adapter != "sandbox"` (`handlers/payment.rs:60-65`) and binding Bitcoin sets `paykit` (`payment_methods.rs:593`). The residual risk is a sandbox-advance **before** any rail is bound, so every §D harness asserts `payments.adapter == 'paykit'` immediately after the bind and before any status assertion; with two-phase, the adapter is already `paykit` throughout `preparing` while nothing is published, so the dangerous overlap is gone (§B.11.7). Side effect: `true` disables local pickup on staging (`lib.rs:76`, `handlers/pickup.rs:70`), so the proofs use **shipping** listings. | n/a | Low, given the adapter gate. Worth a runbook line because the flag's name suggests more reach than it has. |

### C.10 detail — what "paste or file" means, and the one-sentence disclosure

The owner's decision says sellers provide their own xpub "however that is
conventionally done, file or paste, whatever is normal". This states what is
normal rather than inventing a format, and it is deliberately a short list:
**every accepted artifact must reduce to the same 78 bytes** the Bitkit path
submits, because §B.0 requires one claim path.

**Accepted:**

1. **Paste of a bare account extended key** — `xpub…` or `zpub…`. `zpub` is the
   SLIP-132 BIP84 encoding and is what most wallets label "native segwit
   account xpub"; it is normalized to the canonical `xpub` version bytes before
   anything else happens, and the preview in §B.6 is derived from the
   **normalized bytes actually being POSTed**, never from what the seller typed.
2. **A plain-text file containing exactly one such key.** This is what a wallet's
   "export xpub" button produces when it produces a file at all.
3. **An output descriptor** (BIP380/381), as exported by Bitcoin Core, Sparrow
   and others — `wpkh([73c5da0a/84h/0h/0h]xpub…/0/*)#checksum`. Only
   single-signature `wpkh` with an external-chain `/0/*` range is accepted; the
   checksum is verified, and the key origin's derivation path is used to
   cross-check the account index the key itself already declares (§B.6).
4. **A Coldcard-style generic JSON export**, the de facto interchange file that
   Sparrow, Electrum and BlueWallet all read: the `bip84` object's `xpub` and
   `deriv` fields, ignoring every other script type in the file.

**Refused, each with a named reason rather than a guess:** multisig descriptors,
`pkh`/`sh(wpkh)`/`tr` descriptors (this rail derives P2WPKH only —
`create_invoice.rs:279`), descriptors with a non-`/0/*` range, master keys at
depth 0, non-account depths, wallet backup files containing private key material
(**refused loudly**, and the file contents are never logged), and any file over
a small size cap. **No new format is defined by this design**, and if a seller's
wallet exports something not on this list the answer is paste, not a new parser.

**The disclosure, at claim time, before the irreversible submit.** One screen,
and one sentence carrying the harm in the seller's own terms:

> **If any other wallet also receives payments on this account, a Shop order can
> be marked paid when nobody paid it — and you will ship the item for free.**
> We recommend a dedicated account used only by Shop; tapping "Use Bitkit"
> creates one for you.

Below it, the rest of the §C.10 row's disclosures (irreversibility, xpub
privacy, the chain-data operator's view, the exact nonce'd total). W1.8b asserts
the sentence is rendered, so it cannot be dropped in a later copy pass.

### C.16 restated — the drain boundary under two-phase (NEW-3, D)

r2's boundary was "hold window elapsed", which was unsafe because marketplace
hold expiry does not invalidate a delivered address. r3 corrected it to "every
delivered Payment Request is expired or final". **r4 corrects it again, because
§B.11 introduces a state r3's boundary does not mention:** a `prepared` invoice
is not delivered, so "every delivered request is expired or final" can be true
while `prepared` invoices still exist — and each of those can still be
**activated** by a marketplace outbox row that has not drained, publishing a
brand-new payable request *after* the operator believed the drain was complete.
Repointing at that moment recreates the NEW-3 orphan through the new path.

The boundary is therefore: **no invoice remains in `prepared` or `observing`, and
every delivered Payment Request is expired or final.** All five conditions, each
with the check the runbook carries:

| # | Condition | Checked on |
| --- | --- | --- |
| 1 | No invoice in `prepared` — each one activated, voided, or reaped by the 15-minute `prepare_ttl` (§B.11.1) | paykit-server |
| 2 | No invoice in `observing` | paykit-server |
| 3 | No invoice in `expired_tail`; `observation_targets()` returns empty | paykit-server |
| 4 | No order in `paykit_activation_state = 'preparing'` — the marketplace's activation outbox has drained (§B.11.8) | **marketplace-service** |
| 5 | No `awaiting_entitlement` paykit payments | marketplace-service |

Condition 4 is the one r3 could not have had, and it is the reason the drain
check now **spans both services**: an operator who only queries paykit can see a
clean board while an undelivered activation row is still sitting in the
marketplace's outbox.

**Bounded and computable.** `prepare_ttl` (15 min) bounds condition 1, and it
runs *inside* the hold window rather than after it, so it adds nothing to the
total; the hold window (3600 s) plus the §B.9 tail (24 h) bound conditions 2–3.
The honest worst case is **just over 25 hours**, the same magnitude as r3.
`activate` and `void` deliberately keep working while the creation kill switch
is on (§C.16 row), because refusing them would strand the very `prepared`
invoices condition 1 is waiting on. §C.17's runbook carries all five as a
checklist with the query for each, because an operator draining at 3 a.m. will
not re-derive them.

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

**NEG-3b — the composed first-tick rule (§B.4.6, bounding R1).** The variant the
baseline alone cannot catch: the fixture returns **no** transaction at the
creation-baseline snapshot, then returns one unconfirmed transaction paying the
derived address the exact nonce'd total at the **activation snapshot** (§B.11
phase 2), then returns it confirmed above the floor on every later tick. This
simulates R1 — a transaction the server's Electrum had not indexed at baseline
time. Expected: rule 2 writes it into the baseline with `kind = 'pre_existing'`
at activation, so it is ineligible forever; no observation row, `undetected`,
`awaiting_entitlement` through expiry. **Calibrations, both required:** (i) with
rule 2 disabled the same fixture marks the order `paid`, without which NEG-3b
proves nothing; and (ii) a transaction that appears for the first time at
**tick 2** — absent at both snapshots — **does** confirm and pay, which is what
proves rule 2 rejects by timing rather than rejecting every unconfirmed output.
Calibration (ii) is the one that catches the false-negative failure mode §B.4.6
warns about, so it is not optional.

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
the invoice absent from `observation_targets()`. Then assert §B.7.2 end to end:
after three such failed probes, `/health/ready` reports
`bitcoin_offer_available: false`, the marketplace payment-config endpoint reports
`bitcoin_offer_available: false` **with HTTP 200 rather than 503**, the Shop
checkout does not render the Bitcoin option, and existing invoices are still
being observed.

**NEG-6 — the two-phase failure matrix, executed rather than argued (§B.11.4).**
The R3-1 proof, and the highest-value new item in this wave. Each row is driven
against the proof stack with a real order; the harness asserts paykit state, the
marketplace's `paykit_activation_state`, **and** buyer reachability.

| Row driven | Injection | Asserted |
| --- | --- | --- |
| #1 crash between phase 1 and marketplace commit | kill the marketplace transaction before commit | invoice `prepared`; **zero** claimable outbox rows from `OutboxStore::claim`; **zero** entries in `observation_targets()`; the buyer identity's `paymentRequests()` is empty; at `prepare_ttl` the invoice is `void_prepare_expired` |
| #3 crash after commit, before activate | pause the marketplace outbox worker | order committed with `adapter='paykit'` and `paykit_activation_state='preparing'`; checkout renders "preparing"; buyer still has no request; on worker resume, `activate` succeeds and the request appears |
| #4 lost activate response | drop the response, retry | second `activate` returns the same `observing` body; **exactly one** private message reaches the buyer, and the outbox rows are claimed once (asserted on `attempt_count` and on the SDK outbound record, not on absence of duplicates in the UI) |
| #5 activate after reap | hold the outbox past 15 min | `prepare_expired` 409; marketplace voids the bind, releases the hold, order shows the retry copy; a fresh bind mints a **new** invoice on a **new** index |
| #9 wrong total | send `total_sats` off by one | `activation_total_mismatch`; invoice stays `prepared`; nothing published; the alert fires |
| replay per state (§B.11.6) | replay phase 1 in each state | `prepared` → same prepared body; `observing` → same body; `void_baseline_failed` / `void_prepare_expired` / `void_cancelled` → the named 409, **never a success** — this is the R3-5 assertion and it must be checked in all three void states, not one |
| `void` idempotence | void twice, then activate | second `void` returns the same body; the subsequent `activate` returns `invoice_finalized`; `void` on an `observing` invoice returns `invoice_finalized` |

**Required negative calibration for NEG-6, without which the whole item is
decorative:** run row #1 against a build with the outbox rows written `'queued'`
(r3's behaviour). The harness must observe the Payment Request **arriving in the
buyer's wallet** for an order the marketplace rolled back. That is R3-1 live, and
seeing it once on the proof stack is what proves the two-phase protocol is doing
something rather than that the test is weak.

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

- **F2c — pre-activation mempool output (the regtest mirror of NEG-3b, no
  fixture).** Force `next_child_index` to *N*; run **phase 1** and stop; send the
  exact nonce'd amount to the address index *N* derived, **without mining**; then
  call `activate`. The transaction is absent from the creation baseline and
  present, unconfirmed, at the activation snapshot. Expected: recorded
  `pre_existing`, ineligible, no observation, `awaiting_entitlement` until
  expiry — even after mining. Its calibration is the positive twin: the same
  sequence with the send happening **after** activation confirms and pays
  normally, which proves §B.4.6 does not simply reject everything.
- **F7 — two-phase ordering on a controlled chain (§B.11).** Run phase 1, then
  **before** activating, send the exact nonce'd total to the derived address and
  mine 6 blocks. Expected: no status change of any kind while `prepared` — the
  invoice is not in `observation_targets()` — and after the `prepare_ttl` reap it
  is `void_prepare_expired` and stays so. Then assert the money is where the
  design says it is: the output is at the seller's own address, spendable by the
  seller, and no order was ever marked paid. This is the regtest statement of
  "prepared is unpayable in effect, not just in publication".
- **F8 — activation is the only publisher.** Assert, on a `prepared` invoice,
  that `OutboxStore::claim` returns zero rows across at least three worker
  cycles; then activate and assert both rows are claimed in dependency order
  (endpoint publication delivered before the payment-request proposal is
  claimable — `outbox.rs:205`), and that a second `activate` enqueues nothing.

Also assert on regtest, cheaply: a second order for the same seller derives the
next index and never reuses an address (`invoices.rs:786-829`); that a burned
index after a forced baseline failure **or a reaped prepare** is skipped and
never reissued (§B.4.1, §B.11.1); that two invoices for the same seller draw
**different** nonces; that `payment.sandbox_advance` is refused once the adapter
is `paykit`, **including while the order is `preparing`** (§B.11.7); and that a
claim of a key already claimed by a different seller pubky is refused with
`key_claimed_by_other_seller` while a re-claim by the same seller is accepted
(§B.8.5).

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
  ordering race and NEG-3b proves the composed activation-snapshot rule narrows
  the window to one interval (§B.4.6); neither can prove completeness of a
  single Electrum's mempool view, and no proof in this wave can. The two named
  failure modes of the same-server argument — server restart between snapshots,
  mempool eviction and re-entry — are **not** exercised by any proof here and
  are explicitly still open.
- **Residual R2** (§B.10): a seller who restores the Shop account seed into a
  third-party wallet. Out of reach of any harness; bounded by §B.8.2 and by
  §C.10 copy.
- **Residual R3** (§B.10, §B.8.5): the seller's own wallet reissuing the Shop
  account index after losing allocation state. The fingerprint binding is
  proven (§D.3) and the backup/restore preservation is verified in source, but
  the wipe-without-restore path is a wallet-side sequence no marketplace harness
  drives.
- **The §B.8.4 residual model itself** is a model, not a measurement. F5, F6 and
  the fingerprint tests prove the mechanisms it depends on are deployed; `r`, `s`
  and `p_band` are unmeasured, and `W = 20` is an argued assumption about
  allocator interleaving rather than an observed quantity. Revisit once real
  seller behaviour exists — and revisit the bolded row in particular, because a
  6% annualised-per-busy-seller figure is the kind of number that should be
  replaced by a measurement rather than defended.
- **Whether the two-phase protocol holds under real concurrency at scale.**
  NEG-6 drives each failure row once, deterministically. It does not prove the
  absence of an interleaving nobody enumerated, which is why §F keeps W3c's
  state-machine review as a gate rather than treating the harness as sufficient.

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
| **Slow Electrum omits a mempool transaction from the baseline** | The transaction is in the network's mempool but has not reached the server's single Electrum at snapshot time | **Not closed. Residual R1** (§B.10). A single view cannot be proven complete. | Bounded further in r4, not eliminated: §B.4.6 states the same-server argument precisely (a transaction the observer later sees but the baseline missed must have entered *that* server's mempool after the snapshot) and names its two failure modes (server restart, mempool eviction and re-entry); the **composed activation-snapshot rule** narrows the exposure from the whole live window to the interval between the two snapshots, so only a transaction first seen at tick ≥ 2 can pay; empty for a Shop-exclusive account because nobody else knows the address; bounded by the exact-amount nonce at the §B.8.4 rate; named as a reason **Q4** matters, since two-server corroboration is what would close it. Proven by NEG-3b with both calibrations. |
| **Stale tip widens the eligible height interval** | The snapshot's tip read lags the real tip | Would enlarge the window in which a pre-existing confirmed output looks post-invoice. | `creation_chain_height` comes from the **same Electrum round as the baseline**, and creation fails closed unless that tip is within 3 blocks of a health probe less than two intervals old (§B.4.4). Baseline membership dominates the height rule regardless. |
| **Reorg moves a baseline outpoint across the floor** | Any reorg deep enough to re-mine a baseline transaction | **Harmless by construction:** baseline membership is `txid:vout` and never height, so a reorg-moved baseline outpoint stays baseline. In the other direction a legitimate payment re-mined at or below the floor is refused and resolves to `manual_review`. | Stated explicitly in §B.4.4 so the fail-safe direction is a decision rather than an accident. Disclosed with the rest of the reorg exposure under Q10. |
| **Seller wallet and paykit-server are independent allocators** (Sol NEW-2) | A busy seller shares one account between their wallet and Shop; the wallet's counter reaches an index paykit already assigned to a live invoice; an unrelated customer pays it | **Succeeds against r2.** Harm: **the seller ships an item a Shop buyer never paid for.** r3 called the residual ≈10⁻³; **Sol's R3-2 refuted that arithmetic and r4 replaces it** — at the shipped 1 h live window a busy pasted-xpub seller carries `E ≈ 6 × 10⁻²` events per exposed-seller-month, `P(any) ≈ 6%` (§B.8.4). | Both defences (§B.8.3), with the load-bearing one inverted in r4 after the 08:39 owner decision: **(b)** exact-amount matching plus a CSPRNG nonce in `[1,999]` is the mechanism, because it needs no seller cooperation; **(a)** a Bitkit-issued Shop-exclusive account drives `N = 0` and is the recommended default, not a requirement. Plus the baseline (§B.4.1), the composed first-tick rule (§B.4.6), and the fingerprint binding (§B.8.5). Q9 is decided: paste stays, and the number above is what the owner accepted. |
| **Seller restores the Shop account seed into a third-party wallet** | Deliberate act against written guidance; the other wallet allocates from the Shop account | **Not closed. Residual R2** (§B.10). (a) is an invariant over Bitkit, not over the seed. | §C.10 copy states, in one sentence, that using the account elsewhere can mark an order paid when nobody paid and the seller ships for free; bounded by the nonce at the §B.8.4 rate with `r` set to that wallet's receive rate; requires deliberate action. Named rather than claimed closed. |
| **paykit publishes a payable request before the marketplace commits its bind** (Sol **R3-1**, P1) | The marketplace calls paykit before its own commit (`payment_methods.rs:713-759`) and paykit queues both outbox rows on commit (`invoices.rs:1023-1040`); then a crash, a lost response, or a failed local commit | **Succeeds against r3, and it is the worst outcome in this document:** a valid published mainnet Payment Request exists for an order that stays `adapter='sandbox'`, which the poller never claims (`workers.rs:721-758`). A buyer pays real money and gets no confirmation, no expiry, and no `manual_review` — silently orphaned funds. Needs no adversary. | **Two-phase prepare/activate (§B.11).** Phase 1 allocates, baselines, mints the nonce and returns the total with the outbox rows written `status='prepared'` — invisible to the delivery worker, whose claim query selects only `'queued'`/`'leased'`/`'retryable'` (`outbox.rs:196-206`). The marketplace commits its bind and a `paykit.activate` outbox row in one transaction. Signed idempotent activation releases publication. Unpayability while `prepared` is traced to the SDK private-message path and Bitkit's ingestion in §B.11.5, and driven as NEG-6 with a mandatory negative calibration that shows r3's build leaking the request to the buyer's wallet. |
| **A prepared invoice is activated after the operator believes the rollback drain finished** | Rollback drains on r3's boundary ("every delivered request expired or final"), which says nothing about `prepared` invoices or an undrained marketplace activation outbox | Would publish a brand-new payable request **after** `PAYKIT_SERVER_URL` was repointed — the NEW-3 orphan, recreated through the new path. | §C.16's boundary is restated to five conditions including "no invoice in `prepared`" and "no order in `paykit_activation_state='preparing'`", the second checked on the **marketplace** side. `activate`/`void` deliberately keep working while the creation kill switch is on, so the drain can complete. Worst case just over 25 h, in the runbook as a checklist with a query per condition. |
| **Exact replay reports success for an invoice that was reaped or voided** (Sol **R3-5**) | `create_payment_request.rs:129-142` → `invoices.rs:363-427` returns `replayed: true` without inspecting lifecycle state | The marketplace would commit a bind against an invoice that can never be activated, and the order would sit `preparing` until its hold expired with no diagnosis. | State-inspecting replay (§B.11.6): `prepared` and `observing` return the same body; `awaiting_baseline` waits inside the request deadline; all three void states and `expired_final` return a **named 409, never a success**. NEG-6 asserts all three void states, not one. |
| **The marketplace records the pre-nonce total** (Sol **R3-3**) | paykit mints the nonce but `POST /v0/payment-requests` returns 204 (`http/payment_requests.rs:42-51`), so the marketplace keeps its own `amount_sats` | The buyer is charged and shown one figure while the wallet is asked for another; under the exact predicate the order can never confirm, so every Bitcoin order silently fails. | Phase 1 returns 200 with `{nonce_sats, total_sats, …}` and the marketplace persists `paykit_total_sats` (§B.11.3). Belt and braces: `activate` echoes `total_sats` and paykit refuses with `activation_total_mismatch` on disagreement, so the two services cannot diverge quietly — driven as NEG-6 row #9. |
| **Wallet allocation reset reissues the Shop account** (Sol **R3-4**) | Wipe or reinstall with no successful backup restore, or a restore from a snapshot predating the reservation; the wallet then reserves account 1 again | r3 claimed the reservation is "never reissued" globally; **that is false as written** — `WatchOnlyAccountStore.kt:86-89` + `WipeWalletUseCase.kt:57-72`, `WatchOnlyAccountService.swift:250-252` + `AppReset.swift:45-49`. | Partly closed, partly quantified (§B.8.5). Verified in the seller's favour: both wallets back up and restore the high-water mark and iOS merges with `max()` (`BackupRepo.kt:592-599`, `:715-719`; `WatchOnlyAccountService.swift:125-166`), so the common restore path preserves it. The cross-seller variant is closed outright by the paykit-server `claimed_key_fingerprints` binding. The wallet's own reuse needs four conditions to coincide and is **residual R3**, bounded by the same nonce and disclosed in the post-restore UI. |
| **Auto-hide is assumed rather than wired** (Sol **R3-6**) | r3 asserted the marketplace "already polls" a status field; `payment_methods.rs:279-333` only checks account existence | Fail-closed creation stays a checkout-wide failure-at-bind, which reads to a buyer as "the marketplace took my money and broke" (NEW-5 unclosed). | The three-hop contract in §B.7.2 with an owner per hop and tests: `bitcoin_offer_available` on paykit `/health/ready`, a 15 s-TTL / 60 s-stale-out consumer on the marketplace payment-config endpoint that **stops returning 503**, and static client copy. W1.4c and W1.10 in §F; asserted end to end in NEG-5. |
| **Delivered Payment Request outlives the marketplace hold** (Sol NEW-3) | `proposal_expires_at: None` (`create_payment_request.rs:230`); the rollback drains on "hold elapsed" and repoints | Buyer pays a still-valid address into a database nobody polls; no confirmation, and the late-settlement `manual_review` net never fires. Real funds moved, silently. | Enforceable expiry carried in the request (§B.9), **already parsed and enforced by both wallets** so no wallet release is needed; observation continues through a 24 h `expired_tail` where the only outcome is `manual_review`; the drain boundary becomes "every delivered PR expired or final" (§C.16). |
| **Fail-closed creation becomes a checkout-wide outage** (Sol NEW-5) | One Electrum outage, with two fail-closed creation gates (§B.4, §B.5) | Every Bitcoin checkout fails at the bind — correct for safety, but indistinguishable from "the marketplace took my money and broke". | A 99.0% monthly availability objective for *offering* Bitcoin, auto-hide after 3 failed probes with 3-probe recovery hysteresis, observation of existing invoices continuing throughout, and paging on sustained or flapping auto-hide (§B.7.1). A degradation is never traded against a false paid. |
| Server child index 0 collides with wallet-used addresses | `next_child_index DEFAULT 0` on a used account | **Closed by §B.5** — the scan starts above the last used index plus a gap buffer. | Also a privacy and Electrum-cost fix. Refuse the claim if Electrum is unreachable; never default to 0. |
| Creation-height protection vs a historical PASS | Both cannot be true | Acknowledged as mutually exclusive; the floor ships and the proof is redesigned around it (§D), not the reverse. | r1 chose the proof; r2 chooses the product. |
| Deny-list vs the harness claim | W1.4 denies the exact key the proof must claim | Resolved by `stack_role` as a deployment invariant (§B.6), not by a code bypass. | A production database cannot boot with `role=proof`; a CI test asserts both directions. |
| Public test-vector history changes between calibration and run | Anyone can fund `bc1qcr8te…` | Would make a correct negative result look like a product failure. | Two-source recompute + pinned SHA-256 immediately before every run; abort on drift (§D.1). |
| Alternate account index bypasses the deny-list | Same public mnemonic, account 7 | A key-material deny-list cannot catch it by key material alone. | **Revised again in r4.** The bounded range is the mitigation and it stays: mainnet accepts `0..=99` and the deny-list covers accounts **0–99** of every known-public mnemonic, so the range is fully enumerable (§B.6). What changed is that **account 0 is no longer refused** — r3 refused it on the theory that it is "the account a wallet spends from", but that is a convention, not a property of the key, and with paste allowed (owner decision 08:39) refusing it would exclude most sellers while leaving the actual collision condition — a shared allocator — undetected at every other index. The server *can* read the account index from the key (`create_invoice.rs:249-270` enforces `child_number == hardened(account_index)`); what it cannot read is whether the wallet also receives on that account. §B.8.4 and §B.8.5 carry that risk instead. |
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

**r4 rewrote this section against one rule: every mechanism in this document has
exactly one slice, one owner tier, a test list, and a proof row.** r3's table
failed that in three places Sol found — the nonce had no response wiring
(R3-3), the auto-hide had no marketplace or client slice (R3-6), and the
two-phase problem had no slice at all because r3 had not found it. Tiering
follows the cost of a false claim: **Kimi** for paykit-server money paths and
for the marketplace two-phase work, **implementation tier** for client surfaces,
**deep reasoning** for reviews and for operator-facing text. No slice is
`inherit`.

| Wave | Slice | Repo / tree | Tier | Depends on | Proof command → expected output |
| --- | --- | --- | --- | --- | --- |
| W0 | This design reviewed adversarially (r1) | — | deep reasoning, different family | — | Verdict recorded. **Done:** Sol FIX-FIRST → r2 |
| W0b | Design audit (r1) | OpenCode Kimi | **Kimi** | — | Verdict line present in the log. **Done:** FIX-FIRST, same two P1s as Sol, folded in |
| W0c | r2 reviewed adversarially | — | deep reasoning, different family | r2 | **Done:** Sol FIX-FIRST, NEW-1…NEW-5, closed in r3 |
| W0d | r3 reviewed adversarially | — | deep reasoning, different family | r3 | **Done:** Sol FIX-FIRST (`/tmp/btc-design-r4-sol-findings.md`). Closed G, NEW-4, Kimi TTL; left A, D, NEW-1, NEW-2, NEW-3, NEW-5 and Kimi floor PARTIAL; raised R3-1 (P1) and R3-2…R3-6. All six answered in r4 — see §F.1 |
| W0e | Owner decision on Q9 | — | owner | W0d | **Done, 2026-09-09 08:39:** manual xpub entry stays on mainnet; Bitkit Shop account becomes the recommended path. Recorded in the review history and §G |
| W1.1 | Fork: creation baseline and post-invoice eligibility (§B.4) — `awaiting_baseline`, the post-commit/pre-publication snapshot of history **and** mempool, baseline outpoint and replaced-input sets, `void_baseline_failed`, V2 record, `confirmed_height`, migration `0002` | `paykit-server-fork` | **Kimi** | W0c | `cargo test -p paykit-server` → **the NEW-1 case first:** an outpoint present in the baseline as unconfirmed, later seen only as confirmed above the floor, never binds; an outpoint spending a baseline input never binds while one spending an unrelated input does; a post-baseline output binds; an output at `height <= floor` writes no observation; a failed snapshot yields `void_baseline_failed` + `Unavailable` with no outbox delivery and no target-set membership; a burned index is never reissued; a stale tip beyond 3 blocks refuses creation; a V1 record on mainnet is a hard error; two concurrent first binds derive distinct indices and the (creator, index) unique constraint holds |
| W1.1b | Fork: exact amount predicate + invoice nonce (§B.8.2) | same fork, serialized after W1.1 | **Kimi** | W1.1 | `cargo test -p paykit-server` → `observed_sats == required` binds; `required + 1` reports `amount_matched: false`; `required - 1` unchanged; nonces are CSPRNG-drawn, in `[1,999]`, and differ across invoices for one seller; the order total the marketplace records equals `price + nonce` |
| W1.1c | **Fork: two-phase prepare/activate (§B.11) — the gating slice (R3-1), and it also closes R3-3 and R3-5** | same fork, serialized after W1.1b | **Kimi** | W1.1b | `cargo test -p paykit-server` → **unpayability first (§B.11.5):** a `prepared` invoice yields **zero** rows from `OutboxStore::claim` across repeated calls and **zero** entries from `observation_targets()`, and a funded observation against its address changes no status. Then: phase 1 returns **200** with `{invoice_id, nonce_sats, total_sats, expires_at, prepare_expires_at, derived_address_fingerprint}` and `total_sats == amount_sats + nonce_sats` (R3-3); `activate` flips `prepared → observing` and both outbox rows `'prepared' → 'queued'` in one transaction; a second `activate` returns the same body and enqueues **nothing** (asserted on row count, not on absence of duplicate messages); `activate` with a mismatched `total_sats` returns `activation_total_mismatch` and leaves the invoice `prepared`; `activate`/`void` on each of `void_baseline_failed`, `void_prepare_expired`, `void_cancelled` return the named 409; **phase-1 replay returns the same prepared body from `prepared`, the same body from `observing`, and a finalized 409 from all three void states** (R3-5, all three asserted); the reaper voids `prepared` at 15 min and never touches `observing`; `void` on `observing` is refused; a reaped index is burned and never reissued; the tick-1 snapshot (§B.4.6) is taken inside `activate` and a `pre_existing` classification is written for a transaction unconfirmed at that moment |
| W1.2 | Fork: claim-time index scan (§B.5) | same fork, serialized after W1.1 | **Kimi** | W1.1 | `cargo test -p paykit-server manual_claim` → unused account starts at 0; account with usage at index *k* starts at `k+21`; Electrum failure refuses the claim; >1,000 scanned refuses |
| W1.3 | Fork: deny-list on canonical key data, **revised account range (account 0 accepted)**, `key_fingerprint`/`first_derived_address`/`next_child_index` in the claim response, **fingerprint↔seller binding**, `stack_role` invariant (§B.6, §B.8.5) | same fork, serialized after W1.2 | **Kimi** | W1.2 | `cargo test -p paykit-server` → the test-vector key is refused under `production` in both xpub and zpub-normalized form and accepted under `proof`; **`account_index = 0` is accepted under both roles** (the r4 reversal — a test that fails under r3's rule), `1..=99` accepted, `100` refused with a named reason; a declared `account_index` that disagrees with the key's hardened child number is refused (`create_invoice.rs:249-270`); the deny-list covers accounts 0–99; **a key claimed by seller A is refused for seller B with `key_claimed_by_other_seller`, including after A's claim is inactive, while a re-claim by A is accepted**; a proof DB under a production config exits `StartupError::Deployment` |
| W1.4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe, **availability auto-hide hysteresis** (§B.7, §B.7.1) | same fork, serialized after W1.3 | **Kimi** | W1.3 | Unit tests: budget arithmetic caps at 1,000/tick and ≤5 req/s; deferral is oldest-first; readiness reports tip height and age; an empty target set no longer reports `available` without a probe; 3 failed probes set Bitcoin unavailable and 3 successes clear it, with no flap in between; **auto-hide gates creation only — existing invoices are still observed while hidden, and `activate`/`void` still work while hidden** (§C.16) |
| W1.4c | **Fork: `bitcoin_offer_available` on `/health/ready` (§B.7.2 hop 1, R3-6)** | same fork, serialized after W1.4 | **Kimi** (it gates a money path's availability) | W1.4, W1.5 | `cargo test -p paykit-server` → `ReadyResponse` serializes `bitcoin_offer_available`, `electrum_tip_height`, `electrum_tip_age_seconds`; the field is `false` after 3 failed probes and `true` only after 3 successes; the field is `false` whenever `PAYKIT_BITCOIN_CREATION_ENABLED=false` **regardless of probe health**, so one boolean carries both gates; the field is independent of the existing `electrum` component string (asserted by a case where they differ) |
| W1.4b | Fork: Payment Request expiry, `expired_tail`, resolve endpoint (§B.9) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test -p paykit-server` → a request with missing, past, or over-maximum `expires_at` is refused; `proposal_expires_at` is set on the published request; at expiry the invoice moves to `expired_tail` and after 24 h to `expired_final`, leaving `observation_targets()`; an eligible observation during the tail is recorded with `late_settlement` and never yields `paid`; `resolve` is idempotent, finalizes early from `expired_tail`, is **recorded but does not resume observation** from `expired_final`, and is refused for `awaiting_baseline` / `void_baseline_failed` / unknown invoices |
| W1.5 | Fork: `PAYKIT_BITCOIN_CREATION_ENABLED` kill switch (§C.16) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test` → creation refused with `bitcoin_creation_disabled` while observation of existing invoices continues |
| W1.6 | Rails: entrypoint variables (§C.6) **plus** the IaC/script for §B.1 — create both services and databases, wire variables, run the negative miswiring gate, and a separate destructive script that drops the proof database | `pubky-payment-rails` | **Kimi** (operator config gates the watcher) | W0 | `sh paykit-server/tests/entrypoint_test.sh` → pass; `PAYKIT_ENTRYPOINT_RENDER_ONLY=1` with mainnet vars → TOML contains `network = "mainnet"`, `poll_interval = "30s"`, the stack role; bogus network → non-zero exit; the IaC script run twice is idempotent; the miswiring gate fails to boot as expected |
| W1.7 | Client: network-aware validator, `zpub`→`xpub` normalization, deny-list, `PUBKY_RUNTIME_BITCOIN_NETWORK` | `mp-oneauth` worktree | **Kimi** (client xpub conversion is key handling) | W0 | `npm run test -- payment-methods` → `zpub` converts to the same 78 bytes the server stores; `vpub`/`tpub` rejected on mainnet with named reasons; the test-vector key rejected in both forms and for accounts 0–19; an unset `PUBKY_RUNTIME_BITCOIN_NETWORK` refuses the claim; the published BIP84 test vectors are asserted directly |
| W1.8 | Client: preview from the exact normalized bytes, fingerprint comparison, confirmation gate, disclosures (§C.10) | separate `mp-*` worktree | **Kimi** — in-browser BIP84 derivation is the gate §C.10 rests on, so the preamble's rule applies (Kimi P2 on r1's tiering) | W1.7 | Component tests green; the published BIP84 test vectors are asserted against the preview derivation; a mutated byte blocks `bitcoinEnabled`; VRT regenerated if a baseline exists for the settings surface |
| W1.8b | Client: **Bitkit Shop-account claim path as the recommended default, manual paste and file import retained** (§B.8.1, §C.10; owner decision 08:39) — auth URL with `x-bitkit-claim=watch-only-account-v1` and the exact capability set, payload decode, the real `account_index` submitted instead of a hardcoded `0` | separate `mp-*` worktree, after W1.8 | **Kimi** (this is a credential-delivery path) | W1.8 | Tests: the requested capability set is byte-equal to `PubkyAuthClaim.WATCH_ONLY_ACCOUNT_CAPABILITIES`, asserted against a fixture captured from Bitkit rather than retyped; an 84-byte payload decodes to version 1, an `account_index` and a 78-byte xpub, and the submitted index is the payload's rather than `0`; **manual paste and file import remain reachable on mainnet and produce a claim byte-identical to the Bitkit path for the same key** (the §B.0 assertion — same endpoint, same normalized 78 bytes); file import accepts exactly the artifacts named in §C.10 and rejects everything else with a named reason rather than guessing, including a file containing private key material, which is refused loudly and never logged; the pre-claim disclosure renders the one-sentence false-paid warning and the dedicated-account recommendation, asserted on copy presence so it cannot be dropped silently |
| W1.10 | **marketplace-service: two-phase client + durable activation outbox (§B.11.2, §B.11.8)** | `marketplace-service` worktree | **Kimi** (money path, and the R3-1 fix lives half here) | W1.1c | `cargo test -p marketplace-service` → phase 1's `{invoice_id, total_sats, expires_at}` is persisted and the bind **and** the `paykit.activate` outbox row commit in **one** transaction (asserted by a rollback test: no row, no bind); `deliver_claimed` routes `paykit.activate` instead of `bail!`ing on an unroutable kind (`workers.rs:292-294`), and delivery stamps `delivered_at` with the state change in one transaction so redelivery cannot apply twice; `'preparing'` is accepted by the `paykit_request_state` check and **is not claimed by `claim_due_paykit_orders`** (`workers.rs:745-750`); `prepare_expired` / `invoice_finalized` / `unknown_invoice` void the bind, release the hold and emit `payment.bitcoin_prepare_voided`; `activation_total_mismatch` voids **and alerts**; the buyer-facing total charged equals `paykit_total_sats`, never `amount_sats` (R3-3 on this side) |
| W1.11 | **marketplace-service: availability consumer (§B.7.2 hop 2, R3-6)** | same tree, serialized after W1.10 | **Kimi** (it changes a public endpoint's failure semantics) | W1.10, W1.4c | `cargo test -p marketplace-service` → `get_payment_config` returns `bitcoin_offer_available` alongside `bitcoin_available`; a fresh value is cached for 15 s and paykit is not re-probed inside it; a paykit error serves the last value until 60 s stale and then reports `false`; **the endpoint returns 200 rather than 503 when paykit is unreachable** (`payment_methods.rs:310-325` today), asserted as a status-code regression test; `bitcoin_available` still requires the seller's claim to exist |
| W1.12 | **Client: hide Bitcoin at checkout when unavailable (§B.7.2 hop 3, R3-6)** | `mp-oneauth` worktree, independent of W1.8 | implementation tier | W1.11 | Component tests: the Bitcoin option is not rendered when `bitcoin_offer_available` is `false`, and is rendered when both flags are true; the copy is the static string and interpolates **no** operator state (asserted against a snapshot, so a future edit cannot leak a tip height or endpoint name); a seller with no other rail falls through to the existing no-rail empty state rather than a new surface; VRT regenerated if a baseline exists for the checkout surface |
| W1.9 | Docs pass (§C.17) | umbrella + `mp-oneauth` | **deep reasoning** — this is money-affecting operator text, not a mechanical edit | W1.5 | `git diff --stat` shows exactly the listed files; the parent reads the replacement policy line and the §C.16 rollback order end to end |
| W2.0 | **Build image digest `D` once** from the commit containing §C steps 1–6, and redeploy **regtest, proof and (later) production** onto it (§D.0) | operator (parent) | parent-only | W1.* merged | `D` recorded in the wave log; all three boot lines print the same digest; the parent reads all three, not one |
| W2.1 | Proof stack stood up on `D` | operator (parent) | parent-only | W2.0 | Boot line shows `mainnet`, `role=proof`, `ssl://bitkit.to:9999`, and digest `D`; `/health` shows a real tip height; the miswiring gate refuses to boot |
| W2.2 | Harness: MAINNET-NEG (NEG-1…NEG-6, drift guard) | `mp-oneauth` worktree | **Kimi** (the harness is the evidence) | W2.1, W1.7 | Digest asserted `== D` first; NEG-1 and NEG-2 `awaiting_entitlement`/`undetected` after ≥3 cycles; `history_tx_count == 176` and **baseline size == 88** on NEG-2 against an independently fetched set; **NEG-3 passes and its negative calibration — baseline suppressed — marks the order `paid`**, without which NEG-3 is not evidence; **NEG-3b passes with both calibrations, including the tick-2 positive** (§B.4.6 — without the positive, rule 2 could be rejecting everything); NEG-4 and its mirror; NEG-5 gives `void_baseline_failed` with no published request and then the full §B.7.2 chain to a hidden checkout option with HTTP 200; **NEG-6 drives failure-matrix rows #1, #3, #4, #5, #9, the per-state replay set and `void` idempotence, and its negative calibration — outbox rows written `'queued'` — is observed delivering the request to the buyer's wallet for a rolled-back order** (R3-1 live, once, on the proof stack); drift guard aborts on a mutated pinned digest |
| W2.3 | Harness: MAINNET-DERIVE split into **D.2-S (seller)** and **D.2-B (buyer)** | same worktree, after W2.2 | **Kimi** | W2.2, W1.8b | Digest asserted `== D`. D.2-S: the Bitkit-issued account index is accepted and a **pasted account-0 xpub is also accepted** (the r4 rule, §B.6), fingerprint round-trip passes and its negative fails, the derived address appears in the seller's own Bitkit (screenshot the parent opens), and Bitkit's receive screen never issues it. D.2-B: a **different** team member's Bitkit renders the request, shows the nonce'd total and the expiry, and after expiry refuses to pay it (`requestExpired` / `RequestExpired`), with the server showing `observing → expired_tail`. **No send in either leg** |
| W2.4 | Harness: REGTEST-POS with F1–F8 | separate worktree, regtest stack | **Kimi** | W2.0 | **First assertion: the regtest service was redeployed and reports digest `== D`** — the run aborts if not, which is the NEW-4 gate. Then all FAIL calibrations observed first — F1, F2, F2b, **F2c and its positive twin**, F3, F4, F5, F6, **F7** (money sent to a `prepared` invoice's address changes nothing, the prepare reaps, and the funds are shown spendable by the seller) and **F8** (zero claimable outbox rows while prepared; both rows claimed in dependency order after activation) — then the positive run: `detected` on a later tick → `confirmed` → `paid` with receipt; plus `sandbox_advance` refused while `preparing`, and the fingerprint-binding pair; screenshots the parent opens |
| W3 | Kimi audit of the full diff | OpenCode, own `OPENCODE_DB` lane | **Kimi** | W1.*, W2.* | Report contains an explicit `SHIP` or `FIX-FIRST`; exit 0 is not a report — grep the log for the verdict |
| W3b | Deep-reasoning review: do the proofs prove what they claim **over one artifact**, does the runbook rollback order actually drain under §C.16's five conditions, is the §B.8.4 model's `A/W` step defensible, and are R1/R2/R3 correctly scoped | — | deep reasoning | W2.2–W2.4, W1.9 | Verdict recorded; the parent opens the screenshots, re-runs one proof command per proof, and checks the digest in each proof log against `D` |
| W3c | **Protocol/state-machine review of §B.11's two-phase protocol and §B.9's expiry/resolve contract** — both sides modeled as state machines, every message and credential's provenance traced, the §B.11.4 matrix attacked for a missing row | — | deep reasoning, different family from the implementer | W1.1c, W1.4b, W1.10 | Verdict recorded **before W2.2 runs and again before W5**. Run it twice deliberately: after the design (now) and after the first implementation, per the protocol-review rule — not after the third build. R3-1 is exactly the class of defect a diff audit passed three times and a state-machine review finds in one pass |
| W4 | **Owner sign-off** | — | — | W3 SHIP + W3b SHIP + W3c SHIP + all proofs | Owner answers Q3, Q4, Q8 and Q10 in writing, having read §B.8.4's table, §B.10 and §D.4. Q9 is already answered (08:39) and is re-confirmed against §B.8.4's corrected number, because the number the owner accepted at 08:39 is ~60× r3's |
| W5 | Production stack, cutover (§C.18), canary (§D.4) | operator (parent) + commerce team | parent-only | W4 | Production boot line shows `role=production` and digest `== D`; one real seller re-claims **through the Bitkit Shop-account flow**, confirms the address in their wallet, one real payment completes end to end at the exact nonce'd total and is spendable, and one order is left to expire and is confirmed unpayable in the buyer's wallet |

Parent duties, never delegated: commits, all remote git and GitHub writes,
secret handling, Railway and Vercel variable changes, plan edits, and the owner
conversation. Sub-agents never run `git push`, `gh pr create`, or any remote
write; every OpenCode prompt restates that prohibition explicitly.

Verification the parent performs rather than accepts on claim: read the rendered
TOML from the render-only entrypoint run; read each boot line including the
built revision; open every harness screenshot; run `git status --short` and
`git log -1` on every tree an agent touched; grep the Kimi log for the verdict.

**Trees and concurrency.** W1.1, W1.1b, **W1.1c**, W1.2, W1.3, W1.4, **W1.4c**,
W1.4b and W1.5 are one fork tree and therefore serialize — W1.1c sits directly
after W1.1b because it is the gating slice and everything downstream of it in
that tree depends on the `prepared` state existing. **W1.10 and W1.11 are one
marketplace-service tree** and serialize with each other, in parallel with the
fork tree; W1.10 depends on W1.1c's endpoint shapes, so the two trees are wired
by a contract, not by a merge — which means the phase-1/phase-2 message shapes
in §B.11.3 are the handoff artifact and must be pinned from a **captured live
response** before W1.10's tests are written, not retyped from this document
(`contract-faithful-tests`). W1.6, W1.7 and W2.4 are independent trees and run
in parallel throughout, which is where the concurrency budget is spent. W1.8b
serializes behind W1.8, and W1.12 is a third client tree independent of both.

### F.1 Review history for round 3, and what r4 changed

r3 carried a "round 3 of 3" cap and a mechanical demotion to a safe subset if
the third review returned FIX-FIRST. **The owner's 08:38 instruction removes
that clause: finish things correctly rather than cut to a subset.** It is
replaced here by the record of what round 3 found and what r4 did about it, so
the next reviewer opens on the findings rather than on a cap.

**Round 3 — GPT-5.6 Sol, deep reasoning, FIX-FIRST, 2026-09-09**
(`/tmp/btc-design-r4-sol-findings.md`). Every code claim in r3 was re-verified
against source. Three r3 prose claims were **refuted by the code they cited**:
"never reissues" globally on both wallets (NOT FOUND, contradicted by the reset
paths), and "the marketplace already polls an auto-hide status field" (NOT
FOUND). That is the useful shape of this round — not new ideas, but r3's own
citations read more carefully than r3 read them.

| Finding | P | r4 response | Section |
| --- | --- | --- | --- |
| **R3-1** paykit publishes before the marketplace commits | P1 | Two-phase prepare/activate, both sides as state machines, every message named, a 10-row failure matrix, and a code-traced proof that `prepared` is unreachable by a buyer | §B.11 |
| **R3-2** residual conflates one-or-more with one trial | P2 | Replaced with `N` as a function of `r`, `s`, `L`, `G`, `W`, plus `E` and `P(any)` and a 12-row sensitivity table. The honest number is ~60× r3's | §B.8.4 |
| **R3-3** nonce minted server-side but the endpoint returns 204 | P2 | Phase 1 returns 200 with `{nonce_sats, total_sats, …}`; `activate` echoes `total_sats` and refuses on mismatch, so the two services cannot diverge quietly | §B.11.3 |
| **R3-4** allocators monotonic only while allocation state survives | P2 | Invariant restated with its precondition; **verified that both wallets back up and restore the high-water mark** (which r3 and the finding both missed); cross-seller half closed by a paykit-server fingerprint binding; the rest is residual R3, quantified | §B.8.5, §B.10 |
| **R3-5** exact replay ignores lifecycle state | P2 | Per-state replay table for phase 1, phase 2 and `void`; all three void states return a named finalized 409 | §B.11.6 |
| **R3-6** auto-hide not assigned to marketplace/client work | P2 | Three-hop `bitcoin_offer_available` contract with an owner and tests per hop, and the 503 removed from the public endpoint | §B.7.2, W1.4c/W1.11/W1.12 |
| **A / NEW-1 / Kimi floor** (single-Electrum mempool view) | — | Kept as residual R1, but **bounded**: the same-server argument stated precisely with its two failure modes, and the composed baseline + activation-snapshot rule so only a transaction first seen at tick ≥ 2 can pay | §B.4.6 |
| **D / NEW-3** (drain boundary) | — | Boundary restated to five conditions spanning both services, including `prepared` invoices and an undrained marketplace activation outbox | §C.16 |
| **NEW-2** (independent allocators) | — | Reshaped by the 08:39 owner decision: (b) is now the load-bearing mechanism and (a) the recommendation | §B.8.3 |
| **NEW-5** (fail-closed creation as a checkout outage) | — | Closed by R3-6's wiring, which is what it was waiting on | §B.7.2 |

**What r4 did not change, deliberately.** The baseline mechanics (§B.4.1–B.4.5),
the expiry and tail contract (§B.9), the three-stack isolation (§B.1), the single
pinned digest (§D.0) and the Electrum policy (§B.7) all survive round 3 intact
and are not reopened. **Q3, Q4, Q8 and Q10 stay open with recommendations**;
reopening them here would be re-litigating decided scope rather than answering
findings.

**What a fourth reviewer should attack first**, stated so the next round starts
where the risk is rather than at the top: the §B.11.4 matrix's completeness (is
there an interleaving with no row?); the `A/W` step in §B.8.4, which is the one
load-bearing assumption in the model and is argued rather than measured; and
whether `prepare_ttl = 15 min` is right in both directions — long enough that a
slow marketplace outbox never loses a bind, short enough that a reaped prepare is
never confused with an expired order.

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
- **Q7 — Account indexes (revised again in r4).** r2 decided `account_index = 0`
  only; r3 reversed to `1..=99` with 0 refused. **r4 accepts `0..=99`.** The
  upper bound and the deny-list over accounts 0–99 stay — that is what keeps the
  range enumerable (§B.6). Refusing 0 does not survive the 08:39 decision:
  with paste allowed, most wallets export only account 0's xpub, so r3's rule
  would have excluded most manual sellers, and it would have bought nothing
  measurable because account 0 is a convention for "the wallet's main account"
  rather than a property of the key. The server can read the index from the key
  (`create_invoice.rs:249-270`); what it cannot read is whether the wallet also
  receives on that account, at 0 or anywhere else. §B.8.4's bound and §B.8.5's
  binding carry that risk instead.
- **Q9 — Manual xpub entry on mainnet. DECIDED BY THE OWNER, 2026-09-09 08:39.**
  Manual entry **stays allowed on mainnet**: paste, and file import of the one
  conventional artifact a wallet actually exports (§C.10). The Bitkit-issued
  Shop-exclusive account remains the recommended, default, one-tap path, and it
  is the only path that drives the collision count to zero — but it is not a
  requirement, and the design's correctness does not depend on it (§B.8.3).
  Every claim path lands in the same Paykit endpoint and publishes the same
  receiver marker on the seller's own homeserver, so manual entry is Paykit
  usage rather than a side channel (§B.0), which was the substance of the
  owner's instruction.
  **What the owner is accepting, restated with the corrected number:** for a
  seller who pastes an xpub for an account their wallet also receives on,
  §B.8.4 gives `E ≈ 6 × 10⁻²` false-paid events per exposed-seller-month and
  `P(any) ≈ 6%` at the busy operating point (`r = 100`, `s = 10`, `L = 1 h`,
  worst-case amount distribution) — not r3's ≈10⁻³, which R3-2 refuted. A
  typical small seller is three to four orders of magnitude better off. The harm
  is the seller's: **they ship an item a Shop buyer never paid for**, and the
  disclosure at claim time says exactly that in one sentence (§C.10).
  **What this obliges the design to do**, and what §F therefore schedules:
  keep the recommendation prominent rather than buried; state the harm in the
  seller's own terms at claim time; keep the five paste-path mechanisms
  (§B.8.3) load-bearing and individually tested; and re-confirm the acceptance
  at W4 against the corrected number rather than the one that was on the page at
  08:39.
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
