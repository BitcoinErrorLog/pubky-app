# Single Ring approval for direct Shop sign-in

**Status:** design only (not implemented). Branch `marketplace/single-approval-design`, 2026-09-08. Scope: a buyer who signs in **on Shop** must approve **once** in Pubky Ring, and that one approval must cover both the homeserver cookie session and every marketplace command. No secret, cookie, or key material appears in this document.

This document **replaces the Wave 0 rejection of Option A** in `docs/ecommerce/step-up-approval.md`. Option C remains the correct policy for **bridged** arrivals. Direct Shop sign-in is a different ceremony.

## 1. Requirement and scope

**Requirement (fixed).** A buyer who completes Pubky Ring sign-in on Shop approves once. That approval must grant:

- the homeserver cookie session with Shop's full grant `CAPABILITIES = '/pub/pubky.app/:rw,/pub/paykit/:rw,/priv/pubky.app/:rw'` (`src/config/app.ts:20`);
- a transaction-service opaque bearer obtained from `POST /v1/auth/sessions` (`src/core/services/marketplace/marketplace-session.ts:170–182`).

There is no second QR later for “marketplace commands.”

**In scope:** the user opened Shop, had no usable Shop homeserver session, and approved a Shop-initiated `startAuthFlow`.

**Out of scope (explicitly).** A buyer who arrives **bridged** from pubky.app, carrying a narrow `/pub/pubky.app/:rw` homeserver cookie and having never approved anything for Shop. A Ring prompt there is legitimate: they never consented to Shop's grant or to the marketplace service. See §6.

Signup (invite code) is a different `AuthFlowKind` and is not this ceremony.

## 2. What the transaction service verifies today, and why a second credential exists

The service does **not** see the homeserver cookie. The browser never holds the user's secret key (`docs/ecommerce/service-auth.md`). The only proof the service can verify is a postcard-serialized `AuthToken`.

`POST /v1/auth/sessions` (`marketplace-service/crates/service/src/auth.rs`):

1. Rejects bodies shorter than 75 bytes (`auth.rs:42,89–91`).
2. Delegates structure, Ed25519 signature (signer = token pubky), and the **library** timestamp window to `pubky_common::auth::AuthToken::verify` (`auth.rs:84–92`). The workspace pin is `pubky-common = "=0.11.0"` (`marketplace-service/Cargo.toml:35`; lock `Cargo.lock` package `pubky-common` version `0.11.0`).
3. Enforces a **second**, service-clock window `AUTH_TOKEN_WINDOW_SECONDS` default **120 s** (`config.rs:119`; `auth.rs:95–98,116`).
4. Inserts `(pubky, token_timestamp_micros)` into `auth_token_uses` with `ON CONFLICT DO NOTHING`. Zero rows affected → 401 already used (`auth.rs:154–179`).
5. Mints an opaque 32-byte bearer, stores SHA-256, returns it (`auth.rs:182–219`).

Capabilities are copied into `auth_sessions` and returned to the client (`auth.rs:101,186–195,217`). They are **not** a command ACL. `require_session` resolves `token_hash` → `pubky` and injects `Actor`; the capabilities column is never read (`auth.rs:244–266`).

**Why a second credential exists today.** Shop sign-in already requests the full grant via `HomeserverService.generateAuthUrl()` → `startAuthFlow(CAPABILITIES, AuthFlowKind.signin(), relay)` → `awaitApproval()` (`homeserver.ts:480–492`; controller wrap at `src/core/controllers/auth/auth.ts:380–396`). That consumes the `AuthFlow` and yields a `Session` (cookie). Later, the first commerce action calls `MarketplaceSessionService.beginSessionFlow()` (`marketplace-session.ts:126–136`), which calls `generateAuthTokenFlow()` with the **default empty** capability string (`homeserver.ts:515–518`). That is a second QR. Comment at `homeserver.ts:504–505` states the empty set is intentional: identity proof only, no homeserver access.

That empty-capability flow is what the owner hit on the Orders page after already being signed in.

## 3. Correction to the Wave 0 conclusion

`docs/ecommerce/step-up-approval.md` Option A (lines 12–27, 69) concluded a combined approval was **impossible** because (a) one `AuthFlow` yields either `Session` **or** token bytes, never both, (b) there is no `signinWithAuthToken` on `pubky.d.ts`, and (c) homeserver single-use was unverified and might reject the second presenter.

