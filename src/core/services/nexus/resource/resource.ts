import { RESOURCE_TAGS_LIMIT } from '@/config/nexus';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { resourceApi } from './resource.api';
import type {
  NexusResource,
  NexusResourceKeyStream,
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
    return await queryNexus<NexusResource[]>({ url: resourceApi.byTag(params) });
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

  static async fetchStream(params: TResourceStreamParams): Promise<NexusResource[]> {
    return await queryNexus<NexusResource[]>({ url: resourceApi.stream(params) });
  }

  static async fetchStreamIds(params: TResourceStreamParams): Promise<NexusResourceKeyStream> {
    return await queryNexus<NexusResourceKeyStream>({ url: resourceApi.streamIds(params) });
  }

  static async fetchStreamPage(params: TResourceStreamParams): Promise<NexusResourcePage> {
    const keys = await this.fetchStreamIds(params);
    const resources = await Promise.all(
      keys.resource_ids.map(async (id) => {
        const result = await this.fetchById({ id });
        return {
          details: result.resource,
          tags: result.tags,
          taggers_count: result.tags.reduce((count, tag) => count + tag.taggers_count, 0),
        };
      }),
    );
    return { resources, lastScore: keys.last_score };
  }
}
