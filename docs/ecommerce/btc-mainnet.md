# Bitcoin Mainnet Switch And Payment-Journey Proof — Design (r10)

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
- **r4 step-back review — GPT-5.6 Sol: REPLACE the allocation core, keep the
  perimeter** (`/tmp/btc-design-stepback-sol.md`, 2026-09-09). Its finding is
  not a new defect but a shape judgement across four rounds: the perimeter
  (isolation, health, expiry, proof composition, load control, rollback, kill
  switch, auto-hide, fingerprint binding, two-phase, replay) is **converging**,
  while the money-correctness core is **circling** — r2's height floor became
  r3's baseline became r4's parameterised residual, and every round left it
  probabilistic because paykit-server derives receive indices from an xpub whose
  wallet may derive them too. Its replacement: the seller's wallet issues the
  address; paste stays as onboarding and Paykit data but must not by itself
  enable automatic checkout.
- **Allocation options study** (`/tmp/btc-allocation-options.md`, 2026-09-09).
  A read-only comparison of **Option 1** (Bitkit-first plus chain detection) and
  **Option 2** (wallet-issued, account-key-signed, encrypted, append-only
  reservation pools), each with its exact mechanism, residual risk, Bitkit and
  paykit-server sizing, and proof strategy, all cited to source. Its
  recommendation: Option 2 as the **target** architecture; this week ship only
  Bitkit-exclusive automatic checkout; pasted xpubs onboard but confirm
  manually; detection is telemetry and a downgrade backstop, **not** a safety
  proof.
- **r5 — `718805930`** (Claude Opus). Takes the allocation decision those two
  inputs converge on, and changes nothing else. Every r4 mechanism survives
  unchanged; §B.8 gains a decision record (§B.8.0, D1–D5) and four new
  subsections — a creator `allocation_mode` (§B.8.6), sentinel detection as a
  downgrade backstop (§B.8.7), the `shared_manual` seller-confirmed checkout
  path with its marketplace states, endpoints and copy (§B.8.8), and Option 2
  recorded as the Wave 10 target architecture with its schema and validation
  rules (§B.8.9). §B.8.4's bound is re-scoped to the one mode that is disabled,
  §B.10 gains R4 and R5, §B.11.4 and §D.3 gain the new negative tests, §C.10
  gains the two-path onboarding text, and §C's row 19 stops saying "no
  wallet-side change".
- **r5 adversarial review — GPT-5.6 Sol: FIX-FIRST**
  (`/tmp/btc-design-r5-sol-review.md`, 2026-09-09). No P0. Five P1s (enableable
  `pasted_auto`, the unpolled `awaiting_seller_confirmation` state, undefined
  `paid_manually` semantics, implied cross-service atomicity in the confirm
  path, and unchecked seller-supplied audit fields), seven P2s, two P3s, and
  recommendations on the confirmation window (Q2), claim signing (Q3) and the
  minimum cutover set (Q6). All three recommendations are **adopted** and
  recorded as D6–D8 in §B.8.0.
- **r5 Kimi design audit — FIX-FIRST.** No P0 and **no P1**: it checked
  claim-channel forgery, downgrade-by-dust, residual honesty, privacy, the
  deployment rows and the F9–F15 test set, and found each honestly specified in
  the document itself. Three P2s (the confirm endpoint's credential is never
  named, the confirm-vs-reaper race is undefined, `late_settlement` ×
  `awaiting_seller_confirmation` is an undefined pair) and four P3s. Nothing it
  verified clean is weakened here.
- **r6 — `1a8756b98`** (Claude Opus). Folds both r5 reviews. No mechanism is
  removed except `pasted_auto`'s enabling flag, and D1–D5 are not reopened. One
  line per finding:
  - **Sol P1-1 → §B.8.6, §B.8.4, §D.3, §F W1.13, §G Q14.** `pasted_auto` is no
    longer enableable: no configuration flag exists, the server rejects it
    unconditionally, and the tests assert rejection rather than
    acceptance-when-set.
  - **Sol P1-2 → §B.11.2.** A status-only polling path for
    `awaiting_seller_confirmation` that can never auto-transition to `paid`.
  - **Sol P1-3 → §B.9.** Idempotent `paid_manually` semantics from every
    reachable invoice state, as a table.
  - **Sol P1-4 → §B.8.8, §C.16, §F W1.15.** The cross-service atomicity is
    replaced by one local transaction plus a stack-pinned Paykit-resolution
    outbox row, and unresolved rows join the drain boundary.
  - **Sol P1-5 → §B.8.8.** `txid` and `confirmed_amount_sats` are derived from
    the stored Paykit observation; a disagreeing seller-supplied value is
    rejected with a named error.
  - **Sol P2-1 → §B.8.7.** The sentinel/allocation race is re-checked under the
    creator allocation lock before evidence is inserted.
  - **Sol P2-2 → §B.8.7, §B.8.0 D3, §B.10 R4.** One definitive-evidence
    predicate, used everywhere.
  - **Sol P2-3 → §B.8.7, §C row 1d, §F W1.14.** A global sentinel token budget,
    admission and freshness limits, one 30 s cadence model, and a
    sentinel-specific age alert.
  - **Sol P2-4 → §B.8.8.** A complete transition table for
    `awaiting_seller_confirmation`.
  - **Sol P2-5 → §B.8.9.** `stack_id` in the canonical signed payload and in the
    validation rules.
  - **Sol P2-6 → §F W1.15.** Dependencies on W1.4b and on the resolution outbox.
  - **Sol P2-7 → §C row 19, §F W1.17.** Fixed static copy for the post-restore
    warning, the downgrade alert and each named downgrade reason.
  - **Sol P3-1 → §B.8.7 and every reference.** "definitive allocator evidence"
    becomes "definitive downgrade evidence (unassigned-sentinel evidence)".
  - **Sol P3-2 → §B.8.8 copy, §B.11.4 A7, §C row 4e, §F.1.** The window is 24
    hours, so "usually within a day" is now consistent.
  - **Sol Q2 → §B.8.0 D6, §B.8.8, §B.11.4 A7.** 24-hour window; inventory held
    through operator resolution; a stated operator SLA.
  - **Sol Q3 → §B.8.0 D7.** Account-key claim signing stays Wave 10; Wave 9's
    Bitkit channel is corroborated provenance, never proof.
  - **Sol Q6 → §B.8.0 D8, §F.** The minimum cutover set for the named-seller
    `exclusive`-only canary, and what gates general availability instead.
  - **Kimi P2-1 → §B.8.8.** The confirm endpoint's credential is named.
  - **Kimi P2-2 → §B.8.8, §B.11.4 A8, §D.3 F16.** Both transitions are one
    conditional UPDATE, first committer wins, and F16 races them.
  - **Kimi P2-3 → §B.8.8, §B.9.** `late_settlement` takes precedence; a late
    observation never enters `awaiting_seller_confirmation`.
  - **Kimi P3-1 → §B.8.8.** The copy-snapshot cross-reference is W1.16, not
    W1.14.
  - **Kimi P3-2 → §B.8.8.** Entry from `detected` is deliberate and the
    confirmations check is the seller's, by design.
  - **Kimi P3-3 → §B.8.8, §B.11.4 A7.** The inventory hold persists through
    operator resolution.
  - **Kimi P3-4 → §B.8.7.** The seller alert fires on the mode transition only.
- **r6 re-verification — GPT-5.6 Sol: FIX-FIRST**
  (`/tmp/btc-design-r6-sol-review.md`, 2026-09-09). Confirmed D1–D8 intact and
  19 of the 21 r5 items CLOSED, leaving **P1-3 NOT CLOSED** (§B.11.1 omits
  `resolved_paid_manually` while claiming exhaustiveness) and **P1-4 PARTIAL**
  (stack pinning asserted without a routing or identity mechanism). Two new P2s
  — resolution rejection classes unmapped with drain condition 6 unbounded, and
  `paid_manually` lacking a stated proof gate — and two P3s (confirm idempotency
  ordering, F11 not requiring the real allocation lock).
- **r6 Kimi design audit — FIX-FIRST.** Independently reached the same three
  defects, with the resolve-outbox one raised to **P1**: the delivery arm's
  "not retried forever" and §C.16's "condition 6 adds nothing to the worst case"
  are both falsified by the four unmapped permanent rejections, which deadlock
  the rollback checklist. Plus **P2-1** (§B.11.1 vs §B.9) and **P2-2** (the
  `stack_id` pin has no provenance and no comparison anchor), and six P3s. It
  re-attacked and held: the status-only poll path, the 12-row `paid_manually`
  table's totality, the no-un-pay invariant, the 24 h window's honestly stated
  unbounded hold, `confirmation_observation_mismatch`'s silence, and the
  stub-resistance of every r6 test except F11's twin.
- **r7 — `186d427d2`** (Claude Opus). Folds both r6 reviews. No decision is
  reopened: D1–D8, the 24-hour window, the unconditional `pasted_auto` rejection
  and the minimum cutover set are unchanged. Where the two reviewers framed a
  finding differently, the stricter reading is taken. One line per finding:
  - **Kimi P1-1 + Sol P2 (resolve termination) → §B.8.8, §B.9, §B.11.4 A9,
    §C.16, §C row 17, §F W1.15, §D.3 F15.** A complete response-class → outcome
    mapping table (every §B.9 rejection, the two stack-pin rejections, transport,
    401/403, and unrecognised codes), a **1-hour `resolve_delivery_deadline`**
    that terminates any retrying row regardless of class, and an **operator
    escape** that terminates a named row on demand and explicitly does not
    un-pay the order. §C.16's "adds nothing to the worst case" is replaced by the
    arithmetic: just over **26 hours** fully automatic, just over 25 with the
    escape. Condition 6 now requires an operator acknowledgement on every
    terminal row.
  - **Sol P1-3 + Kimi P2-1 (state machine) → §B.11.1, §B.9.** `baseline_state`
    gains `resolved_paid_manually` and `resolved_closed` — resolution is a state
    value, with `resolution` and `resolved_at` recording which — plus four
    resolve edges with triggers and guards (`observing` and `expired_tail`, each
    to both resolved states), the `expired_final` metadata-only non-transition,
    and the explicit statement that no other state has a resolve edge. §B.9's
    12-row table is re-checked against the amended state list and the two tables
    are now total against each other.
  - **Sol P1-4 + Kimi P2-2 (stack pin) → §B.8.8, §B.11.3, §B.8.9, §B.11.4 A10,
    §C rows 1c/3/4d/4e, §F W1.1c/W1.3/W1.4c/W1.10/W1.15, §D.3 F14.** `stack_id`
    is `{PAYKIT_STACK_ROLE}:{instance_uuid}`, minted once into a `stack_identity`
    row on first migration — **not** the role, because a rebuilt production stack
    shares the role. It is returned by phase 1, the claim response and
    `/health/ready`, persisted as `paykit_stack_id` at bind, copied onto the
    outbox row, and echoed on `activate` / `void` / `resolve` with the named
    `stack_identity_mismatch` 409. The arm compares locally before sending and
    the server compares remotely; both mismatches terminate the row with an
    alert. What the pin does not claim is stated too.
  - **Sol P2 (`paid_manually` proof gate) → §B.8.8, §C row 4e, §F W1.4b.**
    Decided as **attestation-only** and said in those words: no confirmation
    floor, no re-verification, the depth disclosed and never enforced, and
    `confirmation_basis = 'seller_attestation'` on the audit row (against
    `operator_resolution`). The cost is R5, restated rather than softened.
    W1.4b's resolve suite becomes table-driven over all twelve §B.9 rows with
    `observation_targets()` membership asserted before and after each.
  - **Sol P3 (confirm ordering) → §B.8.8, §F W1.15.** Authorise → idempotency
    lookup → conditional UPDATE, with every side effect inside that transaction.
  - **Sol P3 + Kimi P3-2 (F11) → §D.3 F11, §F W1.14.** An interleaving over two
    overlapping real transactions with the assignment attempted while the scan
    holds the creator row, so the test proves the lock and not only the re-check.
  - **Kimi P3-1 → §E.** The §C.16 boundary row said five conditions; it is six.
  - **Kimi P3-3 → §B.8.8.** "None of the five interpolates" had no antecedent;
    the block fixes eight strings and now says so.
  - **Kimi P3-4 → §D.3.** "All six required" was a stale count; the F1–F8 block
    is ten calibrations, enumerated.
  - **Kimi P3-5 → §B.8.8.** The transition table gains the row for a second
    distinct eligible observation after a `disappeared` mark.
  - **Kimi P3-6 → §B.8.0 D5, §C.10.** `pasted_auto` is described as rejected
    unconditionally everywhere, never as "disabled".
- **r7 re-verification — GPT-5.6 Sol: FIX-FIRST**
  (`/tmp/btc-design-r7-sol-review.md`, 2026-09-09). No P0 and **no P1**. Confirmed
  D1–D8 intact, and every r6 finding CLOSED except two rated PARTIAL for the same
  reason — the r7 mechanisms exist, but three seams in them are unspecified: the
  canonical `void` body omits the `stack_id` the contract requires on all three
  messages;
  the resolve mapping terminalizes transient HTTP statuses; and drain condition 6
  is not closed under future writes. Three P2s, listed below. It re-attacked and
  held the §B.9 table's totality against the ten invoice states, the 61-minute
  outage leaving the order `paid`, `resolved_closed` preserving refunded vs
  abandoned, `instance_uuid` surviving pod replacement, the non-secret UUID on
  auth-exempt `/health/ready`, and attestation-only confirmation being honestly
  disclosed.
- **r7 Kimi design audit — SHIP** (`/tmp/btc-design-r7-kimi-review.md`,
  2026-09-09). All three convergent r6 defects closed by real mechanisms rather
  than prose, every sweep item landed, and **no P0, P1 or P2**. Its four P3s are
  doc-consistency only and it says so: the `void` body's missing field (the same
  seam Sol raised as a P2), `stack_id` absent from the §B.7.2 hop-1
  `ReadyResponse` example, the overclaimed "§A already refuses at boot", and the
  26 h arithmetic bounding seller confirmations only (the same gap Sol raised as
  a P2, rated lower because condition 6's first clause still covers the row that
  exists). It re-attacked and held mapping totality, the 1 h deadline, the 26 h
  arithmetic for seller confirmations, `stack_id`'s survival across redeploy, the
  `resolved_closed` merge, and every count and cross-reference it checked.
