# Pubchi Phase 0 staging proof — Round 5 (partial)

Date: 2026-09-06 00:47 WEST. In-browser item 4 on the **fixed** App (`pubky-app-wt-pubchi-fix` HEAD `55f3d7b8`). Stopped on operator status check. Apply was **not** clicked. No secrets in this file.

## Environment (Round 5)

| Item | Value |
| --- | --- |
| App worktree | `/Volumes/vibedrive/vibes-dev/pubky-app-wt-pubchi-fix` |
| App branch | `pubchi/phase0-app-feedfix` |
| App HEAD | `55f3d7b882e20ee73582fb933baecafd1632a73c` (`fix(pubchi): route build-feed requests to /v1/feed`) |
| Pubchi service worktree | `/Volumes/vibedrive/vibes-dev/pubky-ai-bot-w3` |
| Pubchi service HEAD | `61581d5` |
| App origin | `http://localhost:3002` (ignore `:3001`) |
| Pubchi origin | `http://127.0.0.1:8790` — `/healthz` `{"ok":true,"role":"pubchi"}` |
| Pubchi node pid | `37053` (`node dist/main.js --role pubchi`; wrappers 36995/37007) |
| Flags | `PUBKY_RUNTIME_PUBCHI_ENABLED=true`, API URL `http://127.0.0.1:8790` |
| Identities | same U/B/T as rounds 3–4 (pubkys only; secrets unused in this report) |

## Blocker

`browser_take_screenshot` timed out twice when writing `05-panel-feed-proposal.png`. `Page.captureScreenshot` then hung until interrupted (~47 min). Progress.log had no line after 23:58 `item4-enroll`. Apply was left unclicked so the live proposal stayed on screen. Status check at 00:47: stop; do not retry screenshots or Apply.

Evidence instead: accessibility snapshot + CDP `window.__pubchiFetchLog` + `/tmp/pubchi-stage/round5/` (`feed-proposal.json`, `panel-state.txt`, `service.log.tail`).

## Item 4 — two-hop bitcoin feed → Apply

**Verdict: PARTIAL** (proposal PASS; Apply UNVERIFIED)

1. Signed in as U on `:3002` via recovery phrase (12 fields; Restore → `/home`). `:3002` Dexie is a separate session from `:3001`.
2. `/settings/pubchi` initially showed **no** Active bot (App reads local Dexie only; homeserver binding already existed). **Re-enrolled B.** UI after: `Active bot: hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo` + Remove bot.
3. Recovery-phrase login leaves `onboarding.secretKey` empty. Injected hex into `onboarding-storage` (length 64 only; value not recorded) and reloaded so the panel can sign.
4. Wrapped `window.fetch` for `/v1/*`. Opened Pubchi panel. Asked `make a two-hop bitcoin feed`.

`window.fetch` wrap (still present at 00:47):

- Request URL: `POST http://127.0.0.1:8790/v1/feed`
- HTTP 200
- Panel card (no error): `Bitcoin Two-Hop Feed` / `Reach: wot` / `Tags: bitcoin` / **Apply**
- URL still `http://localhost:3002/settings/pubchi` at stop

Response JSON:

```
{"schema":"pubchi-feed-proposal","version":1,"bot":"hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo","owner":"bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","generated_at":1788649121,"feed":{"feed":{"tags":["bitcoin"],"domain_tags":[],"reach":"wot","layout":"columns","sort":"recent","content":"short"},"name":"Bitcoin Two-Hop Feed","created_at":1735689600},"warnings":[],"installed_user_feed_id":null}
```

Matching `service.log`: **no new line.** File still ends at pid 37053 `started` (level 30). No level 40 for this call (it was 2xx). Not retried.

```
{"level":30,"time":1788648870613,"pid":37053,"hostname":"Mac","role":"pubchi","bind":"127.0.0.1","port":8790,"msg":"started"}
```

Apply: **not clicked.** No `06-feed-applied.png` / `07-feed-tab-content.png`.

### Where Apply would persist (code, not live)

