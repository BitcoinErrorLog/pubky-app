# Pubchi Phase 0 — Kimi K2 security audit dispositions

**Audit:** OpenCode Kimi, transcript `/tmp/pubchi-stage/kimi-K2.log`  
**Audit HEAD:** `8010d4ec` (findings also apply at `55f3d7b8`)  
**Fix worktree:** `/Volumes/vibedrive/vibes-dev/pubky-app-wt-pubchi`  
**Branch:** `pubchi/phase0-app`  
**Verdict (Kimi): FIX-FIRST**  
**This wave:** all P1/P2/P3/P4 items below are FIXED. No waivers.

P1#1 was already present at start HEAD `55f3d7b8` (`fix(pubchi): route build-feed requests to /v1/feed`). It was verified, not redone.

## Findings

| ID | Severity | Path / symbol | Disposition |
| --- | --- | --- | --- |
| P1#1 | P1 | `src/libs/pubchi/flags.ts` `pubchiEndpointFor` / `getPubchiUrlFor`; `PubchiService.query` | FIXED in `55f3d7b8`. `build-feed` POSTs `/v1/feed`; `who-tagged-me` POSTs `/v1/query`; unserved purposes never leave the App. |
| P1#2 | P1 | `src/hooks/usePubchiQuery/usePubchiQuery.ts` `secretSeedFromSession`; `SignIn.tsx:98`; `useInviteCodeSignUp.ts:68` | FIXED in `11347431` (holder + populate/clear) and `58aaac1d` (hook reads holder only; panel disables Ask). In-memory holder, not the persisted onboarding `secretKey`. Ring / restored sessions show the Phase 0 unavailable copy. |
| P2 URL | P2 | `src/libs/runtime-config/runtime-config.schema.ts` `pubchiApiUrl` | FIXED in `62493322`. Strict parse: `https:` or empty. Lenient parse also allows `http://localhost` / `http://127.0.0.1` (any port). Rejects `http://evil`, `javascript:`, `ftp:`. CORS requirement documented in `.env.example` and `docs/pubchi-phase0.md`. |
| P2 IndexedDB | P2 | `cleanupLocalState` / `src/core/database/pubchi/pubchi.ts` | FIXED in `11347431`. `Dexie.delete('pubchi')` via `deletePubchiDatabase()` (does not call `getPubchiDatabase()`), gated by `isPubchiEnabled()` and try/catch. |
| P3 enrollment drift | P3 | `PubchiApplication.commitCreateBinding` / `commitDeleteBinding` | FIXED in `58aaac1d`. Homeserver PUT/DELETE failure rolls back the Dexie write (delete the new row / restore the previous row) and rethrows. |
| P3 inferred purpose | P3 | `inferPurpose` | FIXED in `58aaac1d`. `inferPurpose` removed. Panel actions: Ask → `who-tagged-me`, Build feed → `build-feed`. Hook/controller/application take an explicit purpose. |
| P4 zeroize | P4 | `src/libs/pubchi/schemas/ed25519.ts` `signEd25519`; hook seed lifetime | FIXED in `314b824d` (PKCS8 + seed copy `fill(0)` in `finally`) and `58aaac1d` (hook copies the seed and zeros the copy after the sign call). Vendoring comment notes the allowed adaptation. |
| P4 question max | P4 | `PubchiApplication.query` vs form max 500 | FIXED in `58aaac1d`. `PUBCHI_QUESTION_MAX_LENGTH` (500) enforced in the application. |
| P4 conventions | P4 | `src/libs/pubchi/feed-map.ts:41`; `src/core/services/pubchi/pubchi.ts` fetch | FIXED in `314b824d`. `Err.validation(..., 'FEED_SPECS_INVALID', …)`; `credentials: 'omit'`. |
| P4 stale binding / devtools | P4 | `usePubchiEnrollment`; onboarding `devtools` `secretKey` | FIXED in `58aaac1d` (homeserver reconcile on settings load; absent → local revoked + "not enrolled") and `docs/pubchi-phase0.md` (devtools caveat is pre-existing and is not the Pubchi signing source). |

## Doc inaccuracies (Kimi list)

1. **§Signing** — rewritten: only secret-based sign-in / in-browser signup can sign; Ring and restored sessions cannot.  
2. **§Contracts purpose→endpoint** — table is now Ask `/v1/query` vs Build feed `/v1/feed`.  
3. **Inferred purposes** — `what-i-missed` / `summarize` are no longer inferred; they remain unserved and are refused if passed explicitly.  
4. **IndexedDB clearing** — documented: created when the flag is on and a user enrolls; deleted on sign-out.  
5. **HelpContent / SettingsInfo snapshots** — recorded as environmental/pre-existing. Not re-run in this wave.

