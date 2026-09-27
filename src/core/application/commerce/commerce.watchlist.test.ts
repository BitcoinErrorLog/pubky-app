import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  base64UrlToBytes,
  bytesToBase64Url,
  decryptPrivRecord,
  privEntryUrl,
  type PrivKeyring,
} from '@/libs/commerce/priv-envelope';
import { HttpMethod } from '@/libs/http/http.types';
import { CommerceHomeserverService } from '@/services/homeserver/commerce/commerce';
import { HomeserverService } from '@/services/homeserver/homeserver';
import { capabilitiesGrantWrite } from '@/services/homeserver/homeserver.utils';
import { LocalCommerceService } from '@/services/local/commerce/commerce';
import { type FakeHomeserver, installFakeHomeserver } from '@/test-utils/fake-homeserver';
import { CommerceApplication } from './commerce';
import { CommercePrivKeyringApplication } from './priv-keyring';

const OWNER = 'o'.repeat(52);
const SELLER = 's'.repeat(52);
const WATCHLIST_URL = `pubky://${OWNER}/priv/pubky.app/marketplace/v1/watchlist.json`;
const KEYRING: PrivKeyring = {
  ownerPubky: OWNER,
  currentKeyId: 'a'.repeat(32),
  keys: [{ keyId: 'a'.repeat(32), key: new Uint8Array(32).fill(3) }],
};
const V2_URL = privEntryUrl(KEYRING, 'watchlist', 'watchlist');

function v1Record(revision: number, items: [string, number][], tombstones: [string, number][] = []) {
  return {
    schemaVersion: 1,
    recordType: 'watchlist',
    ownerPubky: OWNER,
    revision,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-02T00:00:00.000Z',
    items: items.map(([listingId, watchedAtMs]) => ({ listingOwnerPubky: SELLER, listingId, watchedAtMs })),
    tombstones: tombstones.map(([listingId, removedAtMs]) => ({ listingOwnerPubky: SELLER, listingId, removedAtMs })),
  };
}

describe('capabilitiesGrantWrite (session-fact capability gating)', () => {
  it('grants /priv writes for the widened app grant and for root sessions', () => {
    expect(capabilitiesGrantWrite(['/pub/pubky.app/:rw', '/priv/pubky.app/:rw'], '/priv/pubky.app/')).toBe(true);
    expect(capabilitiesGrantWrite(['/:rw'], '/priv/pubky.app/')).toBe(true);
  });

  it('refuses /priv writes for the legacy public-only grant', () => {
    expect(capabilitiesGrantWrite(['/pub/pubky.app/:rw'], '/priv/pubky.app/')).toBe(false);
    expect(capabilitiesGrantWrite(['/pub/pubky.app/:rw', '/pub/paykit/:rw'], '/priv/pubky.app/')).toBe(false);
  });

  it('refuses read-only scopes and empty capability lists', () => {
    expect(capabilitiesGrantWrite(['/priv/pubky.app/:r'], '/priv/pubky.app/')).toBe(false);
    expect(capabilitiesGrantWrite([], '/priv/pubky.app/')).toBe(false);
  });

  it('does not let a sibling scope leak across directories', () => {
    expect(capabilitiesGrantWrite(['/priv/other.app/:rw'], '/priv/pubky.app/')).toBe(false);
    expect(capabilitiesGrantWrite(['/pub/pubky.app/:rw'], '/pub/pubky.application/')).toBe(false);
  });
});

