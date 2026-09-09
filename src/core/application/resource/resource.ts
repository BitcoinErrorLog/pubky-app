import { NexusResourceService } from '@/services/nexus/resource/resource';
import type {
  NexusResource,
  NexusResourceKeyStream,
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

  static async fetchStream(params: TResourceStreamParams): Promise<NexusResource[]> {
    return await NexusResourceService.fetchStream(params);
  }

  static async fetchStreamIds(params: TResourceStreamParams): Promise<NexusResourceKeyStream> {
    return await NexusResourceService.fetchStreamIds(params);
  }

  static async fetchStreamPage(params: TResourceStreamParams) {
    return await NexusResourceService.fetchStreamPage(params);
  }
}
