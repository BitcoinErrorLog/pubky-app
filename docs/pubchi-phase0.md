# Pubchi Phase 0 (App spike)

Read-only, feature-flagged Pubchi surfaces in Pubky App. No hosted bot session. The service never receives a Pubky session or key.

## Flags

| Env                            | Default | Effect                                                                     |
| ------------------------------ | ------- | -------------------------------------------------------------------------- |
| `PUBKY_RUNTIME_PUBCHI_ENABLED` | `false` | Master switch. Off: no settings item, no panel, no Dexie open, no network. |
| `PUBKY_RUNTIME_PUBCHI_API_URL` | empty   | Chat panel stays hidden until a URL is set, even if the flag is on.        |

Schema: `src/libs/runtime-config/runtime-config.schema.ts`. Getters: `getPubchiEnabled`, `getPubchiApiUrl`. Helpers: `isPubchiEnabled`, `isPubchiPanelEnabled`.

## Surfaces

- Settings: `/settings/pubchi` (`PubchiSettings`, `data-surface="pubchi-settings"`). Paste bot pubky B; write/remove the U → B binding.
- Chat panel: Shadcn `Sheet` (`PubchiPanel`, `data-surface="pubchi-panel"`). Lazy-mounted from the root layout only when the panel is enabled.

## Contracts consumed

Vendored from `@pubky/pubchi-schemas` commit `bbf8a73` into `src/libs/pubchi/schemas/` (not a `file:` dependency — `npm run build` must not require a second checkout). Browser-safe SHA-256 / Ed25519 via Web Crypto.

- `OwnerBindingV1` at `pubky://U/pub/pubchi.app/bots/B.json`
- `RequestObjectV1` (asker = U, 600s TTL, sha256 of canonical ask body, Ed25519 by U)
- `QueryResultV1` evidence cards
- `FeedProposalV1` preview; Apply only after `parseFeedProposalV1` (likes/unsupported reach never show Apply)

Endpoint is selected by purpose. `pubchiEndpointFor(purpose)` in `src/libs/pubchi/flags.ts` is the mapping; the service layer uses it. Do not POST every purpose to `/v1/query`.

| Purpose                                 | Method + path                     | Response                                            |
| --------------------------------------- | --------------------------------- | --------------------------------------------------- |
| `who-tagged-me` (default)               | `POST ${PUBCHI_API_URL}/v1/query` | `QueryResultV1`                                     |
| `build-feed` (question mentions “feed”) | `POST ${PUBCHI_API_URL}/v1/feed`  | `FeedProposalV1`                                    |
| `what-i-missed`, `summarize`            | not served in Phase 0             | App refuses with `PURPOSE_UNSUPPORTED` (no network) |

The service accepts only those two purpose/path pairs. A mismatched pair returns `400 {"error":"PURPOSE_UNSUPPORTED"}`. Responses are parsed by `schema` (`pubchi-query-result` vs `pubchi-feed-proposal`).

## Signing

`RequestObjectV1` is signed with the user’s Ed25519 seed from `Identity.keypairFromSecretKey` → `Keypair.secret()` (the same primitive recovery-phrase sign-in uses). Homeserver binding writes use the existing session via `HomeserverService.request` → `session.storage.putJson`. Ring-only sessions have no seed in the App; those queries fail with `SIGNATURE_INVALID` until Ring signing exists.

## Out of scope

- Hosted bot session, assisted/autonomous tiers, approval queue, bot profile automation rendering
- Changing default Ring capabilities (`/pub/pubky.app/:rw` only). Recovery-phrase `signer.signin()` sessions are root-capable and can write `/pub/pubchi.app/`
- Prompt injection, Scout, or service-side proof gates
- Main franky Dexie version bump (bindings live in a separate `pubchi` IndexedDB)

## VRT

Production components only. Capture wraps `data-surface` / `data-testid` on the production root (`pubchi-panel`, `pubchi-settings`). No catalog chrome.

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

- `src/test/vrt/pubchi/__screenshots__/PubchiPanel.vrt.test.tsx/pubchi-panel-desktop-chromium-darwin.png` — sheet surface: Pubchi title, privacy line, textarea, Ask.
- `src/test/vrt/pubchi/__screenshots__/PubchiSettings.vrt.test.tsx/pubchi-settings-desktop-chromium-darwin.png` — settings surface: Pubchi title, binding copy, Enroll bot.

Firefox/WebKit/Linux baselines were not generated (unverified). Re-run `npm run test:vrt:regenerate-baseline -- src/test/vrt/pubchi` after a real `npm ci`.
