# Shop Production Kill Switch And Rollback Runbook

Operational scope: Shop production client on Vercel project `pubky-marketplace-production`, with staging client on
`pubky-marketplace-staging`. Run Vercel commands from `/Users/johncarvalho/work/mp-prod-deploy` for production and
`/Users/johncarvalho/work/mp-ux` for staging. Use
`/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel`.

Do not paste secret values from Vercel or Railway output into tickets, docs, logs, or chat. Vercel team scope is
`synonymdev` (`team_y2cqjCWZ9vTnCPWQkUAgfijD`).

## What The Kill Switch Does

Set `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable` on the production Vercel project.

The exact env var name is declared in `src/libs/runtime-config/runtime-config.schema.ts:562`. Its allowed values are
declared in `src/libs/runtime-config/runtime-config.schema.ts:59`: `unavailable`, `sandbox`, `transaction-service`, and
`locks-paykit`. `unavailable` is documented as browse-only with no transactional commands at
`src/libs/runtime-config/runtime-config.schema.ts:47` and is the default at
`src/libs/runtime-config/runtime-config.schema.ts:234`.

This is a runtime config value, not a Next.js build-time inline. The server reads non-inlined `PUBKY_RUNTIME_*` env at
request time and serializes the resolved object into HTML (`src/libs/runtime-config/runtime-config.ts:13-17`,
`src/libs/runtime-config/runtime-config.ts:147-150`). The browser then reads `window.__PUBKY_CONFIG__` and
`getCommerceAdapterMode()` returns the injected value (`src/libs/runtime-config/runtime-config.ts:96-117`,
`src/libs/runtime-config/runtime-config.ts:208`). The injection happens before the app bundle executes in
`src/components/molecules/ContainerRoot/ContainerRoot.tsx:27-37`.

Vercel env changes still require a new deployment to affect the running site. Treat the env flip and redeploy as one
operation.

## Flip Production To Unavailable

```bash
cd /Users/johncarvalho/work/mp-prod-deploy
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel env ls production --scope synonymdev
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel env update PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE production --value unavailable --yes --scope synonymdev
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel deploy --prod --yes --scope synonymdev
```

If the variable is missing instead of present:

```bash
cd /Users/johncarvalho/work/mp-prod-deploy
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel env add PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE production --value unavailable --yes --scope synonymdev
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel deploy --prod --yes --scope synonymdev
```

## Restore Production Transactions

The current production transaction mode is `locks-paykit`.

```bash
cd /Users/johncarvalho/work/mp-prod-deploy
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel env update PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE production --value locks-paykit --yes --scope synonymdev
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel deploy --prod --yes --scope synonymdev
```

## Move The Shop Domain Between Vercel Projects

Moving `shop.pubky.app` between Vercel projects is **not** a reassignment. The `pubky.app` DNS zone is external
(Namecheap), and its apex belongs to a different Vercel account; Shop is held by TXT proof. Each time Vercel attaches
the domain to a project, it mints a new `_vercel` TXT verification token. Detaching the domain from the current project
invalidates the token currently published in DNS.

There is no way to obtain the destination token in advance. Attaching the domain to a second project while the first
still holds it fails with `domain_already_in_use`, so the token only exists after the detach. **The move therefore
always takes the hostname offline**, from the moment of detach until the new TXT record propagates. Plan for that
window rather than trying to eliminate it:

1. Lower the TTL on `_vercel.pubky.app` well in advance (the observed TTL is 1800s).
2. Have the DNS owner at the keyboard before you start; the outage lasts exactly as long as they take to publish.
3. Detach from the current project, immediately attach to the destination, and read the minted token from the attach
   response (`verification[].value`).
4. Publish that exact token, confirm with `dig +short TXT _vercel.pubky.app` against both a public resolver and the
   authoritative nameservers, then call the verify endpoint and pin the alias.

Do not re-run the attach while waiting. Every attach and detach mints a fresh token and invalidates the record the DNS
owner just published. On 2026-09-08 that mistake turned a planned move into a two-hour outage.

Rolling back has the same cost as going forward: reattaching to the prior project mints its own new token and needs its
own DNS publish. Once you have detached, the fastest route back to a working hostname is usually to finish the move,
not to reverse it. Meanwhile the project's own `*.vercel.app` alias keeps serving, so Shop stays reachable there.

## Vercel Rollback Or Promote

Use `promote` when the target known-good deployment id or URL is known. Use `rollback` when reverting away from a known
bad deployment id or URL. The commands below use the inspected deployment ids from the 2026-09-06 deploy record.

