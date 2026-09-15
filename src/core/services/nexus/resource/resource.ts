import { RESOURCE_DISCOVERY_LIMIT, RESOURCE_TAGS_LIMIT } from '@/config/nexus';
import type { Resource, ResourcePage, ResourceTagsResponse } from '@/models/resource/resource';
import { queryNexus } from '@/services/nexus/nexus.utils';
import { resourceApi } from './resource.api';
import type {
  NexusResource,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
  TResourceStreamParams,
} from './resource.types';

export class NexusResourceService {
  private constructor() {}

  static async fetchByTag(params: TResourcesByTagParams): Promise<Resource[]> {
    const { tag, ...streamParams } = params;
    const page = await this.fetchStreamPage({
      ...streamParams,
      tags: tag,
    });
    return page.resources;
  }

  static async fetchById(params: TResourceByIdParams): Promise<ResourceTagsResponse> {
    const response = await queryNexus<NexusResourceTagsResponse>({
      url: resourceApi.byId({
        ...params,
        limit_tags: params.limit_tags ?? RESOURCE_TAGS_LIMIT,
        limit_taggers: params.limit_taggers ?? RESOURCE_TAGS_LIMIT,
        skip_tags: 0,
      }),
      retry: false,
    });
    return toResourceTagsResponse(response);
  }

  static async fetchByUri(params: TResourceByUriParams): Promise<ResourceTagsResponse> {
    const response = await queryNexus<NexusResourceTagsResponse>({
      url: resourceApi.byUri({
        ...params,
        limit_tags: params.limit_tags ?? RESOURCE_TAGS_LIMIT,
        limit_taggers: params.limit_taggers ?? RESOURCE_TAGS_LIMIT,
        skip_tags: 0,
      }),
      retry: false,
    });
    return toResourceTagsResponse(response);
  }

  static async fetchStreamPage(params: TResourceStreamParams): Promise<ResourcePage> {
    const resources = await queryNexus<NexusResource[]>({
      url: resourceApi.stream({
        ...params,
        limit: params.limit ?? RESOURCE_DISCOVERY_LIMIT,
        limit_tags: params.limit_tags ?? RESOURCE_TAGS_LIMIT,
        limit_taggers: params.limit_taggers ?? RESOURCE_TAGS_LIMIT,
      }),
    });
    const limit = params.limit ?? RESOURCE_DISCOVERY_LIMIT;
    const skip = params.skip ?? 0;
    return {
      resources: resources.map(toResource),
      nextSkip: resources.length === limit ? skip + resources.length : null,
    };
  }
}

function toResource(resource: NexusResource): Resource {
  return resource;
}

function toResourceTagsResponse(response: NexusResourceTagsResponse): ResourceTagsResponse {
  return response;
}
