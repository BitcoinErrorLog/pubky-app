import { withCurrentWrappingKey } from '@/libs/crypto/messaging-keyring';
import { buildWrapAad, WRAP_VERSION_AES_GCM_256, wrapPayload } from '@/libs/crypto/secret-wrapping';
import { isAppError } from '@/libs/error/error';
import { DatabaseErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Logger } from '@/libs/logger/logger';
import type { AppDatabase } from './franky';

function sameBytes(a: Uint8Array, b: Uint8Array): boolean {
  return a.length === b.length && a.every((byte, index) => byte === b[index]);
}

/**
 * Data migration for DB version 4 → 5: wraps the two messaging key-material
 * columns (`commerce_messaging_receivers.noise_secret`,
 * `commerce_messaging_links.snapshot`) in place with AES-GCM-256 under the
 * non-extractable keyring key, AAD-bound to table + row id. The Dexie schema
 * itself is unchanged between those versions (the wrap format rides in the
 * existing `Uint8Array` columns plus the non-indexed `wrap_version` field),
 * so the bump only marks this data pass.
 *
 * IDEMPOTENT by construction: rows already at `wrap_version: 1` are skipped,
 * so a crash mid-pass simply resumes on the next run (see the versions-match
 * sweep in `runInitialize`). Runs BEFORE any messaging read can hand out a
 * legacy row in the upgraded build.
 *
 * FAIL CLOSED: any failure (WebCrypto/IDB unavailable, write error) throws —
 * an upgrade that cannot wrap must not continue with known-plaintext secrets.
 */
export async function migrateMessagingSecretsToWrappedStorage(database: AppDatabase): Promise<void> {
  const receivers = await database.commerce_messaging_receivers.toArray();
  const links = await database.commerce_messaging_links.toArray();
  const legacyReceivers = receivers.filter((row) => row.wrap_version !== WRAP_VERSION_AES_GCM_256);
  const legacyLinks = links.filter((row) => row.wrap_version !== WRAP_VERSION_AES_GCM_256);
  if (legacyReceivers.length === 0 && legacyLinks.length === 0) return;

  try {
    // Each row is wrapped and written under the key fence, like every other
    // write of wrapped state, so a sign-out in another tab cannot delete the
    // key between the two. Without Web Locks it runs anyway: no messaging
    // reader or writer runs anywhere then, and the upgrade must finish.
    for (const receiver of legacyReceivers) {
      await withCurrentWrappingKey(
        async (key) => {
          const wrapped = await wrapPayload(
            key,
            buildWrapAad('commerce_messaging_receivers', receiver.id),
            receiver.noise_secret,
          );
          // As for links below: another tab may have replaced this receiver
          // since it was read, and putting the older key back would leave the
          // published marker advertising a key the device no longer holds.
          await database.transaction('rw', database.commerce_messaging_receivers, async () => {
            const current = await database.commerce_messaging_receivers.get(receiver.id);
            if (!current || current.wrap_version === WRAP_VERSION_AES_GCM_256) return;
            if (!sameBytes(current.noise_secret, receiver.noise_secret)) return;
            await database.commerce_messaging_receivers.put({
              ...current,
              noise_secret: wrapped,
              wrap_version: WRAP_VERSION_AES_GCM_256,
            });
          });
        },
        { whenUnavailable: 'run' },
      );
    }
    for (const link of legacyLinks) {
      await withCurrentWrappingKey(
        async (key) => {
          const wrapped = await wrapPayload(key, buildWrapAad('commerce_messaging_links', link.id), link.snapshot);
          // Another tab may have saved a newer snapshot of this link since it
          // was read; putting the older one back would rewind its send counter.
          // The row is replaced only if it is still the one that was wrapped.
          await database.transaction('rw', database.commerce_messaging_links, async () => {
            const current = await database.commerce_messaging_links.get(link.id);
            if (!current || current.wrap_version === WRAP_VERSION_AES_GCM_256) return;
            if (!sameBytes(current.snapshot, link.snapshot)) return;
            await database.commerce_messaging_links.put({
              ...current,
              snapshot: wrapped,
              wrap_version: WRAP_VERSION_AES_GCM_256,
            });
          });
        },
        { whenUnavailable: 'run' },
      );
    }
    Logger.info('Wrapped legacy plaintext messaging secrets at rest (DB 4 → 5)', {
      receivers: legacyReceivers.length,
      links: legacyLinks.length,
    });
  } catch (error) {
    if (isAppError(error)) throw error;
    throw Err.database(
      DatabaseErrorCode.INIT_FAILED,
      'Failed to wrap legacy plaintext messaging secrets at rest; refusing to continue with them unencrypted.',
      { service: ErrorService.Local, operation: 'migrateMessagingSecretsToWrappedStorage', cause: error },
    );
  }
}
