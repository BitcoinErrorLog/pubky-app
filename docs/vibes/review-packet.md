# Weekly Vibes Review Packet

Reusable packet for reviewing Shop as a Vibes experiment. Fill with repository or plan evidence only; write `not measured` where no server-side fact exists.

## Template

### Week Ending YYYY-MM-DD

**Live URLs**

- Public app:
- Production service:
- Production marketplace Nexus:
- Staging app:
- Staging service:
- Staging marketplace Nexus:

**What users did (server-side facts only)**

- Sign-ins:
- Listings/shops/drops:
- Checkouts/payments:
- Messages:
- Watchlist/private storage:
- Reviews/receipts:

**What broke**

- Incident:
- Detection source:
- Fix or current state:
- User impact:

**What it taught**

- Product boundary:
- Infrastructure boundary:
- Trust/security boundary:
- Documentation boundary:

**Recommended Next State Per Experiment**

- Catalog/index:
- Selling/listings:
- Checkout/orders:
- Payments:
- Drops:
- Reviews/receipts:
- Watchlist:
- Messaging:
- Shared sign-in:
- Step-up approval:

**Open Decisions**

- Decision:
- Owner:
- Blocking evidence:

## Week Ending 2026-09-06

**Live URLs**

- Public production alias: `https://pubky-marketplace-production.vercel.app` on Vercel project
  `pubky-marketplace-production`, deployment `EAqqVuQq1BkstYJwwciMS3C981tv`.
- Production app target after cutover: `https://shop.pubky.app`; currently attached to Vercel staging project
  `pubky-marketplace-staging`, deployment `3tPXUhr9Zb5voJqjYRuuGfyz6fZP`.
- Production marketplace service: `https://marketplace-service-production-ce23.up.railway.app`.
- Production marketplace Nexus: `https://nexusd-production-95a0.up.railway.app`.
- Existing deployed staging app: `https://shop.pubky.app` before cutover.
- Payment rails are reused from `pubky-marketplace-staging`; money rails stay testnet/regtest. Wave 6 client
  (`6554dd1f..420856c1`) was deployed 2026-09-06 17:52 to `pubky-marketplace-production.vercel.app`,
  `shop.pubky.app`, and `shop-rehearsal.pubky.app`; all three remain `locks-paykit`.
- Bridge rehearsal: `bridge.pubky.app` for Vercel project `pubky-app-bridge-rehearsal` and
  `shop-rehearsal.pubky.app` for Vercel project `shop-bridge-rehearsal`; both are attached but pending
  `_vercel.pubky.app` TXT verification.

**What users did (server-side facts only)**

- Production sign-ins: owner production Ring sign-in happened on 2026-09-05. Count of other sign-ins: not measured.
- Listings/shops/drops: the owner published a production listing; by 2026-09-06 03:24Z the first production listing already appeared in `/v0/stream/listings`. Shop count, listing count, and drop count: not measured.
- Checkouts/payments: no production checkout fact is recorded. Planned proof rows include testnet BTC and Stripe/PayPal test purchases.
- Messages: no production message fact is recorded. Planned proof rows include production messaging handshake and message.
- Watchlist/private storage: production `/priv` durability probe must be reseeded; no production result is recorded. Staging had passed T+1h and T+25h in the plan.
- Reviews/receipts: no production review or receipt fact is recorded. Existing proof is staging/testnet, not production.
- Buyer UX: Orders entry shipped for signed-in users; Ring approval prompts moved off the listing view until checkout,
  Place a bid, or Make offer requires approval. Add to cart and watchlist writes are local and need no approval.
- Wave 6 UX remediation (2026-09-06): nine slices U1–U9 shipped on `marketplace/pr25-ux` `6554dd1f..420856c1`. Review
  evidence is two Opus surface reviews of 65 VRT baselines plus 68 live screenshots, a capability inventory, and five
  review claims dismissed after verification. U1/U6/U8 were Kimi-audited (U1 r3 SHIP). Sprint 3 (sectioned listing
  studio, delivery auto-complete timer plus return/refund surfacing, guest-indexable catalog, multi-seller cart
  grouping) is in progress, not shipped. Return-path after sign-in (`6554dd1f`), kill-switch drill, and per-stack
  Paykit signing keys were recorded earlier today.

**What broke**

