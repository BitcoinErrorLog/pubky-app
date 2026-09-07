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

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

describe('usePubchiEnrollment', () => {
  beforeEach(() => {
    mocks.reconcile.mockReset();
    mocks.create.mockReset();
    mocks.remove.mockReset();
    mocks.devices.mockReset().mockResolvedValue([]);
    mocks.toast.mockReset();
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
});
