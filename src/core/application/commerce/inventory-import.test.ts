import { beforeEach, describe, expect, it, vi } from 'vitest';
import { listingToCanonicalRows } from '@/application/commerce/inventory-listing-map';
import {
  CommerceInventoryImportApplication,
  IMPORT_PARSE_FAIL_COPY,
} from '@/application/commerce/inventory-import';
import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { DexieManifestStore, HostImportManifest, HostPlannedImportRow } from '@/services/marketplace/marketplace-import-store';
import {
  type CanonicalCsvRow,
  DEFAULT_JSON_LIMITS,
  MarketplaceShopClientService,
  type ShopBrowserFile,
  SYNC_MANY_LIMIT,
} from '@/services/marketplace/marketplace-shop-client';
import { createCommerceListingFixture } from '@/test/fixtures/commerce/commerce';

const PUBKY = 'y'.repeat(52);

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return {
    ...actual,
    getCommerceAdapterMode: () => 'transaction-service',
    getMarketplaceUrl: () => 'https://staging-api.pubky.app',
    isDurableCommerceMode: () => true,
  };
});

vi.mock('@/services/marketplace/marketplace-session', () => ({
  MarketplaceSessionService: {
    getActiveSession: () => ({ token: 'identity', pubky: PUBKY, capabilities: '', expiresAt: Date.now() + 60_000 }),
  },
}));

vi.mock('@/services/marketplace/marketplace-inventory-session', () => ({
  MarketplaceInventorySessionService: {
    getActiveSession: () => ({
      token: 'inventory',
      pubky: PUBKY,
      capabilities: '/pub/pubky.app/marketplace-service/v1/:rw',
      expiresAt: Date.now() + 60_000,
    }),
  },
}));

vi.mock('@/services/marketplace/marketplace-inventory-grant', () => ({
  inventoryCapabilityCovers: () => true,
}));

class MemoryImportStore {
  manifests = new Map<string, HostImportManifest>();
  payloads = new Map<string, string>();

  async create(manifest: HostImportManifest): Promise<void> {
    if (this.manifests.has(manifest.manifestId)) throw new Error('manifest_conflict');
    this.manifests.set(manifest.manifestId, structuredClone(manifest));
  }

  async load(manifestId: string): Promise<HostImportManifest | null> {
    const current = this.manifests.get(manifestId);
    return current ? structuredClone(current) : null;
  }

  async compareAndSwap(
    manifestId: string,
    expectedVersion: number,
    update: (manifest: HostImportManifest) => HostImportManifest,
  ): Promise<HostImportManifest> {
    const current = this.manifests.get(manifestId);
    if (!current || current.manifestVersion !== expectedVersion) throw new Error('manifest_conflict');
    const next = update(structuredClone(current));
    this.manifests.set(manifestId, next);
    return structuredClone(next);
  }

  async persistPayloads(manifestId: string, payloads: ReadonlyMap<string, string>): Promise<void> {
    for (const [key, value] of payloads) this.payloads.set(`${manifestId}:${key}`, value);
  }

  async getPayloadJson(manifestId: string, rowIdentity: string): Promise<string | null> {
    return this.payloads.get(`${manifestId}:${rowIdentity}`) ?? null;
  }

  async listProgress(): Promise<never[]> {
    return [];
  }

  async pruneExpired(): Promise<void> {}

  async getMapping(): Promise<null> {
    return null;
  }

  async putMapping(): Promise<void> {}
}

class BytesFile implements ShopBrowserFile {
  arrayBufferCalls = 0;

  constructor(
    private readonly bytes: Uint8Array,
    readonly name: string,
    readonly type = '',
    readonly reportedSize = bytes.byteLength,
  ) {}

  get size(): number {
    return this.reportedSize;
  }

  stream(): ReadableStream<Uint8Array> {
    const bytes = this.bytes;
    return new ReadableStream({
      start(controller) {
        controller.enqueue(bytes);
        controller.close();
      },
    });
  }