Runtime config is serialized into each deployment at build time, so `promote` re-points the alias to that deployment's
env snapshot in about 5 seconds with no build (measured in the 2026-09-06 drill). That makes `promote` the instant
**restore** path. It is only an instant **kill** path if an `unavailable` deployment already exists to promote; otherwise
the env flip plus redeploy above takes about 3 minutes. The kill deployment from the drill is
`pubky-marketplace-production-doas1qo0r-synonymdev.vercel.app` (`unavailable`, HEAD `f036a76d`); it goes stale as soon
as the client changes, so after each production deploy either re-create an `unavailable` deployment or accept the
3-minute kill latency.

```bash
cd /Users/johncarvalho/work/mp-prod-deploy
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel promote EAqqVuQq1BkstYJwwciMS3C981tv --yes --scope synonymdev
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel rollback EAqqVuQq1BkstYJwwciMS3C981tv --yes --scope synonymdev
```

For staging:

```bash
cd /Users/johncarvalho/work/mp-ux
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel promote 3tPXUhr9Zb5voJqjYRuuGfyz6fZP --yes --scope synonymdev
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel rollback 3tPXUhr9Zb5voJqjYRuuGfyz6fZP --yes --scope synonymdev
```

## Verify The Kill Switch

Check the resolved runtime config and the rendered UI:

```bash
curl -fsS https://pubky-marketplace-production.vercel.app/marketplace | grep -o 'commerceAdapterMode[^,]*'
curl -fsS https://pubky-marketplace-production.vercel.app/marketplace/listings/<sellerPubky>/<listingId> | grep -o 'commerceAdapterMode[^,]*'
```

Expected user-visible behavior:

- Marketplace catalog shows: `Marketplace transactions are unavailable in this deployment. Public browsing remains
read-only.` (`src/components/templates/Marketplace/Marketplace.tsx:247-250`).
- Listing purchase controls are disabled and the page shows: `Transactions are disabled in this deployment.`
  (`src/components/templates/Marketplace/MarketplaceListing.tsx:417-460`).
- The marketplace nav entry is hidden when the adapter is `unavailable`
  (`src/components/molecules/Header/Header.tsx:103-104`,
  `src/components/molecules/MobileFooter/MobileFooter.tsx:77-78`).

## Railway Service Restart And Rollback

Production Railway project id: `75faa4fe-466c-4277-977f-1d8e4e31df8c`
(`pubky-marketplace-production`).

The Railway CLI has `restart`, `redeploy`, `deployment list`, and `down`; it does not have a `rollback` subcommand. For a
fast process restart without rebuilding:

```bash
railway restart --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service --yes
railway restart --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd --yes
```

To redeploy the latest successful deployment:

```bash
railway redeploy --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service --yes
railway redeploy --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd --yes
```

To roll back to an earlier build, list deployments, then use the Railway dashboard (service → Deployments → the
known-good deployment → `Rollback`). The CLI cannot target an older deployment: `railway redeploy` only re-runs the
latest one, and `railway down` removes the latest deployment and leaves the service with nothing running — it does not
fall back to the previous deployment, so never use it as a rollback.

```bash
railway deployment list --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service --limit 10
railway deployment list --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd --limit 10
```

CLI-only alternative when the dashboard is unavailable: check out the known-good commit on the service's deploy
branch, push it to the BitcoinErrorLog fork, then
`railway redeploy --from-source --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service <service> --yes`.

Read-only checks that do not expose values if the output is not pasted:

```bash
railway status --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production
railway variables --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service
railway variables --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd
```

## Drill Log

| Date                       | Operator                            | Action                                                                                                        | Vercel deployment before                                                                    | Vercel deployment after                                                                                              | Railway action | Verification                                                                                                                                      | Notes                                                                                                                                                                                 |
| -------------------------- | ----------------------------------- | ------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 2026-09-06 12:22–12:29 UTC | drill agent (Grok), parent-verified | env flip to `unavailable` + deploy; env restore to `locks-paykit` + deploy; `promote` of pre-drill deployment | `pubky-marketplace-production-43s5ujo0d` (`dpl_EAqqVuQq1BkstYJwwciMS3C981tv`, locks-paykit) | kill `…-doas1qo0r` (unavailable); restore `…-7i2qjho1y` (locks-paykit); alias finally promoted back to `…-43s5ujo0d` | none           | HTML `commerceAdapterMode` read `unavailable` after kill and `locks-paykit` after restore and after promote; parent re-checked alias at 12:29 UTC | kill latency 3m06s; env-restore latency 2m54s; promote 5s, no build. Banner text is client-rendered so `grep -c` on HTML returns 0; verify via `commerceAdapterMode` or in a browser. |