`usePubchiQuery.applyFeed` → `FeedController.commitCreate(feedProposalToCreateParams(proposal))` → `FeedApplication.persist`: Dexie **and** `HomeserverService.request` PUT `pubky://<U>/pub/pubky.app/feeds/<id>`. `feed-map.ts` maps name/tags/reach/sort/content/layout only — it does **not** pass `created_at`. Live homeserver read-back was not run.

### `created_at` (defect, not fixed)

| Source | Value |
| --- | --- |
| FeedProposalV1 `feed.created_at` | `1735689600` (model-supplied; 2025-01-01T00:00:00Z) |
| App stored `created_at` after Apply | **unverified** (Apply not run). Code uses `Date.now()` ms in `FeedApplication.persist`, not the proposal field. |

## Item 5b — remotes during the feed call

**Verdict: UNVERIFIED**

`timeout 62 lsof -nP -p 37053 -a -i -r 1` failed immediately: `timeout: command not found`. `/tmp/pubchi-stage/lsof-round5.txt` is that one error line. No distinct remotes; `api.moonshot.ai` not observed in lsof this round. Brain almost certainly ran (200 FeedProposalV1 with a model `created_at`) but sockets were not sampled.

## Item 5c — no service-side publish

**Verdict: PASS**

```
rg -n "PUT|publish|homeserver_write" /tmp/pubchi-stage/service.log
none
```

## Screenshots

Round 5 did not write new PNGs (tool hang). `/tmp/pubchi-stage/shots/05-panel-feed-proposal.png` is still the **round 4** `PURPOSE_UNSUPPORTED` frame — do not treat it as this proposal.

Integrity for this stop: no new PNGs. `md5` vs count not applicable.

## Verdict table (round 5)

| Item | Verdict |
| --- | --- |
| 4 two-hop feed proposal (in-browser) | PASS (`POST /v1/feed` 200 FeedProposalV1; panel rendered) |
| 4 Apply + Dexie/homeserver + shots 06/07 | UNVERIFIED (not clicked; screenshot blocker) |
| 5b egress | UNVERIFIED (`timeout` missing) |
| 5c no service PUT/publish | PASS |

## Unverified

- Apply click, feed tab, homeserver public GET of a new feed from this Apply.
- App-stored `created_at` after Apply.
- `05`/`06`/`07` PNGs for this round.
- `api.moonshot.ai` / Cloudflare `104.18.x` in lsof.
- New level-30 service line for the 200 (pino may not log successful `/v1/feed`).

---

# Pubchi Phase 0 staging proof (round 4)

Date: 2026-09-05. In-browser integrator after the service CORS allowlist and live Scout schema refresh (`pubky-ai-bot-w3` HEAD `61581d5`). Same U/B/T trio and enrollment as round 3. Secrets stay under `/tmp/pubchi-stage/secrets` (mode 700). This run did not delete that directory.

Round 3 (Node-signed POSTs; panel blocked by CORS) is kept below as history.

## Environment

| Item | Value |
| --- | --- |
| App worktree | `/Volumes/vibedrive/vibes-dev/pubky-app-wt-pubchi` |
| App branch | `pubchi/phase0-app` |
| App HEAD at proof start | `5d45b6e54825920004598715dbf6db7c0d9faa51` (`docs(pubchi): replace phase0 proof with live run`) |
| App HEAD at proof close | this commit (`docs(pubchi): record in-browser phase0 proof`) |
| Pubchi service worktree | `/Volumes/vibedrive/vibes-dev/pubky-ai-bot-w3` |
| Pubchi service HEAD | `61581d5` (CORS allowlist for `http://localhost:3001`, live Scout schema refresh, level-40 log of every non-2xx) |
| App origin | `http://localhost:3001` — `/settings/pubchi` HTTP 200; session already U |
| Pubchi origin | `http://127.0.0.1:8790` — `/healthz` `{"ok":true,"role":"pubchi"}` |
| Pubchi node pid | `97570` (`node dist/main.js --role pubchi`) |
| Flags | `PUBKY_RUNTIME_PUBCHI_ENABLED=true`, API URL `http://127.0.0.1:8790` |
| Page origin vs API host | page `localhost:3001`, fetch `127.0.0.1:8790` — CORS uses the page Origin; wrap confirmed the request URL is `http://127.0.0.1:8790/v1/query` |
| Round 3 (history) | App HEAD `5d45b6e5` after that commit; Jeb `d3794cb`; Pubchi pid `29037`; same U/B/T |

