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

- **Service gap — no watcher/loser auction close notification**: the service emits `auction_won` only to the winner and `outbid` only to the displaced leader. Losing bidders and watchers get no server event when an auction ends; the client's `state_change`/ending-soon detection covers this locally. A service-side `auction_ended` emission to auction participants would close this gap (the client normalizer already handles the kind for the sandbox).
- **Service gap — uniform outbox payload**: service notifications carry only `{type, actor, aggregate}` — no bid amount. Amount context on bid alerts is therefore only available on device-detected rows, where the projection read supplied it.
- Detection recency is bounded by visits: a price drop is detected the next time the user opens a marketplace surface, not the moment it happens. This is inherent to a local-first app without push, and the UI's "checked/observed … by this device" phrasing states it.
- Watch state does not sync across devices (favorites are device-local today); an alert about a bid placed from another device reports "new bid" rather than "outbid" unless this device observed the user leading.
