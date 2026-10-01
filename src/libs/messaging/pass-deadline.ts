import { TimeoutErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';

/** Longest one messaging sync pass may hold its slot (its lock, or the in-flight entry other callers join). */
export const MESSAGING_SYNC_PASS_TIMEOUT_MS = 60_000;

/**
 * Settles like `work`, or rejects with a timeout once `timeoutMs` passed,
 * after calling `onExpire`. Nothing can cancel `work` itself: `onExpire` is
 * where the caller tells it to stop at its next check.
 */
export async function withPassDeadline<T>(
  work: Promise<T>,
  options: { timeoutMs: number; operation: string; onExpire: () => void },
): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      options.onExpire();
      reject(
        Err.timeout(
          TimeoutErrorCode.REQUEST_TIMEOUT,
          'Syncing private messages took too long. The next pass retries.',
          {
            service: ErrorService.Paykit,
            operation: options.operation,
            context: { timeoutMs: options.timeoutMs },
          },
        ),
      );
    }, options.timeoutMs);
  });
  try {
    return await Promise.race([work, deadline]);
  } finally {
    clearTimeout(timer);
  }
}
