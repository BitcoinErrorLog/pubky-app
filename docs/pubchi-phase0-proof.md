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
