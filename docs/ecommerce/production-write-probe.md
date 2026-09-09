# Production write-path probe

`scripts/probe-production-writes.mjs` (npm: `npm run probe:prod-writes`) proves, with the operator's **own Pubky Ring identity**, which write paths the **production** homeserver (`8um71us3fyw6h8wbcxb5ar3rwusy1a6u49956ikzojg3gcwd1dty`, <https://homeserver.pubky.app>) actually allows. It exists because the only prior evidence for path-level write restrictions was a documentary paragraph in the core-team brief — no isolation script survived (see `pubky-marketplace-umbrella/docs/spec-feedback/pubky-core-team-brief.md`, §6 "Homegate write allowlist").

## What it does

1. Starts a pubkyauth flow with `@synonymdev/pubky` (`Pubky.startAuthFlow(caps, AuthFlowKind.signin(), relay)` — the same call shape as `HomeserverService.generateAuthUrl`), prints the `pubkyauth://` URL, and waits for approval in Pubky Ring. No terminal QR is printed: the only QR dependency in `package.json` is `qrcode.react`, a React SVG component library that cannot render to a terminal. Requested capabilities default to `/pub/pubky.app/:rw,/priv/pubky.app/:rw,/pub/paykit/:rw,/pub/locks.app/:rw,/priv/locks.app/:rw` (override with `--caps`; relay with `--relay`, default `https://httprelay.pubky.app/inbox`).
2. For each of these paths it runs **PUT** (small JSON body with a probe id and ISO timestamp), **GET**, **DELETE**, exactly once each (never retried), recording the true HTTP status and up to 200 chars of the response body:
   - `/pub/pubky.app/marketplace/v1/probe/<id>.json`
   - `/priv/pubky.app/marketplace/v1/probe/<id>.json`
   - `/pub/paykit/v0/probe/<id>.json`
   - `/pub/locks.app/probe/<id>.json`
   - `/priv/locks.app/probe/<id>.json`
3. Prints a `path | PUT | GET | DELETE | note` table. The note column distinguishes the two 403s explicitly:
   - `403` body contains `Write to this path is not allowed` → **homeserver write-allowlist** (server-side `allowed_write_paths` quota enforcement, `write_path_layer.rs`; NOT a session problem)
   - `403` body contains `Session does not have write access to path` → **capability denial** (the granted session lacks the scope)

The script exits non-zero if the auth flow fails. It writes nothing to disk and prints no secrets beyond the short-lived pubkyauth URL the operator must scan.

## Running it

```bash
# production (default)
npm run probe:prod-writes

# staging
node scripts/probe-production-writes.mjs \
  --homeserver ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy \
  --homeserver-url https://homeserver.staging.pubky.app \
  --relay https://httprelay.staging.pubky.app/inbox
```

`--homeserver` / `--homeserver-url` are informational: data traffic is routed via pkdns to the identity's actual homeserver, and the script warns after sign-in if that differs from `--homeserver`.

## Durability probe

`--seed-durability` additionally PUTs `/priv/pubky.app/durability-probe/<id>.json` using the same record shape as `src/test/live/priv-durability-probe.live.ts` (`{ probe: 'priv-durability', seededAt, index, nonce }`) and prints the id. `--check-durability <id>` skips the write probes, signs in, GETs that record, and prints found/not found with the HTTP status. The staging vitest durability probe is untouched by this script; this flag exists so the same durability question can be asked against production with a Ring identity.

```bash
node scripts/probe-production-writes.mjs --seed-durability
# … hours/days later:
node scripts/probe-production-writes.mjs --check-durability <id>
```
