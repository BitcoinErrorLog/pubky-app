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
/Users/johncarvalho/.nvm/versions/node/v22.14.0/bin/vercel env list production --scope synonymdev
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

## Vercel Rollback Or Promote

Use `promote` when the target known-good deployment id or URL is known. Use `rollback` when reverting away from a known
bad deployment id or URL. The commands below use the inspected deployment ids from the 2026-09-06 deploy record.

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
curl -fsS https://pubky-marketplace-production.vercel.app/marketplace | rg 'commerceAdapterMode":"unavailable|Marketplace transactions are unavailable'
curl -fsS https://pubky-marketplace-production.vercel.app/marketplace/listings/<sellerPubky>/<listingId> | rg 'Transactions are disabled in this deployment|commerceAdapterMode":"unavailable'
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

To inspect recent deployments and remove the most recent deployment so Railway falls back to the previous one:

```bash
railway deployment list --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service --limit 10
railway down --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service --yes
railway deployment list --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd --limit 10
railway down --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd --yes
```

Read-only checks that do not expose values if the output is not pasted:

```bash
railway status --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production
railway variables --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service marketplace-service
railway variables --project 75faa4fe-466c-4277-977f-1d8e4e31df8c --environment production --service nexusd
```

## Drill Log

| Date          | Operator                          | Action        | Vercel deployment before | Vercel deployment after | Railway action | Verification  | Notes                                                           |
| ------------- | --------------------------------- | ------------- | ------------------------ | ----------------------- | -------------- | ------------- | --------------------------------------------------------------- |
| Pending drill | Parent to fill after actual drill | Pending drill | Pending drill            | Pending drill           | Pending drill  | Pending drill | This row is intentionally unfilled until the live drill is run. |
