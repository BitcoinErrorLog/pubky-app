# Bitcoin Mainnet Switch And Payment-Journey Proof — Design (r2)

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
- **r2 — this commit** (Claude Opus). Post-invoice height floor, claim-time
  index scan, three separate proofs with honest claims, isolated production and
  proof rails, Bitcoin creation kill switch, bounded Electrum policy.

## Owner decisions required

1. **Confirmation depth.** Recommended: **2 confirmations** before an order is `paid` (a fork change at `invoices.rs:702-707`); 1-conf has no un-confirm edge anywhere (`marketplace-service/…/workers.rs:822-826`), so a 1-block reorg leaves an unpaid order `paid`. Cost: ~10–20 min added wait, well inside the 3600 s hold window.
2. **Single-Electrum trust.** Recommended: **accept for launch.** `ssl://bitkit.to:9999` is first-party Synonym infrastructure — the same trust Bitkit already extends. A dishonest one can mark an unpaid order `paid`; the loss falls on the seller. Two-server corroboration is scheduled, not shipped.
3. **Independent security review.** Recommended: **waive in writing, bounded** — Kimi audit plus §D's three proofs, with production restricted to the W5 canary (named sellers, small amounts) for one week before general availability. Do not delete `status.md:150`; record the waiver in those words.
4. **Reorg and late-settlement policy.** Recommended: **accept**, with seller copy that says "wait for the confirmations shown before shipping", and with settlements that land after the hold window continuing to route to `manual_review` (`workers.rs:787-820`) rather than auto-confirming.

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
| 3 | "paykit-server checks for an exact amount match" | Greater-or-equal: `let amount_matched = present && observed_sats >= required;` (`invoices.rs:694`). Overpayment confirms; underpayment does not. |
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

### B.1 Three stacks, no shared database (P1-C, Q1, Q9)

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

Reorg exposure is real and is owner decision 4: paykit-server watches to 6
confirmations and would see a disappearance (`observer.rs:208-221`), but
marketplace-service confirms at the first confirmation and has no un-confirm
edge (`workers.rs:822-826`). Do not describe 1-conf as reorg-safe.

Two independent Electrum servers are not in this switch: the config carries one
endpoint string (`entrypoint.sh:152-153`) and `ElectrumPort` is a single-source
trait (`observer.rs:28-33`); corroboration means new code, an agreement policy
and a disagreement escalation path — a wave of its own, and it must be audited.

### B.4 Post-invoice eligibility — the fix for P1-A (blocking, before production)

The defect in one sentence: an established seller claims their real BIP84
account, the server derives `0/0` of that account, and their **own old
receipts** at that address confirm their first unpaid order. Nothing about this
requires a dishonest party, and §C.10's "confirm the address in your wallet"
gate makes it *more* likely by encouraging use of an existing account.

Two independent defences. Both ship; neither is sufficient alone.

**(a) Creation-height floor, sealed into the invoice.** Bump
`InvoicePaymentRecordV1` (`invoices.rs:55-60`) to V2, adding
`creation_chain_height: u32`. The application layer reads the chain tip once via
a new `ChainTipPort` over the existing `ElectrumAdapter` and passes it into
`AtomicInvoiceInput` (`create_payment_request.rs:190-203`), so the floor is
sealed and authenticated with the amount and the address, and is already
decrypted at observation time (`invoices.rs:550-565`). If the tip read fails,
**refuse to create the payment request** — `CreateInvoiceError::Unavailable`
propagates to the marketplace bind, which refuses the bind and leaves nothing
bound (`payments.rs:737-775`). Fail closed: no floor, no invoice.
On mainnet, a V1 record is a hard error, not a fallback. Production and proof
databases are created after this lands, so V1 never exists there.

**(b) Per-observation eligibility, evaluated before any binding decision** in
`apply_bitcoin_observation_in_tx`. `ObservedOutput` (`bitcoin.rs:77-85`) gains
`confirmed_height: Option<u32>`, taken from `anchor.block_id.height`, which the
observer already iterates (`observer.rs:167-173`), and carried through
`validate_batch` into `BitcoinObservationInput`. Then:

- **Confirmed output** (`Some(h)`): eligible iff `h > creation_chain_height`.
- **Unconfirmed output** (`None`, i.e. mempool — bdk gives these a
  `seen_ats` entry and the observer already reports them at 0 confirmations,
  `observer.rs:161-166`): eligible iff it is not marked **pre-existing**. The
  mempool first-seen rule is defined by the invoice's own first tick, not by any
  timestamp the server cannot verify: on the invoice's **first completed
  observation batch** (`invoices.first_observed_at IS NULL`), every unconfirmed
  outpoint then present at the address is recorded `pre_existing = TRUE` and is
  permanently ineligible to bind or to report `detected`. Every unconfirmed
  outpoint appearing on a later tick is eligible.
- An ineligible output writes **no** observation row, changes **no** status, and
  returns `Ok(true)` — it must never return an error, or one old output would
  head-of-line the entire batch (`observer.rs:259-322`).
- Eligibility is re-evaluated on every observation, so a fast payer whose
  transaction was marked pre-existing at tick 1 still confirms via the height
  rule once it is mined above the floor. The only cost of that case is that the
  `detected` (0-conf) display is skipped for ~one poll interval.

Why the tick rule rather than a snapshot at creation: the derived address is not
known until inside `create_atomic` (`invoices.rs:786-829` calls
`for_child_index` with the DB-held counter), so an Electrum history call at
creation would have to run inside the write transaction. The first-tick rule
needs no extra Electrum call and no restructuring, and errs conservative.

