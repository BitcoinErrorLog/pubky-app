import {
  type InventoryAdjustmentEnvelope,
  type InventoryAdjustRequest,
  type InventoryProjection,
  type LosslessJsonObject,
  PubkyShopClient,
  PubkyShopError,
  type SdkResult,
  type SyncManyEnvelope,
  type SyncManyListing,
} from '@bitcoinerrorlog/pubky-shop';
import { getMarketplaceUrl } from '@/config/commerce';

/**
 * The only Shop module that imports `@bitcoinerrorlog/pubky-shop`. Components
 * and hooks go through controllers; this wrapper owns the `.` export client.
 */
export class MarketplaceShopClientService {
  private constructor() {}

  static serviceOrigin(): string {
    return new URL(getMarketplaceUrl()).origin;
  }

  static createInventoryClient(session: string): PubkyShopClient {
    return new PubkyShopClient({
      session,
      serviceUrl: this.serviceOrigin(),
    });
  }

  static isCapabilityRequired(error: PubkyShopError): boolean {
    return error.code === 'service_error' && error.details.serviceCode === 'capability_required';
  }

  static isRevisionConflict(error: PubkyShopError): boolean {
    return error.code === 'service_error' && error.details.serviceCode === 'revision_conflict';
  }

  static isSessionRejected(error: PubkyShopError): boolean {
    return error.code === 'session_rejected';
  }

  static async listSellerListings(
    client: PubkyShopClient,
    pubky: string,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<SdkResult<LosslessJsonObject>> {
    return client.listings(pubky, query);
  }

  static async getInventoryProjection(
    client: PubkyShopClient,
    aggregateId: string,
  ): Promise<SdkResult<InventoryProjection>> {
    return client.getInventoryProjection(aggregateId);
  }

  static async adjustInventory(
    client: PubkyShopClient,
    request: InventoryAdjustRequest,
  ): Promise<SdkResult<InventoryAdjustmentEnvelope>> {
    return client.adjustInventory(request);
  }

  static async syncMany(
    client: PubkyShopClient,
    listings: readonly SyncManyListing[],
  ): Promise<SdkResult<SyncManyEnvelope>> {
    return client.syncMany(listings);
  }
}

export { PubkyShopError };
export type { InventoryAdjustRequest, InventoryProjection, SdkResult, SyncManyListing };
