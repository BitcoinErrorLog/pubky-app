import type { AuthToken, Session } from '@synonymdev/pubky';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthApplication } from '@/application/auth/auth';
import { BootstrapApplication } from '@/application/bootstrap/bootstrap';
import { clearDatabase } from '@/database/franky/franky.helpers';
import { useMigrationStore } from '@/stores/migration/migration.store';
import { mockMigrationStore } from '@/test-utils/stores';
import { asOpaque } from '@/test-utils/type-assertions';
import { AuthController } from './auth';

vi.mock('@/database/franky/franky.helpers', () => ({
  clearDatabase: vi.fn(),
}));

vi.mock('pubky-app-specs', () => ({
  default: vi.fn(() => Promise.resolve()),
}));

const mockClearDatabase = vi.mocked(clearDatabase);

const mockToken = asOpaque<AuthToken>({
  toBytes: () => new Uint8Array([1, 2, 3]),
  publicKey: { z32: () => 'test-pubky' },
  capabilities: [],
});

const mockSession = asOpaque<Session>({
  info: { publicKey: { z32: () => 'test-pubky' } },
});

describe('AuthController single-approval ceremony', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    mockClearDatabase.mockReset();
    mockClearDatabase.mockResolvedValue(undefined);
    AuthController.resetSignInCeremonyGuard();
    AuthController.resetCleanupLocalStateGuard();
    vi.spyOn(BootstrapApplication, 'cancelModerationFollow').mockImplementation(() => {});
    vi.spyOn(useMigrationStore, 'getState').mockReturnValue(mockMigrationStore({ reset: vi.fn() }));
  });

  it('holds the in-flight guard through the POST window so re-entry does not clearDatabase', async () => {
    let resolveToken!: (token: AuthToken) => void;
    const awaitToken = () =>
      new Promise<AuthToken>((resolve) => {
        resolveToken = resolve;
      });
    let resolveCeremony!: (value: { session: Session; marketplace: null }) => void;
    const ceremony = new Promise<{ session: Session; marketplace: null }>((resolve) => {
      resolveCeremony = resolve;
    });

    const startSpy = vi.spyOn(AuthApplication, 'startDirectSignInFlow').mockReturnValue({
      authorizationUrl: 'https://example.com/auth?token=A',
      awaitToken,
      cancelAuthFlow: vi.fn(),
    });
    const completeSpy = vi.spyOn(AuthApplication, 'completeSingleApprovalCeremony').mockReturnValue(ceremony);

    const first = await AuthController.getAuthUrl();
    expect(mockClearDatabase).toHaveBeenCalledTimes(1);

    const approval = first.awaitApproval;
    resolveToken(mockToken);
    await vi.waitFor(() => expect(completeSpy).toHaveBeenCalledTimes(1));

    const second = await AuthController.getAuthUrl();
    expect(startSpy).toHaveBeenCalledTimes(1);
    expect(mockClearDatabase).toHaveBeenCalledTimes(1);
    expect(second.authorizationUrl).toBe(first.authorizationUrl);

    resolveCeremony({ session: mockSession, marketplace: null });
    await expect(approval).resolves.toBe(mockSession);
  });

  it('runs homeserver-then-marketplace exactly once for one approval', async () => {
    vi.spyOn(AuthApplication, 'startDirectSignInFlow').mockReturnValue({
      authorizationUrl: 'https://example.com/auth?token=A',
      awaitToken: async () => mockToken,
      cancelAuthFlow: vi.fn(),
    });
    const completeSpy = vi
      .spyOn(AuthApplication, 'completeSingleApprovalCeremony')
      .mockResolvedValue({ session: mockSession, marketplace: null });

    const { awaitApproval } = await AuthController.getAuthUrl();
    await awaitApproval;

    expect(completeSpy).toHaveBeenCalledTimes(1);
    expect(completeSpy).toHaveBeenCalledWith(mockToken);
  });
});