**What was wrong:** (c) treated “single-use” as a property of the **token bytes**, as if one global ledger existed. Single-use is a property of **each verifier's replay state**.

| Verifier                             | What it runs                                                                                                                 | Replay ledger                                                                                                                                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Homeserver `POST /session`           | `state.verifier.verify(&body)` then cookie (`pubky-homeserver/src/client_server/routes/auth.rs:111–125`; route `app.rs:214`) | In-memory `AuthVerifier` in the **current** `pubky-core` tree: `AuthToken::verify` then insert token id `(pubky, timestamp)` into `seen`; duplicate → `Error::AlreadyUsed` (`pubky-common/src/auth.rs:146–164`) |
| Marketplace `POST /v1/auth/sessions` | `AuthToken::verify` then SQL (`auth.rs:92,154–179`)                                                                          | Postgres `auth_token_uses`. The **pinned** `pubky-common` 0.11.0 crate has **no** `AuthVerifier` (`src/auth/mod.rs` exports `AuthToken, Error` only); library verify is stateless                               |

Those ledgers do not share state. The **same AuthToken bytes** can be accepted by both, each once, inside each window. That is the opposite of the Wave 0 “one operator, one use” assumption. The assumption holds **within** one operator and **fails across** two.

**What was right:** `awaitApproval()` and `awaitToken()` each **consume** the flow (`pubky-sdk/bindings/js/src/actors/auth_flow.rs:121–153`: `take_inner`). `PubkySession::new` is `pub(crate)` (`pubky-sdk/src/actors/session/core.rs:47–51`). There is no `Session.fromAuthToken` on shipped `pubky.d.ts` (`node_modules/@synonymdev/pubky/pubky.d.ts` `Session` at 1094–1140). You cannot call both terminals on one flow. Wave 0 over-read that as “the bytes cannot be presented to the homeserver at all.”

## 4. Proposed ceremony

Direct Shop sign-in (no prior Shop cookie):

```
Shop: flow = startAuthFlow(CAPABILITIES, AuthFlowKind.signin(), relay)
      show flow.authorizationUrl (QR / deeplink)
Ring: ONE approval; displays CAPABILITIES verbatim
Shop: token = await flow.awaitToken()          // consumes the flow
      bytes = token.toBytes()
      1. homeserver session exchange (same bytes)
      2. POST bytes → marketplace /v1/auth/sessions
```

### 4.1 Homeserver session exchange without a `pubky-core` API addition

`awaitApproval()` is exactly `await_token` then `PubkySession::new` (`pubky-sdk/src/actors/auth_flow.rs:141–144` / `auth_subscription.rs:47–49`). `PubkySession::new` POSTs `token.serialize()` to `pubky://{pubkey}/session` after `resolve_pubky` (`session/core.rs:51–64`).

The shipped WASM surface (`@synonymdev/pubky` **0.8.0**, `package.json:64`) already exposes the transport half of that:

- `Client.fetch(url, init)` (`pubky.d.ts:396–410`; implementation `pubky-sdk/bindings/js/src/client/http.rs:25–114`).
- It **rejects** `pubky://` (`http.rs:29–34`). The caller must pass `https://_pubky.${z32}/session`.
- `prepare_request` strips `_pubky.`, PKARR-resolves the host, **rewrites the URL to the homeserver ICANN/testnet domain**, and returns the z32 for the `pubky-host` header (`pubky-sdk/src/client/http_targets/wasm.rs:42–57,116–154`; JS applies the header at `http.rs:46–90`).
- For Pubky hosts, if `credentials` is omitted it defaults to `include` (`http.rs:101–105`).

That is the same host mapping `PubkySession::new` uses (`cross_request` → `prepare_request`). The homeserver router binds `POST /session` to `signin` (`app.rs:214`) and CORS is `CorsLayer::very_permissive()` (`app.rs:228`). `signin` does not require an existing cookie (`auth.rs:111–125`; `/session` is exempt from write ACL at `layers/authz.rs:109–111`).

On WASM, cookies are **browser-managed** (`session/core.rs:83–89`). `Set-Cookie` is host-only for the **transformed** request host (homeserver FQDN), `HttpOnly`, `Path=/`, and `SameSite=None; Secure` when `is_secure(host)` (`routes/auth.rs:139–165`). That is the same cookie origin the rest of the app already uses after `awaitApproval()`. The cookie is **not** set on the Shop origin; Shop never needed that.