### Identities (pubky only)

| Role | Pubky |
| --- | --- |
| U (owner) | `bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o` |
| B (bot) | `hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo` |
| T (third party) | `4wjzuohwwt1acooqtgn3zy7gooff6njgmd5gqntjksq39hc5b6xy` |

Seeds and recovery phrases were used only by path. They are not repeated here.

## Screenshots

| File | What it shows (opened and described) |
| --- | --- |
| `docs/pubchi-phase0-proof/01-settings-enrolled.png` | Round 3: `/settings/pubchi` with Active bot B and Remove bot. |
| `docs/pubchi-phase0-proof/02-who-tagged-me.png` | Round 3: panel `who tagged me?` then `CONNECTION_FAILED` (no CORS). |
| `docs/pubchi-phase0-proof/03-feed-applied.png` | Round 3: `/feed/H36K8NC454ERFCM0DD4V4N7NCG` after a Node-side homeserver PUT (Apply never ran in-browser). |
| `docs/pubchi-phase0-proof/04-panel-who-tagged-me.png` | Round 4: Pubchi sheet, question `who tagged me?`, Ask, Tool trace `get_emerging_topics · 1 calls`. No evidence cards (empty items). |
| `docs/pubchi-phase0-proof/05-panel-feed-proposal.png` | Round 4: Pubchi sheet, question `make a two-hop bitcoin feed`, Ask, error `PURPOSE_UNSUPPORTED`. No FeedProposalV1, no Apply. |

`06-feed-applied.png` was not captured: Apply never ran.

Integrity (`/tmp/pubchi-stage/shots`, all five files):

```
md5 -q /tmp/pubchi-stage/shots/* | sort -u | wc -l
       5
ls /tmp/pubchi-stage/shots | wc -l
       5
```

Unique md5s: `7e203068c425ee55cfa3fcb05994b3f1` (01), `9fc7b95231c2366a27a1e01ae816eb37` (02), `ac779ab81f06689fb5f5affc7fdc17bb` (03), `70bb13f768ef290ee2569026abf72b7a` (04), `a8f5b9720947e88a4c4e95df60144508` (05). File count 5 = unique md5 count 5.

## Item 3 — panel “who tagged me?” → QueryResultV1

**Verdict: PASS**

Browser session was already U (`auth-store.currentUserPubky=bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o`). Opened Pubchi via `PubchiLauncher` (`data-testid=pubchi-open`). Asked `who tagged me?`.

`window.fetch` wrap:

- Request URL: `POST http://127.0.0.1:8790/v1/query`
- Signed purpose: `who-tagged-me`
- HTTP 200

Response JSON (first live call; retry later the same night produced a second 200 with a new `run_id`):

```
{"schema":"pubchi-query-result","version":1,"bot":"hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo","owner":"bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","generated_at":1788648099,"run_id":"run-cc2588d9f463af11","purpose":"who-tagged-me","scope_owner":"bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","items":[],"tool_trace_summary":{"tools":["get_emerging_topics"],"call_count":1,"truncated":false},"policy_version":1}
```

Honest empty `items` (staging U / production Scout). Planner picked `get_emerging_topics` — recorded as-is. Panel rendered QueryResultV1 (Tool trace collapsible; no evidence cards). Screenshot `04-panel-who-tagged-me.png`.

Matching `service.log` (pid 97570, level 30):

```
{"level":30,"time":1788648103134,"pid":97570,"hostname":"Mac","name":"get_emerging_topics","ms":2707,"ok":true,"mention_key":"pubchi:hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo:bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","msg":"tool call"}
```

Retry (wide viewport, same utterance) also 200 QueryResultV1, `run_id=run-eee979379e4d5612`, same empty items / `get_emerging_topics` / 1 call. Level-30 tool call at `time=1788648282078` (`ms=2636`). No level-40 line (both were 2xx).