## Verified correct (from the K2 audit, verbatim)

- **Vendored contract fidelity:** all 17 files in `src/libs/pubchi/schemas/` are semantically identical to the reference `@pubky/pubchi-schemas` @ `bbf8a73` (diffed; only formatting, comments, `.js` suffixes, and the documented async Web Crypto adaptations differ). No contract redefinition.
- **Signing correctness:** empirically verified in Node 22 that the Web Crypto adaptation (`crypto.subtle` pkcs8/spki + prefixes) produces a signature **byte-identical** to the reference `node:crypto` implementation, and that `Keypair.secret()` returns exactly the 32-byte seed `signEd25519` requires. Canonical JSON (sorted keys, no whitespace, undefined dropped), `body_sha256` over the canonical body, TTL 600s = `REQUEST_TTL_SECONDS`, nonce = 32 bytes from `crypto.getRandomValues` — all match the server-side verify in `request.ts:94-122`. Expiry/skew failures fail closed.
- **No session/key in the request:** POST body is exactly `{ request, body: { question } }`; headers are only `content-type`/`accept`; `redirect: 'error'`; 30s abort; 256KB response cap (header + actual-bytes check); non-JSON → `SCHEMA_INVALID`. No cookie, token, or capability is attached.
- **No attacker-controlled string in the signed object:** asker from auth store, bot from the user's own local binding, purpose from a fixed enum, body hash of the user's own trimmed question, server-generated nothing.
- **Response handling:** `QueryResultV1` and `FeedProposalV1` are zod-strict-parsed before use; query items additionally enforce public `pubky://…/pub/pubky.app/` URIs with `subject_uri` belonging to the owner and `scope_owner === owner`; feeds enforce likes/reach/sort/content allowlists plus a `PubkyAppFeed.fromJson` round-trip. Rendering is plain React text — no `dangerouslySetInnerHTML`; evidence links are internal app routes only (`pubkyUriToAppHref` returns `null` for anything else → rendered as text). Applied feeds are re-validated by `FeedValidators.validateTagScope`/`validatePutParams` in `FeedController.commitCreate`.
- **Enrollment path safety:** bot pubky validated twice (form regex; controller `isPubkyId` with `PublicKey.from` round-trip). The z-base32 alphabet excludes `/`, `.`, `%`, so `ownerBindingUri` cannot escape `/pub/pubchi.app/bots/`; writes additionally pass through `HomeserverService.request`, which restricts PUT/DELETE to owned session paths. Remove is a real `session.storage.delete` + local delete. UI copy ("Public bot state… write the U → B binding on your homeserver") acknowledges the readable-by-design nature.
- **ForbiddenState:** `scanForbidden` is exported but unused client-side — correctly so: the signed body has a fixed single-key shape `{question}`, so no forbidden key can reach it; enforcement is server-side.
- **Flag off:** verified at every layer — service, application, controller, `getPubchiDatabase` (throws before any Dexie open), root layout (server-side guard + conditional dynamic import), launcher, panel, settings template, both settings menus, and a redirect on `/settings/pubchi`. No code path opens Dexie, renders UI, or makes network calls with `PUBKY_RUNTIME_PUBCHI_ENABLED=false`.
- **Privacy in telemetry:** only closed pubchi error codes are extracted from responses (`extractPubchiErrorCode` allowlist); toasts show codes only; `Err` contexts carry `pubchiCode`/`statusCode` only; Sentry runs `sendDefaultPii: false` + scrubbing + replay text masking. No question text, pubkys, or keys in logs/breadcrumbs.
- **Local scoping:** binding rows keyed `${owner}:${bot}` with an `owner` index; `readActive` filters by owner and `status === 'active'`.

## VRT impact

Panel rendering changed (Ask + Build feed; unavailable copy). **Baselines were not regenerated.**

Needs regeneration after a real `npm ci`:

- `src/test/vrt/pubchi/__screenshots__/PubchiPanel.vrt.test.tsx/pubchi-panel-desktop-chromium-darwin.png`
- possibly `src/test/vrt/pubchi/__screenshots__/PubchiSettings.vrt.test.tsx/pubchi-settings-desktop-chromium-darwin.png` if "not enrolled" is in frame

## Proof (this wave)