- Production client env initially set `PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE=unavailable`; it was corrected to `locks-paykit` and redeployed on 2026-09-05.
- Upstream shared sign-in remained blocked by PR review state in the plan narrative, though the local plan todos later record #2483/#2484 P1s as fixed at PR heads and awaiting upstream re-review. Same-site bridge rehearsal is deployed, but the rehearsal domains still need `_vercel.pubky.app` TXT records because the apex belongs to another Vercel team.
- The VRT ledger remained 143/144 because Messaging firefox-mobile had a load-order flake that passed standalone.
- Shippo labels remained unproven against Shippo's live API.
- The fiat-verifier return-origin shape was inconsistent in the plan: the todos say per-request `return_origin` is being implemented, while Wave 1 text still describes the single-valued redirect as a staging limitation unless support exists.

**What it taught**

- Product boundary: Shop is peer-to-peer. Disputes, reports, operator moderation, and tax do not belong in the trade authority.
- Infrastructure boundary: production is a separate homeserver stack beside staging, not a flip of the staging project.
- Indexing boundary: full replay is necessary because tail-start would strand marketplace records whose users were not yet indexed.
- Trust/security boundary: shared sign-in can reuse public session metadata only; commerce AuthTokens, private storage, messaging, and Paykit/Locks claims still need explicit approval paths.
- Documentation boundary: shipped claims need the ledger labels and dates, not inferred completion from feature presence.
  Wave 6 named and kept honesty labels, dual-truth drops, device-local watchlist, privacy-by-design addresses,
  direct-pay copy, and attestation review tiers.

**Recommended Next State Per Experiment**

- Catalog/index: harden. Production replay was near completion and the first listing appeared, but post-cutover proof rows still need recording.
- Checkout/orders: harden. Wave 6 three-step checkout, order tabs (`To ship` / `In transit` / `Completed` / `All`,
  `You bought` / `You sold`, `Needs attention`), and packing-slip paste field shipped; production checkout proof is pending.
- Payments: graduate for testnet BTC, Stripe test-mode, and PayPal sandbox proofs; Wave 6 `How you get paid` pills are
  truthful (PayPal `Email saved`, never Connected). Harden before real PayPal or any mainnet money.
- Drops: graduate D1 FCFS on staging proof; Wave 6 Draft/Scheduled/Live/Ended status shipped; keep raffles/gated drops archived until designed.
- Selling/listings: harden. Wave 6 seller identity, `ShopProfileCard`, `/marketplace/shop`, Duplicate listing, and
  `Seller studio` namespace shipped; Sprint 3 sectioned listing studio is not shipped. Production shop/drop/media publish still need proof.
- Reviews/receipts: graduate portable receipts and review attestations for the proven stack; harden production receipt publication and attestor-publisher follow-ups.
- Watchlist: harden. Staging cross-device proof exists; production durability cadence is still open.
- Messaging: keep vibing. E2EE works at experiment grade, but live Ring approval and independent security review remain open.
- Shared sign-in: harden. Consumer mode is merged, and same-site rehearsal exists; live use depends on pubky.app bridge deployment, TXT verification, and cutover.
- Step-up approval: harden. Option C is implemented; Wave 6 checkout asks `Approve in Pubky Ring` up front when there
  is no marketplace session. Empty-capabilities Ring display and production step-up proof remain open.

**Open Decisions**

- Mainnet money: not now. The plan says money rails stay on testnet at production launch and mainnet is a later gated decision.
- PayPal real purchase: still open. The plan lists a real non-sandbox PayPal purchase as a standing thread.
- Shippo live API proof: still open. Needs a seller with a real Shippo test token.
- Production `/priv` durability: still open. Needs T+1h, T+1d, and T+7d production cadence.
- Messaging backup key: still open. The ledger says the multi-device backup-key decision is unmade.
- Upstream bridge deployment, rehearsal TXT verification, and `shop.pubky.app` cutover: still open.
- Igor's $8.76 overpayment: user call.

## Sources

- `docs/ecommerce/status.md`
- `docs/ecommerce/FEATURES.md`
- `docs/adr/0019-marketplace-transaction-authority.md`
- `docs/adr/0020-marketplace-public-records.md`
- `docs/adr/0024-portable-reputation.md`
- `docs/adr/0026-marketplace-drops.md`
- `docs/adr/0028-indexer-contract.md`
- `docs/adr/0029-vibe-session-consumer.md`
- `/Users/johncarvalho/.cursor/plans/vibes-first_marketplace_master_plan_d8646c7a.plan.md`
