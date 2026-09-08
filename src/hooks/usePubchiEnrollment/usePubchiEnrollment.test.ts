import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientErrorCode, ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import type { OwnerBindingV1 } from '@/libs/pubchi/schemas';
import { usePubchiEnrollment } from './usePubchiEnrollment';
import { ENROLL_FORM_FIELDS } from './usePubchiEnrollment.types';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const ACTIVE: OwnerBindingV1 = {
  schema: 'pubchi-owner-binding',
  version: 1,
  owner: OWNER,
  bot: OWNER,
  status: 'active',
  created_at: 1,
  updated_at: 1,
};

const mocks = vi.hoisted(() => ({
  reconcile: vi.fn(),
  load: vi.fn(),
  create: vi.fn(),
  confirm: vi.fn(),
  remove: vi.fn(),
  devices: vi.fn(),
  toast: vi.fn(),
  getUrl: vi.fn(),
  adopt: vi.fn(),
  capabilities: [] as string[],
  owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    reconcileActiveBinding: (...args: unknown[]) => mocks.reconcile(...args),
    loadPubchi: (...args: unknown[]) => mocks.load(...args),
    createPubchi: (...args: unknown[]) => mocks.create(...args),
    confirmBackup: (...args: unknown[]) => mocks.confirm(...args),
    commitDeleteBinding: (...args: unknown[]) => mocks.remove(...args),
    listDeviceKeys: (...args: unknown[]) => mocks.devices(...args),
    revokeDevice: vi.fn(),
    revokeAllDevices: vi.fn(),
    getCapabilityApprovalUrl: (...args: unknown[]) => mocks.getUrl(...args),
    adoptCapabilityApproval: (...args: unknown[]) => mocks.adopt(...args),
  },
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/libs/pubchi/device-key', () => ({
  getCurrentDeviceKey: async () => undefined,
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (
    selector: (state: { currentUserPubky: string; session: { info: { capabilities: string[] } } }) => unknown,
  ) =>
    selector({
      currentUserPubky: mocks.owner,
      session: { info: { capabilities: mocks.capabilities } },
    }),
}));

