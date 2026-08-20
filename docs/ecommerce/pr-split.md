# Marketplace PR Split

Delivery sequence for landing the marketplace work as reviewable, independently revertible slices. Source branch: `marketplace/main` (rebased from the prototype branch). Each slice targets < ~2.5k reviewable lines, passes the standing gates before review, and gets a Bugbot review before push.

| # | Slice | Contents | Depends on | Status |
| --- | --- | --- | --- | --- |
| PR-1 | Docs + ADRs | `docs/ecommerce/*`, ADRs 0019–0023 (0019/0020 amended with current-state notes), `.gitignore` hygiene | — | branch ready |
| PR-2 | Config, routes, Dexie | `routes.ts` marketplace routes, `config/commerce.ts`, runtime-config additions (adapter mode default `unavailable`), `franky.ts` `commerce_*` tables, DB version 2→3 (ADR 0023), `.env.example` + CI workflow version updates, release note | PR-1 | pending |
| PR-3 | Specs consumption + core layers | commerce models, pipes rebuilt on published `pubky-app-specs` builders, local + homeserver services, `CommerceApplication`, `CommerceController`, commerce store; orphaned `register` sync-job enqueue removed | PR-2, specs release | pending |
| PR-4 | Catalog UI | Marketplace template, filters, listing cards, listing detail, shop page, skeletons; VRT baselines (all states) regenerated post-rebase; nav gated on adapter mode | PR-3 | pending |
| PR-5 | Sell / listing studio | Listing form, variants, media picker, draft autosave, publish to homeserver; VRT for studio states | PR-3 | pending |
| PR-6 | Favorites + shop follows | Local-first favorites/follows; VRT | PR-4 | pending |
| PR-7 | Service client + sandbox (dev-only) | Marketplace gateway service, sandbox adapter quarantined behind dev settings, sandbox catalog seed as dev action | PR-3 | pending |
| PR-8 | Real service integration | Client wiring to the Rust Marketplace Transaction Service (ADR 0022): real auth, unified state-machine contract validation, transactional UI (offers, bids, cart, checkout, orders, dashboard, moderation) + VRT | PR-7, Rust service | pending |
| PR-9 | Payments | Locks JS/WASM SDK vendoring, seller setup, buyer proof-bundle flow, truthful status UI, `locks-paykit` adapter mode; VRT for payment states | PR-8, Locks/Paykit env | pending |

Parallel tracks outside this repo:

- `pubky-app-specs`: marketplace object specs (shop, listing, review) — prerequisite for PR-3.
- Rust Marketplace Transaction Service (new repo) — prerequisite for PR-8.
- `pubky-nexus`: marketplace record indexing — prerequisite for public-discovery launch, not for PRs 1–9.

Rules: no slice ships stubs or dead code; nav baselines for existing surfaces stay byte-identical until launch; every UI slice carries its own VRT baselines in the same PR.
