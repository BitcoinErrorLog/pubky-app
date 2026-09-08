# Pubchi Phase 0 (App spike)

Read-only, feature-flagged Pubchi surfaces in Pubky App. No hosted bot session. The service never receives a Pubky session or key.

## Flags

| Env                            | Default | Effect                                                                     |
| ------------------------------ | ------- | -------------------------------------------------------------------------- |
| `PUBKY_RUNTIME_PUBCHI_ENABLED` | `false` | Master switch. Off: no settings item, no panel, no Dexie open, no network. |
| `PUBKY_RUNTIME_PUBCHI_API_URL` | empty   | Chat panel stays hidden until a URL is set, even if the flag is on.        |

`PUBKY_RUNTIME_PUBCHI_API_URL` must be `https:` in production. `http://localhost` and `http://127.0.0.1` (any port) are accepted only by the lenient dev/test parse. The Pubchi service must CORS-allowlist the App origin; a missing allowlist is a silent `CONNECTION_FAILED` (already proven in the Phase 0 live proof).

Schema: `src/libs/runtime-config/runtime-config.schema.ts`. Getters: `getPubchiEnabled`, `getPubchiApiUrl`. Helpers: `isPubchiEnabled`, `isPubchiPanelEnabled`.

When the flag is on and a user enrolls, the isolated `pubchi` IndexedDB is created. It is deleted in `cleanupLocalState` on sign-out (`Dexie.delete('pubchi')`, gated by `isPubchiEnabled()`). Toggling the flag off does not itself delete an already-created database.

## Accepted limitations

- Known gaps: bot-key derivation still runs on the main thread rather than in a short-lived worker.
- A previous identity's homeserver delegation cannot be revoked without that identity's live session. The 30-day delegation expiry is the only backstop.
- `Dexie.delete('pubchi')` can be blocked by another open tab holding the database. In that multi-tab case, a failed remote DELETE can leave a live device key and a live delegation in the sibling tab after this tab's logout. A pending DELETE record for that signer is retained across sign-in/reconcile while the key is still live locally, so the next drain after a genuine wipe can finish revocation. It is not discarded merely because the skip path ran.
- `pubchi.pendingDelegationDeletes` is capped at 32 unique `owner:signer` rows (FIFO, newest-wins). That bound is a storage bound, not a security boundary: anyone who can write localStorage can already delete the pending list or the device key. Ordinary churn (~11 identities × 3 keys) can also evict a legitimate not-yet-attempted record. Do not treat eviction as an access-control failure.

## Surfaces

- Settings: `/settings/pubchi` (`PubchiSettings`, `data-surface="pubchi-settings"`). Paste bot pubky B; write/remove the U → B binding. On load the Dexie row is reconciled with the homeserver object; if it is absent the local row is marked revoked and the page shows "not enrolled".
- Chat panel: Shadcn `Sheet` (`PubchiPanel`, `data-surface="pubchi-panel"`). Lazy-mounted from the root layout only when the panel is enabled. Two actions: **Ask** (`who-tagged-me`) and **Build feed** (`build-feed`). Purpose is not inferred from the question text.

## Contracts consumed

Vendored from `@pubky/pubchi-schemas` commit `bbf8a73` into `src/libs/pubchi/schemas/` (not a `file:` dependency — `npm run build` must not require a second checkout). Browser-safe SHA-256 / Ed25519 via Web Crypto. `signEd25519` zeroizes its PKCS8 DER buffer and seed copy in `finally` (allowed adaptation; signatures stay byte-identical).

- `OwnerBindingV1` at `pubky://U/pub/pubchi.app/bots/B.json`
- `RequestObjectV1` (asker = U, 600s TTL, sha256 of canonical ask body, Ed25519 by U)
- `QueryResultV1` evidence cards
- `FeedProposalV1` preview; Apply only after `parseFeedProposalV1` (likes/unsupported reach never show Apply)

Endpoint is selected by the purpose the user chose. `pubchiEndpointFor(purpose)` in `src/libs/pubchi/flags.ts` is the mapping; the service layer uses it. Do not POST every purpose to `/v1/query`.

| Purpose                      | Method + path                     | Response                                            |
| ---------------------------- | --------------------------------- | --------------------------------------------------- |
| `who-tagged-me` (Ask)        | `POST ${PUBCHI_API_URL}/v1/query` | `QueryResultV1`                                     |
| `build-feed` (Build feed)    | `POST ${PUBCHI_API_URL}/v1/feed`  | `FeedProposalV1`                                    |
| `what-i-missed`, `summarize` | not served in Phase 0             | App refuses with `PURPOSE_UNSUPPORTED` (no network) |

