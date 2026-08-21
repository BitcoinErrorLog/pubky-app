# Watchlist, Alerts, and Saved Searches

The re-engagement loop: watch items, get told when something about them actually changed, save searches and see what arrived since you last looked. This document states exactly which alerts are server-delivered and which are detected client-side, and where the honest boundary between the two runs.

## The one concept

The watchlist IS the favorites store (`commerce_favorites` — account-scoped, device-local IndexedDB). There is no second bookmark system: the heart on a fixed-price card, the bell on an auction card, the toggle on the listing page, and the `/marketplace/watchlist` page all read and write the same rows. Unwatching deletes the item's observation baseline with it, so an unwatched item can never produce another alert.

## Server-delivered vs. device-detected

Two different kinds of rows reach the notification surfaces, and the UI never lets them impersonate each other:

**Server-delivered** (real outbox rows from the durable Marketplace Transaction Service, read via `GET /v1/notifications`): the service DOES emit an `outbid` notification to the displaced auction leader (verified in its `handlers/auction.rs` — sent to the previous `leader_pubky` when a new bid changes the leader, skipped when the leader outbids themselves), and `auction_won` to the winning bidder on close. These render with an actor ("Rival outbid you in an auction") in the general notification surface and are surfaced prominently at the top of the watchlist page.

**Device-detected** (rows in `commerce_watch_alerts`, produced by checks this device runs): everything else below. These rows have NO actor — nobody sent them — and every surface labels them as such ("Watchlist · checked on this device", "Detected on this device … not server events"). Their read state is honestly clearable precisely because they exist only locally.

## What detection actually observes

There is no background daemon. A bounded detection pass runs when a marketplace surface is visited and when the tab regains focus, spaced at least 60 seconds apart per account, over at most the 24 most recently watched items. Each pass makes two kinds of REAL reads per item:

1. **Index read** — `GET v0/listing/{seller}/{listing}` on the Nexus marketplace index: revision, price, state, auction deadline. (Sandbox mode reads the locally seeded catalog instead; the sandbox never queries Nexus.) Fresh rows are folded into the catalog cache, so the watchlist renders what detection observed.
2. **Projection read** — `GET /v1/listings/{aggregate_id}` on the transaction service: current bid, bid count, leader, sale state. Transactional modes only.

The result of each pass is compared against a persisted per-item baseline (`commerce_watch_snapshots`) — the last state this device actually observed. A failed or impossible read produces no observation and therefore no claim; the baseline stays put.

## The alert types and their exact trigger truth

| Alert        | Fires when                                                                                                                                                                                                                                                                                                                                                         | Never fires when                                                                                          |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| Ending soon  | An observed `ends_at` is within 24h of the check's clock and the listing was observed running. Once per distinct `ends_at` (anti-sniping extensions produce a new deadline and may alert again).                                                                                                                                                                   | The deadline passed, the listing is not running, or this deadline already alerted.                        |
| New bid      | A projection read shows a higher bid count than the baseline this device recorded, and the fresh leader is not the user.                                                                                                                                                                                                                                           | No prior projection baseline exists (first read only records it), or the user's own bid raised the price. |
| Outbid       | Same as new bid, PLUS the baseline recorded the user as auction leader and the fresh read shows someone else leading — participation proven by this device's own reads. Note the service also delivers a real `outbid` notification; the client-side alert covers the case where the user bid from another device or the service notification hasn't been fetched. | The user was never observed leading. The client never infers "outbid" from a price movement alone.        |
| Price change | The index served a newer revision whose price differs from the baseline price.                                                                                                                                                                                                                                                                                     | The revision didn't advance, the price is unchanged, or no baseline exists.                               |
| State change | The observed index state differs from the baseline (`active→ended`, `ended→active` = relisted, `paused`, `removed`), or — when the index didn't move in the same pass — the projection's sale state differs (`available→sold` = sold out).                                                                                                                         | No baseline state exists.                                                                                 |

First visit after watching an item records baselines only — no delta alert can fire without a prior observation, by construction (tested).

Alert ids are deterministic (`owner|listing|kind|dedupeKey`), and persistence skips existing ids, so re-detection can never duplicate an alert or resurrect one the user already saw.

## Saved searches

A saved search (`commerce_saved_searches`) stores a name plus the exact catalog filter state (query, category, sale format, conditions, price range, sort). On marketplace visit/focus (bounded to 10 searches, same 60s spacing), the client refreshes discovery from the Nexus listing stream (one request per distinct server-side filter combo) and re-runs each search with the same client-side filter the catalog page uses. The NEW badge counts matches whose catalog `updated_at` is strictly newer than the search's acknowledged watermark:

- At save time the watermark starts at the newest current match — nothing that already existed can ever count as NEW.
- Checks record counts but never move the watermark; only opening the search (which shows the user the results) acknowledges it.
- Badges computed against a stale cache can lag; they never invent arrivals.

## Known gaps and follow-ups

