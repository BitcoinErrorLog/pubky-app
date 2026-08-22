# paykit-wasm Build Provenance

The paykit-wasm browser binding — the Paykit Encrypted Link messaging surface compiled to WASM — is not published to npm. It is built from source at a pinned commit and vendored into this repository, then loaded through a dynamic import so the WASM module never enters a server-rendered module graph. This file records the provenance of the build so it is reproducible and auditable.

Vendored: 2026-08-22 (updated to pick up the zero-approval cookie-resume surface, `resumeSessionFromCookie`). The vendored files are byte-identical to the build recorded in the binding's own `paykit-wasm/README.md` at the pinned commit (checksums verified on copy).

## Source

| Field           | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Repository      | `https://github.com/BitcoinErrorLog/paykit-rs-official`             |
| Branch          | `feat/wasm-binding`                                                 |
| Commit          | `0a6c6e4521fd41f5081ad9f074020f4813d8a03e`                          |
| Upstream        | `https://github.com/pubky/paykit-rs`                                |
| Upstream pin    | `c8892f638951f033acbcd12804a31667a81ddc14` (tag anchor v0.1.0-rc43) |
| Package path    | `paykit-wasm/pkg`                                                   |
| Package name    | `paykit-wasm`                                                       |
| Package version | `0.1.0-rc44`                                                        |
| License         | MIT                                                                 |

The upstream pin matches the audited paykit-rs commit recorded in [`messaging/README.md`](messaging/README.md). The fork adds only packaging-class fixes for the wasm32 target (getrandom backends, a one-line vendored `snow` manifest fix, `uuid` RNG feature, `reqwest/stream`) plus additive binding surfaces: `SessionHandle.exportSession()` / `PubkyClient.restoreSession()`, thin wrappers over pubky 0.8.0's own wasm session `export()`/`import()` (secret-free metadata; the credential stays in the browser's HTTP-only cookie jar), and `PubkyClient.resumeSessionFromCookie(pubky)` — a zero-approval session resume that synthesizes the same secret-free `SessionInfo` payload and reuses the identical `/session` revalidation, then verifies the homeserver's authoritative response for the expected pubky and a capability covering `/pub/paykit/` read+write, rejecting with typed `Error.name` values (`SessionResumeUnauthorized`, `SessionResumePubkyMismatch`, `SessionResumeScopeMissing`). The full diff rationale is in the binding's README at the pinned commit. Upstream paykit-rs is pre-1.0 ("WIP - not for production") and claims no independent security review; the binding and this integration inherit that status.

## Toolchain

| Tool              | Version                              |
| ----------------- | ------------------------------------ |
| `wasm-pack`       | 0.13.1 (bundled binaryen `wasm-opt`) |
| `rustc`           | 1.93.1 (01f6ddf75 2026-02-11)        |
| `wasm-bindgen`    | 0.2.115                              |
| Rust target       | `wasm32-unknown-unknown`             |
| Node (smoke test) | v22.14.0                             |

## Generation command

```bash
git clone https://github.com/BitcoinErrorLog/paykit-rs-official.git
cd paykit-rs-official && git checkout 0a6c6e4521fd41f5081ad9f074020f4813d8a03e
rustup target add wasm32-unknown-unknown
wasm-pack build paykit-wasm --target web --out-dir pkg --release
node paykit-wasm/scripts/smoke.mjs   # requires Node >= 20
```

## Artifact checksums

