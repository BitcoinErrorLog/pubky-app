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

## The Locks flow itself is verified, minus the payment leg

Building the SDK only proves the package compiles. To find out whether the guarded-content flow actually works, the upstream repository's own end-to-end test was run at the same pinned commit:

```bash
cargo test -p locks-e2e creator_publishing_http_flow -- --nocapture
```

It passes, and it exercises the whole contract the marketplace depends on:

1. `POST /creator/lock-service-config`
2. `PUT /creator/priv-resources/content/<path>` — guarded bytes registered
3. `POST /creator/content-locks` — lock created
4. `POST /proof-bundles` — proof submitted, lifecycle opened
5. `POST /verification-task-completions` — **dev-only** completion gate
6. `POST /access-credentials` — viewer credential issued
7. `GET /priv-resources/content/<path>` — guarded bytes proxied back

So creator publishing, proof submission, entitlement, credential issuance, and guarded reads are confirmed working, not assumed. Locks also ships its own `docker-compose.yml` (postgres, pubky-testnet, locks-server, creator and reader demos) with ports defaulting clear of the usual local collisions.

**What step 5 substitutes for is the whole point.** In production that completion comes from a `paykit-payment` verifier: Lock Server requests an invoice from Paykit Server, Paykit Server watches Bitcoin via Electrum, and the lifecycle completes when payment confirms. Submitting a `paykit-payment` proof to a Lock Server with no `[paykit]` runtime section returns `422 paykit_not_configured` — the payment leg cannot be faked into existence, which is the correct behavior.

That leaves the deferred scope precisely bounded: **the payment leg only.** Everything on either side of it is verified.

## Remaining work before the SDK can be used in the app

1. Vendor the generated `pkg/` (or publish it to a controlled immutable registry) and wire the smoke test into CI ahead of `next build`.
2. Replace `LocksGatewayService`'s hand-rolled HTTP calls with the SDK's `Viewer` methods.
3. Stand up the composed integration environment (Lock Server, Paykit Server, Bitcoin regtest, Electrum) — `pubky/paykit-server` has no releases, so it must also be built from a pinned commit.
4. Exercise the buyer flow end to end, which requires a Bitkit wallet to receive the Paykit payment request and execute payment on regtest.
