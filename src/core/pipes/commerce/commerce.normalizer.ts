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
} from '@/libs/commerce/marketplace-records';
import type { CommerceJsonValue } from '@/libs/commerce/transaction-contracts';
import { commerceEntityIdSchema, commercePubkySchema } from '@/libs/commerce/transaction-contracts';
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

  static shopUri(ownerPubky: unknown): string {
    const owner = this.pubky(ownerPubky);
    return `pubky://${owner}${MARKETPLACE_BASE_PATH}/shop.json`;
  }

  static listingUri(ownerPubky: unknown, listingId: unknown): string {
    const owner = this.pubky(ownerPubky);
    const id = this.entityId(listingId);
    return `pubky://${owner}${MARKETPLACE_BASE_PATH}/listings/${id}.json`;
  }

  static mediaUri(ownerPubky: unknown, mediaId: unknown): string {
    const owner = this.pubky(ownerPubky);
    const id = this.entityId(mediaId);
    return `pubky://${owner}${MARKETPLACE_BASE_PATH}/media/${id}`;
  }

  static reviewUri(ownerPubky: unknown, reviewId: unknown): string {
    const owner = this.pubky(ownerPubky);
    const id = this.entityId(reviewId);
    return `pubky://${owner}${MARKETPLACE_BASE_PATH}/reviews/${id}.json`;
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
