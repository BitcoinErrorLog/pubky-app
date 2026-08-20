# Marketplace Private Messaging — Encrypted Transport Research (plan task 5.1)

Date: 2026-08-20. Research-first evaluation; **no product code was implemented** — the decisive choice is an architecture/product decision that is not the implementer's to make. This repo contains the evaluation, the recommendation, and a handoff-ready plan.

> **Update, same day:** the recommended topology was chosen and its first milestone exists. An experiment-grade browser WASM binding of the paykit-rs encrypted-link messaging surface lives at `BitcoinErrorLog/paykit-rs-official`, branch `feat/wasm-binding` (pinned to the audited upstream commit `c8892f6`). All four wasm32 build blockers were packaging-class and fixed additively (getrandom backends, a one-line vendored fix for snow 0.10.0's spurious ring activation, uuid RNG feature, pubky 0.8.0's missing `reqwest/stream` on wasm). Real-crypto smoke checks pass in Node (Noise XX handshake, both-direction encrypted roundtrip, AEAD tamper rejection, nonce sequencing, 1000-byte limit); native paykit-lib tests are unaffected (241 pass). The homeserver-backed paths are since **browser-proven**: 14/14 e2e checks pass in real Chromium, Firefox, and WebKit against a live testnet homeserver — sessions, marker publish/discovery/removal, handshake over homeserver transport with converging link ids, bidirectional messages with marketplace kinds, and snapshot/restore surviving a destroyed browser context (`paykit-wasm/docs/browser-e2e.md`, commit `f935604`). Remaining before messaging leaves the sandbox: the production `startAuthFlow` signer path exercised live, mainnet/public-relay topology, the backup-key decision, and the Ring grant UX. The upstream issue is drafted in that repo at `docs/upstream-issue-draft.md`, deliberately not filed.

- [`evaluation.md`](evaluation.md) — candidate-by-candidate evaluation with source evidence
- [`implementation-plan.md`](implementation-plan.md) — concrete plan, gated on the decisions below
- `reference/` (gitignored) — clones of official `pubky/paykit-rs` @ `c8892f6` (the marketplace's audited commit) and `pubky/pubky-noise` @ `5ab90b6`, read during this evaluation

## Findings in one paragraph

Paykit Encrypted Links (official `pubky/paykit-rs`, riding official `pubky/pubky-noise`) are the only reviewed encrypted transport this ecosystem provides, and — contrary to first appearance — the no-browser-identity-key constraint does **not** block them: the link crypto uses a random receiver-scoped Noise key (`ReceiverNoiseSecretKey::random()`), never the identity secret, and the homeserver session it needs comes from a Ring-approved grant. Generic marketplace message kinds are in-contract via the public `send_private_application_message_json` API. What the constraint _does_ decide is where the Paykit Rust runtime and the receiver key live, and that is the fork: a marketplace-run Rust adapter ships sooner but **its operator can decrypt messages** (relocating, not fixing, the problem the task exists to fix), while a browser WASM binding of paykit/pubky-noise actually fixes it but requires upstream packaging work that doesn't exist yet (verified: no wasm CI or binding; out-of-the-box wasm32 build fails on getrandom backend config and ring's C toolchain — packaging obstacles, not API blockers). Direct pubky-noise use collapses into Paykit (using it raw means re-designing the protocol layer Paykit already reviewed); homeserver-encrypted-records collapses too (no counterparty-readable private paths exist, so every honest instantiation reinvents pubky-noise, which is forbidden hand-rolled protocol design); the legacy `/Volumes/vibedrive` forks of both repos are self-declared deprecated, non-interoperable with the official libraries, and disqualified.

## Recommendation and confidence

**Adopt Paykit Encrypted Links as the transport. Target the browser-WASM topology as the end state; do not build the server-side adapter unless the product owner explicitly accepts and labels its operator-can-decrypt property.**

