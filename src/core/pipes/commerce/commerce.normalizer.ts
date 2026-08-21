import { listingUriBuilder, marketplaceReviewUriBuilder, shopUriBuilder } from 'pubky-app-specs';
import { z } from 'zod';
import {
  type CommerceCollectionRecord,
  commerceCollectionRecordSchema,
  type CommerceListingRecord,
  commerceListingRecordSchema,
  type CommerceReviewRecord,
  commerceReviewRecordSchema,
  type CommerceShopRecord,
  commerceShopRecordSchema,
  type CommerceTombstoneRecord,
  commerceTombstoneRecordSchema,
  locksPublicUriSchema,
} from '@/libs/commerce/marketplace-records';
import { type MarketplaceCommand, marketplaceCommandSchema } from '@/libs/commerce/transaction-commands';
import type { CommerceJsonValue, CommerceMoney } from '@/libs/commerce/transaction-contracts';
import {
  commerceAggregateIdSchema,
  commerceEntityIdSchema,
  commercePubkySchema,
  commerceTimestampSchema,
} from '@/libs/commerce/transaction-contracts';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { CommerceCatalogAuctionTerms, CommerceCatalogEntryModelSchema } from '@/models/commerce/commerce.schema';
import type { NexusListingDetails } from '@/services/nexus/marketplace/marketplace.types';

const MARKETPLACE_BASE_PATH = '/pub/pubky.app/marketplace/v1';

const NEXUS_AUCTION_TERM_FIELDS = [
  'auction_starts_at',
  'auction_ends_at',
  'auction_reserve_price_minor',
  'auction_buy_now_price_minor',
  'auction_minimum_increment_minor',
] as const;

/**
 * Wire schema for one Nexus listing projection (`NexusListingDetails`).
 *
 * This intentionally does NOT reuse `commerceListingRecordSchema`: the Nexus
 * projection is lossy (bare `media_urls` without per-media metadata, no
 * variants, shipping options, or return policy), so it can never reconstruct
 * a `CommerceListingRecord` without fabricating fields. Identity fields reuse the shared record
 * schemas; the remaining fields are validated for type agreement with the
 * real Nexus response shape. Unknown extra keys are tolerated so additive
 * Nexus changes do not break discovery.
 *
 * The `auction_*` term fields must all be present as keys (a payload missing
 * them is not the Nexus marketplace shape), but null values are legal in two
 * states Nexus actually serves: fixed-price listings (always all null) and
 * auction listings indexed before Nexus carried auction terms (all null
 * until re-indexed). Any other partial combination is rejected — in
 * particular an auction claiming terms without an end time.
 */
const nexusListingDetailsSchema: z.ZodType<NexusListingDetails> = z
  .object({
    id: commerceEntityIdSchema,
    uri: z.string(),
    owner_id: commercePubkySchema,
    indexed_at: z.number().int(),
    state: z.enum(['active', 'paused', 'ended', 'removed']),
    title: z.string(),
    description: z.string(),
    category_id: z.string(),
    condition: z.enum(['new', 'like_new', 'excellent', 'good', 'fair', 'for_parts']),
    tags: z.array(z.string()),
    country_code: z.string(),
    region: z.string().nullable(),
    media_urls: z.array(z.string()),
    sale_format: z.enum(['fixed_price', 'auction']),
    price_amount_minor: z.number().int(),
    price_currency: z.string(),
    price_exponent: z.number().int(),
    auction_starts_at: commerceTimestampSchema.nullable(),
    auction_ends_at: commerceTimestampSchema.nullable(),
    auction_reserve_price_minor: z.number().int().positive().nullable(),
    auction_buy_now_price_minor: z.number().int().positive().nullable(),
    auction_minimum_increment_minor: z.number().int().positive().nullable(),
    fulfillment_methods: z.array(z.enum(['physical', 'digital', 'pickup'])),
    adult_only: z.boolean(),
    created_at: commerceTimestampSchema,
    updated_at: commerceTimestampSchema,
    revision: z.number().int().positive(),
  })
  .superRefine((listing, context) => {
    if (listing.sale_format === 'fixed_price') {
      for (const field of NEXUS_AUCTION_TERM_FIELDS) {
        if (listing[field] !== null) {
          context.addIssue({
            code: 'custom',
            message: 'Fixed-price listings must not carry auction terms',
            path: [field],
          });
        }
      }
      return;
    }

    const hasCompleteTerms =
      listing.auction_starts_at !== null &&
      listing.auction_ends_at !== null &&
      listing.auction_minimum_increment_minor !== null;
    const hasNoTerms = NEXUS_AUCTION_TERM_FIELDS.every((field) => listing[field] === null);
    if (!hasCompleteTerms && !hasNoTerms) {
      context.addIssue({
        code: 'custom',
        message:
          'Auction terms must be complete (start, end, minimum increment) or entirely null for rows indexed before Nexus carried them',
        path: ['auction_ends_at'],
      });
    }
  });

const nexusListingStreamSchema = z.array(nexusListingDetailsSchema);

export class CommerceRecordNormalizer {
  private constructor() {}

  static shop(input: unknown): CommerceShopRecord {
    return this.parse(commerceShopRecordSchema, input, 'shop');
  }

  static listing(input: unknown): CommerceListingRecord {
    return this.parse(commerceListingRecordSchema, input, 'listing');
  }

  static review(input: unknown): CommerceReviewRecord {
    return this.parse(commerceReviewRecordSchema, input, 'review');
  }

  static collection(input: unknown): CommerceCollectionRecord {
    return this.parse(commerceCollectionRecordSchema, input, 'collection');
  }

