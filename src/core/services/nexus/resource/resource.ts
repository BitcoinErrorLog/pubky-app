import { RESOURCE_TAGS_LIMIT } from '@/config/nexus';
import { httpResponseToError, safeFetch } from '@/libs/error/error.http';
import { ErrorService } from '@/libs/error/error.types';
import { parseResponseOrThrow } from '@/libs/http/response.utils';
import { createFetchOptions } from '@/services/nexus/nexus.utils';
import { resourceApi } from './resource.api';
import type {
  NexusResource,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
} from './resource.types';

/** Allows cold public-staging Nexus reads while keeping hung resource requests bounded. */
const RESOURCE_READ_TIMEOUT_MS = 8_000;

export class NexusResourceService {
  private constructor() {}

  static async fetchByTag(params: TResourcesByTagParams): Promise<NexusResource[]> {
    // Nexus fixes stream items at 5 tags; the full set is available on the detail read.
    return await fetchResource<NexusResource[]>(resourceApi.byTag(params));
  }

  static async fetchById(params: TResourceByIdParams): Promise<NexusResourceTagsResponse> {
    return await fetchResource<NexusResourceTagsResponse>(
      resourceApi.byId({ ...params, limit_tags: RESOURCE_TAGS_LIMIT, skip_tags: 0 }),
    );
  }

  static async fetchByUri(params: TResourceByUriParams): Promise<NexusResourceTagsResponse> {
    return await fetchResource<NexusResourceTagsResponse>(
      resourceApi.byUri({ ...params, limit_tags: RESOURCE_TAGS_LIMIT, skip_tags: 0 }),
    );
  }
}

async function fetchResource<T>(url: string): Promise<T> {
  const response = await safeFetch(
    url,
    { ...createFetchOptions(), signal: AbortSignal.timeout(RESOURCE_READ_TIMEOUT_MS) },
    ErrorService.Nexus,
    'fetchNexusResource',
  );
  if (!response.ok) {
    throw httpResponseToError(response, ErrorService.Nexus, 'fetchNexusResource', url);
  }
  return parseResponseOrThrow<T>(response, ErrorService.Nexus, 'fetchNexusResource', url);
}
