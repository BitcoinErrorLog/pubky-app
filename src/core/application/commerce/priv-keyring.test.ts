import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrivKeyring } from '@/libs/commerce/priv-envelope';
import type { MarketplacePrivKeysResult } from '@/libs/commerce/priv-keys';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';
import { MarketplaceSessionService } from '@/services/marketplace/marketplace-session';
import { CommerceApplication } from './commerce';
import { CommercePrivKeyringApplication } from './priv-keyring';

const OWNER = 'o'.repeat(52);
const OTHER = 'p'.repeat(52);

const config = vi.hoisted(() => ({ mode: 'transaction-service' as string }));
vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode };
});

const session = vi.hoisted(() => ({ pubky: null as string | null }));

function keyring(owner = OWNER): PrivKeyring {
  return {
    ownerPubky: owner,
    currentKeyId: 'a'.repeat(32),
    keys: [{ keyId: 'a'.repeat(32), key: new Uint8Array(32).fill(5) }],
  };
}

describe('CommercePrivKeyringApplication', () => {
  beforeEach(() => {
    config.mode = 'transaction-service';
    session.pubky = OWNER;
    vi.spyOn(MarketplaceSessionService, 'getActiveSession').mockImplementation(() =>
      session.pubky
        ? {
            token: 't',
            sessionId: 's',
            pubky: session.pubky,
            capabilities: '',
            expiresAt: '',
            expiresAtMs: 0,
            issuedAt: '',
          }
        : null,
    );
    CommercePrivKeyringApplication.clear();
  });

  afterEach(() => {
    CommercePrivKeyringApplication.clear();
    vi.restoreAllMocks();
  });

  it('reads the keys once and serves them from memory for the same owner', async () => {
    const read = vi
      .spyOn(MarketplaceGatewayService, 'getPrivKeys')
      .mockResolvedValue({ kind: 'keys', keyring: keyring() });
    const [first, second] = await Promise.all([
      CommercePrivKeyringApplication.get(OWNER),
      CommercePrivKeyringApplication.get(OWNER),
    ]);
    const third = await CommercePrivKeyringApplication.get(OWNER);
    expect(first.kind).toBe('keys');
    expect(second).toEqual(first);
    expect(third).toEqual(first);
    expect(read).toHaveBeenCalledOnce();
  });

  it('zeroes and drops the keys on sign-out teardown', async () => {
    const held = keyring();
    const read = vi.spyOn(MarketplaceGatewayService, 'getPrivKeys').mockResolvedValue({ kind: 'keys', keyring: held });
    await CommercePrivKeyringApplication.get(OWNER);

    CommerceApplication.clearMarketplaceSession();

    expect(Array.from(held.keys[0].key).every((byte) => byte === 0)).toBe(true);
    session.pubky = OWNER;
    read.mockResolvedValue({ kind: 'keys', keyring: keyring() });
    await CommercePrivKeyringApplication.get(OWNER);
    expect(read).toHaveBeenCalledTimes(2);
  });

  it('drops the keys when the marketplace session ends on its own', async () => {
    const held = keyring();
    vi.spyOn(MarketplaceGatewayService, 'getPrivKeys').mockResolvedValue({ kind: 'keys', keyring: held });
    vi.mocked(MarketplaceSessionService.getActiveSession).mockRestore();
    MarketplaceSessionService.establishClaimedGrantSession(
      {
        token: 'A'.repeat(43),
        pubky: OWNER,
        capabilities: '',
        expiresAt: new Date(Date.now() + 86_400_000).toISOString(),
      },
      OWNER,
    );
    await CommercePrivKeyringApplication.get(OWNER);
    expect(Array.from(held.keys[0].key).every((byte) => byte === 5)).toBe(true);

    MarketplaceSessionService.clearSession('rejected');
    await new Promise((resolve) => queueMicrotask(() => resolve(undefined)));

    expect(Array.from(held.keys[0].key).every((byte) => byte === 0)).toBe(true);
  });

  it('holds no keys for anyone but the marketplace session owner', async () => {
    const held = keyring();
    const read = vi.spyOn(MarketplaceGatewayService, 'getPrivKeys').mockResolvedValue({ kind: 'keys', keyring: held });
    await CommercePrivKeyringApplication.get(OWNER);

    session.pubky = OTHER;
    expect(await CommercePrivKeyringApplication.get(OWNER)).toEqual({ kind: 'needs_reauth' });
    expect(Array.from(held.keys[0].key).every((byte) => byte === 0)).toBe(true);
    session.pubky = null;
    expect(await CommercePrivKeyringApplication.get(OWNER)).toEqual({ kind: 'needs_reauth' });
    expect(read).toHaveBeenCalledOnce();
  });

  it('does not cache a refusal, so a re-approval is picked up on the next call', async () => {
    const read = vi
      .spyOn(MarketplaceGatewayService, 'getPrivKeys')
      .mockResolvedValueOnce({ kind: 'needs_reauth' })
      .mockResolvedValueOnce({ kind: 'unavailable' })
      .mockResolvedValueOnce({ kind: 'keys', keyring: keyring() });
    expect((await CommercePrivKeyringApplication.get(OWNER)).kind).toBe('needs_reauth');
    expect((await CommercePrivKeyringApplication.get(OWNER)).kind).toBe('unavailable');
    expect((await CommercePrivKeyringApplication.get(OWNER)).kind).toBe('keys');
    expect(read).toHaveBeenCalledTimes(3);
  });

  it('discards keys that arrive after a sign-out started', async () => {
    const held = keyring();
    let release: (value: MarketplacePrivKeysResult) => void = () => {};
    vi.spyOn(MarketplaceGatewayService, 'getPrivKeys').mockReturnValue(
      new Promise((resolve) => {
        release = resolve;
      }),
    );
    const pending = CommercePrivKeyringApplication.get(OWNER);
    CommercePrivKeyringApplication.clear();
    release({ kind: 'keys', keyring: held });

    expect(await pending).toEqual({ kind: 'needs_reauth' });
    expect(Array.from(held.keys[0].key).every((byte) => byte === 0)).toBe(true);
  });

  it('is unavailable outside the durable service', async () => {
    config.mode = 'sandbox';
    const read = vi.spyOn(MarketplaceGatewayService, 'getPrivKeys');
    expect(await CommercePrivKeyringApplication.get(OWNER)).toEqual({ kind: 'unavailable' });
    expect(read).not.toHaveBeenCalled();
  });
});