- That Paykit-over-pubky-noise is the only viable ecosystem candidate: **high confidence** (all alternatives are blocked by verified, specific facts).
- That the no-identity-key constraint is compatible with Paykit: **high confidence** (verified in source, not docs: `handshake.rs:127`, `identity.rs:210/267`, `paths.rs`).
- That the browser WASM binding is achievable upstream: **medium confidence** (dependency stack already ships a browser build as `@synonymdev/pubky`; the two observed build failures are packaging-class; but nobody has done it, there is no wasm CI, and effort/timeline belong to upstream).
- That the adapter topology would be acceptable: **low confidence, and it is not mine to accept** — it fails the stated goal ("readable by its operator" is the thing being fixed) and is defensible only as an explicitly-labelled intermediate step.

## Decisions a human must make

1. **Topology** (the gating decision): (a) marketplace-run Rust messaging adapter — sooner, operator can decrypt, must be labelled as such; (b) upstream browser WASM binding — actually operator-unreadable, timeline owned by upstream; (c) keep messaging sandbox-only until (b) or a user-side Paykit runtime (e.g. Bitkit companion) exists. My recommendation: (b), with (c) as the honest meantime; build (a) only as a consciously labelled intermediate.
2. **Multi-device backup key** (topology b): what encrypts the `SdkBackupState`/snapshot blob — user passphrase, recovery-file-derived key, or a Ring-mediated wrap? Paykit deliberately leaves this to the caller. Determines whether a second device / re-login recovers history or starts fresh.
3. **Ring grant UX**: messaging needs a homeserver grant covering `/pub/paykit/…`, beyond the app's `/pub/pubky.app/:rw`. Separate approval or folded in — the same open product decision family as `service-auth.md`.
4. **Upstream engagement**: whether to file/fund the wasm-binding and message-kind-namespace work on `pubky/paykit-rs` / `pubky/pubky-noise` (issues drafted as plan Phase 0.3).

## What was implemented

Nothing beyond this research repo (local commits, unpushed, in `~/work/messaging-research`). Implementation was correctly withheld: every buildable variant either depends on Decision 1 or on upstream work that must be negotiated, and building the adapter unilaterally would bake in the operator-can-decrypt property without the product owner choosing it.

## Interim posture for messaging

Sandbox-only-and-labelled remains the right posture — do **not** add plaintext conversation tables to the durable service as a stopgap (it would contradict the service's premise and ADR-0019 §8). Two truthfulness improvements are warranted now (plan Phase 0.1):

1. The sandbox conversation view and attachment picker do not currently disclose, at the point of use, that messages are plaintext in service memory and operator-readable (verified — the labels only say "sandbox-only"). Add that one line where people actually type.
2. The durable-mode inbox copy ("needs an encrypted transport before it leaves the sandbox") is accurate; optionally name the chosen transport only after Decision 1 is made.

## Blockers, per candidate

| Candidate                                | Blocker                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Paykit encrypted links, browser topology | No JS/WASM binding exists; upstream packaging work (getrandom `wasm_js` backend, ring toolchain, binding crate, CI) plus pin/vendor discipline. Not blocked in principle.                               |
| Paykit encrypted links, adapter topology | Not technically blocked — blocked on a human accepting that the adapter operator can decrypt (otherwise it does not fix the problem).                                                                   |
| pubky-noise direct                       | Would require designing an unreviewed protocol layer (kinds, ordering, attachments, backup) that Paykit already provides — forbidden. Legacy `/Volumes` fork additionally deprecated/non-interoperable. |
| Homeserver encrypted records             | Homeserver has no counterparty-readable private paths; every honest design reinvents pubky-noise; pubky-app-specs has no message model; browser cannot ECDH with the identity key. Blocked.             |
| Anything else                            | Nothing found: Sealed Blob/atomicity is outside the audited upstream set; Locks has no messaging surface; Chatwoot is operator support chat; Pubky App has no DMs.                                      |
