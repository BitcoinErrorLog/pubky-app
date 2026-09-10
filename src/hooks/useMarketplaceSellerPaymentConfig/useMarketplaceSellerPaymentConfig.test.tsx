import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { accountIndexFromBytes, accountKeyFingerprint, deriveBip84P2wpkhAddress } from '@/libs/commerce/bip84-preview';
import { encodeBase58Check, type SellerPaymentConfigOwnView } from '@/libs/commerce/payment-methods';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { BIP84_VERSION_BYTES, deriveBip84Account } from '@/test-utils/bip84';
import {
  BITCOIN_ENABLE_BLOCKED_COPY,
  CLAIM_REJECTION_COPY,
  CLAIM_VERIFICATION_COPY,
  useMarketplaceSellerPaymentConfig,
} from './useMarketplaceSellerPaymentConfig';

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMyPaymentConfig: vi.fn(),
    isOwnPaykitAccountClaimed: vi.fn(),
    getMyVerifiedPaykitClaim: vi.fn(),
    commitSaveVerifiedPaykitClaim: vi.fn(),
    putMyPaymentConfig: vi.fn(),
    beginPaykitClaimFlow: vi.fn(),
    beginPaykitClaimStatusFlow: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

const mockedController = vi.mocked(CommerceController);

const EMPTY_CONFIG: SellerPaymentConfigOwnView = {
  bitcoinEnabled: false,
  stripePaymentLink: null,
  paypalMerchantEmail: null,
  stripeRestrictedKeySet: false,
  updatedAt: '2026-08-22T12:00:00.000Z',
};

const MNEMONIC = 'legal winner thank year wave sausage worth useful legal winner thank yellow';
/** The seller the claim/verify flows are started as (the flow-start identity). */
const SELLER_PUBKY = 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco';
const ACCOUNT = deriveBip84Account(MNEMONIC, 0, 0);
const ACCOUNT_1 = deriveBip84Account(MNEMONIC, 0, 1);
const ACCOUNT_99 = deriveBip84Account(MNEMONIC, 0, 99);
const ACCOUNT_100 = deriveBip84Account(MNEMONIC, 0, 100);
/** The maximum hardened child number (2^31 − 1) — far outside 0–99. */
const ACCOUNT_MAX_HARDENED = deriveBip84Account(MNEMONIC, 0, 0x7fffffff);
const OTHER_ACCOUNT = deriveBip84Account(MNEMONIC, 0, 1);

function zpubFormOf(account: typeof ACCOUNT): string {
  const payload = new Uint8Array(account.payload);
  new DataView(payload.buffer).setUint32(0, BIP84_VERSION_BYTES.zpub, false);
  return encodeBase58Check(payload);
}

const PASTED_ZPUB = zpubFormOf(ACCOUNT);
const OTHER_ZPUB = zpubFormOf(OTHER_ACCOUNT);
const ZPUB_ACCOUNT_1 = zpubFormOf(ACCOUNT_1);
const ZPUB_ACCOUNT_99 = zpubFormOf(ACCOUNT_99);
const ZPUB_ACCOUNT_100 = zpubFormOf(ACCOUNT_100);
const ZPUB_ACCOUNT_MAX_HARDENED = zpubFormOf(ACCOUNT_MAX_HARDENED);
const NORMALIZED_XPUB = encodeBase58Check(ACCOUNT.payload);
const NORMALIZED_XPUB_1 = encodeBase58Check(ACCOUNT_1.payload);
const NORMALIZED_XPUB_99 = encodeBase58Check(ACCOUNT_99.payload);

const VERIFIED_CLAIM_RESULT = {
  creator: 'pubkygy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
  accountIndex: 0,
  keyFingerprint: accountKeyFingerprint(ACCOUNT.payload),
  firstDerivedAddress: deriveBip84P2wpkhAddress(ACCOUNT.payload, 'mainnet', 0),
  firstChildIndex: 0,
  nextChildIndex: 0,
  stackId: 'proof:3f6f4b2a-0000-4000-8000-000000000000',
  allocationMode: 'shared_manual',
  claimChannel: 'manual',
  downgradeReason: null,
};

/** The Dexie record a verified claim persists as (snake_case, one per seller). */
function storedClaimRecord(account: typeof ACCOUNT = ACCOUNT) {
  return {
    id: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
    owner_id: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
    xpub: encodeBase58Check(account.payload),
    key_fingerprint_hex: accountKeyFingerprint(account.payload),
    account_index: accountIndexFromBytes(account.payload),
    first_derived_address: deriveBip84P2wpkhAddress(account.payload, 'mainnet', 0),
    source: 'session_claim',
    verified_at: 1_756_000_000_000,
    first_child_index: 0,
    allocation_mode: 'shared_manual',
    claim_channel: 'manual',
    downgrade_reason: null,
  };
}

