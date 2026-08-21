# Marketplace Social Layer: Official vs. Community Metadata

Status: implemented on `marketplace/pr24-social`. Read [`status.md`](status.md) first for the overall real/simulated map.

## The design decision

Marketplace objects carry two distinct metadata layers, and the product deliberately keeps them separate instead of merging them into one tag cloud:

1. **The official layer — seller-declared attributes.** Category, condition, and keywords live inside the owner-signed listing record (`PubkyAppListing.tags`, `categoryId`, `condition`). Only the seller can write them, they are validated by the specs, and they are what the Nexus marketplace index filters on. In the UI they render under the "Seller's keywords" label on the listing page.

2. **The community layer — social tags.** Anyone on Pubky can tag a listing or a shop, exactly the way tagging works on posts and users today: the tag is a `PubkyAppTag` record written to the _tagger's_ homeserver, whose `uri` field points at the canonical listing/shop URI. The seller cannot edit or delete other people's tags; reputation and discovery signals accrue socially. In the UI these render under the "Community tags" label, with the same tag pills, taggers, and toggle interactions as post tags.

Keeping the layers visually and structurally separate means a buyer always knows whether a claim ("vintage", "trusted", "fast-shipping") is the seller's own marketing or the community's judgement.

## What was built, and what it reuses

- **Spec:** `pubky-app-specs` fork build `0.6.2-marketplace.2` (GitHub release tarball, branch `feat/marketplace-objects-0.6.x` at BitcoinErrorLog). Tag records could already target any valid URI — `.2` adds tests locking that in for listing/shop URIs, and extends Collection `items` validation to accept canonical marketplace listing URIs alongside post URIs.
- **Tag writes** reuse the entire existing tag stack: `TagController.commitCreate/commitDelete` → `TagNormalizer` (now builds listing/shop URIs via the specs' `listingUriBuilder`/`shopUriBuilder`) → `TagApplication` (local-first write with homeserver PUT/DELETE and compensation rollback). Marketplace targets get their own local table (`marketplace_tags`, folded into the unreleased Dexie version 3) via `LocalMarketplaceTagService`, which mirrors the post tag service minus the counts models marketplace targets don't have.
- **Tag reads** come from `useMarketplaceTags`: local cache first (viewer's own write-through renders immediately), then one fetch from the marketplace Nexus tag endpoints, merged with the same viewer-marker policy post tags use.
- **Collections** reuse the exact post flow: the same save picker body (`SavePickerContent`, extracted from `PostSavePicker`), the same `PostController.commitUpdateCollectionItem` (now with an `itemKind: 'listing'` that builds the canonical listing URI), and the same `commitCreateCollection`. The collection page renders listing items in a dedicated section with the catalog's `MarketplaceListingCard`, hydrated through the existing `getOrFetchListing` cache-first path. Bookmarks are deliberately NOT offered for listings — the bookmark flow is post-scoped and offering it would be a fake affordance.

## How reads degrade before Nexus aggregation is deployed

The tag aggregate endpoints (`GET v0/listing/{seller_id}/{listing_id}/tags`, `GET v0/shop/{seller_id}/tags`) are served by the marketplace Nexus (branch `feat/marketplace-indexing` of pubky-nexus) once its tag aggregation lands, and a dedicated marketplace Nexus deployment is in progress separately. Until the deployed instance serves them:

- The endpoints answer **404**, which the client treats as "aggregation not available": it returns an empty aggregate and does NOT touch the local cache.
- The panel then shows exactly what is locally true — the viewer's own tags — and nothing else. No invented counts, no placeholder taggers.
- The moment the endpoints answer, aggregates from other users merge in without a client change.

## Explicitly out of scope (honest follow-ups)

- **Listings in general social feeds / Hot.** Marketplace objects do not appear in post streams or Hot ranking. Giving them feed/graph parity is Nexus-side work beyond tag aggregation.
- **Tag-based notifications.** Tagging a listing/shop notifies nobody today; the notification pipeline only watches post/user tags.
- **Shop-page collections shelf.** A "collections by this seller containing listings" shelf was skipped: there is no indexed read path for that query (the author-collections stream exists, but filtering it to collections containing listings would require client-side hydration of every envelope — a scan, not a read path). The profile's Collections tab already lists a user's collections honestly.
- **Add-by-URL for listings.** The collection page's "paste post url" affordance still accepts post URLs only.
- **Reordering listing items.** The drag-reorder grid renders listing cells and preserves them on save, but the sortable flow was designed for the post stream; listing items keep their envelope position semantics (unordered relative to posts until explicitly dragged).
