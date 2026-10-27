import { describe, expect, it, vi } from 'vitest';
import { AuthErrorCode, NetworkErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { toast } from '@/molecules/Toaster/toast';
import { showTagWriteErrorToast } from './TaggedItem.utils';

vi.mock('@/molecules/Toaster/toast');

describe('showTagWriteErrorToast', () => {
  it('prompts sign-in for a write rejected as unauthenticated (#2890)', () => {
    for (const code of [AuthErrorCode.UNAUTHORIZED, AuthErrorCode.SESSION_EXPIRED]) {
      vi.mocked(toast).mockClear();
      showTagWriteErrorToast(
        Err.auth(code, 'Rejected', { service: ErrorService.Homeserver, operation: 'commitCreate' }),
        'Could not add tag',
      );
      expect(vi.mocked(toast)).toHaveBeenCalledTimes(1);
      expect(vi.mocked(toast)).toHaveBeenCalledWith({
        variant: 'error',
        description: 'Session expired. Please sign in.',
      });
    }
  });

  it('keeps the fallback copy for every other failure', () => {
    showTagWriteErrorToast(
      Err.network(NetworkErrorCode.CONNECTION_FAILED, 'Network error', {
        service: ErrorService.Homeserver,
        operation: 'commitCreate',
      }),
      'Could not remove tag',
    );
    showTagWriteErrorToast(new Error('plain'), 'Could not add tag');

    expect(vi.mocked(toast)).toHaveBeenNthCalledWith(1, { variant: 'error', description: 'Could not remove tag' });
    expect(vi.mocked(toast)).toHaveBeenNthCalledWith(2, { variant: 'error', description: 'Could not add tag' });
  });
});
