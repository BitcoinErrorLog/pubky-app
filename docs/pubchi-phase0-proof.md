# Pubchi Phase 0 staging proof

Date: 2026-09-05. Integrator continuation after a stalled agent. This note records what was **verified** against live staging objects and what was **blocked** when the Pubchi process died. Nothing below is invented evidence.

## Environment

| Item | Value |
| --- | --- |
| App worktree | `/Volumes/vibedrive/vibes-dev/pubky-app-wt-pubchi` |
| App branch | `pubchi/phase0-app` |
| App HEAD at proof close | `dec7671d` (`docs(pubchi): add phase0 staging proof`); this revision adds the settings screenshot the first draft missed |
| Jeb / Pubchi worktree | `/Volumes/vibedrive/vibes-dev/pubky-ai-bot-jeb` |
| Jeb HEAD | `d3794cb5a29ad9b92060e41d63a38572a9d5350c` |
| App origin | http://127.0.0.1:3001 (`next-server` pid 13205; stale `/tmp/pubchi-stage/app.pid` was 12379) |
| Pubchi origin | http://127.0.0.1:8790 — **dead** when this integrator attached |
| Pubchi DB (claimed by operator) | `jeb_pubchi_stage` |
| Nexus | `https://nexus.staging.pubky.app` |
| Homeserver | `ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy` (staging) |
| Scout | `https://nexus-scout.pubky.app` (**production**; no staging Scout exists) |
| Brain (claimed by operator) | Moonshot |
| Staging / production split | Homeserver + Nexus = staging. Scout = production. A staging-only tag cannot be expected to appear in production Scout. |

### Identities (pubky only)

| Role | Pubky |
| --- | --- |
| U (owner) | `h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy` |
| B (bot) | `bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y` |
| T (third party) | `brwot51ddhbeawmwf99smbzu3771xwno78gmi9s4p8je7s3g9nyo` |

Seeds and recovery phrases lived under `/tmp/pubchi-stage/secrets/` (mode 700) and were used only by path. They are not repeated here. Cleanup removed that directory.

## Known limits (pre-existing)

- Ring-only sessions cannot sign `RequestObjectV1` in Phase 0 (no seed in the App).
- Staging graph is not visible to production Scout.
- Service must run from `dist` (`node dist/main.js --role pubchi`). `npm run pubchi` via tsx breaks on symlinked `../bot-kit` imports.
- Previous agent used the homeserver HTTP form without the SDK `https://_pubky.<pk>/…` resolver and got nginx 404 / `Can't extract PubkyHost`. That is the wrong URL shape.

## Item 1 — staging identities

**Verdict: PASS** (prior wave; re-verified by public reads only).

U, B, and T exist on the staging homeserver. B's `profile.json` has `automation.operator = U`. T's tag on U (`label=phase0-proof`) is publicly readable.

```
TAG_PUBLIC_GET_STATUS 200
TAG_PUBLIC_GET_LABEL phase0-proof
TAG_PUBLIC_GET_URI pubky://h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy/pub/pubky.app/profile.json
B_PROFILE_STATUS 200
B_PROFILE_NAME Phase0 Bot
B_OPERATOR_SET true
B_OPERATOR_EQ_U true
```

Command: Node script using the App worktree `createRequire` + `@synonymdev/pubky` `publicStorage.getJson`, same package resolution as `/tmp/pubchi-stage/publish-profiles.mjs`.

## Item 2 — enrollment via unauthenticated GET

**Verdict: PASS** (object + UI). Screenshot: `02-settings-enrolled.png`.

URI:

```
pubky://h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy/pub/pubchi.app/bots/bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y.json
```

SDK-resolved HTTPS form (for the record; raw `fetch()` of this host fails without the Pubky client resolver):

```
https://_pubky.h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy/pub/pubchi.app/bots/bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y.json
```

Command: `node /tmp/pubchi-stage/get-binding.mjs`

Literal output:

```
URI pubky://h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy/pub/pubchi.app/bots/bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y.json
HTTPS https://_pubky.h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy/pub/pubchi.app/bots/bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y.json
PUBLIC_GET_STATUS 200
PUBLIC_GET_BODY {"bot":"bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y","created_at":1788635688,"owner":"h4cesxnf1jkc89xd7yng8xsctupezq1btwspksxbibdsn68utucy","schema":"pubchi-owner-binding","status":"active","updated_at":1788635688,"version":1}
HTTPS_FAIL fetch failed
```

The App-written binding is live and `status: active`. The previous unauthenticated GET failed because it hit the homeserver HTTP form without `Pubky-Host` (`Can't extract PubkyHost` / nginx 404). SDK `publicStorage.getJson` is the correct read.

