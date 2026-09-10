# Bitcoin Mainnet Switch And Payment-Journey Proof — Design

Status: design only. No code in this document has been written. Read
[`status.md`](status.md) (what is actually proven today) and
[`runbook-production.md`](runbook-production.md) (kill switch and rollback)
first; this document changes the premise of both.

Owner decision this design implements: switch the Bitcoin rail to **mainnet**
this week on both stacks, and prove the **whole payment user journey** works
— every leg real except the on-chain transaction itself, which is simulated
by pointing the watcher at pre-existing mainnet receive history. Fiat rails
stay in test mode. The prior `pubky-payment-rails` policy line
("REGTEST ONLY. Nothing in this repo may ever be configured for Bitcoin
mainnet." — `pubky-payment-rails/README.md:12-13`) is reversed by the owner;
§C.11 states what replaces it.

Every behavioural claim below cites a file and line that was opened and read
while writing this. Anything not verified that way is marked **UNVERIFIED**.

---

## Errors corrected in the input survey

The read-only survey at `/tmp/btc-mainnet-map.md` was used as a map. Ten of
its claims are wrong or materially incomplete. They are corrected inline
below; collected here because several of them change the shape of the work.

| # | Survey claim | Verified reality |
| --- | --- | --- |
| 1 | "The Dockerfile applies a patch (`regtest-endpoint-identifier.patch`) to use `btc-regtest-p2wpkh`"; the switch checklist lists "Remove regtest patch" as a required change | The patch was folded into the fork tree (`pubky-payment-rails/paykit-server/Dockerfile:3-5`). The identifier is selected at runtime from the configured network: `PaykitIntentBuilder::for_network` maps Mainnet → `btc-bitcoin-p2wpkh` (`paykit-server-fork/paykit-server/src/application/create_invoice.rs:163-173`), wired at `src/server.rs:190` and `:208`. The Dockerfile's only reference is a fail-closed *presence* grep (`Dockerfile:57`) that still passes on mainnet because the regtest match arm remains in the source. **No Dockerfile change is required.** |
| 2 | "Confirmation threshold: controlled by `LOCKS_PAYKIT_MIN_CONFIRMATIONS` (default 1)" | That variable only templates the **Lock Server's** `[paykit] minimum_confirmations` (`pubky-payment-rails/locks-server/entrypoint.sh:32` and `:100`). The marketplace physical-bitcoin path never touches the Lock Server. Its effective threshold is `confirmations >= 1`, hardcoded in paykit-server's persistence layer (`paykit-server-fork/paykit-server/src/persistence/invoices.rs:702-707`). Changing `LOCKS_PAYKIT_MIN_CONFIRMATIONS` has **no effect** on marketplace orders. |
| 3 | "`paykit-server` checks for an exact amount match" | It is greater-or-equal, not exact: `let amount_matched = present && observed_sats >= required;` (`invoices.rs:694`). Overpayment matches and confirms; underpayment does not. |
| 4 | The BTC checkout flow runs proof-bundle → Lock Server → invoice | That is the **digital-content Locks** path (`mp-oneauth/src/core/application/commerce/commerce.ts:863-918`). A **physical** bitcoin order binds at `POST /v0/orders/{id}/payment-method` and marketplace-service creates a lock-free payment request itself via `POST /v0/payment-requests` (`marketplace-service/crates/service/src/payments.rs:737-775`). No Lock Server, no content lock, no proof bundle. |
| 5 | (Implied by the survey's "Time Window: `LOCKS_PAYMENT_WINDOW_SECONDS`") | Bitcoin orders are bounded by `FIAT_PAYMENT_WINDOW_SECONDS` — the payment-method bind is the lock point for "all three rails" (`marketplace-service/crates/service/src/config.rs:37-41`, armed at `payment_methods.rs:548-553`). `LOCKS_PAYMENT_WINDOW_SECONDS` arms only `payment.register_locks` (`executor.rs:226`). |
| 6 | "Can the payment watcher be pointed at an arbitrary existing mainnet address/txid? No." | Correct as to *arbitrary* addresses, but the survey's framing hides the fact that makes the proof possible: the observer does a **full address-history scan from genesis** (`workers/observer.rs:136-155`; bdk_electrum calls `batch_script_get_history` and fetches every transaction it returns — `bdk_electrum-0.24.0/src/bdk_electrum_client.rs:290-292`, `:316-318`). Pre-existing outputs count, and **already-spent** outputs count, because the observer enumerates each transaction's outputs by script (`observer.rs:190-206`), never the UTXO set. |
| 7 | "The seller pastes a BIP84 account key (`zpub`, `vpub`, `xpub`, `tpub`). The client validates it with `isPlausibleAccountXpub`." | The client accepts all four prefixes (`mp-oneauth/src/libs/commerce/payment-methods.ts:84-93`) and forwards the string verbatim (`marketplace-paykit-claim.ts:122`). paykit-server parses it with rust-bitcoin `Xpub::from_str`, which accepts **only** version bytes `0488B21E` (xpub) and `043587CF` (tpub) (`bitcoin-0.32.101/src/bip32.rs:791-803`). A `zpub` (`04B24746`) or `vpub` is a client-side false accept and a server-side `invalid_xpub`. |
| 8 | "There are no environment variables for the Bitcoin network" | True but misleading. The network is a **literal in the rails repo**: `network = "regtest"` at `pubky-payment-rails/paykit-server/entrypoint.sh:150`. Switching it is a code change plus redeploy, not a Railway variable edit. |
| 9 | The client sends `{auth_token, account_xpub, account_index}` | It does, but `account_index` is hardcoded to `0` (`marketplace-paykit-claim.ts:122`). A seller whose wallet exports account 1+ cannot claim through the Shop UI at all. |
| 10 | Not mentioned at all | **Both stacks share one paykit-server.** Staging reaches it at `PAYKIT_SERVER_URL=http://paykit-server.railway.internal:3001`, production at `https://paykit-server-production.up.railway.app` — the same Railway service in project `pubky-marketplace-staging` (read live from the Railway CLI, 2026-09-09; consistent with `HANDOFF.md`, Deployments table, "Reuses the staging rails project over public domains"). Because the Bitcoin network is a property of that one service, **"staging first" is impossible without a second service.** This is the single constraint that shapes §B and §C. |

Two smaller corrections: the survey's Electrum inventory omits the mainnet
hosts (`ssl://bitkit.to:9999` on both wallets —
`bitkit-android/app/src/main/java/to/bitkit/env/Env.kt:285`,
`bitkit-ios/Bitkit/Constants/Env.swift:184`), and describes bitkit-android as
"LDK Node … Esplora/Electrum" when the mainnet constant is an Electrum URL
despite being named `ESPLORA`.

---

## A. Current state (verified)

| Layer | Where the network / chain source is set | Staging today | Production today | Citation |
| --- | --- | --- | --- | --- |
| paykit-server Bitcoin network | Literal in the generated TOML, `[bitcoin] network` | `regtest` | `regtest` (same service) | `pubky-payment-rails/paykit-server/entrypoint.sh:150` |
| paykit-server Pubky/identity network | Literal, `[paykit] network` | `mainnet` (real pkarr relays) | `mainnet` | `entrypoint.sh:146` |
| On-chain endpoint identifier advertised to wallets | Derived from `[bitcoin] network` at construction | `btc-regtest-p2wpkh` | `btc-regtest-p2wpkh` | `paykit-server-fork/…/create_invoice.rs:163-173`; wired `src/server.rs:190,208` |
| Chain data source | `PAYKIT_ELECTRUM_ENDPOINT` → `[electrum] endpoint` | `tcp://fulcrum.railway.internal:50001` (read live via Railway CLI, 2026-09-09) | same service, same value | `entrypoint.sh:24`, `:152-153`; `README.md:134` |
| Electrum poll cadence | Literal, `[electrum] poll_interval` | `1s` | `1s` | `entrypoint.sh:154`; loop at `paykit-server-fork/…/src/server.rs:576-608` |
| Address derivation | BIP84 `m/84'/…'/account'/0/index` from the seller's claimed account xpub; network kind checked against `[bitcoin] network` | regtest ⇒ `NetworkKind::Test`, `bcrt1…` addresses | same | `create_invoice.rs:246-280` (network check `:257-270`, address `:278-279`) |
| Derivation index for a payment request | `creators.next_child_index`, per creator, `DEFAULT 0`, `+1` per new (reader, bundle) assignment | 0-based | 0-based | `invoices.rs:733-741`, `:795-797`, `:822-829`; `paykit-server-fork/paykit-server/migrations/0001_initial.sql` (`next_child_index BIGINT NOT NULL DEFAULT 0`) |
| Seller xpub claim (server) | `POST /v0/accounts/claim`, network-validated at claim time; immutable once set | tpub only (regtest ⇒ `NetworkKind::Test`) | same | `manual_claim.rs:288-291`; immutability `bitkit_claim.rs:69-74` |
| Seller xpub claim (client) | `isPlausibleAccountXpub`, prefix + length + base58 charset only. **No network awareness, no per-stack behaviour.** | identical code on both stacks | identical | `mp-oneauth/src/libs/commerce/payment-methods.ts:84-93`; `account_index: 0` hardcoded `marketplace-paykit-claim.ts:122` |
| Confirmation threshold for a marketplace order | Hardcoded: status is `confirmed` once `reported_confirmations != 0` | 1 conf | 1 conf | `invoices.rs:695-707`; consumed at `marketplace-service/…/payments.rs:812-818` |
| Amount predicate | `observed_sats >= required` | ≥ | ≥ | `invoices.rs:694` |
| Payment hold window (bitcoin) | `FIAT_PAYMENT_WINDOW_SECONDS`, default 3600 | unset ⇒ 3600 | unset ⇒ 3600 | `config.rs:37-41`, `:127-130`; armed `payment_methods.rs:548-553` |
| Sandbox command gate | `SANDBOX_PAYMENTS_ENABLED` | `true` (read live, 2026-09-09) | `false` (read live) | `config.rs:84-94`, `:153`; gate `executor.rs:202-207` |
| paykit-server reachability from marketplace-service | `PAYKIT_SERVER_URL` | `http://paykit-server.railway.internal:3001` | `https://paykit-server-production.up.railway.app` | Railway CLI, 2026-09-09; `HANDOFF.md` Deployments table |
| Client → paykit-server (claim + CORS) | `PUBKY_RUNTIME_PAYKIT_SETUP_URL` | Vercel env, project `pubky-marketplace-staging` | Vercel env, project `pubky-marketplace-production` | `mp-oneauth/src/libs/runtime-config/runtime-config.schema.ts:571`; origin taken at `marketplace-paykit-claim.ts:36-38` |
| Bitkit mainnet Electrum | Build flavour constant | n/a | `ssl://bitkit.to:9999` | `bitkit-android/…/Env.kt:285` (used at `:69`, `:191`); `bitkit-ios/…/Env.swift:184` |

### What the flow actually is, for a physical bitcoin order

1. Buyer checks out. Order is `pending_payment`, payment `awaiting_entitlement`, `payments.adapter = 'sandbox'` (the schema default set — `marketplace-service/crates/service/migrations/0009_payment_methods.sql:25`).
2. Buyer binds Bitcoin: `POST /v0/orders/{id}/payment-method`. This is the lock point — it acquires the inventory hold and arms `FIAT_PAYMENT_WINDOW_SECONDS` (`payment_methods.rs:548-553`), requires a SAT/BTC-denominated order (`payment_methods.rs:435-446`), and flips `payments.adapter` to `paykit` (`payment_methods.rs:593`, `:675-681`).
3. In the same request, marketplace-service signs and calls `POST /v0/payment-requests` on paykit-server with `{amount_sats, creator, reader, reference}` (`payments.rs:737-758`). `reference` is Crockford base32 of the order UUID (`payments.rs:661-678`). If paykit refuses, nothing is bound.
4. paykit-server validates the marketplace signature, discovers the **buyer's** Paykit receiver marker, loads the **seller's** claimed xpub, derives the next BIP84 address, persists the invoice atomically, and queues an outbox delivery of the Payment Request to the buyer's wallet (`application/create_payment_request.rs:109-205`).
5. The observer loop scans that address on every tick (`server.rs:576-608` → `workers/observer.rs:245-257` → `invoices.rs:520-713`).
6. marketplace-service polls `POST /transactions/status` (`payments.rs:778-822`) and applies the outcome (`workers.rs:966-1006`): `detected` updates `orders.paykit_request_state`; `confirmed` with `amount_matched` runs the shared confirmation effects and the order becomes `paid` with a receipt (`workers.rs:864-918`); `confirmed` **without** `amount_matched` routes the payment to `manual_review` (`workers.rs:827-859`).
7. The buyer never sees a Bitcoin address in Shop. The Payment Request is delivered privately to the buyer's wallet; Shop shows status only (`mp-oneauth/src/components/organisms/Marketplace/MarketplacePaymentStatusCard.tsx`).

### Regtest-only assumptions that actually bite

- `[bitcoin] network = "regtest"` (`entrypoint.sh:150`) is the only place the chain is named.
- Every persisted claim is a **tpub**, and `derive_bip84_p2wpkh_address` refuses a network-kind mismatch (`create_invoice.rs:257-270`). Flipping the existing service to mainnet makes every existing seller un-derivable.
- Worse: every existing non-final invoice holds a `bcrt1…` address, `observation_targets()` returns all of them (`invoices.rs:240-251`), and `observe_blocking` parses each with `require_network` and fails the **entire batch** on the first mismatch (`observer.rs:126-134`, `:236-241`). A mainnet-configured server sharing that database would never observe anything, for anyone, permanently. This is the technical reason §C does not flip the existing service.
- `mp-oneauth/src/test/live/locks-payment.live.ts` drives `bitcoin-cli -regtest` with hardcoded regtest RPC credentials (`:103-106`, `:525`) and exercises the **Locks/digital** path, not the marketplace order path. It is prior art for style, not a starting point.

---

## B. Target state

**Mainnet BTC rail on both stacks, staging first — delivered by standing up a
second, mainnet-only paykit-server beside the regtest one, not by flipping
the existing service.**

The existing `paykit-server` service keeps `network = "regtest"`, keeps its
database, and keeps serving nothing (or the legacy Locks/digital path) until
it is retired. A new service — `paykit-server-mainnet` — is deployed from the
same repo with `network = "mainnet"` and its **own empty Postgres**. Stacks
are moved one at a time by repointing two URLs.

Why a second service rather than a flip:

- It is the only way "staging first" exists at all (correction #10).
- It is the only way to avoid the poisoned-observer failure above: a fresh
  database has zero regtest invoices, and `observation_targets()` returning
  empty short-circuits before any Electrum call (`server.rs:594-597`).
- Rollback becomes one variable per stack, with the regtest service never
  having been touched.
- The claim is immutable per creator (`bitkit_claim.rs:69-74`), so sellers
  must re-claim with a mainnet xpub regardless. A separate database makes
  that a clean re-onboarding instead of an `AccountMismatch` wall.

Cost accepted: sellers re-claim; the two services do not share invoice
history; two Postgres instances instead of one.

### Chain data source

Three options, honestly costed.

**Option 1 — run mainnet bitcoind + Fulcrum on Railway.** This is what the
regtest stack does today (`README.md:76`, `:98`). On mainnet it is not a
this-week option. A Fulcrum index requires a **non-pruned** node: the current
mainnet chain is comfortably over 700 GB of block data, and Fulcrum's own
index adds roughly another 100 GB. Initial block download plus indexing on a
shared-vCPU container is a multi-day-to-multi-week job, and it must be
re-done from scratch if the volume is lost. Railway's per-volume size ceiling
is **UNVERIFIED** here, but the storage figure alone makes this a project,
not a step. Rejected for this switch; retained as the sovereign-infrastructure
option to schedule separately.

**Option 2 — point `PAYKIT_ELECTRUM_ENDPOINT` at `ssl://bitkit.to:9999`.**
This is Synonym's own mainnet electrs: the exact server both Bitkit mainnet
builds use (`bitkit-android/…/Env.kt:285`; `bitkit-ios/…/Env.swift:184`).
`ssl://` is accepted by the adapter's scheme check (`observer.rs:61`) and TLS
is compiled in (`paykit-server-fork/Cargo.toml:18`, `use-rustls-ring`).
**Recommended.** It keeps the trust domain identical to the wallet the
product already tells users to install, so it adds no new third party.

**Option 3 — a public Electrum with SSL** (e.g.
`ssl://electrum.blockstream.info:50002`, the mainnet sibling of the testnet
host already in the wallets at `Env.kt:293`). Works, but introduces an
unrelated operator with no relationship, no SLA, and aggressive rate limits.
Documented as the **failover** value in the runbook, not the default.

Whichever is chosen, `[electrum] poll_interval` must be raised from `1s`
(`entrypoint.sh:154`). Every tick opens a **new** Electrum connection
(`observer.rs:91-102`, called per `observations()` at `:111`) and issues one
`blockchain.scripthash.get_history` plus one `blockchain.transaction.get` per
transaction in the address's history. For the proof address in §D that is 176
transaction fetches per tick. At 1 s that is a sustained ~176 requests/second
against a third party. **Set `[electrum] poll_interval = "30s"` before any
mainnet endpoint is configured.**

### Address trust: what the watcher can and cannot detect

A dishonest or compromised Electrum server supplies four things the observer
consumes: the address history, the transaction bytes, the block headers, and
the merkle proofs. The only cross-check bdk performs is that a merkle proof
reconstructs the merkle root of a header **the same server supplied**
(`bdk_electrum_client.rs:527-551`). There is no proof-of-work validation and
no header-chain continuity check beyond a single agreement point at the
genesis block (`bdk_electrum_client.rs:608-657`, driven from the genesis
checkpoint at `observer.rs:136-139`).

It **can**:

- Fabricate a confirmed payment and drive an unpaid order to `paid`. The loss
  falls on the **seller**, who ships against money that never arrived. The
  marketplace holds no funds, so there is no operator loss and no buyer loss.
- Withhold: report empty history so real payments never confirm and orders
  expire at the hold window. `/health` will still report Electrum available,
  because an empty history is a well-formed answer.
- Head-of-line the entire deployment: all non-final invoices go into one
  batch per tick (`server.rs:587-607`), and one malformed observation fails
  the whole batch (`observer.rs:259-322`). One poisoned row stops confirmation
  for every seller.

It **cannot**:

- Steal or move funds. The rail is watch-only end to end: paykit-server
  persists an account **xpub** and nothing else (`manual_claim.rs:288-295`),
  derives with `Secp256k1::verification_only()` (`create_invoice.rs:276`), and
  contains no Bitcoin signing path. The ed25519 keys in this system
  (`PAYKIT_MASTER_KEY`, `PAYKIT_REQUEST_SIGNING_KEY`, `LOCKS_KEYPAIR_SEED`)
  authenticate requests and seal records; none of them can produce a Bitcoin
  signature.
- Redirect payment. The watched address is derived server-side from the
  seller's own claimed xpub and committed with a lookup hash before any
  observation is accepted (`invoices.rs:880-897`, re-verified on every read at
  `:269-284`).
- Confirm on the wrong chain. Pointing a mainnet-configured server at a
  regtest or testnet Electrum fails the genesis agreement and surfaces as
  `ObserverError::WrongNetwork` (`observer.rs:226-233`), so a
  wrong-endpoint misconfiguration fails closed rather than confirming garbage.

It also cannot be corrected after the fact for a **reorg**. paykit-server
keeps watching between 1 and 6 confirmations and would observe a
disappearance (`observer.rs:208-221`), but marketplace-service confirms at the
**first** confirmation and has no un-confirm edge — `apply_confirmed_paykit_payment`
only acts on `awaiting_entitlement` (`workers.rs:823-826`). A 1-block reorg
that drops the payment leaves the order `paid`. State this plainly to the
owner; do not describe 1-conf as reorg-safe.

**Two independent servers: not for this switch.** The config carries exactly
one endpoint string (`entrypoint.sh:152-153`), and `ElectrumPort` is a
single-source trait (`observer.rs:28-33`); corroboration would be new code in
the fork, plus an agreement policy, plus a disagreement escalation path — a
wave of its own, and it must be audited. For a non-custodial rail where the
Electrum is first-party Synonym infrastructure (the same trust the wallet
already extends), one server is proportionate. If the owner wants more
assurance now, the cheap lever is raising the confirmation floor, not adding
a second server. Recorded as the next hardening step in §G.

### The claim and status contract the client consumes (W1.13 r3)

paykit-server's accounts API (its `docs/accounts-api.md`) fixes the two
contracts the Shop client verifies against. The claim POST declares its
channel explicitly — the paste path sends `claim_channel: "manual"`; the
server admits only `manual` and `bitkit_watch_only_v1` (anything else is a
422 `unknown_claim_channel`), reserves and refuses `pasted_auto` (422
`allocation_mode_not_enabled`), and treats a missing channel as `manual`. The
claim response echoes `creator` (which the client refuses unless it is
exactly the seller the flow was begun for) and carries, beside the W1.3
fields, `allocation_mode`, the nullable `claim_channel` and
`downgrade_reason`, and the derivation coordinates `account_index`,
`first_child_index`, `next_child_index`, `key_fingerprint`, and
`first_derived_address` — the address derived at (`account_index`,
`first_child_index`). At claim time `first_child_index == next_child_index`,
and the client refuses a claim response where they differ.

The owner-authenticated status read
(`GET /v0/accounts/{creator}/status`, bearer AuthToken) answers 200 with:

```json
{
  "creator": "…",
  "allocation_mode": "shared_manual",
  "claim_channel": "manual",
  "downgrade_reason": null,
  "key_fingerprint": "16 hex",
  "first_derived_address": "bc1q…",
  "account_index": 1,
  "first_child_index": 0,
  "next_child_index": 3,
  "evidence": []
}
```

`first_derived_address` is stable forever — derived at the immutable
`first_child_index` — so the client re-derives and compares at THAT index,
never at `next_child_index`: the cursor moves as invoices are allocated and
is informational only. With a local account key the status read must agree
with it on `key_fingerprint`, `account_index`, and the re-derived
`first_derived_address`, or the client refuses and records nothing.

The bearer is the same capability-scoped Pubky AuthToken the claim POST
sends. Server-side `verify_claim_token` makes it **single-use by claimed-key
uniqueness** — once the key is claimed, the token is spent — but it is **NOT
time-bounded**: there is no expiry check (W1.3/W1.13 audits), so a captured
token replays until the key is claimed. Treat it as a bearer secret in
transit. Accordingly the client does not rely on expiry: it requests a fresh
Ring approval for every status read, never stores or reuses a token, and
treats the approval ceremony itself as the proof that THIS session and THIS
identity stand behind the read.

Finally, `paykitServerOrigin()` refuses any non-HTTPS paykit origin except
loopback before a token is built or a byte is sent (true since W1.8/W1.8b) —
the shared predicate documented in [`../environment.md`](../environment.md)
under `PUBKY_RUNTIME_PAYKIT_SETUP_URL`.

---

## C. Per-layer switch table

Order of operations is the numbered column. Nothing in steps 1–8 touches
production.

| # | Layer | Exact change | Rollback | Blast radius if wrong |
| --- | --- | --- | --- | --- |
| 1 | Rails repo: network selection | `pubky-payment-rails/paykit-server/entrypoint.sh:150` — make the literal configurable: `network = "${PAYKIT_BITCOIN_NETWORK:-regtest}"`, validated against `mainnet\|testnet\|signet\|regtest` in the entrypoint and failing closed on anything else. Default stays `regtest`, so the existing service is unchanged by the commit. Update the header comment at `:14-16`. | `git revert`; the existing service is unaffected either way because the default is unchanged. | Low while the default holds. If the validation is omitted, a typo'd value reaches `BitcoinNetwork::parse` and the server refuses to boot (`config.rs:61`, error text at `:535`) — fails closed. |
| 2 | Rails repo: poll cadence | `entrypoint.sh:154` — `poll_interval = "${PAYKIT_ELECTRUM_POLL_INTERVAL:-1s}"`; the mainnet service sets `30s`. | Revert the variable. | High if skipped: ~176 req/s against a third-party Electrum, likely a ban that silently stops all confirmation. |
| 3 | Dockerfile | **No change.** The endpoint identifier is already network-derived (`create_invoice.rs:163-173`) and the fail-closed grep at `Dockerfile:57` still matches on mainnet. The mainnet identifier per the paykit payment-endpoint-identifier spec is `btc-bitcoin-p2wpkh` (`create_invoice.rs:166`), with asset string `"btc"` (`:213`) and the `{"value": address}` payload convention (`:241`) unchanged. | n/a | n/a. Recording this because the survey asked for a patch removal that does not exist. |
| 4 | New Postgres | Railway project `pubky-marketplace-staging` (`c991d768-4a3c-42ea-b5ed-eaa22d4916ed`): add service `paykit-mainnet-postgres`. Empty. Never share the regtest `paykit-postgres`. | Delete the service. | **Critical if wrong.** Reusing the regtest database gives the mainnet observer `bcrt1…` targets and permanently breaks observation for every seller (`observer.rs:236-241` → whole-batch `WrongNetwork`). |
| 5 | New service | Same project: add `paykit-server-mainnet` from `pubky-payment-rails`, root `paykit-server`. Variables: `PAYKIT_BITCOIN_NETWORK=mainnet`; `PAYKIT_ELECTRUM_ENDPOINT=ssl://bitkit.to:9999`; `PAYKIT_ELECTRUM_POLL_INTERVAL=30s`; `PAYKIT_DATABASE_URL` → the new Postgres; **fresh** `PAYKIT_MASTER_KEY`; `PAYKIT_TRUSTED_LOCKS_PUBLIC_KEY` = the same `LOCKS_PUBLIC_KEY`; `PAYKIT_SETUP_ALLOWED_ORIGINS` = staging Shop origin only, at first; `MARKETPLACE_TRUSTED_PUBLIC_KEYS` = staging + production marketplace-service signing pubkeys (57-char `pubky…` form; the entrypoint validates and fails closed — `entrypoint.sh:33-49`, `:81-84`). | `railway down` the service; nothing else references it yet. | Medium. A wrong `MARKETPLACE_TRUSTED_PUBLIC_KEYS` value fails the entrypoint before boot. A wrong `PAYKIT_TRUSTED_LOCKS_PUBLIC_KEY` is inert on this path (the marketplace route uses the marketplace keys) but must still match for coherence. |
| 6 | Boot verification | `railway logs -s paykit-server-mainnet` shows `starting paykit-server (… electrum ssl://bitkit.to:9999)` (`entrypoint.sh:163`). `GET /health` returns Electrum available with zero invoices (the loop short-circuits on an empty target set — `server.rs:594-597`). Confirm **no** Electrum traffic yet. | n/a | Low. |
| 7 | Client validator (both stacks, behind a per-stack flag) | `mp-oneauth/src/libs/commerce/payment-methods.ts:84-93`: make `isPlausibleAccountXpub` network-aware. On a mainnet stack accept `xpub` and `zpub`, reject `vpub`/`tpub` with a named reason; on a regtest/testnet stack accept `tpub`/`vpub`, reject `xpub`/`zpub`. Convert `zpub`→`xpub` (SLIP-132 version-byte rewrite, same key material) before POSTing, because paykit-server's parser rejects `04B24746` (`bip32.rs:791-803`). Source the network from a new `PUBKY_RUNTIME_BITCOIN_NETWORK` runtime var (`runtime-config.schema.ts`), not from `PUBKY_RUNTIME_ENV`. **Today this is not per-stack in any sense** — one prefix/length/charset check with no network input. | Revert the commit; the validator is client-side only and the server remains authoritative. | Medium. Too permissive ⇒ sellers hit an opaque `invalid_xpub` (today's behaviour). Too strict ⇒ legitimate sellers blocked. Never loosen the server. |
| 8 | Client: first-address preview + confirmation gate | New: after a successful claim, derive `m/84'/0'/0'/0/0` **in the browser** from the pasted key (watch-only, no new server route — `GET /v0/accounts/{creator}` returns only `{claimed}`, `http/accounts.rs:226`) and show it with an irreversibility warning. `bitcoinEnabled` cannot be switched on until the seller confirms they found that address in their own wallet. Also surface the `account_index: 0` limitation (`marketplace-paykit-claim.ts:122`) instead of failing silently for account-1+ wallets. | Revert; falls back to today's blind claim. | High if skipped — see §E, "Seller pastes a valid but wrong xpub". |
| 9 | **Staging cutover** | Railway `marketplace-service` in `pubky-marketplace-staging`: `PAYKIT_SERVER_URL=http://paykit-server-mainnet.railway.internal:3001`, then `railway redeploy -s marketplace-service` (variable changes alone do not restart paykit-server — `HANDOFF.md`, Known Decisions). Vercel `pubky-marketplace-staging`: `PUBKY_RUNTIME_PAYKIT_SETUP_URL` → the mainnet service's public **`https://`** URL (the client refuses any non-HTTPS paykit origin beyond loopback — `marketplace-paykit-claim.ts`, `paykit_origin_insecure`); redeploy. | Set both back to the regtest service URLs and redeploy. Two variables, two redeploys, no data migration. | Medium. Staging sellers must re-claim; staging orders in flight against the regtest service stall and expire at the hold window (3600 s). Announce before, not after. |
| 10 | Hold window and confirmation floor | Leave `FIAT_PAYMENT_WINDOW_SECONDS` unset (3600 s default, `config.rs:127-130`) — it is the bitcoin window, not `LOCKS_PAYMENT_WINDOW_SECONDS`. Leave `LOCKS_PAYKIT_MIN_CONFIRMATIONS` alone; **it does not affect this path** (correction #2). If the owner wants more than 1 confirmation for marketplace orders, that is a code change in `invoices.rs:702-707` plus a status-contract change, not a variable. | n/a | Low if left alone; the danger is believing a variable did something it did not. |
| 11 | Rails README policy | Replace `README.md:12-13` with: "This repo deploys **two** Bitcoin networks side by side: a regtest stack for development, and a mainnet stack for the live marketplace rail. The mainnet stack is **watch-only**: no component in this repository may ever hold a Bitcoin private key, seed, mnemonic, or a descriptor containing private material. paykit-server persists account xpubs and derives with `Secp256k1::verification_only()`; it cannot sign or spend, and any change that gives it the ability to must be refused. A mainnet service may only be configured with a first-party Electrum endpoint; pointing one at a third-party server, or sharing a database between networks, requires owner sign-off and a Kimi audit." | Revert. | Low mechanically, high as governance. The replacement must name the invariant that still holds (watch-only), or the reversal reads as "no rules". |
| 12 | Docs | `pubky-payment-rails/README.md` (env sections, `:121` and `:134`, plus the pinned-revisions table); `pubky-payment-rails/docs/wallet-leg.md` (the Electrum override at `:37-40` becomes network-specific); `mp-oneauth/docs/ecommerce/status.md:7` and `:150` ("Could this take real money today?" now answers **yes**, with the review status stated honestly); `runbook-production.md` gains a "Bitcoin rail rollback" section (step 9 in reverse) and the Electrum failover value from §B option 3; `HANDOFF.md` ("Money rails remain test networks; this is not a real-money launch." and "Known Decisions From 2026-09-05": production launch uses testnet money rails). | Revert. | Low mechanically. High if skipped: the runbook is what an operator reads at 3 a.m. |
| 13 | **Production cutover** — owner sign-off gate | Only after §D PASS and both FAIL calibrations on staging, and after the Kimi audit returns SHIP. Then: add the production Shop origin to `PAYKIT_SETUP_ALLOWED_ORIGINS`; set `PAYKIT_SERVER_URL=https://paykit-server-mainnet-<host>.up.railway.app` on production `marketplace-service` (project `75faa4fe-466c-4277-977f-1d8e4e31df8c`) and redeploy; set `PUBKY_RUNTIME_PAYKIT_SETUP_URL` to the mainnet service's public **`https://`** URL on Vercel `pubky-marketplace-production` and redeploy. | Both variables back to the regtest service, redeploy both. Independently, the existing kill switch stands: `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable` on `pubky-marketplace-production` (`runbook-production.md`, "Flip Production To Unavailable"). | **Highest.** Real funds from this point. Every production seller must re-claim before they can be paid; a seller who does not re-claim shows Bitcoin unavailable rather than losing money (`payment_methods.rs:570-585` refuses the bind). |
| 14 | Bitkit | **No wallet-side change.** Users already hold mainnet Bitkit; the mainnet build already uses `ssl://bitkit.to:9999` (`Env.kt:285`, `Env.swift:184`) and already accepts the `btc-bitcoin-p2wpkh` identifier the mainnet server will advertise. The regtest Electrum override documented at `docs/wallet-leg.md:37-40` applies to debug builds only. Confirmed by reading both Env files; no code change proposed. | n/a | n/a. |
| 15 | `SANDBOX_PAYMENTS_ENABLED` interplay | **Leave staging at `true`.** `payment.sandbox_advance` cannot bypass the watcher for a bitcoin order: it refuses any payment whose `adapter != "sandbox"` (`handlers/payment.rs:60-65`), and binding Bitcoin sets the adapter to `paykit` (`payment_methods.rs:593`, `:675-681`). The residual risk is different — a buyer could sandbox-advance **before** binding a rail, while the adapter is still the default `sandbox`. The §D harness therefore asserts `payment.adapter == 'paykit'` immediately after the bind and before any status assertion. Second-order effect: `SANDBOX_PAYMENTS_ENABLED=true` disables local pickup entirely on staging (`lib.rs:76`, `handlers/pickup.rs:70`), so the proof runs a **shipping** listing. | n/a | Low, given the adapter gate. Worth a one-line note in the runbook because the flag's name suggests more reach than it has. |

---

## D. The payment-journey proof

The owner's gate. One harness drives the real journey; the only simulated
element is that the "payment" is pre-existing mainnet history rather than a
transaction broadcast during the run.

### The four questions, answered from code

**Does the watcher count outputs received before the payment request was
created?** Yes. The sync request is built with a genesis chain tip and the
address's script (`observer.rs:136-154`), and bdk resolves that by calling
`batch_script_get_history` and fetching **every** transaction it returns
(`bdk_electrum_client.rs:290-292`, `:316-318`). There is no height floor, no
timestamp floor, and no comparison against the invoice's creation time
anywhere in `apply_bitcoin_observation_in_tx` (`invoices.rs:520-713`).

**Does it count outputs that were later spent?** Yes. For each transaction the
observer enumerates `transaction.output` and matches by `script_pubkey`
(`observer.rs:190-206`). It never consults the UTXO set. A fully-spent output
is still a matching output.

**Exact amount or ≥?** Greater-or-equal: `amount_matched = present &&
observed_sats >= required` (`invoices.rs:694`). Consequently the binding lands
on the **first output, by ascending canonical txid then vout** (the batch sort
at `observer.rs:315-321`), whose value is ≥ the required amount — and then
freezes, because `DirectBinding::is_final` is true once `sats >= required` and
`confirmations >= 6` (`bitcoin.rs:152-154`), which makes every later
observation `Ignore` (`bitcoin.rs:184-195`).

**Which index does it derive for a fresh claim, and how does the harness
control it?** Index 0. `creators.next_child_index` defaults to 0
(`migrations/0001_initial.sql`), the first payment request derives
`for_child_index(creator.next_child_index)` (`invoices.rs:795-797`), and the
counter increments by one per **new (reader, bundle) assignment**
(`invoices.rs:822-829`). An existing (creator, reader, bundle) triple replays
its stored assignment and never re-derives (`invoices.rs:746-784`, `:786-793`).
The harness controls the index simply by using a **fresh seller identity per
run** against the empty mainnet database, which puts the first order at 0/0.

**No back-dating flag is needed.** The survey's fallback ("propose a
harness-only flag that back-dates the request window") is unnecessary: the
watcher already accepts pre-existing history, so the least-invasive
implementation is *no product change at all*. This is the strongest possible
answer, because it means the proof exercises production code paths unmodified.

### The account and the address (verified against a public Esplora, read-only)

Seller claims the public BIP84 test-vector account. paykit-server rejects the
`zpub` form outright (`bip32.rs:791-803`), so the harness submits the
xpub-version encoding of the same key:

| Field | Value |
| --- | --- |
| Published test vector (zpub, **not accepted**) | `zpub6rFR7y4Q2AijBEqTUquhVz398htDFrtymD9xYYfG1m4wAcvPhXNfE3EfH1r1ADqtfSdVCToUG868RvUUkgDKf31mGDtKsAYz2oz2AGutZYs` |
| Same key, xpub version bytes (**submit this**) | `xpub6CatWdiZiodmUeTDp8LT5or8nmbKNcuyvz7WyksVFkKB4RHwCD3XyuvPEbvqAQY3rAPshWcMLoP2fMFMKHPJ4ZeZXYVUhLv1VMrjPC7PW6V` |
| Depth / child number | 3 / `0'` — satisfies `xpub.depth != 3` and the hardened-index check at `create_invoice.rs:263-270` with `account_index = 0` |
| Derived `0/0` | `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu` |
| History (blockstream.info Esplora, 2026-09-09) | 176 transactions; **88 received outputs** totalling 4,082,661 sats; `spent_txo_count: 88` — every one already spent, current balance 0 |
| Received amounts | min 354 sats, max **2,243,167 sats** |
| Derived `0/1` | `bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g` — **also funded** (4 outputs, 101,720 sats, max 74,486). Do not use it as the "unfunded index" calibration. |

The all-spent property is not a problem — it is the point. It proves the
"already spent still counts" answer above with live data rather than by
reading code alone.

### Price the listing so the bound outpoint is deterministic

Because the predicate is ≥, a small price matches many outputs and the bound
outpoint depends on txid ordering. Price the listing at **exactly 2,243,167
sats** — the single largest historical output. Then exactly one output in the
entire history satisfies the predicate, and the harness can assert the precise
outpoint:

```
txid 8a9cc9253407b3f5842a3a7bd1308f9ae84a79c51126af48abe5ec16284c8cdf
vout 6
value 2,243,167 sats
height 882,346
```

(For reference, if a cheaper price is preferred later: required 354 sats binds
`01c0396f947ddc12680c52371b4b2ce6a1e1b689f4ac55ab31b6f2a1ce4dcdaf:14`, and
required 289,339 sats binds
`294624743507f966dda4288eb14d75bb1f5a84a1b9fa04361d39c7c42cd02f7a:31`. All
three were computed from the full Esplora history, ordered exactly as
`observer.rs:315-321` orders it.)

The listing must be `{currency: "BTC", exponent: 8}` with `total_minor` in
sats, or the bind is refused with `currency_unsupported`
(`payment_methods.rs:435-446`).

### Harness shape

Runs against the **staging** stack only, against `paykit-server-mainnet`.
Both identities are throwaway; neither is a real seller or a real buyer.

1. **Seller identity** — fresh Pubky keypair on the staging homeserver.
2. **Seller claims the account.** Drive the same API the UI calls:
   `POST /v0/accounts/claim` with a capability-scoped AuthToken carrying
   exactly `/pub/paykit/v0/bitkit/server/:rw,/pub/paykit/v0/private/bitkit/server/:rw`
   (`marketplace-paykit-claim.ts:14`; the server compares the string exactly at
   `manual_claim.rs:207-209`), `account_xpub` = the xpub form above,
   `account_index: 0`. Assert `{status: "claimed"}`.
   Assert `GET /v0/accounts/pubky<seller>` returns `{claimed: true}`.
3. **Seller enables Bitcoin and publishes a listing** through the normal Shop
   path: `bitcoinEnabled` on the payment config, a shipping-fulfilment listing
   priced at 2,243,167 sats. (Shipping, not pickup — pickup is off while
   `SANDBOX_PAYMENTS_ENABLED=true`, `lib.rs:76`.)
4. **Buyer identity** — fresh keypair, and it **must publish a Paykit receiver
   marker** or `MarkerDiscovery` finds nothing and the payment request is
   refused (`create_payment_request.rs:157-163`). Use
   `node pubky-payment-rails/verify/driver.mjs reader-marker` (`driver.mjs:16`)
   or `paykit-reader-demo` (installed by `Dockerfile:81`). **Never a
   funded Bitkit** — see §E.
5. **Buyer checks out and binds Bitcoin.** `POST /v0/orders/{id}/payment-method`
   with `bitcoin`. Assert HTTP success, and immediately assert
   `payments.adapter == 'paykit'` and `orders.paykit_request_state == 'pending'`
   (`payment_methods.rs:657-681`).
6. **Assert the derived address** by re-deriving `0/0` from the xpub locally
   and comparing against what the buyer's reader received in the Payment
   Request payload (`{"value": "bc1qcr8te…"}`, `create_invoice.rs:241`), and
   assert the advertised endpoint identifier is `btc-bitcoin-p2wpkh`
   (`create_invoice.rs:166`). This is the leg that proves mainnet, not
   regtest.
7. **Wait for the watcher.** Poll `GET /v0/orders/{id}` until the order is
   `paid`. Bound the wait at 5 minutes: one 30 s Electrum tick plus one
   `PAYKIT_POLL_SECONDS` marketplace tick, with generous slack for the 176-tx
   history scan.
8. **Assert both UIs.** Buyer order view shows paid with a receipt; seller
   order view shows the order as paid and actionable. Screenshot both; the
   parent opens the screenshots rather than accepting a claim.

### PASS criteria

All of these, or it is not a pass:

- Order state `paid`, payment state `confirmed` — never `manual_review`.
- A durable receipt exists on the order.
- paykit `POST /transactions/status` for the order reference returns
  `{status: "confirmed", amount_matched: true, confirmations: 6}` — 6 because
  a matched output caps at 6 (`invoices.rs:695-697`), not because it has 6
  confirmations.
- The address the buyer's reader received equals the locally derived
  `bc1qcr8te4kr609gcawutmrza0j4xv80jy8z306fyu`, and the endpoint identifier is
  `btc-bitcoin-p2wpkh`.
- `payments.adapter == 'paykit'` throughout, so no sandbox command touched it.
- Buyer UI and seller UI both render paid, evidenced by screenshots the parent
  has opened.

### Two deliberate FAIL calibrations — both must fail before any PASS is trusted

**FAIL-1 — amount mismatch routes to `manual_review`.** Identical run, one
change: price the listing at **2,243,168 sats**, one satoshi above the largest
historical output. No output satisfies `>=`, so every observation carries
`amount_matched = false`, status is still `confirmed` with the true (uncapped)
confirmation count (`invoices.rs:694-707`), and marketplace-service routes the
payment to `manual_review` and emits `payment.manual_review`
(`workers.rs:827-859`). Expected: order **not** `paid`, payment
`manual_review`. A one-satoshi delta isolates exactly the amount predicate and
nothing else.

**FAIL-2 — unfunded index stays awaiting.** A second fresh seller identity
claims a **freshly generated** mainnet BIP84 account xpub (throwaway seed,
never published, never reused) whose `0/0` address has no history at all.
Expected: `blockchain.scripthash.get_history` returns empty, no observation is
ever written, paykit reports `undetected`, marketplace-service takes the
no-op branch (`workers.rs:1002-1005`), and the payment remains
`awaiting_entitlement` until `FIAT_PAYMENT_WINDOW_SECONDS` expires. Assert
after at least three poll cycles. **Do not** use index 1 of the test-vector
account for this — it is funded (verified above).

Both calibrations must be observed failing, in that order, before the PASS run
is recorded. An auto-scored PASS with no failing calibration is a harness
suspect, not evidence.

### What this proof does and does not demonstrate

**Demonstrates:** mainnet address derivation from a seller-claimed account
xpub; the mainnet endpoint identifier and payload shape a real wallet will
accept; private Payment Request delivery to a buyer's Paykit receiver;
mainnet Electrum connectivity, chain agreement, history retrieval, merkle
anchoring and confirmation counting against a real chain; the marketplace
worker's confirm-exactly-once transition, receipt issuance and inventory
conversion; the amount predicate and the `manual_review` route; both UIs; and
that the sandbox command cannot touch a bitcoin-bound payment.

**Does not demonstrate:** that a real buyer's wallet can construct, sign and
broadcast a payment to the derived address (no transaction is created during
the run — the wallet's send leg is the one thing left unproven); that a
0-conf → 1-conf transition is observed live (the bound output already has
~40,000 confirmations, so `detected` is skipped entirely and the invoice goes
straight to `confirmed`); mempool or fee behaviour; reorg handling; the
seller's ability to actually **spend** what arrives (the test-vector spending
key is public and its funds are long gone); or that the Electrum endpoint is
honest — it demonstrates only that the pipeline believes it.

The 0-conf gap is worth naming to the owner: `orders.paykit_request_state =
'detected'` is real code (`workers.rs:986-997`) that this proof never
executes. Closing it needs an actual unconfirmed transaction, which needs real
bitcoin.

---

## E. Self-attack table

| Attack | Precondition | Result | Mitigation |
| --- | --- | --- | --- |
| Unpaid order marked paid — replayed or fabricated history | Attacker induces the seller to claim an xpub whose addresses already have history matching the price | **Succeeds.** The watcher has no height floor (`invoices.rs:520-713`) and no link between an observation and the invoice's creation time. This is precisely the mechanism §D uses deliberately. | Structural, not preventable in this architecture without an invoice-creation height floor. Bounded by who bears the loss: the **seller** is the only party exposed, and the seller chose the xpub. The client-side first-address preview (§C.8) is what stops an honest seller from being socially engineered into a pre-funded key. Recommend adding an invoice-creation block-height floor to the fork as post-launch hardening (§G). |
| Unpaid order marked paid — malicious or compromised Electrum | Control of `PAYKIT_ELECTRUM_ENDPOINT`'s host, or a MITM on the TLS session | **Succeeds.** Merkle proofs are validated only against headers the same server supplied, with no proof-of-work check (`bdk_electrum_client.rs:527-551`). | First-party endpoint (`ssl://bitkit.to:9999`), so this collapses into "compromised Synonym infrastructure" — the same trust the Bitkit wallet already extends. TLS via `use-rustls-ring` (`Cargo.toml:18`) blocks the network MITM. Wrong-chain misconfiguration fails closed at genesis agreement (`observer.rs:226-233`). Two-server corroboration is the real fix and is deferred with a stated cost (§B, §G). |
| Reorg after confirmation | 1-block reorg drops the payment tx after the order is `paid` | **Not handled.** paykit-server keeps watching to 6 confirmations and would see the disappearance (`observer.rs:208-221`), but marketplace-service confirms at 1 and has no un-confirm edge (`workers.rs:823-826`). Order stays `paid`. | Stated as a known limitation, not papered over. Mitigations if the owner wants them: raise the confirmation floor (code change at `invoices.rs:702-707`), or add a disappearance-driven `manual_review` edge. Both are code, not config. Recommend disclosure + the seller-side "wait for more confirmations before shipping" guidance in the seller UI copy. |
| Amount mismatch — underpayment | Buyer sends less than the price | Payment routes to `manual_review`, order never `paid`, inventory hold retained until the window elapses; `manual_review` payments are deliberately never swept (`workers.rs:1050-1052`). | Already correct. Proven by FAIL-1. |
| Amount mismatch — overpayment | Buyer sends more than the price | Confirms as matched (`invoices.rs:694`); the surplus goes to the seller's address and is the seller's. | Correct behaviour for a non-custodial rail (the marketplace cannot refund what it never held), but the buyer-facing copy must say the amount is exact and overpayment is not refunded by the marketplace. Copy change, not code. |
| Partial payment across two transactions | Buyer sends the price in two outputs to the same address | **Never confirms.** The binding is a single output, and `action_for_values` replaces rather than sums (`bitcoin.rs:176-195`). Both outputs are individually short, so the invoice stays `detected`/unmatched. | Correct (no accidental confirmation), but a silent stall for the buyer. Buyer copy must say "pay the full amount in one transaction". |
| Address reuse across two checkouts | Same buyer buys twice from the same seller, or two buyers buy from one seller | **Does not happen.** The reader assignment is keyed on (creator, reader, bundle) and a new triple always allocates a fresh `next_child_index` (`invoices.rs:786-829`); an existing triple replays and never re-derives (`:746-784`). | Already correct. The harness should still assert it: a second order for the same seller must derive `0/1` (`bc1qnjg0jd8228aq7egyzacy8cys3knf9xvrerkf9g`), which — being funded with max 74,486 sats — gives a free second confirmation path at a low price. Note this is a *harness* convenience, not a product property. |
| Seller pastes a valid but **wrong** xpub | Seller pastes an old wallet's key, a colleague's key, or an example from a blog | **Funds are lost, irreversibly.** Base58check catches typos (a mistyped key fails the checksum and returns `invalid_xpub`), but it cannot catch a well-formed key the seller does not control. The claim is then immutable per creator (`bitkit_claim.rs:69-74`), so it cannot be corrected without operator DB surgery. | §C.8 is the mitigation and it is load-bearing: derive `m/84'/0'/0'/0/0` in the browser, show it, and refuse to enable `bitcoinEnabled` until the seller confirms the address appears in their own wallet's receive list. Copy must say irreversible and unrecoverable in those words. Additionally: surface the immutability *before* the claim, not after, and surface the `account_index: 0` limitation (`marketplace-paykit-claim.ts:122`). |
| Key or secret exposure anywhere on this path | Operator DB read, log capture, or a compromised paykit-server | **No Bitcoin private key exists anywhere in this path.** paykit-server stores an account xpub (`manual_claim.rs:288-295`) and derives with `Secp256k1::verification_only()` (`create_invoice.rs:276`). Addresses, outpoints and amounts are redacted in every `Debug` impl (`bitcoin.rs:33-40`, `:64-71`, `:87-99`, `:126-135`) and sealed at rest under `PAYKIT_MASTER_KEY` (`invoices.rs:660-671`, `:873-879`). The ed25519 keys present authenticate requests and seal records; none can sign a Bitcoin transaction. A full compromise buys an attacker the ability to lie about payments (marking orders paid) and to read seller xpubs — a privacy loss, since an xpub reveals a seller's entire receive history and future addresses. | Confirm and document "the rail is watch-only" as a repo invariant (§C.11). The xpub-privacy consequence should be stated in the seller-facing copy: an xpub given to any service exposes that account's whole history to it. |
| Staging/production Electrum confusion | An operator sets a regtest or testnet Electrum on the mainnet service, or vice versa | **Fails closed.** Genesis agreement fails and every batch errors as `WrongNetwork` (`observer.rs:226-233`), so nothing confirms; `/health` reports Electrum unavailable (`server.rs:598-607`). Nothing is falsely confirmed. | Already safe. Add the check to the runbook's post-deploy verification: read the boot line at `entrypoint.sh:163` and confirm the endpoint. Never share a database between networks (§C.4) — that failure mode is silent and total. |
| The test-vector xpub reaches a real listing | Harness leaks into production, or a seller copies the xpub from this document | **Catastrophic and irreversible.** The mnemonic behind this account is public (`abandon abandon … about`); anyone can sweep any payment sent to it within seconds. | Four gates: (1) the harness hard-refuses to run unless the target host equals the staging Shop origin **and** `PUBKY_RUNTIME_ENV == 'staging'`, asserted before any write; (2) the harness generates a fresh seller identity per run and never accepts one as input; (3) the client validator (§C.7) ships a **deny-list** containing this exact xpub and its zpub form, refusing the claim with "this is a public test key — anyone can spend from it"; (4) the same deny-list is added to the paykit-server fork's `validate_claimed_account` so it is enforced server-side too, on mainnet only. Gates 3 and 4 are the ones that survive the harness being deleted. |
| Harness residue keeps hammering a third-party Electrum | A FAIL-1 invoice is left in the mainnet database | **Permanent load.** A never-matched invoice never becomes final, so it never leaves `observation_targets()` (`invoices.rs:249-250`) and re-scans all 176 transactions on every tick, forever. | Harness cleanup is mandatory and asserted: after each calibration, delete the invoice, reader-assignment and creator rows for the throwaway identities from `paykit-mainnet-postgres`, then assert `observation_targets()` is empty (equivalently, that the service makes no Electrum calls). Document the query in the runbook. The 30 s poll interval (§C.2) bounds the damage in the meantime. |
| One poisoned row stops every seller | Any single invoice whose address fails to parse, or any transaction whose merkle proof fails validation | **Total confirmation outage.** All non-final invoices go in one batch; the first error fails the whole batch (`observer.rs:126-134`, `:259-322`) and nothing advances for anyone. | Not fixed by this switch. Monitor: alert on `/health` Electrum unavailable for more than two consecutive ticks. Recommend per-target error isolation in the fork as post-launch hardening (§G). |
| Buyer drives an order to paid with the sandbox command | Staging has `SANDBOX_PAYMENTS_ENABLED=true` | **Refused** once Bitcoin is bound: `advance` rejects any payment whose `adapter != "sandbox"` (`handlers/payment.rs:60-65`), and the bind sets `paykit` (`payment_methods.rs:593`, `:675-681`). Before the bind, the adapter is the default `sandbox` and the command would work. | The harness asserts `adapter == 'paykit'` right after the bind and before any status assertion, so a sandbox-advanced order cannot be mistaken for a watcher-confirmed one. Production has the flag `false` regardless (read live). |

---

## F. Sequencing and agent choreography

Six concurrent agents maximum; one agent per working tree. Kimi (OpenCode,
newest flagship `kimi-k*`) is the required external auditor for anything
touching the watcher, verification, xpub handling, or keys, and Kimi's SHIP is
the gate before production.

| Wave | Slice | Repo / tree | Tier | Depends on | Proof command → expected output |
| --- | --- | --- | --- | --- | --- |
| W0 | This design reviewed | — | deep reasoning (different family from the author) | — | Review verdict SHIP/FIX-FIRST recorded before any code |
| W1.1 | Entrypoint: `PAYKIT_BITCOIN_NETWORK` + `PAYKIT_ELECTRUM_POLL_INTERVAL`, validated, defaults unchanged | `pubky-payment-rails` | **Kimi** (network selection gates the watcher) | W0 | `sh paykit-server/tests/entrypoint_test.sh` → pass; plus `PAYKIT_ENTRYPOINT_RENDER_ONLY=1` (`entrypoint.sh:164-167`) with the mainnet vars → rendered TOML contains `network = "mainnet"` and `poll_interval = "30s"`; with a bogus network → non-zero exit |
| W1.2 | Client: network-aware validator, `zpub`→`xpub` conversion, test-vector deny-list, `PUBKY_RUNTIME_BITCOIN_NETWORK` | `mp-oneauth` worktree | implementation | W0 | `npm run test -- payment-methods` → new cases green: `zpub` converts, `vpub`/`tpub` rejected on mainnet, the test-vector key rejected by name |
| W1.3 | Client: first-derived-address preview + confirmation gate + immutability/account-index disclosure | separate `mp-*` worktree | implementation | W1.2 | Component tests green; VRT for the settings surface regenerated if a baseline exists (`MarketplaceGetPaidSettings`) |
| W1.4 | Fork: server-side mainnet deny-list in `validate_claimed_account` | `paykit-server-fork` | **Kimi** (xpub handling) | W0 | `cargo test -p paykit-server manual_claim` → new case: the test-vector xpub is refused on mainnet, accepted on none |
| W1.5 | Docs pass: rails README policy replacement, `wallet-leg.md`, `status.md`, `runbook-production.md` Bitcoin-rail section, `HANDOFF.md` | umbrella + `mp-oneauth` | mechanical | W0 | `git diff --stat` shows exactly the five files; the parent reads the replacement policy line |
| W2.1 | Railway: `paykit-mainnet-postgres` + `paykit-server-mainnet` | operator (parent) | parent-only | W1.1 merged | `railway logs -s paykit-server-mainnet` shows `electrum ssl://bitkit.to:9999`; `/health` Electrum available with an empty target set |
| W2.2 | Harness: claim → listing → checkout → bind → derive-assert → paid, plus both FAIL calibrations, plus cleanup | `mp-oneauth` worktree (`src/test/live/btc-mainnet-journey.live.ts`) | implementation | W2.1, W1.2 | FAIL-1 run → payment `manual_review`; FAIL-2 run → payment still `awaiting_entitlement` after 3 cycles; then PASS run → order `paid`, status `{confirmed, amount_matched: true, confirmations: 6}`, bound outpoint `8a9cc925…:6` |
| W3 | Kimi audit of the full diff | OpenCode, own `OPENCODE_DB` lane | **Kimi** | W1.*, W2.2 | Report contains an explicit `SHIP` or `FIX-FIRST`; exit 0 is not a report — grep the log for the verdict |
| W3b | Deep-reasoning review of the harness itself: does it prove what it claims | — | deep reasoning | W2.2 | Verdict recorded; parent opens the run's screenshots and re-runs one proof command |
| W4 | **Owner sign-off** | — | — | W3 SHIP + W3b SHIP + PASS and both FAILs observed | Owner says go, in writing, having read §D "does not demonstrate" |
| W5 | Production cutover (§C.13) | operator (parent) | parent-only | W4 | Production `/health` reachable; one real seller re-claims and their first derived address is confirmed in their own wallet before any listing is published |

Parent duties throughout, never delegated: commits, all remote git and
GitHub writes, secret handling, Railway and Vercel variable changes, plan
edits, and the owner conversation. Sub-agents never run `git push`,
`gh pr create`, or any remote write; every OpenCode prompt restates that
prohibition explicitly.

Verification the parent performs rather than accepts on claim: read the
rendered TOML from the render-only entrypoint run; read the paykit-server boot
line; open the harness screenshots for both UIs; run `git status --short` and
`git log -1` on every tree an agent touched; grep the Kimi log for the verdict
string.

---

## G. Open questions for the owner

1. **Second paykit-server, or flip the existing one?** Recommended default:
   **second service with a fresh database.** Flipping is cheaper by one
   service but makes "staging first" impossible, breaks every existing
   claim, and permanently breaks the observer on leftover regtest invoices
   (§C.4). If the owner insists on flipping, the regtest invoice rows must be
   deleted in the same operation and that must be scripted and reviewed.
2. **Electrum endpoint.** Recommended default: `ssl://bitkit.to:9999`
   (first-party, already the wallet's own). Alternative: a public server, at
   the cost of a new third party. Sovereign option (own bitcoind + Fulcrum)
   is weeks and hundreds of gigabytes; recommend scheduling it separately
   rather than blocking this week.
3. **Confirmation floor for marketplace orders.** Recommended default:
   **leave at 1** and disclose the reorg limitation in seller copy. Raising it
   is a code change in the fork (`invoices.rs:702-707`), not a variable —
   `LOCKS_PAYKIT_MIN_CONFIRMATIONS` does nothing here.
4. **Two-server Electrum corroboration.** Recommended default: **not now**;
   record as the first post-launch hardening item, with the honest note that
   until it exists, a compromised Electrum can mark an unpaid order paid and
   the seller carries that loss.
5. **Invoice-creation block-height floor.** Recommended default: **add it
   post-launch**, after the proof has used its absence. It would close the
   pre-existing-history attack in §E permanently, and it would also make this
   exact harness stop working — which is a good reason to run the proof first
   and land the floor second.
6. **Staging `SANDBOX_PAYMENTS_ENABLED`.** Recommended default: **leave
   `true`.** The adapter gate already blocks sandbox advancement of a
   bitcoin-bound payment. Setting it `false` would enable local pickup on
   staging as a side effect, changing more than intended.
7. **Seller re-onboarding.** Recommended default: an in-app banner for
   existing sellers with a Bitcoin claim, telling them the rail moved to
   mainnet and they must re-claim with a mainnet account xpub, plus the
   first-address confirmation step. Silent breakage is not acceptable here
   because the failure mode looks like "Bitcoin unavailable" with no reason.
8. **Independent security review.** `status.md:150` currently states that
   pointing at mainnet "would first require the independent security review".
   Recommended default: record that the owner has **waived** the pre-launch
   independent review in favour of the Kimi audit plus the §D proof, and say
   so in `status.md` in those words. Do not quietly delete the sentence.
9. **Per-stack paykit-server for production.** Recommended default: production
   and staging share `paykit-server-mainnet` at first (matching today's shared
   arrangement), with distinct `MARKETPLACE_TRUSTED_PUBLIC_KEYS` entries per
   stack so signing keys stay separable. A fully separate production rails
   project is the cleaner end state and should be scheduled, not rushed into
   this week.
