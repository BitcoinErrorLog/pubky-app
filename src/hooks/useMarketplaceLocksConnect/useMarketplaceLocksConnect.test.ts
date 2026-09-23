import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  LOCKS_CONNECT_CALLBACK_TYPE,
  LOCKS_CONNECT_USER_ERROR,
  useMarketplaceLocksConnect,
} from './useMarketplaceLocksConnect';

const PUBKY = 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco';
const LOCKS_ORIGIN = 'https://locks.example.com';

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return {
    ...actual,
    getLocksUrl: () => LOCKS_ORIGIN,
  };
});

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    createLocksFrontendSession: vi.fn(),
    getLocksCreatorAuthorityStatus: vi.fn(),
    restoreLocksFrontendSession: vi.fn(),
    clearLocksFrontendSession: vi.fn(),
  },
}));

const mockedController = vi.mocked(CommerceController);

function dispatchLocksCallback(source: WindowProxy, data: Record<string, unknown>) {
  window.dispatchEvent(
    new MessageEvent('message', {
      origin: LOCKS_ORIGIN,
      source,
      data,
    }),
  );
}

describe('useMarketplaceLocksConnect', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    useAuthStore.setState({ currentUserPubky: PUBKY });
    mockedController.restoreLocksFrontendSession.mockReturnValue(null);
    mockedController.createLocksFrontendSession.mockResolvedValue({
      session_token: 'session-token',
      creator: `pubky${PUBKY}`,
    });
    vi.spyOn(window, 'open');
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('opens the Lock Server iframe with postmessage delivery and never window.opens', () => {
    const { result } = renderHook(() => useMarketplaceLocksConnect());

    act(() => {
      result.current.openConnect();
    });

    expect(window.open).not.toHaveBeenCalled();
    expect(result.current.connectOpen).toBe(true);
    const url = new URL(result.current.connectUrl ?? '');
    expect(url.origin).toBe(LOCKS_ORIGIN);
    expect(url.pathname).toBe('/connect');
    expect(url.searchParams.get('delivery')).toBe('postmessage');
    expect(url.searchParams.get('return_to')).toContain(window.location.origin);
    expect(url.searchParams.get('state')).toMatch(/^[0-9a-f]{32}$/);
  });

  it('exchanges a matching postmessage callback without a manual complete button', async () => {
    const { result } = renderHook(() => useMarketplaceLocksConnect());
    const source = {} as WindowProxy;

    act(() => {
      result.current.openConnect();
    });
    const state = new URL(result.current.connectUrl ?? '').searchParams.get('state');
    act(() => {
      result.current.setConnectIframe({ contentWindow: source } as HTMLIFrameElement);
    });

    await act(async () => {
      dispatchLocksCallback(source, { type: LOCKS_CONNECT_CALLBACK_TYPE, state, code: 'one-time-code' });
    });

    await waitFor(() => expect(result.current.connectedCreator).toBe(PUBKY));
    expect(mockedController.createLocksFrontendSession).toHaveBeenCalledWith('one-time-code', state, PUBKY);
    expect(result.current.connectOpen).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('shows a plain-language error for a Lock Server callback failure, never raw JSON', async () => {
    const { result } = renderHook(() => useMarketplaceLocksConnect());
    const source = {} as WindowProxy;

    act(() => {
      result.current.openConnect();
    });
    act(() => {
      result.current.setConnectIframe({ contentWindow: source } as HTMLIFrameElement);
    });

    await act(async () => {
      dispatchLocksCallback(source, {
        type: LOCKS_CONNECT_CALLBACK_TYPE,
        error: 'connect-failed-404',
      });
    });

    expect(result.current.error).toBe(LOCKS_CONNECT_USER_ERROR);
    expect(result.current.error).not.toMatch(/creator_connect_flow_unavailable|connect-failed-404|\{/);
    expect(mockedController.createLocksFrontendSession).not.toHaveBeenCalled();
  });

  it('restores a persisted connection after reload when the Lock Server still authorizes it', async () => {
    mockedController.restoreLocksFrontendSession.mockReturnValue({
      token: 'session-token',
      creator: `pubky${PUBKY}`,
      pubky: PUBKY,
    });
    mockedController.getLocksCreatorAuthorityStatus.mockResolvedValue({
      creator: `pubky${PUBKY}`,
      authorized: true,
    });

    const { result } = renderHook(() => useMarketplaceLocksConnect());

    await waitFor(() => expect(result.current.connectedCreator).toBe(PUBKY));
    expect(mockedController.getLocksCreatorAuthorityStatus).toHaveBeenCalledWith('session-token');
  });

  it('drops a persisted connection the Lock Server no longer accepts', async () => {
    mockedController.restoreLocksFrontendSession.mockReturnValue({
      token: 'session-token',
      creator: `pubky${PUBKY}`,
      pubky: PUBKY,
    });
    mockedController.getLocksCreatorAuthorityStatus.mockRejectedValue(new Error('gone'));

    const { result } = renderHook(() => useMarketplaceLocksConnect());

    await waitFor(() => expect(mockedController.clearLocksFrontendSession).toHaveBeenCalled());
    expect(result.current.connectedCreator).toBeNull();
  });

  it('drops a persisted connection when authority-status reports unauthorized', async () => {
    mockedController.restoreLocksFrontendSession.mockReturnValue({
      token: 'session-token',
      creator: `pubky${PUBKY}`,
      pubky: PUBKY,
    });
    mockedController.getLocksCreatorAuthorityStatus.mockResolvedValue({
      creator: `pubky${PUBKY}`,
      authorized: false,
    });

    const { result } = renderHook(() => useMarketplaceLocksConnect());

    await waitFor(() => expect(mockedController.clearLocksFrontendSession).toHaveBeenCalled());
    expect(result.current.connectedCreator).toBeNull();
  });

  it('ignores a callback from the wrong origin or a mismatched state', async () => {
    const { result } = renderHook(() => useMarketplaceLocksConnect());
    const source = {} as WindowProxy;

    act(() => {
      result.current.openConnect();
    });
    const state = new URL(result.current.connectUrl ?? '').searchParams.get('state');
    act(() => {
      result.current.setConnectIframe({ contentWindow: source } as HTMLIFrameElement);
    });

    await act(async () => {
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://evil.example',
          source,
          data: { type: LOCKS_CONNECT_CALLBACK_TYPE, state, code: 'stolen' },
        }),
      );
      dispatchLocksCallback(source, { type: LOCKS_CONNECT_CALLBACK_TYPE, state: 'other', code: 'one-time-code' });
    });

    expect(mockedController.createLocksFrontendSession).not.toHaveBeenCalled();
    expect(result.current.connectedCreator).toBeNull();
    expect(result.current.error).toBe(LOCKS_CONNECT_USER_ERROR);
  });
});
