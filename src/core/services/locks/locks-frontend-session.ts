import { z } from 'zod';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';
import { Logger } from '@/libs/logger/logger';

/**
 * `localStorage` key for the Lock Server creator frontend session (see the
 * class docs for the storage contract).
 */
export const LOCKS_FRONTEND_SESSION_STORAGE_KEY = 'pubky.marketplace.locks-frontend-session.v1';

const storedSessionSchema = z.object({
  token: z.string().min(1).max(4_096),
  creator: z.string().min(1).max(128),
  pubky: commercePubkySchema,
});

export type LocksFrontendSessionRecord = z.infer<typeof storedSessionSchema>;

/**
 * Holds the Lock Server creator frontend session so Bitcoin Step 1 stays
 * Connected across reload. Same storage contract as the marketplace session:
 *
 *  - Written ONLY to `localStorage` under {@link LOCKS_FRONTEND_SESSION_STORAGE_KEY}.
 *  - Never IndexedDB, never cookies, never logged (the token is creator bearer).
 *  - Restore is account-scoped: {@link restore} drops the blob unless its pubky
 *    matches the signed-in Shop account. Sign-out and account switch funnel
 *    through `CommerceApplication.clearMarketplaceSession()`, which calls
 *    {@link clear}.
 *  - A restored token the Lock Server no longer accepts is dropped by the
 *    connect hook after `GET /creator/authority-status` fails.
 */
export class LocksFrontendSessionStore {
  private constructor() {}

  static save(record: LocksFrontendSessionRecord): void {
    const parsed = storedSessionSchema.safeParse(record);
    if (!parsed.success) return;
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY, JSON.stringify(parsed.data));
    } catch {
      Logger.warn('Could not persist the Lock Server connection; it will last until the next reload only.');
    }
  }

  static restore(expectedPubky: string): LocksFrontendSessionRecord | null {
    const raw = this.readStorage();
    if (raw === null) return null;
    let json: unknown;
    try {
      json = JSON.parse(raw);
    } catch {
      this.clear();
      return null;
    }
    const parsed = storedSessionSchema.safeParse(json);
    if (!parsed.success || parsed.data.pubky !== expectedPubky) {
      this.clear();
      return null;
    }
    return parsed.data;
  }

  static clear(): void {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY);
    } catch {
      // Removal failing means storage is unavailable, so nothing persisted either.
    }
  }

  private static readStorage(): string | null {
    if (typeof window === 'undefined') return null;
    try {
      return window.localStorage.getItem(LOCKS_FRONTEND_SESSION_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
