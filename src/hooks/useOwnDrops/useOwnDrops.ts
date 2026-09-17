'use client';

import { useEffect, useState } from 'react';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { readOwnDropIndex } from '@/hooks/useDropStudio/drop-index';
import type { CommerceDropRecord } from '@/libs/commerce/marketplace-records';
import { hasHttpStatus, isMarketplaceSessionRequiredError } from '@/libs/error/error.utils';
import type { MarketplaceSellerDrop } from '@/services/marketplace/marketplace-projections';
import { useAuthStore } from '@/stores/auth/auth.store';

type OwnDropProjection =
  | { status: 'loaded'; drop: MarketplaceSellerDrop }
  | { status: 'unregistered' }
  | {
      status: 'session-unavailable' | 'unavailable';
    };

export interface OwnDropRow {
  dropId: string;
  /** The seller-signed homeserver record, or null when it could not be read. */
  record: CommerceDropRecord | null;
  /** The transaction-service read, preserving absence separately from failures. */
  projection: OwnDropProjection;
}

export interface UseOwnDropsResult {
  rows: OwnDropRow[];
  isLoading: boolean;
  isDurable: boolean;
  refresh: () => Promise<void>;
}

/**
 * The seller's drops for the drops home, enumerated from the homeserver's
 * drops directory (`CommerceController.listOwnDropIds` — authoritative,
 * works across devices), merged with the device-local publish index as a
 * freshness supplement for ids published moments ago. Each id is then
 * re-read from BOTH authorities: the homeserver record (title, schedule
 * intent) and the service's seller projection (state, revision). Rows sort
 * newest launch first. Every read failure renders as honest absence on its
 * own row — a missing projection never hides the record and vice versa;
 * an unreachable directory listing degrades to the local index alone.
 */
export function useOwnDrops(): UseOwnDropsResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const isDurable = isDurableCommerceMode(getCommerceAdapterMode());
  const [rows, setRows] = useState<OwnDropRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    let active = true;
    if (!currentUserPubky) {
      setRows([]);
      setIsLoading(false);
      return;
    }
    setIsLoading(true);
    void (async () => {
      const listed = await CommerceController.listOwnDropIds().catch(() => [] as string[]);
      const remembered = readOwnDropIndex(currentUserPubky);
      const dropIds = [...new Set([...listed, ...remembered])];
      const loaded = await Promise.all(
        dropIds.map(async (dropId): Promise<OwnDropRow> => {
          const record = await CommerceController.fetchDrop(currentUserPubky, dropId).catch(() => null);
          if (!isDurable) return { dropId, record, projection: { status: 'unavailable' } };
          try {
            const drop = await CommerceController.getOwnDrop(dropId);
            return drop
              ? { dropId, record, projection: { status: 'loaded', drop } }
              : { dropId, record, projection: { status: 'unregistered' } };
          } catch (error) {
            if (isMarketplaceSessionRequiredError(error))
              return { dropId, record, projection: { status: 'session-unavailable' } };
            if (hasHttpStatus(error, 404)) return { dropId, record, projection: { status: 'unregistered' } };
            return { dropId, record, projection: { status: 'unavailable' } };
          }
        }),
      );
      loaded.sort((a, b) => Date.parse(b.record?.startsAt ?? '') - Date.parse(a.record?.startsAt ?? ''));
      if (!active) return;
      setRows(loaded);
      setIsLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [currentUserPubky, isDurable, refreshVersion]);

  return { rows, isLoading, isDurable, refresh: async () => setRefreshVersion((previous) => previous + 1) };
}