**Hydrating a `Session` object.** `Session` has a private constructor (`pubky.d.ts:1095`). `export()` is standard-base64 of public `SessionInfo` bytes — **no secrets** (`session/core.rs:220–226`). `signin` responds with `SessionInfo::serialize()` (`routes/auth.rs:149–155`). Therefore, after a successful `Client.fetch` POST:

1. Read the response body as `Uint8Array`.
2. Standard-base64 encode it (same alphabet as `export()`).
3. `Session.restore(exported, pubky.client)` or `pubky.restoreSession(exported)` (`pubky.d.ts:1119–1120, 831`; `import` revalidates `GET /session` with the cookie, `session/core.rs:237–256`).

Put that `Session` through the existing auth store `init` path so `sessionExport` is persisted (`src/core/stores/auth/auth.actions.ts:7–32`). Do **not** invent a second session type.

This is **not** a reimplementation of AuthToken verification in JS. It is the public fetch + the public restore API, fed with the same body `PubkySession::new` already POSTs.

**Live confirmation still required (does not block the design):** one staging sign-in that logs (without printing token bytes) (a) `Client.fetch` status, (b) `Session.restore` success, (c) a subsequent `session.storage` write under `/pub/pubky.app`. If restore fails, the cookie did not land; then request the minimal `pubky-core` export in §8. Do not guess that failure from this repo.

### 4.2 Marketplace exchange

Unchanged: `MarketplaceSessionService.establishWithAuthToken(bytes)` (`marketplace-session.ts:170–204`). **No service change** is required for acceptance: empty and non-empty capability strings both verify; capabilities are stored, not enforced as ACL (`auth.rs:101,244–266`). After this ceremony the stored string will be Shop's `CAPABILITIES` instead of `""`. That is a disclosure change (the operator already sees the pubky); it is not an ACL change.

### 4.3 Order and partial failure

Present the **same bytes** to both verifiers **sequentially**, homeserver first, marketplace second. Do not start a second `AuthFlow` as an automatic fallback.