describe('usePubchiEnrollment', () => {
  beforeEach(() => {
    mocks.reconcile.mockReset();
    mocks.load.mockReset().mockResolvedValue(undefined);
    mocks.create.mockReset();
    mocks.confirm.mockReset();
    mocks.remove.mockReset();
    mocks.devices.mockReset().mockResolvedValue([]);
    mocks.toast.mockReset();
    mocks.getUrl.mockReset();
    mocks.adopt.mockReset();
    mocks.capabilities = [];
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('reconciles the Dexie binding with the homeserver on load', async () => {
    mocks.reconcile.mockResolvedValue(ACTIVE);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => {
      expect(result.current.binding).toEqual(ACTIVE);
    });
    expect(mocks.reconcile).toHaveBeenCalledOnce();
  });

  it('loads the pointer before reconciling the local binding', async () => {
    const calls: string[] = [];
    mocks.load.mockImplementation(async () => {
      calls.push('load');
      return undefined;
    });
    mocks.reconcile.mockImplementation(async () => {
      calls.push('reconcile');
      return undefined;
    });
    renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce());
    expect(calls).toEqual(['load', 'reconcile']);
  });

  it('shows not enrolled when reconcile finds no homeserver object', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => {
      expect(result.current.binding).toBeUndefined();
    });
    expect(result.current.enabled).toBe(true);
  });

  it('handles initial load rejection without an unhandled promise', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.load.mockRejectedValue(new Error('unavailable'));
    renderHook(() => usePubchiEnrollment());
    await waitFor(() =>
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pubchi could not be loaded', variant: 'error' }),
      ),
    );
  });

  it('updates the binding after enroll', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'test phrase held only by this mock',
    });
    mocks.reconcile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(ACTIVE);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, 'Pubchi');
      await result.current.submit();
    });

    expect(result.current.binding).toEqual(ACTIVE);
  });

  it('reconciles an existing remote Pubchi when create returns PUBCHI_ALREADY_EXISTS', async () => {
    mocks.reconcile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(ACTIVE);
    mocks.create.mockRejectedValue(
      Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'test',
      }),
    );
    mocks.load.mockResolvedValueOnce(undefined).mockResolvedValueOnce({
      bot: OWNER,
      displayName: 'Remote Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
    });
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce());

    await act(async () => {
      await result.current.submit();
    });

    expect(result.current.pubchi).toMatchObject({ bot: OWNER, displayName: 'Remote Pubchi' });
    expect(result.current.binding).toEqual(ACTIVE);
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'You already have a Pubchi on this account. It is shown below.' }),
    );
  });

  it('handles a failed PUBCHI_ALREADY_EXISTS recovery without an unhandled rejection', async () => {
    mocks.reconcile.mockResolvedValueOnce(undefined).mockRejectedValueOnce(new Error('unavailable'));
    mocks.create.mockRejectedValue(
      Err.client(ClientErrorCode.CONFLICT, 'PUBCHI_ALREADY_EXISTS', {
        service: ErrorService.Pubchi,
        operation: 'test',
      }),
    );
    const unhandled = vi.fn();
    process.on('unhandledRejection', unhandled);
    try {
      const { result } = renderHook(() => usePubchiEnrollment());
      await waitFor(() => expect(mocks.reconcile).toHaveBeenCalledOnce());
      await act(async () => {
        await result.current.submit();
      });
      expect(mocks.toast).toHaveBeenCalledWith(
        expect.objectContaining({ title: 'Pubchi could not be loaded', variant: 'error' }),
      );
      await new Promise<void>((resolve) => queueMicrotask(resolve));
      expect(unhandled).not.toHaveBeenCalled();
    } finally {
      process.removeListener('unhandledRejection', unhandled);
    }
  });

  it('drops the phrase after three typed-word mismatches', async () => {
    mocks.reconcile.mockResolvedValueOnce(undefined).mockResolvedValueOnce(ACTIVE);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    });
    mocks.confirm.mockRejectedValue(
      Err.validation(ValidationErrorCode.INVALID_INPUT, 'SIGNATURE_INVALID', {
        service: ErrorService.Pubchi,
        operation: 'test',
      }),
    );
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    await act(async () => {
      await result.current.submit();
      result.current.openBackup();
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        result.current.backupForm.setValue('wordOne', 'wrong');
        result.current.backupForm.setValue('wordTwo', 'wrong');
        result.current.backupForm.setValue('wordThree', 'wrong');
        await result.current.confirmBackup();
      });
    }

    expect(result.current.backupOpen).toBe(false);
    expect(result.current.backupController.phraseForConfirmation()).toBeUndefined();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Too many mismatches. The recovery phrase has been cleared.' }),
    );
  });

  it('does not count transport errors toward the phrase lockout', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue({
      bot: OWNER,
      displayName: 'Pubchi',
      createdAt: 1,
      backupConfirmedAt: null,
      verified: true,
      phrase: 'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',
    });
    mocks.confirm.mockRejectedValue(new Error('homeserver unavailable'));
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    await act(async () => {
      await result.current.submit();
      result.current.openBackup();
    });

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await act(async () => {
        result.current.backupForm.setValue('wordOne', 'wrong');
        result.current.backupForm.setValue('wordTwo', 'wrong');
        result.current.backupForm.setValue('wordThree', 'wrong');
        await result.current.confirmBackup();
      });
    }

    expect(result.current.backupOpen).toBe(true);
    expect(result.current.backupController.phraseForConfirmation()).toBeDefined();
    expect(mocks.toast).toHaveBeenCalledWith(
      expect.objectContaining({ title: 'Could not verify the recovery phrase. Try again.' }),
    );
  });

  it('surfaces the schema message when create is submitted with an empty name', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    void result.current.form.formState.errors;
    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.DISPLAY_NAME, '');
      await expect(result.current.submit()).resolves.toBe(false);
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors[ENROLL_FORM_FIELDS.DISPLAY_NAME]?.message).toBe('Enter a name.');
  });

  it('does not ask a root /:rw session to re-approve Ring', async () => {
    mocks.capabilities = ['/:rw'];
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    expect(result.current.needsReapproval).toBe(false);
  });

  it('asks a Ring-default /pub/pubky.app/:rw session to re-approve', async () => {
    mocks.capabilities = ['/pub/pubky.app/:rw'];
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());
    expect(result.current.needsReapproval).toBe(true);
  });

  it('adopts a successful Ring approval via adoptCapabilityApproval', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockResolvedValue(undefined);
    const openSpy = vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
    });

    expect(openSpy).toHaveBeenCalledWith('pubkyauth://cap', '_blank', 'noopener,noreferrer');
    expect(mocks.adopt).toHaveBeenCalledWith(session);
    expect(cancel).toHaveBeenCalled();
  });

  it('adopts a narrower same-identity approval because it already replaced the browser cookie', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockResolvedValue(undefined);
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
    });

    expect(mocks.adopt).toHaveBeenCalledWith(session);
    expect(mocks.toast).not.toHaveBeenCalled();
  });

  it('clears degraded state after re-approving with Pubchi coverage', async () => {
    const session = { info: { publicKey: { z32: () => OWNER } } };
    const cancel = vi.fn();
    mocks.capabilities = ['/pub/pubky.app/:rw'];
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: Promise.resolve(session),
      cancelAuthFlow: cancel,
    });
    mocks.adopt.mockImplementation(async () => {
      mocks.capabilities = ['/pub/pubky.app/:rw', '/pub/pubchi.app/:rw'];
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result, rerender } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(result.current.needsReapproval).toBe(true));

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(true);
      rerender();
    });

    expect(result.current.needsReapproval).toBe(false);
    expect(cancel).toHaveBeenCalled();
  });

  it('calls cancel when the approval times out', async () => {
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockImplementation(async () => ({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise((_, reject) => {
        queueMicrotask(() => reject(new Error('Auth flow timed out after maximum attempts')));
      }),
      cancelAuthFlow: cancel,
    }));
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      await expect(result.current.reapprove()).resolves.toBe(false);
    });

    expect(cancel).toHaveBeenCalled();
    expect(mocks.adopt).not.toHaveBeenCalled();
  });

  it('calls cancel when the in-flight approval is declined', async () => {
    const cancel = vi.fn();
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.getUrl.mockResolvedValue({
      authorizationUrl: 'pubkyauth://cap',
      awaitApproval: new Promise(() => {}),
      cancelAuthFlow: cancel,
    });
    vi.spyOn(window, 'open').mockReturnValue(null);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    act(() => {
      void result.current.reapprove();
    });
    await waitFor(() => expect(mocks.getUrl).toHaveBeenCalled());

    act(() => {
      result.current.cancelReapproval();
    });
    expect(cancel).toHaveBeenCalled();
    expect(mocks.adopt).not.toHaveBeenCalled();
  });
});
