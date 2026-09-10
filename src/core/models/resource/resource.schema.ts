import type { NexusResourceTagsResponse } from '@/services/nexus/resource/resource.types';

export interface ResourceLookupCacheModelSchema {
  id: string;
  response: NexusResourceTagsResponse | null;
  expires_at: number;
}

export const resourceLookupCacheTableSchema = '&id, expires_at';
