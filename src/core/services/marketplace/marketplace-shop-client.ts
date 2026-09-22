import {
  type CanonicalCsvRow,
  type CheckpointImportResult,
  type CurrentImportItem,
  type DryRunCounts,
  type ImportCheckpoint,
  type ImportManifest,
  type ManifestStore,
  type PlannedImportRow,
  type ResumeTask,
  type SdkResult,
  type SyncManyClassification,
  type SyncManyEnvelope,
  type SyncManyListing,
  browserFileSource,
  canonicalCsvRowIdentity,
  checkpointImportRow,
  chunkSyncManyListings,
  classifySyncManyItem,
  DEFAULT_CSV_LIMITS,
  DEFAULT_JSON_LIMITS,
  dryRunCounts,
  exportCanonicalCsv,
  listingIdentity,
  type InventoryAdjustmentEnvelope,
  type InventoryAdjustRequest,
  type InventoryProjection,
  type LosslessJsonObject,
  normalizedCsvRowHash,
  parseBoundedJson,
  parseCanonicalCsvStream,
  planImport,
  planImportStream,
  PubkyShopClient,
  PubkyShopError,
  resumeTasks,
  streamResumeTasks,
  SYNC_MANY_LIMIT,
} from '@bitcoinerrorlog/pubky-shop';
import { getMarketplaceUrl } from '@/config/commerce';
import { DexieManifestStore } from '@/services/marketplace/marketplace-import-store';

/**
 * The only Shop module that imports `@bitcoinerrorlog/pubky-shop`. Components
 * and hooks go through controllers; this wrapper owns the `.` export client.
 */
export type ShopBrowserFile = {
  readonly size: number;
  readonly name?: string;
  readonly type?: string;
  stream(): ReadableStream<Uint8Array>;
  arrayBuffer(): Promise<ArrayBuffer>;
  slice(start?: number, end?: number, contentType?: string): { arrayBuffer(): Promise<ArrayBuffer> };
};

export type PlannedBrowserFile = {
  readonly manifestId: string;
  readonly rowCount: number;
};

const JSON_LEAD = new Set([0x7b, 0x5b]);

