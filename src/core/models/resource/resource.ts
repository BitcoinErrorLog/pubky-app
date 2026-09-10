import { Table } from 'dexie';
import { db } from '@/database/franky/franky';
import { RecordModelBase } from '@/models/shared/base/record/baseRecord';
import type { ResourceLookupCacheModelSchema } from './resource.schema';

export class ResourceLookupCacheModel
  extends RecordModelBase<string, ResourceLookupCacheModelSchema>
  implements ResourceLookupCacheModelSchema
{
  static table: Table<ResourceLookupCacheModelSchema> = db.table('resource_lookup_cache');

  response: ResourceLookupCacheModelSchema['response'];
  expires_at: number;

  constructor(data: ResourceLookupCacheModelSchema) {
    super(data);
    this.response = data.response;
    this.expires_at = data.expires_at;
  }
}