The service accepts only those two purpose/path pairs. A mismatched pair returns `400 {"error":"PURPOSE_UNSUPPORTED"}`. Responses are parsed by `schema` (`pubchi-query-result` vs `pubchi-feed-proposal`).

## Signing

`RequestObjectV1` is signed with a 32-byte Ed25519 seed held in a **non-persisted** in-memory holder (`src/libs/pubchi/signing-seed.ts`). The holder is populated only when the App has the secret in hand at sign-in / signup:

| Session type                                                            | Can sign in Phase 0 |
| ----------------------------------------------------------------------- | ------------------- |
| Recovery phrase (`loginWithMnemonic`)                                   | yes                 |
| Recovery file (`loginWithEncryptedFile`)                                | yes                 |
| In-browser signup (`signUp` after `ProfileController.generateSecrets`)  | yes                 |
| Secret-key path that goes through `AuthController.signIn({ keypair })`  | yes                 |
| Pubky Ring / auth-URL (`getAuthUrl` / `initializeAuthenticatedSession`) | no                  |
| Restored persisted session after reload (seed was never persisted)      | no                  |

`secretSeedFromSession` (the hook) reads **only** this holder. It does not read `useOnboardingStore.secretKey`. The onboarding persist partialize is unchanged and is not used for Pubchi.

When the holder is empty the panel shows: "Pubchi signing is unavailable for this session type in Phase 0; sign in with your recovery phrase or key to use it" and disables Ask / Build feed. It does not toast `SIGNATURE_INVALID`.

The seed is cleared in `cleanupLocalState` (logout and failed session restore). A page reload drops it even if the homeserver session is restored.

### Pre-existing: onboarding `secretKey` in Redux DevTools

`useOnboardingStore` still persists `secretKey` and, in development, exposes it through Zustand `devtools`. That is pre-existing and **not** the Pubchi signing source. Do not treat that persisted value as the Phase 0 seed, and do not extend its lifetime to "fix" signing.

## Out of scope

- Hosted bot session, assisted/autonomous tiers, approval queue, bot profile automation rendering
- Re-approve remains only for sessions minted with the narrow `/pub/pubky.app/:rw` set (for example upstream pubky.app SSO). Fresh Ring sign-in on this fork requests `/pub/pubky.app/:rw,/pub/pubchi.app/:rw`. Recovery-phrase `signer.signin()` sessions are root-capable and can write `/pub/pubchi.app/`
- Prompt injection, Scout, or service-side proof gates
- Main franky Dexie version bump (bindings live in a separate `pubchi` IndexedDB)

## VRT

Production components only. Capture wraps `data-surface` / `data-testid` on the production root (`pubchi-panel`, `pubchi-settings`). No catalog chrome.

The panel now has two actions (Ask + Build feed). Existing Chromium-darwin baselines were captured with a single Ask button and **were not regenerated** in the K2 fix wave. Re-run `npm run test:vrt:regenerate-baseline -- src/test/vrt/pubchi` after a real `npm ci` before treating those screenshots as current.

### Negative evidence

`data-testid` on `PubchiPanel` was temporarily set to `pubchi-panel-broken`. The production-surface guard failed:

```
FAIL  |unit| src/components/organisms/Pubchi/PubchiPanel/PubchiPanel.test.tsx > PubchiPanel > mounts the production panel surface
TestingLibraryElementError: Unable to find an element by: [data-testid="pubchi-panel"]
...
      data-surface="pubchi-panel"
      data-testid="pubchi-panel-broken"
```

The marker was restored. The same assertion then passed (103 targeted unit tests green).

A browser VRT run of that broken marker was also attempted (`vitest --project vrt`). With this worktree’s `node_modules` overlay, `vrt.setup.ts` cannot import `@fontsource-variable/inter-tight/*.woff2?url` (`Failed to fetch dynamically imported module: ...woff2?import&url`). Guard failure above is the recorded negative evidence. Chromium-darwin baselines were generated after a temporary in-tree font copy (then reverted so the shared VRT harness is unchanged).

### Baselines

- `src/test/vrt/pubchi/__screenshots__/PubchiPanel.vrt.test.tsx/pubchi-panel-desktop-chromium-darwin.png` — stale vs current UI (needs regeneration: two action buttons).
- `src/test/vrt/pubchi/__screenshots__/PubchiSettings.vrt.test.tsx/pubchi-settings-desktop-chromium-darwin.png` — settings surface: Pubchi title, binding copy, Enroll bot. May need regeneration if the "not enrolled" line is in frame.

Firefox/WebKit/Linux baselines were not generated (unverified).

### Environmental test note

`HelpContent` and `SettingsInfo` snapshot tests have failed in this worktree. Both components are untouched by the Pubchi branch; treat those failures as environmental/pre-existing and do not cite them as Pubchi regressions.