function asObject(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function firstNonWs(bytes: Uint8Array): number | undefined {
  for (const byte of bytes) {
    if (byte !== 0x09 && byte !== 0x0a && byte !== 0x0d && byte !== 0x20) return byte;
  }
  return undefined;
}

function namedJson(file: ShopBrowserFile): boolean {
  const name = file.name?.toLowerCase() ?? '';
  const type = file.type?.toLowerCase() ?? '';
  return name.endsWith('.json') || type.includes('json');
}

async function peekLooksLikeJson(file: ShopBrowserFile): Promise<boolean> {
  if (namedJson(file)) return true;
  if (!Number.isSafeInteger(file.size) || file.size <= 0) return false;
  const peek = new Uint8Array(await file.slice(0, 64).arrayBuffer());
  const lead = firstNonWs(peek);
  return lead !== undefined && JSON_LEAD.has(lead);
}

function jsonPayloads(value: unknown): Map<string, string> {
  const items = Array.isArray(value)
    ? value
    : asObject(value) && Array.isArray(asObject(value)?.rows)
      ? (asObject(value)?.rows as unknown[])
      : [];
  const payloads = new Map<string, string>();
  for (const item of items) {
    const object = asObject(item);
    if (!object) continue;
    const row = object as unknown as CanonicalCsvRow;
    payloads.set(canonicalCsvRowIdentity(row), JSON.stringify(row));
  }
  return payloads;
}

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

  static isRateLimited(error: PubkyShopError): boolean {
    return (
      error.details.status === 429 ||
      (error.code === 'service_error' && error.details.serviceCode === 'rate_limited')
    );
  }

  static formatPlanFailure(error: PubkyShopError): string {
    if (error.code === 'limit_exceeded') {
      const limit = error.details.limit ?? 0;
      const observed = error.details.observed ?? 0;
      return `This file exceeds ${limit} (${observed}).`;
    }
    return 'This file could not be planned. Nothing was published.';
  }

  static formatRateLimitCopy(error: PubkyShopError): string {
    const retryAfter = (error.details as { retryAfter?: number }).retryAfter;
    const wait = typeof retryAfter === 'number' && Number.isFinite(retryAfter) ? String(retryAfter) : 'a few';
    return `Too many inventory requests. Wait ${wait} seconds.`;
  }

  static async listSellerListings(
    client: PubkyShopClient,
    pubky: string,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<SdkResult<LosslessJsonObject>> {
    return client.listings(pubky, query);
  }

  static async listSellerOrders(
    client: PubkyShopClient,
    pubky: string,
    query: { cursor?: string; limit?: number } = {},
  ): Promise<SdkResult<LosslessJsonObject>> {
    return client.orders(pubky, query);
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

  static chunkSyncMany(listings: readonly SyncManyListing[]): SyncManyListing[][] {
    return chunkSyncManyListings(listings, SYNC_MANY_LIMIT);
  }

  static classifySyncItem(item: unknown): SyncManyClassification {
    return classifySyncManyItem(item);
  }

  static dryRunCounts(manifest: ImportManifest): DryRunCounts {
    return dryRunCounts(manifest);
  }

  static resumeTasks(manifest: ImportManifest): readonly ResumeTask[] {
    return resumeTasks(manifest);
  }

  static streamResumeTasks(store: ManifestStore, manifestId: string): AsyncGenerator<ResumeTask> {
    return streamResumeTasks(store, manifestId);
  }

  static listingIdentity(row: CanonicalCsvRow): string {
    return listingIdentity(row);
  }

  static rowIdentity(row: CanonicalCsvRow): string {
    return canonicalCsvRowIdentity(row);
  }

  static rowHash(row: CanonicalCsvRow): string {
    return normalizedCsvRowHash(row);
  }

  static currentItemsFromRows(rows: readonly CanonicalCsvRow[]): Record<string, CurrentImportItem> {
    const items: Record<string, CurrentImportItem> = {};
    for (const row of rows) {
      items[canonicalCsvRowIdentity(row)] = {
        normalizedHash: normalizedCsvRowHash(row),
        recordRevision: row.recordRevision && row.recordRevision > 0 ? row.recordRevision : 1,
      };
    }
    return items;
  }

  static exportListingsCsv(rows: readonly CanonicalCsvRow[]): Uint8Array {
    return exportCanonicalCsv(rows);
  }

  static async checkpointRow(
    store: ManifestStore,
    manifestId: string,
    expectedManifestVersion: number,
    rowIdentity: string,
    checkpoint: ImportCheckpoint,
    failureCode?: PlannedImportRow['failureCode'],
  ): Promise<SdkResult<CheckpointImportResult>> {
    return checkpointImportRow(store, manifestId, expectedManifestVersion, rowIdentity, checkpoint, failureCode);
  }

  /**
   * Browser planner. JSON is size-checked then bounded `arrayBuffer` (16 MiB).
   * CSV streams via `browserFileSource` (64 MiB) and never calls unbounded
   * `File.arrayBuffer()`. D6.19: parse failure never reaches `store.create`.
   */
  static async planBrowserFile(
    file: ShopBrowserFile,
    store: DexieManifestStore,
    currentItems: Readonly<Record<string, CurrentImportItem>> = {},
  ): Promise<SdkResult<PlannedBrowserFile>> {
    const manifestStore = store as unknown as ManifestStore;
    try {
      if (await peekLooksLikeJson(file)) {
        if (!Number.isSafeInteger(file.size) || file.size < 0) {
          return {
            ok: false,
            error: new PubkyShopError('invalid_configuration', { field: 'file.size' }),
          };
        }
        if (file.size > DEFAULT_JSON_LIMITS.maxBytes) {
          return {
            ok: false,
            error: new PubkyShopError('limit_exceeded', {
              field: 'json_bytes',
              limit: DEFAULT_JSON_LIMITS.maxBytes,
              observed: Math.min(file.size, DEFAULT_JSON_LIMITS.maxBytes + 1),
            }),
          };
        }
        const bytes = new Uint8Array(await file.arrayBuffer());
        if (bytes.byteLength > DEFAULT_JSON_LIMITS.maxBytes) {
          return {
            ok: false,
            error: new PubkyShopError('limit_exceeded', {
              field: 'json_bytes',
              limit: DEFAULT_JSON_LIMITS.maxBytes,
              observed: Math.min(bytes.byteLength, DEFAULT_JSON_LIMITS.maxBytes + 1),
            }),
          };
        }
        const planned = await planImport(bytes, {
          store: manifestStore,
          currentItems,
          limits: { maxBytes: DEFAULT_JSON_LIMITS.maxBytes },
        });
        if (!planned.ok) return planned;
        const payloads = jsonPayloads(parseBoundedJson(bytes, { maxBytes: DEFAULT_JSON_LIMITS.maxBytes }));
        await store.persistPayloads(planned.value.manifestId, payloads);
        return { ok: true, value: { manifestId: planned.value.manifestId, rowCount: planned.value.rowCount } };
      }

      const source = browserFileSource(file, DEFAULT_CSV_LIMITS.maxBytes);
      const planned = await planImportStream(source, { store: manifestStore, currentItems });
      if (!planned.ok) return planned;
      const payloads = new Map<string, string>();
      await parseCanonicalCsvStream(browserFileSource(file, DEFAULT_CSV_LIMITS.maxBytes), (row) => {
        payloads.set(canonicalCsvRowIdentity(row), JSON.stringify(row));
      });
      await store.persistPayloads(planned.value.manifest.manifestId, payloads);
      return {
        ok: true,
        value: { manifestId: planned.value.manifest.manifestId, rowCount: planned.value.resourceUsage.rowCount },
      };
    } catch (error) {
      return {
        ok: false,
        error: error instanceof PubkyShopError ? error : new PubkyShopError('malformed_csv'),
      };
    }
  }
}

export { DEFAULT_CSV_LIMITS, DEFAULT_JSON_LIMITS, PubkyShopError, SYNC_MANY_LIMIT };
export type {
  CanonicalCsvRow,
  CurrentImportItem,
  DryRunCounts,
  ImportCheckpoint,
  ImportManifest,
  InventoryAdjustRequest,
  InventoryProjection,
  PlannedImportRow,
  ResumeTask,
  SdkResult,
  SyncManyClassification,
  SyncManyEnvelope,
  SyncManyListing,
};