UI (this integrator, `http://localhost:3001`, webpack because Turbopack rejects the `node_modules` overlay symlink): signed in as U with the recovery-phrase dialog (12 fields filled; phrase not recorded here). Enrolled B on `/settings/pubchi`. Surface then showed `Active bot: bkybxuzsxf7p7q3u8p7y441zobh4s6qh8m1yenwmixxpjdefwg5y` and **Remove bot**.

A later continuation agent reported a spinner-only attach and empty `shots/`. That was a second browser session after webpack compile; it does not erase the enrollment object or the capture below.

Screenshot: `/tmp/pubchi-stage/shots/02-settings-enrolled.png` (CDP `Page.captureScreenshot`; `browser_take_screenshot` timed out). Shows the Pubchi settings card with the active B pubky and Remove bot. md5 `1c367d42222da1395b50aa21c78c46a8`.

Ring was not used. Substitution: BIP39 recovery-phrase identities + `signer.signup` / App restore. Design: “no Ring code is required for the first proof.” Ring-only sessions still cannot sign Phase 0 requests (no seed in the App).

## Item 3 — “who tagged me?”

**Verdict: FAIL** (live). Honest expected result if a signed query had reached NLQ: empty evidence, because U is a staging user and Scout is production.

First window: Pubchi on `:8790` was down. `GET /healthz` → connection refused. Pid file `14521` was dead. `service.log` starts:

```
{"level":30,"time":1788645753878,"pid":14590,"hostname":"Mac","role":"pubchi","bind":"127.0.0.1","port":8790,"msg":"started"}
```

(`2026-09-05T22:02:33.878Z`.) No crash line after that. An earlier line in the same log is `nohup: setsid: No such file or directory`. Per brief the process was **not** restarted.

No `QueryResultV1` JSON exists in the service log. The Pubchi panel opened on the enrolled session (`data-testid=pubchi-panel`, question “who tagged me?”). After `/tmp/pubchi-stage/secrets` was deleted, `localStorage` `onboarding-storage` had `hasSecret=false`. Two panel Asks (service down, then after the operator brought `:8790` back as pid `29037`) both returned **`SIGNATURE_INVALID`** before any `POST /v1/query` — same failure as a Ring session with no seed. No `QueryResultV1`. Screenshot 2: not taken (no evidence set).

T’s `phase0-proof` tag **does** exist on the staging homeserver (item 1). It is **not** expected to surface through production Scout.

Unit citation for asker/scope staying on U when tool output is hostile: `packages/pubchi/src/http.test.ts` `prompt-injection in tool output does not change asker or scope` (lines 131–165). Label: unit-proven, not live.

## Item 4 — “make a two-hop bitcoin feed”

**Verdict: FAIL** (live).

No signed `build-feed` request was sent (no seed). No `FeedProposalV1`, no Apply, no feed GET. Screenshot 3: not taken.

App always POSTs to `/v1/query` (`getPubchiQueryUrl`). A live “make a two-hop bitcoin feed” from the panel would have been `PURPOSE_UNSUPPORTED` even with a valid signature, because `/v1/query` accepts only `who-tagged-me`. That App/service path split is unverified live (no signed request).

Unit citation for a mocked two-hop bitcoin happy path: `packages/pubchi/src/http.test.ts` `/v1/feed` `two-hop bitcoin feed happy path with a mocked brain` (lines 186–204). That is not a live staging Apply.

## Item 5 — process env and egress

### 5a — env NAMES of the live process

**Verdict: PASS** on pid `29037` (`node dist/main.js --role pubchi`, cwd Jeb worktree). Operator brought this process back via `railway run` (not this integrator). `tcpdump` without sudo: `ioctl(SIOCIFCREATE): Operation not permitted` — used `ps eww` / `lsof` instead.

```
ps eww 29037 | tr ' ' '\n' | sed 's/=.*//' | sort -u
```

No `PUBKY_BOT_SECRET_KEY*`, no `PUBKY_BOT_MNEMONIC`, no session-named vars. Wrapper explicitly `-u PUBKY_BOT_SECRET_KEY_HEX -u PUBKY_BOT_SECRET_KEY -u PUBKY_BOT_SECRET_KEY_FILE`. Present JEB/PUBCHI names (values not printed): `DATABASE_URL`, `JEB_*` (including `JEB_MODEL_API_KEY`, `JEB_SIGNUP_TOKEN`, `JEB_BOT_PK`), `PUBCHI_BIND`, `PUBCHI_PORT`.

### 5b — outbound hosts during items 3/4

**Verdict: PASS-WITH-LIMIT** (sampled; query never left the App).

`lsof -p 29037 -a -iTCP -nP -r 1` for ~40s during the second Ask: **0 remote TCP peers**. Expected: Ask failed with `SIGNATURE_INVALID` in the browser before `fetch`. Distinct destination hosts: **none**.

### 5c — write / proxy greps

**Verdict: PASS** (log is only `started` lines).

