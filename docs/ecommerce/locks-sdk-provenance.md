# Locks SDK Build Provenance

The Pubky Locks browser SDK is not published to npm. It is built from source at a pinned commit and vendored into this repository, then loaded through a dynamic import so the WASM module never enters a server-rendered module graph. This file records the provenance of the build so it is reproducible and auditable.

Reproduced: 2026-08-20. Vendored: 2026-08-20.

## Source

| Field           | Value                                         |
| --------------- | --------------------------------------------- |
| Repository      | `https://github.com/pubky/locks`              |
| Commit          | `ba49a777a94db318ec6ebd427315080a5b904645`    |
| Package path    | `locks-sdk/bindings/js`                       |
| Package name    | `@pubky/locks-sdk` (`private: true` upstream) |
| Package version | `0.1.0`                                       |
| License         | MIT                                           |

The commit matches the audited revision pinned in [`upstream-integration.md`](upstream-integration.md).

## Toolchain

| Tool              | Version                       |
| ----------------- | ----------------------------- |
| `wasm-pack`       | 0.13.1                        |
| `rustc`           | 1.89.0 (29483883e 2025-08-04) |
| Rust target       | `wasm32-unknown-unknown`      |
| Node (smoke test) | v22.14.0                      |

## Generation command

```bash
git clone https://github.com/pubky/locks.git
cd locks && git checkout ba49a777a94db318ec6ebd427315080a5b904645
cd locks-sdk/bindings/js
rustup target add wasm32-unknown-unknown
npm run build            # wasm-pack build --target web --out-dir pkg
node scripts/smoke-generated-api.mjs
```

## Artifact checksums

SHA-256 of the generated `pkg/` outputs:

| File                     | SHA-256                                                            |
| ------------------------ | ------------------------------------------------------------------ |
| `locks_sdk_wasm_bg.wasm` | `90e388d0cde26955bf384c2dc899e289efc24d71feb95f15976b7af3fdb21e06` |
| `locks_sdk_wasm.js`      | `c8d3ae13f0e556da906fc6adecc7a9c22afdf43037132275b9510c7896d8556e` |

Generated package size: ~1.2 MB. Note that `wasm-opt` output is not guaranteed bit-identical across platforms; treat these checksums as a record of this build, and re-record when the pin or toolchain changes.

## Vendoring mechanism

The generated `pkg/` output is committed verbatim at `vendor/locks-sdk-wasm/` and referenced from `package.json` as a `file:` dependency:

```json
"locks-sdk-wasm": "file:vendor/locks-sdk-wasm"
```

npm symlinks `node_modules/locks-sdk-wasm` to the vendored directory, so a fresh clone plus `npm ci` resolves the SDK with no extra steps and no network fetch from a mutable source. The vendored directory carries a `PROVENANCE.md` pointing back to this file, and is excluded from Prettier (`.prettierignore`) so the committed artifacts stay byte-identical to the recorded build.

Vendored files and their SHA-256 checksums (the `.js` and `.wasm` match the build record above):

| File                          | SHA-256                                                            |
| ----------------------------- | ------------------------------------------------------------------ |
| `locks_sdk_wasm_bg.wasm`      | `90e388d0cde26955bf384c2dc899e289efc24d71feb95f15976b7af3fdb21e06` |
| `locks_sdk_wasm.js`           | `c8d3ae13f0e556da906fc6adecc7a9c22afdf43037132275b9510c7896d8556e` |
| `locks_sdk_wasm.d.ts`         | `91cc6bf29ed2e13fd248b68185b2b63d0fbbc1ec83f4d2739c157ff1dae98dae` |
| `locks_sdk_wasm_bg.wasm.d.ts` | `2dc0e05420095ef8a7992d07154c0702372b2dfd6664d436e729002e6c34dbf4` |
| `package.json`                | `c760bc271fbe85ad8d10bc48ccdec1f9cf869f369ece58102a18adbf046d66d6` |

Upstream's `pkg/.gitignore` (which ignores everything) is deliberately not copied.

### Re-vendoring

1. Rebuild from the pinned (or newly pinned) upstream commit using the generation command above.
2. Copy `pkg/package.json`, `locks_sdk_wasm.js`, `locks_sdk_wasm.d.ts`, `locks_sdk_wasm_bg.wasm`, and `locks_sdk_wasm_bg.wasm.d.ts` into `vendor/locks-sdk-wasm/` (never copy `pkg/.gitignore`).
3. Run `npm install` to refresh `package-lock.json`, then `node scripts/locks-sdk-smoke.mjs`.
4. Update the commit pin, toolchain table, and checksums in this file.

## Verification performed

- `npm run build` (upstream `wasm-pack` build) completed successfully.
- `node scripts/locks-sdk-smoke.mjs` passes against the vendored copy; CI runs it in `.github/workflows/build.yml` ahead of `next build`, so a regression in the generated API surface fails the build job.
- The generated API exposes the viewer surface the marketplace needs on `Locks.viewer`: `submitProofBundle`, `lookupVerificationTask`, `completeVerificationTask`, `issueAccessCredential`, and `proxyReadGuardedResource`, plus the creator surface (`Creator`, `CreateContentLockRequestBuilder`, `RegisterGuardedResourceOptions`, session/connect helpers).

`LocksGatewayService` (`src/core/services/locks/locks.ts`) now calls Locks exclusively through this SDK, per the upstream guidance in `upstream-integration.md` ("do not create hand-written substitutes for Locks canonicalization, identifiers, proof payloads, credentials, or session handling"). The WASM module is loaded lazily via dynamic import on first use in the browser; `src/core/services/locks/locks.ssr.test.ts` proves it is never imported at module scope anywhere in the Locks call chain.

## Remaining work before real payments can be exercised

1. Stand up the composed integration environment (Lock Server, Paykit Server, Bitcoin regtest, Electrum) — `pubky/paykit-server` has no releases, so it must also be built from a pinned commit.
2. Exercise the buyer flow end to end, which requires a Bitkit wallet to receive the Paykit payment request and execute payment on regtest.