Migration `0002`: `invoices.first_observed_at TIMESTAMPTZ NULL`,
`bitcoin_observations.pre_existing BOOLEAN NOT NULL DEFAULT FALSE`, and the V2
record. Rollback of the migration is forward-only; the mainnet databases are new.

### B.5 Address-index safety at claim time (P1-A, part 2)

The floor stops old outputs from paying an invoice. It does not stop the server
from deriving onto an address with 176 transactions of history, which is a
privacy leak for the seller, an Electrum-budget problem (§B.7), and a
correctness cliff if the floor is ever bypassed. So the claim path also scans.

**Both mechanisms, with the scan as the enforcing one:**

- Seller-facing copy recommends a **dedicated, unused account** (§C.10), because
  it makes everything else trivially safe.
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
- **Account 0 only, on the server, for now.** `http/accounts.rs:149` accepts an
  arbitrary `account_index` while the client hardcodes `0`
  (`marketplace-paykit-claim.ts:122`). A deny-list cannot catch account 7 of the
  same public mnemonic, so until arbitrary accounts are an intentional feature
  the server rejects `account_index != 0` on mainnet. §C.10 also surfaces the
  limitation in the UI instead of failing silently for account-1+ wallets.
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
  per-tick rescan of that address's whole history. Targets stop being observed
  once the order's payment window has expired **and** any `manual_review`
  payment on it has been resolved. This ships with §B.7, not after it.
- **Active health probe.** Replace `server.rs:592-597`, which reports Electrum
  `available` **without making a request** when the target set is empty. Every
  tick issues `blockchain.headers.subscribe`, checks the genesis hash for the
  configured network, and records tip height and tip age. `/health` reports
  those; `available` requires a probe response no older than two intervals.
- `[electrum] poll_interval` must be `30s` before any mainnet endpoint is
  configured. At `1s` (`entrypoint.sh:154`), a single 176-transaction history
  is ~176 requests/second against a third party — a ban, and a silent one.

---

## C. Per-layer switch table

Order of operations is the numbered column. Nothing in steps 1–10 touches
production.

