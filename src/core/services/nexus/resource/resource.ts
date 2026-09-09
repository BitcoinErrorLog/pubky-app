import {
  RESOURCE_DISCOVERY_APP,
  RESOURCE_DISCOVERY_LIMIT,
  RESOURCE_STREAM_TAGS_PREVIEW,
  RESOURCE_TAGS_LIMIT,
} from '@/config/nexus';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { resourceApi } from './resource.api';
import type {
  NexusResource,
  NexusResourcePage,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
  TResourceStreamParams,
} from './resource.types';

export class NexusResourceService {
  private constructor() {}

  static async fetchByTag(params: TResourcesByTagParams): Promise<NexusResource[]> {
    return await queryNexus<NexusResource[]>({
      url: resourceApi.byTag({
        ...params,
        limit: params.limit ?? RESOURCE_DISCOVERY_LIMIT,
        limit_tags: RESOURCE_STREAM_TAGS_PREVIEW,
      }),
    });
  }

  static async fetchById(params: TResourceByIdParams): Promise<NexusResourceTagsResponse> {
    return await queryNexus<NexusResourceTagsResponse>({
      url: resourceApi.byId({ ...params, limit_tags: RESOURCE_TAGS_LIMIT, skip_tags: 0 }),
      retry: false,
    });
  }

  static async fetchByUri(params: TResourceByUriParams): Promise<NexusResourceTagsResponse> {
    return await queryNexus<NexusResourceTagsResponse>({
      url: resourceApi.byUri({ ...params, limit_tags: RESOURCE_TAGS_LIMIT, skip_tags: 0 }),
      retry: false,
    });
  }

  static async fetchStreamPage(params: TResourceStreamParams): Promise<NexusResourcePage> {
    const resources = await queryNexus<NexusResource[]>({
      url: resourceApi.stream({
        ...params,
        app: RESOURCE_DISCOVERY_APP,
        limit: params.limit ?? RESOURCE_DISCOVERY_LIMIT,
        limit_tags: RESOURCE_STREAM_TAGS_PREVIEW,
      }),
    });
    const limit = params.limit ?? RESOURCE_DISCOVERY_LIMIT;
    const skip = params.skip ?? 0;
    return { resources, nextSkip: resources.length === limit ? skip + resources.length : null };
  }
}
