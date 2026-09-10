import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { ResourceLookupCacheModel } from '@/models/resource/resource';
import type { NexusResourceTagsResponse } from '@/services/nexus/resource/resource.types';

export const RESOURCE_LOOKUP_CACHE_TTL_MS = 5 * 60 * 1000;

export class LocalResourceService {
  private constructor() {}

  static async getCachedLookup(uri: string, now = Date.now()): Promise<NexusResourceTagsResponse | null | undefined> {
    try {
      const record = await ResourceLookupCacheModel.findById(uri);
      if (!record || record.expires_at <= now) return undefined;
      return record.response;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read resource lookup cache', {
        service: ErrorService.Local,
        operation: 'getCachedLookup',
        context: { uri },
        cause: error,
      });
    }
  }

  static async saveLookup(uri: string, response: NexusResourceTagsResponse | null, expiresAt: number): Promise<void> {
    try {
      await ResourceLookupCacheModel.upsert({ id: uri, response, expires_at: expiresAt });
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to save resource lookup cache', {
        service: ErrorService.Local,
        operation: 'saveLookup',
        context: { uri, expiresAt },
        cause: error,
      });
    }
  }
}
