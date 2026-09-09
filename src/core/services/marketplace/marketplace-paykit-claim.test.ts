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

vi.mock('@/services/homeserver/homeserver', () => ({
  HomeserverService: {
    generateAuthTokenFlow: () => ({
      authorizationUrl: 'pubkyauth:///?relay=http%3A%2F%2Flocalhost%2Finbox&secret=s',
      awaitToken: async () => ({ toBytes: () => new Uint8Array([1, 2, 3, 4]) }),
      cancelAuthFlow: vi.fn(),
    }),
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
});
