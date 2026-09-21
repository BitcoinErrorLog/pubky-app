import type { InventoryAdjustRequest } from '@bitcoinerrorlog/pubky-shop';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { buildMarketplaceListingAggregateId } from '@/libs/commerce/transaction-commands';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { inventoryCapabilityCovers } from '@/services/marketplace/marketplace-inventory-grant';
import { MarketplaceInventorySessionService } from '@/services/marketplace/marketplace-inventory-session';
import { MarketplaceSessionService } from '@/services/marketplace/marketplace-session';
import { MarketplaceShopClientService, PubkyShopError } from '@/services/marketplace/marketplace-shop-client';

export type InventoryBoardRow = {
  listingId: string;
  sellerPubky: string;
  aggregateId: string;
  title: string;
  thumbUrl: string | null;
  state: string;
  format: string;
  dropId: string | null;
  available: number;
  reserved: number;
  sold: number;
  total: number;
  serverRevision: number;
  sync: 'synced' | 'missing';
};

export type InventoryBoardLoad =
  | { status: 'durable-unavailable' }
  | { status: 'unauthenticated' }
  | { status: 'session-required' }
  | { status: 'grant-needed' }
  | { status: 'empty'; rows: [] }
  | { status: 'ready'; rows: InventoryBoardRow[] }
  | { status: 'error'; message: string };

export type InventoryAdjustPlan =
  | { ok: true; request: InventoryAdjustRequest }
  | { ok: false; reason: 'delta_zero' | 'negative_available' };

