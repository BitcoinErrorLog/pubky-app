import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { encodeBase58Check } from '@/libs/commerce/payment-methods';
import { Logger } from '@/libs/logger/logger';
import { deriveBip84Account } from '@/test-utils/bip84';
import { MarketplacePaykitClaimService } from './marketplace-paykit-claim';

/** A public BIP39 vector mnemonic whose accounts are NOT deny-listed. */
const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
/** The BIP39 mnemonic behind the published BIP84 account-0 mainnet vector. */
const BIP84_TEST_MNEMONIC =
  'abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';

const CLAIMED_BODY = {
  status: 'claimed',
  creator: 'pubkygy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
  key_fingerprint: 'deadbeefdeadbeef',
  first_derived_address: 'bc1qexample',
  next_child_index: 0,
  stack_id: 'proof:3f6f4b2a-0000-4000-8000-000000000000',
};

/** Mutable paykit setup URL the config mock serves (reset per test). */
const runtimeMock = vi.hoisted(() => ({ paykitSetupUrl: 'http://localhost:3102/setup' }));
vi.mock('@/config/commerce', () => ({
  getPaykitSetupUrl: () => runtimeMock.paykitSetupUrl,
}));

/** Counts auth-token flows built, so refusal paths can prove none was. */
const tokenFlowCalls = vi.hoisted(() => ({ count: 0 }));
vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    generateAuthTokenFlow: () => {
      tokenFlowCalls.count += 1;
      return {
        authorizationUrl: 'pubkyauth:///?relay=http%3A%2F%2Flocalhost%2Finbox&secret=s',
        awaitToken: async () => ({ toBytes: () => new Uint8Array([1, 2, 3, 4]) }),
        cancelAuthFlow: vi.fn(),
      };
    },
  },
}));

