# Locks SDK Build Provenance

The Pubky Locks browser SDK is not published to npm. It must be built from source at a pinned commit and vendored, then loaded through a dynamic import in a client component. This file records the provenance of the build so it is reproducible and auditable.

Reproduced: 2026-08-20.

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

## Verification performed

- `npm run build` completed successfully.
- `node scripts/smoke-generated-api.mjs` passed ("generated package API smoke check passed").
- The generated API exposes the viewer surface the marketplace needs on `Locks.viewer`: `submitProofBundle`, `lookupVerificationTask`, `completeVerificationTask`, `issueAccessCredential`, and `proxyReadGuardedResource`, plus the creator surface (`Creator`, `CreateContentLockRequestBuilder`, `RegisterGuardedResourceOptions`, session/connect helpers).

This confirms the client should call Locks through this SDK rather than hand-rolled HTTP requests, per the upstream guidance in `upstream-integration.md` ("do not create hand-written substitutes for Locks canonicalization, identifiers, proof payloads, credentials, or session handling").

## Remaining work before the SDK can be used in the app

1. Vendor the generated `pkg/` (or publish it to a controlled immutable registry) and wire the smoke test into CI ahead of `next build`.
2. Replace `LocksGatewayService`'s hand-rolled HTTP calls with the SDK's `Viewer` methods. Until then the client speaks the Lock Server's documented viewer routes directly; that surface (proof-bundle submission, lifecycle lookups, credential issuance, guarded proxy reads, frontend sessions) is live-verified against the pinned Lock Server revision by `npm run test:marketplace:locks`, which bounds the drift risk the SDK would eliminate.

Done since this file was first written:

- ~~Stand up the composed integration environment (Lock Server, Paykit Server, Bitcoin regtest, Electrum)~~ — done: the `payments-env` composed stack builds paykit-server from its pinned commit and proves the protocol leg with its own `verify.sh`.
- ~~Exercise the buyer flow end to end~~ — done on regtest with the wallet's protocol role simulated by the environment's real tooling (`paykit-companion-auth`, `paykit-reader-demo`); only the real Bitkit app UX remains unproven. See [`status.md`](status.md) and [`RUNNING.md`](RUNNING.md).