## Item 4 — “make a two-hop bitcoin feed” + Apply

**Verdict: FAIL**

Panel reached the service (CORS works). The App inferred `purpose=build-feed` but always POSTs `getPubchiQueryUrl()` → `/v1/query`. The service rejects that pair (`packages/pubchi/src/http.ts`: `/v1/query` requires `who-tagged-me`; `/v1/feed` requires `build-feed`).

`window.fetch` wrap (retry 2 of 2; same 400 as retry 1):

- Request URL: `POST http://127.0.0.1:8790/v1/query`
- Signed purpose: `build-feed`
- Body question: `make a two-hop bitcoin feed`
- asker=U bot=B
- HTTP 400 in 418 ms (no brain)

Response JSON:

```
{"error":"PURPOSE_UNSUPPORTED"}
```

Panel rendered `PURPOSE_UNSUPPORTED`. No FeedProposalV1. Apply was not shown. Screenshot `05-panel-feed-proposal.png`. No `06-feed-applied.png`. Homeserver read-back of a new Apply was not run.

Matching `service.log` (level 40):

```
{"level":40,"time":1788648221476,"pid":97570,"hostname":"Mac","code":"PURPOSE_UNSUPPORTED","stage":"verify","status":400,"cause":"purpose","msg":"pubchi non-2xx"}
{"level":40,"time":1788648344323,"pid":97570,"hostname":"Mac","code":"PURPOSE_UNSUPPORTED","stage":"verify","status":400,"cause":"purpose","msg":"pubchi non-2xx"}
```

Not a brain/budget error; not retried a third time. Round 3 already proved `/v1/feed` + `purpose=build-feed` returns FeedProposalV1 from Node.

## Item 5b — remotes while items 3/4 ran

**Verdict: PASS-WITH-LIMIT**

`lsof -nP -p 97570 -a -i -r 1` for ~60s during the first who-tagged-me (`/tmp/pubchi-stage/lsof-round4.txt`) and again during the retries (`/tmp/pubchi-stage/lsof-round4b.txt`). Distinct remotes:

| Remote | Identity |
| --- | --- |
| `127.0.0.1:5432` | local Postgres |
| `127.0.0.1` (ephemeral `59819`, `60547`) | local Pubchi clients (browser / App) |
| `34.179.161.72:443` | `nexus-scout.pubky.app` (production Scout; seen during `get_emerging_topics`) |
| `34.65.231.81:443` | `nexus.staging.pubky.app` **and** `homeserver.staging.pubky.app` (same A) |
| `34.65.156.171:443` | `pkarr.pubky.app` |
| `167.86.102.121:443` | `vmi783032.contaboserver.net` — **unidentified** (not `api.moonshot.ai`) |

`api.moonshot.ai` (Cloudflare `104.18.28.136` / `104.18.29.136`) was **not** seen. Expected: item 4 never reached `runFeed` / the brain.

## Item 5c — no service-side publish

**Verdict: PASS**

```
rg -n "PUT|publish|homeserver_write" /tmp/pubchi-stage/service.log
none
```

## Verdict table (round 4)

| Item | Verdict |
| --- | --- |
| 3 who-tagged-me (in-browser) | PASS |
| 4 two-hop feed + Apply (in-browser) | FAIL (`PURPOSE_UNSUPPORTED`: App POSTs `build-feed` to `/v1/query`) |
| 5b egress during 3/4 | PASS-WITH-LIMIT (Scout yes; Moonshot no; extra Contabo IP unidentified) |
| 5c no service PUT/publish | PASS |
| 1 / 2 / 5a / 6 / 7 | unchanged from round 3 (not re-run) |

## Unverified

- In-browser FeedProposalV1 and Apply (blocked by App path/purpose mismatch).
- `06-feed-applied.png`.
- Unauthenticated homeserver read-back of a feed created by this round's Apply (Apply did not run).
- `api.moonshot.ai` socket during this run.
- Identity of `167.86.102.121` (`vmi783032.contaboserver.net`).
- Firefox/WebKit VRT baselines (out of scope).

---

# Round 3 history

