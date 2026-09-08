import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  create: vi.fn(),
  remove: vi.fn(),
  devices: vi.fn(),
  toast: vi.fn(),
  capabilities: [] as string[],
  owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    reconcileActiveBinding: (...args: unknown[]) => mocks.reconcile(...args),
    commitCreateBinding: (...args: unknown[]) => mocks.create(...args),
    commitDeleteBinding: (...args: unknown[]) => mocks.remove(...args),
    listDeviceKeys: (...args: unknown[]) => mocks.devices(...args),
    revokeDevice: vi.fn(),
    revokeAllDevices: vi.fn(),
    getCapabilityApprovalUrl: vi.fn(),
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
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.devices.mockReset().mockResolvedValue([]);
    mocks.toast.mockReset();
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

  it('shows not enrolled when reconcile finds no homeserver object', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => {
      expect(result.current.binding).toBeUndefined();
    });
    expect(result.current.enabled).toBe(true);
  });

  it('updates the binding after enroll', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    mocks.create.mockResolvedValue(ACTIVE);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.BOT, OWNER);
      await result.current.submit();
    });

    expect(result.current.binding).toEqual(ACTIVE);
  });

  it('surfaces the schema message when enroll is submitted with an invalid bot', async () => {
    mocks.reconcile.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiEnrollment());
    await waitFor(() => expect(mocks.reconcile).toHaveBeenCalled());

    void result.current.form.formState.errors;
    await act(async () => {
      result.current.form.setValue(ENROLL_FORM_FIELDS.BOT, 'not-a-pubky');
      await expect(result.current.submit()).resolves.toBe(false);
    });

    expect(mocks.create).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors[ENROLL_FORM_FIELDS.BOT]?.message).toBe(
      'Enter a 52-character z-base-32 bot pubky.',
    );
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
});
