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
import type { CommerceJsonValue } from '@/libs/commerce/transaction-contracts';
import {
  commerceAggregateIdSchema,
  commerceEntityIdSchema,
  commercePubkySchema,
} from '@/libs/commerce/transaction-contracts';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { NexusListingDetails } from '@/services/nexus/marketplace/marketplace.types';

const MARKETPLACE_BASE_PATH = '/pub/pubky.app/marketplace/v1';

/**
 * Wire schema for one Nexus listing projection (`NexusListingDetails`).
 *
 * This intentionally does NOT reuse `commerceListingRecordSchema`: the Nexus
 * projection is lossy (no media metadata, variants, sale terms, shipping
 * options, or return policy), so it can never reconstruct a
 * `CommerceListingRecord` without fabricating fields. Identity fields reuse
 * the shared record schemas; the remaining fields are validated for type
 * agreement with the real Nexus response shape. Unknown extra keys are
 * tolerated so additive Nexus changes do not break discovery.
 */
const nexusListingDetailsSchema: z.ZodType<NexusListingDetails> = z.object({
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
  fulfillment_methods: z.array(z.enum(['physical', 'digital', 'pickup'])),
  adult_only: z.boolean(),
  created_at: z.string(),
  updated_at: z.string(),
  revision: z.number().int().positive(),
});

const nexusListingStreamSchema = z.array(nexusListingDetailsSchema);

/**
 * Discovery identity extracted from a Nexus listing projection: which
 * canonical homeserver record to hydrate, and the revision Nexus has seen
 * (used to decide whether a cached record is stale).
 */
export interface CommerceNexusListingKey {
  sellerId: string;
  listingId: string;
  revision: number;
}

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
   * Validates a Nexus `v0/stream/listings` payload and reduces it to
   * discovery keys. Pure: hydration of the canonical records happens in the
   * application layer against the owner homeserver (ADR-0020).
   */
  static nexusListingStream(input: unknown): CommerceNexusListingKey[] {
    const listings = this.parse(nexusListingStreamSchema, input, 'nexusListingStream');
    return listings.map(({ owner_id, id, revision }) => ({ sellerId: owner_id, listingId: id, revision }));
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