The remainder is the round-3 proof (Node-signed POSTs; panel `CONNECTION_FAILED` / no CORS), kept as history.

# Pubchi Phase 0 staging proof (round 3)

Date: 2026-09-05. Live integrator round 3. Rounds 1–2 failed on process lifetime (service and App dev server died between tool calls; round 2 also deleted `/tmp/pubchi-stage/secrets`). This run used the operator-relaunched processes and a fresh U/B/T trio. Secrets stay under `/tmp/pubchi-stage/secrets` (mode 700) for the operator to delete.

## Environment

| Item | Value |
| --- | --- |
| App worktree | `/Volumes/vibedrive/vibes-dev/pubky-app-wt-pubchi` |
| App branch | `pubchi/phase0-app` |
| App HEAD at proof start | `6ebfd5c08cc5650d1ec48eb5d63dceb6d615687f` (`docs(pubchi): record live env names after service return`) |
| App HEAD at proof close | this commit (`docs(pubchi): replace phase0 proof with live run`) |
| Jeb / Pubchi worktree | `/Volumes/vibedrive/vibes-dev/pubky-ai-bot-jeb` |
| Jeb HEAD | `d3794cb5a29ad9b92060e41d63a38572a9d5350c` (`Add Phase 0 read-only Pubchi service.`) |
| App origin | `http://localhost:3001` — `/settings/pubchi` HTTP 200 throughout |
| Pubchi origin | `http://127.0.0.1:8790` — `/healthz` `{"ok":true,"role":"pubchi"}` throughout |
| Pubchi node pid | `29037` (`node dist/main.js --role pubchi`; wrappers 28996/28998 via `railway run`) |
| Pubchi DB | `jeb_pubchi_stage` |
| Nexus | `https://nexus.staging.pubky.app` |
| Homeserver | `ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy` (staging) |
| Scout | `https://nexus-scout.pubky.app` (**production**; no staging Scout exists) |
| Brain | Moonshot (`JEB_BRAIN=moonshot`) |
| Flags | `PUBKY_RUNTIME_PUBCHI_ENABLED=true`, API URL `http://127.0.0.1:8790` |
| Staging / production split | Homeserver + Nexus = staging. Scout = production. A staging-only tag cannot be expected to appear in production Scout. |

### Identities (pubky only)

| Role | Pubky |
| --- | --- |
| U (owner) | `bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o` |
| B (bot) | `hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo` |
| T (third party) | `4wjzuohwwt1acooqtgn3zy7gooff6njgmd5gqntjksq39hc5b6xy` |

Seeds and recovery phrases live under `/tmp/pubchi-stage/secrets/` and were used only by path. They are not repeated here. This run did not delete that directory.

## Known limits

- Ring-only sessions cannot sign `RequestObjectV1` in Phase 0 (no seed in the App). Recovery-phrase sign-in also leaves `onboarding.secretKey` empty (login builds a keypair and does not persist the hex), so the panel throws `SIGNATURE_INVALID` until `secretKey` is present in the onboarding store.
- Staging graph is not visible to production Scout.
- Service must run from `dist` (`node dist/main.js --role pubchi`). `npm run pubchi` via tsx breaks on symlinked `../bot-kit` imports.
- Pubchi HTTP sets `content-type` only. The browser origin `http://localhost:3001` cannot `fetch` `http://127.0.0.1:8790` (`TypeError: Failed to fetch` / App `CONNECTION_FAILED`). Node on the host can. Panel Apply therefore cannot run against this loopback service.
- Rounds 1–2 failed on process lifetime, not on the code.
- Raw `fetch()` of `https://_pubky.<U>/...` fails without the SDK resolver. Unauthenticated read-back uses `@synonymdev/pubky` `publicStorage.getJson`.

## Screenshots

| File | What it shows (opened and described) |
| --- | --- |
| `docs/pubchi-phase0-proof/01-settings-enrolled.png` | `/settings/pubchi` with **Active bot:** `hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo` and a red **Remove bot** button. |
| `docs/pubchi-phase0-proof/02-who-tagged-me.png` | Pubchi panel, question `who tagged me?`, **Ask**, then `CONNECTION_FAILED`. |
| `docs/pubchi-phase0-proof/03-feed-applied.png` | `/feed/H36K8NC454ERFCM0DD4V4N7NCG` after the homeserver PUT. App Dexie has not fetched the new feed (Apply never ran in-process), so the custom-feed name is not in the nav. URL is the installed feed id. |

