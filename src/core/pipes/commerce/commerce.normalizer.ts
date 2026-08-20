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

const MARKETPLACE_BASE_PATH = '/pub/pubky.app/marketplace/v1';

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