- **CLOSED — watcher/loser auction close notification**: the service now emits `auction_ended` to every distinct bidder except the winner on close (sold and unsold), sharing the one close event so redelivery dedups by `(event, recipient)`. The client normalizer already handled the kind; the item copy now renders the closing price it carries. Watchers who never bid still have no server event (the service only knows bidders), so the client's `state_change`/ending-soon detection continues to cover pure watchers locally.
- **CLOSED — outbox payload amounts**: service notifications now carry an optional `amount` (money JSON) where ADR-0019 §8 permits — the offer amount on offer notifications, the auction's visible price on `outbid`/`auction_won`/`auction_ended` — because the recipient already reads those figures in role-scoped projections. Older delivered rows have no amount and keep rendering without one; device-detected rows keep their projection-read amounts as before.
- Detection recency is bounded by visits: a price drop is detected the next time the user opens a marketplace surface, not the moment it happens. This is inherent to a local-first app without push, and the UI's "checked/observed … by this device" phrasing states it.
- Watch state does not sync across devices (favorites are device-local today); an alert about a bid placed from another device reports "new bid" rather than "outbid" unless this device observed the user leading. Cross-device sync is decision-gated on a capability the app does not currently hold — see the decision memo below.

## Decision memo: cross-device watch sync

**Status: DECISION REQUIRED — nothing wired.** This memo resolves the "watch state does not sync across devices" gap above by investigation. It concludes that the honest, privacy-preserving mechanism (a private homeserver document) is blocked on a capability grant the app does not request today, so the right move is to decide the grant deliberately rather than ship a half-version. No sync code exists on this branch.

### The privacy question, stated first

A watchlist reveals **purchase intent**, and intent is strategically valuable to the counterparties who could read it. On an auction it enables sniping and demand signaling (a seller who can see who is watching knows exactly whose reserve to test and when interest peaks); on fixed-price items it exposes a buyer's shopping list. eBay treats watchlists as private for precisely this reason. So the acceptable-leakage bar here is not "consistent with the rest of the app" — it is "no third party can enumerate what a given pubky is watching."

This runs against the ecosystem grain. Every existing `pubky.app` record — follows, bookmarks, mutes, `last_read` — lives under `/pub/` and is **public by construction** (`pubky-app-specs` defines only `PUBLIC_PATH = "/pub/"`; `last_read_uri_builder` writes `pubky://<id>/pub/pubky.app/last_read`, and Nexus indexes the whole `/pub/pubky.app/` subtree). A watchlist stored the same way would be world-readable. Obscuring the path (a random or hashed filename under `/pub/`) does not fix this: `/pub/` directories are **listable** by anyone (`publicStorage.list` needs no auth), so an obscured name is discoverable, and even a truly unguessable name is security-through-obscurity that Nexus indexing and directory enumeration defeat. **A public-but-obscured watchlist is not acceptable for a purchase-intent record**, and this memo treats that option as closed.

### What the homeserver and the app's session can actually do (empirical)

Tested against the live staging homeserver (`homeserver.staging.pubky.app`, pkarr relays `pkarr.pubky.app`/`pubky.org`) with throwaway identities via the vendored `@synonymdev/pubky` 0.8 SDK — the exact client the deployed app uses. Results:

| #   | Actor / session                                                                                                         | Operation on `/priv/pubky.app/…`                 | Result                                                                              |
| --- | ----------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------- |
| 1   | Signup/keypair session (`signer.signup`/`signin`) — capabilities `["/:rw"]`                                             | `putJson`, `getJson`, `list`, raw `PUT`/`GET`    | **All succeed** (201 / 200)                                                         |
| 2   | Ring auth-flow session requesting `/pub/pubky.app/:rw` — capabilities `["/pub/pubky.app/:rw"]`                          | `PUT` and `GET` `/priv/…`                        | **403 Forbidden** — "Session does not have write access to path" (and reads denied) |
| 3   | Ring auth-flow session requesting `/pub/pubky.app/:rw,/priv/pubky.app/:rw` — capabilities include `/priv/pubky.app/:rw` | approval, `PUT`, `GET` `/priv/…`                 | **All succeed** (approval accepted, 201 / 200)                                      |
| 4   | A **different pubky**, fresh process, no session                                                                        | `GET`, `list`, `PUT` on another user's `/priv/…` | **401** — "Authentication required to read private storage"                         |

Two findings matter and one is a trap:

- **`/priv/` is genuinely private.** From a separate process holding no session, reads, listings, and writes to another user's `/priv/` path are refused with 401 (row 4). The staging homeserver enforces authentication on `/priv/` for both reads and writes — unlike `/pub/`, whose reads are open and whose directories are listable. This is exactly the confidentiality the intent record needs.
  - _Trap that had to be ruled out:_ an in-process "anonymous" client initially appeared to read and even overwrite `/priv/` (200/201). That was a **process-global cookie jar** in the WASM SDK — separate `Client` instances in one Node process share the owner's session cookie. Re-run from a clean process, the same requests return 401. Privacy is load-bearing here, so this was verified cross-process rather than trusted from the single-process run.