```
npx vitest run src/libs/pubchi src/libs/runtime-config src/core/services/pubchi src/core/application/pubchi src/core/controllers/pubchi src/core/controllers/auth src/hooks/usePubchiQuery src/hooks/usePubchiEnrollment src/components/organisms/Pubchi src/components/templates/Settings/Pubchi --project unit
Test Files  13 passed (13)
     Tests  171 passed (171)

npm run typecheck
> franky@1.5.0 typecheck
> tsc --noEmit

npm run lint -- <changed files>
0 errors (2 warnings: .env.example and docs/*.md ignored by ESLint)
```

Live browser / staging Pubchi (`:3001` / `:8790`) was not re-proven in this wave. Dev servers were left running.

## K2b re-audit (SHIP)

**Audit:** OpenCode Kimi, transcript `/tmp/pubchi-stage/kimi-K2b.log`  
**Audit HEAD:** `5ac4e5b4`  
**Fix HEAD:** `30bba522` (`fix(pubchi): close K2b hygiene findings`)  
**Worktree:** `/Volumes/vibedrive/vibes-dev/pubky-app-wt-pubchi`  
**Branch:** `pubchi/phase0-app`  
**Verdict (Kimi): SHIP** — all P1/P3 items verified fixed; the one PARTIAL (P2 IndexedDB gate) plus four new P4s were hygiene-level. Those four P4s and the PARTIAL are FIXED in `30bba522`.

### Per-finding status (verbatim from K2b)

| K2 finding | Status | Evidence |
|---|---|---|
| P1 build-feed → `/v1/feed`, who-tagged-me → `/v1/query` | **FIXED-VERIFIED** | `flags.ts:25-34` (`pubchiEndpointFor`); service resolves URL from the signed purpose `services/pubchi/pubchi.ts:33`; application independently refuses unserved purposes `application/pubchi/pubchi.ts:199-201` |
| P1 signing seed in-memory holder | **FIXED-VERIFIED** | Holder is a module-level `let`, store state carries only `{available: boolean}`, bare `create` — no persist/devtools (`signing-seed.ts:9-13`). Populated only in `signIn` (`auth.ts:108`, covers `loginWithMnemonic:248` + `loginWithEncryptedFile:260`) and `signUp:237`. Cleared at sign-in/sign-up start (`:93,:225` — fail-closed: a failed sign-in leaves no seed), Ring auth-URL start (`wrapAuthFlow:273`, both flows `:363,:373`), and `cleanupLocalState:346`. Grep of all 7 zustand `partialize`s + storage writes: seed never persisted, never logged (no Logger/console in any pubchi module; `Err` contexts carry codes only). Retain happens only *after* `completeAuthenticatedSession` resolves (`:107-108`) — no seed-before-success window. Reload → module state gone → panel shows unavailable copy and disables both buttons (`PubchiPanel.tsx:33,47-51`), no raw error. Hook reads only the holder (`usePubchiQuery.ts:13,50`); `secretSeedFromSession` fully gone |
| P2 `PUBCHI_API_URL` https in prod / loopback-only in lenient | **FIXED-VERIFIED** | Strict schema `runtime-config.schema.ts:50,55` used by the production env parse (`runtime-config.ts:82-90`); lenient `:52,56,462` only for dev/test + window revalidation of server-derived config. Empirically tested bypasses (node WHATWG URL): uppercase scheme, `user@host` / `host@user`, `[::1]`, `localhost.`, `0.0.0.0`, `localhost.evil.com`, decimal/hex/short IPv4 (`2130706433`, `0x7f000001`, `127.1`), `%6cocalhost`, bare `http:localhost` — **no bypass**; every accepted value resolves to genuine loopback, strict parse rejects all `http:` |
| P2 `Dexie.delete('pubchi')` on sign-out | **PARTIAL** | `deletePubchiDatabase` is flag-safe and cannot throw past sign-out (`database/pubchi/pubchi.ts:46-52`; try/catch `auth.ts:347-353`), but it is **gated on `isPubchiEnabled()` (`auth.ts:347`) — it does not run when the flag is off**, and franky's `clearDatabase` only clears franky tables (`franky.helpers.ts:4-10`). Flag flipped off after enrollment → sign-out leaves binding rows behind. See NEW P4#2 |
| P3 enrollment rollback + reconcile | **FIXED-VERIFIED** (2 minor notes) | Create: local upsert → PUT → rollback restores previous row or deletes, rethrows (`application/pubchi/pubchi.ts:73-84,223-232`). Delete: revoked upsert → DELETE → local delete, rollback on failure (`:97-122`). Reconcile reads the correct owner (auth-store owner + local bot → `ownerBindingUri`, owned-session path); transient network errors throw out of `HomeserverService.exists` (`homeserver.ts:592-613`, non-404 → `handleError` throws) and are caught → **local kept, no false revoke** (`:142-146,163-165`). Only explicit absence or a parseable non-active body revokes. Notes: NEW P4#3, P4#4 |
| P3 explicit Ask / Build feed purpose | **FIXED-VERIFIED** | `inferPurpose` removed (grep: only the disposition doc mentions it). Ask → `submit('who-tagged-me')` (`PubchiPanel.tsx:57`), Build feed → `submit('build-feed')` (`:76`); purpose flows unchanged hook → controller (`controllers/pubchi/pubchi.ts:67`) → signed object (`application/pubchi/pubchi.ts:198-216`). Signed purpose ≡ clicked action |
| P4 zeroize in `signEd25519` | **FIXED-VERIFIED** (1 gap) | `pkcs8` + `seedCopy` zeroed in `finally`, including throw path (`ed25519.ts:33-40`); hook zeroes its copy in `finally` (`usePubchiQuery.ts:71-74`); `signRequestObjectV1` passes by reference (no extra copy, `request.ts:73-79`). Gap: the `asCryptoBytes` copy of the PKCS8 buffer is not zeroed — NEW P4#1 |
| P4 question max 500 in application | **FIXED-VERIFIED** | `limits.ts:2`; enforced `application/pubchi/pubchi.ts:191-196` |
| P4 `Err.validation` in feed-map | **FIXED-VERIFIED** | `feed-map.ts:44-47` |
| P4 `credentials: 'omit'` | **FIXED-VERIFIED** | `services/pubchi/pubchi.ts:46` |
| P4 stale-binding reconcile / devtools | **FIXED-VERIFIED** | Reconcile on settings load (`usePubchiEnrollment.ts:27-33`); signing-seed store has no devtools middleware; onboarding `secretKey` persistence is pre-existing and no longer a Pubchi signing source |