| Step 1 (homeserver)               | Step 2 (marketplace)                                             | Client must do                                                                                                                                                                                                                                      |
| --------------------------------- | ---------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Network / 4xx / 5xx before cookie | not started                                                      | Show a single “sign-in failed, scan again” error. Token may still be unused at both. A **new** flow is allowed. Do not leave a half session in the auth store.                                                                                      |
| 2xx cookie + restore succeeded    | 2xx bearer                                                       | Done. One approval. Persist both as today.                                                                                                                                                                                                          |
| 2xx                               | retryable network / 5xx **before** the service records the token | Retry **the same bytes** to `/v1/auth/sessions` only (bounded retries). Do **not** open a second QR. User is signed in to Shop; commerce reconnect can reuse the in-memory bytes until the library/service windows elapse.                          |
| 2xx                               | 401 invalid / outside window                                     | Token is dead for the service. User has a valid homeserver session. Surface marketplace reconnect as a **separate** Ring approval (today's `beginSessionFlow`). Honest: this **is** a second prompt, caused by clock/window failure, not by design. |
| 2xx                               | 401 already used                                                 | Another party (or a double POST) won the SQL insert. Same UX as the row above: marketplace reconnect. Investigate as an incident.                                                                                                                   |
| 2xx                               | 201 on the server, response lost on the client                   | Client has cookie, no bearer. Retry POST of the **same** bytes → 401 already used. Marketplace reconnect (second prompt). Unavoidable with single-use SQL; same class as today's crash-between-INSERT-and-response (`step-up-approval.md` line 26). |
| restore fails after 2xx POST      | not started                                                      | Cookie may be missing (credentials / third-party cookie). Treat as sign-in failure; do **not** POST to marketplace (would spend the token and strand the user with a bearer and no homeserver session).                                             |

**Never** POST an empty-capability token to `/session` to “fix” a restore failure. That would **replace** the wide cookie with a narrow one (`homeserver.ts` / `messaging-contracts.ts` already document cookie clobber).

Marketplace-first is worse: a 201 burns `auth_token_uses` before the cookie exists. If the homeserver call then fails, the user cannot retry marketplace with those bytes, and they are not signed in. Homeserver-first keeps the app usable for non-commerce even when the service is down.

Timeouts: keep `SESSION_FLOW_TIMEOUT_MS` for waiting on Ring; the two POSTs must complete well inside the **120 s** service window and the **180 s** library window (see Task 1). Do not hold bytes across a navigation.

## 5. Threat model

### Self-attack table

| Attack                                                                  | Precondition                                                                                                             | Today (wide `awaitApproval` + empty-caps marketplace token)                                                                                                                                                                                | Proposed (one `CAPABILITIES` token, two POSTs)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | Honest delta                                                                                                                        | Mitigation                                                                                                                                                              |
| ----------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Steal in-flight AuthToken bytes (XSS, extension, log)                   | Attacker reads JS memory during the flow                                                                                 | Empty-caps token mints a **marketplace bearer only**. Homeserver `signin` with empty caps would clobber the wide cookie — still a session, but worthless for `/priv` and `/pub/paykit` writes                                              | Same bytes mint a **wide homeserver cookie** (if POSTed as `signin`) **and** a marketplace bearer. **Worse than today.** Window: service will not accept after **120 s** (`config.rs:119`); library `AuthToken::verify` in the pinned crate rejects beyond **180 s** (`pubky-common-0.11.0/src/auth/auth_token.rs:13–14,148–151`). Homeserver in the current `pubky-core` tree uses **45 s** (`pubky-common/src/auth.rs:18–19,93–97`) — tighter if that is what staging runs. Bound the in-flight exposure by the **strictest verifier you actually POST to**. | Widens blast radius of a stolen token from “marketplace commands” to “homeserver grant including `/priv`”                           | Keep bytes in one async scope; POST immediately; never log body; CSP; do not write bytes to `localStorage`                                                              |
| Replay at marketplace                                                   | Obtained bytes                                                                                                           | Second POST 401 (`auth.rs:175–179`)                                                                                                                                                                                                        | Same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Unchanged                                                                                                                           | SQL `(pubky, timestamp)`                                                                                                                                                |
| Replay at homeserver (same process)                                     | Obtained bytes, `AuthVerifier` still up                                                                                  | Empty-caps token: attacker can still `signin` and **replace** the victim cookie with empty caps if they win the race — bad, but no `/priv`. Unverified in Wave 0; **now verified** in-tree: `AlreadyUsed` (`auth.rs:158–159` current tree) | Attacker who wins `POST /session` first gets the **wide** cookie in **their** browser. Victim's later POST hits `AlreadyUsed`. **Worse** if the attacker can complete the fetch from their origin (CORS is very permissive — `app.rs:228`)                                                                                                                                                                                                                                                                                                                     | Cross-origin `POST /session` with credentials is already how sign-in works; the new damage is the **capability set** on that cookie | Ring shows `CAPABILITIES`; user should not approve a QR they did not start; in-app render of the same string beside the QR (already required for phish-swap in step-up) |
| Homeserver process restart re-accepts a token marketplace already spent | HS `AuthVerifier` is in-memory (`auth.rs:141–144` current tree); restart clears `seen`. Postgres keeps `auth_token_uses` | Empty-caps re-signin after restart: attacker gets a **narrow** cookie                                                                                                                                                                      | Attacker gets a **wide** cookie, still cannot mint a second marketplace bearer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | **Worse** on the homeserver side only; marketplace still unique                                                                     | Operator: treat HS restart as replay-ledger loss (pre-existing). Client cannot fix this. Optional future: durable HS replay (upstream)                                  |
| XSS on Shop origin                                                      | Script on shop origin                                                                                                    | Steals marketplace bearer from `localStorage` (`marketplace-session.ts` persist) and rides the **already-wide** cookie after sign-in                                                                                                       | Same after the single approval: wide cookie + bearer. Before approval, no cookie                                                                                                                                                                                                                                                                                                                                                                                                                                                                               | Unchanged **after** sign-in. Direct sign-in already issued the wide cookie today                                                    | Short bearer TTL (`AUTH_SESSION_TTL_SECONDS` default 86400, `config.rs:120`); 401 clears; CSP; HttpOnly cookie is not JS-readable                                       |
| QR/phish swap                                                           | Attacker replaces displayed QR                                                                                           | Two prompts; second is empty-caps (low persuasion **if** Ring distinguishes empty — still unverified UX)                                                                                                                                   | **One** prompt showing the full grant — over-broad if the QR is swapped, but it is the **same** grant Shop already asked at sign-in                                                                                                                                                                                                                                                                                                                                                                                                                            | Same consent surface as today's first prompt; **removes** the empty-caps second prompt                                              | Render `CAPABILITIES` beside the QR; Ring shows the string verbatim (`app.ts:16–18`)                                                                                    |
| Shop-asserted `pubky` / `Authorization` header without a token          | Malicious client                                                                                                         | Rejected: no trust-me headers (`auth.rs:1–19,224–241`)                                                                                                                                                                                     | Same                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | Unchanged                                                                                                                           | Keep                                                                                                                                                                    |
| Bridged tab after cookie replacement                                    | User also has pubky.app open                                                                                             | N/A for **direct** Shop sign-in (no prior narrow cookie from this ceremony). If they later use the bridge, cookie is per-origin; Shop's cookie does not rewrite pubky.app's                                                                | Unchanged vs today's Shop `awaitApproval`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                      | Unchanged                                                                                                                           | Do not POST empty caps                                                                                                                                                  |
| What the attacker does **not** gain                                     | —                                                                                                                        | Secret key never in the browser                                                                                                                                                                                                            | Secret key never in the browser; marketplace bearer is still not the HS cookie and vice versa                                                                                                                                                                                                                                                                                                                                                                                                                                                                  | Unchanged                                                                                                                           | —                                                                                                                                                                       |

**Where this design is worse than today:** any disclosure of the in-flight token (XSS during the few dozen seconds, extension, careless logging) lets the thief mint a **homeserver session with `/priv` and `/pub/paykit`**, not merely a marketplace actor. That is a genuine widening versus the empty-capability marketplace token. The 120 s service window and 180 s library window (45 s on current-tree HS) are the hard caps; they are not a comfort.

**Where it is better:** one consent moment; no second empty-caps QR that users ignore; no cookie clobber from that second flow if someone ever pointed it at `/session`.

## 6. Bridged arrivals

A bridged buyer has a homeserver cookie minted for pubky.app's grant (`/pub/pubky.app/:rw` only — `step-up-approval.md` Context). They have **not** approved Shop's `CAPABILITIES` and have **not** presented an AuthToken to the marketplace.

One Ring prompt the first time they need commerce (or a gated `/priv` / Paykit feature) is **not** a gap. It is the first Shop-scoped consent. That prompt should request `CAPABILITIES` (widens the **Shop-origin** cookie) **and** reuse those bytes at `/v1/auth/sessions` — the same ceremony as §4, triggered from the commerce path instead of from `/signin`.

Do **not** silently POST the bridged cookie's existence as identity to the marketplace (cookie is HttpOnly and not a service credential — `service-auth.md`). Do **not** skip Ring because they “already signed in” on pubky.app.

Option C in `step-up-approval.md` (empty-caps token at first checkout, defer homeserver widening) remains an alternative **only** if product wants checkout without `/priv`. The owner requirement for **direct** sign-in does not apply that deferral to people who already approved Shop.

## 7. What must not be done

Recorded so they are not proposed again:

1. **Empty-capability token presented at the homeserver.** `generateAuthTokenFlow('')` then `POST /session` would `signin` a session whose capabilities are empty and **replace** the existing cookie (`routes/auth.rs:124–125` always creates a new session cookie). That clobbers the real grant. This is the failure `messaging-contracts.ts` and `app.ts:6–10` already document for split approvals.
2. **Shop-asserted pubky headers** as marketplace auth. The service authenticates `AuthToken` bytes or a hashed bearer (`auth.rs`). Trust-me headers are forbidden.
3. **Exporting the HttpOnly cookie or any key material to the marketplace service.** `Session.export()` is public `SessionInfo` only (`session/core.rs:214–217`). Do not send it as a proof; the service cannot verify a cookie it did not set.
4. **Disabling or bypassing service auth**, sandbox flags, or “skip Ring on localhost.”
5. **Calling `awaitApproval()` and `awaitToken()` on the same `AuthFlow`.** The second throws `ClientStateError` (`auth_flow.rs:215–219`).
6. **Browser `fetch('https://_pubky.<z32>/session')` without `Client.fetch`.** Without WASM `prepare_request`, `_pubky.<z32>` does not resolve (`wasm.rs:47–51`).
7. **Automatic second QR** as the happy-path recovery for a failed marketplace POST while the homeserver session exists — only after the token is actually spent or expired (§4.3).

## 8. Is a `pubky-core` change needed?

**No, not for a first implementation**, given the shipped 0.8.0 WASM surface:

- Transport: `Client.fetch` + `https://_pubky.${z32}/session` + body `token.toBytes()` + credentials include (`pubky.d.ts:410`; `http.rs:25–114`; `wasm.rs:42–57`).
- Handle: `Session.restore` from standard-base64(`SessionInfo` body) (`pubky.d.ts:1119–1120`; `session/core.rs:220–256`).

**If** live staging shows `Session.restore` failing after a 2xx POST (cookie not stored, or body ≠ `SessionInfo` serialize), request this **minimal** upstream export — nothing larger:

- `Session.fromAuthToken(token: AuthToken, client?: Client): Promise<Session>` binding to existing `pub(crate) PubkySession::new` (`session/core.rs:47–72`).

Do not export cookie secrets. Do not add a JS `signinWithBytes` that skips `AuthToken` verification on the homeserver.

### Timestamp windows (Task 1)

| Source                                                 | Window                | Citation                                                                                                                                                             |
| ------------------------------------------------------ | --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pubky-common` **0.11.0** (marketplace pin)            | **180 s** either side | `~/.cargo/registry/.../pubky-common-0.11.0/src/auth/auth_token.rs:13–14` (`180 * 1_000_000` µs)                                                                      |
| Marketplace service (effective accept)                 | **120 s**             | `AUTH_TOKEN_WINDOW_SECONDS` default `config.rs:119`; tighter than 180, so **120 s** is the service bound                                                             |
| Marketplace comment `LIBRARY_TIMESTAMP_WINDOW_SECONDS` | 180 s                 | `auth.rs:44–48` — matches 0.11.0; used for prune retention, not accept                                                                                               |
| Current `pubky-core` tree `pubky-common`               | **45 s**              | `pubky-core/pubky-common/src/auth.rs:18–19` (`45 * 1_000_000`). **Not** what the marketplace crate depends on. Wave 0's “45 vs 180” confusion is this tree vs 0.11.0 |

In-flight theft bound for **marketplace** acceptance: **120 s**. For **homeserver** `AuthToken::verify`: use the HS's crate (45 s in this workspace's HS source; 180 s if HS is on 0.11.0). State the number you measure on the deployed HS in the live experiment; do not assume they match.

## 9. Implementation plan (not executed)

**mp-ux only for the ceremony.** Likely files (do not edit in this change):

- `src/core/services/homeserver/homeserver.ts` — add a helper that takes `AuthToken` bytes + z32, `Client.fetch` POST `/session`, `Session.restore`. Keep `generateAuthUrl` / `awaitApproval` for signup and for explicit re-approval. Stop using empty-caps `generateAuthTokenFlow` on the **direct sign-in** path.
- `src/core/controllers/auth/auth.ts` / `src/core/application/auth/auth.ts` — after `awaitToken()`, run §4.3; `init` the restored `Session` as today.
- `src/core/services/marketplace/marketplace-session.ts` — `establishWithAuthToken` from the **same** bytes; `beginSessionFlow` must not start a second Ring flow when those bytes just succeeded. Bridged / session-expired still calls a flow.
- Tests around `auth.ts` and `marketplace-session.ts`; commerce first-action tests so a **direct** signed-in user does not call `generateAuthTokenFlow`.

**marketplace-service:** no protocol change. Optional later: tests that a `CAPABILITIES`-shaped token still 201s (already implied by `verify` storing any caps). Do not start using capabilities as a command ACL in this wave.

**Test strategy**

- Unit: mock `Client.fetch` 2xx + `Session.restore`; assert one `startAuthFlow(CAPABILITIES)` and one `establishWithAuthToken` with identical bytes; assert `generateAuthTokenFlow` is **not** called.
- Unit: HS 2xx, MP 5xx → retry MP same bytes, no new flow; MP 401 already used → reconnect affordance.
- Unit: bridged restore (narrow caps) → first checkout **does** start a Ring flow (one prompt), still not two.
- Manual / harness: direct Shop sign-in on staging, then open Orders — **zero** second QR. Bridged from pubky.app, then Orders — **exactly one** QR. Negative: after HS 2xx, tamper marketplace body → 401, reconnect appears.

**Rollback.** Feature-flag the dual POST. Flag off → previous behavior: `awaitApproval()` for sign-in + empty-caps `beginSessionFlow` on first commerce. Users who completed the new ceremony already have a wide cookie; they may need one marketplace reconnect (empty-caps token) if the flag drops before their bearer TTL. No data migration. Do not roll back by POSTing empty caps to `/session`.

**Kimi audit:** required before implementation ships (AuthToken handling, cookie restore, dual presenter). This design document is not a substitute.
