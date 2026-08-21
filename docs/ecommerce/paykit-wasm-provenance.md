# paykit-wasm Build Provenance

The paykit-wasm browser binding — the Paykit Encrypted Link messaging surface compiled to WASM — is not published to npm. It is built from source at a pinned commit and vendored into this repository, then loaded through a dynamic import so the WASM module never enters a server-rendered module graph. This file records the provenance of the build so it is reproducible and auditable.

Vendored: 2026-08-21. The vendored files are byte-identical to the build recorded in the binding's own `paykit-wasm/README.md` at the pinned commit (checksums verified on copy).

## Source

| Field           | Value                                                               |
| --------------- | ------------------------------------------------------------------- |
| Repository      | `https://github.com/BitcoinErrorLog/paykit-rs-official`             |
| Branch          | `feat/wasm-binding`                                                 |
| Commit          | `f9356041de74f2a953c67107f9f9ed49e79d450b`                          |
| Upstream        | `https://github.com/pubky/paykit-rs`                                |
| Upstream pin    | `c8892f638951f033acbcd12804a31667a81ddc14` (tag anchor v0.1.0-rc43) |
| Package path    | `paykit-wasm/pkg`                                                   |
| Package name    | `paykit-wasm`                                                       |
| Package version | `0.1.0-rc43`                                                        |
| License         | MIT                                                                 |

The upstream pin matches the audited paykit-rs commit recorded in [`messaging/README.md`](messaging/README.md). The fork adds only packaging-class fixes for the wasm32 target (getrandom backends, a one-line vendored `snow` manifest fix, `uuid` RNG feature, `reqwest/stream`) — the full diff rationale is in the binding's README at the pinned commit. Upstream paykit-rs is pre-1.0 ("WIP - not for production") and claims no independent security review; the binding and this integration inherit that status.

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
cd paykit-rs-official && git checkout f9356041de74f2a953c67107f9f9ed49e79d450b
rustup target add wasm32-unknown-unknown
wasm-pack build paykit-wasm --target web --out-dir pkg --release
node paykit-wasm/scripts/smoke.mjs   # requires Node >= 20
```

## Artifact checksums

SHA-256 of the vendored files (identical to the binding README's recorded build):

| File                       | SHA-256                                                            |
| -------------------------- | ------------------------------------------------------------------ |
| `paykit_wasm_bg.wasm`      | `a62f2d30b7cf9b7237f2b687a8627a471e4906b1bd5bc80406bf60d3f0fbe545` |
| `paykit_wasm.js`           | `d1b066de78c4e1069a77cffd743d44005fc15931d5b1caa50e5284cb924baf77` |
| `paykit_wasm.d.ts`         | `a8388c144d16a88963b76563255bae05ced9b43d8f13d1cf736ee15b6de230f9` |
| `paykit_wasm_bg.wasm.d.ts` | `b92ceda67ff978dccc29a65aa8a786a341e50d532e2dcc1ec5b4684d172173ae` |
| `package.json`             | `4ef84587b4aed173786a1beb771b4619c4d296886134d9b5c5847052e24af425` |

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
- The homeserver-backed flows (sessions, receiver markers, handshake over homeserver outbox transport, bidirectional Private Application Messages, snapshot/restore across a destroyed browser context) are proven by the binding's own Playwright e2e at the pinned commit — 14/14 checks in real Chromium, Firefox, and WebKit against a live Pubky testnet homeserver. See `paykit-wasm/docs/browser-e2e.md` in the source repo for the exact environment and the honest not-covered list (notably: the production `startAuthFlow` signer approval is NOT e2e-covered there; only URL construction is).

## What the binding is used for here

`PaykitMessagingService` (`src/core/services/paykit/paykit-messaging.ts`) uses the binding for end-to-end-encrypted marketplace messaging in durable commerce modes: a Ring-approved homeserver session scoped to `/pub/paykit/:rw`, a receiver-scoped Noise key generated in the browser (never the identity secret), receiver marker publish/discovery, Noise XX Encrypted Links per counterparty, and Private Application Messages with marketplace kinds. The WASM module is loaded lazily via dynamic import on first use, never at module scope, mirroring the Locks SDK loading pattern.

## Known limitations inherited from the binding

- 1000-byte limit per Private Application Message (JSON envelope included) — attachments are not possible inline and are not offered in encrypted mode.
- Link and handshake snapshots serialize UNENCRYPTED and contain key material; the caller owns at-rest protection. This app stores them in account-scoped IndexedDB and discloses that in the UI; encrypting them at rest requires the multi-device backup-key decision, which remains open.
- `PubkyClient` exposes only mainnet defaults and the fixed local-testnet topology (`testnet()`, pkarr relay `localhost:15411`); no custom relay/host overrides.
- Link handles reject overlapping operations ("operation in flight"); callers serialize per-link operations (the service does).
- No independent security review of paykit-rs, pubky-noise, or the binding.