- **The SDK fully expresses `/priv` scopes.** `validateCapabilities("/pub/pubky.app/:rw,/priv/pubky.app/:rw")` normalizes cleanly, the auth flow accepts the string, and the resulting `SessionInfo.capabilities` carries both entries (row 3). There is no SDK-level blocker.
- **The app's Ring session cannot touch `/priv` today.** The app requests exactly `CAPABILITIES = '/pub/pubky.app/:rw'` (`src/core/services/homeserver/homeserver.ts`). A Ring-authenticated session therefore holds only that scope and is refused on `/priv/` (row 2). Only keypair/recovery-phrase sign-in yields root `/:rw` (row 1) and can reach `/priv/`.

### The exact blocker

**Pubky Ring is the flagship sign-in method** (`AuthApplication.generateAuthUrl()` → "Generates an authentication URL for Pubky Ring App"), and it is the whole point of the model: keys stay in the authenticator, the web app receives only the scoped capabilities it asked for. Those users' sessions **cannot read or write `/priv/`** under the current grant. Recovery-phrase users get root and could, but building sync that silently works for recovery-phrase users and no-ops for Ring users would be a **dishonestly-labeled half-version** — the UI would claim "synced privately via your homeserver" for a population where it does not sync at all. Our rules forbid that.

Enabling private sync for all users requires the app to request a broader capability at sign-in:

```
'/pub/pubky.app/:rw,/priv/pubky.app/:rw'
```

That is a **new Ring capability grant**, structurally the same class of change as messaging's `/pub/paykit` scope addition. It is not a code detail; it is a product/trust decision with real costs, which is why this memo stops here instead of flipping the constant.

There is also **no spec convention** for private records: `pubky-app-specs` knows only `/pub/`. A `/priv/pubky.app/marketplace/watchlist.json` document would be a brand-new storage convention, which implies (small) upstream spec work to reserve and shape the path so other clients and Nexus treat it as intentionally non-indexed.

### Options

1. **Add `/priv/pubky.app/:rw` to the Ring grant, then build the private-document sync.**
   - _Benefit:_ true cross-device sync with the privacy the record demands; `/priv` confidentiality is already enforced by the deployed homeserver (verified).
   - _UX / trust cost:_ the authorizer (Pubky Ring) will show users a **new, broader permission** — write access to their private homeserver namespace — at connect time. That is a meaningfully larger ask than "public app data," and it must be justified in the consent copy. **Every already-authorized session must re-authenticate** to gain the scope; until they do, sync is unavailable for them, so the app needs a capability-detection path (`session.info.capabilities`) and honest "sign in again to enable private sync" messaging rather than a silent failure.
   - _Scope cost:_ new spec path convention + the sync engine itself (single last-writer-wins JSON document: favorites/watch marks + saved searches, `updated_at` LWW, tombstone list with pruning, union-merge with local Dexie, debounced write on change, read on sign-in, offline-tolerant) + merge/tombstone unit tests + a live cross-context round-trip test.

2. **Public records under `/pub/` (obscured or not).**
   - _Benefit:_ works with the capability the app already holds; zero grant change.
   - _Privacy cost:_ **unacceptable.** Purchase intent becomes world-readable and directory-enumerable (and Nexus-indexable). Obscuring the filename does not close enumeration. Rejected above; listed only for completeness.

3. **Stay device-local (status quo).**
   - _Benefit:_ zero new capability, zero new attack surface, no consent-copy or re-auth burden. The watchlist and its device-detected alerts already carry honest "on this device" labeling, so nothing is mislabeled.
   - _Cost:_ the watchlist does not follow a user across browsers/devices — the gap this memo exists to resolve stays open.

### Recommendation

**Take Option 1, as a deliberate, separately-scoped change — not folded into this UX branch.** The mechanism is sound and the privacy property is real and already enforced by the homeserver, so the only thing standing between the app and honest cross-device sync is a capability the app chooses not to request yet. That choice should be made explicitly because it widens what the app is trusted to do (private-namespace write access) and forces a re-auth migration — both of which need product sign-off and user-facing consent copy, not a one-line constant flip buried in a feature PR.

Concretely, Option 1 should ship as its own change that: (a) widens `CAPABILITIES` to include `/priv/pubky.app/:rw` with reviewed Ring-consent copy; (b) reserves the `/priv/pubky.app/marketplace/` path in `pubky-app-specs`; (c) gates the sync engine on `session.info.capabilities` actually including the `/priv` scope, showing a truthful "re-authenticate to enable private sync" state otherwise (never a silent no-op); (d) stores one last-writer-wins document merged with Dexie by union with a pruned tombstone list; and (e) proves it with merge/tombstone unit tests plus a live two-context staging round-trip.

Until that decision is taken, the watchlist **stays device-local** (Option 3) and remains honestly labeled as such. **Nothing on this branch wires sync.**
