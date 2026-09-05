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
