import { ResourceApplication } from '@/application/resource/resource';
import type {
  Resource,
  ResourceByIdParams,
  ResourceByUriParams,
  ResourcePage,
  ResourcesByTagParams,
  ResourceStreamParams,
  ResourceTagsResponse,
} from '@/models/resource/resource';

export class ResourceController {
  private constructor() {}

  static async fetchByTag(params: ResourcesByTagParams): Promise<Resource[]> {
    return await ResourceApplication.fetchByTag(params);
  }

  static async fetchById(params: ResourceByIdParams): Promise<ResourceTagsResponse> {
    return await ResourceApplication.fetchById(params);
  }

  static async fetchByUri(params: ResourceByUriParams): Promise<ResourceTagsResponse> {
    return await ResourceApplication.fetchByUri(params);
  }

  static async getOrFetchByUri(uri: string): Promise<ResourceTagsResponse | null> {
    return await ResourceApplication.getOrFetchByUri(uri);
  }

  static async fetchStreamPage(params: ResourceStreamParams): Promise<ResourcePage> {
    return await ResourceApplication.fetchStreamPage(params);
  }
}