- **r8 — this commit** (Claude Opus). Folds both r7 reviews. Deliberately narrow:
  no decision is reopened — D1–D8, the 24-hour window, the unconditional
  `pasted_auto` rejection and the minimum cutover set are unchanged — and where
  the two reviewers rated the same gap differently, the stricter reading is
  taken (all three of Sol's P2s are folded as design changes, not as wording).
  One line per finding:
  - **Sol P2 #1 + Kimi P3-1 (`void` omits `stack_id`) → §B.8.8, §B.11.3, §D.3
    NEG-6, §F W1.1c.** The canonical `void` body carries `stack_id`, with the
    concrete failure it prevents stated (a `void` retried after a repoint
    cancelling a live invoice that shares the id on the new stack). §B.8.8's
    "`activate` and `resolve` echo it" — the one sentence in the document that
    disagreed with the other four — now reads `activate`, `void` and `resolve`
    like §B.11.3's error table, §C row 1c and W1.1c already did. `void`'s
    idempotence **and** mismatch cases are driven in W1.1c and NEG-6 exactly as
    `activate`'s and `resolve`'s are.
  - **Sol P2 #2 (transient statuses terminalized) → §B.8.8, §D.3 F15, §F W1.15.**
    A row for **`408` / `425` / `429`** → bounded retry under the 1-hour
    `resolve_delivery_deadline`, with `Retry-After` honoured on `429` / `503` and
    **clamped to the deadline** so it can never extend §C.16's arithmetic. `5xx`
    including `502` / `503` / `504` is named explicitly in the transport row
    rather than left to be inferred. The last row becomes "any other status **or
    any unrecognised application error code**" → terminal, so an unrecognised
    `4xx` still fails visibly. The **rule** that decides transient from permanent
    — status first, application code second, in four numbered steps — is stated
    before the table, which is what makes its totality claim true rather than
    asserted. F15 gains the `Retry-After` cases and a second FAIL calibration in
    the *opposite* direction: restore r7's mapping and watch one `429` destroy a
    row the next attempt delivers. On the count: the mapping table had **11**
    rows in r7 and has **12** in r8, and it now states its own count; the
    "12-row" references elsewhere in this log are §B.9's table, which genuinely
    has twelve (Kimi's note).
  - **Sol P2 #3 + Kimi P3-4 (condition 6 not closed under future writes) →
    §B.8.8, §B.9, §B.11.4 A10/A11, §C rows 4d/16/17, §C.16, §E, §D.3 F14/F15, §F
    W1.10/W1.15/W3b.** Two mechanisms, taken together. **(a)** The originating
    endpoint is persisted: `paykit_stack_endpoint` sits beside `paykit_stack_id`
    on the order row, frozen at bind from the URL that phase-1 call actually
    went to, copied onto the resolution outbox row, and **the delivery arm dials
    the row's pinned endpoint rather than the current default** — so a seller
    confirming after the repoint, or an operator resolving `manual_review` at any
    hour, still reaches the stack that issued the invoice. The readiness cache
    becomes per-endpoint, because after a repoint two endpoints are in play.
    **(b)** §C.16 gains **condition 7**: no order in `awaiting_seller_confirmation`
    or `manual_review` pinned to this stack, or every such order's window has
    closed. Until it holds, the old stack is **retained** — creation disabled,
    still serving `activate` / `void` / `resolve` — and §C row 16 splits the
    rollback so that repointing is step 4 and *deleting the service* is a later,
    separately gated step 6. The count moves from six to seven in §C.16's
    boundary sentence and table, §E's drain row, §E's findings row, and W3b's
    brief. The operator `manual_review` resolution's delivery mechanism is
    stated where §B.9 defines it: same outbox, same 1-hour deadline, same
    twelve-row mapping, `confirmation_basis = 'operator_resolution'`, and no
    inline call. The **26 h arithmetic is scoped rather than corrected**: it
    bounds conditions 1–6 against seller confirmations, operator resolutions have
    no creation clock at all, and condition 7 is therefore stated as a condition
    cleared by operator action rather than as a duration. New matrix row **A11**
    is the post-repoint resolution; F14 now drives the pin in **both**
    directions, because r7's test proved only that a misdelivery is caught and
    not that a delivery which should still succeed is not destroyed.
  - **Kimi P3-2 → §B.7.2 hop 1.** `stack_id` is in the `ReadyResponse` example,
    with the sentence that makes it load-bearing: it must be present regardless
    of `status` or `bitcoin_offer_available`, because a degraded stack that will
    not say who it is leaves the local half of the pin nothing to read.
  - **Kimi P3-3 → §B.8.8.** "which §A already refuses at boot" is replaced. §A
    and §B.6 refuse cross-network and cross-role database sharing; same-role
    sharing is refused by nothing and is **P1-C** (§C row 12). It is harmless to
    the pin mechanically — the two stacks read the same `stack_identity` row and
    therefore the same invoice set, so there is nothing to distinguish — and that
    is now what the sentence says.
- **r9 — this commit** (Claude Opus). Folds Sol's two r8 P2 findings and Kimi's
  r8 P3 against **r8 base `d50352391`**, without reopening D1–D8, the 24-hour
  window, the unconditional `pasted_auto` rejection, or the minimum cutover set:
  - **Sol P2 #1 (condition 7 admits future writes) → §B.8.8, §B.9, §C.16,
    §F W1.15.** Condition 7 is the exact empty-set predicate: zero orders pinned
    to the old stack in `awaiting_seller_confirmation` or `manual_review`.
    The reaper transitions an elapsed seller window to `manual_review`; closing a
    window is never an alternative to resolving the order. Retention remains
    unbounded while unresolved `manual_review` work exists and is cleared only by
    operator action.
  - **Sol P2 #2 (`Retry-After` can spin) → §B.8.8, §D.3 F15, §F W1.15.**
    Retry scheduling is now `min(resolve_delivery_deadline,
    max(backoff_due_at, retry_after_due_at))`; zero, near-zero, and past
    `Retry-After` values cannot undercut normal backoff, while malformed values
    still fall back to it. F15 adds those cases and a deliberate floor-removal
    anti-spin calibration.
  - **Kimi P3 (operator `paid` under-enumerated) → §B.9, §C.16.** An operator
    resolving `manual_review` to `paid` writes a `paid_manually` resolve row with
    `confirmation_basis = 'operator_resolution'`, using the same outbox,
    deadline, and twelve-row mapping as every other operator resolution.
- **r10 — this commit** (GPT-5.6 Terra). Folds Sol r9 P2/P3 and Kimi r9 P3
  against **r9 base `eba322569`**, without reopening D1–D8, the 24-hour window,
  the unconditional `pasted_auto` rejection, or the minimum cutover set:
  - **Sol P2 (condition 7 column trace) → §B.8.8, §C.16, §C row 17,
    §F W1.15.** The document defines `orders.paykit_request_state` as the
    Paykit lifecycle (`pending`, `detected`, `confirmed`, `preparing`,
    `awaiting_seller_confirmation`) at §B.8.8 and §B.11.2, while the existing
    late/reaper path writes `payments.state = 'manual_review'` and leaves
    `orders.paykit_request_state = 'confirmed'`. Condition 7 therefore joins
    the order's payment row and blocks either unresolved branch; the reaper's
    two-column write and the operator-resolution exit are explicit.
  - **Sol P3 (A11 outcome) → §B.11.4.** Post-repoint delivery keeps the common
    pinned-endpoint assertion, but its durable order outcome now depends on the
    seller or operator resolution: `paid`, `refunded`, or `abandoned`.
  - **Kimi P3 (W1.15 acceptance regression) → §F W1.15, F13–F15.** r9
    condensed W1.15 and dropped the only test home for five assertions; this
    revision restores the SLA alert, seller-attestation basis, authorization
    ordering, post-repoint pin FAIL calibration, and 3600-second hold extension.

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

**r5 narrows what that acceptance buys, without reversing it.** The owner's
requirement — sellers provide their own xpub the conventional way, and it lands
in Paykit data rather than a side channel — is unchanged and is still satisfied
by the same claim path (§B.0, §B.8.6). What changed is that a pasted xpub no
longer enables **automatic** order confirmation: it enables onboarding and
observation, and the seller confirms payment themselves (§B.8.8). So the 6%
figure above is no longer a number anyone is carrying in production this week —
it is the price of a design (`pasted_auto`) that is **priced and rejected
unconditionally**, and
that r6 makes **unreachable by configuration** (§B.8.6). Enabling it requires a
separately approved design revision, not an operator toggle, and the owner
decision is taken against that same table. The full reasoning is the r5 decision
record, §B.8.0.

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
  "stack_id": "production:6f1d0c2a-9b47-4e35-8a10-73c5e2d84b19",
  "postgres": "ready",
  "electrum": "ready",
  "paykit_delivery": "ready",
  "outbox": "ready",
  "bitcoin_offer_available": true,
  "electrum_tip_height": 882431,
  "electrum_tip_age_seconds": 12
}
```

`stack_id` is this stack's identity, `{PAYKIT_STACK_ROLE}:{instance_uuid}`, and it
is **present on every readiness response regardless of `status`** (r8, Kimi P3-2):
it is the reference value the marketplace's resolution arm compares its pinned
outbox row against before sending (§B.8.8), so a stack that is degraded — or that
has `bitcoin_offer_available: false` — must still say who it is, or the local half
of the pin has nothing to read. It is non-secret; §B.8.8 states exactly what
publishing it does and does not buy an attacker.

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
  "bitcoin_confirmation_mode": "automatic",
  "stripe_payment_link": null,
  "paypal_merchant_email": null
}
```

**`bitcoin_confirmation_mode` is new in r5** and is the third orthogonal thing
this endpoint now carries: `automatic` for an `exclusive` seller, `seller` for a
`shared_manual` one (§B.8.6). It is deliberately **not** a third way to hide
Bitcoin — a `shared_manual` seller's Bitcoin option is rendered normally, with
different copy — and it deliberately does not leak the seller's
`allocation_mode` enum or their claim channel to a buyer, only the one fact a
buyer needs: who confirms. The seller's own `allocation_mode`, claim channel,
downgrade reason and detection evidence stay on the authenticated seller
surface (§B.8.6).

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

**The two other static buyer-side strings this contract now carries (r5).** Both
are fixed text on the same rule — no server state interpolated, ever.

- **`shared_manual`** (`bitcoin_confirmation_mode: "seller"`), shown at
  checkout before the buyer pays, and reinforced on the order once the payment
  is observed. The exact copy is in §B.8.8 and is repeated here as the contract's
  own inventory so a copy pass cannot lose it: at checkout, *"This seller
  confirms Bitcoin payments manually. Your order is confirmed once the seller
  checks the payment, usually within a day."*; after the payment is observed,
  *"Payment received — awaiting seller confirmation. We can see your payment on
  the Bitcoin network. Your order is confirmed once the seller checks it. You'll
  be notified when that happens."*
- **`seller_address_pool_empty`** — **Wave 10 only** (§B.8.9), listed now
  because it is a fourth reason Bitcoin can be absent from a checkout and the
  contract should enumerate all of them in one place rather than gaining a case
  later. When a pool-capable seller's reservation pool is exhausted, the failure
  happens **before** the marketplace bind, Bitcoin is hidden **for that seller
  only**, and the buyer sees: *"This seller needs to add Bitcoin receiving
  addresses. Choose another payment method."* This is per-seller and must not be
  routed through `bitcoin_offer_available`, which is rail-wide; it belongs
  alongside `bitcoin_available`. Existing invoices keep being observed.

**The bind stays fail-closed regardless.** Auto-hide reduces the *probability*
that a buyer reaches the bind during an outage; it is not a guarantee, because
the cache can be up to 15 s stale and a buyer can hold a stale page. So
`POST /v0/orders/{id}/payment-method` keeps refusing cleanly on
`CreateInvoiceError::Unavailable` (`payment_methods.rs:447-553`) and keeps
rolling the bind back. Auto-hide is a conversion and trust measure, never a
correctness one; §B.4's fail-closed baseline is the correctness one.

### B.8 Independent allocators — the fix for NEW-2 (blocking, before general availability)

#### B.8.0 Decision record — the r5 allocation decision (2026-09-09)

**Inputs.** `/tmp/btc-design-stepback-sol.md` (step-back review after r4: the
perimeter is converging, the allocation core is circling; replace server
derivation with seller-wallet issuance) and `/tmp/btc-allocation-options.md`
(options study: Option 1 Bitkit-first plus detection, Option 2 wallet-issued
signed reservation pools, with mechanisms, residuals, sizing and proof
strategies cited to source). Both are read-only design inputs; neither is a code
change. **These are decisions, not open questions.** They are recorded at the
top of this section because everything below them was written when the answer
was still "paykit-server allocates for everyone".

**D1 — Automatic Bitcoin checkout ships this week only for a Shop-exclusive
Bitkit account.** A seller gets automatic order confirmation only if their
claimed xpub arrived through the Bitkit watch-only claim path for an account
Bitkit reserved for Shop. That path is not aspirational: both apps already
reserve `highest + 1` durably (`WatchOnlyAccountStore.kt:150-173`,
`WatchOnlyAccountService.swift:201-231`), export that account's xpub
(`WatchOnlyAccountRepo.kt:86-103`, `:226-230`;
`LightningService.swift:507-515`), track it with addresses revealed through 999
(`WatchOnlyAccountRepo.kt:247-260`, `WatchOnlyAccount.kt:8-9`), encode the
account index plus the canonical 78-byte xpub in the claim
(`WatchOnlyAccountRepo.kt:330-353`, `WatchOnlyAccountService.swift:889-905`),
and back up **and** restore both the account records and the allocation state,
merging high-water marks with `max` rather than moving them backward
(`BackupRepo.kt:587-600`, `:711-729`, `WatchOnlyAccountStore.kt:196-243`;
`BackupService.swift:735-749`, `:210-219`,
`WatchOnlyAccountService.swift:145-181`). **§B.8.5's qualification stays exactly
as written:** collision is impossible while allocation state survives, the
common restore path preserves it, and the post-restore warning is required
because the wipe-without-restore path is not covered by any of the above.

**D2 — Pasted and file-imported xpubs are still accepted, through the same
Paykit claim path, and are `shared_manual` by default.** Acceptance is an owner
requirement and is unchanged: paste and file import land in
`POST /v0/accounts/claim` → `manual_claim.rs:198-264` → `real_setup.rs:230-329`
and publish the same receiver marker on the seller's own homeserver, so the
seller is using Paykit and Locks data rather than a side channel (§B.0). What
changes is only what the marketplace is allowed to conclude from an observation:
for a `shared_manual` creator, paykit-server still derives, still observes, still
reports `detected` and `confirmed`, and Shop still shows the buyer the payment
state — but **Shop never auto-transitions the order to `paid`.** The seller
confirms the payment in their own wallet and explicitly marks the order paid;
Shop records seller identity, time, txid and reason. A buyer-supplied txid is
supporting evidence, never proof of purchase. Mechanism, states, endpoint,
authorisation and copy: §B.8.8.

**D3 — Detection is added as telemetry and a downgrade backstop, not as a
safety proof.** Per creator, paykit-server watches all assigned invoice
addresses through the expiry tail **plus** a bounded sentinel window of 20
indices from `next_child_index` forward. **Only an output to a sentinel address
paykit-server has never assigned to any invoice, satisfying the single predicate
in §B.8.7, is definitive downgrade evidence.** Under-, over- and late payment to
an **assigned** address routes that
invoice to `manual_review` and never downgrades the creator. On definitive
evidence, `shared_manual` is persisted atomically, automatic `paid` stops for
that creator, and the seller is alerted. **The dust caveat, stated plainly:** an
attacker who has learned the xpub can send one confirmed output to a sentinel and
force the downgrade. That is a priced denial of the automatic path, not a false
payment, and it is not fixable inside Option 1 — see §B.8.7. For a creator
already in `shared_manual`, detection changes nothing except telemetry.

**D4 — Option 2 is the target architecture, recorded as Wave 10.** Account-key
signed, encrypted, append-only reservation pools published by the seller's
wallet, with paykit-server validating and consuming rather than deriving. Its
schema, homeserver paths, validation rules, and Bitkit/paykit-server sizing are
copied into §B.8.9 as the migration target. **Not built this week.** Non-Bitkit
sellers reach automatic checkout through that same protocol via wallet plugins
later; until such a plugin exists, a non-Bitkit seller onboards by paste and
stays `shared_manual` (§B.8.9, "Non-Bitkit sellers").

**D5 — Everything else in r4 survives unchanged.** The isolation (§B.1), the
baseline and eligibility rules (§B.4), the claim scan (§B.5), the deny-list,
bounded account range and fingerprint↔seller binding (§B.6, §B.8.5), the
Electrum budget, probe and auto-hide (§B.7, §B.7.1, §B.7.2), the exact-amount
predicate and nonce (§B.8.2), the expiry, tail and drain boundary (§B.9,
§C.16), the two-phase prepare/activate protocol (§B.11) and the creation kill
switch are not reopened by r5 and are not restated here. Read §B.8.1–§B.8.5 as
r4 wrote them, with three corrections of scope that r5 makes explicit where they
occur: §B.8.3's "(b) load-bearing, (a) recommended" now describes the
`pasted_auto` mode that is **rejected unconditionally** (§B.8.6 — r7 states it
the same way everywhere, since r6's "disabled" reads as a setting that could be
re-enabled and no such setting exists); §B.8.4's bound applies to that mode
alone; and §B.8.1's "recommended, not required" becomes **required for
automatic checkout** and remains not required for onboarding.

**D6 — The seller-confirmation window is 24 hours, and inventory is held
through resolution (r6, Sol Q2).** The window is aligned with the existing
24-hour observation tail (§B.9) rather than chosen independently, so the two
clocks an operator has to reason about are one number. On entry to
`awaiting_seller_confirmation` the inventory hold is extended, not expired; at 24
hours the order routes to `manual_review` and **the inventory is not released
automatically** — it stays held until an operator resolves it as paid, refunded
or abandoned, under a stated **2-business-day operator SLA**. The buyer sees the
human-review copy on day 2. Mechanism: §B.8.8.

**D7 — Account-key claim signing stays Wave 10 (r6, Sol Q3).** A BIP340
signature by the account key is the only mechanism that converts the Bitkit
claim from a correlate into proof, and it is an **L** change in both apps
(§B.8.9). It is not pulled forward into Wave 9, because it would not close D1's
gap on its own: it proves private-key control, not that Bitkit reserved the
account or advanced its allocator. **Wave 9 therefore describes the Bitkit claim
channel as corroborated provenance and never as proof** — the position §B.8.6
already takes, restated here as a decision so no later sentence drifts into
calling it proof.

**D8 — The minimum cutover set is named (r6, Sol Q6).** The canary is a
**named-seller, `exclusive`-only** cutover, and it requires exactly: r4's
correctness perimeter; **W1.13** limited to `exclusive` and `shared_manual`;
**W1.15** including the durable stack-pinned resolution outbox, with **W1.4b**
and that outbox as prerequisites; **W1.16**'s static buyer and seller surfaces;
the live mode contract captured from a real response rather than retyped; and the
state-transition and authorization tests. **W1.14** (sentinel detection) and
**W1.17** (lifecycle and recovery UX) gate **general availability, not the
canary** — the canary's safety rests on §B.8.6's claim-time checks and on a
single named seller, not on detection. W10 is unchanged and still deferred.
Sequencing: §F.

**What this buys, in one line each.** `exclusive` has no probabilistic
false-paid path at all while allocation state survives — it is the change of
kind §B.8.4 point 1 already identified, taken as the rule rather than the
recommendation. `shared_manual` has no *automatic* false-paid path, because
there is no automatic transition; the risk becomes seller judgement, which is a
different and openly stated thing (§B.10, R5). `pasted_auto` is the r4 design
exactly, priced at §B.8.4's table, and is **unreachable** — rejected
unconditionally, with no flag that could turn it on (r6, §B.8.6).

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

#### B.8.1 Option (a) — a Shop-exclusive account xpub (r5: required for automatic checkout)

**r5 scope note.** Everything below is r4's evidence for why a Bitkit-issued
Shop-exclusive account is safe, and it is unchanged. What changed is its
standing: D1 (§B.8.0) makes it the **precondition for automatic order
confirmation** rather than a recommendation. It is still not a precondition for
onboarding — a seller who will not use Bitkit still claims, still gets a Paykit
receiver marker, and still gets Bitcoin checkout, with seller-confirmed payment
(§B.8.8). The one paragraph below that r5 supersedes is "What (a) cannot do on
its own": the server still cannot tell a Bitkit-reserved xpub from a paste **by
the key bytes**, which is exactly why the distinction is carried by the claim
path and its attestation rather than by the key (§B.8.6).

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

**r5 scope note, tightened in r6.** This subsection is r4's reasoning for the
`pasted_auto` mode, and `pasted_auto` is **rejected unconditionally** by the
server (§B.8.6) — r6 removed the configuration flag that would have enabled it.
Read it as the **priced, disabled design**: the argument that a **separately
approved design revision** would have to re-accept before that mode could exist
at all, not as a description of what ships and not as an operator toggle.

Both mechanisms still ship: (a) is now the gate on
automatic confirmation (D1), and (b) — the exact-amount predicate and the
per-invoice nonce — still applies to **every** invoice on every mode, because it
also bounds R1 (§B.4.6, §B.10) and because a `shared_manual` seller's own
confirmation decision is easier when the amount is exact and unique.

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

**r5 scope note, and it is the most important sentence in this subsection:
everything below prices exactly one allocation mode, `pasted_auto`, and that
mode is unreachable — the server rejects it unconditionally and r6 removed the
flag that could have enabled it (§B.8.6).** The model is kept in full,
unaltered, for two reasons: it is what a separately approved design revision
would have to re-accept before that mode could exist at all, and it is
still the correct model for the paste-shaped residuals that survive in other
modes (R2 in §B.10, and the wallet-reissue tail of R3). It is **not** the
residual of anything that ships this week. The per-mode restatement is at the
end of this subsection.

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

**The residual, restated per allocation mode (r5).** The table above is one
column of this one:

| Mode | Automatic `paid`? | False-paid residual | Where it is gated |
| --- | --- | --- | --- |
| `exclusive` | yes | **R1 only** — a mempool transaction the server's single Electrum had not seen at snapshot time (§B.4.6, §B.10) — **plus** the wallet-side reissue tail: a wipe or reinstall with no successful restore, or a restore from a snapshot predating the Shop reservation, after which the wallet may reserve the same account for something that receives (§B.8.5, R3). Both are bounded by the exact-amount nonce. There is **no** two-allocator term, because the wallet's own receive path takes no account index (`LightningService.kt:613-676`, `LightningService.swift:635-641`) | Q4 (corroboration) for R1; §B.8.5's backup/restore evidence, the post-restore warning (§C.10) and detection (§B.8.7) for the reissue tail |
| `pasted_auto` | **unreachable — rejected unconditionally** | the table above: at `r=100`, `s=10`, `L=1 h`, `p_band=1`, `E ≈ 6 × 10⁻²` per exposed-seller-month, `P(any) ≈ 6%`. Nobody carries it, because no creator can be in this mode | A separately approved design revision, taken against that table (§B.8.6); there is no flag and no operator toggle (r6) |
| `shared_manual` | **no** | **none by this mechanism.** There is no automatic transition to `paid`, so no chain observation can produce one. Said plainly: the risk does not shrink, it **moves** — from a probability the design carries to a judgement the seller makes, once per order, in their own wallet (§B.10, R5) | §B.8.8's confirm endpoint, its authorisation, and its audit record |

**What detection does *not* do to these numbers, stated because the temptation
is obvious.** It is tempting to write that with sentinel detection the first
colliding receipt either pays falsely with probability `1/999` or triggers a
downgrade, and therefore the monthly figure collapses to ~10⁻³. **Do not write
that.** In an idealised detector where the first non-exact colliding receipt
always downgrades, `1/999` describes the first collision under this model's
worst-case nonce-band assumption — it is a scenario, not a production bound.
This document models neither sentinel coverage (what fraction of colliding
indices fall inside a 20-address window) nor the dust policy's false-negative
rate, and an exact colliding receipt is not unmatched at all, so it can pay
before any detector fires. Claiming `1/999` as the monthly risk would overstate
the evidence. Detection is credited as telemetry and as a downgrade backstop
(§B.8.7), and with **zero** reduction to any number in this subsection.

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

#### B.8.6 The creator allocation mode (D1, D2)

**One new column on `creators`, in paykit-server, per §B.0:**

```sql
allocation_mode TEXT NOT NULL DEFAULT 'shared_manual'
  CHECK (allocation_mode IN ('exclusive','pasted_auto','shared_manual'))
```

| Value | Automatic `paid`? | How a creator gets it |
| --- | --- | --- |
| `exclusive` | yes | a claim on the Bitkit watch-only channel that passes every corroborating check below |
| `pasted_auto` | n/a — **unreachable** | **nothing.** No claim, flag, migration or operator action can set it (r6) |
| `shared_manual` | **no** — seller confirms (§B.8.8) | the default: every paste, every file import, and every claim that fails an `exclusive` check |

**`pasted_auto` is rejected unconditionally (r6, Sol P1).** r5 carried it as an
enum value that a configuration flag could enable. That was a defect against D1,
because it left a live path to automatic confirmation for pasted keys behind a
single operator variable, and it made the CI test assert *acceptance when the
flag is set* — a test that proves the dangerous path works. r6 removes the flag:

- **There is no configuration flag, no operator toggle and no per-seller
  override.** No code reads a setting that admits this mode.
- **The server rejects it unconditionally.** A claim that requests
  `allocation_mode = 'pasted_auto'` is refused with
  `allocation_mode_not_enabled` on every code path and under every
  configuration.
- **The tests assert rejection, not acceptance-when-set** (§F, W1.13; §D.3). The
  removed "accepted only with the flag explicitly set" assertion is a deliberate
  deletion, recorded here so a later reader does not restore it as a missing
  case.

The value stays in the enum's check constraint so that the r4 analysis remains
addressable and so the seller status API and audit records can express the mode a
creator would have been in. **§B.8.3 and §B.8.4 remain in this document as the
priced, disabled design**, and **enabling this mode requires a separately
approved design revision** — a new decision record and a new review round, not a
variable. Accepting §B.8.4's bound is a necessary but no longer sufficient step.

**How the claim distinguishes a Bitkit exclusive claim from a paste — and what
that distinction is actually worth.** The Bitkit claim carries a structured
attestation the paste does not: the seller's browser obtains a Pubky auth URL
with `x-bitkit-claim=watch-only-account-v1` (`PubkyAuthRequest.kt:9-14`), Bitkit
grants it only on an exact capability-set match
(`PubkyAuthRequest.kt:17-27`), and Bitkit returns an **84-byte wire payload** —
version(1) + accountIndex(4) + addressType(1) + the canonical 78-byte xpub
(`WatchOnlyAccountRepo.kt:330-353`, `WatchOnlyAccountService.swift:889-905`) —
for an account its own reservation machinery just allocated at `highest + 1`. A
paste produces a bare key and nothing else.

**What the server checks**, all of it inside the existing claim path
(`manual_claim.rs:198-264` → `real_setup.rs:230-329`):

1. A `claim_channel` field on `POST /v0/accounts/claim`, one of
   `bitkit_watch_only_v1` or `manual`, submitted by the Shop client. Recorded on
   the creator row verbatim.
2. For `bitkit_watch_only_v1`, four corroborating facts that the server verifies
   for itself and that a Bitkit-reserved account satisfies by construction:
   **`account_index >= 1`**, because Bitkit's reservation refuses 0
   (`WatchOnlyAccountStore.kt:259-263`,
   `WatchOnlyAccountService.swift:282-283`); the declared index **equals the
   key's own hardened child number**, already enforced on every claim
   (`create_invoice.rs:249-270` via `real_setup.rs:343-353`); the §B.5 claim
   scan finds **no history at all**, so `next_child_index` stays 0 — a freshly
   reserved Shop account is empty, and any history at all means this is not one;
   and the fingerprint has never been claimed by another seller (§B.8.5).
3. Any failure downgrades the claim to `shared_manual` **with a named reason
   returned to the seller** — one of the four fixed reason identifiers and their
   fixed copy in §B.8.8 — rather than refusing it. Refusing would take a
   working paste path away from a seller who did nothing wrong; downgrading
   keeps them selling and tells them why the automatic path is unavailable.

**What the server cannot prove, stated plainly because it is the reason D4
exists.** The 84-byte payload is a wire encoding, **not a signature**. Nothing
in it is signed by Bitkit or by the account key, so the server cannot verify
that the bytes came out of Bitkit's reservation machinery, and `claim_channel`
is an assertion by the seller's own browser. A seller who pastes the xpub of a
**fresh, empty** account of the right depth and index, and whose client asserts
the Bitkit channel, passes every check in the list above. What the server has is
therefore **corroborated provenance** — an empty account at index ≥ 1 whose index
agrees with the key — and **never proof** of exclusivity. That distinction is
D7: no sentence in this document may describe the Wave 9 claim channel as proof,
and the mechanism that would make it proof is deliberately Wave 10. The consequences are bounded and worth naming: such a seller has
self-selected into automatic checkout on an account that is empty *today*, so
§B.8.4's `r` is that account's own future receive rate rather than a busy
wallet's; detection (§B.8.7) is what notices if it starts receiving; and
**§B.8.9's account-key signature is the only mechanism in this document that
converts the assertion into proof**, which is why Option 2 is the target and not
a nice-to-have.

**Transitions, and there are only three.**

| From | To | Trigger |
| --- | --- | --- |
| — | `exclusive` | claim on `bitkit_watch_only_v1` passing all four corroborating checks |
| — | `shared_manual` | every other claim, including a downgraded Bitkit claim |
| `exclusive` | `shared_manual` | definitive downgrade evidence (§B.8.7), atomic, **one-way** |

There is no edit that moves a creator **into** `exclusive`. The claim is
immutable per creator (`bitkit_claim.rs:69-74`), so a seller who wants to move
from `shared_manual` to `exclusive` — or to recover from a downgrade — makes a
**new claim to a fresh Bitkit-reserved account**, which runs the full §B.5 scan,
the §B.8.5 fingerprint binding and the checks above from scratch. Old invoices
stay in observation through their expiry tail (§B.9) on the old account; only
new invoices use the replacement. No index assignment is ever carried across.

**Seller-visible status.** The authenticated seller's Shop settings surface
reads `allocation_mode`, the `claim_channel` recorded at claim time, the
downgrade reason if any, and the detection evidence metadata (§B.8.7) from
paykit-server. It is the seller's own data about their own creator record; it is
not public, and it is not written to the homeserver.

#### B.8.7 Detection as telemetry and a downgrade backstop (D3)

**Not a safety proof.** Nothing in §B.8.4, §B.8.6 or §B.10 is credited to this
subsection. It exists to notice that an `exclusive` account is not exclusive
after all, and to stop the automatic path before the next order rather than
after the tenth.

**Two watch sets per creator.**

1. **Assigned addresses** — every invoice address, watched through the §B.9
   expiry tail. This is what the observer already does, except that it loads
   only non-final invoice addresses today (`invoices.rs:239-329`).
2. **A sentinel window of 20 indices** from `next_child_index` forward,
   creator-level rather than invoice-level. **Both creator-level targets and
   durable evidence records are new**; neither exists in the observer today.

**Classification, and the asymmetry is the whole design:**

- **Definitive downgrade evidence (unassigned-sentinel evidence):** an output to
  a **sentinel** address that paykit-server has **never assigned to any
  invoice**, satisfying the one predicate below. Somebody other than
  paykit-server derived and used an address on this account. **The name matters
  and r5's name was wrong** (Sol P3): it is evidence that an address on this
  account was derived and used by something else, **not** evidence that a second
  *allocator* exists — the dust caveat below is exactly the gap between those two
  claims. "Definitive" refers to the downgrade being unconditional once the
  predicate holds, not to attribution.
- **Ambiguous invoice evidence:** underpayment, overpayment, or late payment to
  an **assigned** address. These route **that invoice** to `manual_review` — the
  path §B.8.2 and `workers.rs:827-859` already take — and **never** classify the
  account. The rule r2-era prose reached for, "any receipt on a derived address
  matching no invoice proves sharing", is unsafe and is rejected explicitly:
  matching is amount-based and per-invoice (`invoices.rs:650-713`), so treating
  every amount mismatch as account-wide proof would let one honest buyer's typo,
  one overpayment, or one dust output permanently disable a seller.

**One predicate, written once and referenced everywhere (Sol P2).** r5 stated
"one confirmed output" in the classification rule while §B.8.7's own policy
paragraph and §D.3's F11 calibration made minimum value and hit count
configurable — three descriptions of one rule, which is how a code path ends up
disagreeing with its own test. There is exactly one predicate, and every other
mention of downgrade evidence in this document (§B.8.0 D3, §B.10 R4, §C row 1d,
§D.3 F9/F11, §F W1.14) refers to it rather than restating it:

```
downgrade_evidence(creator) :=
    confirmed
 && value >= sentinel_min_value_sats
 && distinct_hits >= sentinel_hit_count
```

where `confirmed` means at least one confirmation at the observing tick,
`value` is the value of a single output to a never-assigned sentinel address,
`distinct_hits` counts **distinct `txid:vout` outpoints** to never-assigned
sentinel addresses on that creator, and both thresholds are the configured
policy §D.3's F11 calibrates in both directions. The defaults
(`sentinel_min_value_sats` at relay-standard dust, `sentinel_hit_count = 1`)
reproduce r5's stated behaviour, so the predicate is a restatement of the intent
rather than a policy change. **Mempool-only outputs never satisfy it** — they are
recorded as evidence candidates and are not evidence.

**On definitive downgrade evidence**, in one transaction, and **under the
creator allocation lock** (`FOR UPDATE` on the creator row —
`invoices.rs:733-741`, the same lock invoice creation already takes): persist
`allocation_mode = 'shared_manual'`, write an evidence row (`txid:vout`, the
sentinel index, the confirmation height, the observing tick), and stop automatic
`paid` for **every current and future invoice of that creator**. Then alert the
seller. Observation continues unchanged — the point is to keep reporting the
buyer's payment state, only without concluding from it.

**The lock is not decoration; it closes a real race (Sol P2).** The sentinel scan
reads "never assigned to any invoice" from the index at query time, but invoice
creation assigns indices under the creator lock and can assign the very index the
scan is holding evidence about — so a scan that queried before an assignment and
commits after it would downgrade a creator on an address that is, by then, a
legitimate invoice address. **Therefore: after acquiring the creator allocation
lock and before inserting the evidence row, re-check that the outpoint's address
is still unassigned and that its index has never been assigned to any invoice of
this creator.** If the re-check fails, the scan **discards** the candidate,
records it as `superseded_by_assignment` for telemetry, and does **not**
downgrade — the invoice's own amount predicate (§B.8.2) is what judges that
payment. This is the fail-safe direction: a genuine second allocator will produce
another hit on another index, while a legitimate assignment is never punished.

**The gate is read at the instant of the transition, not at invoice creation.**
Each invoice records `allocation_mode_at_creation` for audit, but the automatic
`paid` transition tests the creator's **current** mode. A downgrade therefore
protects invoices that were already live, which is the fail-safe direction and
the reason to pay the extra read.

**The dust caveat, stated honestly.** A confirmed output to a sentinel proves
that somebody besides paykit-server knew and used that derived address. It does
**not** distinguish a second wallet allocator from an attacker who learned the
xpub and dusted it. So an attacker who has the xpub can force a downgrade for
the price of one confirmed on-chain output. That is a **priced denial of the
automatic path, not a false payment** — no order is marked paid, no seller ships
anything, and the seller's checkout keeps working in `shared_manual`. Raising
the bar — raising `sentinel_min_value_sats` above relay-standard dust, or
`sentinel_hit_count` to 2 — raises the attacker's cost, delays detection, and
introduces false negatives; it is still not cryptographic attribution. **This is
an inherent Option 1 limitation and it is not fixable inside Option 1** —
§B.8.9 removes it by removing the inference. Both thresholds are the two
configured values in the predicate above, with a calibration test in both
directions (§D.3, F11), so the trade can be moved without a code change. This
is also why the evidence is named **unassigned-sentinel evidence** rather than
allocator evidence: the predicate is what the server can observe, and a second
allocator is an inference from it.

**Outage behaviour, and why it is not fail-closed.** If the sentinel scan cannot
reach Electrum, detection is simply unavailable for that tick. It does **not**
downgrade — an Electrum blip must not become a fleet-wide downgrade — and it
does not need to, because the safety argument for `exclusive` rests on §B.8.6's
claim-time checks and on Bitkit's allocator, not on detection. The **claim-time**
scan is the one that fails closed, and it already does (§B.5: an unscanned claim
is refused). A sustained sentinel-scan outage is covered by the §B.7 backlog-age
alert and by §B.7.1's auto-hide, which stops creation.

**Budget, and r5's version was not bounded (Sol P2).** r5 said "deprioritised
behind live invoice targets" and counted sentinel work in the §B.7 budget, but
deprioritisation bounds *ordering*, not *volume*: with 20 scripthashes per
creator on a 60-second cadence, 15 claimed creators alone consume the whole 5
req/s allowance before a single invoice history is fetched, so live targets would
starve behind a backlog they are nominally ahead of. r5 also quoted a **1-second
observer cadence**, which contradicts §B.7's required **30 s** poll interval and
made the arithmetic wrong in the reassuring direction. One cadence model, and a
hard ceiling:

- **One cadence, and it is §B.7's.** The observer polls every **30 s**
  (`poll_interval = "30s"`, §C row 6). There is no second clock: sentinel work is
  scheduled *within* that tick, never on a cadence of its own. A creator's
  sentinel window is re-scanned at most once every **10 minutes**, which is one
  sentinel batch every 20 ticks per creator. Every earlier reference to a
  1-second observer cadence is wrong and is corrected here.
- **A global sentinel token budget**, separate from and subordinate to the live
  budget: `sentinel_requests_per_tick`, defaulting to **10% of the tick's
  remaining allowance after every live invoice target is satisfied**, and hard-
  capped so sentinel work can never be the reason a live target is deferred.
  Sentinel work draws from that bucket only; when the bucket is empty for a tick,
  no sentinel scan runs.
- **Admission.** A creator is admitted to the sentinel set only while
  `allocation_mode = 'exclusive'` — a `shared_manual` creator has no automatic
  transition to protect (below), so scanning it buys telemetry at the price of
  the one budget that protects money paths. Admission is re-evaluated each tick,
  so a downgraded creator leaves the set on the next tick.
- **Freshness, stated as the SLO the budget must hold.** Every admitted
  creator's sentinel window is scanned at least once every
  `sentinel_max_age` = **1 hour**. This is the number the canary is sized
  against, and it is the input to the budget review before general availability
  — if admitted creators cannot be covered inside `sentinel_max_age`, the answer
  is more Electrum capacity or a smaller window, not silent staleness.
- **A sentinel-specific age alert.** §B.7's backlog-age alert covers live
  targets and would stay green while sentinel coverage decayed to nothing, so
  detection needs its own: alert when the **oldest admitted creator's last
  completed sentinel scan** exceeds `sentinel_max_age`. This alert is the only
  thing that distinguishes "detection is running" from "detection is configured",
  and its absence is exactly how a backstop becomes decorative. It does **not**
  gate creation and does **not** downgrade anyone — per the outage rule above, a
  sentinel outage must never become a fleet-wide downgrade.

**Durability.** Evidence rows and the mode are database state, so classification
survives restart by construction; the automatic-`paid` gate reads the creator row
rather than any in-memory cache, which is what makes that true rather than
merely intended (§D.3, F10).

**The seller alert fires on the mode transition only (Kimi P3).** Exactly one
alert per downgrade. Post-downgrade sentinel hits **record evidence rows and are
shown on the seller's status surface, and raise no further alert.** Alerting per
evidence row would let an attacker who has the xpub buy unbounded seller
notification churn at the price of one qualifying output per row, which is a
cheaper attack than the downgrade itself and has no upside — the mode is already
`shared_manual` and cannot be downgraded twice.

**For a `shared_manual` creator, detection changes nothing** except that the
evidence is recorded and shown to the seller. There is no automatic transition
to suppress, which is also why such a creator is not admitted to the sentinel
set at all.

#### B.8.8 `shared_manual` checkout — seller-confirmed payment (D2)

**What stays the same.** Bitcoin is still offered on this seller's listings.
paykit-server still derives the address, still takes the baseline, still mints
the nonce, still publishes through two-phase (§B.11), still observes, and still
reports `detected` and `confirmed` with `amount_matched`. The buyer still gets a
real Paykit Payment Request in their wallet and still sees their payment state
in Shop. The only thing removed is the **inference**: no chain observation moves
this order to `paid`.

**paykit-server.** Phase 1's response and the transaction-status response each
gain `allocation_mode`, so the marketplace never has to ask a second endpoint on
the money path. Phase 1 also returns **`stack_id`** (r7 — the stack-identity
contract below), and `activate`, `void` and `resolve` echo it (r8 — r7 said
"activate and resolve" here and "activate, void and resolve" everywhere else;
the canonical `void` body in §B.11.3 now carries the field, so this sentence is
the one that was wrong). Nothing else in §B.11's message set changes.

**marketplace-service — order state.** One new payment state on the existing
`paykit_request_state` machine:

| State | Reached from | Meaning | Poller behaviour |
| --- | --- | --- | --- |
| `awaiting_seller_confirmation` | `detected` or `confirmed` on an invoice whose creator is `shared_manual`, **and** the observation is not `late_settlement` | the chain shows a matching payment; Shop is waiting for the seller | the order is **not** claimed for automatic advancement; it is claimed on the **status-only** path (§B.11.2), which updates confirmations, expiry, disappearance and reorg and can never transition it to `paid` |

**Entry from `detected` is deliberate, and the confirmations check is the
seller's (Kimi P3).** Entry at 0 confirmations means a seller may confirm a
mempool-only transaction. That is intended, not an oversight: the whole point of
`shared_manual` is that the judgement is the seller's, made in their own wallet,
where they can see the confirmation count the server also shows them; the harm of
a premature confirmation is the seller's own (§B.10, R5); and the
`confirmations` value at that instant is frozen into the audit record so a later
dispute can read what they acted on. **No confirmations precondition is to be
added to the endpoint** — doing so would move a seller-judgement decision into a
server rule, which is the opposite of D2. Recorded as a decision so a later
implementer does not read the table as a bug.

**`late_settlement` takes precedence, and a late observation never enters this
state (Kimi P2).** An eligible observation recorded in the §B.9 expiry tail
carries `late_settlement = true` and can never drive `paid`. If such an
observation arrives on a `shared_manual` creator — even reporting `confirmed`,
even with an exact amount — the **`late_settlement` edge fires and the
`awaiting_seller_confirmation` edge does not.** The existing late-settlement
path routes it to `manual_review` (`workers.rs:787-820`), unchanged. The reason
is concrete: entering `awaiting_seller_confirmation` extends an inventory hold,
and extending a hold on an order whose payment window already closed would hold
stock for a dead order. Priority is therefore explicit rather than implied by
edge ordering.

Consequences that have to be decided rather than left to fall out:

- **The inventory hold is extended, not expired.** A buyer who has demonstrably
  paid on chain must not lose their order to a 3600 s hold timeout while waiting
  for a human. On entry to `awaiting_seller_confirmation` the hold is extended to
  a bounded **seller-confirmation window of 24 hours** (D6). The window is
  **aligned with §B.9's 24-hour observation tail** rather than chosen
  independently, so an operator reasons about one number and the order's window
  cannot outlive the observation that justified it by an order of magnitude, as
  r5's seven days did.
- **At the end of that window the reaper routes the payment to
  `manual_review`**, the existing operations path (`workers.rs:787-820`), never
  to `paid` and never to a silent cancellation. Its conditional update is
  `orders.paykit_request_state = 'awaiting_seller_confirmation'` → `'confirmed'`
  plus `payments.state = 'manual_review'`; the condition makes it race the
  seller-confirm path safely, so first committer wins. An operator then resolves
  it with the buyer and the seller.
- **The inventory stays held through operator resolution (Kimi P3).** Routing to
  `manual_review` does **not** release the hold. The stock remains held until an
  operator resolves the order as **paid, refunded or abandoned**; only that
  resolution releases or consumes it. Releasing at routing would put a buyer who
  has demonstrably paid on chain into a race with other buyers for the item they
  already paid for, which is the same failure the extended hold exists to
  prevent — one day later. The cost is stated rather than hidden: **stock can be
  held indefinitely by an unresponsive operator**, so the hold carries an
  explicit **operator SLA of 2 business days** from the routing to
  `manual_review`, alerting on breach. That SLA is an operations commitment, not
  a state transition: nothing automatic fires at the end of it, because every
  automatic option (release the buyer's item, or mark it paid) is worse than a
  page.
- **The §B.9 observation tail is unchanged.** The invoice still moves to
  `expired_tail` and then `expired_final` on paykit's own clock; the marketplace
  order outliving the invoice's observation window is expected here, and the
  seller's confirmation is authoritative for the money outcome
  (`POST /v0/invoices/{id}/resolve` with `paid_manually`, which §B.9 already
  defines and which the confirm endpoint calls). Because the window and the tail
  are both 24 hours, the two now expire in the same neighbourhood rather than
  six days apart.

**The complete transition table for `awaiting_seller_confirmation` (Sol P2).**
r5 named the entry edge and the window and left every other pairing to fall out
of the implementation. Every reachable event is listed; anything not in this
table is not a transition.

| Event while `awaiting_seller_confirmation` | Order state after | Inventory | Why |
| --- | --- | --- | --- |
| **Confirmation progression** (1 → 2 → *n* confirmations) | unchanged — `awaiting_seller_confirmation` | held | Status-only polling updates the displayed count for buyer and seller (§B.11.2). Confirmations are the seller's input, never an automatic trigger |
| **Disappearance / reorg** — the observed output is no longer in the chain or the mempool | unchanged, with the observation marked `disappeared` and **shown to the seller** | held | The order does not silently revert, and it does not advance either. The seller is the decider and now has the one fact that should change their decision. Q10 already discloses that no automatic reorg edge exists; this state does not invent one |
| **A second distinct eligible observation arrives after a `disappeared` mark** (r7, Kimi P3) | unchanged — `awaiting_seller_confirmation`, with the refreshed observation shown to the seller | held | The status-only path writes the newer observation as the live display value (§B.11.2); the seller sees that a payment is visible again and decides on that. It does **not** re-enter the state (it is already in it), does not advance anything, and does not overwrite `paykit_observation_state_at_confirmation`, which is written once and only at confirmation. Listed because "anything not in this table is not a transition" makes the omission read as a defect rather than a no-op |
| **Invoice reaches `expired_tail`** | unchanged | held | The marketplace order deliberately outlives the invoice's observation window. The frozen observation already recorded at entry is what the confirm endpoint reads |
| **Invoice reaches `expired_final`** | unchanged | held | Same reason. A confirm after `expired_final` still succeeds and `resolve` records it for audit without resuming observation (§B.9) |
| **Late first detection** — the first eligible observation arrives only in the tail, carrying `late_settlement` | **never enters this state**; `manual_review` | per the existing late path | The precedence rule above. Stated in the table too, because "the state it never reaches" is exactly the pairing an implementer fills in wrongly |
| **Creator downgraded after the order was already `paid`** | unchanged — `paid` | consumed | A downgrade is one-way and forward-looking; there is no un-pay edge anywhere in this design (`workers.rs:862-918`). §B.11.4 A3 covers the `observing` case; this row covers the already-settled one so nobody adds a retroactive edge |
| **Seller confirms** | `paid`, with the audit record and the fulfilment intent | consumed | The one intended exit. Conditional UPDATE, below |
| **24-hour window elapses (the reaper)** | `orders.paykit_request_state='confirmed'`; `payments.state='manual_review'` | **held** through operator resolution | The reaper conditionally updates an elapsed order only from `awaiting_seller_confirmation`, writes `payments.state = 'manual_review'`, and leaves no later resolution row to be written before this transition; D6 and the hold rule above |
| **Operator resolves from `manual_review`** | `paid`, `refunded` or `abandoned` | released or consumed by that resolution | The existing operations path, unchanged. It resolves the `payments.state='manual_review'` payment and writes a `paid_manually` row for a `paid` outcome with `confirmation_basis = 'operator_resolution'`; the audit trail distinguishes it from a seller confirmation because `confirmation_source` differs |
| **Seller confirm races the reaper** | whichever commits first; the loser gets a named precondition error | per the winner | The next paragraph |

**The confirm-vs-reaper race, resolved by construction (Kimi P2).** Both the
seller confirmation and the window-expiry routing move the same order out of the
same state, and r5 specified no winner — an implementation that landed both would
produce an order that is simultaneously `manual_review` and `paid`. Both
transitions are therefore **a single conditional UPDATE predicated on
`state = 'awaiting_seller_confirmation'`**, with every side effect (audit row,
fulfilment intent, outbox row) committed in the same transaction as that UPDATE:

- **First committer wins.** The UPDATE's affected-row count is the decision; no
  advisory lock, no read-then-write, and no reliance on the reaper's schedule.
- **The loser changes nothing.** A confirm that affects zero rows returns the
  named precondition error `order_not_awaiting_confirmation` — the same error a
  confirm on any other state gets — and writes no audit row and no outbox row. A
  reaper pass that affects zero rows logs and moves on; it does not retry.
- **A seller who loses is not stuck.** The order is in `manual_review` with the
  frozen observation attached, and the operator resolution path is the exit. The
  error copy points there.
- **This is tested, and it was the one race with no test** (§D.3, **F16**):
  drive the confirm and the expiry concurrently against one order and assert
  exactly one transition committed, exactly one audit row, exactly one fulfilment
  event, and the named precondition error on the loser — in both orderings.

**marketplace-service — the confirm endpoint.**
`POST /v0/orders/{id}/confirm-bitcoin-payment`, body `{reason}`. The body no
longer carries `txid` or `confirmed_amount_sats`; see the audit fields below.

- **Who may call it: the seller of record for that order's listing, and nobody
  else.** Not the buyer, not an unauthenticated caller, not an operator. An
  operator resolving a stuck order uses the existing `manual_review` resolution
  path, so the audit trail distinguishes a seller's confirmation from an
  operator's intervention rather than collapsing them into one record. Any other
  caller gets `403 not_order_seller`, and the attempt is logged.
- **The credential, named (Kimi P2).** r5 stated the authorisation rule and left
  the credential implied. Because §C row 4e calls this "the only path in the
  design that marks an order paid without chain evidence", the sentence that
  names the credential is load-bearing: **the caller authenticates with the
  marketplace session; the endpoint resolves the order to its listing and the
  listing to its seller pubky, and requires that pubky to equal the session's
  pubky; the pubky is taken from the session and never from the body.** All four
  clauses matter — a body-supplied pubky would make the endpoint
  self-authorising, and resolving through the order rather than trusting a
  caller-supplied listing is what stops a seller confirming somebody else's
  order. F14 already asserts the recorded pubky is the authenticated seller's and
  cannot be supplied in the body; this states the rule that assertion is testing.
- **It is refused unless the order is in `awaiting_seller_confirmation`**, with
  the named error `order_not_awaiting_confirmation`. A seller cannot confirm an
  order that has no observed payment. This is the same error a confirm gets when
  it **loses the race** to the window reaper, because it is the same predicate:
  the state check is the conditional UPDATE, not a separate read.
- **It is idempotent on order id**: the second call returns the same
  confirmation record, emits no second fulfilment event, writes no second
  audit row, and enqueues no second outbox row.
- **The ordering of those two rules is specified, because they read as though
  they contradict each other (r7, Sol P3).** The endpoint refuses every order
  that is not `awaiting_seller_confirmation`, and a second call arrives after the
  first has moved the order to `paid` — so a naive reading has idempotency
  returning `order_not_awaiting_confirmation`. The order of operations is
  therefore fixed: **(1)** authorise (session → order → listing → seller pubky);
  **(2)** look up an existing seller-confirmation record for that order id and,
  if one exists, return it unchanged, writing nothing — the idempotency lookup
  runs *before* the state check and is only reachable by the authorised seller;
  **(3)** otherwise execute the conditional UPDATE, and its affected-row count is
  the decision. Zero rows means `order_not_awaiting_confirmation`, whether the
  order was never in the state or the reaper won. The audit row, the fulfilment
  intent and the outbox row are written **inside** the same transaction as that
  UPDATE and never before it, so an unauthorised or losing call cannot leave an
  audit row behind and a second call cannot produce a second one.
- **Audit fields**, written in the same transaction as the state change:
  `confirmed_by_pubky`, `confirmed_at`, `confirmed_txid`,
  `confirmed_amount_sats`, `confirmed_reason`, `confirmation_source`
  (`seller`), `confirmation_basis` (`seller_attestation` — the paragraph below),
  and `paykit_observation_state_at_confirmation` — the exact
  `{state, observed_sats, confirmations, amount_matched}` paykit reported at
  that instant, frozen, so a later dispute can be read without re-querying a
  chain that has moved.
- **`confirmed_txid` and `confirmed_amount_sats` are derived from the stored
  Paykit observation, never from the seller's body (Sol P1).** r5 took both from
  the request body and wrote them into the record that a dispute is later read
  from, so a seller could confirm a real payment while attributing it to a txid
  and an amount of their choosing — and the audit trail would say what they
  typed, not what happened. The rule:
  - Both fields are written from the **stored observation** the marketplace
    already holds for that invoice (the same `{state, observed_sats,
    confirmations, amount_matched}` and outpoint it froze on entry to
    `awaiting_seller_confirmation`). The server does not ask the seller for
    them and does not need to.
  - **If the seller's client supplies either field anyway, it must equal the
    observation exactly** — `txid` equal to the observed outpoint's txid, and
    `confirmed_amount_sats` equal to `observed_sats`. Any disagreement is
    **rejected** with `confirmation_observation_mismatch`, with no state change
    and no audit row, and the attempt is logged. Ignoring a disagreeing value
    would be worse than rejecting it: it would let a client believe it had
    recorded something it had not.
  - This is why the request body is `{reason}` alone. The equality rule exists
    for clients that send the fields regardless, not as an interface the design
    invites.
  - It does **not** change what a **buyer**-supplied txid is worth: still
    `buyer_reported_txid`, still shown to the seller as unverified, still an
    input to nothing (below).
- **A buyer-supplied txid is supporting evidence only.** It is recorded as
  `buyer_reported_txid` on the payment, shown to the seller as unverified, and
  is **never** an input to any automatic transition or to the endpoint's
  preconditions.

**What gates a `paid_manually` resolution: nothing beyond the seller's
attestation, said in those words (r7, Sol P2).** Sol asks what evidence gates the
seller's click. The answer is a decision rather than a mechanism, and it is
recorded here so no later reader mistakes the audit trail for proof: **the
endpoint is attestation-only.** There is no confirmation-depth floor, no
second-factor, and no chain re-verification at confirm time — deliberately,
because a server rule about confirmations is the thing D2 moved out of the
server's hands, and because the server's view is strictly worse than the
seller's own wallet's. What the design does instead, and what it therefore
buys:

- **A server-side precondition, not a proof.** The order can only be in
  `awaiting_seller_confirmation` because paykit recorded an eligible observation
  for that invoice (§B.8.8's entry rule). So a confirm always sits on top of *an*
  observed payment; what the seller attests is that it is *this buyer's* payment,
  which no server on this rail can establish (§B.3).
- **The confirmation depth is disclosed, never enforced.** The status-only poll
  path (§B.11.2) keeps `confirmations` live on the seller's surface, and the
  seller copy says in the imperative to check address, amount and confirmations
  in their own wallet. A seller confirming at 0 confirmations is doing something
  the design permits and shows them the cost of (§B.8.8's 0-conf paragraph).
- **The attestation is named in the audit row.** Alongside the fields below, the
  record carries **`confirmation_basis = 'seller_attestation'`** — a constant, not
  a computation — so a dispute reads "the seller asserted this" rather than
  inferring evidentiary weight from the presence of a frozen observation. An
  operator resolution from `manual_review` writes
  `confirmation_basis = 'operator_resolution'` for the same reason
  `confirmation_source` already distinguishes the two.
- **The cost, stated:** a seller who clicks without looking produces a `paid`
  order with a complete, attributable audit trail and no payment. That is
  **residual R5** (§B.10) exactly, it is not closable by a marketplace, and the
  attestation field is what keeps it attributable rather than anonymous. This
  design adds no payment-proof mechanism here; the only thing that would is
  §B.8.9's account-key signature, which is Wave 10 (D4, D7).

**What commits, and what is delivered afterwards (Sol P1).** r5 wrote the audit
fields, the state change and a remote `resolve` call as though they were one
atomic act, and separately claimed a confirmation survives repointing
`PAYKIT_SERVER_URL`. Both cannot be true: a marketplace transaction cannot
include a call to another service, and r5's own §B.11.8 already solved this shape
for activation. The confirm endpoint uses the same shape:

- **One local transaction, three rows, no network call inside it.** The
  conditional UPDATE out of `awaiting_seller_confirmation`, the audit record, the
  fulfilment intent, and a **`paykit.resolve` outbox row** all commit together or
  none of them do. The endpoint returns success on that commit. **The seller's
  confirmation is authoritative for the money outcome at that instant**, whether
  or not paykit has heard about it — which is the property r5 wanted and did not
  have a mechanism for.
- **The outbox row is pinned to the originating stack, by identity *and* by
  address.** It carries the `stack_id` of the paykit stack that issued the
  invoice and **`paykit_stack_endpoint`, the base URL the marketplace itself
  used for phase 1** (r8), alongside `paykit_invoice_id` and the resolution. The
  delivery arm sends to the row's pinned endpoint and refuses to send to any
  other stack. Without the identity pin, a row queued before a repoint would be
  delivered to the *new* stack, where the invoice id is either unknown or —
  worse — belongs to a different invoice; without the address pin, a row created
  **after** the repoint has nowhere correct to go at all, which is the §C.16
  condition-6 gap r7 left open (Sol P2 #3).

**The `stack_id` contract, because r6 asserted the pin without making it
enforceable (r7, Sol P1-4, Kimi P2-2).** r6 named the field and the refusal and
specified neither the value's provenance — the phase-1 response carried no
`stack_id` — nor what the delivery arm compares against. A pin with no minting
rule and no comparison anchor is a sentence, not a mechanism, and F14/W1.15 were
testing a contract that did not exist on paper. The contract in full:

- **paykit-server mints it, once per stack instance, into its own database.**
  `stack_id` is `{PAYKIT_STACK_ROLE}:{instance_uuid}`, where `instance_uuid` is a
  v4 UUID written to a single-row `stack_identity` table the first time that
  database is migrated and **never rewritten**; a boot that finds the row uses
  it, a boot that finds none creates it inside the migration transaction. The
  **role alone is deliberately not the identity**: a replacement production
  stack carries the same role and would pass a role comparison, which is exactly
  the same-role/wrong-instance mixup the pin exists to catch (Sol). Two stacks
  can therefore never share a `stack_id` without sharing a database — and that
  case is **P1-C, not a boot refusal (r8, Kimi P3-3)**. §A and §B.6 refuse
  sharing a database across networks or across stack roles; sharing one between
  two stacks of the *same* role is refused by nothing (§C row 12). It is harmless
  to the pin for a mechanical reason rather than a governance one: the two stacks
  read the same `stack_identity` row and therefore the same invoice set, so there
  is nothing for the pin to distinguish and no misdelivery to catch. The
  exposure of that configuration is P1-C's, not this contract's.
- **It is carried on every message on this path.** Phase 1's response gains
  `stack_id` (§B.11.3); `/health/ready` reports it (§B.7.2 hop 1); the
  account-claim response returns it, which is how a seller's wallet learns the
  identity it must sign a §B.8.9 reservation pool for; and `activate`, `void` and
  `resolve` requests **echo** it. The marketplace **persists the value phase 1
  returned** as `paykit_stack_id` on the order row, in the same transaction as
  the bind (§C row 4d), and copies it onto the `paykit.resolve` outbox row at
  confirm time. The persisted value is the issuing stack's identity; nothing
  later re-derives it from configuration, which is the whole point — after a
  repoint, configuration is precisely the thing that has changed.
- **The address is persisted next to the identity, and the arm routes by the
  address (r8, Sol P2 #3).** In the same transaction as the bind, the
  marketplace also persists **`paykit_stack_endpoint`** on the order row: the
  base URL it used for the phase-1 call, taken from `PAYKIT_SERVER_URL` **as it
  read at that moment** and then frozen. It is copied onto the `paykit.resolve`
  outbox row with the `stack_id`, and **the delivery arm dials the row's pinned
  endpoint, not the current default.** The distinction is what closes §C.16
  condition 6 under future writes: a resolution row created *after* a repoint —
  a seller confirming in the tail of their 24 h window, or an operator resolving
  `manual_review` (§B.9) — must still reach the stack that issued the invoice,
  and the current default URL is by construction the wrong one. The endpoint is
  **trusted** in the only sense that matters here: it is the marketplace's own
  configuration at bind time, not a value the remote stack supplied, so a stack
  cannot redirect its own resolutions.
- **The arm compares two things, not one.** Before sending, the delivery arm
  compares the row's `stack_id` against the `stack_id` the **row's pinned
  endpoint** reports on `/health/ready` (cached per endpoint under the same 15 s
  TTL as `bitcoin_offer_available`, §B.7.2 — per endpoint rather than per
  process, because after a repoint two endpoints are in play at once). A
  mismatch means that address is now answered by a different stack, so the row is
  **never sent**: it terminates `terminal_unresolved` with reason
  `stack_pin_mismatch`, and alerts. The request body also carries `stack_id`, and
  paykit refuses a body naming another stack with **`stack_identity_mismatch`**
  (409). The second check is not redundant: the address can be re-bound to
  another stack between the readiness read and the send, and a remote refusal is
  the only half of the check that cannot be raced.
- **The old stack is retained until no order can still create a resolution row
  (r8).** Routing to a pinned address only works while something answers at that
  address, so the repoint step in §C row 16 is now explicitly *not* a teardown
  step: the old stack stays up, **read-only for new binds**
  (`PAYKIT_BITCOIN_CREATION_ENABLED=false`, which is already step 1 of the
  rollback) while **still serving `activate`, `void` and `resolve`** for the
  invoices it issued. The precise retention condition, and the reason it is a
  condition rather than a duration, is §C.16's **condition 7**.
- **What the pin does not claim.** The readiness read is authenticated by TLS to
  the configured host and by nothing else, so a stack that lies about its own
  `stack_id` defeats the local half. The remote half is what still holds, and it
  holds for a mechanical reason rather than a trust one: a stack that never
  issued this invoice cannot produce it, so it answers `unknown_invoice`, which
  is a mapped terminal outcome in the table below. The pin's job is to turn a
  silent misdelivery into a named, alerting termination — not to authenticate a
  remote service.

**Delivery is retried, and every response class has exactly one outcome (r7,
Kimi P1-1, Sol P2).** r6 wrote "retried until it succeeds or terminates" and then
instantiated termination for a single rejection, while §B.9's table defines four
more permanent ones and the transport layer several more. An unmapped permanent
rejection retries forever, which falsifies "not retried forever" in the same
paragraph and **deadlocks §C.16 drain condition 6** — the checklist an operator
must clear before repointing. "Exactly like `paykit.activate`" did not transfer,
because §B.11.8 enumerates its terminal errors and bounds its retry and the r6
resolve arm did neither. This is the complete mapping — **twelve rows in r8**,
eleven in r7 plus the transient-status row below. It is stated once here and
referenced from §B.9 and §C.16; `resolve` is idempotent on
`(invoice_id, resolution)` (§B.9), so redelivery cannot apply twice, and delivery
stamps `delivered_at` with the row's state change in one transaction.

**The rule that decides transient from permanent, stated before the table, because
r7's table claimed totality while its last row terminalized transient statuses
(r8, Sol P2 #2).** Classification is by **HTTP status first, application code
second**, and in that order:

1. A **transport failure** (connection refused, TLS failure, timeout, unroutable
   host) is transient.
2. A status in the **named transient set — `408`, `425`, `429`, and any `5xx`
   including `502` / `503` / `504`** — is transient. These are the statuses that
   mean *"not now"* rather than *"not ever"*: a request timeout, an early-data
   replay refusal, a rate limit, and a server or proxy that is unavailable or
   overloaded. r7 folded `5xx` into the transport row and left `408` / `425` /
   `429` to fall through to "any unrecognised code", which terminalized a row
   that would have succeeded on the next attempt — the exact opposite of the
   defect that table was written to remove.
3. `401` / `403` is transient **with an immediate alert**, for the reason its row
   gives: it is operator-fixable inside the deadline.
4. Everything else is **permanent**: every `2xx` is one of the two success rows,
   every recognised paykit application error code has its own row, and any other
   status or any unrecognised **application** error code terminates.

Transient means *retry under the `resolve_delivery_deadline`*, never *retry
forever* — the deadline below terminates every retrying row regardless of class,
which is what makes the transient half bounded and the totality claim true.

| Response from `resolve` | Row outcome | Alert | Why this outcome |
| --- | --- | --- | --- |
| **2xx**, resolution recorded | `delivered` | no | The normal path |
| **2xx**, already resolved with `paid_manually` (§B.9's idempotent row) | `delivered` — **terminal-ok, a no-op** | no | Redelivery of a row whose effect already landed. It is a success, not a rejection, and must not be counted as one |
| **`unknown_invoice`** | `terminal_unresolved`, reason `unknown_invoice` | **yes** | The stack was torn down, or its database dropped after a drain. paykit's audit copy is unrecoverable; retrying cannot recreate an invoice |
| **`invoice_not_activated`** (invoice is `prepared`) | `terminal_unresolved` | **yes** | Nothing was ever published, so no buyer could have paid it (§B.11.5). A confirm against it means the marketplace holds the wrong invoice id — an engineering defect, not a transient |
| **`invoice_already_resolved`** (existing `refunded` or `abandoned`) | `terminal_unresolved` | **yes** | Two disagreeing money outcomes for one invoice. Retrying cannot resolve a conflict; §B.9 already refuses last-writer-wins, so a human is the only exit |
| **Named void error** (`void_baseline_failed`, `void_prepare_expired`, `void_cancelled`) | `terminal_unresolved` | **yes** | A void invoice was never payable — the same defect class as the row above, and permanent for the same reason |
| **`awaiting_baseline`** named error | **retry**, bounded by the deadline below | on the deadline only | The one genuinely transient invoice state: a snapshot in flight clears within a tick or fails to `void_baseline_failed`, which is the row above |
| **`stack_identity_mismatch`** (remote) or `stack_pin_mismatch` (local, never sent) | `terminal_unresolved` | **yes** | The pin fired. A stack that cannot own this invoice id cannot ever accept the row |
| **Transport failure** — connection refused, TLS failure, timeout, unroutable host, **and any `5xx` (including `502` / `503` / `504`)** | **retry** on the existing lease-and-backoff schedule, bounded by the deadline | on the deadline | The blip case the outbox exists for. Sustained failure is not distinguishable from a torn-down stack, which is why the deadline and not the class is what terminates it. `5xx` is named here explicitly in r8 so no reader has to decide whether a `503` from a proxy is "transport" |
| **`408` / `425` / `429`** — request timeout, too-early, rate-limited (r8) | **retry**, bounded by the deadline; on `429` (or `503`) with a valid `Retry-After`, schedule `min(resolve_delivery_deadline, max(backoff_due_at, retry_after_due_at))` — see the bullet below | on the deadline | These are "not now", not "not ever". A rate limit is the one class where the *server* has told the client when to come back, but it cannot shorten the existing backoff and make the worker spin. A row terminated on a `429` loses paykit's audit copy of a real money outcome that the next attempt would have recorded. r7 left these to the unrecognised-code row, which terminalized them |
| **401 / 403** — body-signature or trusted-key mismatch | **retry**, bounded by the deadline, **and alert on the first occurrence** | **yes, immediately** | A key rotation or a misconfigured trusted key is fixable by an operator inside the deadline, and alerting on the first occurrence is what makes that possible. It is a configuration defect either way |
| **Any other status, or any unrecognised paykit application error code** | `terminal_unresolved`, reason `unmapped_resolve_error` with the status and code recorded | **yes** | Fail-visible rather than fail-forever. An unknown code retried indefinitely is exactly the deadlock this table exists to remove, and the recorded status and code are what tell the next round which row to add. This is the **permanent** default: a code nobody has classified is treated as an application refusal, which is what an unrecognised `4xx` almost always is (r8) |

- **The delivery deadline, so that no class can retry without a bound.**
  `resolve_delivery_deadline` = **1 hour** from the row's creation. At the
  deadline a row still in retry becomes `terminal_unresolved` with reason
  `delivery_deadline_exceeded` **regardless of class**, and alerts. One hour sits
  between the two things it has to separate: it is far longer than the
  marketplace's outbox cycle, a pod restart, or an operator fixing a trusted key,
  and short enough that it does not dominate §C.16's boundary — it adds **at most
  one hour** to the ~25 h drain, which §C.16 now states as arithmetic instead of
  r6's claim that condition 6 was free.
- **`Retry-After` is honoured as a floor, and the deadline still wins (r9).** On
  a `429` or a `503` carrying a valid `Retry-After`, compute
  `next_lease_at = min(resolve_delivery_deadline,
  max(backoff_due_at, retry_after_due_at))`. The server can extend the wait for
  its own capacity, but cannot shorten the normal lease-and-backoff delay:
  `Retry-After: 0`, a near-zero HTTP date, and a past HTTP date therefore leave
  the normal backoff intact rather than hot-looping for an hour. Delay-seconds
  and HTTP-date forms are both accepted; a malformed value falls back to the
  normal backoff. The final deadline clamp means no retry can run after
  `resolve_delivery_deadline`; if `next_lease_at` reaches it, the row terminates
  `delivery_deadline_exceeded` there without a final attempt. The header changes
  *when* a retry may happen, never whether the row outlives its deadline or
  whether it can bypass backoff.
- **The operator escape, because a stuck row must never block a rollback.** The
  runbook (§C row 17) carries one action: an operator may terminate a **named**
  undelivered row, which writes `terminal_unresolved` with reason
  `operator_terminated`, the operator's identity and their reason text, and
  alerts. **It does not un-pay the order, and it cannot** — there is no un-pay
  edge anywhere in this design (`workers.rs:862-918`, and the transition table
  above). The order stays `paid`, the audit record and the fulfilment intent
  stand, and what is discarded is paykit's copy of an outcome the marketplace
  already owns and is authoritative for. The escape exists so condition 6 is a
  condition an operator can **clear** rather than one they can only wait on.
- **Every outcome in the table leaves the order `paid`.** The marketplace's
  record is authoritative for the money outcome (§B.9 says exactly this for
  `expired_final`), and what a terminal row loses is only paykit's audit copy of
  it. Every alert exists so that loss is visible at the moment it happens rather
  than inferred later from a reconciliation gap. This is a liveness and
  audit-trail mechanism, not a money-safety one — no row in the table can move
  money or reverse a confirmation.
- **Unresolved rows gate the drain, and terminal rows are acknowledged rather
  than merely counted** (§C.16, condition 6). An operator who repoints while
  `paykit.resolve` rows are undelivered strands exactly the audit trail this
  endpoint exists to produce, so condition 6 requires every row to be
  `delivered` **or** `terminal_unresolved` **with an operator acknowledgement
  recorded against it**. Acknowledgement is a deliberate step and not a
  formality: a `terminal_unresolved` row is a real money outcome paykit does not
  know about, and the acknowledgement is where an operator writes down what they
  did about it before the rollback proceeds.

**Copy — static, no server text interpolated into UI (house rule).**

- Buyer, on a `shared_manual` seller's checkout, before paying:
  > **This seller confirms Bitcoin payments manually.** Your order is confirmed
  > once the seller checks the payment, usually within a day.
- Buyer, after the payment is observed:
  > **Payment received — awaiting seller confirmation.** We can see your payment
  > on the Bitcoin network. Your order is confirmed once the seller checks it.
  > You'll be notified when that happens.
- Buyer, if the 24-hour window elapses:
  > **This order needs a human.** Your payment is with the seller and our support
  > team is looking at your order.

  With a 24-hour window the buyer sees this on **day 2**, which is what makes
  "usually within a day" above an honest sentence rather than one contradicted
  by a hold a week long, as r5's was (Sol P3). The item stays held for them
  while support works it.
- Seller, on the order awaiting their action:
  > **Check this payment in your own wallet before confirming.** Shop can see a
  > payment on the Bitcoin network, but cannot prove it came from this buyer.
  > Confirm the address, the amount and the confirmations in your wallet, then
  > mark this order paid.

None of these interpolate an address, an amount, a txid, a tip height, a seller
name or any other server-supplied string into the sentence. The order's own
amounts and identifiers are rendered by the surrounding order UI, which already
owns them; the copy is fixed text, and **W1.16** asserts it against a snapshot so
a later copy pass cannot start interpolating. (r5 cited W1.14 here, which is the
sentinel-detection slice; the snapshot assertion is W1.16's — Kimi P3.)

**Copy for the downgrade and restore surfaces (r6, Sol P2).** r5 specified
twelve static strings for the checkout path and left the three surfaces that tell
a seller something went *wrong* as descriptions of intent — a post-restore
warning, a downgrade alert, and "a named reason" for each downgrade. Those are
the highest-stakes strings in the design, because each is the only notice a
seller gets before a silent failure becomes a false paid or a lost sale. They are
fixed here, under the same house rule and the same snapshot assertion (W1.16 for
the Shop surfaces, W1.17 for Bitkit's).

- **Seller, on downgrade from `exclusive` to `shared_manual`** (fires once, on
  the transition — §B.8.7):
  > **Automatic Bitcoin confirmation is off for your account.** We saw activity
  > on your Shop Bitcoin account that Shop did not create. Your Bitcoin checkout
  > still works, and you now confirm each payment yourself. To go back to
  > automatic, connect a new Shop account from Bitkit.
- **The named downgrade reasons**, one fixed string each, shown on the seller's
  status surface and returned by the claim response. The reason is a stable
  identifier plus fixed copy; the copy never interpolates the seller's index,
  key, address or history:
  | Reason identifier | Seller-visible copy |
  | --- | --- |
  | `claim_channel_not_bitkit` | **This account was entered manually.** Automatic confirmation needs an account Bitkit reserved for Shop. |
  | `account_index_zero` | **This is your wallet's main account.** Automatic confirmation needs a separate account reserved for Shop. |
  | `account_index_mismatch` | **This account's details do not match.** Automatic confirmation needs an account Bitkit reserved for Shop. |
  | `account_has_history` | **This account has already been used.** Automatic confirmation needs an account that has never received a payment. |
  | `unassigned_sentinel_evidence` | **We saw activity Shop did not create.** Automatic confirmation is off for this account. |
- **Seller, in Bitkit, after a restore that recovered allocation state**
  (§C row 19, W1.17):
  > **Your Shop account was restored.** Keep using this account for Shop only —
  > receiving into it from another wallet can cause a Shop order to be marked
  > paid when nobody paid it.
- **Seller, in Bitkit, after a restore that did *not* recover allocation state**
  — the one condition that turns §B.8.5's invariant into residual R3, and the
  reason this string gets deep-reasoning review rather than a copy pass:
  > **Your Shop account settings did not come back.** This account may reuse an
  > address Shop is watching, which can mark an order paid when nobody paid it.
  > Connect a new Shop account before selling.

None of the **eight** strings fixed in this block — the downgrade alert, the five
named downgrade reasons, and the two post-restore warnings — interpolates a
server-supplied or wallet-supplied value (r7, Kimi P3: r6 wrote "none of the
five", which had no antecedent). The account itself is named by the surrounding
UI, which already owns it.

#### B.8.9 Wave 10 — the target architecture: wallet-issued signed reservation pools (D4)

**Recorded as the migration target, not built this week.** The reason it is the
target rather than another mechanism to bolt onto derivation: it **removes the
independent allocator instead of inferring it from chain traffic.** paykit-server
stops deriving "the next" receive address and consumes an address the seller's
wallet has already reserved, so automatic checkout becomes contingent on wallet
coordination rather than on a probability. It cannot ship this week — both Bitkit
apps and paykit-server are **L** changes and no third-party wallet emits this
schema — which is exactly the staging D1–D4 take: exclusive Bitkit now, signed
pools next, third-party plugins later, detection throughout.

**Homeserver objects.**

- Existing marker, unchanged: `/pub/paykit/v0/bitkit/server/receiver.json`.
- Pool generation:
  `/pub/paykit/v0/private/bitkit/server/address-pools/{xpub_fingerprint}/{sequence}.bin`
- Revocation:
  `/pub/paykit/v0/private/bitkit/server/address-pool-revocations/{pool_id}.bin`

These blobs are **encrypted to the receiver Noise key advertised by the marker**,
because publishing future addresses in plaintext enables tracking and pre-emptive
dusting — the same dusting that §B.8.7's caveat prices. The claim capabilities
already cover the public and private receiver subtrees
(`paykit-server/src/bitkit_claim.rs:20-23`), so no new grant is needed.

**Signed plaintext schema** (canonical JSON; the `signature` field is omitted
while hashing):

```json
{"version":1,"domain":"paykit-address-pool","network":"mainnet",
 "stack_id":"production:6f1d0c2a-9b47-4e35-8a10-73c5e2d84b19",
 "seller_pubky":"…","receiver_path":"bitkit/server",
 "xpub_fingerprint":"16 hex","account_index":7,
 "pool_id":"uuid","sequence":12,"created_at":"RFC3339","expires_at":"RFC3339",
 "entries":[{"reservation_id":"uuid","index":104,"address":"bc1q…"}],
 "signing":{"scheme":"bip340","key":"account-xpub-node"},
 "signature":"hex"}
```

**Why the Pubky write is not sufficient, which is the crux.** The homeserver
write authenticates the seller's *identity*; it does not prove *xpub control*.
So the pool additionally carries a **BIP340 signature by the account private key
corresponding to the claimed account xpub**, over the tagged hash
`Paykit/AddressPool/v1 || SHA256(JCS(payload))`, verified against the public key
embedded in the account xpub. **That signature is the proof-of-xpub-ownership
this document does not have today** (§B.8.6, "what the server cannot prove"), and
a Pubky identity signature alone is insufficient.

**Wallet-side ordering, which is what makes the reservation real.** Before
publication the wallet **atomically advances its own receive high-water mark past
every entry** and records each index as reserved-for-Shop. It publishes only
after that local commit. A failed publish leaves harmless burned indices.

**Server validation, on import.** Pubky seller/path binding; the account-key
signature; network, account index and fingerprint; **`stack_id` equal to this
server's own `stack_id` — `{PAYKIT_STACK_ROLE}:{instance_uuid}`, the same
stack-identity value §B.8.8 defines and the claim response returns (r7: r6 said
"the configured `PAYKIT_STACK_ROLE` identity", which is a role and therefore
shared by a rebuilt stack) — a pool signed for another stack is refused with a
named error, never imported**; strict sequence (no
rollback, no rewritten generation); expiry; unique reservation ids and indices;
`address == derive(xpub, 0/index)`; the index never accepted, issued or revoked
before; and **no confirmed or mempool history** — a failed history query rejects
the generation rather than admitting it.

**`stack_id` is in the schema because the replay argument depends on it (Sol
P2).** r5's residual list already claimed the signed domain "includes network,
seller Pubky, receiver path, **stack identifier**, xpub fingerprint and
sequence", but the schema it showed had no such field — so the stated protection
did not exist in the thing being signed, and a pool signed for the proof stack
would have verified on production. It is a signed field, it is validated on
import, and the wallet sets it from the stack it claimed against — specifically
from the `stack_id` the claim response returns (r7), which is what makes "the
stack it claimed against" a value the wallet actually holds rather than a phrase.

**Consumption.** Phase 1 (§B.11) atomically consumes one unused pool row with
invoice creation, repeating the history and baseline checks; a dirty entry is
**burned** and the next is tried. A failed baseline burns the reservation and
never returns it. paykit-server never derives "the next" address.

**Replenishment and exhaustion.** Append a higher signed sequence; low-water
alert at 20, batches of 100. Exhaustion fails **before** the marketplace bind
with `seller_address_pool_empty`: checkout hides Bitcoin for that seller with
the static copy in §B.7.2, and existing invoices keep being observed.

**Revocation.** A signed append-only object naming pool ids or reservation ids
with a reason and sequence. Unissued entries become unusable immediately.
**Already-issued invoices cannot be revoked** — they stay observed through the
§B.9 expiry tail.

**Interaction with r4, which mostly survives.** Marker publication and readback,
the deny-list, the fingerprint↔seller binding, health, expiry, replay and the
two-phase prepare/activate protocol are unchanged. The baseline and activation
snapshots survive, now operating on the **consumed** wallet address.
`manual_claim.rs:198-264` becomes onboarding and fingerprint binding only — a
bare xpub no longer enables automatic checkout, which is already true in r5.
`DerivedNewReaderPayloads::for_child_index` (`create_invoice.rs:280-310`) is
replaced by a consumed reservation address, and `next_child_index` stops being an
allocator: it is retained, renamed `highest_accepted_pool_index`, for rollback
and duplicate checks only, and the increment at `invoices.rs:823-829` is removed.

**Residual risks that survive Option 2**, so nobody reads it as a closure:

- A compromised signing device can reserve, leak or sign a malicious pool. Server
  validation prevents foreign addresses, duplicate issuance, history and
  rollback, but **cannot prove the wallet actually advanced its allocator**.
- A race remains between pool validation and invoice consumption; r4's creation
  baseline plus activation snapshot still closes known pre-existing outputs, and
  a transaction invisible to the single Electrum is still **R1**.
- A wallet restored from a **stale backup** may reissue pool-reserved indices.
  Sequence and uniqueness prevent re-import, but not independent receipt on an
  already-pooled address — so **pool reservation state must join the existing
  backed-up high-water state** (§B.8.5).
- Pool ciphertext and signatures are replayable across deployments unless the
  domain includes network, seller Pubky, receiver path, stack identifier, xpub
  fingerprint and sequence. It does; that is why it is in the schema.

**Sizing.** Bitkit **L per app** — new account-node signing (LDK/Rust API or
FFI), durable per-index reservation state and backup, encrypted publication,
background replenishment, inventory and revocation UI; a shared Rust
implementation reduces duplicated cryptography but each app still needs storage,
restore reconciliation, jobs and UX. paykit-server **L** — encrypted pool
ingestion, account-key signature verification, history validation, pool and
revocation tables, atomic consumption, inventory health, errors and seller
status.

**Non-Bitkit sellers.** No mainstream wallet emits this schema. Sparrow manages
descriptors and generates addresses but has no Paykit signed-pool exporter, and
descriptor export or checksum is **not** proof of private-key control. Electrum's
Python plugin model makes a custom plugin plausible — reserve addresses in its
wallet database, sign pool payloads when the signer is available — but it is
custom software, and a watch-only Electrum cannot produce the account-key
signature at all. Hardware-backed Sparrow or Electrum would need connected-signer
support for this custom domain signature. **Until such plugins exist, a
non-Bitkit seller pastes an xpub for onboarding and stays `shared_manual`**,
which is exactly the r5 position and the reason r5 and Wave 10 are the same
staged path rather than two designs.

**Proof strategy for Wave 10**, recorded so it is not re-invented: seller Bitkit
reserves and publishes a real signed pool; the server validates and consumes
exactly one entry; the buyer's Bitkit receives and pays the real request; the
seller's Bitkit sees and spends that exact output; the pool count falls once and
survives restart and restore. Negatives: Pubky identity without an account-key
signature; wrong xpub, account, network, path or stack; altered address or index;
duplicate entry; sequence rollback; expired or revoked pool; history or mempool
present; Electrum unavailable; concurrent invoices cannot consume one entry;
empty pool fails before bind; failed baseline burns the entry; stale-backup
replay; prepared request unreachable; malformed-signature calibration fails.

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
`{resolution: paid_manually | refunded | abandoned, resolved_at, stack_id}`,
signed with the same marketplace key as `POST /v0/payment-requests` and
idempotent on `(invoice_id, resolution)`. `stack_id` is echoed from the value
phase 1 returned and is refused with `stack_identity_mismatch` if it names
another stack (r7, §B.8.8) — the remote half of the pin that stops a resolution
queued before a repoint from being applied to whatever invoice happens to share
that id on the new stack.

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

**How an operator resolution actually gets here, stated because r7 never said
(r8, Sol P2 #3 / Kimi P3-4).** An operator resolving `manual_review` to
`paid`, `refunded` or `abandoned` does **not** call this endpoint inline. A
`paid` resolution writes a **`paid_manually`** resolve row with
`confirmation_basis = 'operator_resolution'`. Every outcome goes through
**exactly the same mechanism as a seller confirmation**: one local transaction
writes the resolution, the audit row, and a **`paykit.resolve` outbox row pinned
to the issuing stack's `stack_id` and `paykit_stack_endpoint`** (§B.8.8).
Delivery is retried under the **same 1-hour `resolve_delivery_deadline`**, mapped
by the **same twelve-row response-class table**, and terminated by the same
operator escape. There is no second delivery path and no inline call to write
down, which is the answer to "same outbox, same deadline, same mapping?" — yes,
all three. This matters to the rollback rather than to the money: an operator
resolution can be written at **any** hour, so unlike a seller confirmation it is
not bounded by the 24 h window, and §C.16's condition 7 is what bounds it
instead.

**`paid_manually` from every reachable state, as a table (r6, Sol P1).** r5
defined `resolve` for `expired_tail`, `expired_final`, the invalid states and
unknown invoices — the cases a *late* resolution reaches. But §B.8.8's confirm
endpoint calls `resolve(paid_manually)` at the moment a seller confirms, which is
normally while the invoice is still **`observing`**, and that case had no
definition. A resolution whose behaviour on the common path is undefined is the
same defect class as an undefined state pair. Every reachable invoice state is
listed; `paid_manually` is **idempotent on `(invoice_id, resolution)`** in every
accepting row, so a redelivered outbox row (§B.8.8) is always safe.

| Invoice state at `resolve(paid_manually)` | Accepted? | Effect on the invoice | Observation after | Why |
| --- | --- | --- | --- | --- |
| `observing`, no eligible observation yet | **yes** | Finalizes to `resolved_paid_manually`, records the resolution and `resolved_at`, leaves `observation_targets()` | **stops** | The normal `shared_manual` path, and the one r5 left undefined. The seller has decided in their own wallet; continuing to watch an address whose money question is answered spends budget to learn nothing. Any later arrival is off-rail and the seller's, exactly as in `expired_final` |
| `observing`, `detected` (0-conf match) | **yes** | as above, with the detected observation retained on the record | **stops** | This is the state §B.8.8's 0-conf entry produces. The observation is kept because it is what the seller acted on |
| `observing`, `confirmed` (`amount_matched: true`) | **yes** | as above, with the confirmed observation retained | **stops** | The chain and the seller agree. Recording the resolution is still required: it is what makes the marketplace's `paid` and paykit's record consistent |
| `observing`, `confirmed` but `amount_matched: false` | **yes** | as above, and the mismatch is **retained and flagged** on the record | **stops** | An over- or underpayment the seller chose to accept. paykit does not overrule the seller, and it does not erase the discrepancy either — the flag is what a dispute reads |
| `expired_tail` | **yes** | Finalizes immediately, the tail ends early | **stops** | Unchanged from r5. The common late case and the original reason the endpoint exists |
| `expired_final` | **yes**, recorded only | Resolution recorded for audit; the invoice stays final | does **not** resume | Unchanged from r5. There is no un-final edge in this design |
| `prepared` | **no** — `invoice_not_activated` | none | n/a | Nothing was ever published, so no buyer could have paid it (§B.11.5). A `paid_manually` here means the caller has the wrong invoice id |
| `awaiting_baseline` | **no** — named error | none | n/a | Unchanged from r5 |
| `void_baseline_failed`, `void_prepare_expired`, `void_cancelled` | **no** — named error naming the void reason | none | n/a | r5 named the first; all three behave identically. A void invoice was never payable, so confirming a payment against it is a caller bug, not a money outcome |
| already resolved with `paid_manually` | **yes**, idempotent | Returns the existing resolution record; writes nothing new | unchanged | Idempotency on `(invoice_id, resolution)`. This is the row that makes outbox redelivery safe |
| already resolved with `refunded` or `abandoned` | **no** — `invoice_already_resolved` naming the existing resolution | none | unchanged | One-way, and the conflict is surfaced rather than overwritten. Two disagreeing resolutions are an operations question, not something to resolve by last-writer-wins |
| unknown invoice id | **no** — `unknown_invoice` | none | n/a | Unchanged from r5, and it is the error §B.8.8's stack-pinned outbox row terminates on after a repoint |

**Where an accepted row lands, and what a rejected row does to the caller's
outbox (r7, Sol P1-3, Kimi P1-1/P2-1).** Two things r6 left implicit, both of
which an implementer has to know before writing either side:

- **The accepting rows finalize into named states, and those states are in
  §B.11.1.** `paid_manually` finalizes to **`resolved_paid_manually`**;
  `refunded` and `abandoned` finalize to **`resolved_closed`**, with the
  `resolution` and `resolved_at` columns recording which and when. Both are
  `baseline_state` values, both are final, and both are outside
  `observation_targets()` — §B.11.1 carries them as states with their edges, so
  this table and that state machine are one specification rather than two. The
  two "already resolved" rows below are exactly those two states, which is what
  makes this table total over §B.11.1's state list.
- **Every rejecting row is permanent, and §B.8.8's mapping is where that is
  written down.** `invoice_not_activated`, `invoice_already_resolved`, the three
  void errors and `unknown_invoice` cannot become acceptable by being retried, so
  the marketplace's resolution outbox terminates on each of them with an alert;
  the `awaiting_baseline` rejection is the single transient one and is retried
  under a bounded deadline. The complete response-class → outcome mapping,
  including transport and authentication failures and the delivery deadline, is
  in §B.8.8 and is referenced by §C.16's condition 6. It lives there rather than
  here because it is a property of the caller's outbox, not of this endpoint.

**A `paid_manually` resolution never creates or promotes an observation.** It
records a decision made off-rail; it does not assert that the chain showed
anything. This is why no row above turns a `late_settlement` observation into a
settlement, and why the confirm path (§B.8.8) freezes the observation it read
rather than asking paykit to re-derive one.

**`late_settlement` and `awaiting_seller_confirmation` (Kimi P2).** Stated on
this side too, because the pairing spans both documents' halves: a tail
observation carries `late_settlement = true`, can never drive `paid`, and routes
to `manual_review` — **including for a `shared_manual` creator, and including
when it reports `confirmed` with an exact amount.** It never enters
`awaiting_seller_confirmation`. §B.8.8 carries the same rule as a precedence
statement; the existing `manual_review` path is unchanged.

**The drain boundary changes** from "hold window elapsed" to **"every delivered
Payment Request is expired or final"**: no invoice in `observing` or
`expired_tail`, and `observation_targets()` empty. Because expiry is now carried
in the request and enforced by the wallet, that boundary is bounded and
computable — hold window (3600 s) plus tail (24 h), on top of which §C.16's
condition 6 adds at most the 1-hour resolution-delivery deadline (r7). **§C.16's
condition 7 adds no clock at all and is not part of that arithmetic (r8):** it
gates *tearing the old stack down* rather than repointing, because a resolution
written after the repoint is routed to the issuing stack's pinned endpoint
(§B.8.8) and needs that stack to still be answering. §C.16 is updated to match,
and the rollback is correspondingly slower and honest about it.

### B.10 Residuals that are named and gated rather than closed

**Five** exposures survive this design — three from r4, two added by r5's
allocation decision. None is papered over; each has a gate.

**r5 re-scoping, before the list.** R1, R2 and R3 below were written when every
seller could reach automatic confirmation. After §B.8.0 they apply **only to the
`exclusive` mode**, because it is the only mode with an automatic
`paid` transition. For a `shared_manual` seller none of the three can produce a
false paid, since no chain observation concludes anything — their risk is R5
instead, and it is a different kind of risk, honestly stated. R1 and the
wipe-without-restore tail of R3 are therefore **the complete automatic-path
residual that ships this week**, and both are much smaller than the paste-path
bound §B.8.4 prices for the mode that is off.

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
- **R4 — new in r5: an attacker who has learned a seller's xpub can force a
  downgrade to `shared_manual`** (§B.8.7). One confirmed output to any address
  in the creator's 20-index sentinel window that satisfies §B.8.7's predicate is
  definitive downgrade evidence by
  the classification rule, and the rule cannot tell that evidence from a second
  wallet allocator — that is the dust caveat, and it is inherent to inferring an
  allocator from chain traffic. **This is a priced denial, not a false payment:**
  no order is marked paid, no seller ships for free, and the seller's Bitcoin
  checkout keeps working with seller confirmation. **Gates:** the attacker needs
  the xpub, which the buyer never sees (§A step 7) and which paykit stores
  sealed (`invoices.rs:660-671`); the configured minimum value and hit count are
  the two thresholds in §B.8.7's single predicate, with a calibration test in
  both directions (§D.3, F11), so the price can be
  raised without a code change; the seller is alerted **once, on the transition**
  (§B.8.7), so repeat hits cannot be turned into notification churn; the seller can re-claim to a
  fresh Bitkit account (§B.8.6); and §B.8.9 removes the inference entirely.
  Accepted as the cost of having a backstop at all, and stated rather than
  hidden in the classification rule.
- **R5 — new in r5: for `shared_manual`, the false-paid risk becomes seller
  judgement.** Said plainly, because the alternative is to let "no automatic
  false-paid path" read as "no risk": a seller who marks an order paid without
  actually checking the address, amount and confirmations in their own wallet
  has done, by hand, what the automatic path would have done by inference — and
  Shop will fulfil on their word. The risk did not disappear; it moved to a
  human who has the one piece of evidence the server does not, namely their own
  wallet's view of their own account. **Gates:** the confirm endpoint requires
  the seller's own identity and records who, when, txid, reason and paykit's
  frozen observation state (§B.8.8), so a mistaken confirmation is attributable
  rather than anonymous; the seller-facing copy says in the imperative to check
  the wallet first and states that Shop cannot prove the payment came from this
  buyer; the exact-amount nonce (§B.8.2) makes the check a single equality
  rather than a judgement call; and the seller bears the fulfilment and refund
  risk in any case, because a watch-only rail can neither spend nor refund
  (§B.3). Not closed, and not closable by this design — a marketplace cannot
  audit a seller's own wallet.

All five are listed in §E and all five are in scope for the W3 Kimi audit and
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
| `resolved_paid_manually` | no | — | final; the marketplace resolved it `paid_manually` (§B.9) |
| `resolved_closed` | no | — | final; the marketplace resolved it `refunded` or `abandoned` (§B.9) |

**The two resolved states are new in r7 (Sol P1-3, Kimi P2-1), and they answer a
question r6 left an implementer to guess.** §B.9 finalizes an `observing` invoice
to `resolved_paid_manually` on the common seller-confirm path, while r6's version
of this table had neither that state nor any resolve edge out of `observing` —
and it claimed its transition set was exhaustive, so an implementer following it
could not build the normal path without violating the table. The name occurred
exactly once in the document. Both halves are fixed here: **resolution is a
`baseline_state` value, not a separate column**, and the `resolution`
(`paid_manually` | `refunded` | `abandoned`) and `resolved_at` columns record
*which* resolution produced the state. `resolved_closed` covers the two
resolutions that record no payment, because they behave identically here — final,
unobserved, and one-way — and separating them would add a state with no distinct
transition.

Transitions, each with its trigger and its guard, and no others:

| From | To | Trigger and guard |
| --- | --- | --- |
| — | `awaiting_baseline` | `create_atomic` commits (phase 1 interior) |
| `awaiting_baseline` | `prepared` | baseline snapshot persisted (§B.4.1 step 4) |
| `awaiting_baseline` | `void_baseline_failed` | snapshot failure (§B.4.1 step 5) |
| `prepared` | `observing` | **`activate`** verifies signature + total, takes the §B.4.6 tick-1 snapshot, flips outbox rows `'prepared' → 'queued'` — one transaction |
| `prepared` | `void_prepare_expired` | reaper: `now > prepare_expires_at` |
| `prepared` | `void_cancelled` | **`void`** |
| `observing` | `expired_tail` | `now > expires_at` (§B.9) |
| `expired_tail` | `expired_final` | 24 h tail elapsed |
| `observing` | `resolved_paid_manually` | **`resolve(paid_manually)`** (§B.9). Guard: state is `observing`; **no observation is required** — the resolution is accepted with no eligible observation, with `detected`, with `confirmed`, and with `confirmed` + `amount_matched: false`, which are §B.9's four `observing` rows. Any stored observation is retained on the record and a mismatch is retained **and flagged**. Leaves `observation_targets()` in the same transaction |
| `observing` | `resolved_closed` | **`resolve(refunded \| abandoned)`** (§B.9). Same guard and the same target-set exit; the resolution column records which |
| `expired_tail` | `resolved_paid_manually` | **`resolve(paid_manually)`** (§B.9). Guard: state is `expired_tail`. The tail ends early and the invoice leaves `observation_targets()` — this is the late case the endpoint originally existed for |
| `expired_tail` | `resolved_closed` | **`resolve(refunded \| abandoned)`** (§B.9), same guard |

**Three things that are deliberately *not* edges, stated because a total
transition table has to say so explicitly:**

- **`expired_final` + `resolve` is metadata-only.** The resolution and
  `resolved_at` are recorded on the invoice for audit and **the state does not
  change** — there is no un-final edge in this design and observation does not
  resume (§B.9). An implementer must not add an `expired_final → resolved_*`
  edge; the resolution columns can be populated on a final invoice, and the state
  column is what `observation_targets()` reads.
- **`resolve` on an already-resolved invoice is not a transition.** A repeated
  `paid_manually` returns the existing record and writes nothing (idempotency on
  `(invoice_id, resolution)`), which is what makes §B.8.8's outbox redelivery
  safe. A *different* resolution is refused with `invoice_already_resolved`.
- **`prepared`, `awaiting_baseline` and the three void states have no resolve
  edge at all.** Each is refused with the named error §B.9's table gives, and
  §B.8.8 maps each refusal to a terminal outbox outcome. So every state in the
  table above appears in §B.9's table exactly once, in one of three roles —
  accepts and transitions, accepts and records only, or refuses with a named
  error — and the two tables are total against each other.

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

**r5 adds one state to that same machine, and only for `shared_manual`
creators:** `awaiting_seller_confirmation`, reached from `detected` or
`confirmed`, from which no automatic edge leads to `paid`. Its transitions, the
extended inventory hold, the 24-hour window, the confirm endpoint and its
authorisation are specified in §B.8.8 rather than here, because they are a
property of the allocation mode and not of the two-phase protocol.

**r6 adds the polling path that state needs, because r5 did not have one (Sol
P1).** r5 said the order is "claimed only for status display", but
`claim_due_paykit_orders` claims `paykit_request_state IN ('pending','detected')`
(`workers.rs:745-750`) — so an order in `awaiting_seller_confirmation` was
claimed by nothing. Its confirmation count would freeze at whatever it was on
entry, an expiry would not be noticed, and a disappearance or reorg would never
reach the seller who is being asked to decide on exactly that evidence. The
buyer- and seller-facing status would be a snapshot presented as live.

There are therefore **two claim paths**, and the separation is the safety
property rather than an optimisation:

| Path | Claims | May transition to `paid`? | What it does |
| --- | --- | --- | --- |
| **Advancement** (existing, unchanged) | `paykit_request_state IN ('pending','detected')` | yes, on an eligible observation for an `exclusive` creator | `claim_due_paykit_orders` (`workers.rs:745-750`) as it stands today. `preparing` is still not claimed |
| **Status-only** (new) | `paykit_request_state = 'awaiting_seller_confirmation'` | **no — structurally, not by a guard** | Refreshes the stored observation: confirmation count, invoice state (`observing` → `expired_tail` → `expired_final`), and disappearance or reorg of the observed outpoint. Writes the refreshed observation and nothing else |

- **It cannot auto-transition to `paid`, and that is enforced by shape rather
  than by a check it could forget.** The status-only worker has no
  advance-to-paid arm at all; the only code that marks such an order paid is
  §B.8.8's conditional UPDATE behind the confirm endpoint, and the only other
  exit is the window reaper. A guard inside a shared worker would be one
  refactor away from being dropped; two workers with different capabilities are
  not.
- **The frozen audit observation is not overwritten.** The refreshed observation
  is the live display value; `paykit_observation_state_at_confirmation` is
  written once, at confirmation, from the value the seller acted on (§B.8.8).
  Two fields, because one would have to be both a live reading and a frozen
  record.
- **A disappearance or reorg is surfaced, not acted on.** It marks the
  observation `disappeared` and shows the seller (§B.8.8's transition table).
  There is no automatic reversal edge anywhere in this design, and Q10 already
  discloses that.
- **It respects the same budget.** Status-only claims are ordinary marketplace
  polls against paykit's status endpoint, on the existing schedule, and are
  deprioritised behind advancement claims. An order in this state is bounded to
  24 hours (§B.8.8), so the added load is bounded by the number of
  `shared_manual` orders in flight rather than growing without limit.

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
  "stack_id": "production:6f1d0c2a-9b47-4e35-8a10-73c5e2d84b19",
  "allocation_mode": "shared_manual",
  "nonce_sats": 437,
  "total_sats": 250437,
  "expires_at": "2026-09-09T09:39:00Z",
  "prepare_expires_at": "2026-09-09T08:54:00Z",
  "derived_address_fingerprint": "3f7a1c9e5b204d86"
}
```

`stack_id` is the issuing stack's identity, `{PAYKIT_STACK_ROLE}:{instance_uuid}`
with the UUID minted once into that stack's own database (§B.8.8). **It is
returned here because the marketplace has to persist it at bind time**: it is the
anchor every later message on this invoice is checked against, and after a
repoint the marketplace's configuration is exactly the thing that can no longer
tell it which stack issued the invoice. **The address is not in this body and
cannot be (r8):** the marketplace persists `paykit_stack_endpoint` — the base URL
it used for *this* call — in the same transaction, which is what lets a later
`resolve` be routed back here rather than to whatever `PAYKIT_SERVER_URL` names
by then (§B.8.8, §C.16 condition 7). Taking the address from the marketplace's
own call rather than from a field in the response is deliberate: a stack must not
be able to nominate where its own resolutions go. `allocation_mode` is §B.8.8's
field, on the same response for the same reason — one money-path round trip, not
two.

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
  "stack_id": "production:6f1d0c2a-9b47-4e35-8a10-73c5e2d84b19",
  "total_sats": 250437,
  "activation_attempt": 3
}
```

`invoice_id` is repeated in the body because the signature covers the body, not
the path — signing only the body while trusting the path would let a valid
signature be replayed against a different invoice id. `stack_id` is echoed for
the same class of reason and is refused with `stack_identity_mismatch` if it
names another stack: it turns "the marketplace is talking to the wrong stack"
into a named 409 at the first message instead of an unknown-invoice mystery at
the last one (r7). `total_sats` is echoed as
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
  "stack_id": "production:6f1d0c2a-9b47-4e35-8a10-73c5e2d84b19",
  "reason": "marketplace_bind_rolled_back"
}
```

Response `200 OK`:
`{"invoice_id": "9f2b1c4e-…", "state": "void_cancelled", "voided_at": "2026-09-09T08:39:07Z"}`

**`stack_id` is echoed here for the same reason as on `activate`, and r7 omitted
it from this body while asserting it on all three messages (r8, Sol P2 #1 /
Kimi P3-1).** The named-errors table below, §C row 1c and W1.1c all say
`activate` / `void` / `resolve` echo the field and that a body naming another
stack is refused with `stack_identity_mismatch`; the canonical message did not
carry it, so an implementer following the message could not perform the check the
contract promises. The failure it prevents is concrete: after a repoint, a
`void` retried out of the marketplace's rollback path would otherwise be accepted
by the *new* stack against whatever invoice happens to share that id there,
cancelling a live invoice belonging to a different order. As on `activate`, the
value is the one **phase 1 returned** for this invoice, never one re-derived from
configuration.

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
| `stack_identity_mismatch` | 409 | the echoed `stack_id` is not this stack's identity (`activate`, `void` or `resolve` — r7) | **alert**; do not retry. On `resolve` the row terminates `terminal_unresolved` per §B.8.8's mapping |
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

**Rows added in r5 for the allocation-mode machinery (§B.8.6–§B.8.8).** These
sit outside the prepare/activate windows above — they are failures of
classification and of confirmation, not of publication — so they are listed
separately rather than renumbered into a matrix whose invariant is about
payability.

| # | Failure | Durable state | Outcome | Why it is the safe direction |
| --- | --- | --- | --- | --- |
| A1 | **Claim-time scan cannot reach Electrum** | none — no creator row is written | The claim is **refused** (§B.5, unchanged), so no `allocation_mode` is assigned and no seller is silently admitted to `exclusive` on an unscanned account | An unscanned claim is exactly the P1-A condition; refusing is the r4 behaviour and r5 does not weaken it |
| A2 | **Sentinel observation cannot reach Electrum** | mode unchanged | Detection is unavailable for that tick. **No downgrade.** The §B.7 backlog-age alert and §B.7.1 auto-hide cover a sustained outage | An Electrum blip must never become a fleet-wide downgrade; `exclusive`'s safety rests on §B.8.6's claim-time checks, not on detection (§B.8.7) |
| A3 | **Downgrade lands while an invoice is `observing`** | `allocation_mode='shared_manual'` committed; invoice still `observing` | Automatic `paid` stops for **that** invoice too, because the transition reads the creator's current mode rather than `allocation_mode_at_creation`; the order moves to `awaiting_seller_confirmation` on the next matching observation | Protecting already-live invoices is the fail-safe direction and is the reason the extra read exists |
| A4 | **Confirm called by anyone but the order's seller** | none | `403 not_order_seller`, logged, **no state change**, no audit row | An operator resolving a stuck order uses the `manual_review` path so the audit trail never conflates the two (§B.8.8) |
| A5 | **Confirm called on an order not in `awaiting_seller_confirmation`** | none | Named error, no state change | A seller cannot confirm an order with no observed payment; the precondition is server-side, never the buyer-supplied txid |
| A6 | **Confirm delivered twice** (client retry) | the first confirmation record | Idempotent on order id: the same record is returned, no second fulfilment event, no second audit row | Same "effect and mark commit together" discipline as §B.11.8's outbox arm |
| A7 | **Seller never confirms** | `awaiting_seller_confirmation` for **24 hours** (D6) | Routes to `manual_review` (`workers.rs:787-820`), never to `paid` and never to a silent cancellation. The buyer's inventory hold was extended on entry, so they do not lose the order to a 3600 s timeout while waiting for a human, and **the hold is not released at routing — it persists until an operator resolves the order as paid, refunded or abandoned**, under a 2-business-day operator SLA that alerts on breach (§B.8.8) | The buyer has demonstrably paid on chain; expiring their order, or releasing their item to another buyer one day later, would be the worst available outcomes |
| A8 | **Seller confirm races the 24-hour reaper** | whichever of the two committed first; the other changed nothing | Both are a **single conditional UPDATE on `state = 'awaiting_seller_confirmation'`** with every side effect in the same transaction, so **first committer wins**: the loser affects zero rows, writes no audit row and no outbox row, and a losing confirm returns `order_not_awaiting_confirmation`. Raced in both orderings by §D.3's **F16** | Without a stated winner an implementation that landed both would produce an order that is simultaneously `manual_review` and `paid` — a state no reader of either path would expect (Kimi P2) |
| A9 | **`paykit.resolve` outbox row cannot be delivered** (stack torn down, the invoice unknown after a repoint, a permanent rejection from §B.9's table, a sustained transport or auth failure, or an unrecognised code) | order `paid`, audit record written, outbox row `terminal_unresolved` with the mapped reason | The confirmation stands — the marketplace's record is authoritative for the money outcome — and an **alert** fires. **Every response class has exactly one outcome and none retries without a bound (r7):** permanent rejections terminate immediately, transient ones retry until the 1-hour `resolve_delivery_deadline` and then terminate, and an operator can terminate a named row at any time. Terminal rows gate the drain until acknowledged (§C.16 condition 6) | The seller's decision and the buyer's fulfilment must not depend on a remote service being reachable; what is lost is paykit's audit copy, and losing it visibly is the whole point of the row (§B.8.8). r6's single mapped rejection left the other classes retrying forever, which deadlocked the rollback checklist — a liveness defect in the procedure that gates real money |
| A10 | **The row's pinned endpoint is answered by a different stack than the one that issued the invoice** (the address was re-bound, or a rebuilt production stack with the same `PAYKIT_STACK_ROLE` now sits behind it) | order `paid`; the row is **never sent** | Local check: the row's `stack_id` ≠ the `stack_id` that the **row's pinned endpoint** reports on `/health/ready` → `terminal_unresolved` with reason `stack_pin_mismatch` + alert. If the address was re-bound after that read, the remote check refuses the body with `stack_identity_mismatch` (409) → same terminal outcome. `stack_id` is `{role}:{instance_uuid}`, so a same-role replacement instance is a **different** identity and is caught (r7) | A role comparison would pass for a rebuilt production stack and deliver a resolution to whatever invoice happens to share that id there. The pin's value is turning a silent misdelivery into a named, alerting termination — it is not an authentication mechanism (§B.8.8) |
| A11 | **A resolution is written *after* `PAYKIT_SERVER_URL` was repointed** (r8) — a seller confirming in the tail of their 24 h window, or an operator resolving `payments.state='manual_review'` at any hour | order outcome is **`paid`, `refunded`, or `abandoned`** as that seller or operator resolution determines; its audit record is written, and the row is **delivered to the stack that issued the invoice** | The row carries `paykit_stack_endpoint`, frozen at bind, and the delivery arm dials **that** address rather than the current default, so the identity pin passes and the resolution lands. If the old stack has already been torn down the row terminates `unknown_invoice` or on transport failure, alerting — which is why §C.16 **condition 7** retains the old stack (creation off, `activate` / `void` / `resolve` still served) until no order can still write one of these rows | In r7 this row was created after the operator had already cleared condition 6, found the default URL repointed, and terminated `stack_pin_mismatch` **outside** the acknowledgement gate — the drain certified an audit trail and then lost it one write later (Sol P2 #3). Routing by pinned address plus condition 7 is what closes condition 6 under future writes |

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
| 1c | **Fork: two-phase prepare/activate (R3-1)** | §B.11 in full: `prepared` / `void_prepare_expired` / `void_cancelled` states; both outbox rows inserted `status='prepared'` instead of `'queued'` (`invoices.rs:1030`); `POST /v0/payment-requests` returns **200 with a body** instead of 204 (`http/payment_requests.rs:42-51`) carrying `{invoice_id, state, stack_id, allocation_mode, nonce_sats, total_sats, expires_at, prepare_expires_at, derived_address_fingerprint}` (closes R3-3); **the `stack_identity` single-row table minting `stack_id` as `{PAYKIT_STACK_ROLE}:{instance_uuid}` on first migration and never rewriting it, `stack_id` on `/health/ready`, and `stack_id` echoed and verified on `activate` / `void` / `resolve` with the named `stack_identity_mismatch` 409** (r7, §B.8.8); new signed idempotent `POST /v0/payment-requests/{id}/activate` and `…/void`; the 15-minute `prepare_ttl` reaper; the §B.4.6 tick-1 snapshot inside activation; state-inspecting replay (closes R3-5). | Revert **together with step 4d** — a reverted paykit side with an activating marketplace bricks every Bitcoin bind. Because production is created empty, there is no data migration to reverse. | **Highest.** Without it, a marketplace crash or a failed commit leaves a published, payable mainnet Payment Request that nothing polls, and the buyer's funds are silently orphaned (R3-1). This is the gating change for real money, ahead of every other item in this table. |
| 1d | **Fork: creator `allocation_mode`, claim-channel checks, sentinel detection (§B.8.6, §B.8.7)** | The `allocation_mode` column and its check constraint defaulting to `shared_manual`; `claim_channel` on the claim request and the four corroborating checks (**corroborated provenance, never proof** — D7), downgrading with a named reason rather than refusing; `allocation_mode_not_enabled` for `pasted_auto`, refused **unconditionally with no enabling flag** (r6); creator-level sentinel targets (20 indices, re-scanned at most every 10 min **inside the §B.7 30 s tick — there is no second cadence**, drawn from a global sentinel token budget subordinate to live targets, admitted only while `exclusive`, covered inside a 1 h `sentinel_max_age` with its own age alert), durable evidence rows, the **single downgrade predicate** (`confirmed && value >= sentinel_min_value_sats && distinct_hits >= sentinel_hit_count`), the unassigned re-check **under the creator allocation lock** before evidence is inserted, atomic one-way downgrade, **one** seller alert on the transition only; and the automatic-`paid` gate reading the creator's **current** mode. | Revert. Note the default is the safe direction — reverting the column reverts every creator to r4's behaviour, which is `pasted_auto` for everyone, so **1d must not be reverted without also reverting 4e**, or pasted sellers silently regain automatic confirmation. | **Critical, and asymmetric.** Absent, every seller is on r4's probabilistic path (§B.8.4's table). Present but mis-defaulted, a pasted seller gets automatic confirmation without anyone deciding to give it to them — which is why the default is `shared_manual` at the schema level and not in application code. |
| 2 | Fork: claim-time index scan | §B.5: `ChainHistoryPort`, gap-limit windows, `next_child_index` initialised above the last used index, refuse on Electrum failure or >1,000 scanned. | Revert. | High. Without it the server derives onto used addresses. Also sets `G = 21`, the gap start offset the §B.8.4 model depends on. |
| 3 | Fork: deny-list, bounded account range, fingerprint in the claim response, **fingerprint↔seller binding**, `stack_role` invariant | §B.6 and §B.8.5: mainnet accepts `0 <= account_index <= 99` — **account 0 is accepted, reversing r3** (owner decision 08:39); the deny-list covers accounts 0–99 of every known-public mnemonic and stays unconditional off `proof`; `key_fingerprint` / `first_derived_address` / `next_child_index` / **`stack_id`** in the claim response (r7 — the last is the stack identity a wallet signs a §B.8.9 pool for); new `claimed_key_fingerprints` table refusing a key ever claimed by a different seller pubky. | Revert. Reverting the binding re-opens the cross-seller half of R3-4. | High — the public test key reaching a real listing is unrecoverable, and paste being allowed makes that path reachable from a tutorial or from §D.1 of this document. |
| 4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe, **availability auto-hide** | §B.7 and §B.7.1, including the 3-probe auto-hide with 3-probe recovery hysteresis. | Revert to the unbounded path only on the proof stack, never production. | High: a ban stops all confirmation silently and `/health/ready` currently reports Electrum without hysteresis. Without auto-hide, one Electrum outage fails every Bitcoin checkout at the bind (NEW-5). |
| 4c | **Fork: `bitcoin_offer_available` on `/health/ready` (R3-6)** | §B.7.2 hop 1: `ReadyResponse` (`http/health.rs:19-25`) gains `bitcoin_offer_available`, `electrum_tip_height`, `electrum_tip_age_seconds`; the field folds the 3-probe hysteresis **and** the `PAYKIT_BITCOIN_CREATION_ENABLED` kill switch into one boolean so no consumer has to combine two. | Revert; the marketplace then treats a missing field as `true` and behaviour returns to fail-at-bind. | Medium. Its absence is a conversion and trust cost, never a correctness one — the bind stays fail-closed regardless (§B.7.2). |
| 4d | **marketplace-service: two-phase client, activation outbox, availability consumer** | §B.11.2/§B.11.8 and §B.7.2 hop 2: persist `{paykit_invoice_id, paykit_stack_id, paykit_stack_endpoint, paykit_total_sats, paykit_expires_at, paykit_activation_state}` — **`paykit_stack_id` is the issuing stack's identity from phase 1 and is the anchor every later message and the resolution outbox row is checked against (r7); `paykit_stack_endpoint` is the base URL used for that phase-1 call, frozen at bind, and is the address the resolution arm dials so a resolution written after a repoint still reaches the issuing stack (r8, §C.16 condition 7)** — and commit the bind with a `paykit.activate` outbox row in **one** transaction; add the `paykit.activate` dispatch arm to `deliver_claimed`, which today `bail!`s on any non-`notification.*` kind (`workers.rs:292-294`); add `'preparing'` to the `paykit_request_state` check (`0009_payment_methods.sql:39-40`); consume `bitcoin_offer_available` with a 15 s TTL and a 60 s stale-out, and **stop returning 503** from `get_payment_config` (`payment_methods.rs:310-325`). | Revert together with step 1c. | **Highest**, jointly with 1c — this is the half that makes activation durable. A marketplace that calls `activate` inline instead of from its outbox reintroduces R3-1's window in a narrower form. |
| 4e | **marketplace-service + client: `shared_manual` checkout and seller confirmation (§B.8.8, §C.10)** | `awaiting_seller_confirmation` on `paykit_request_state` **plus its status-only poll path** (§B.11.2); the extended inventory hold and the **24-hour** window whose reaper changes `orders.paykit_request_state` to `confirmed` and `payments.state` to `manual_review` **with the hold persisting through operator resolution**; `POST /v0/orders/{id}/confirm-bitcoin-payment` authorised to **the marketplace session whose pubky equals the order's listing's seller pubky, taken from the session and never the body**, idempotent, a **single conditional UPDATE** on the state so it cannot race the reaper, with `confirmed_txid` / `confirmed_amount_sats` **derived from the stored Paykit observation** (a disagreeing supplied value is rejected) and every audit field written in the same local transaction as the state change, the fulfilment intent, and a **stack-pinned `paykit.resolve` outbox row** delivering `paid_manually` to paykit (§B.9) — **with r7's complete response-class → outcome mapping, the 1-hour `resolve_delivery_deadline`, the `{role}:{instance_uuid}` stack-identity comparison on both ends, the operator escape, and the terminal-row acknowledgement condition 6 requires**; the endpoint's fixed operation order (authorise → idempotency lookup → conditional UPDATE, r7); `confirmation_basis = 'seller_attestation'` recorded on every seller confirmation, because the endpoint is attestation-only by decision (r7); `bitcoin_confirmation_mode` on the payment-config endpoint; the two-path onboarding chooser and the buyer/seller static copy. | Revert **together with 1d** — a reverted marketplace with `allocation_mode` still enforced leaves `shared_manual` sellers' orders with no path to paid at all, which is worse than either end state. | **Highest among the r5 items.** This is the only path in the design that marks an order paid without chain evidence, so its authorisation and audit are the whole of its safety (§B.10, R5). An unauthorised or unaudited confirm endpoint is a strictly worse defect than the residual it replaces. |
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
| 16 | Bitcoin creation kill switch and drain-safe rollback (P1-D, NEW-3, restated in r4 for two-phase) | `PAYKIT_BITCOIN_CREATION_ENABLED` (default `true`). When `false`, **phase 1** (`POST /v0/payment-requests`) refuses with `bitcoin_creation_disabled` and the marketplace bind fails cleanly; `bitcoin_offer_available` goes `false` in the same field the checkout already reads (§B.7.2), so Shop hides Bitcoin rather than failing at the bind. **`activate` and `void` keep working** — refusing them would strand exactly the `prepared` invoices this switch is trying to drain. The observer keeps polling every existing mainnet invoice. Rollback order, exactly: (1) set it `false` on the mainnet service and redeploy; (2) confirm Shop no longer offers Bitcoin at checkout (`bitcoin_offer_available: false` on the payment-config endpoint, not by eyeballing the page); (3) **drain to the restated boundary — see below**; (4) only then repoint `PAYKIT_SERVER_URL` and redeploy; (5) announce; **(6) leave the old stack running, creation-disabled but still serving `activate` / `void` / `resolve`, and tear it down only when §C.16's condition 7 holds (r8)** — repointing is step 4 and deleting the service is a separate, later decision, because post-repoint resolutions are routed to the old stack's pinned endpoint (§B.8.8). | The kill switch is itself the rollback. | **Highest.** This is the difference between a reversible cutover and lost buyer money. |

| 17 | Docs | `pubky-payment-rails/README.md` (env sections `:121`, `:134`, pinned revisions); `pubky-payment-rails/docs/wallet-leg.md:37-40` (not an `mp-oneauth` path) becomes network-specific; `mp-oneauth/docs/ecommerce/status.md:7` and `:150` ("Could this take real money today?" now answers **yes**, with the review waiver stated in the owner's words); `runbook-production.md` gains a Bitcoin-rail section carrying §C.16 verbatim plus the failover endpoint, **the §B.7.1 auto-hide behaviour and its alerts** (so an operator paged at 3 a.m. knows Bitcoin hiding itself is the designed response, not the incident), and **the §B.9 drain boundary with its ~26 h worst case** stated in hours rather than implied (~25 h if the operator uses the condition-6 escape — §C.16), **plus the two condition-6 operator actions (r7): acknowledging a `terminal_unresolved` row, and terminating a named undelivered `paykit.resolve` row, with the sentence that neither un-pays the order** (§B.8.8), **plus condition 7's exact old-stack-pinned empty-set predicate: `NOT EXISTS (SELECT 1 FROM orders o LEFT JOIN payments p ON p.order_id = o.id WHERE o.paykit_stack_id = :old_stack_id AND (o.paykit_request_state = 'awaiting_seller_confirmation' OR p.state = 'manual_review'))`; the reaper changes `o.paykit_request_state` to `confirmed` and `p.state` to `manual_review`, and only operator resolution clears the query. Retention is unbounded while that unresolved work exists — waiting never clears it. At 3 a.m., repointing is safe at just over 26 h, but deleting the old service is safe only when this query returns empty**; `HANDOFF.md` loses "Money rails remain test networks". | Revert. | Low mechanically. High if skipped: the runbook is what an operator reads at 3 a.m., and r2's runbook would have told them to drain in an hour. |
| 18 | **Production cutover — owner sign-off gate** | Only after §D's proofs (MAINNET-NEG, D.2-S, D.2-B, REGTEST-POS), W3 Kimi SHIP, W3b and W3c SHIP, and Q3, Q4, Q8, Q9 and Q10 answered. Add the production Shop origin to `PAYKIT_SETUP_ALLOWED_ORIGINS`; set `PAYKIT_SERVER_URL` on production `marketplace-service` and redeploy; set `PUBKY_RUNTIME_PAYKIT_SETUP_URL` on Vercel and redeploy. | §C.16, then both variables back to the regtest service. Independently, `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable` remains the whole-rail kill switch (`runbook-production.md`). | **Highest.** Real funds from here. Every production seller must re-claim; a seller who does not re-claim sees Bitcoin unavailable rather than losing money (`payment_methods.rs:570-585` refuses the bind). |
| 19 | Bitkit | **Revised in r5: no change is needed to *take a payment*, but three are needed to make `exclusive` honest. Size: S–M per app.** Unchanged and still true: users already hold mainnet Bitkit, it already uses `ssl://bitkit.to:9999`, it already accepts `btc-bitcoin-p2wpkh`, and the whole allocation primitive already exists — durable `highest + 1` reservation, account-xpub export, addresses revealed through 999, the 84-byte claim payload, and backup **and** restore of both the account records and the allocation state with a `max` merge (§B.8.0's citations). The three asks are lifecycle and recovery surfaces, not new cryptography: **(1) Shop-exclusive naming and status** — the reserved account is labelled as Shop's and shows its status, so a seller cannot casually reuse it or wonder what it is; **(2) a post-restore warning** — after a restore, name the account Shop is watching and warn if allocation state did **not** come back, which is the one condition that turns §B.8.5's invariant into residual R3. **Both restore strings are fixed copy specified in §B.8.8 and asserted against a snapshot (r6, Sol P2)**, as are the downgrade alert and each of the five named downgrade reasons — r5 described these three surfaces without specifying their words, which for the one surface that warns a seller their allocation state is gone is the difference between a warning and a placeholder; **(3) a migration / re-claim surface** — the seller-initiated path to a fresh Shop account, which is how a seller recovers from a §B.8.7 downgrade or a lost allocation state (§B.8.6 has no edit that moves a creator into `exclusive`). All three must be real and tested; none is a prerequisite for taking a mainnet payment, so they gate general availability rather than the W5 canary. | Revert the UI; the allocation primitive underneath is untouched, so a revert loses the warnings, not the reservation. | Medium. Absent, `exclusive` still works but its two named failure modes — silent account reuse and a restore that lost allocation state — reach the seller only as a false paid, which is the outcome §B.8.5 exists to prevent. |
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

**r5: the choice comes before the disclosure, and it is presented as two paths
side by side rather than as a default with an escape hatch.** The disclosure
above is unchanged and still renders on the manual path — it is exactly the harm
that path would carry under the unconditionally rejected `pasted_auto` design
(r7 — same phrasing everywhere), and it is why
`shared_manual` is the default and why r6 removed the flag that could have
enabled that mode at all (§B.8.6). What changed is that the two paths now differ in
*what Shop will do*, not only in how much risk the seller carries, and the copy
has to say that in the words a seller can act on. Static copy, no interpolation:

> **How should Shop confirm your Bitcoin payments?**
>
> **Create a Shop account in Bitkit — automatic confirmation**
> Bitkit sets aside a Bitcoin account used only by Shop. Because nothing else
> receives on it, Shop can confirm your orders automatically as soon as a
> payment confirms on the Bitcoin network. Recommended.
> *[Use Bitkit]*
>
> **Use my own xpub — you confirm each payment manually**
> Paste or upload your own account key. Shop will show you every payment it
> sees on the Bitcoin network, but will not mark orders paid on its own: you
> check each payment in your own wallet and confirm it. Choose this if you do
> not use Bitkit.
> *[Use my own key]*

Three properties of that screen are requirements, not styling:

1. **Neither path is presented as broken or provisional.** The manual path is a
   supported way to sell, and it publishes the same Paykit receiver marker on the
   seller's own homeserver as the Bitkit path (§B.0). Copy that reads as
   "downgraded" pushes sellers toward pasting a key and asserting the Bitkit
   channel, which is the one thing §B.8.6 cannot detect.
2. **The difference stated is the one that is true:** who confirms. Not
   "secure vs insecure" — a `shared_manual` seller checking their own wallet is
   making a *better*-informed decision than any inference this server can make;
   they are simply making it themselves, once per order (§B.10, R5).
3. **A seller who takes the manual path is told what would change if they
   switched**, and the switch is a new claim to a fresh Bitkit account, not a
   settings toggle (§B.8.6). The same surface is what a seller reaches after a
   §B.8.7 downgrade, so it must read sensibly to someone arriving from an alert
   rather than from onboarding.

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

The boundary is therefore: **no invoice remains in `prepared` or `observing`,
every delivered Payment Request is expired or final, every seller confirmation
has been delivered to the stack that issued its invoice, and no order can still
create a resolution row for that stack.** All seven conditions — **r8 adds the
seventh (Sol P2 #3)** — each with the check the runbook carries:

| # | Condition | Checked on |
| --- | --- | --- |
| 1 | No invoice in `prepared` — each one activated, voided, or reaped by the 15-minute `prepare_ttl` (§B.11.1) | paykit-server |
| 2 | No invoice in `observing` | paykit-server |
| 3 | No invoice in `expired_tail`; `observation_targets()` returns empty | paykit-server |
| 4 | No order in `paykit_activation_state = 'preparing'` — the marketplace's activation outbox has drained (§B.11.8) | **marketplace-service** |
| 5 | No `awaiting_entitlement` paykit payments | marketplace-service |
| 6 | **No undelivered `paykit.resolve` outbox row** for this stack — every seller confirmation's `paid_manually` has reached the stack that issued the invoice, **or** is `terminal_unresolved` **with an operator acknowledgement recorded against it** (r7). Termination is never inferred from silence: it is either one of §B.8.8's mapped rejection classes, the 1-hour `resolve_delivery_deadline`, or the operator escape | **marketplace-service** |
| 7 | **No order can still create a resolution row pinned to this stack** (r10) — the exact empty-set predicate is `NOT EXISTS (SELECT 1 FROM orders o LEFT JOIN payments p ON p.order_id = o.id WHERE o.paykit_stack_id = :old_stack_id AND (o.paykit_request_state = 'awaiting_seller_confirmation' OR p.state = 'manual_review'))`. The join examines the order's payment row: `manual_review` is `payments.state`, not a `paykit_request_state`. Every elapsed seller window must first change `o.paykit_request_state` to `confirmed` and `p.state` to `manual_review`, and every matching order must then be resolved before this condition holds. This is the only condition that is not about rows that exist; it is about rows that can still be written, and it is what keeps the old stack retained rather than torn down | **marketplace-service** (the query is over orders and their payment rows, not outbox rows) |

**r5 said there was no sixth condition; r6 adds exactly one, and it is not the
one r5 argued against (Sol P1).** r5's reasoning about
`awaiting_seller_confirmation` stands and is unchanged: an order in that state
has already been paid on chain, nothing about it is payable, so it cannot strand
new buyer money and **the order state does not gate the drain.** Its invoice
expires on paykit's own clock through conditions 2 and 3 like any other. What it
does gate is **fulfilment**, which is a business question rather than a rollback
one: repointing `PAYKIT_SERVER_URL` leaves those orders waiting for a seller who
can still confirm them, because the confirm endpoint is marketplace-side and
does not depend on the rail. The runbook should say so, because "orders in
awaiting_seller_confirmation" will show up in the drain query's neighbourhood
and look alarming.

What r5 missed is one step later. A seller **confirmation** produces a
`paykit.resolve` outbox row addressed to the stack that issued the invoice
(§B.8.8). Repointing while such a row is undelivered means it can never be
delivered — the invoice id is unknown on the new stack, or belongs to a different
invoice — so the row terminates unresolved and paykit's audit copy of a real
money outcome is lost. That is the same shape as condition 4: **an operator who
only queries paykit sees a clean board while a marketplace outbox row is still
in flight.** It does not strand buyer money, which is why it is condition 6
rather than a blocker on the state itself, but it strands the audit trail that
§C row 4e calls "the whole of its safety", so it belongs in the checklist.

**Condition 6 is bounded by a mechanism, not by an expectation (r7, Kimi P1-1,
Sol P2).** r6 said it "drains in seconds" and was "a condition an operator checks,
not one they wait on", and neither was true as written: r6 mapped exactly one
rejection to termination, so a row hitting any of §B.9's four other permanent
rejections — or a pinned stack that was unreachable or rejecting — retried
forever and this condition could never be cleared. Three things make the claim
true, all specified in §B.8.8:

1. **Every response class has exactly one outcome**, and every permanent
   rejection terminates with an alert. No class retries indefinitely.
2. **A 1-hour `resolve_delivery_deadline`** terminates any row still retrying,
   regardless of class. That is the only wall-clock this condition adds.
3. **The operator escape** lets an operator terminate a named row immediately,
   with their identity and reason recorded, so a rollback is never blocked by a
   row that is going to terminate anyway. It does **not** un-pay the order.

So condition 6 is clearable at any moment by an operator, and self-clearing
within one hour of the last confirmation without one. What it costs is the
acknowledgement step: a `terminal_unresolved` row is a real money outcome paykit
does not know about, and an operator has to write down what they did about it
before repointing. That is deliberate — the alternative is a drain that counts
rows and loses the audit trail §C row 4e calls "the whole of its safety".

**Condition 6 was not closed under future writes, which is why r8 adds condition
7 (Sol P2 #3, Kimi P3-4).** Condition 6 quantifies over rows that **exist** at
the moment the operator checks it. Two writers can create a new one *after* that
check has passed, and r7 contained both of them without noticing:

- A **seller confirmation**. `awaiting_seller_confirmation` deliberately does not
  gate the drain (above), and the paragraph above says in as many words that
  those sellers "can still confirm them" after the repoint, because the confirm
  endpoint is marketplace-side. Each such confirm writes a fresh
  `paykit.resolve` row pinned to the **old** stack.
- An **operator resolution** of `manual_review` to `paid`, `refunded` or
  `abandoned` (§B.9). A `paid` resolution writes `paid_manually` with
  `confirmation_basis = 'operator_resolution'`; all three use the same outbox,
  deadline and mapping — and no window at all: an operator can write one at any
  hour.

In r7 both rows then found the default URL repointed, failed the local pin
comparison, and terminated `stack_pin_mismatch` — **outside** the acknowledgement
gate that condition 6 exists to impose, since the operator had already cleared
condition 6 and moved on. The drain therefore certified an audit trail it went on
to lose, quietly, which is exactly the defect condition 6 was added to prevent,
one write later.

Two mechanisms close it, and they have to be taken together:

1. **The row routes by its own pinned endpoint, not by the current default**
   (§B.8.8). `paykit_stack_endpoint` is persisted beside `paykit_stack_id` at
   bind and copied onto the outbox row, so a post-repoint resolution is dialled
   at the address that issued the invoice. Nothing about it depends on
   `PAYKIT_SERVER_URL` still pointing there.
2. **Condition 7 keeps something answering at that address.** Routing to a
   retired stack is not routing. So the old stack is **retained** — creation off,
   `activate` / `void` / `resolve` still served — until the exact empty-set query
   in the table above returns no `awaiting_seller_confirmation` or
   `manual_review` order pinned to it. The reaper first moves an elapsed seller
   window into `manual_review`; only operator resolution clears it. Only then is
   tearing the stack down safe.

Condition 7 is stated as a **condition rather than a duration** on purpose,
because unlike conditions 1–6 it has no wall clock that bounds it in the general
case: an order sitting in `manual_review` waits on a human, and a human has no
deadline. Retention is therefore unbounded while unresolved `manual_review`
work exists. What it does have is the exact empty-set query an operator can run
and an escape they already have — resolving those orders is the only action that
clears them, and each resolution's row then terminates or delivers inside the
1-hour deadline. The honest statement is that **condition 7 is clearable by
operator action, not by waiting**, and §C.17's runbook says so next to its query.

Condition 4 is the one r3 could not have had, and it is the reason the drain
check now **spans both services**: an operator who only queries paykit can see a
clean board while an undelivered activation row is still sitting in the
marketplace's outbox.

**Bounded and computable.** `prepare_ttl` (15 min) bounds condition 1, and it
runs *inside* the hold window rather than after it, so it adds nothing to the
total; the hold window (3600 s) plus the §B.9 tail (24 h) bound conditions 2–3.
`activate` and `void` deliberately keep working while the creation kill switch
is on (§C.16 row), because refusing them would strand the very `prepared`
invoices condition 1 is waiting on. **Condition 6 adds at most the 1-hour
`resolve_delivery_deadline`**, and the arithmetic is stated rather than waved at
(r7): the last confirmation an order can produce lands inside the same window
conditions 2–3 bound, and its row terminates at most one hour later. So the
honest fully-automatic worst case is **just over 26 hours** — 1 h hold window +
24 h §B.9 tail + 1 h resolution-delivery deadline — where r3's was just over 25 h
and r6 claimed condition 6 was free. With the operator escape used, it is back to
just over 25 h, because the escape clears condition 6 immediately.

**What the 26 hours does and does not bound, corrected in r8 (Sol P2 #3, Kimi
P3-4).** r7 wrote that number as though it bounded the whole checklist. It
bounds **conditions 1–6 against seller confirmations only**, and that scope has
to be said, because the two writers condition 7 exists for are outside it:

- **Seller confirmations are bounded, and the arithmetic above is theirs.** Entry
  to `awaiting_seller_confirmation` requires a non-late observation, so the last
  one an order can produce lands inside conditions 2–3's window; +24 h window
  +1 h deadline is the just-over-26 h figure.
- **Operator resolutions are not bounded by any clock.** An operator can resolve
  `manual_review` at any hour, and that write creates a resolution row (§B.9).
  Its *delivery* is bounded — the same 1-hour deadline — but its *creation* is
  bounded only by condition 7. So the fully-automatic worst case for **condition
  7** is not a number: it is "until those orders are resolved", plus one hour for
  the last row to deliver or terminate.

Stated as one sentence an operator can act on: **repointing is safe at just over
26 hours; tearing the old stack down is safe only when condition 7's query
returns empty**, and those are two different moments. §C.17's runbook carries all
seven as a checklist with the query for each and all three numbers — 26 h, 25 h
with the escape, and condition 7's "no clock, operator action" — stated rather
than implied, because an operator draining at 3 a.m. will not re-derive them and
should not discover the difference by deleting a service.

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
| `void` idempotence **and its `stack_id` echo (r8)** | void twice with the phase-1 `stack_id`, then activate; then void once more with another stack's `stack_id` | second `void` returns the same body; the subsequent `activate` returns `invoice_finalized`; `void` on an `observing` invoice returns `invoice_finalized`; **the `void` naming another stack is refused `stack_identity_mismatch` (409) with the invoice's state unchanged** — the same assertion already driven for `activate` and `resolve`, and the one r7's canonical `void` body made unwritable |

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

FAIL calibrations, **all ten** required before the positive run is trusted — F1,
F2, **F2b**, **F2c**, F3, F4, F5, F6, **F7** and **F8** (r7, Kimi P3: r6 still
said "all six", a count that predates F2b, F2c, F7 and F8). The r5/r6 allocation
calibrations F9–F16 below are a separate, additionally required set:

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

**New in r5 — the allocation-mode calibrations (§B.8.6–§B.8.8).** F9–F12 are the
detection set, F13–F15 the manual-confirm set, and **F16 (r6) the confirm/reaper
race**. Like F1–F8 they are FAIL calibrations first: each must be **observed
failing in the intended direction** before the mode it protects is trusted.

- **F9 — a sentinel output classifies the account, and only a sentinel does.**
  On an `exclusive` creator, send an output satisfying §B.8.7's single predicate
  to an address in the
  20-index sentinel window that paykit has never assigned. Expected:
  `allocation_mode` flips to `shared_manual` atomically with an evidence row
  naming `txid:vout`, the sentinel index and the confirmation height; the seller
  alert fires; observation continues. **Its mandatory negative twin, which is
  the more important half:** send under-, over- and late payments to a genuinely
  **assigned** address and assert that each routes *that invoice* to
  `manual_review` and that `allocation_mode` is **unchanged** after all three.
  Without the twin, F9 does not distinguish a detector from a tripwire that any
  buyer typo can trigger (§B.8.7).
- **F10 — classification survives restart, and the gate reads current state.**
  After F9, restart paykit-server and assert the mode is still `shared_manual`
  from the database rather than from any cache; then drive a **fully matching,
  confirmed, exact-amount** payment on a *new* invoice for that creator and
  assert the order reaches `awaiting_seller_confirmation` and **never** `paid`.
  Run the same assertion against an invoice that was already `observing` when
  the downgrade landed (matrix row A3), which is what proves the transition
  reads the creator's current mode rather than `allocation_mode_at_creation`.
- **F11 — dust calibration, and it calibrates the one predicate.** With
  `sentinel_min_value_sats` and `sentinel_hit_count` configured, send an output
  **below** the value threshold to a sentinel and assert **no**
  downgrade; then send one **at** the threshold and assert the downgrade; then,
  with `sentinel_hit_count = 2`, assert one qualifying output does **not**
  downgrade and a second **distinct outpoint** does. Also assert a **mempool-only**
  output at or above the threshold does not downgrade. This
  demonstrates the configured policy rather than asserting a hard-coded rule,
  and it is the test that makes R4's price adjustable without a code change
  (§B.10). **Its race twin (r6, Sol P2):** hold a sentinel candidate, assign that
  same index to a new invoice, then let the scan commit — assert it does **not**
  downgrade, records `superseded_by_assignment`, and that the payment is judged
  by §B.8.2's amount predicate instead. **That twin proves the re-check but not
  the lock, and r7 adds the interleaving that does (Sol P3, Kimi P3).** As
  written, the assignment commits *before* the scan commits, so a lock-free
  re-check passes it and a repository mock passes it too. The added case runs
  **two overlapping real database transactions**: the scan takes the creator
  allocation row and holds it, and the assignment is attempted **while that lock
  is held**. Assert that the allocator **blocks** until the scan commits and then
  observes the scan's outcome, or that the scan observes the committed
  assignment — never that both proceed on stale reads. The assertion is on
  observed blocking or serialization order against a real database, so an
  in-memory repository cannot satisfy it, which is the whole point: the
  mechanism §B.8.7 claims is a row lock, and a test that passes without one is
  not evidence for it.
- **F12 — the recovery account reuses nothing.** After a downgrade, re-claim to
  a fresh Bitkit-reserved account. Assert: the new creator record starts
  `exclusive` with `next_child_index` 0 after a clean §B.5 scan; **no** index
  assignment, sentinel, or evidence row is carried across from the old account;
  invoices on the old account stay observed through their expiry tail (§B.9) and
  still cannot auto-pay; and only new invoices derive from the replacement.
- **F13 — an unauthorised confirmation marker is rejected.** Call
  `POST /v0/orders/{id}/confirm-bitcoin-payment` as the **buyer**, as an
  unrelated seller, and unauthenticated. Expected in all three:
  `403 not_order_seller`, the attempt logged, **no idempotency lookup, state
  change, or audit row**. Then call it as the correct seller on an order that is
  **not** in
  `awaiting_seller_confirmation` and assert the named precondition error, so the
  endpoint is proven to gate on server-side observation state and not on the
  buyer-supplied txid.
- **F14 — confirmation requires and records seller identity, and derives its
  audit facts.** A successful
  confirm writes `confirmed_by_pubky`, `confirmed_at`, `confirmed_txid`,
  `confirmed_amount_sats`, `confirmed_reason`, `confirmation_source = 'seller'`,
  `confirmation_basis = 'seller_attestation'`, and the frozen
  `paykit_observation_state_at_confirmation`, in the **same transaction** as the
  state change, **together with the fulfilment intent and the `paykit.resolve`
  outbox row** — asserted by a rollback test showing **none of the four** lands
  alone. Assert
  the recorded pubky is the authenticated seller's and cannot be supplied in the
  body, **and that the session pubky is resolved through order → listing → seller
  pubky** (a session for a different seller is refused even with a correct order
  id). **New in r6:** assert `confirmed_txid` and `confirmed_amount_sats` equal
  the stored observation's outpoint txid and `observed_sats` when the body omits
  them; and that a body supplying **either** value differently is rejected with
  `confirmation_observation_mismatch`, with no state change and no audit row.
  Assert the outbox row carries the issuing stack's `stack_id` — **the value
  phase 1 returned, not the configured URL (r7)** — **and its
  `paykit_stack_endpoint`, the address that phase-1 call went to (r8)** — and
  that the delivery arm refuses to send it to a different stack. **The decisive
  case is same-role / wrong-instance:** stand up a second stack with the *same*
  `PAYKIT_STACK_ROLE` and a fresh database, repoint the marketplace at it, and
  assert the row is never sent and terminates `stack_pin_mismatch`. A role-only
  comparison passes that case, which is why the identity carries the instance
  UUID. **New in r8 — the same two stacks, run the other way round:** leave the
  first stack **running** and confirm the order *after* the repoint. The row must
  be dialled at the **first** stack's pinned endpoint and **delivered**, with
  **zero** requests reaching the second stack. Both directions are needed: the
  first proves the pin catches a misdelivery, the second proves it does not
  destroy a delivery that should still succeed — which is the difference between
  r7's condition 6 and r8's conditions 6 + 7.
- **F15 — confirmation is idempotent.** Deliver the same confirm twice.
  Expected: the same confirmation record returned, exactly **one** audit row,
  exactly **one** fulfilment event, and exactly **one** `paykit.resolve` outbox
  row delivering `paid_manually` (§B.9). Then assert a `buyer_reported_txid`
  recorded on the payment
  changed no state and appears nowhere in the endpoint's preconditions. Also
  assert redelivery of that outbox row against paykit applies once (idempotent
  on `(invoice_id, resolution)`), and that an `unknown_invoice` response marks
  the row `terminal_unresolved` with an alert while the order stays `paid`.
  **New in r7 — the termination mapping is a calibration, not an assertion:**
  drive one row per class in §B.8.8's mapping table and assert each lands on its
  stated outcome — every permanent rejection terminating on the first response
  with **zero** further attempts, every transient one retrying and then
  terminating at the 1-hour `resolve_delivery_deadline`, an unrecognised code
  terminating as `unmapped_resolve_error`, and the operator escape terminating a
  named row on demand. **All twelve rows in r8, including the `408` / `425` /
  `429` row and `Retry-After` honoured as a backoff floor under the deadline
  clamp** — drive a `429` with a `Retry-After` longer than the remaining deadline
  and assert the row terminates `delivery_deadline_exceeded` **at** the deadline
  rather than waiting past it; then drive `Retry-After: 0`, a near-zero HTTP-date,
  and a past HTTP-date, and assert each next lease remains at
  `backoff_due_at`; a short future `Retry-After` only delays a retry when it is
  later than `backoff_due_at`. Assert in all of them that
  **the order is still `paid`** and that the drain query (§C.16 condition 6)
  still reports the row as blocking until an acknowledgement exists. **Its FAIL
  calibration is the r6 defect itself:** delete one mapping row and observe that
  class retrying past the deadline and condition 6 never clearing; **and r8 adds
  a second calibration for the opposite error — restore r7's "any unrecognised
  code → terminal" and observe a single `429` terminalizing a row that the next
  attempt delivers** (Sol P2 #2). **r9 adds the anti-spin calibration:** remove
  the `max(backoff_due_at, retry_after_due_at)` floor, return `Retry-After: 0`,
  and show repeated worker claims before the normal backoff is due; restoring the
  floor must reject that behaviour. **r10 adds the post-repoint pin FAIL
  calibration:** force delivery through the current default B after an A-bound
  resolution is written, observe `stack_pin_mismatch` **outside** the
  acknowledgement gate, then restore pinned-A routing and show condition 7 keeps
  the row governed until it delivers or terminates under that gate.
- **F16 — the confirm/reaper race has exactly one winner (r6, Kimi P2).** The
  one race in the r5 design with no test. Drive the seller confirm and the
  24-hour window expiry **concurrently** against one order in
  `awaiting_seller_confirmation`, in **both orderings**, and with the two
  transactions overlapping. Expected in every run: exactly **one** transition
  committed (`paid` or `manual_review`, never both), exactly **one** audit row,
  exactly **one** fulfilment event, and — when the confirm loses — the named
  `order_not_awaiting_confirmation` error with **no** audit row and **no** outbox
  row. **Its FAIL calibration:** replace the conditional UPDATE with a
  read-then-write and observe an order that is simultaneously `manual_review`
  and `paid`, which is the defect the conditional UPDATE exists to prevent.
  Without that calibration F16 passes trivially on a machine that never
  interleaves.

Also assert on regtest, cheaply: a second order for the same seller derives the
next index and never reuses an address (`invoices.rs:786-829`); that a burned
index after a forced baseline failure **or a reaped prepare** is skipped and
never reissued (§B.4.1, §B.11.1); that two invoices for the same seller draw
**different** nonces; that `payment.sandbox_advance` is refused once the adapter
is `paykit`, **including while the order is `preparing`** (§B.11.7); and that a
claim of a key already claimed by a different seller pubky is refused with
`key_claimed_by_other_seller` while a re-claim by the same seller is accepted
(§B.8.5).

Also assert on regtest, cheaply, for r5 (§B.8.6): that a **claim-scan outage
fails closed** — Electrum unreachable at claim time refuses the claim and writes
no creator row, so no `allocation_mode` is assigned and no seller is admitted to
`exclusive` on an unscanned account (matrix row A1, and the r4 §B.5 behaviour
this depends on); that a claim on `bitkit_watch_only_v1` with `account_index = 0`,
with an index disagreeing with the key's hardened child number, or with **any**
history found by the scan is **downgraded to `shared_manual` with a named
reason** rather than refused, and that a paste is `shared_manual` without any
reason being required; that a claim requesting `pasted_auto` is refused with
`allocation_mode_not_enabled` **unconditionally** — asserted across every
configuration the server accepts, with **no** enabling flag existing to set
(r6, Sol P1; r5's "accepted only with the flag explicitly set" assertion is
deliberately deleted, and a test asserting acceptance is now itself the
regression); that a `shared_manual` creator's fully matching
confirmed payment produces `detected` → `confirmed` → `awaiting_seller_confirmation`
and stops there across at least three poll cycles, **with the status-only poll
path continuing to refresh its confirmation count and invoice state while it
waits** (§B.11.2) and never advancing it to `paid`; and that a
**`late_settlement`** observation on a `shared_manual` creator — including one
reporting `confirmed` at the exact amount — routes to `manual_review` and
**never** enters `awaiting_seller_confirmation` (Kimi P2), leaving the inventory
hold on the existing late path rather than extending it.

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
- **New in r5 — that a claim on the Bitkit channel really came from Bitkit.**
  §B.8.6's four corroborating checks are **corroborated provenance, never
  proof** (D7), and no
  harness can close the gap because there is nothing to verify: the 84-byte
  payload carries no signature. F9–F12 prove the detector behaves as specified;
  they do not prove that an `exclusive` creator's account is exclusive. **The
  only thing that closes this is §B.8.9's account-key signature**, and it is
  Wave 10.
- **New in r5 — residual R4** (§B.10): the dust-forced downgrade. F11 proves the
  configured threshold behaves as configured; it cannot prove the threshold is
  the right price, because that depends on an attacker's motivation, which is
  unmeasured.
- **New in r5 — residual R5** (§B.10): seller judgement on the `shared_manual`
  path. F13–F16 prove the endpoint is authorised, audited, idempotent and
  race-free. **No
  test in this document proves a seller actually looked at their wallet before
  confirming**, and none can. The W5 canary should exercise one manual
  confirmation end to end so the seller-facing surface is seen working by a
  human before a stranger relies on it.
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
| **A prepared invoice is activated after the operator believes the rollback drain finished** | Rollback drains on r3's boundary ("every delivered request expired or final"), which says nothing about `prepared` invoices or an undrained marketplace activation outbox | Would publish a brand-new payable request **after** `PAYKIT_SERVER_URL` was repointed — the NEW-3 orphan, recreated through the new path. | §C.16's boundary is restated to **seven** conditions (r8 — r7 said six; r6 added the sixth and that revision's row still said five) including "no invoice in `prepared`", "no order in `paykit_activation_state='preparing'`", "no undelivered or unacknowledged `paykit.resolve` row", and **"no order that can still create a resolution row pinned to this stack" (condition 7)** — the last three checked on the **marketplace** side. `activate`/`void` deliberately keep working while the creation kill switch is on, so the drain can complete, and the old stack is **retained** past the repoint so post-repoint resolutions still route to it (§B.8.8). Worst case just over 26 h fully automatic for conditions 1–6, just over 25 h with the condition-6 escape; condition 7 has no clock and is cleared by resolving the orders, in the runbook as a checklist with a query per condition. |
| **Exact replay reports success for an invoice that was reaped or voided** (Sol **R3-5**) | `create_payment_request.rs:129-142` → `invoices.rs:363-427` returns `replayed: true` without inspecting lifecycle state | The marketplace would commit a bind against an invoice that can never be activated, and the order would sit `preparing` until its hold expired with no diagnosis. | State-inspecting replay (§B.11.6): `prepared` and `observing` return the same body; `awaiting_baseline` waits inside the request deadline; all three void states and `expired_final` return a **named 409, never a success**. NEG-6 asserts all three void states, not one. |
| **The marketplace records the pre-nonce total** (Sol **R3-3**) | paykit mints the nonce but `POST /v0/payment-requests` returns 204 (`http/payment_requests.rs:42-51`), so the marketplace keeps its own `amount_sats` | The buyer is charged and shown one figure while the wallet is asked for another; under the exact predicate the order can never confirm, so every Bitcoin order silently fails. | Phase 1 returns 200 with `{nonce_sats, total_sats, …}` and the marketplace persists `paykit_total_sats` (§B.11.3). Belt and braces: `activate` echoes `total_sats` and paykit refuses with `activation_total_mismatch` on disagreement, so the two services cannot diverge quietly — driven as NEG-6 row #9. |
| **Wallet allocation reset reissues the Shop account** (Sol **R3-4**) | Wipe or reinstall with no successful backup restore, or a restore from a snapshot predating the reservation; the wallet then reserves account 1 again | r3 claimed the reservation is "never reissued" globally; **that is false as written** — `WatchOnlyAccountStore.kt:86-89` + `WipeWalletUseCase.kt:57-72`, `WatchOnlyAccountService.swift:250-252` + `AppReset.swift:45-49`. | Partly closed, partly quantified (§B.8.5). Verified in the seller's favour: both wallets back up and restore the high-water mark and iOS merges with `max()` (`BackupRepo.kt:592-599`, `:715-719`; `WatchOnlyAccountService.swift:125-166`), so the common restore path preserves it. The cross-seller variant is closed outright by the paykit-server `claimed_key_fingerprints` binding. The wallet's own reuse needs four conditions to coincide and is **residual R3**, bounded by the same nonce and disclosed in the post-restore UI. |
| **Auto-hide is assumed rather than wired** (Sol **R3-6**) | r3 asserted the marketplace "already polls" a status field; `payment_methods.rs:279-333` only checks account existence | Fail-closed creation stays a checkout-wide failure-at-bind, which reads to a buyer as "the marketplace took my money and broke" (NEW-5 unclosed). | The three-hop contract in §B.7.2 with an owner per hop and tests: `bitcoin_offer_available` on paykit `/health/ready`, a 15 s-TTL / 60 s-stale-out consumer on the marketplace payment-config endpoint that **stops returning 503**, and static client copy. W1.4c and W1.10 in §F; asserted end to end in NEG-5. |
| **Delivered Payment Request outlives the marketplace hold** (Sol NEW-3) | `proposal_expires_at: None` (`create_payment_request.rs:230`); the rollback drains on "hold elapsed" and repoints | Buyer pays a still-valid address into a database nobody polls; no confirmation, and the late-settlement `manual_review` net never fires. Real funds moved, silently. | Enforceable expiry carried in the request (§B.9), **already parsed and enforced by both wallets** so no wallet release is needed; observation continues through a 24 h `expired_tail` where the only outcome is `manual_review`; the drain boundary becomes "every delivered PR expired or final" (§C.16). |
| **Fail-closed creation becomes a checkout-wide outage** (Sol NEW-5) | One Electrum outage, with two fail-closed creation gates (§B.4, §B.5) | Every Bitcoin checkout fails at the bind — correct for safety, but indistinguishable from "the marketplace took my money and broke". | A 99.0% monthly availability objective for *offering* Bitcoin, auto-hide after 3 failed probes with 3-probe recovery hysteresis, observation of existing invoices continuing throughout, and paging on sustained or flapping auto-hide (§B.7.1). A degradation is never traded against a false paid. |
| **Attacker who learned the xpub dusts a sentinel to disable a seller's automatic checkout** (r5, R4) | The xpub, and one confirmed output at or above the configured threshold to any of the 20 sentinel indices | **Succeeds, by design.** `allocation_mode` flips to `shared_manual` and that seller loses automatic confirmation. The classification rule cannot distinguish this from a genuine second allocator — that is the dust caveat and it is inherent to inferring an allocator from chain traffic (§B.8.7). | Bounded to a **priced denial, not a false payment**: no order is paid, no seller ships, checkout keeps working with seller confirmation. The attacker needs the xpub, which the buyer never sees (§A step 7) and which paykit stores sealed (`invoices.rs:660-671`). The minimum value and hit count are config with a calibration test (F11), so the price is adjustable without a code change; the seller is alerted and re-claims to a fresh account (§B.8.6, F12). §B.8.9 removes the inference entirely. Named as **R4** rather than treated as closed. |
| **Seller pastes a fresh empty account and asserts the Bitkit claim channel** (r5) | A modified or scripted client submitting `claim_channel = bitkit_watch_only_v1` with an empty account xpub at index ≥ 1 whose index agrees with the key | **Passes every check in §B.8.6**, because the 84-byte payload is a wire encoding and carries no signature — there is nothing for the server to verify. The seller obtains automatic checkout on an account Bitkit does not manage. | Stated in §B.8.6 rather than papered over. Bounded: the account is empty at claim time, so §B.8.4's `r` is that account's own future receive rate, not a busy wallet's; the seller has self-selected and carries the harm themselves; detection (§B.8.7) is what notices if it starts receiving; and the disclosure (§C.10) is rendered on the manual path regardless. **The only real fix is §B.8.9's account-key signature**, which is precisely why D4 records Option 2 as the target rather than as an enhancement. |
| **Seller marks an order paid without checking their wallet** (r5, R5) | `shared_manual`; a seller who clicks through | **Succeeds, and Shop fulfils on their word.** The `shared_manual` path removes the *automatic* false-paid transition; it does not remove the possibility of a wrong confirmation, it relocates it to a human. | Not closable by a marketplace — it cannot audit a seller's own wallet. Bounded and attributed: the confirm endpoint requires the seller's own identity and records who, when, txid, reason and paykit's frozen observation state (§B.8.8), so a mistaken confirmation is attributable rather than anonymous; the copy says in the imperative to check the wallet first and states Shop cannot prove the payment came from this buyer; the exact-amount nonce makes the check a single equality; and the seller bears fulfilment and refund risk in any case, because a watch-only rail can neither spend nor refund (§B.3). Named as **R5**. |
| **Buyer supplies a txid to push their own order through** (r5) | `shared_manual`; a buyer who reports a plausible txid | **Fails.** The confirm endpoint is authorised to the order's seller only (`403 not_order_seller`), gates on server-side observation state, and never reads `buyer_reported_txid` as a precondition. The field is recorded and shown to the seller as unverified evidence and nothing more. | §B.8.8's authorisation and preconditions; proven by F13 (three unauthorised callers, plus the wrong-state call) and F15 (a recorded buyer txid changes no state). Operator intervention deliberately uses the separate `manual_review` path so the audit trail never conflates an operator with a seller. |
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
| W1.1c | **Fork: two-phase prepare/activate (§B.11) — the gating slice (R3-1), and it also closes R3-3 and R3-5** | same fork, serialized after W1.1b | **Kimi** | W1.1b | `cargo test -p paykit-server` → **unpayability first (§B.11.5):** a `prepared` invoice yields **zero** rows from `OutboxStore::claim` across repeated calls and **zero** entries from `observation_targets()`, and a funded observation against its address changes no status. Then: phase 1 returns **200** with `{invoice_id, state, stack_id, allocation_mode, nonce_sats, total_sats, expires_at, prepare_expires_at, derived_address_fingerprint}` and `total_sats == amount_sats + nonce_sats` (R3-3); **`stack_id` equals the `stack_identity` row and `activate` / `void` echoing any other value are refused with `stack_identity_mismatch` while the invoice's state is unchanged** (r7); `activate` flips `prepared → observing` and both outbox rows `'prepared' → 'queued'` in one transaction; a second `activate` returns the same body and enqueues **nothing** (asserted on row count, not on absence of duplicate messages); **a second `void` likewise returns the same body, and both `void` calls carry the phase-1 `stack_id` in the canonical body — the idempotence and mismatch cases are driven for `void` exactly as for `activate` and `resolve` (r8, Sol P2 #1 / Kimi P3-1)**; `activate` with a mismatched `total_sats` returns `activation_total_mismatch` and leaves the invoice `prepared`; `activate`/`void` on each of `void_baseline_failed`, `void_prepare_expired`, `void_cancelled` return the named 409; **phase-1 replay returns the same prepared body from `prepared`, the same body from `observing`, and a finalized 409 from all three void states** (R3-5, all three asserted); the reaper voids `prepared` at 15 min and never touches `observing`; `void` on `observing` is refused; a reaped index is burned and never reissued; the tick-1 snapshot (§B.4.6) is taken inside `activate` and a `pre_existing` classification is written for a transaction unconfirmed at that moment |
| W1.2 | Fork: claim-time index scan (§B.5) | same fork, serialized after W1.1 | **Kimi** | W1.1 | `cargo test -p paykit-server manual_claim` → unused account starts at 0; account with usage at index *k* starts at `k+21`; Electrum failure refuses the claim; >1,000 scanned refuses |
| W1.3 | Fork: deny-list on canonical key data, **revised account range (account 0 accepted)**, `key_fingerprint`/`first_derived_address`/`next_child_index`/**`stack_id`** in the claim response, **the `stack_identity` table that mints `stack_id` (r7, §B.8.8)**, **fingerprint↔seller binding**, `stack_role` invariant (§B.6, §B.8.5) | same fork, serialized after W1.2 | **Kimi** | W1.2 | `cargo test -p paykit-server` → **`stack_id` is `{PAYKIT_STACK_ROLE}:{uuid}`, is created once on first migration, is byte-identical across restarts, is returned by the claim response and `/health/ready`, and two databases migrated from the same image get *different* values** (r7 — the same-role/wrong-instance case Sol asked for); the test-vector key is refused under `production` in both xpub and zpub-normalized form and accepted under `proof`; **`account_index = 0` is accepted under both roles** (the r4 reversal — a test that fails under r3's rule), `1..=99` accepted, `100` refused with a named reason; a declared `account_index` that disagrees with the key's hardened child number is refused (`create_invoice.rs:249-270`); the deny-list covers accounts 0–99; **a key claimed by seller A is refused for seller B with `key_claimed_by_other_seller`, including after A's claim is inactive, while a re-claim by A is accepted**; a proof DB under a production config exits `StartupError::Deployment` |
| W1.4 | Fork: Electrum budget, batching, jitter, backoff, backlog alert, active genesis/tip probe, **availability auto-hide hysteresis** (§B.7, §B.7.1) | same fork, serialized after W1.3 | **Kimi** | W1.3 | Unit tests: budget arithmetic caps at 1,000/tick and ≤5 req/s; deferral is oldest-first; readiness reports tip height and age; an empty target set no longer reports `available` without a probe; 3 failed probes set Bitcoin unavailable and 3 successes clear it, with no flap in between; **auto-hide gates creation only — existing invoices are still observed while hidden, and `activate`/`void` still work while hidden** (§C.16) |
| W1.4c | **Fork: `bitcoin_offer_available` on `/health/ready` (§B.7.2 hop 1, R3-6)** | same fork, serialized after W1.4 | **Kimi** (it gates a money path's availability) | W1.4, W1.5 | `cargo test -p paykit-server` → `ReadyResponse` serializes `bitcoin_offer_available`, `electrum_tip_height`, `electrum_tip_age_seconds`, **and `stack_id` — the value the marketplace's resolution arm compares its pinned row against, so it must be present even when `bitcoin_offer_available` is `false` (r7)**; the field is `false` after 3 failed probes and `true` only after 3 successes; the field is `false` whenever `PAYKIT_BITCOIN_CREATION_ENABLED=false` **regardless of probe health**, so one boolean carries both gates; the field is independent of the existing `electrum` component string (asserted by a case where they differ) |
| W1.4b | Fork: Payment Request expiry, `expired_tail`, resolve endpoint (§B.9) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test -p paykit-server` → a request with missing, past, or over-maximum `expires_at` is refused; `proposal_expires_at` is set on the published request; at expiry the invoice moves to `expired_tail` and after 24 h to `expired_final`, leaving `observation_targets()`; an eligible observation during the tail is recorded with `late_settlement` and never yields `paid`; `resolve` is idempotent, finalizes early from `expired_tail`, is **recorded but does not resume observation** from `expired_final`, and is refused for `awaiting_baseline` / `void_baseline_failed` / unknown invoices. **New in r7 (Sol P2, and it is what proves §B.9's table and §B.11.1 are one specification): the resolve suite is table-driven over all twelve §B.9 rows, one case per row**, asserting for each the accept/refuse outcome, the named error where it refuses, the resulting `baseline_state` (`resolved_paid_manually` or `resolved_closed` where it transitions, unchanged where it records only), the retained observation and the mismatch flag on the `amount_matched: false` row, and **`observation_targets()` membership immediately before and immediately after the call** — present before and absent after on every accepting `observing`/`expired_tail` row, unchanged on every refusing row; plus `resolve` echoing another stack's `stack_id` refused with `stack_identity_mismatch` with no state change (r7) |
| W1.5 | Fork: `PAYKIT_BITCOIN_CREATION_ENABLED` kill switch (§C.16) | same fork, serialized after W1.4 | **Kimi** | W1.4 | `cargo test` → creation refused with `bitcoin_creation_disabled` while observation of existing invoices continues |
| W1.6 | Rails: entrypoint variables (§C.6) **plus** the IaC/script for §B.1 — create both services and databases, wire variables, run the negative miswiring gate, and a separate destructive script that drops the proof database | `pubky-payment-rails` | **Kimi** (operator config gates the watcher) | W0 | `sh paykit-server/tests/entrypoint_test.sh` → pass; `PAYKIT_ENTRYPOINT_RENDER_ONLY=1` with mainnet vars → TOML contains `network = "mainnet"`, `poll_interval = "30s"`, the stack role; bogus network → non-zero exit; the IaC script run twice is idempotent; the miswiring gate fails to boot as expected |
| W1.7 | Client: network-aware validator, `zpub`→`xpub` normalization, deny-list, `PUBKY_RUNTIME_BITCOIN_NETWORK` | `mp-oneauth` worktree | **Kimi** (client xpub conversion is key handling) | W0 | `npm run test -- payment-methods` → `zpub` converts to the same 78 bytes the server stores; `vpub`/`tpub` rejected on mainnet with named reasons; the test-vector key rejected in both forms and for accounts 0–19; an unset `PUBKY_RUNTIME_BITCOIN_NETWORK` refuses the claim; the published BIP84 test vectors are asserted directly |
| W1.8 | Client: preview from the exact normalized bytes, fingerprint comparison, confirmation gate, disclosures (§C.10) | separate `mp-*` worktree | **Kimi** — in-browser BIP84 derivation is the gate §C.10 rests on, so the preamble's rule applies (Kimi P2 on r1's tiering) | W1.7 | Component tests green; the published BIP84 test vectors are asserted against the preview derivation; a mutated byte blocks `bitcoinEnabled`; VRT regenerated if a baseline exists for the settings surface |
| W1.8b | Client: **Bitkit Shop-account claim path as the recommended default, manual paste and file import retained** (§B.8.1, §C.10; owner decision 08:39) — auth URL with `x-bitkit-claim=watch-only-account-v1` and the exact capability set, payload decode, the real `account_index` submitted instead of a hardcoded `0` | separate `mp-*` worktree, after W1.8 | **Kimi** (this is a credential-delivery path) | W1.8 | Tests: the requested capability set is byte-equal to `PubkyAuthClaim.WATCH_ONLY_ACCOUNT_CAPABILITIES`, asserted against a fixture captured from Bitkit rather than retyped; an 84-byte payload decodes to version 1, an `account_index` and a 78-byte xpub, and the submitted index is the payload's rather than `0`; **manual paste and file import remain reachable on mainnet and produce a claim byte-identical to the Bitkit path for the same key** (the §B.0 assertion — same endpoint, same normalized 78 bytes); file import accepts exactly the artifacts named in §C.10 and rejects everything else with a named reason rather than guessing, including a file containing private key material, which is refused loudly and never logged; the pre-claim disclosure renders the one-sentence false-paid warning and the dedicated-account recommendation, asserted on copy presence so it cannot be dropped silently |
| W1.10 | **marketplace-service: two-phase client + durable activation outbox (§B.11.2, §B.11.8)** | `marketplace-service` worktree | **Kimi** (money path, and the R3-1 fix lives half here) | W1.1c | `cargo test -p marketplace-service` → phase 1's `{invoice_id, stack_id, total_sats, expires_at}` is persisted — **`paykit_stack_id` from the response body and never from configuration, asserted by a test that changes `PAYKIT_SERVER_URL` after the bind and shows the persisted value unchanged (r7)**, and **`paykit_stack_endpoint` persisted in the same transaction as the base URL used for that phase-1 call, asserted by the same repoint test showing it too is unchanged and, separately, that a second bind after the repoint persists the *new* URL — so the column tracks the issuing address per order rather than a global (r8)** — and the bind **and** the `paykit.activate` outbox row commit in **one** transaction (asserted by a rollback test: no row, no bind); `deliver_claimed` routes `paykit.activate` instead of `bail!`ing on an unroutable kind (`workers.rs:292-294`), and delivery stamps `delivered_at` with the state change in one transaction so redelivery cannot apply twice; `'preparing'` is accepted by the `paykit_request_state` check and **is not claimed by `claim_due_paykit_orders`** (`workers.rs:745-750`); `prepare_expired` / `invoice_finalized` / `unknown_invoice` void the bind, release the hold and emit `payment.bitcoin_prepare_voided`; `activation_total_mismatch` voids **and alerts**; the buyer-facing total charged equals `paykit_total_sats`, never `amount_sats` (R3-3 on this side) |
| W1.11 | **marketplace-service: availability consumer (§B.7.2 hop 2, R3-6)** | same tree, serialized after W1.10 | **Kimi** (it changes a public endpoint's failure semantics) | W1.10, W1.4c | `cargo test -p marketplace-service` → `get_payment_config` returns `bitcoin_offer_available` alongside `bitcoin_available`; a fresh value is cached for 15 s and paykit is not re-probed inside it; a paykit error serves the last value until 60 s stale and then reports `false`; **the endpoint returns 200 rather than 503 when paykit is unreachable** (`payment_methods.rs:310-325` today), asserted as a status-code regression test; `bitcoin_available` still requires the seller's claim to exist |
| W1.12 | **Client: hide Bitcoin at checkout when unavailable (§B.7.2 hop 3, R3-6)** | `mp-oneauth` worktree, independent of W1.8 | implementation tier | W1.11 | Component tests: the Bitcoin option is not rendered when `bitcoin_offer_available` is `false`, and is rendered when both flags are true; the copy is the static string and interpolates **no** operator state (asserted against a snapshot, so a future edit cannot leak a tip height or endpoint name); a seller with no other rail falls through to the existing no-rail empty state rather than a new surface; VRT regenerated if a baseline exists for the checkout surface |
| W1.13 | **Fork: creator `allocation_mode` and the claim-channel checks (§B.8.6, D1/D2)** — the column and its check constraint, `claim_channel` on the claim request, the four corroborating checks, downgrade-with-a-reason rather than refusal, `allocation_mode_not_enabled`, and the authenticated seller status fields | same fork tree, serialized after W1.3 | **Kimi** (it decides which sellers get automatic money confirmation) | W1.3 | `cargo test -p paykit-server` → a paste is `shared_manual`; a `bitkit_watch_only_v1` claim at index ≥ 1, index-agreeing, scan-clean and fingerprint-free is `exclusive`; each of `account_index = 0`, an index disagreeing with the key's hardened child number, and any scan history **downgrades with a named reason and does not refuse**, the reason being one of §B.8.8's five fixed identifiers; **`pasted_auto` is refused with `allocation_mode_not_enabled` unconditionally — asserted across every accepted configuration, with no enabling flag existing (r6, Sol P1); the r5 assertion "accepted only with the flag explicitly set" is deleted, and a test asserting acceptance is a regression**; there is no code path that edits a creator into `exclusive`; the seller status endpoint returns mode, channel, downgrade reason and evidence to the authenticated seller and 403s for anyone else. **Scope for the canary: `exclusive` and `shared_manual` only** (D8) |
| W1.14 | **Fork: sentinel detection, evidence records, and the automatic-`paid` gate (§B.8.7, D3)** — creator-level sentinel targets scheduled **inside the §B.7 30 s tick** (re-scan at most every 10 min per creator; **no second cadence**), a **global sentinel token budget** subordinate to live targets, `exclusive`-only admission, a 1 h `sentinel_max_age` freshness SLO with its own age alert, durable evidence rows, the **single downgrade predicate**, the unassigned re-check **under the creator allocation lock**, atomic downgrade, **one** seller alert on the transition, and the confirmation gate reading the creator's **current** mode | same fork tree, serialized after W1.13 | **Kimi** | W1.13, W1.4b | `cargo test -p paykit-server` → an output satisfying the predicate on a never-assigned sentinel downgrades atomically and writes an evidence row; **under-, over- and late payment to an assigned address route that invoice to `manual_review` and leave the mode unchanged** (asserted after all three, not one); the mode survives restart and is read from the database at the transition; a downgrade landing on an already-`observing` invoice stops that invoice's automatic `paid` (matrix row A3); a sentinel-scan Electrum failure downgrades **nothing**; both predicate thresholds behave as configured **in both directions** and a mempool-only output never qualifies; **a candidate whose index is assigned to an invoice before the scan commits is discarded as `superseded_by_assignment` and downgrades nothing** (F11's race twin), **and — new in r7 — the same assertion with the assignment attempted *while the scan holds the creator allocation row*, over two overlapping real database transactions, asserting the allocator blocks or the scanner observes the committed assignment, so the test cannot pass against an in-memory repository** (Sol P3, Kimi P3); **repeat post-downgrade hits write evidence rows and raise no second alert**; a `shared_manual` creator is not admitted to the sentinel set; sentinel work draws only from the sentinel token bucket, never defers a live target, and does not breach the 1,000/tick cap or 5 req/s; the sentinel-age alert fires when the oldest admitted creator exceeds `sentinel_max_age` and does **not** gate creation. **Gates general availability, not the canary** (D8) |
| W1.15 | **marketplace-service: `shared_manual` checkout and the seller-confirm endpoint (§B.8.8, D2)** — `awaiting_seller_confirmation` with status-only polling, extended inventory hold, a 24-hour window whose reaper changes `orders.paykit_request_state` to `confirmed` and `payments.state` to `manual_review`, seller authorisation, observation-derived audit fields, and a stack-pinned `paykit.resolve` outbox | `marketplace-service` worktree, serialized after W1.11 | **Kimi** (money path) | W1.11, W1.13, W1.4b, W1.1c, W1.3, and this slice's resolution outbox | `cargo test -p marketplace-service` → verify seller confirmation is authorised **before the idempotency lookup**, idempotent, atomic with audit/fulfilment/outbox writes, observation-derived, records `confirmation_basis = 'seller_attestation'`, and never automatically advances a `shared_manual` order; verify late settlement and the confirm/reaper race. Assert the 3600-second hold is extended on entry, not expired, and that an SLA-breach alert fires two business days after the reaper writes `payments.state = 'manual_review'`. Drive every §B.8.8 response-class row: permanent rejections terminate; transient rows retry under the 1-hour deadline; 401/403 alerts; the operator escape and acknowledgement gate work; a pin mismatch sends no request; and no case un-pays the order. For `429`/`503`, schedule valid `Retry-After` as `min(resolve_delivery_deadline, max(backoff_due_at, retry_after_due_at))`; `0`, near-zero and past-date values preserve `backoff_due_at`, malformed falls back to backoff, and the deadline clamp remains. **FAIL calibration:** remove the floor, return `Retry-After: 0`, and demonstrate repeated claims before normal backoff is due. Bind against A, repoint to B, and assert both seller confirmation and operator `payments.state = 'manual_review'` resolution route only to A; force delivery through current-default B to show `stack_pin_mismatch` outside the acknowledgement gate, then restore pinned-A routing. An operator `paid` resolution writes `paid_manually` with `confirmation_basis = 'operator_resolution'`. Finally assert condition 7 is exactly `NOT EXISTS (SELECT 1 FROM orders o LEFT JOIN payments p ON p.order_id = o.id WHERE o.paykit_stack_id = :old_stack_id AND (o.paykit_request_state = 'awaiting_seller_confirmation' OR p.state = 'manual_review'))`: it blocks before and after a seller window elapses (because the reaper changes the payment row to `manual_review`) and returns empty only after every matching order is resolved. **In the minimum cutover set** (D8) |
| W1.16 | **Client: two-path seller onboarding and the `shared_manual` buyer/seller surfaces (§C.10, §B.8.8, §B.7.2)** — the side-by-side path chooser, `bitcoin_confirmation_mode` consumption, the buyer's pre-pay and awaiting-confirmation copy, the seller's confirm surface, and the post-downgrade arrival path | `mp-oneauth` worktree, serialized after W1.8b | implementation tier | W1.8b, W1.15 | Component tests: both paths render side by side and neither is styled as broken or provisional; the manual path still renders the §C.10 one-sentence disclosure (the W1.8b assertion, unchanged); `bitcoin_confirmation_mode: "seller"` renders the buyer's pre-pay copy and does **not** hide Bitcoin; the awaiting-confirmation copy renders on the order; **every string is asserted against a snapshot and interpolates no server-supplied value** — no address, amount, txid, tip height or seller name (the house rule, asserted so a later copy pass cannot start interpolating); the seller confirm surface renders the check-your-wallet imperative; arriving at the chooser from a downgrade alert reads sensibly rather than as onboarding; **the downgrade alert and each of the five named downgrade reasons render §B.8.8's fixed copy, asserted against a snapshot** (r6, Sol P2); **the 24-hour window's day-2 human-review copy renders and is consistent with "usually within a day"**. **In the minimum cutover set** (D8) |
| W1.17 | **Bitkit: Shop-exclusive naming and status, post-restore warning, re-claim surface (§C row 19, D1)** — lifecycle and recovery UI over the allocation primitive that already exists | `bitkit-android` and `bitkit-ios`, one agent per tree | implementation tier per app; **deep reasoning** for the post-restore warning's wording, because it is the surface that tells a seller their allocation state did not come back | W1.13 | Per app: the reserved account is labelled and shows status; a restore that recovered allocation state names the watched account, and a restore that did **not** raises the warning (both directions, driven against the real backup/restore path — `BackupRepo.kt:711-729`, `BackupService.swift:210-219` — not a mocked one); **both restore strings are the fixed copy in §B.8.8 and are asserted against a snapshot** (r6, Sol P2), interpolating no wallet- or server-supplied value; the re-claim surface produces a claim byte-identical to the first-claim path for a fresh reserved account; **size S–M per app**, and none of the three gates the W5 canary — they gate **general availability** (D8) |
| W10 | **Wave 10 — Option 2 signed reservation pools (§B.8.9)** | Bitkit ×2 (**L** each), `paykit-server-fork` (**L**) | **Kimi** throughout — it is account-key signing, encrypted publication and a money path | r5 shipped and measured | **Not this wave.** Recorded so the sequencing is explicit: exclusive Bitkit now, signed pools next, third-party plugins later, detection throughout. Its proof strategy and its full negative-test list are in §B.8.9 and must be planned from there rather than re-derived |
| W1.9 | Docs pass (§C.17) | umbrella + `mp-oneauth` | **deep reasoning** — this is money-affecting operator text, not a mechanical edit | W1.5 | `git diff --stat` shows exactly the listed files; the parent reads the replacement policy line and the §C.16 rollback order end to end |
| W2.0 | **Build image digest `D` once** from the commit containing §C steps 1–6, and redeploy **regtest, proof and (later) production** onto it (§D.0) | operator (parent) | parent-only | W1.* merged | `D` recorded in the wave log; all three boot lines print the same digest; the parent reads all three, not one |
| W2.1 | Proof stack stood up on `D` | operator (parent) | parent-only | W2.0 | Boot line shows `mainnet`, `role=proof`, `ssl://bitkit.to:9999`, and digest `D`; `/health` shows a real tip height; the miswiring gate refuses to boot |
| W2.2 | Harness: MAINNET-NEG (NEG-1…NEG-6, drift guard) | `mp-oneauth` worktree | **Kimi** (the harness is the evidence) | W2.1, W1.7 | Digest asserted `== D` first; NEG-1 and NEG-2 `awaiting_entitlement`/`undetected` after ≥3 cycles; `history_tx_count == 176` and **baseline size == 88** on NEG-2 against an independently fetched set; **NEG-3 passes and its negative calibration — baseline suppressed — marks the order `paid`**, without which NEG-3 is not evidence; **NEG-3b passes with both calibrations, including the tick-2 positive** (§B.4.6 — without the positive, rule 2 could be rejecting everything); NEG-4 and its mirror; NEG-5 gives `void_baseline_failed` with no published request and then the full §B.7.2 chain to a hidden checkout option with HTTP 200; **NEG-6 drives failure-matrix rows #1, #3, #4, #5, #9, the per-state replay set and `void` idempotence, and its negative calibration — outbox rows written `'queued'` — is observed delivering the request to the buyer's wallet for a rolled-back order** (R3-1 live, once, on the proof stack); drift guard aborts on a mutated pinned digest |
| W2.3 | Harness: MAINNET-DERIVE split into **D.2-S (seller)** and **D.2-B (buyer)** | same worktree, after W2.2 | **Kimi** | W2.2, W1.8b | Digest asserted `== D`. D.2-S: the Bitkit-issued account index is accepted and a **pasted account-0 xpub is also accepted** (the r4 rule, §B.6), fingerprint round-trip passes and its negative fails, the derived address appears in the seller's own Bitkit (screenshot the parent opens), and Bitkit's receive screen never issues it. D.2-B: a **different** team member's Bitkit renders the request, shows the nonce'd total and the expiry, and after expiry refuses to pay it (`requestExpired` / `RequestExpired`), with the server showing `observing → expired_tail`. **No send in either leg** |
| W2.4 | Harness: REGTEST-POS with F1–F8 | separate worktree, regtest stack | **Kimi** | W2.0 | **First assertion: the regtest service was redeployed and reports digest `== D`** — the run aborts if not, which is the NEW-4 gate. Then all FAIL calibrations observed first — F1, F2, F2b, **F2c and its positive twin**, F3, F4, F5, F6, **F7** (money sent to a `prepared` invoice's address changes nothing, the prepare reaps, and the funds are shown spendable by the seller) and **F8** (zero claimable outbox rows while prepared; both rows claimed in dependency order after activation) — then the positive run: `detected` on a later tick → `confirmed` → `paid` with receipt; plus `sandbox_advance` refused while `preparing`, and the fingerprint-binding pair; screenshots the parent opens |
| W3 | Kimi audit of the full diff | OpenCode, own `OPENCODE_DB` lane | **Kimi** | W1.*, W2.* | Report contains an explicit `SHIP` or `FIX-FIRST`; exit 0 is not a report — grep the log for the verdict |
| W3b | Deep-reasoning review: do the proofs prove what they claim **over one artifact**, does the runbook rollback order actually drain under §C.16's seven conditions — **including condition 7's retention rule and whether the teardown step is genuinely separated from the repoint step (r8)** — is the §B.8.4 model's `A/W` step defensible, and are R1/R2/R3 correctly scoped | — | deep reasoning | W2.2–W2.4, W1.9 | Verdict recorded; the parent opens the screenshots, re-runs one proof command per proof, and checks the digest in each proof log against `D` |
| W3c | **Protocol/state-machine review of §B.11's two-phase protocol and §B.9's expiry/resolve contract** — both sides modeled as state machines, every message and credential's provenance traced, the §B.11.4 matrix attacked for a missing row | — | deep reasoning, different family from the implementer | W1.1c, W1.4b, W1.10 | Verdict recorded **before W2.2 runs and again before W5**. Run it twice deliberately: after the design (now) and after the first implementation, per the protocol-review rule — not after the third build. R3-1 is exactly the class of defect a diff audit passed three times and a state-machine review finds in one pass |
| W4 | **Owner sign-off** | — | — | W3 SHIP + W3b SHIP + W3c SHIP + all proofs | Owner answers Q3, Q4, Q8 and Q10 in writing, having read §B.8.4's table, §B.10 and §D.4. Q9 is already answered (08:39); **r5 narrows rather than reverses it (§B.8.0, Q14), so W4 must put the narrowing in front of the owner explicitly** — paste is still accepted and still lands in Paykit data, but it now confirms manually, and the 6% bound the owner accepted at 08:39 is the price of `pasted_auto`, which r6 makes **unreachable** — rejected unconditionally, with no flag (§B.8.6). The owner's decision at W4 is whether to leave it that way; re-widening requires a **separately approved design revision**, not a variable, and is taken against §B.8.4's table rather than against a summary of it. **W4 must also sign off the minimum cutover set (D8)** — that the canary is one named `exclusive` seller and that W1.14 and W1.17 gate general availability instead |
| W5 | Production stack, cutover (§C.18), **named-seller `exclusive`-only canary** (§D.4, D8) | operator (parent) + commerce team | parent-only | W4 + **the minimum cutover set below** | Production boot line shows `role=production` and digest `== D`; **one named** real seller re-claims **through the Bitkit Shop-account flow** and lands in `exclusive` (asserted on the creator row, not inferred), confirms the address in their wallet, one real payment completes end to end at the exact nonce'd total and is spendable, and one order is left to expire and is confirmed unpayable in the buyer's wallet |

**W1.15 r9 acceptance amendments.** Its delivery tests must schedule a valid
`Retry-After` as `min(resolve_delivery_deadline,
max(backoff_due_at, retry_after_due_at))`: `0`, near-zero, and past-date values
must not run before `backoff_due_at`; malformed values still fall back to normal
backoff; and the deadline clamp remains. Its anti-spin FAIL calibration removes
the `max` floor, returns `Retry-After: 0`, and must show repeated claims before
the normal backoff is due. Its condition-7 test uses the exact empty-set
predicate `NOT EXISTS (SELECT 1 FROM orders o LEFT JOIN payments p ON
p.order_id = o.id WHERE o.paykit_stack_id = :old_stack_id AND
(o.paykit_request_state = 'awaiting_seller_confirmation' OR p.state =
'manual_review'))`: an elapsed seller window is first reaped by changing
`o.paykit_request_state` to `confirmed` and `p.state` to `manual_review`, and
the query returns empty only after every matching order is resolved, never merely
because its seller window closed. The operator-resolution case includes `paid`:
it writes `paid_manually` with
`confirmation_basis = 'operator_resolution'`, then follows the same outbox,
deadline, and twelve-row mapping.

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

**r5's additions to that picture.** W1.13 and W1.14 join the **fork tree** and
serialize with it, after W1.3 and after each other — the sentinel gate needs the
mode column to exist. W1.15 joins the **marketplace-service tree** behind W1.11,
and is wired to W1.13 by a contract rather than a merge, so phase 1's
`allocation_mode` field must be pinned from a **captured live response** before
its tests are written (`contract-faithful-tests`), exactly as §B.11.3's shapes
are. W1.16 serializes behind W1.8b in the client tree. **W1.17 is two genuinely
new trees** — `bitkit-android` and `bitkit-ios`, one agent each — which are
independent of every other slice and of each other, so they are the cheapest way
to keep the concurrency budget full while the fork tree serializes. Nothing in
r5 makes a previously parallel slice serial.

**The minimum cutover set, named explicitly (r6, D8 / Sol Q6).** r5's wave table
listed every slice without saying which of them the first real-money cutover
actually requires, which leaves the canary's scope to be decided under
deployment pressure. The W5 canary is **one named seller on `exclusive` only**,
and it requires exactly this and nothing more:

| In the minimum cutover set | Why it is required |
| --- | --- |
| r4's correctness perimeter — W1.1, W1.1b, **W1.1c**, W1.2, W1.3, W1.4, W1.4c, **W1.4b**, W1.5, W1.6, W1.7, W1.8, W1.8b, W1.10, W1.11, W1.12 | Unchanged from r4. These are the money-correctness and rollback mechanisms; none is an allocation-mode item |
| **W1.13**, scoped to `exclusive` and `shared_manual` only | It decides which sellers get automatic confirmation, which is the whole of D1 |
| **W1.15**, including the durable stack-pinned resolution outbox — **and, in r7, that outbox's complete termination mapping, its 1-hour delivery deadline, its operator escape, and the `stack_id` contract the pin compares against** | The canary's seller is `exclusive`, but a downgrade mid-canary lands them in `shared_manual` with no path to paid unless this exists (§C row 4e's revert coupling, in the forward direction). The r7 additions are in the set for a separate reason: without them §C.16's condition 6 can deadlock, and condition 6 is on the checklist that gates the rollback of a real-money cutover |
| **W1.16** static buyer and seller surfaces | The copy is the only thing that tells a buyer their paid order is waiting on a human, and a seller what they are being asked to check |
| The **live mode contract**, captured from a real phase-1 response | Phase 1's `allocation_mode` field must be pinned from a captured response, not retyped (`contract-faithful-tests`) |
| **State-transition and authorization tests** — F13, F14, F15, **F16**, and §B.8.8's transition table driven end to end | The confirm endpoint is the only path that marks an order paid without chain evidence |

| Gates general availability, not the canary | Why it can wait for one named seller |
| --- | --- |
| **W1.14** — sentinel detection | `exclusive`'s safety rests on §B.8.6's claim-time checks and on Bitkit's allocator, not on detection (§B.8.7 says this in its first paragraph). With one known seller on a Bitkit-reserved account, the backstop's value is monitoring, and the canary is monitored by a human |
| **W1.17** — Bitkit lifecycle and recovery UX | Its three surfaces protect sellers at scale from silent account reuse and a restore that lost allocation state. For one named seller, both conditions are checked by conversation |
| **W10** — signed reservation pools | Unchanged and still deferred (D4) |

Nothing else moves out of the set. In particular **W1.4b stays in**, because
W1.15 calls `resolve`, and the two-phase slices stay in because they are the R3-1
fix.

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
| **D / NEW-3** (drain boundary) | — | Boundary restated to seven conditions spanning both services, including `prepared` invoices, an undrained marketplace activation outbox, (r6) an undelivered `paykit.resolve` row, and (r8) no order still able to create a resolution row pinned to this stack — with the old stack retained past the repoint and resolution rows routed to their pinned endpoint | §C.16 |
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

**r5 addendum: what a fifth reviewer should attack, given the allocation
decision.** The `A/W` question above is now largely moot for what ships, because
the mode it prices is off. Three things replace it. **First, §B.8.6's
corroborating checks** — they are the whole of `exclusive`'s admission control,
and the honest gap (a fresh empty pasted account asserting the Bitkit channel) is
stated but not bounded by anything except the seller's self-interest; a reviewer
should decide whether that is acceptable for a week or needs a stopgap before
Wave 10. **r6 note:** both r5 reviewers examined this and neither raised it above
P2 — Kimi verified the money-at-risk path as self-harm only and Sol recorded the
Wave 9 stance as corroborated provenance (D7) — so the question is now scoped to
"acceptable until Wave 10?" rather than open. **Second, §B.8.8's window and
extended hold** — r6 sets the window to **24 hours**, aligned with the §B.9
observation tail, and holds inventory through operator resolution under a
2-business-day SLA (D6). The alignment removes the arbitrariness Sol objected to
in r5's seven days, but the SLA is still an operations commitment rather than a
mechanism, and a sixth reviewer should attack **that**: what actually happens to
held stock when the operator misses it. **Third, whether
`shared_manual` is a product or a dead end**: a path where every order needs a
human is fine for a canary and corrosive at scale, so the reviewer should check
that §B.8.9 is genuinely scheduled rather than a place to put the problem. The
§B.11.4 completeness question is unchanged and still first.

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
- **Q14 — Who gets automatic Bitcoin confirmation. DECIDED 2026-09-09, recorded
  in full as §B.8.0 (D1–D5).** In one line: automatic confirmation this week is
  `exclusive` only — a Shop-exclusive Bitkit account; pasted and file-imported
  xpubs are still accepted through the same Paykit claim path and are
  `shared_manual`, where the seller confirms each payment; `pasted_auto` exists
  in the model and is **rejected unconditionally, with no flag that could enable
  it** (r6); detection is a downgrade backstop with no
  credit taken in any residual number; and Option 2's signed reservation pools
  are the Wave 10 target. Decided here rather than raised to the owner because
  it **narrows** what the owner already accepted at 08:39 rather than reversing
  it: paste stays accepted, in Paykit data, on the same endpoint and marker
  (§B.0) — the owner's actual requirement — and the 6% bound the owner accepted
  is no longer being carried by anyone in production. **Re-widening it is the
  owner's call**, and r6 makes the mechanism for that a **separately approved
  design revision** rather than a configuration flag: r5 left `pasted_auto`
  enableable by an operator variable, which was a live path to automatic
  confirmation for pasted keys behind one setting (Sol P1). W4 should put the
  choice in front of the owner explicitly, against §B.8.4's table, rather than
  leaving it as an unexercised enum value — but the answer "yes" now costs a
  design round, which is the correct price for re-opening D1.
- **Q15 — the seller-confirmation window, the inventory hold, the claim-signing
  wave, and the minimum cutover set. DECIDED 2026-09-09, recorded as §B.8.0
  D6–D8.** In one line each: the window is **24 hours**, aligned with §B.9's
  observation tail, and inventory is held through operator resolution under a
  2-business-day SLA rather than released at routing; **account-key claim signing
  stays Wave 10**, so Wave 9's Bitkit channel is corroborated provenance and
  never proof; and the **minimum cutover set** for the named-seller
  `exclusive`-only canary is enumerated in §F, with W1.14 and W1.17 gating
  general availability instead. Decided here rather than raised to the owner
  because all three narrow or schedule what is already decided; W4 signs off the
  cutover set because it scopes the first real-money deployment.

Scheduled, explicitly not in this wave, each with the reason it can wait:
**Option 2's wallet-issued signed reservation pools (§B.8.9, Wave 10)** — the
target allocation architecture, deferred because both Bitkit apps and
paykit-server are L changes and no third-party wallet emits the schema, and
because r5 ships the subset of its guarantee that Bitkit's existing allocator
already provides; **third-party wallet plugins for that schema** (§B.8.9,
non-Bitkit sellers), which is what eventually moves a pasted-xpub seller off
`shared_manual`; per-target error isolation in the observer (the §B.7 budget shrinks the batch
and therefore the blast radius); two-server Electrum corroboration (owner
Q4); a disappearance-driven `manual_review` edge for reorgs (Q10
discloses the gap); own bitcoind + Fulcrum (§B.2); a signed
ownership challenge (§B.6, needs wallet support); and domain separation in
derivation, which must be settled before any second marketplace shares the
rail (§E, cross-instance replay).