| # | Layer | Exact change | Rollback | Blast radius if wrong |
| --- | --- | --- | --- | --- |
| 1 | Fork: post-invoice eligibility | §B.4 in full: V2 payment record with `creation_chain_height`, `ChainTipPort` at creation with fail-closed behaviour, `confirmed_height` on `ObservedOutput`, `pre_existing` first-tick rule, migration `0002`. | Revert; the mainnet databases do not exist yet. | **Critical.** Without it a legitimate seller's old receipts confirm unpaid orders (P1-A). This is the gate on real money, not a hardening item. |
| 2 | Fork: claim-time index scan | §B.5: `ChainHistoryPort`, gap-limit windows, `next_child_index` initialised above the last used index, refuse on Electrum failure or >1,000 scanned. | Revert. | High. Without it the server derives onto used addresses. |
| 3 | Fork: deny-list, account-0 restriction, fingerprint in the claim response, `stack_role` invariant | §B.6. | Revert. | High — the public test key reaching a real listing is unrecoverable. |
| 4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe | §B.7. | Revert to the unbounded path only on the proof stack, never production. | High: a ban stops all confirmation silently and `/health` currently says "available". |
| 5 | Fork: Bitcoin creation kill switch | §C.16. | Revert. | High if absent — see P1-D and §C.16. |
| 6 | Rails repo: configurable network and cadence | `entrypoint.sh:150` → `network = "${PAYKIT_BITCOIN_NETWORK:-regtest}"`, validated against `mainnet\|testnet\|signet\|regtest` and failing closed; `:154` → `poll_interval = "${PAYKIT_ELECTRUM_POLL_INTERVAL:-1s}"`; add `PAYKIT_STACK_ROLE` and `PAYKIT_BITCOIN_CREATION_ENABLED`. Defaults leave the existing service unchanged. Update the header comment at `:14-16`. | `git revert`; defaults unchanged. | Low while the defaults hold. A typo'd network reaches `BitcoinNetwork::parse` and the server refuses to boot (`config.rs:61`) — fails closed. |
| 7 | Dockerfile | **No change** (correction #1). Recorded because the survey asked for a patch removal that does not exist. | n/a | n/a |
| 8 | **Production image redeploy** | The production and proof services must be redeployed from the commit that contains steps 1–6. A variable change alone does not rebuild (`HANDOFF.md`, Known Decisions). Assert the built revision in the boot line before any cutover. | Redeploy the prior image. | **Critical.** Running the old image on mainnet is P1-A live. |
| 9 | Client: network-aware validator | `payment-methods.ts:84-94`: accept `xpub`/`zpub` on a mainnet stack and `tpub`/`vpub` on regtest/testnet, each rejection named; convert `zpub`→`xpub` after checksum and exact version-byte validation; source the network from a new `PUBKY_RUNTIME_BITCOIN_NETWORK`, not from `PUBKY_RUNTIME_ENV`. If that variable is unset or unrecognised the client **refuses claims with a named reason** and never guesses a network (Kimi P3), matching the existing fail-closed treatment of unset real-payment URLs (`runtime-config.schema.ts:195`). | Revert; the server stays authoritative. | Medium. Too permissive ⇒ opaque `invalid_xpub` (today). Too strict ⇒ sellers blocked. Never loosen the server. |
| 10 | Client: first-address preview, confirmation gate, disclosures | Derive the preview from the exact normalized bytes being POSTed (§B.6); after the claim, compare `key_fingerprint` and `first_derived_address` from the response; show the address at the **scanned start index**, not an assumed `0/0`; `bitcoinEnabled` cannot be switched on until the seller confirms that address in their own wallet. Disclose, before the claim: irreversibility, `account_index: 0` only, xpub privacy, **the chain-data operator's view** (every watched address is queried every 30 s from one client, so that operator can cluster a seller's addresses over time and correlate order timing — Kimi P3), and the recommendation to use a dedicated unused account. | Revert; falls back to today's blind claim. | High if skipped — §E, "Seller pastes a valid but wrong xpub". |
| 11 | Rails README policy | Replace `README.md:12-13`: "This repo deploys Bitcoin networks side by side: regtest for development, mainnet for the live marketplace rail. The mainnet stacks are **watch-only**: no component here may hold a Bitcoin private key, seed, mnemonic, or a descriptor containing private material. paykit-server persists account xpubs and derives with `Secp256k1::verification_only()`; any change that gives it the ability to sign must be refused. A mainnet service may only use a first-party Electrum endpoint; a third-party endpoint, or sharing a database between networks or stack roles, requires owner sign-off and a Kimi audit." | Revert. | Low mechanically, high as governance: the replacement must name the invariant that still holds, or the reversal reads as "no rules". |
| 12 | Railway objects (proof, then production) | Per §B.1, created by the IaC script in W1.6, not by hand. Variables per stack (names only): `PAYKIT_BITCOIN_NETWORK`, `PAYKIT_STACK_ROLE`, `PAYKIT_ELECTRUM_ENDPOINT`, `PAYKIT_ELECTRUM_POLL_INTERVAL`, `PAYKIT_BITCOIN_CREATION_ENABLED`, `PAYKIT_DATABASE_URL`, `PAYKIT_MASTER_KEY`, `PAYKIT_REQUEST_SIGNING_KEY`, `PAYKIT_TRUSTED_LOCKS_PUBLIC_KEY`, `PAYKIT_SETUP_ALLOWED_ORIGINS`, `MARKETPLACE_TRUSTED_PUBLIC_KEYS`. Production keys are generated at production time, not earlier. | `railway down` the service; drop the database. | **Critical if wrong.** Sharing a database across networks or roles is refused at boot (§A), which is the intended outcome; sharing one *between stacks of the same role* is the P1-C failure and is not refused by anything. |
| 13 | Boot and miswiring verification | Boot line shows network, `stack_role`, endpoint and built revision (`entrypoint.sh:163`). Run the negative gate: a regtest-initialised database under mainnet config must exit with `StartupError::Deployment`; a proof database under a production config likewise. `/health` shows a real tip height and age (§B.7), not an empty-target "available". | n/a | Low. |
| 14 | **Staging/proof cutover** | Staging `marketplace-service`: `PAYKIT_SERVER_URL` → `http://paykit-server-proof.railway.internal:3001`, then `railway redeploy -s marketplace-service`. Vercel `pubky-marketplace-staging`: `PUBKY_RUNTIME_PAYKIT_SETUP_URL` → the proof service's public URL; redeploy. | Both back to the regtest service. | Medium. Staging sellers must re-claim; in-flight staging orders stall and expire at 3600 s. Announce before, not after. |
| 15 | Hold window and confirmation floor | Leave `FIAT_PAYMENT_WINDOW_SECONDS` unset (3600 s). `LOCKS_PAYKIT_MIN_CONFIRMATIONS` does nothing here (correction #2). If owner decision 1 is "2 confirmations", that is a fork change at `invoices.rs:702-707` plus a status-contract note, landed with step 1. | n/a | Low if left alone; the danger is believing a variable did something it did not. |
| 16 | Bitcoin creation kill switch and drain-safe rollback (P1-D) | `PAYKIT_BITCOIN_CREATION_ENABLED` (default `true`). When `false`, `create_payment_request` refuses new binds with a distinct `bitcoin_creation_disabled` error and the marketplace bind fails cleanly; **the observer keeps polling every existing mainnet invoice**. Rollback order, exactly: (1) set it `false` on the mainnet service and redeploy; (2) confirm Shop no longer offers Bitcoin at checkout; (3) **drain** — wait until every non-final mainnet invoice is final or its order's hold window has elapsed (≤ 3600 s), verified by an empty `observation_targets()` and no `awaiting_entitlement` paykit payments; (4) only then repoint `PAYKIT_SERVER_URL` and redeploy; (5) announce. Repointing before the drain strands buyers who already hold a mainnet Payment Request: they pay correctly, marketplace polls a different database, and the order expires — and the late-settlement `manual_review` safety net (`workers.rs:787-820`) never fires, because nothing is polling that server any more. | The kill switch is itself the rollback. | **Highest.** This is the difference between a reversible cutover and lost buyer money. |
| 17 | Docs | `pubky-payment-rails/README.md` (env sections `:121`, `:134`, pinned revisions); `pubky-payment-rails/docs/wallet-leg.md:37-40` (not an `mp-oneauth` path) becomes network-specific; `mp-oneauth/docs/ecommerce/status.md:7` and `:150` ("Could this take real money today?" now answers **yes**, with the review waiver stated in the owner's words); `runbook-production.md` gains a Bitcoin-rail section carrying §C.16 verbatim plus the failover endpoint; `HANDOFF.md` loses "Money rails remain test networks". | Revert. | Low mechanically. High if skipped: the runbook is what an operator reads at 3 a.m. |
| 18 | **Production cutover — owner sign-off gate** | Only after §D's three proofs, W3 Kimi SHIP, and owner decisions 1–4 answered. Add the production Shop origin to `PAYKIT_SETUP_ALLOWED_ORIGINS`; set `PAYKIT_SERVER_URL` on production `marketplace-service` and redeploy; set `PUBKY_RUNTIME_PAYKIT_SETUP_URL` on Vercel and redeploy. | §C.16, then both variables back to the regtest service. Independently, `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable` remains the whole-rail kill switch (`runbook-production.md`). | **Highest.** Real funds from here. Every production seller must re-claim; a seller who does not re-claim sees Bitcoin unavailable rather than losing money (`payment_methods.rs:570-585` refuses the bind). |
| 19 | Bitkit | **No wallet-side change.** Users already hold mainnet Bitkit; it already uses `ssl://bitkit.to:9999` and already accepts the `btc-bitcoin-p2wpkh` identifier the mainnet server advertises. Confirmed by reading both Env files. | n/a | n/a |
| 20 | `SANDBOX_PAYMENTS_ENABLED` interplay | **Leave staging `true`.** `payment.sandbox_advance` refuses any payment whose `adapter != "sandbox"` (`handlers/payment.rs:60-65`) and binding Bitcoin sets `paykit` (`payment_methods.rs:593`). The residual risk is a sandbox-advance **before** any rail is bound, so every §D harness asserts `payments.adapter == 'paykit'` immediately after the bind and before any status assertion. Side effect: `true` disables local pickup on staging (`lib.rs:76`, `handlers/pickup.rs:70`), so the proofs use **shipping** listings. | n/a | Low, given the adapter gate. Worth a runbook line because the flag's name suggests more reach than it has. |

---

## D. The proofs

r1 proposed one proof whose PASS depended on the watcher accepting pre-invoice
history. §B.4 removes that behaviour, so that PASS is now impossible by
construction — correctly. The work splits into three proofs with narrower and
honest claims, plus a fourth leg that only a human with money can perform.

**Stated plainly, up front: no agent proves a live mainnet positive
confirmation.** The owner will not fund an on-chain transaction for an agent,
and historical replay is not a payment simulation once the floor exists. The
first live mainnet confirmation is the commerce team's own small real payment in
the W5 canary. Everything below is what *can* be proven without spending.

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
| Depth / child number | 3 / `0'` — satisfies `xpub.depth != 3` and the hardened-index check (`create_invoice.rs:263-270`) with `account_index = 0` |
| `0/0` | `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu` — 176 txs, 88 received outputs, 4,082,661 sats, all spent, max single output 2,243,167 at height 882,346 (blockstream.info Esplora, 2026-09-09) |
| `0/1` | `bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g` — also funded (4 outputs, 101,720 sats). Not an "unfunded index". |

**NEG-1 — the claim-time scan.** Claim the account. Assert the response's
`next_child_index` is above the last used index found by the gap scan (§B.5),
that `first_derived_address` has empty history when queried independently, and
that it is **not** `bc1qcr8te…`. Then run a full order: listing priced at
2,243,167 sats, fresh throwaway buyer with a published receiver marker, bind
Bitcoin, and assert the payment stays `awaiting_entitlement` and paykit reports
`undetected` across at least three marketplace poll cycles.

**NEG-2 — the height floor in isolation.** NEG-1 alone would pass for the wrong
reason (an address with no history cannot pay anything). So: on the **proof
database only**, the parent forces that creator's `next_child_index` back to the
last used index, so the next derivation lands exactly on
`bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu` with its 88 historical received
outputs. Create a new order at 2,243,167 sats. Every historical output is
confirmed at or below `creation_chain_height`, so **every one is ineligible**.
Expected: no observation row is written, paykit reports `undetected`, the
payment stays `awaiting_entitlement`, and the order expires at the hold window.
This is the run that proves P1-A is closed against real mainnet history at
scale (176 transactions).

**Positive control inside NEG-2 (proves the floor is not simply "nothing ever
matches"):** the same tick must show the observer *fetched* that history — the
`/health` tip probe advanced and the invoice's persisted `history_tx_count` is
176. A floor that works because the scan silently failed is not a floor.

**Drift guard (P2-E), mandatory before every NEG run.** Anyone can send a new
output to this public address. Immediately before each run the harness refetches
the full history from two independent read-only sources (blockstream Esplora and
the configured Electrum), canonicalizes it as sorted
`(txid, vout, value, height)` lines, SHA-256s it, and compares against a digest
pinned in the harness. On mismatch it **aborts** and prints the diff. With the
floor in place a *new* output above the floor would legitimately confirm the NEG
invoice — i.e. it would look like a product failure when it is address drift —
so this guard is what keeps the negative result interpretable.

### D.2 MAINNET-DERIVE — mainnet reality, with a real Bitkit receiver

Also on the proof stack. Proves the mainnet legs a real wallet depends on,
without any money moving.

1. **Connectivity and chain identity.** `/health` reports Electrum available on
   evidence: TLS handshake to `ssl://bitkit.to:9999` succeeds, the genesis hash
   matches Bitcoin mainnet, and the tip height is within 3 blocks of an
   independent public reference. Assert an explicit negative too: point a
   throwaway configuration at a testnet Electrum and confirm
   `ObserverError::WrongNetwork` (`observer.rs:226-233`) and `/health`
   unavailable.
2. **A real, unfunded Bitkit receiver.** A team member exports their **mainnet**
   Bitkit account xpub, claims it on the proof stack as the **seller**, and
   confirms in the Bitkit UI that the address the claim response returns as
   `first_derived_address` appears in their own receive list. **No funds are
   sent, and the real wallet is never the payer in any harness run.** This is
   the leg r1 omitted entirely — r1's buyer was a Paykit reader script, which
   proves a reader, not production wallet ingestion.
3. **Wire shape.** A real order is created for that receiver; assert the
   endpoint identifier is `btc-bitcoin-p2wpkh` (`create_invoice.rs:166`), asset
   `"btc"` (`:213`), payload `{"value": <address>}` (`:241`), and that the
   address the buyer's wallet received equals the locally derived one.
4. **Ownership round-trip.** Assert the client-computed `key_fingerprint` over
   the exact normalized bytes submitted equals the server's (§B.6), and that a
   deliberately altered byte produces a mismatch that blocks `bitcoinEnabled`.

Does **not** demonstrate: that a payment sent to that address confirms. That is
D.3 on regtest and W5 on mainnet.

### D.3 REGTEST-POS — the positive transition, including the new floor

On the existing regtest stack with the local Fulcrum, where an agent can create
transactions without spending real money. Same server binary and same code paths
as mainnet; only the network literal differs.

Positive run: create the order and record the floor at tip `H`; assert
`payments.adapter == 'paykit'`; `bitcoin-cli sendtoaddress` the exact price to
the derived address; observe `detected` at 0 confirmations on a **later** tick
(proving the mempool first-seen rule admits a post-invoice transaction rather
than blanket-rejecting unconfirmed outputs); mine one block; observe `confirmed`
with `amount_matched: true`; the order becomes `paid` with a durable receipt;
both buyer and seller UIs render paid, evidenced by screenshots the parent
opens. If owner decision 1 is 2 confirmations, assert `paid` occurs at the
second block and not the first.

FAIL calibrations, all four required before the positive run is trusted:

- **F1 — one satoshi short.** Send `price - 1`. Expected: paykit reports
  `confirmed` with `amount_matched: false`, marketplace routes to
  `manual_review` and emits `payment.manual_review` (`workers.rs:827-859`);
  order never `paid`. Isolates the amount predicate and nothing else.
- **F2 — pre-floor output (the regtest mirror of NEG-2).** Send the exact price
  to the address that index *N* will derive, mine 6 blocks, force
  `next_child_index` to *N*, then create the order. Expected: ineligible, no
  observation, `awaiting_entitlement` until expiry. This is the calibration that
  proves the floor rejects, on a chain where the parent controls the history.
- **F3 — unfunded address.** No transaction at all. Expected: empty history,
  no observation ever written, `undetected`, no-op branch
  (`workers.rs:1002-1005`), `awaiting_entitlement` through ≥3 cycles.
- **F4 — partial payment in two transactions.** Send the price as two outputs.
  Expected: never confirms — the binding is a single output and
  `action_for_values` replaces rather than sums (`bitcoin.rs:176-195`).

Also assert on regtest, cheaply: a second order for the same seller derives the
next index and never reuses an address (`invoices.rs:786-829`); and that
`payment.sandbox_advance` is refused once the adapter is `paykit`.

### D.4 What is still unproven when all three pass

Live mainnet confirmation; a real wallet constructing, signing and broadcasting
to a derived mainnet address; mainnet mempool and fee behaviour; reorg handling
(no code handles it — owner decision 4); the seller's ability to actually spend
what arrives; and whether the Electrum endpoint is honest — the proofs
demonstrate only that the pipeline believes it.

**W5 canary closes the first four**, and it is a human procedure, not an agent
run: one named commerce-team seller re-claims with a dedicated unused account,
confirms the derived address in Bitkit, publishes a small listing (order of
tens of thousands of sats), a second team member buys it and pays from a real
mainnet Bitkit, and the team observes `detected` → `confirmed` → `paid` →
receipt, then **spends the received funds** to prove the seller controls them.
Nothing goes to general availability until that has happened at least once.

---

## E. Self-attack table

| Attack | Precondition | Result | Mitigation |
| --- | --- | --- | --- |
| **Legitimate seller's own old receipts confirm their first unpaid order** | An established BIP84 account is claimed; the server derives `0/0`; any historical output ≥ the listing price exists | **Was the r1 design's premise. Closed by §B.4** — the output is confirmed at or below `creation_chain_height` and is ineligible. Proven by NEG-2 and F2. | Height floor plus the claim-time index scan (§B.5). Neither alone: the scan can be defeated by history arriving after the claim; the floor alone still derives onto a used address. |
| Server child index 0 collides with wallet-used addresses | `next_child_index DEFAULT 0` on a used account | **Closed by §B.5** — the scan starts above the last used index plus a gap buffer. | Also a privacy and Electrum-cost fix. Refuse the claim if Electrum is unreachable; never default to 0. |
| Creation-height protection vs a historical PASS | Both cannot be true | Acknowledged as mutually exclusive; the floor ships and the proof is redesigned around it (§D), not the reverse. | r1 chose the proof; r2 chooses the product. |
| Deny-list vs the harness claim | W1.4 denies the exact key the proof must claim | Resolved by `stack_role` as a deployment invariant (§B.6), not by a code bypass. | A production database cannot boot with `role=proof`; a CI test asserts both directions. |
| Public test-vector history changes between calibration and run | Anyone can fund `bc1qcr8te…` | Would make a correct negative result look like a product failure. | Two-source recompute + pinned SHA-256 immediately before every run; abort on drift (§D.1). |
| Alternate account index bypasses the deny-list | Same public mnemonic, account 7 | A key-material deny-list cannot catch it. | Server rejects `account_index != 0` on mainnet until arbitrary accounts are intentional (§B.6). |
| Unpaid order marked paid — malicious or compromised Electrum | Control of the endpoint host, or TLS MITM | **Succeeds.** Merkle proofs are checked only against headers the same server supplied, with no proof-of-work check (`bdk_electrum_client.rs:527-551`). | First-party endpoint, so this collapses into "compromised Synonym infrastructure" (owner decision 2). TLS via `use-rustls-ring` blocks the network MITM. Wrong chain fails closed at genesis agreement. Corroboration is the real fix and is scheduled. |
| Reorg after confirmation | 1-block reorg drops the payment | **Not handled.** paykit-server would see the disappearance (`observer.rs:208-221`); marketplace-service confirms at 1 and has no un-confirm edge (`workers.rs:822-826`). | Owner decision 1 (2 confirmations) and decision 4 (disclosure + seller guidance). A disappearance-driven `manual_review` edge is the code fix; it is not in this wave. |
| Staging/proof rows enter production's observation batch | A shared mainnet database | **Would be total**: one poisoned row fails the whole batch for every seller (`observer.rs:259-322`). | Separate service and database per stack from day one (§B.1); `stack_role` in the deployment invariants; the proof database is dropped, never promoted. |
| Rollback orphans delivered mainnet Payment Requests | `PAYKIT_SERVER_URL` repointed while invoices are live | Buyers pay correctly and the order expires; the late-settlement `manual_review` net never fires because nothing polls that server. | Creation kill switch, then drain, then repoint — in that order (§C.16). |
| Empty-target `/health` reports Electrum available | No invoices exist | **Reports available without making a request** (`server.rs:592-597`). A dead endpoint looks healthy until the first real order. | Active genesis/tip probe every tick, with tip age in `/health` (§B.7). |
| Unbounded Electrum load / ban | A large history, or many targets, at a short interval | Silent total non-confirmation. | Request budget, cap, batching, jitter, backoff, backlog-age alert (§B.7). |
| Harness residue keeps hammering Electrum | A never-matching invoice left in a mainnet database | **Permanent load**: a non-final invoice never leaves `observation_targets()` (`invoices.rs:249-250`). | The proof database is **dropped**, not row-deleted: `0001_initial.sql:21-108` is `ON DELETE RESTRICT` throughout, so FK-safe row cleanup is error-prone and partial cleanup leaves live targets. Scripted in W1.6. |
| **Dust griefing → permanent production watcher load** (Kimi P2) | The buyer is the only party who sees the derived address, and can send dust to it cheaply | Every underpayment and every dust output leaves a confirmed-but-unmatched invoice that is never final and is rescanned in full on every tick, forever. Not harness-only — this is the production shape of the row above. | Observation TTL bounded by the order's payment window plus `manual_review` resolution, shipped with §B.7. Note `manual_review` payments are deliberately never swept (`workers.rs:1050-1052`), so the TTL cannot key on the payment alone. |
| **Concurrent first-bind race** (Kimi P2) | Two buyers' first orders from the same seller allocate `next_child_index` simultaneously | **Does not happen.** `create_atomic` takes the creator row with `SELECT … FROM creators WHERE creator_lookup_hash = $1 FOR UPDATE` (`invoices.rs:733-741`) and increments inside the same transaction (`:822-829`), so allocation is serialized by a row lock, not by an optimistic read. Kimi's concern is refuted by the code it could not read. | Refuted, not dismissed: W1.1 adds a concurrent-bind test asserting two simultaneous first orders derive distinct indices, plus a unique constraint on (creator, child index) as a cheap invariant that turns any future regression into a failed write rather than two buyers paying one address. |
| **Cross-instance replay across stacks** (Kimi, newly live in r2) | A seller claims the **same** account xpub on the proof stack and on production | Both instances derive the same addresses from the same key, with no domain separation in BIP84. A payment intended for one stack's order can satisfy the other's same-index invoice. r1's single shared service made this impossible; §B.1's isolation creates it. | `PAYKIT_SETUP_ALLOWED_ORIGINS` on the proof stack is the staging Shop origin only, and proof sellers are throwaway identities — no real seller ever claims on both. Seller copy reinforces one dedicated account per Shop. Must be re-examined before any second marketplace shares the rail. |
| **Gap-limit exhaustion at the seller's wallet** (Kimi P3) | More than ~20 unpaid orders from distinct buyers, or a scan-applied start offset on top of that | Derivation marches past the wallet's gap limit; funds are spendable but invisible in the seller's wallet, which a non-technical seller cannot distinguish from loss. | The scan offset is applied only when usage is found (§B.5), so the recommended dedicated account starts at 0 with a full gap. Seller copy: use a dedicated account and raise the wallet's gap limit if many orders are outstanding. Indices advance per new (reader, bundle) triple and never come back (`invoices.rs:786-829`), so this is a real long-run consideration, not a corner case. |
| **Chain-data operator surveillance** (Kimi P3) | Normal operation | The Electrum sees only scripthashes, but it sees every watched seller address every 30 s from one client, so it can cluster a seller's indices over time and correlate order timing with polling. The paykit database is what links creator ↔ xpub ↔ addresses. | Disclosed in seller copy (§C.10) rather than left implicit. It is a consequence of any watch-only rail with one chain-data source; the honest statement is the mitigation. |
| One poisoned row stops every seller | Any unparseable address or failing merkle proof | **Total confirmation outage** today. | Reduced, not eliminated, by the §B.7 budget/deferral (smaller batches). Per-target error isolation in the fork remains the real fix, scheduled. Alert on backlog age, not just `/health`. |
| Seller pastes a valid but **wrong** xpub | An old wallet's key, a colleague's key, a blog example | **Funds are lost, irreversibly.** Base58check catches typos; it cannot catch a well-formed key the seller does not control. The claim is immutable per creator (`bitkit_claim.rs:69-74`). | §C.10 is load-bearing: preview derived from the exact normalized bytes POSTed, fingerprint compared against the server's, address confirmed in the seller's own wallet before `bitcoinEnabled`. Copy says irreversible and unrecoverable in those words. |
| The test-vector xpub reaches a real listing | Harness leaks, or a seller copies it from this document | **Catastrophic and irreversible** — the mnemonic is public. | Canonical 78-byte deny-list in `validate_xpub`, enforced on every non-proof stack; harness refuses to run unless the target origin is the staging Shop; fresh identities per run; derived-first-address check as belt-and-braces (§B.6). |
| Key or secret exposure on this path | Operator DB read, log capture, compromised server | **No Bitcoin private key exists anywhere on this path.** Addresses, outpoints and amounts are redacted in every `Debug` impl (`bitcoin.rs:33-40`, `:64-71`, `:87-99`, `:126-135`) and sealed at rest under `PAYKIT_MASTER_KEY` (`invoices.rs:660-671`). Full compromise buys the ability to lie about payments and to read seller xpubs — a privacy loss, since an xpub reveals a seller's whole receive history. | §C.11 records watch-only as a repo invariant. Seller copy must state the xpub-privacy consequence plainly. |
| Overpayment | Buyer sends more than the price | Confirms as matched (`invoices.rs:694`); the surplus is the seller's. | Correct for a non-custodial rail, but buyer copy must say the amount is exact and overpayment is not refunded by the marketplace. |
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
| W0 | This design reviewed adversarially | — | deep reasoning, different family | — | Verdict recorded. **Done:** Sol FIX-FIRST → this r2 |
| W0b | Design audit | OpenCode Kimi | **Kimi** | — | Verdict line present in the log. **Done:** FIX-FIRST, same two P1s as Sol, folded in above |
| W1.1 | Fork: post-invoice eligibility (§B.4) — V2 record, `ChainTipPort`, `confirmed_height`, first-tick `pre_existing`, migration `0002` | `paykit-server-fork` | **Kimi** | W0 | `cargo test -p paykit-server` → new cases: an output at `height <= floor` writes no observation; an output above it binds; an unconfirmed outpoint present at tick 1 never binds; the same outpoint confirmed above the floor does bind; a V1 record on mainnet is a hard error; two concurrent first binds derive distinct indices and the (creator, index) unique constraint holds |
| W1.2 | Fork: claim-time index scan (§B.5) | same fork, serialized after W1.1 | **Kimi** | W1.1 | `cargo test -p paykit-server manual_claim` → unused account starts at 0; account with usage at index *k* starts at `k+21`; Electrum failure refuses the claim; >1,000 scanned refuses |
| W1.3 | Fork: deny-list on canonical key data, account-0 restriction, `key_fingerprint`/`first_derived_address` in the claim response, `stack_role` invariant (§B.6) | same fork, serialized after W1.2 | **Kimi** | W1.2 | `cargo test -p paykit-server` → the test-vector key is refused under `production` in both xpub and zpub-normalized form and accepted under `proof`; `account_index != 0` refused on mainnet; a proof DB under a production config exits `StartupError::Deployment` |
| W1.4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe (§B.7) | same fork, serialized after W1.3 | **Kimi** | W1.3 | Unit tests: budget arithmetic caps at 1,000/tick and ≤5 req/s; deferral is oldest-first; `/health` reports tip height and age; an empty target set no longer reports `available` without a probe; a confirmed-but-unmatched invoice leaves the target set once its window has expired and its `manual_review` is resolved |
| W1.5 | Fork: `PAYKIT_BITCOIN_CREATION_ENABLED` kill switch (§C.16) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test` → creation refused with `bitcoin_creation_disabled` while observation of existing invoices continues |
| W1.6 | Rails: entrypoint variables (§C.6) **plus** the IaC/script for §B.1 — create both services and databases, wire variables, run the negative miswiring gate, and a separate destructive script that drops the proof database | `pubky-payment-rails` | **Kimi** (operator config gates the watcher) | W0 | `sh paykit-server/tests/entrypoint_test.sh` → pass; `PAYKIT_ENTRYPOINT_RENDER_ONLY=1` with mainnet vars → TOML contains `network = "mainnet"`, `poll_interval = "30s"`, the stack role; bogus network → non-zero exit; the IaC script run twice is idempotent; the miswiring gate fails to boot as expected |
| W1.7 | Client: network-aware validator, `zpub`→`xpub` normalization, deny-list, `PUBKY_RUNTIME_BITCOIN_NETWORK` | `mp-oneauth` worktree | **Kimi** (client xpub conversion is key handling) | W0 | `npm run test -- payment-methods` → `zpub` converts to the same 78 bytes the server stores; `vpub`/`tpub` rejected on mainnet with named reasons; the test-vector key rejected in both forms and for accounts 0–19; an unset `PUBKY_RUNTIME_BITCOIN_NETWORK` refuses the claim; the published BIP84 test vectors are asserted directly |
| W1.8 | Client: preview from the exact normalized bytes, fingerprint comparison, confirmation gate, disclosures (§C.10) | separate `mp-*` worktree | **Kimi** — in-browser BIP84 derivation is the gate §C.10 rests on, so the preamble's rule applies (Kimi P2 on r1's tiering) | W1.7 | Component tests green; the published BIP84 test vectors are asserted against the preview derivation; a mutated byte blocks `bitcoinEnabled`; VRT regenerated if a baseline exists for the settings surface |
| W1.9 | Docs pass (§C.17) | umbrella + `mp-oneauth` | **deep reasoning** — this is money-affecting operator text, not a mechanical edit | W1.5 | `git diff --stat` shows exactly the listed files; the parent reads the replacement policy line and the §C.16 rollback order end to end |
| W2.1 | Proof stack stood up and **redeployed from the W1.5 commit** | operator (parent) | parent-only | W1.1–W1.6 merged | Boot line shows `mainnet`, `role=proof`, `ssl://bitkit.to:9999`, and the built revision; `/health` shows a real tip height; the miswiring gate refuses to boot |
| W2.2 | Harness: MAINNET-NEG (NEG-1, NEG-2, drift guard) | `mp-oneauth` worktree | **Kimi** (the harness is the evidence) | W2.1, W1.7 | NEG-1 and NEG-2 both `awaiting_entitlement`/`undetected` after ≥3 cycles; `history_tx_count == 176` on NEG-2; drift guard aborts on a mutated pinned digest |
| W2.3 | Harness: MAINNET-DERIVE, incl. the real unfunded Bitkit receiver leg | same worktree, after W2.2 | **Kimi** | W2.2 | Genesis/tip assertions pass; testnet-endpoint negative gives `WrongNetwork`; the team member confirms the address in Bitkit (screenshot the parent opens); fingerprint round-trip passes and its negative fails |
| W2.4 | Harness: REGTEST-POS with F1–F4 | separate worktree, regtest stack | **Kimi** | W1.5 | All four FAILs observed first, then the positive run: `detected` on a later tick → `confirmed` → `paid` with receipt; screenshots the parent opens |
| W3 | Kimi audit of the full diff | OpenCode, own `OPENCODE_DB` lane | **Kimi** | W1.*, W2.* | Report contains an explicit `SHIP` or `FIX-FIRST`; exit 0 is not a report — grep the log for the verdict |
| W3b | Deep-reasoning review: do the three proofs prove what they claim, and does the runbook rollback order actually drain | — | deep reasoning | W2.2–W2.4, W1.9 | Verdict recorded; the parent opens the screenshots and re-runs one proof command per proof |
| W4 | **Owner sign-off** | — | — | W3 SHIP + W3b SHIP + all proofs | Owner answers decisions 1–4 in writing, having read §D.4 |
| W5 | Production stack, cutover (§C.18), canary (§D.4) | operator (parent) + commerce team | parent-only | W4 | Production boot line shows `role=production` and the built revision; one real seller re-claims, confirms the address in their wallet, and one real payment completes end to end and is spendable |

Parent duties, never delegated: commits, all remote git and GitHub writes,
secret handling, Railway and Vercel variable changes, plan edits, and the owner
conversation. Sub-agents never run `git push`, `gh pr create`, or any remote
write; every OpenCode prompt restates that prohibition explicitly.

Verification the parent performs rather than accepts on claim: read the rendered
TOML from the render-only entrypoint run; read each boot line including the
built revision; open every harness screenshot; run `git status --short` and
`git log -1` on every tree an agent touched; grep the Kimi log for the verdict.

W1.1–W1.5 are one fork tree and therefore serialize; W1.6, W1.7 and W2.4 are
independent trees and run in parallel with them, which is where the concurrency
budget is spent.

---

## G. Engineering questions, decided

Owner-facing items are the four at the top of this document. These are decided
here and recorded so the decision is reviewable.

1. **Second server, or flip?** Neither: **three isolated stacks** (§B.1).
   Flipping is impossible anyway — the server refuses to boot against a database
   initialised on another network (§A).
2. **Electrum endpoint.** `ssl://bitkit.to:9999`, with an active genesis/tip
   probe and a request budget (§B.2, §B.7). Blockstream is the documented
   failover; own bitcoind + Fulcrum is scheduled separately.
3. **Creation-height floor.** **Before production, not after** (§B.4) — the
   reverse of r1, which planned to use its absence and land it later.
4. **Staging `SANDBOX_PAYMENTS_ENABLED`.** Leave `true`; the adapter gate is
   sufficient and setting it `false` would enable local pickup as a side effect.
5. **Seller re-onboarding.** In-app banner for every existing seller with a
   Bitcoin claim: the rail moved to mainnet, re-claim with a mainnet account
   xpub, prefer a dedicated unused account, confirm the first derived address in
   your wallet, and note that the claim is immutable and account-0 only. Silent
   breakage is not acceptable — the failure mode looks like "Bitcoin
   unavailable" with no reason given.
6. **Arbitrary account indexes.** Not now: server-side `account_index = 0` only
   on mainnet (§B.6). Supporting them is a feature with its own deny-list and
   scan implications, not a one-line relaxation.
7. **Certificate pinning for the Electrum endpoint.** No, with the reason
   recorded rather than left unstated (§B.3).

Scheduled, explicitly not in this wave, each with the reason it can wait:
per-target error isolation in the observer (the §B.7 budget shrinks the batch
and therefore the blast radius); two-server Electrum corroboration (owner
decision 2); a disappearance-driven `manual_review` edge for reorgs (owner
decision 4 discloses the gap); own bitcoind + Fulcrum (§B.2); a signed
ownership challenge (§B.6, needs wallet support); and domain separation in
derivation, which must be settled before any second marketplace shares the
rail (§E, cross-instance replay).