function claimedResponse(accountIndex: number): Response {
  return new Response(JSON.stringify({ ...CLAIMED_BODY, account_index: accountIndex }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function refusalResponse(status: number, code: string): Response {
  return new Response(JSON.stringify({ error: { code, message: 'server-side detail' } }), {
    status,
    headers: { 'content-type': 'application/json' },
  });
}

/** Run one claim and return the parsed JSON body the service POSTed. */
async function claimAndReadRequestBody(accountXpub: string, accountIndex: number) {
  vi.mocked(fetch).mockResolvedValueOnce(claimedResponse(accountIndex));
  const flow = MarketplacePaykitClaimService.beginClaimFlow(accountXpub, accountIndex);
  const result = await flow.awaitClaim();
  expect(fetch).toHaveBeenCalledTimes(1);
  const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
  expect(url).toBe('http://localhost:3102/v0/accounts/claim');
  expect(result.accountIndex).toBe(accountIndex);
  return JSON.parse(init.body as string) as { account_xpub: string; account_index: number };
}

describe('MarketplacePaykitClaimService', () => {
  beforeEach(() => {
    vi.mocked(fetch).mockReset();
    runtimeMock.paykitSetupUrl = 'http://localhost:3102/setup';
    tokenFlowCalls.count = 0;
    // Err factories log; keep expected refusal logs out of the test output.
    vi.spyOn(Logger, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('sends the account index the key declares: an account-1 tpub claims with account_index 1', async () => {
    const tpub = encodeBase58Check(deriveBip84Account(MNEMONIC, 1, 1).payload);
    const body = await claimAndReadRequestBody(tpub, 1);
    expect(body.account_xpub).toBe(tpub);
    expect(body.account_index).toBe(1);
  });

  it('sends account_index 99 for the account-99 key (the top of the accepted range)', async () => {
    const tpub = encodeBase58Check(deriveBip84Account(MNEMONIC, 1, 99).payload);
    const body = await claimAndReadRequestBody(tpub, 99);
    expect(body.account_index).toBe(99);
  });

  it('positive vector: the published BIP84 account-0 mainnet key still sends account_index 0', async () => {
    const xpub = encodeBase58Check(deriveBip84Account(BIP84_TEST_MNEMONIC, 0, 0).payload);
    const body = await claimAndReadRequestBody(xpub, 0);
    expect(body.account_index).toBe(0);
  });

  it('maps account_index_out_of_range to the static user-facing refusal', async () => {
    const tpub = encodeBase58Check(deriveBip84Account(MNEMONIC, 1, 1).payload);
    vi.mocked(fetch).mockResolvedValueOnce(refusalResponse(422, 'account_index_out_of_range'));

    const flow = MarketplacePaykitClaimService.beginClaimFlow(tpub, 1);
    await expect(flow.awaitClaim()).rejects.toMatchObject({
      message: 'This account index is outside the range Shop accepts (0–99).',
    });
  });

  it('maps key_claimed_by_other_seller to the static user-facing refusal', async () => {
    const tpub = encodeBase58Check(deriveBip84Account(MNEMONIC, 1, 1).payload);
    vi.mocked(fetch).mockResolvedValueOnce(refusalResponse(409, 'key_claimed_by_other_seller'));

    const flow = MarketplacePaykitClaimService.beginClaimFlow(tpub, 1);
    await expect(flow.awaitClaim()).rejects.toMatchObject({
      message: 'This key is already claimed by another seller on this stack.',
    });
  });

  describe('insecure paykit origin (W1.8 F1: fail closed before any token or fetch)', () => {
    const PUBKY = 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco';
    const tpub = encodeBase58Check(deriveBip84Account(MNEMONIC, 1, 1).payload);

    it('refuses an http:// non-loopback origin before any token is built or fetch is sent', () => {
      runtimeMock.paykitSetupUrl = 'http://paykit.example/setup';

      expect(() => MarketplacePaykitClaimService.beginClaimFlow(tpub, 1)).toThrow(
        expect.objectContaining({
          message:
            'The Paykit server address is not a secure HTTPS origin, so Shop refused to send your approval to it. Contact the operator.',
          context: { reason: 'paykit_origin_insecure' },
        }),
      );
      // No claim token was ever built, and nothing was sent.
      expect(tokenFlowCalls.count).toBe(0);
      expect(fetch).not.toHaveBeenCalled();
    });

    it('refuses the Ring status flow the same way — no token built, no fetch sent', async () => {
      runtimeMock.paykitSetupUrl = 'http://paykit.example/setup';

      expect(() => MarketplacePaykitClaimService.beginClaimStatusFlow(PUBKY)).toThrow(
        expect.objectContaining({ context: { reason: 'paykit_origin_insecure' } }),
      );
      expect(tokenFlowCalls.count).toBe(0);

      // The authenticated status probe fails closed as `refused` too.
      const result = await MarketplacePaykitClaimService.fetchOwnClaimStatus(PUBKY, new Uint8Array([1, 2, 3, 4]));
      expect(result).toEqual({ ok: false, reason: 'refused' });
      expect(fetch).not.toHaveBeenCalled();
    });

    it.each(['http://localhost:3102/setup', 'http://127.0.0.1:3102/setup', 'http://[::1]:3102/setup'])(
      'allows the loopback dev origin %s',
      async (setupUrl) => {
        runtimeMock.paykitSetupUrl = setupUrl;
        vi.mocked(fetch).mockResolvedValueOnce(claimedResponse(1));

        const flow = MarketplacePaykitClaimService.beginClaimFlow(tpub, 1);
        await flow.awaitClaim();

        expect(tokenFlowCalls.count).toBe(1);
        expect(fetch).toHaveBeenCalledTimes(1);
        const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
        expect(url).toBe(`${new URL(setupUrl).origin}/v0/accounts/claim`);
      },
    );

    it('allows an https:// origin', async () => {
      runtimeMock.paykitSetupUrl = 'https://paykit.example/setup';
      vi.mocked(fetch).mockResolvedValueOnce(claimedResponse(1));

      const flow = MarketplacePaykitClaimService.beginClaimFlow(tpub, 1);
      await flow.awaitClaim();

      expect(tokenFlowCalls.count).toBe(1);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe('https://paykit.example/v0/accounts/claim');
    });
  });

  describe('fetchOwnClaimStatus (authenticated status read)', () => {
    const PUBKY = 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco';

    const STATUS_BODY = {
      creator: `pubky${PUBKY}`,
      allocation_mode: 'shared_manual',
      claim_channel: 'manual',
      downgrade_reason: null,
      key_fingerprint: 'deadbeefdeadbeef',
      first_derived_address: 'bc1qexample',
      evidence: [],
    };

    function statusResponse(status: number, body: unknown): Response {
      return new Response(JSON.stringify(body), {
        status,
        headers: { 'content-type': 'application/json' },
      });
    }

    it('sends the claim-scoped token as a Bearer credential and parses the 200 body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(statusResponse(200, STATUS_BODY));
      const flow = MarketplacePaykitClaimService.beginClaimStatusFlow(PUBKY);
      const result = await flow.awaitStatus();

      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = vi.mocked(fetch).mock.calls[0] as [string, RequestInit];
      expect(url).toBe(`http://localhost:3102/v0/accounts/pubky${PUBKY}/status`);
      // base64url-no-pad of the fixture token bytes [1,2,3,4].
      expect((init.headers as Record<string, string>).authorization).toBe('Bearer AQIDBA');
      expect(result).toEqual({
        ok: true,
        status: {
          allocationMode: 'shared_manual',
          claimChannel: 'manual',
          downgradeReason: null,
          keyFingerprint: 'deadbeefdeadbeef',
          firstDerivedAddress: 'bc1qexample',
        },
      });
    });

    it('ignores unknown extra fields in the 200 body', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(
        statusResponse(200, { ...STATUS_BODY, future_field: { nested: true }, another: 42 }),
      );
      const result = await MarketplacePaykitClaimService.fetchOwnClaimStatus(PUBKY, new Uint8Array([1, 2, 3, 4]));
      expect(result).toMatchObject({ ok: true });
    });

    it('refuses a 200 body missing a required field (fail closed on parse)', async () => {
      const { key_fingerprint: _omitted, ...missingFingerprint } = STATUS_BODY;
      vi.mocked(fetch).mockResolvedValueOnce(statusResponse(200, missingFingerprint));
      const result = await MarketplacePaykitClaimService.fetchOwnClaimStatus(PUBKY, new Uint8Array([1, 2, 3, 4]));
      expect(result).toEqual({ ok: false, reason: 'refused' });
    });

    it.each([401, 403, 500, 503])('fails closed with refused on a %i response', async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(statusResponse(status, { error: { code: 'x', message: 'y' } }));
      const result = await MarketplacePaykitClaimService.fetchOwnClaimStatus(PUBKY, new Uint8Array([1, 2, 3, 4]));
      expect(result).toEqual({ ok: false, reason: 'refused' });
    });

    it('maps 404 to not_deployed (a server predating W1.13 has no such route)', async () => {
      vi.mocked(fetch).mockResolvedValueOnce(statusResponse(404, { error: { code: 'not_found', message: 'y' } }));
      const result = await MarketplacePaykitClaimService.fetchOwnClaimStatus(PUBKY, new Uint8Array([1, 2, 3, 4]));
      expect(result).toEqual({ ok: false, reason: 'not_deployed' });
    });

    it('fails closed with refused on a network failure', async () => {
      vi.mocked(fetch).mockRejectedValueOnce(new TypeError('fetch failed'));
      const result = await MarketplacePaykitClaimService.fetchOwnClaimStatus(PUBKY, new Uint8Array([1, 2, 3, 4]));
      expect(result).toEqual({ ok: false, reason: 'refused' });
    });
  });
});
