import { isAppError, isNotFound } from '@/libs/error/error.utils';
import { normalizeResourceUri } from '@/libs/resource/normalizeResourceUri';
import { LocalResourceService, RESOURCE_LOOKUP_CACHE_TTL_MS } from '@/services/local/resource/resource';
import { NexusResourceService } from '@/services/nexus/resource/resource';
import type {
  NexusResource,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
  TResourceStreamParams,
} from '@/services/nexus/resource/resource.types';

export class ResourceApplication {
  private constructor() {}

  static async fetchByTag(params: TResourcesByTagParams): Promise<NexusResource[]> {
    return await NexusResourceService.fetchByTag(params);
  }

  static async fetchById(params: TResourceByIdParams): Promise<NexusResourceTagsResponse> {
    return await NexusResourceService.fetchById(params);
  }

  static async fetchByUri(params: TResourceByUriParams): Promise<NexusResourceTagsResponse> {
    return await NexusResourceService.fetchByUri(params);
  }

  static async getOrFetchByUri(uri: string): Promise<NexusResourceTagsResponse | null> {
    const normalizedUri = normalizeResourceUri(uri);
    const cached = await LocalResourceService.getCachedLookup(normalizedUri);
    if (cached !== undefined) return cached;

    let response: NexusResourceTagsResponse | null = null;
    try {
      response = await NexusResourceService.fetchByUri({ uri: normalizedUri });
    } catch (error) {
      if (!(isAppError(error) && isNotFound(error))) throw error;
    }

    await LocalResourceService.saveLookup(normalizedUri, response, Date.now() + RESOURCE_LOOKUP_CACHE_TTL_MS);
    return response;
  }

  static async fetchStreamPage(params: TResourceStreamParams) {
    return await NexusResourceService.fetchStreamPage(params);
  }
}