  async arrayBuffer(): Promise<ArrayBuffer> {
    this.arrayBufferCalls += 1;
    return this.bytes.buffer.slice(this.bytes.byteOffset, this.bytes.byteOffset + this.bytes.byteLength);
  }

  slice(start = 0, end = this.bytes.byteLength): { arrayBuffer: () => Promise<ArrayBuffer> } {
    const part = this.bytes.slice(start, end);
    return {
      arrayBuffer: async () => part.buffer.slice(part.byteOffset, part.byteOffset + part.byteLength),
    };
  }
}

function canonicalRow(listingId: string, overrides: Partial<CanonicalCsvRow> = {}): CanonicalCsvRow {
  const record = createCommerceListingFixture({ listingId });
  const [row] = listingToCanonicalRows(record);
  return { ...row, ...overrides };
}

function utf8(value: string): Uint8Array {
  return new TextEncoder().encode(value);
}

describe('MarketplaceShopClientService import helpers', () => {
  it('chunks sync-many at 100', () => {
    const listings = Array.from({ length: 101 }, (_, index) => ({
      seller_pubky: PUBKY,
      listing_id: `id_${index}`,
    }));
    const chunks = MarketplaceShopClientService.chunkSyncMany(listings);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(SYNC_MANY_LIMIT);
    expect(chunks[1]).toHaveLength(1);
  });

  it('classifies 207 item success and failure separately', () => {
    const ok = MarketplaceShopClientService.classifySyncItem({ listing_id: 'boots_01', status: 200 });
    const missing = MarketplaceShopClientService.classifySyncItem({
      listing_id: 'boots_02',
      status: 404,
      message: 'missing',
    });
    expect(ok).toMatchObject({ listingId: 'boots_01', ok: true });
    expect(missing).toMatchObject({ listingId: 'boots_02', ok: false });
  });

  it('does not call arrayBuffer for an oversize JSON file', async () => {
    const store = new MemoryImportStore() as unknown as DexieManifestStore;
    const file = new BytesFile(utf8('{"rows":[]}'), 'listings.json', 'application/json', DEFAULT_JSON_LIMITS.maxBytes + 1);
    const planned = await MarketplaceShopClientService.planBrowserFile(file, store);
    expect(planned.ok).toBe(false);
    expect(file.arrayBufferCalls).toBe(0);
    if (!planned.ok) {
      expect(MarketplaceShopClientService.formatPlanFailure(planned.error)).toMatch(/^This file exceeds /);
    }
  });

  it('plans JSON rows and persists payloads without publishing', async () => {
    const store = new MemoryImportStore();
    const row = canonicalRow('boots_01');
    const file = new BytesFile(utf8(JSON.stringify([row])), 'listings.json', 'application/json');
    const planned = await MarketplaceShopClientService.planBrowserFile(file, store as unknown as DexieManifestStore);
    expect(planned.ok).toBe(true);
    if (!planned.ok) return;
    const manifest = await store.load(planned.value.manifestId);
    expect(manifest?.rows).toHaveLength(1);
    expect(manifest?.rows[0]?.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i,
    );
    const payload = await store.getPayloadJson(planned.value.manifestId, manifest!.rows[0]!.rowIdentity);
    expect(payload).toContain('boots_01');
  });
});