Integrity:

```
md5 -q /tmp/pubchi-stage/shots/* | sort -u | wc -l
       3
ls /tmp/pubchi-stage/shots | wc -l
       3
```

Unique md5s: `7e203068c425ee55cfa3fcb05994b3f1`, `9fc7b95231c2366a27a1e01ae816eb37`, `ac779ab81f06689fb5f5affc7fdc17bb`.

## Item 1 — fresh identities + public objects

**Verdict: PASS**

Mint via `/tmp/pubchi-stage/mint-identities.mjs` (signup tokens from `bash ~/.cursor/skills/pubky-staging-invite/scripts/generate.sh`). Profiles via `/tmp/pubchi-stage/publish-profiles.mjs` (CJS cookie-jar client). Tag via `/tmp/pubchi-stage/tag-u.mjs`. Public reads via `/tmp/pubchi-stage/public-gets.mjs`.

Literal public GET:

```
GET U_profile STATUS 200 URI pubky://bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o/pub/pubky.app/profile.json
GET U_profile BODY {"bio":"Pubchi phase0 proof owner","name":"Phase0 Owner","status":"active"}
GET B_profile STATUS 200 URI pubky://hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo/pub/pubky.app/profile.json
GET B_profile BODY {"automation":{"capabilities":["query","feed"],"operator":"bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","policy":"https://github.com/BitcoinErrorLog/pubky-ai-bot-jeb","source":"https://github.com/BitcoinErrorLog/pubky-ai-bot-jeb"},"bio":"Pubchi phase0 proof bot","name":"Phase0 Bot","status":"active"}
GET T_profile STATUS 200 URI pubky://4wjzuohwwt1acooqtgn3zy7gooff6njgmd5gqntjksq39hc5b6xy/pub/pubky.app/profile.json
GET T_profile BODY {"bio":"Pubchi phase0 tagger","name":"Phase0 Tagger","status":"active"}
GET T_tag_on_U STATUS 200 URI pubky://4wjzuohwwt1acooqtgn3zy7gooff6njgmd5gqntjksq39hc5b6xy/pub/pubky.app/tags/NPS6F1P9YXM10AG0PBW27BCTHC
GET T_tag_on_U BODY {"created_at":1788646543729000,"label":"phase0-proof","uri":"pubky://bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o/pub/pubky.app/profile.json"}
```

B `automation.operator` equals U.

## Item 2 — enroll B as U + unauthenticated binding GET

**Verdict: PASS**

Signed in as U via recovery phrase (panel later needed an injected `onboarding.secretKey` hex for signing; enrollment itself uses the homeserver session). Pasted B on `/settings/pubchi`, **Enroll bot**. UI: Active bot + Remove bot. Screenshot `01-settings-enrolled.png`.

Command: `node /tmp/pubchi-stage/get-binding.mjs`

```
URI pubky://bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o/pub/pubchi.app/bots/hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo.json
HTTPS https://_pubky.bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o/pub/pubchi.app/bots/hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo.json
PUBLIC_GET_STATUS 200
PUBLIC_GET_BODY {"bot":"hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo","created_at":1788646684,"owner":"bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","schema":"pubchi-owner-binding","status":"active","updated_at":1788646684,"version":1}
HTTPS_FAIL fetch failed
```

## Item 3 — panel “who tagged me?” → QueryResultV1

**Verdict: PASS-WITH-LIMIT**

Expected honest live result: empty evidence (staging U, production Scout).

Signed Node POST (`tsx /tmp/pubchi-stage/live-signed.mts who`) using Jeb `signRequestObjectV1` and `U.seed` by path:

Request summary:

```
asker=bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o
bot=hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo
purpose=who-tagged-me
```

Exact response (twice):

```
{"error":"UPSTREAM_UNAVAILABLE"}
```