`service.log` has three `started` records (pids 98826, 14590, 29037) plus `nohup: setsid: No such file or directory`. No PUT/publish/homeserver-write event. App webpack log contains the `PUBKY_RUNTIME_PUBCHI_API_URL=http://127.0.0.1:8790` command line only — no `POST /v1/query` or `/v1/feed` access lines.

## Item 6 — brain swap

**Verdict: PASS** (reference only; not re-run).

See `docs/brain-swap-report.md` in the Jeb / brain worktrees. Not repeated here.

## Item 7 — negatives

**Verdict: FAIL** (live against `:8790`). **PASS** as unit-proven in `packages/pubchi/src/http.test.ts`.

Live signed `RequestObjectV1` cases were not sent (seeds deleted; App store had no secret). The panel Ask is a **client** `SIGNATURE_INVALID`, not a gateway JSON `{ "error": "SIGNATURE_INVALID" }`. Harness-first corrupt-signature against `:8790` was not run.

| Case | Live response | Unit citation |
| --- | --- | --- |
| Harness: corrupt signature | not run (no seed). Panel Ask → client `SIGNATURE_INVALID` | schema/verifier `SIGNATURE_INVALID` |
| Fake asker (T signs, asker=U) | not run | `http.test.ts` 55–79 → `ASKER_MISMATCH` |
| Expired | not run | same table → `REQUEST_EXPIRED` |
| Changed body hash | not run | same table → `BODY_HASH_MISMATCH` |
| Unsupported likes feed | not run | `http.test.ts` 206–225 → `FEED_UNSUPPORTED_LIKES` |
| Nonce replay | not run | `http.test.ts` 81–104 → `NONCE_REPLAY` |
| Scout outage | not live | `http.test.ts` 167–182 → `UPSTREAM_UNAVAILABLE` — **unit-proven, not live** |
| Prompt injection (T tag label) | not live | tag exists on staging homeserver; production Scout will not list it. Unit: `http.test.ts` 131–165 (asker/scope stay on owner) |

## Screenshots

```
ls /tmp/pubchi-stage/shots
02-settings-enrolled.png

ls /tmp/pubchi-stage/shots | wc -l
       1
md5 -q /tmp/pubchi-stage/shots/* | sort -u | wc -l
       1
md5 -q /tmp/pubchi-stage/shots/02-settings-enrolled.png
1c367d42222da1395b50aa21c78c46a8
```

Unique md5 count vs file count: **1 / 1**. File is under `/tmp/pubchi-stage/shots/` (not copied into git). Sign-in dialog was never screenshotted (would have shown the recovery phrase).

## Service death (hard block)

Operator note at 23:05 claimed `/healthz → {"ok":true,"role":"pubchi"}`. This integrator’s first check (seconds later) got connection refused. Full `service.log`:

```
{"level":30,"time":1788635125967,"pid":98826,"hostname":"Mac","role":"pubchi","bind":"127.0.0.1","port":8790,"msg":"started"}
nohup: setsid: No such file or directory
{"level":30,"time":1788645753878,"pid":14590,"hostname":"Mac","role":"pubchi","bind":"127.0.0.1","port":8790,"msg":"started"}
```

Pid file `14521` ≠ last logged pid `14590` (wrapper). This integrator did **not** restart Pubchi. Later the operator started pid `29037` (`railway run … node dist/main.js --role pubchi`); `GET /healthz` then returned `{"ok":true,"role":"pubchi"}`. Third log line:

```
{"level":30,"time":1788646157666,"pid":29037,"hostname":"Mac","role":"pubchi","bind":"127.0.0.1","port":8790,"msg":"started"}
```

## Cleanup

- App webpack `:3001` stopped after this revision.
- `/tmp/pubchi-stage/secrets` already removed (cannot reprint).
- Pubchi pid `29037` left running.

## Verdict table

| Gate | Verdict |
| --- | --- |
| 1 identities / B operator / T tag | PASS |
| 2 unauthenticated binding GET | PASS |
| 2 screenshot settings enrolled | PASS (`02-settings-enrolled.png`, 1/1 md5) |
| 3 who-tagged-me live QueryResultV1 | FAIL (client `SIGNATURE_INVALID`; no POST). Expected empty Scout evidence |
| 4 two-hop feed Apply | FAIL (no seed; App also only POSTs `/v1/query`) |
| 5a live env NAMES | PASS (pid 29037; no `PUBKY_BOT_SECRET_KEY*`) |
| 5b outbound hosts | PASS-WITH-LIMIT (lsof: none; query never sent) |
| 5c log greps | PASS (started-only log; no PUT / no `/v1/*`) |
| 6 brain swap | PASS (reference) |
| 7 live negatives | FAIL |
| 7 unit negatives | PASS (codes above) |

**Overall: FAIL.** Enrollment object is real. Live query/feed/env/negatives were not obtained because Pubchi died and was not restarted.