### New P4 dispositions (this close-out)

| ID | K2b finding | Disposition |
| --- | --- | --- |
| P4#1 | Unzeroed PKCS8 copy via `asCryptoBytes` | FIXED in `30bba522`. `signEd25519` captures `keyBytes = asCryptoBytes(pkcs8)` and `fill(0)`s `pkcs8` / `seedCopy` / `keyBytes` in the same `finally`. Tested on success and `importKey` throw. |
| P4#2 / PARTIAL | `isPubchiEnabled()` gate on sign-out Dexie delete | FIXED in `30bba522`. Gate removed; `deletePubchiDatabase()` runs on every `cleanupLocalState`. Test: flag off + existing `pubchi` IndexedDB → deleted on logout. |
| P4#3 | Reconcile revokes on malformed 200 body | FIXED in `30bba522`. `!parsed.ok` keeps the local row (transient). Revoke only on explicit 404/absence or a parsed body with `status !== 'active'`. |
| P4#4 | Reconcile upserts remote body without owner/bot match | FIXED in `30bba522`. Reject unless `parsed.value.bot === local.bot && parsed.value.owner === owner`; never upsert a different bot from reconcile. |

### VRT (K2b close-out)

Command used (from `package.json` `test:vrt` / `docs/component-testing.md` VRT project):

```
npx vitest run --project vrt src/test/vrt/pubchi
```

Playwright browsers **were present** (chromium, firefox, and webkit all launched). Suites failed before any screenshot compare:

```
Error: Failed to import test file .../src/test-utils/vrt.setup.ts
Caused by: TypeError: Failed to fetch dynamically imported module:
  http://localhost:63315/@fs/Users/johncarvalho/.cache/pubchi-app-nm/@fontsource-variable/inter-tight/files/inter-tight-latin-wght-normal.woff2?import&url
webkit: 'font/woff2' is not a valid JavaScript MIME type for module script
```

`node_modules` is a symlink to `/Users/johncarvalho/.cache/pubchi-app-nm`. The `?url` woff2 import in `vrt.setup.ts` is served as a JS module from `@fs`. Per brief: did not install browsers, did not hand-edit PNGs. **Baselines not regenerated.**

Committed PNG md5s (unchanged):

- `pubchi-panel-desktop-chromium-darwin.png` `48f50e9dd4eba5dc55c305eeac9ec8c0` — stale: Ask only, no Build feed, no unavailable-session copy
- `pubchi-settings-desktop-chromium-darwin.png` `78bca8cff2849d8aa6e70fbc85fa6a2b` — Enroll bot; "not enrolled" copy is not in frame