describe('CommerceApplication.syncWatchlist capability gating', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('skips without touching the network when no session exists', async () => {
    vi.spyOn(HomeserverService, 'hasActiveSession').mockReturnValue(false);
    const fetch = vi.spyOn(CommerceHomeserverService, 'fetchJson');

    expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('skipped');
    expect(fetch).not.toHaveBeenCalled();
  });

  it('returns needs_reauth from session facts alone (no probing) when the grant lacks /priv', async () => {
    vi.spyOn(HomeserverService, 'hasActiveSession').mockReturnValue(true);
    vi.spyOn(HomeserverService, 'canCurrentSessionWrite').mockReturnValue(false);
    const fetch = vi.spyOn(CommerceHomeserverService, 'fetchJson');
    const put = vi.spyOn(CommerceHomeserverService, 'putJson');

    expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('needs_reauth');
    expect(fetch).not.toHaveBeenCalled();
    expect(put).not.toHaveBeenCalled();
  });

  describe('against the homeserver', () => {
    let homeserver: FakeHomeserver;

    beforeEach(() => {
      vi.spyOn(HomeserverService, 'hasActiveSession').mockReturnValue(true);
      vi.spyOn(HomeserverService, 'canCurrentSessionWrite').mockReturnValue(true);
      vi.spyOn(HomeserverService, 'isCurrentSessionGrant').mockReturnValue(false);
      vi.spyOn(CommercePrivKeyringApplication, 'get').mockResolvedValue({ kind: 'keys', keyring: KEYRING });
      vi.spyOn(LocalCommerceService, 'getFavorites').mockResolvedValue([]);
      vi.spyOn(LocalCommerceService, 'getWatchTombstones').mockResolvedValue([]);
      vi.spyOn(LocalCommerceService, 'applyWatchlistState').mockResolvedValue(undefined);
      vi.spyOn(LocalCommerceService, 'completeSyncJob').mockResolvedValue(undefined);
      homeserver = installFakeHomeserver();
    });

    const stored = () =>
      decryptPrivRecord({
        keyring: KEYRING,
        family: 'watchlist',
        id: 'watchlist',
        envelope: homeserver.files.get(V2_URL),
      });
    const writes = () => homeserver.log.filter((entry) => !entry.startsWith('GET ') && !entry.startsWith('LIST '));

    it('writes nothing without a key: needs_reauth or unavailable, outbox pending', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      vi.mocked(CommercePrivKeyringApplication.get).mockResolvedValueOnce({ kind: 'needs_reauth' });
      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('needs_reauth');
      vi.mocked(CommercePrivKeyringApplication.get).mockResolvedValueOnce({ kind: 'unavailable' });
      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('unavailable');
      expect(homeserver.log).toEqual([]);
      expect(homeserver.files.has(WATCHLIST_URL)).toBe(true);
      expect(LocalCommerceService.completeSyncJob).not.toHaveBeenCalled();
    });

    it('moves a plaintext v1 watchlist into the encrypted entry, verifies it, then deletes v1', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]], [['boots_00', 50]]));

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('synced');

      expect(LocalCommerceService.applyWatchlistState).toHaveBeenCalledWith(
        OWNER,
        new Map([[`${SELLER}:boots_01`, 100]]),
        new Map([[`${SELLER}:boots_00`, 50]]),
      );
      expect(JSON.stringify(homeserver.files.get(V2_URL))).not.toContain('boots_0');
      expect(stored()).toMatchObject({
        recordType: 'watchlist',
        revision: 3,
        createdAt: '2025-01-01T00:00:00.000Z',
        items: [{ listingOwnerPubky: SELLER, listingId: 'boots_01', watchedAtMs: 100 }],
        tombstones: [{ listingOwnerPubky: SELLER, listingId: 'boots_00', removedAtMs: 50 }],
      });
      expect(homeserver.files.has(WATCHLIST_URL)).toBe(false);
      const put = homeserver.log.indexOf(`PUT ${V2_URL}`);
      const verify = homeserver.log.lastIndexOf(`GET ${V2_URL}`);
      const remove = homeserver.log.indexOf(`DELETE ${WATCHLIST_URL}`);
      expect(put).toBeGreaterThanOrEqual(0);
      expect(verify).toBeGreaterThan(put);
      expect(remove).toBeGreaterThan(verify);
      expect(LocalCommerceService.completeSyncJob).toHaveBeenCalledWith(`watchlist|${OWNER}`);
    });

    it('leaves an encrypted entry that already matches untouched', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      await CommerceApplication.syncWatchlist(OWNER);
      vi.mocked(LocalCommerceService.getFavorites).mockResolvedValue([
        { id: `${OWNER}|${SELLER}:boots_01`, owner_id: OWNER, listing_id: `${SELLER}:boots_01`, created_at: 100 },
      ]);
      homeserver.log.length = 0;

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('synced');
      expect(writes()).toEqual([]);
      expect(stored()).toMatchObject({ revision: 3 });
    });

    it('merges a plaintext file an older build wrote after the move, then deletes it again', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      await CommerceApplication.syncWatchlist(OWNER);
      homeserver.files.set(WATCHLIST_URL, v1Record(3, [['boots_03', 300]]));

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('synced');
      expect(stored()).toMatchObject({
        revision: 4,
        items: expect.arrayContaining([
          { listingOwnerPubky: SELLER, listingId: 'boots_01', watchedAtMs: 100 },
          { listingOwnerPubky: SELLER, listingId: 'boots_03', watchedAtMs: 300 },
        ]),
      });
      expect(homeserver.files.has(WATCHLIST_URL)).toBe(false);
    });

    it('seals local changes with a bumped revision and the tombstone carried', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      await CommerceApplication.syncWatchlist(OWNER);
      vi.mocked(LocalCommerceService.getFavorites).mockResolvedValue([
        { id: `${OWNER}|${SELLER}:boots_02`, owner_id: OWNER, listing_id: `${SELLER}:boots_02`, created_at: 300 },
      ]);
      vi.mocked(LocalCommerceService.getWatchTombstones).mockResolvedValue([
        { id: `${OWNER}|${SELLER}:boots_01`, owner_id: OWNER, listing_id: `${SELLER}:boots_01`, removed_at: 200 },
      ]);

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('synced');
      expect(stored()).toMatchObject({
        revision: 4,
        items: [{ listingOwnerPubky: SELLER, listingId: 'boots_02', watchedAtMs: 300 }],
        tombstones: [{ listingOwnerPubky: SELLER, listingId: 'boots_01', removedAtMs: 200 }],
      });
    });

    it('never overwrites an encrypted entry it cannot open, and keeps v1', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      await CommerceApplication.syncWatchlist(OWNER);
      const envelope = homeserver.files.get(V2_URL) as { ct: string };
      const ct = base64UrlToBytes(envelope.ct);
      ct[0] ^= 1;
      const tampered = { ...envelope, ct: bytesToBase64Url(ct) };
      homeserver.files.set(V2_URL, tampered);
      homeserver.files.set(WATCHLIST_URL, v1Record(3, [['boots_03', 300]]));
      homeserver.log.length = 0;

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('error');
      expect(writes()).toEqual([]);
      expect(homeserver.files.get(V2_URL)).toEqual(tampered);
      expect(homeserver.files.has(WATCHLIST_URL)).toBe(true);
    });

    it('keeps v1 when the encrypted write does not read back as written', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      homeserver.corruptNextPut(V2_URL, () => ({ enc: 'pubky-priv-aead/v1' }));

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('error');
      expect(homeserver.files.has(WATCHLIST_URL)).toBe(true);
      expect(LocalCommerceService.completeSyncJob).not.toHaveBeenCalled();
    });

    it('flips to needs_reauth when the encrypted write is refused, and keeps v1', async () => {
      homeserver.files.set(WATCHLIST_URL, v1Record(2, [['boots_01', 100]]));
      homeserver.failNext(HttpMethod.PUT, V2_URL, 403);

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('needs_reauth');
      expect(homeserver.files.has(WATCHLIST_URL)).toBe(true);
      expect(homeserver.files.has(V2_URL)).toBe(false);
    });

    it('a grant session refused with 403 fails the round instead of asking for a step-up', async () => {
      vi.mocked(HomeserverService.isCurrentSessionGrant).mockReturnValue(true);
      homeserver.failNext(HttpMethod.GET, V2_URL, 403);

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('error');
      expect(LocalCommerceService.completeSyncJob).not.toHaveBeenCalled();
    });

    it('publishes nothing when there is no document anywhere and nothing local', async () => {
      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('synced');
      expect(writes()).toEqual([]);
    });

    it('never writes the plaintext v1 path', async () => {
      vi.mocked(LocalCommerceService.getFavorites).mockResolvedValue([
        { id: `${OWNER}|${SELLER}:boots_02`, owner_id: OWNER, listing_id: `${SELLER}:boots_02`, created_at: 300 },
      ]);
      const putJson = vi.spyOn(CommerceHomeserverService, 'putJson');

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('synced');
      expect(putJson).not.toHaveBeenCalled();
      expect(homeserver.log).not.toContain(`PUT ${WATCHLIST_URL}`);
      expect([...homeserver.files.keys()]).toEqual([V2_URL]);
    });

    it('reports error (outbox stays pending) on a non-auth failure', async () => {
      homeserver.failNext(HttpMethod.GET, WATCHLIST_URL, 500);

      expect(await CommerceApplication.syncWatchlist(OWNER)).toBe('error');
      expect(LocalCommerceService.completeSyncJob).not.toHaveBeenCalled();
    });
  });
});