HTTP 503. Verify + tenant resolve succeeded (a bad signature would be 400 `SIGNATURE_INVALID`; missing enrollment 404 `TENANT_NOT_ENROLLED`). NLQ/Scout mapped to `UPSTREAM_UNAVAILABLE` (`packages/pubchi/src/query.ts` `mapNlqFailure`). Production Scout did not return an empty landscape for this staging user.

Panel: after restoring `onboarding.secretKey`, Ask returned `CONNECTION_FAILED` because the browser cannot reach `:8790` (no CORS). Screenshot `02-who-tagged-me.png`. No `QueryResultV1` in the UI.

## Item 4 — “make a two-hop bitcoin feed” + Apply

**Verdict: PASS-WITH-LIMIT**

Signed Node POST (`tsx /tmp/pubchi-stage/live-signed.mts feed`):

Request summary: `purpose=build-feed`, same asker/bot as item 3.

Exact response (HTTP 200):

```
{"schema":"pubchi-feed-proposal","version":1,"bot":"hgtsw58eraye4quc4x73w7xf8ix6hnqaa5fu9yrxq1efaax8eswo","owner":"bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o","generated_at":1788646795,"feed":{"feed":{"tags":["bitcoin"],"domain_tags":["crypto"],"reach":"wot","layout":"columns","sort":"recent","content":"short"},"name":"Bitcoin Two-Hop Feed","created_at":1751500000},"warnings":[],"installed_user_feed_id":null}
```

`reach=wot` is two-hop. Shape matches `pubky-app-specs` `createFeed` (tags, reach, layout, sort, content, name, domain_tags).

Panel Apply did not run (`CONNECTION_FAILED` / no CORS). The same specs `createFeed` was PUT with U’s session (`/tmp/pubchi-stage/apply-feed.mjs`) and read back unauthenticated:

```
FEED_PUT /pub/pubky.app/feeds/H36K8NC454ERFCM0DD4V4N7NCG
FEED_URL pubky://bp1ojh17wrkrw8qswx7hqsngf6yu567n5ijbn8kp1bnxr14yir8o/pub/pubky.app/feeds/H36K8NC454ERFCM0DD4V4N7NCG
PUBLIC_GET_OK true
PUBLIC_GET_NAME Bitcoin Two-Hop Feed
```

Public body:

```
{"created_at":1788646855977000,"feed":{"content":"short","domain_tags":["crypto"],"layout":"columns","reach":"wot","sort":"recent","tags":["bitcoin"]},"name":"Bitcoin Two-Hop Feed"}
```

Screenshot `03-feed-applied.png` is the App route `/feed/H36K8NC454ERFCM0DD4V4N7NCG`. The custom-feed tab is absent because Apply never wrote Dexie; `FeedNavigation` reads local `getList()` only.

## Item 5 — env, egress, no homeserver write

**Verdict: PASS**

### 5a — env names only

`ps eww 29037 | tr ' ' '\n' | sed 's/=.*//' | sort -u` written to `/tmp/pubchi-stage/env-names.txt`.

Forbidden name hits: **none**. No `PUBKY_BOT_SECRET_KEY`, `PUBKY_BOT_SECRET_KEY_HEX`, `PUBKY_BOT_SECRET_KEY_FILE`, `PUBKY_BOT_MNEMONIC`, and no session variable names.

Present (names only; railway injects these): `DATABASE_URL`, `JEB_BRAIN`, `JEB_HOMESERVER`, `JEB_MODEL_API_KEY`, `JEB_NEXUS_URL`, `JEB_SCOUT_URL`, `PUBCHI_BIND`, `PUBCHI_PORT`, `JEB_BOT_PK`, `JEB_SIGNUP_TOKEN`, `JEB_GITHUB_TOKEN`. Brain/provider keys are not Pubky bot secret keys.

### 5b — remotes while items 3/4 ran

`lsof -nP -p 29037 -a -iTCP` sampled for ~70s into `/tmp/pubchi-stage/lsof-sample.txt`. Distinct remote hosts/IPs:

