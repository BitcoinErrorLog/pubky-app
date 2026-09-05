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

**Verdict: FAIL** (live). Honest expected result if the service had been up: empty evidence, because U is a staging user and Scout is production.

Block: Pubchi on `:8790` was down. `GET /healthz` → connection refused. Pid file `14521` was dead. `service.log` last start:

```
{"level":30,"time":1788645753878,"pid":14590,"hostname":"Mac","role":"pubchi","bind":"127.0.0.1","port":8790,"msg":"started"}
```

(`2026-09-05T22:02:33.878Z`.) No crash line after that. An earlier line in the same log is `nohup: setsid: No such file or directory`. Per brief the process was **not** restarted.

No `QueryResultV1` JSON exists in the service log. The Pubchi panel did open on the enrolled session (`data-testid=pubchi-panel`, question “who tagged me?”). After a later cleanup removed `/tmp/pubchi-stage/secrets` and stopped `:3001`, a panel Ask on the still-open tab returned `SIGNATURE_INVALID` (onboarding seed no longer in the store — the documented Ring/no-seed failure mode — and the gateway was already dead). That is not a `QueryResultV1`. Screenshot 2: not taken (no evidence set to show).

T’s `phase0-proof` tag **does** exist on the staging homeserver (item 1). It is **not** expected to surface through production Scout.

Unit citation for asker/scope staying on U when tool output is hostile: `packages/pubchi/src/http.test.ts` `prompt-injection in tool output does not change asker or scope` (lines 131–165). Label: unit-proven, not live.

## Item 4 — “make a two-hop bitcoin feed”

**Verdict: FAIL** (live).

Same service-death block. No `FeedProposalV1`, no Apply click, no unauthenticated feed GET. Screenshot 3: not taken.

Unit citation for a mocked two-hop bitcoin happy path: `packages/pubchi/src/http.test.ts` `/v1/feed` `two-hop bitcoin feed happy path with a mocked brain` (lines 186–204). That is not a live staging Apply.

## Item 5 — process env and egress

### 5a — env NAMES of the live process

**Verdict: unverified.**

`ps eww $(cat /tmp/pubchi-stage/service.pid)` cannot run against a dead pid. Absence of `PUBKY_BOT_SECRET_KEY*` and session vars was **not** observed on a live process in this continuation. Startup is documented to call `assertNoKeyMaterial()` (`docs/pubchi-phase0-service.md`).

### 5b — outbound hosts during items 3/4

**Verdict: unverified.**

`lsof -p <pid> -a -i` was not run against a live Pubchi pid. Distinct remote hosts: **none recorded**.

### 5c — write / proxy greps on existing logs

**Verdict: PASS** (logs as they stood after death; they only contain two `started` lines plus a nohup warning).

```
rg -n "PUT|publish|homeserver_write" /tmp/pubchi-stage/service.log
(none)

rg -n "8790" /tmp/pubchi-stage/app.log
(none)
```

This does **not** prove the process never wrote while it was alive earlier; the log is only 293 bytes.

## Item 6 — brain swap

**Verdict: PASS** (reference only; not re-run).

See `docs/brain-swap-report.md` in the Jeb / brain worktrees. Not repeated here.

## Item 7 — negatives

**Verdict: FAIL** (live against `:8790`). **PASS** as unit-proven in `packages/pubchi/src/http.test.ts`.

Live signed `RequestObjectV1` cases were not sent: the service was down, and the brief forbids restart. Harness-first corrupt-signature `SIGNATURE_INVALID` was therefore also not live-proven.

| Case | Live response | Unit citation |
| --- | --- | --- |
| Harness: corrupt signature | not run | schema/verifier `SIGNATURE_INVALID` (service whitelist in `docs/pubchi-phase0-service.md`) |
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

Pid file `14521` ≠ last logged pid `14590` (likely a wrapper). Nothing listened on 8790. Per brief: not restarted.

## Cleanup

- App `next-server` on :3001 stopped after this note was written.
- `/tmp/pubchi-stage/secrets` removed.
- Pubchi process left as found (already dead). Not restarted.

## Verdict table

| Gate | Verdict |
| --- | --- |
| 1 identities / B operator / T tag | PASS |
| 2 unauthenticated binding GET | PASS |
| 2 screenshot settings enrolled | PASS (`02-settings-enrolled.png`, 1/1 md5) |
| 3 who-tagged-me live QueryResultV1 | FAIL (service dead). Expected empty evidence (staging vs production Scout) |
| 4 two-hop feed Apply | FAIL (service dead) |
| 5a live env NAMES | unverified |
| 5b outbound hosts | unverified |
| 5c log greps | PASS (tiny log; no PUT/8790 lines) |
| 6 brain swap | PASS (reference) |
| 7 live negatives | FAIL |
| 7 unit negatives | PASS (codes above) |

**Overall: FAIL.** Enrollment object is real. Live query/feed/env/negatives were not obtained because Pubchi died and was not restarted.