SHA-256 of the vendored files (identical to the binding README's recorded build):

| File                       | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `paykit_wasm_bg.wasm`      | `cd781e364126312453b014ba3ceb74055a0c3f8b26c70b41e4827a0991ba4096` |
| `paykit_wasm.js`           | `ee73963f128b8b2667391721b3ed3a025527d4b89ade26cd1522c47cf9746587` |
| `paykit_wasm.d.ts`         | `c88bda8479479e6dd548542a3b380b7224dcab28cca572936d69cf8013930887` |
| `paykit_wasm_bg.wasm.d.ts` | `b390e8c1ebd8ec5ed148bd51aa8891ca7b6688d35fe744b90bd4615cf86cf5bb` |
| `package.json`             | `374e0391c23bfa4e56d0a2819c6823bc7a1c83a7ca79c9032a5e4cadd40c261a` |

Generated package size: ~1.5 MB (wasm ~1.45 MB). `wasm-opt` output is not guaranteed bit-identical across platforms; treat these checksums as a record of this build, and re-record when the pin or toolchain changes.

## Vendoring mechanism

The generated `pkg/` output is committed verbatim at `vendor/paykit-wasm/` and referenced from `package.json` as a `file:` dependency:

```json
"paykit-wasm": "file:vendor/paykit-wasm"
```

npm symlinks `node_modules/paykit-wasm` to the vendored directory, so a fresh clone plus `npm ci` resolves the binding with no extra steps and no network fetch from a mutable source. The vendored directory carries a `PROVENANCE.md` pointing back to this file, and is excluded from Prettier (`.prettierignore`) so the committed artifacts stay byte-identical to the recorded build.

### Re-vendoring

1. Rebuild from the pinned (or newly pinned) source commit using the generation command above.
2. Copy `pkg/package.json`, `paykit_wasm.js`, `paykit_wasm.d.ts`, `paykit_wasm_bg.wasm`, and `paykit_wasm_bg.wasm.d.ts` into `vendor/paykit-wasm/`.
3. Run `npm install` to refresh `package-lock.json`, then `node scripts/paykit-wasm-smoke.mjs`.
4. Update the commit pin, toolchain table, and checksums in this file.

## Verification performed

- `node scripts/paykit-wasm-smoke.mjs` passes against the vendored copy with REAL crypto in Node: module instantiation, the bound messaging API surface, receiver Noise key generation (entropy through the wasm getrandom backend), a complete Noise XX handshake between two in-memory parties with converging link ids (`MemoryNoiseSession` drives the exact `DataLinkContext` state machine Encrypted Links use), encrypted roundtrips in both directions, AEAD rejection of tampered ciphertext, the 1000-byte message limit, and `pubkyauth` URL construction for the `/pub/paykit/:rw` scope. CI runs it in `.github/workflows/build.yml` ahead of `next build`.
- The homeserver-backed flows (sessions, session export/restore across a page reload, cookie-ONLY resume with the exported metadata discarded, receiver markers, handshake over homeserver outbox transport, bidirectional Private Application Messages, snapshot/restore across a destroyed browser context) are proven by the binding's own Playwright e2e at the pinned commit — 19/19 checks in real Chromium, Firefox, and WebKit against a live Pubky testnet homeserver, with every post-resume check running on the cookie-resumed session. See `paykit-wasm/docs/browser-e2e.md` in the source repo for the exact environment and the honest not-covered list (notably: the production `startAuthFlow` signer approval is NOT e2e-covered there, and the `SessionResumeScopeMissing` typed rejection is covered by the binding's native cargo tests rather than the e2e, because dev signup sessions are root-scoped).

## What the binding is used for here

`PaykitMessagingService` (`src/core/services/paykit/paykit-messaging.ts`) uses the binding for end-to-end-encrypted marketplace messaging in durable commerce modes: a Ring-approved homeserver session scoped to `/pub/paykit/:rw`, a receiver-scoped Noise key generated in the browser (never the identity secret), receiver marker publish/discovery, Noise XX Encrypted Links per counterparty, and Private Application Messages with marketplace kinds. The WASM module is loaded lazily via dynamic import on first use, never at module scope, mirroring the Locks SDK loading pattern.

## Known limitations inherited from the binding

- 1000-byte limit per Private Application Message (JSON envelope included) — attachments are not possible inline and are not offered in encrypted mode.
- Link and handshake snapshots serialize UNENCRYPTED and contain key material; the caller owns at-rest protection. This app stores them in account-scoped IndexedDB and discloses that in the UI; encrypting them at rest requires the multi-device backup-key decision, which remains open.
- `PubkyClient` exposes only mainnet defaults and the fixed local-testnet topology (`testnet()`, pkarr relay `localhost:15411`); no custom relay/host overrides.
- Link handles reject overlapping operations ("operation in flight"); callers serialize per-link operations (the service does).
- No independent security review of paykit-rs, pubky-noise, or the binding.