export type InventorySetResult =
  | { status: 'updated'; row: InventoryBoardRow }
  | { status: 'grant-needed' }
  | { status: 'revision_conflict' }
  | { status: 'session-required' }
  | { status: 'error'; message: string };

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function asString(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function asInt(value: unknown): number | null {
  if (typeof value === 'bigint') {
    if (value < BigInt(0) || value > BigInt(Number.MAX_SAFE_INTEGER)) return null;
    return Number(value);
  }
  if (typeof value === 'number' && Number.isSafeInteger(value) && value >= 0) return value;
  return null;
}

function thumbUrl(record: Record<string, unknown> | null): string | null {
  const media = record?.media;
  if (!Array.isArray(media) || media.length === 0) return null;
  const first = media[0];
  if (typeof first === 'string') return first;
  const object = asObject(first);
  return asString(object?.url) ?? asString(object?.src);
}

function dropIdFromRecord(record: Record<string, unknown> | null): string | null {
  const edition = asObject(record?.edition);
  return asString(edition?.dropId) ?? asString(record?.dropId);
}

export function planInventoryAdjust(input: {
  listingId: string;
  aggregateId: string;
  currentAvailable: number;
  targetAvailable: number;
  expectedRevision: number;
  idempotencyKey: string;
}): InventoryAdjustPlan {
  if (!Number.isSafeInteger(input.targetAvailable) || input.targetAvailable < 0) {
    return { ok: false, reason: 'negative_available' };
  }
  if (input.targetAvailable === input.currentAvailable) {
    return { ok: false, reason: 'delta_zero' };
  }
  const delta = BigInt(input.targetAvailable - input.currentAvailable);
  return {
    ok: true,
    request: {
      schema_version: 1,
      kind: 'inventory.adjust',
      aggregate_id: input.aggregateId,
      listing_id: input.listingId,
      expected_revision: BigInt(input.expectedRevision),
      delta,
      idempotency_key: input.idempotencyKey,
    },
  };
}

function classifyClientError(error: PubkyShopError): InventoryBoardLoad['status'] | 'revision_conflict' {
  if (MarketplaceShopClientService.isSessionRejected(error)) return 'session-required';
  if (MarketplaceShopClientService.isCapabilityRequired(error)) return 'grant-needed';
  if (MarketplaceShopClientService.isRevisionConflict(error)) return 'revision_conflict';
  return 'error';
}

export class CommerceInventoryApplication {
  private constructor() {}

  static restoreInventorySession(pubky: string) {
    return MarketplaceInventorySessionService.restorePersistedSession(pubky);
  }

  static clearInventorySession(): void {
    MarketplaceInventorySessionService.clearSession('cleared');
  }

  static onInventorySessionEnded(
    listener: Parameters<typeof MarketplaceInventorySessionService.onSessionEnded>[0],
  ): () => void {
    return MarketplaceInventorySessionService.onSessionEnded(listener);
  }

  static beginInventorySessionFlow(expectedPubky: string) {
    return MarketplaceInventorySessionService.beginInventorySessionFlow(expectedPubky);
  }

  static async loadBoard(sellerPubky: string): Promise<InventoryBoardLoad> {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) {
      return { status: 'durable-unavailable' };
    }
    if (!sellerPubky) {
      return { status: 'unauthenticated' };
    }
    if (!MarketplaceSessionService.getActiveSession()) {
      return { status: 'session-required' };
    }
    const inventory = MarketplaceInventorySessionService.getActiveSession();
    if (!inventory || !inventoryCapabilityCovers(inventory.capabilities)) {
      return { status: 'grant-needed' };
    }

    const client = MarketplaceShopClientService.createInventoryClient(inventory.token);
    const rows: InventoryBoardRow[] = [];
    let cursor: string | undefined;
    for (;;) {
      const page = await MarketplaceShopClientService.listSellerListings(client, sellerPubky, {
        limit: 100,
        cursor,
      });
      if (!page.ok) {
        return this.boardError(page.error);
      }
      const listings = page.value.listings;
      if (!Array.isArray(listings)) {
        return { status: 'error', message: 'The service returned an invalid listings page.' };
      }
      for (const entry of listings) {
        const object = asObject(entry);
        if (!object) continue;
        const projection = asObject(object.projection);
        const record = asObject(object.record);
        const listingId = asString(projection?.listing_id) ?? asString(record?.listingId);
        if (!listingId) continue;
        const aggregateId =
          asString(projection?.aggregate_id) ?? buildMarketplaceListingAggregateId(sellerPubky, listingId);
        const inventoryResult = await MarketplaceShopClientService.getInventoryProjection(client, aggregateId);
        if (!inventoryResult.ok) {
          if (MarketplaceShopClientService.isCapabilityRequired(inventoryResult.error)) {
            return { status: 'grant-needed' };
          }
          if (MarketplaceShopClientService.isSessionRejected(inventoryResult.error)) {
            MarketplaceInventorySessionService.clearSession('rejected');
            return { status: 'grant-needed' };
          }
          rows.push({
            listingId,
            sellerPubky,
            aggregateId,
            title: asString(projection?.title) ?? asString(record?.title) ?? listingId,
            thumbUrl: thumbUrl(record),
            state: asString(projection?.state) ?? 'unknown',
            format: asString(projection?.sale_format) ?? asString(asObject(record?.sale)?.format) ?? 'fixed_price',
            dropId: dropIdFromRecord(record),
            available: asInt(projection?.available_quantity) ?? 0,
            reserved: asInt(projection?.reserved_quantity) ?? 0,
            sold: asInt(projection?.sold_quantity) ?? 0,
            total: asInt(projection?.total_quantity) ?? 0,
            serverRevision: asInt(projection?.server_revision) ?? 0,
            sync: 'missing',
          });
          continue;
        }
        const stock = inventoryResult.value.stock;
        rows.push({
          listingId,
          sellerPubky,
          aggregateId,
          title: asString(projection?.title) ?? asString(record?.title) ?? listingId,
          thumbUrl: thumbUrl(record),
          state: asString(projection?.state) ?? 'unknown',
          format: asString(projection?.sale_format) ?? asString(asObject(record?.sale)?.format) ?? 'fixed_price',
          dropId: dropIdFromRecord(record),
          available: Number(stock.available),
          reserved: Number(stock.reserved),
          sold: Number(stock.sold),
          total: Number(stock.total),
          serverRevision: Number(inventoryResult.value.server_revision),
          sync: 'synced',
        });
      }
      const next = asString(page.value.next_cursor);
      if (!next) break;
      cursor = next;
    }
    if (rows.length === 0) {
      return { status: 'empty', rows: [] };
    }
    return { status: 'ready', rows };
  }

  static async setAvailable(input: {
    sellerPubky: string;
    row: InventoryBoardRow;
    targetAvailable: number;
    idempotencyKey: string;
  }): Promise<InventorySetResult> {
    const inventory = MarketplaceInventorySessionService.getActiveSession();
    if (!inventory) {
      return { status: 'grant-needed' };
    }
    const plan = planInventoryAdjust({
      listingId: input.row.listingId,
      aggregateId: input.row.aggregateId,
      currentAvailable: input.row.available,
      targetAvailable: input.targetAvailable,
      expectedRevision: input.row.serverRevision,
      idempotencyKey: input.idempotencyKey,
    });
    if (!plan.ok) {
      return { status: 'error', message: plan.reason };
    }
    const client = MarketplaceShopClientService.createInventoryClient(inventory.token);
    const result = await MarketplaceShopClientService.adjustInventory(client, plan.request);
    if (!result.ok) {
      const classified = classifyClientError(result.error);
      if (classified === 'grant-needed') {
        if (MarketplaceShopClientService.isSessionRejected(result.error)) {
          MarketplaceInventorySessionService.clearSession('rejected');
        }
        return { status: 'grant-needed' };
      }
      if (classified === 'revision_conflict') {
        return { status: 'revision_conflict' };
      }
      if (classified === 'session-required') {
        MarketplaceInventorySessionService.clearSession('rejected');
        return { status: 'grant-needed' };
      }
      return { status: 'error', message: result.error.message };
    }
    const stock = result.value.result.stock;
    return {
      status: 'updated',
      row: {
        ...input.row,
        available: Number(stock.available),
        reserved: Number(stock.reserved),
        sold: Number(stock.sold),
        total: Number(stock.total),
        serverRevision: Number(result.value.result.server_revision),
        sync: 'synced',
      },
    };
  }

  static async retrySync(sellerPubky: string, listingId: string): Promise<InventorySetResult> {
    const inventory = MarketplaceInventorySessionService.getActiveSession();
    if (!inventory) return { status: 'grant-needed' };
    const client = MarketplaceShopClientService.createInventoryClient(inventory.token);
    const result = await MarketplaceShopClientService.syncMany(client, [
      { seller_pubky: sellerPubky, listing_id: listingId },
    ]);
    if (!result.ok) {
      const classified = classifyClientError(result.error);
      if (classified === 'grant-needed' || classified === 'session-required') {
        if (MarketplaceShopClientService.isSessionRejected(result.error)) {
          MarketplaceInventorySessionService.clearSession('rejected');
        }
        return { status: 'grant-needed' };
      }
      return { status: 'error', message: result.error.message };
    }
    return { status: 'error', message: 'refetch' };
  }

  private static boardError(error: PubkyShopError): InventoryBoardLoad {
    const classified = classifyClientError(error);
    if (classified === 'grant-needed') return { status: 'grant-needed' };
    if (classified === 'session-required') {
      MarketplaceInventorySessionService.clearSession('rejected');
      return { status: 'grant-needed' };
    }
    return { status: 'error', message: error.message };
  }

  static requireDurable(): void {
    if (!isDurableCommerceMode(getCommerceAdapterMode())) {
      throw Err.client(ClientErrorCode.BAD_REQUEST, 'Inventory Studio requires the durable transaction service.', {
        service: ErrorService.Marketplace,
        operation: 'inventory',
      });
    }
  }
}
