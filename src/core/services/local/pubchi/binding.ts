import { getPubchiDatabase } from '@/database/pubchi/pubchi';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { bindingRecordId, type PubchiBindingRecord } from '@/models/pubchi/binding.schema';

export class LocalPubchiBindingService {
  private constructor() {}

  static async upsert(record: PubchiBindingRecord): Promise<PubchiBindingRecord> {
    try {
      const db = getPubchiDatabase();
      await db.bindings.put(record);
      return record;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.WRITE_FAILED, 'Failed to persist Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'upsert',
        cause: error,
      });
    }
  }

  static async readActive(owner: string): Promise<PubchiBindingRecord | undefined> {
    try {
      const db = getPubchiDatabase();
      const matches = await db.bindings.where('owner').equals(owner).toArray();
      return matches.find((row) => row.status === 'active');
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'readActive',
        cause: error,
      });
    }
  }

  static async read(owner: string, bot: string): Promise<PubchiBindingRecord | undefined> {
    try {
      const db = getPubchiDatabase();
      return await db.bindings.get(bindingRecordId(owner, bot));
    } catch (error) {
      throw Err.database(DatabaseErrorCode.QUERY_FAILED, 'Failed to read Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'read',
        cause: error,
      });
    }
  }

  static async delete(owner: string, bot: string): Promise<void> {
    try {
      const db = getPubchiDatabase();
      await db.bindings.delete(bindingRecordId(owner, bot));
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete Pubchi binding', {
        service: ErrorService.Pubchi,
        operation: 'delete',
        cause: error,
      });
    }
  }

  static async deleteNotOwnedBy(owner: string): Promise<number> {
    try {
      const db = getPubchiDatabase();
      const foreign = (await db.bindings.toArray()).filter((row) => row.owner !== owner);
      await Promise.all(foreign.map((row) => db.bindings.delete(row.id)));
      return foreign.length;
    } catch (error) {
      throw Err.database(DatabaseErrorCode.DELETE_FAILED, 'Failed to delete foreign Pubchi bindings', {
        service: ErrorService.Pubchi,
        operation: 'deleteNotOwnedBy',
        cause: error,
      });
    }
  }
}
