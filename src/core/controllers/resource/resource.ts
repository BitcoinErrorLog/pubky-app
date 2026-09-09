import { ResourceApplication } from '@/application/resource/resource';
import type {
  NexusResource,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
  TResourceStreamParams,
} from '@/services/nexus/resource/resource.types';

export class ResourceController {
  private constructor() {}

  static async fetchByTag(params: TResourcesByTagParams): Promise<NexusResource[]> {
    return await ResourceApplication.fetchByTag(params);
  }

  static async fetchById(params: TResourceByIdParams): Promise<NexusResourceTagsResponse> {
    return await ResourceApplication.fetchById(params);
  }

  static async fetchByUri(params: TResourceByUriParams): Promise<NexusResourceTagsResponse> {
    return await ResourceApplication.fetchByUri(params);
  }

  static async fetchStreamPage(params: TResourceStreamParams) {
    return await ResourceApplication.fetchStreamPage(params);
  }
}