/**
 * A 200 status body matching the given account's key. `firstChildIndex` /
 * `nextChildIndex` default to the claim-time state (equal); the drift case
 * passes explicit coordinates.
 */
function matchingStatusOutcome(
  account: typeof ACCOUNT = ACCOUNT,
  coordinates: { firstChildIndex?: number; nextChildIndex?: number } = {},
) {
  const firstChildIndex = coordinates.firstChildIndex ?? 0;
  return {
    ok: true as const,
    status: {
      allocationMode: 'shared_manual',
      claimChannel: 'manual',
      downgradeReason: null,
      keyFingerprint: accountKeyFingerprint(account.payload),
      firstDerivedAddress: deriveBip84P2wpkhAddress(account.payload, 'mainnet', firstChildIndex),
      accountIndex: accountIndexFromBytes(account.payload),
      firstChildIndex,
      nextChildIndex: coordinates.nextChildIndex ?? firstChildIndex,
    },
  };
}

const BITCOIN_NETWORK_ENV = 'PUBKY_RUNTIME_BITCOIN_NETWORK';

async function renderPaymentConfig() {
  const view = renderHook(() => useMarketplaceSellerPaymentConfig());
  await waitFor(() => expect(view.result.current.isLoading).toBe(false));
  return view;
}

describe('useMarketplaceSellerPaymentConfig', () => {
  beforeEach(() => {
    process.env[BITCOIN_NETWORK_ENV] = 'mainnet';
    resetRuntimeConfigForTests();
    mockedController.getMyPaymentConfig.mockReset().mockResolvedValue(EMPTY_CONFIG);
    mockedController.isOwnPaykitAccountClaimed.mockReset().mockResolvedValue(false);
    mockedController.getMyVerifiedPaykitClaim.mockReset().mockResolvedValue(null);
    mockedController.commitSaveVerifiedPaykitClaim.mockReset().mockResolvedValue(undefined);
    mockedController.putMyPaymentConfig.mockReset().mockImplementation(async (input) => ({
      bitcoinEnabled: input.bitcoinEnabled,
      stripePaymentLink: input.stripePaymentLink,
      paypalMerchantEmail: input.paypalMerchantEmail,
      stripeRestrictedKeySet: Boolean('stripeRestrictedKey' in input && input.stripeRestrictedKey),
      updatedAt: '2026-08-22T12:30:00.000Z',
    }));
    mockedController.beginPaykitClaimFlow.mockReset().mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: () => new Promise<typeof VERIFIED_CLAIM_RESULT>(() => {}),
      cancel: vi.fn(),
    });
    mockedController.beginPaykitClaimStatusFlow.mockReset().mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/verify',
      awaitStatus: () => new Promise<ReturnType<typeof matchingStatusOutcome>>(() => {}),
      cancel: vi.fn(),
    });
  });

  afterEach(() => {
    delete process.env[BITCOIN_NETWORK_ENV];
    resetRuntimeConfigForTests();
  });

  it('the hook-level gate: setBitcoinEnabled(true) without a verified claim is refused, and the save payload stays false', async () => {
    const { result } = await renderPaymentConfig();

    // A key is entered but NO claim was completed — the gate stays shut.
    act(() => result.current.setXpubInput(PASTED_ZPUB));
    expect(result.current.canEnableBitcoin).toBe(false);
    expect(result.current.bitcoinEnableBlockedReason).toBe(BITCOIN_ENABLE_BLOCKED_COPY.claim_required);

    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(false);

    let saved: boolean | undefined;
    await act(async () => {
      saved = await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(saved).toBe(true);
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false }),
    );
  });

  it('P1-B negative: the public {claimed:true} boolean alone never opens the gate', async () => {
    // The unauthenticated existence lookup says an account is registered —
    // display-only. Without a verified claim the toggle stays off and the
    // save payload cannot carry true.
    mockedController.isOwnPaykitAccountClaimed.mockResolvedValue(true);
    const { result } = await renderPaymentConfig();

    expect(result.current.accountClaimed).toBe(true);
    expect(result.current.canEnableBitcoin).toBe(false);
    expect(result.current.bitcoinEnableBlockedReason).toBe(BITCOIN_ENABLE_BLOCKED_COPY.claim_unknown);

    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(false);

    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false }),
    );
  });

  it('P1-A regression: a pre-W1.8 stored config {bitcoinEnabled:true, no verifiedClaim} loads OFF and saves false', async () => {
    mockedController.getMyPaymentConfig.mockResolvedValue({ ...EMPTY_CONFIG, bitcoinEnabled: true });
    const { result } = await renderPaymentConfig();

    // The stored flag is a hint, never authority: with no verified claim on
    // this device the toggle loads OFF.
    expect(result.current.bitcoinEnabled).toBe(false);
    expect(result.current.canEnableBitcoin).toBe(false);

    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false }),
    );
  });

  it('P1-A regression (cont.): a successful verification flips the stale config on and saves true', async () => {
    mockedController.getMyPaymentConfig.mockResolvedValue({ ...EMPTY_CONFIG, bitcoinEnabled: true });
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => VERIFIED_CLAIM_RESULT,
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();
    expect(result.current.bitcoinEnabled).toBe(false);

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('claimed'));

    // The verified claim was recorded (session_claim source) and the gate opened.
    expect(mockedController.commitSaveVerifiedPaykitClaim).toHaveBeenCalledWith(
      expect.objectContaining({ xpub: NORMALIZED_XPUB, source: 'session_claim', accountIndex: 0 }),
      SELLER_PUBKY,
    );
    expect(result.current.canEnableBitcoin).toBe(true);
    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(true);

    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: true }),
    );
  });

  it('a stored bitcoinEnabled:true with a persisted verified claim loads ON and saves true', async () => {
    mockedController.getMyPaymentConfig.mockResolvedValue({ ...EMPTY_CONFIG, bitcoinEnabled: true });
    mockedController.getMyVerifiedPaykitClaim.mockResolvedValue(storedClaimRecord());
    const { result } = await renderPaymentConfig();

    expect(result.current.canEnableBitcoin).toBe(true);
    expect(result.current.bitcoinEnabled).toBe(true);
    // The key text seeds from the verified claim so the seller sees the key it binds to.
    expect(result.current.xpubInput).toBe(NORMALIZED_XPUB);

    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: true }),
    );
  });

  it('a persisted claim whose stored xpub no longer normalizes to itself fails closed on load', async () => {
    mockedController.getMyPaymentConfig.mockResolvedValue({ ...EMPTY_CONFIG, bitcoinEnabled: true });
    // A corrupted/non-canonical record: the claim restores only when the
    // stored xpub normalizes to ITSELF on this network — an undecodable (or
    // non-canonical, e.g. zpub-form) stored string restores nothing.
    mockedController.getMyVerifiedPaykitClaim.mockResolvedValue({
      ...storedClaimRecord(),
      xpub: 'xpub-not-base58',
    });
    const { result } = await renderPaymentConfig();

    expect(result.current.verifiedClaim).toBeNull();
    expect(result.current.bitcoinEnabled).toBe(false);
    expect(result.current.canEnableBitcoin).toBe(false);
  });

  it('the Stripe-removal path derives bitcoinEnabled from the gate too (no field passthrough)', async () => {
    // Stored config has bitcoinEnabled:true and a stored Stripe key; with no
    // verified claim the removal payload must carry false, not the stored flag.
    mockedController.getMyPaymentConfig.mockResolvedValue({
      ...EMPTY_CONFIG,
      bitcoinEnabled: true,
      stripePaymentLink: 'https://buy.stripe.com/test_abc',
      stripeRestrictedKeySet: true,
    });
    const { result } = await renderPaymentConfig();
    expect(result.current.bitcoinEnabled).toBe(false);

    await act(async () => {
      await result.current.clearStripeKey();
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false, stripeRestrictedKey: '' }),
    );
  });

  it('a verified claim opens the gate for the CURRENT key; changing the key text invalidates it and forces the toggle off', async () => {
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => VERIFIED_CLAIM_RESULT,
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('claimed'));

    // The claim POSTed the derived account index from the normalized bytes.
    expect(mockedController.beginPaykitClaimFlow).toHaveBeenCalledWith(NORMALIZED_XPUB, 0);

    expect(result.current.canEnableBitcoin).toBe(true);
    expect(result.current.bitcoinEnableBlockedReason).toBeNull();
    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(true);

    // Editing the key text invalidates the verified claim: the gate closes
    // and the toggle is forced off in the same transition.
    act(() => result.current.setXpubInput(OTHER_ZPUB));
    expect(result.current.canEnableBitcoin).toBe(false);
    expect(result.current.bitcoinEnableBlockedReason).toBe(BITCOIN_ENABLE_BLOCKED_COPY.key_changed);
    expect(result.current.bitcoinEnabled).toBe(false);

    // And the save payload cannot carry true for the invalidated key.
    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false }),
    );
  });

  it('a failed verification never leaves bitcoinEnabled true', async () => {
    const tamperedFingerprint = VERIFIED_CLAIM_RESULT.keyFingerprint.endsWith('0')
      ? `${VERIFIED_CLAIM_RESULT.keyFingerprint.slice(0, -1)}1`
      : `${VERIFIED_CLAIM_RESULT.keyFingerprint.slice(0, -1)}0`;
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => ({ ...VERIFIED_CLAIM_RESULT, keyFingerprint: tamperedFingerprint }),
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('error'));

    expect(result.current.canEnableBitcoin).toBe(false);
    expect(result.current.bitcoinEnabled).toBe(false);
    expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(false);
    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false }),
    );
  });

  it('W1.8 F2: a server echoing account index 1 for an account-0 key is refused, and nothing is persisted', async () => {
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => ({ ...VERIFIED_CLAIM_RESULT, accountIndex: 1 }),
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('error'));

    expect(result.current.claimError).toBe(CLAIM_VERIFICATION_COPY.server_account_index_mismatch);
    expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
    expect(result.current.canEnableBitcoin).toBe(false);
    expect(result.current.bitcoinEnabled).toBe(false);
  });

  it('a verified session claim persists the W1.13 r3 fields (first_child_index, allocation_mode, claim_channel)', async () => {
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => VERIFIED_CLAIM_RESULT,
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('claimed'));

    expect(mockedController.commitSaveVerifiedPaykitClaim).toHaveBeenCalledWith(
      expect.objectContaining({
        firstChildIndex: 0,
        allocationMode: 'shared_manual',
        claimChannel: 'manual',
        downgradeReason: null,
      }),
      SELLER_PUBKY,
    );
  });

  it('W1.13 r3: a claim response with next_child_index != first_child_index is refused (server_cursor_mismatch)', async () => {
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => ({ ...VERIFIED_CLAIM_RESULT, nextChildIndex: 7 }),
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('error'));

    expect(result.current.claimError).toBe(CLAIM_VERIFICATION_COPY.server_cursor_mismatch);
    expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
    expect(result.current.canEnableBitcoin).toBe(false);
    expect(result.current.bitcoinEnabled).toBe(false);
  });

  it('W1.13 r3: a claim response missing first_child_index is refused (server_first_index_missing)', async () => {
    mockedController.beginPaykitClaimFlow.mockReturnValue({
      actorPubky: SELLER_PUBKY,
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: async () => ({ ...VERIFIED_CLAIM_RESULT, firstChildIndex: null }),
      cancel: vi.fn(),
    });
    const { result } = await renderPaymentConfig();

    act(() => result.current.setXpubInput(PASTED_ZPUB));
    act(() => result.current.startClaim(PASTED_ZPUB));
    await waitFor(() => expect(result.current.claimStatus).toBe('error'));

    expect(result.current.claimError).toBe(CLAIM_VERIFICATION_COPY.server_first_index_missing);
    expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
    expect(result.current.bitcoinEnabled).toBe(false);
  });

  describe('account switch during a pending approval (W1.8c P1-B)', () => {
    /** The static copy the controller's refusal carries (Err factory message). */
    const ACCOUNT_SWITCHED_MESSAGE =
      'The signed-in account changed while the approval was pending, so the verified claim was not saved.';

    it('claim path: a refused flow-start-identity write mutates nothing — the gate stays closed', async () => {
      mockedController.beginPaykitClaimFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/claim',
        awaitClaim: async () => VERIFIED_CLAIM_RESULT,
        cancel: vi.fn(),
      });
      // The controller refuses the write: the signed-in account changed
      // while the Ring approval was pending (the real guard and the Dexie
      // no-row assertion live in the CommerceController tests).
      mockedController.commitSaveVerifiedPaykitClaim.mockRejectedValue(new Error(ACCOUNT_SWITCHED_MESSAGE));
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      act(() => result.current.startClaim(PASTED_ZPUB));
      await waitFor(() => expect(result.current.claimStatus).toBe('error'));

      // No verified claim, no watched account, no bitcoinEnabled: the
      // success-path setters never ran, and the refusal surfaces as the
      // generic static error copy.
      expect(result.current.claimError).toBe(ACCOUNT_SWITCHED_MESSAGE);
      expect(result.current.verifiedClaim).toBeNull();
      expect(result.current.watchedAccount).toBeNull();
      expect(result.current.canEnableBitcoin).toBe(false);
      expect(result.current.bitcoinEnabled).toBe(false);
      act(() => result.current.setBitcoinEnabled(true));
      expect(result.current.bitcoinEnabled).toBe(false);
    });

    it('Ring verify path: a refused flow-start-identity write mutates nothing — the gate stays closed', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => matchingStatusOutcome(),
        cancel: vi.fn(),
      });
      mockedController.commitSaveVerifiedPaykitClaim.mockRejectedValue(new Error(ACCOUNT_SWITCHED_MESSAGE));
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('error'));

      expect(result.current.verifyError).toBe(ACCOUNT_SWITCHED_MESSAGE);
      expect(result.current.verifiedClaim).toBeNull();
      expect(result.current.canEnableBitcoin).toBe(false);
      expect(result.current.bitcoinEnabled).toBe(false);
      act(() => result.current.setBitcoinEnabled(true));
      expect(result.current.bitcoinEnabled).toBe(false);
    });
  });

  describe('account-index regression gate (P2)', () => {
    it('an account-1 key claims with beginPaykitClaimFlow(normalizedXpub, 1)', async () => {
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(ZPUB_ACCOUNT_1));
      act(() => result.current.startClaim(ZPUB_ACCOUNT_1));

      expect(mockedController.beginPaykitClaimFlow).toHaveBeenCalledTimes(1);
      expect(mockedController.beginPaykitClaimFlow).toHaveBeenCalledWith(NORMALIZED_XPUB_1, 1);
    });

    it('an account-99 key claims with beginPaykitClaimFlow(normalizedXpub, 99)', async () => {
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(ZPUB_ACCOUNT_99));
      act(() => result.current.startClaim(ZPUB_ACCOUNT_99));

      expect(mockedController.beginPaykitClaimFlow).toHaveBeenCalledTimes(1);
      expect(mockedController.beginPaykitClaimFlow).toHaveBeenCalledWith(NORMALIZED_XPUB_99, 99);
    });

    it('an account-100 key is refused client-side BEFORE any POST with account_index_out_of_range', async () => {
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(ZPUB_ACCOUNT_100));
      act(() => result.current.startClaim(ZPUB_ACCOUNT_100));

      expect(mockedController.beginPaykitClaimFlow).not.toHaveBeenCalled();
      expect(result.current.claimStatus).toBe('error');
      expect(result.current.claimError).toBe(CLAIM_REJECTION_COPY.account_index_out_of_range);
    });

    it('the maximum hardened child (2^31 − 1) is refused client-side BEFORE any POST', async () => {
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(ZPUB_ACCOUNT_MAX_HARDENED));
      act(() => result.current.startClaim(ZPUB_ACCOUNT_MAX_HARDENED));

      expect(mockedController.beginPaykitClaimFlow).not.toHaveBeenCalled();
      expect(result.current.claimStatus).toBe('error');
      expect(result.current.claimError).toBe(CLAIM_REJECTION_COPY.account_index_out_of_range);
    });
  });

  describe('Verify with Ring (authenticated status)', () => {
    it('a 200 with a fingerprint matching the local key opens the gate and records authenticated_status', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => matchingStatusOutcome(),
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      expect(result.current.canEnableBitcoin).toBe(false);

      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('verified'));

      expect(mockedController.commitSaveVerifiedPaykitClaim).toHaveBeenCalledWith(
        expect.objectContaining({ xpub: NORMALIZED_XPUB, source: 'authenticated_status' }),
        SELLER_PUBKY,
      );
      expect(result.current.canEnableBitcoin).toBe(true);
      act(() => result.current.setBitcoinEnabled(true));
      expect(result.current.bitcoinEnabled).toBe(true);
    });

    it('a 200 with next_child_index drifted past first_child_index still verifies (the cursor is informational at status time)', async () => {
      // Invoices have been allocated since the claim: the mutable cursor
      // moved to 7 while the immutable first address stays derived at 5.
      // The status read compares the address at first_child_index ONLY.
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => matchingStatusOutcome(ACCOUNT, { firstChildIndex: 5, nextChildIndex: 7 }),
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('verified'));

      expect(mockedController.commitSaveVerifiedPaykitClaim).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'authenticated_status',
          firstChildIndex: 5,
          firstDerivedAddress: deriveBip84P2wpkhAddress(ACCOUNT.payload, 'mainnet', 5),
        }),
        SELLER_PUBKY,
      );
      expect(result.current.canEnableBitcoin).toBe(true);
    });

    it('a 200 whose account_index disagrees with the local key refuses with account_index_mismatch and records nothing', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => {
          const outcome = matchingStatusOutcome();
          return { ...outcome, status: { ...outcome.status, accountIndex: 1 } };
        },
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('error'));

      expect(result.current.verifyError).toBe(BITCOIN_ENABLE_BLOCKED_COPY.account_index_mismatch);
      expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
      expect(result.current.canEnableBitcoin).toBe(false);
      expect(result.current.bitcoinEnabled).toBe(false);
    });

    it('a 200 whose first_derived_address does not re-derive at first_child_index refuses with address_mismatch', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => {
          const outcome = matchingStatusOutcome();
          // first_child_index 0, but the address of index 4: the immutable
          // anchor does not re-derive from the local key.
          return {
            ...outcome,
            status: {
              ...outcome.status,
              firstDerivedAddress: deriveBip84P2wpkhAddress(ACCOUNT.payload, 'mainnet', 4),
            },
          };
        },
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('error'));

      expect(result.current.verifyError).toBe(BITCOIN_ENABLE_BLOCKED_COPY.address_mismatch);
      expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
      expect(result.current.canEnableBitcoin).toBe(false);
      expect(result.current.bitcoinEnabled).toBe(false);
    });

    it('a 200 with a mismatching fingerprint refuses with key_changed and records nothing', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => matchingStatusOutcome(deriveBip84Account(MNEMONIC, 0, 7)),
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.setXpubInput(PASTED_ZPUB));
      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('error'));

      expect(result.current.verifyError).toBe(BITCOIN_ENABLE_BLOCKED_COPY.key_changed);
      expect(mockedController.commitSaveVerifiedPaykitClaim).not.toHaveBeenCalled();
      expect(result.current.canEnableBitcoin).toBe(false);
      expect(result.current.bitcoinEnabled).toBe(false);
    });

    it('a refused status read (401/403/5xx/network/parse) shuts the gate with claim_unknown', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => ({ ok: false as const, reason: 'refused' as const }),
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('error'));

      expect(result.current.verifyError).toBe(BITCOIN_ENABLE_BLOCKED_COPY.claim_unknown);
      expect(result.current.statusEndpointUnavailable).toBe(false);
      expect(result.current.canEnableBitcoin).toBe(false);
      expect(result.current.bitcoinEnabled).toBe(false);
    });

    it('a 404 shuts the gate and raises the not-available line', async () => {
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => ({ ok: false as const, reason: 'not_deployed' as const }),
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('error'));

      expect(result.current.statusEndpointUnavailable).toBe(true);
      expect(result.current.verifyError).toBe(BITCOIN_ENABLE_BLOCKED_COPY.claim_unknown);
      expect(result.current.canEnableBitcoin).toBe(false);
    });

    it('with no local key the server fingerprint and first address are recorded as the identity being enabled', async () => {
      const serverAccount = deriveBip84Account(MNEMONIC, 0, 7);
      mockedController.beginPaykitClaimStatusFlow.mockReturnValue({
        actorPubky: SELLER_PUBKY,
        authorizationUrl: 'https://auth.example/verify',
        awaitStatus: async () => matchingStatusOutcome(serverAccount),
        cancel: vi.fn(),
      });
      const { result } = await renderPaymentConfig();

      // No key text, no persisted claim: the Bitkit-set-up seller case.
      expect(result.current.xpubInput).toBe('');
      act(() => result.current.verifyWithRing());
      await waitFor(() => expect(result.current.verifyStatus).toBe('verified'));

      expect(result.current.verifiedClaim).toMatchObject({
        xpub: null,
        keyFingerprintHex: accountKeyFingerprint(serverAccount.payload),
        firstDerivedAddress: deriveBip84P2wpkhAddress(serverAccount.payload, 'mainnet', 0),
        source: 'authenticated_status',
      });
      expect(mockedController.commitSaveVerifiedPaykitClaim).toHaveBeenCalledWith(
        expect.objectContaining({ xpub: null, source: 'authenticated_status' }),
        SELLER_PUBKY,
      );
      // The identity was just shown to the seller: the gate opens for it.
      expect(result.current.canEnableBitcoin).toBe(true);
    });
  });
});