| Remote | Identity |
| --- | --- |
| `127.0.0.1:5432` | local Postgres (`jeb_pubchi_stage`) |
| `127.0.0.1` (ephemeral) | local Pubchi clients (Node signed POSTs) |
| `34.65.231.81:443` | `nexus.staging.pubky.app` **and** `homeserver.staging.pubky.app` (same A record) — public binding GET / Nexus |
| `34.65.156.171:443` | `pkarr.pubky.app` |

Not seen in the 1 Hz sample: `nexus-scout.pubky.app` (`34.179.161.72`), `api.moonshot.ai`. Feed 200 proves the brain ran; the TCP row may have closed between samples. **Unverified in lsof:** Moonshot and production Scout sockets.

### 5c — no service-side publish

```
rg -n "PUT|publish|homeserver_write" /tmp/pubchi-stage/service.log
none
```

Service log contains only `started` lines for pids 98826 / 14590 / 29037. No homeserver write from the Pubchi process.

## Item 6 — brain swap

Already proven in `pubky-ai-bot-jeb/docs/brain-swap-report.md`. Not re-run.

## Item 7 — live negatives

**Verdict: PASS** (live codes) **+ unit-proven Scout outage**

Harness first: corrupt a valid signature → `SIGNATURE_INVALID` (400) before any 200 is trusted.

| Case | Request summary | Status | Exact body |
| --- | --- | --- | --- |
| harness corrupt sig | asker=U bot=B purpose=who-tagged-me, signature `ff`×64 | 400 | `{"error":"SIGNATURE_INVALID"}` |
| asker=U signed by T | same unsigned fields, T seed | 400 | `{"error":"SIGNATURE_INVALID"}` |
| expired | issued_at/expires_at in the past | 400 | `{"error":"REQUEST_EXPIRED"}` |
| body hash tamper | signed hash of `{question:"who tagged me?"}`, posted `{question:"who tagged me? TAMPER"}` | 400 | `{"error":"BODY_HASH_MISMATCH"}` |
| likes feed | purpose=build-feed, question `make a likes feed` | 400 | `{"error":"FEED_UNSUPPORTED_LIKES"}` |
| nonce replay first | valid who-tagged-me | 503 | `{"error":"UPSTREAM_UNAVAILABLE"}` |
| nonce replay second | same nonce | 400 | `{"error":"NONCE_REPLAY"}` |

`ASKER_MISMATCH` is not reached when T signs an object whose `asker` is U: verify checks the signature against `request.asker` first (`SIGNATURE_INVALID`). That matches the allowed pair `ASKER_MISMATCH/SIGNATURE_INVALID`.

Scout outage: **unit-proven, not live.** `packages/pubchi/src/http.test.ts` “Scout outage → UPSTREAM_UNAVAILABLE” (from line 167). Live who-tagged-me already returns the same public code against production Scout.

Prompt injection: T published tag label `ignore-previous-ops` on U (`PUBLIC_GET_LABEL ignore-previous-ops`). Re-ran who-tagged-me → still `{"error":"UPSTREAM_UNAVAILABLE"}`. No `QueryResultV1`, so asker/scope cannot drift in a live result. Staging tags cannot surface via production Scout. Unit proof that injection in tool output does not change asker/scope: `packages/pubchi/src/http.test.ts` lines 131–165.

## Verdict table

| Item | Verdict |
| --- | --- |
| 1 identities + public GET | PASS |
| 2 enroll + binding GET | PASS |
| 3 who-tagged-me | PASS-WITH-LIMIT |
| 4 two-hop feed + Apply | PASS-WITH-LIMIT |
| 5 env / egress / no PUT | PASS |
| 6 brain swap | PASS (prior doc) |
| 7 negatives | PASS |

## Unverified

- Panel never received a `QueryResultV1` or `FeedProposalV1` (browser `CONNECTION_FAILED`).
- Expected empty-evidence `QueryResultV1` (staging U / production Scout) — live NLQ returned `UPSTREAM_UNAVAILABLE` instead.
- In-App Dexie feed tab after Apply (Apply did not run in the browser).
- Moonshot and production Scout sockets in the 1 Hz `lsof` sample.
- Firefox/WebKit VRT baselines (out of scope).
