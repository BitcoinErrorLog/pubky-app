import { queryNexus } from '@/services/nexus/nexus.utils';
import { resourceApi } from './resource.api';
import type {
  NexusResource,
  NexusResourceTagsResponse,
  TResourceByIdParams,
  TResourceByUriParams,
  TResourcesByTagParams,
} from './resource.types';

export class NexusResourceService {
  private constructor() {}

  static async fetchByTag(params: TResourcesByTagParams): Promise<NexusResource[]> {
    return await queryNexus<NexusResource[]>({ url: resourceApi.byTag(params) });
  }

  static async fetchById(params: TResourceByIdParams): Promise<NexusResourceTagsResponse> {
    return await queryNexus<NexusResourceTagsResponse>({ url: resourceApi.byId(params) });
  }

  static async fetchByUri(params: TResourceByUriParams): Promise<NexusResourceTagsResponse> {
    return await queryNexus<NexusResourceTagsResponse>({ url: resourceApi.byUri(params) });
  }
}
