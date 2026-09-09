import { ResourceApplication } from '@/application/resource/resource';
import type {
  NexusResource,
  NexusResourceKeyStream,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourceStreamParams,
  TResourcesByTagParams,
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

  static async fetchStream(params: TResourceStreamParams): Promise<NexusResource[]> {
    return await ResourceApplication.fetchStream(params);
  }

  static async fetchStreamIds(params: TResourceStreamParams): Promise<NexusResourceKeyStream> {
    return await ResourceApplication.fetchStreamIds(params);
  }

  static async fetchStreamPage(params: TResourceStreamParams) {
    return await ResourceApplication.fetchStreamPage(params);
  }
}