describe('CommerceInventoryImportApplication', () => {
  let store: MemoryImportStore;
  let puts: string[];
  let syncCalls: { seller_pubky: string; listing_id: string }[][];

  beforeEach(() => {
    store = new MemoryImportStore();
    puts = [];
    syncCalls = [];
  });

  function app(syncResults: Array<{ listing_id: string; status: number }>[] = []) {
    let syncIndex = 0;
    return CommerceInventoryImportApplication.forSeller(PUBKY, {
      store: store as unknown as DexieManifestStore,
      currentItems: async () => ({}),
      putListing: async (record) => {
        puts.push(record.listingId);
      },
      listingExists: async () => false,
      syncMany: async (listings) => {
        syncCalls.push([...listings]);
        const items = syncResults[syncIndex] ?? listings.map((listing) => ({ listing_id: listing.listing_id, status: 200 }));
        syncIndex += 1;
        return {
          ok: true,
          value: { schema_version: 1n, kind: 'listing.sync_many', results: items },
        };
      },
    });
  }

  it('parse failure publishes zero rows', async () => {
    const result = await app().planFile(new BytesFile(utf8('not-csv-or-json'), 'bad.txt'));
    expect(result).toMatchObject({ status: 'parse-failed', puts: 0, message: IMPORT_PARSE_FAIL_COPY });
    expect(puts).toEqual([]);
    expect(store.manifests.size).toBe(0);
  });

  it('rejects a formula_payload CSV and never PUTs', async () => {
    const header =
      'record_uri,seller_pubky,listing_id,source_listing_key,record_revision,variant_id,sku,state,title,description,taxonomy_json,category,condition,tags_json,amount_minor,currency,exponent,variant_quantity,variant_enabled,options_json,media_json,shipping_options_json,return_policy_json,sale_json,external_refs_json';
    const row = `,${PUBKY},boots_01,,1,variant_01,,active,=HYPERLINK("http://x"),desc,{},fashion,good,[],1,USD,2,1,true,{},[],[],{},{},{}`;
    const result = await app().planFile(new BytesFile(utf8(`${header}\n${row}\n`), 'listings.csv', 'text/csv'));
    expect(result.status).toBe('parse-failed');
    expect(puts).toEqual([]);
  });

  it('publishes then classifies mixed 207 without a second PUT on resume', async () => {
    const importer = app([
      [{ listing_id: 'boots_01', status: 200 }],
      [{ listing_id: 'hat_01', status: 500 }],
      [{ listing_id: 'hat_01', status: 200 }],
    ]);
    const planned = await importer.planFile(
      new BytesFile(
        utf8(JSON.stringify([canonicalRow('boots_01'), canonicalRow('hat_01')])),
        'two.json',
        'application/json',
      ),
    );
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') return;

    const first = await importer.publish(planned.manifestId);
    expect(puts).toEqual(['boots_01', 'hat_01']);
    expect(first.status).toBe('complete');
    if (first.status === 'complete') expect(first.mixed).toBe(true);

    const resumed = await importer.resume(planned.manifestId);
    expect(puts).toEqual(['boots_01', 'hat_01']);
    expect(syncCalls.at(-1)).toEqual([{ seller_pubky: PUBKY, listing_id: 'hat_01' }]);
    expect(resumed.status).toBe('complete');
  });

  it('checkpoints conflict on CAS 409 and does not overwrite', async () => {
    const importer = CommerceInventoryImportApplication.forSeller(PUBKY, {
      store: store as unknown as DexieManifestStore,
      currentItems: async () => ({}),
      putListing: async () => {
        throw Err.client(ClientErrorCode.CONFLICT, 'The published listing changed.', {
          service: ErrorService.Homeserver,
          operation: 'putVerifiedPublicListing',
        });
      },
      listingExists: async () => false,
      syncMany: async () => ({
        ok: true,
        value: { schema_version: 1n, kind: 'listing.sync_many', results: [] },
      }),
    });
    const planned = await importer.planFile(
      new BytesFile(utf8(JSON.stringify([canonicalRow('boots_01')])), 'one.json', 'application/json'),
    );
    expect(planned.status).toBe('planned');
    if (planned.status !== 'planned') return;
    const published = await importer.publish(planned.manifestId);
    expect(published.status).toBe('conflict');
  });

  it('plans 250 JSON rows', async () => {
    const rows = Array.from({ length: 250 }, (_, index) => canonicalRow(`item_${index}`));
    const planned = await app().planFile(
      new BytesFile(utf8(JSON.stringify(rows)), 'bulk.json', 'application/json'),
    );
    expect(planned.status).toBe('planned');
    if (planned.status === 'planned') expect(planned.rowCount).toBe(250);
  });
});

export type { HostPlannedImportRow };
