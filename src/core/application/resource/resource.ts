import { isAppError, isNotFound } from '@/libs/error/error.utils';
import type {
  Resource,
  ResourceByIdParams,
  ResourceByUriParams,
  ResourcePage,
  ResourcesByTagParams,
  ResourceStreamParams,
  ResourceTagsResponse,
} from '@/models/resource/resource';
import { NexusResourceService } from '@/services/nexus/resource/resource';

export class ResourceApplication {
  private constructor() {}

  static async fetchByTag(params: ResourcesByTagParams): Promise<Resource[]> {
    return await NexusResourceService.fetchByTag(params);
  }

  static async fetchById(params: ResourceByIdParams): Promise<ResourceTagsResponse> {
    return await NexusResourceService.fetchById(params);
  }

  static async fetchByUri(params: ResourceByUriParams): Promise<ResourceTagsResponse> {
    return await NexusResourceService.fetchByUri(params);
  }

  static async getOrFetchByUri(uri: string): Promise<ResourceTagsResponse | null> {
    let response: ResourceTagsResponse | null = null;
    try {
      response = await NexusResourceService.fetchByUri({ uri });
    } catch (error) {
      if (!(isAppError(error) && isNotFound(error))) throw error;
    }
    return response;
  }

  static async fetchStreamPage(params: ResourceStreamParams): Promise<ResourcePage> {
    return await NexusResourceService.fetchStreamPage(params);
  }
}