  static tombstone(input: unknown): CommerceTombstoneRecord {
    return this.parse(commerceTombstoneRecordSchema, input, 'tombstone');
  }

  static pubky(input: unknown): string {
    return this.parse(commercePubkySchema, input, 'pubky');
  }

  static entityId(input: unknown): string {
    return this.parse(commerceEntityIdSchema, input, 'entityId');
  }

  static listingCompositeId(input: unknown): string {
    if (typeof input !== 'string') {
      return this.parse(commerceEntityIdSchema, input, 'listingCompositeId');
    }
    const separator = input.indexOf(':');
    const owner = this.pubky(input.slice(0, separator));
    const listingId = this.entityId(input.slice(separator + 1));
    return `${owner}:${listingId}`;
  }

  static jsonValue(input: unknown): CommerceJsonValue {
    return this.parse(z.json(), input, 'jsonValue');
  }

  static marketplaceCommand(input: unknown): MarketplaceCommand {
    return this.parse(marketplaceCommandSchema, input, 'marketplaceCommand');
  }

  /**
   * Validates a Nexus `v0/stream/listings` payload and normalizes it into
   * catalog entries the grid can render directly. Pure: persisting the
   * entries — and any later hydration of the canonical record from the owner
   * homeserver (ADR-0020) — happens in the application layer.
   */
  static nexusListingStream(input: unknown): CommerceCatalogEntryModelSchema[] {
    const listings = this.parse(nexusListingStreamSchema, input, 'nexusListingStream');
    return listings.map((listing) => this.toCatalogEntry(listing));
  }

  private static toCatalogEntry(listing: NexusListingDetails): CommerceCatalogEntryModelSchema {
    return {
      id: `${listing.owner_id}:${listing.id}`,
      seller_id: listing.owner_id,
      listing_id: listing.id,
      state: listing.state,
      title: listing.title,
      description: listing.description,
      category_id: listing.category_id,
      condition: listing.condition,
      tags: listing.tags,
      country_code: listing.country_code,
      region: listing.region,
      media_urls: listing.media_urls,
      sale_format: listing.sale_format,
      price: this.toCatalogMoney(listing, listing.price_amount_minor),
      auction: this.toCatalogAuctionTerms(listing),
      revision: listing.revision,
      updated_at: Date.parse(listing.updated_at),
    };
  }

  /**
   * Auction money terms arrive as minor units of the listing's primary asset
   * (`price_currency` / `price_exponent`); pubky-app-specs guarantees all
   * auction prices share that asset, so denominating them here reproduces the
   * record's terms rather than inventing values.
   */
  private static toCatalogMoney(listing: NexusListingDetails, amountMinor: number): CommerceMoney {
    return { amountMinor, currency: listing.price_currency, exponent: listing.price_exponent };
  }

  // Returns null both for fixed-price listings and for auction rows indexed
  // before Nexus carried auction terms (the schema guarantees no other
  // partial state can reach this point).
  private static toCatalogAuctionTerms(listing: NexusListingDetails): CommerceCatalogAuctionTerms | null {
    if (listing.sale_format !== 'auction') return null;
    const { auction_starts_at, auction_ends_at, auction_minimum_increment_minor } = listing;
    if (auction_starts_at === null || auction_ends_at === null || auction_minimum_increment_minor === null) {
      return null;
    }
    return {
      startsAt: auction_starts_at,
      endsAt: auction_ends_at,
      reservePrice:
        listing.auction_reserve_price_minor === null
          ? null
          : this.toCatalogMoney(listing, listing.auction_reserve_price_minor),
      buyNowPrice:
        listing.auction_buy_now_price_minor === null
          ? null
          : this.toCatalogMoney(listing, listing.auction_buy_now_price_minor),
      minimumIncrement: this.toCatalogMoney(listing, auction_minimum_increment_minor),
    };
  }

  static aggregateId(input: unknown): string {
    return this.parse(commerceAggregateIdSchema, input, 'aggregateId');
  }

  static lockResource(input: unknown): string {
    return this.parse(locksPublicUriSchema, input, 'lockResource');
  }

  // Record paths come from pubky-app-specs so the client cannot drift from the
  // protocol definition. Media has no spec object yet and keeps a local path.
  static shopUri(ownerPubky: unknown): string {
    return shopUriBuilder(this.pubky(ownerPubky));
  }

  static listingUri(ownerPubky: unknown, listingId: unknown): string {
    return listingUriBuilder(this.pubky(ownerPubky), this.entityId(listingId));
  }

  static mediaUri(ownerPubky: unknown, mediaId: unknown): string {
    const owner = this.pubky(ownerPubky);
    const id = this.entityId(mediaId);
    return `pubky://${owner}${MARKETPLACE_BASE_PATH}/media/${id}`;
  }

  static reviewUri(ownerPubky: unknown, reviewId: unknown): string {
    return marketplaceReviewUriBuilder(this.pubky(ownerPubky), this.entityId(reviewId));
  }

  static collectionUri(ownerPubky: unknown, collectionId: unknown): string {
    const owner = this.pubky(ownerPubky);
    const id = this.entityId(collectionId);
    return `pubky://${owner}${MARKETPLACE_BASE_PATH}/collections/${id}.json`;
  }

  private static parse<T>(schema: z.ZodType<T>, input: unknown, operation: string): T {
    const result = schema.safeParse(input);
    if (result.success) return result.data;

    throw Err.validation(ValidationErrorCode.INVALID_INPUT, `Invalid commerce ${operation}.`, {
      service: ErrorService.Local,
      operation: `normalizeCommerce${operation}`,
      context: {
        issues: result.error.issues.map(({ code, message, path }) => ({
          code,
          message,
          path: path.join('.'),
        })),
      },
    });
  }
}
