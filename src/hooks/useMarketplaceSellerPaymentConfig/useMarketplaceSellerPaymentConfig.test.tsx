import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import { accountKeyFingerprint, deriveBip84P2wpkhAddress } from '@/libs/commerce/bip84-preview';
import { encodeBase58Check, type SellerPaymentConfigOwnView } from '@/libs/commerce/payment-methods';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { BIP84_VERSION_BYTES, deriveBip84Account } from '@/test-utils/bip84';
import {
  BITCOIN_ENABLE_BLOCKED_COPY,
  useMarketplaceSellerPaymentConfig,
} from './useMarketplaceSellerPaymentConfig';

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getMyPaymentConfig: vi.fn(),
    isOwnPaykitAccountClaimed: vi.fn(),
    putMyPaymentConfig: vi.fn(),
    beginPaykitClaimFlow: vi.fn(),
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
const ACCOUNT = deriveBip84Account(MNEMONIC, 0, 0);
const OTHER_ACCOUNT = deriveBip84Account(MNEMONIC, 0, 1);
const PASTED_ZPUB = encodeBase58Check(
  (() => {
    const payload = new Uint8Array(ACCOUNT.payload);
    new DataView(payload.buffer).setUint32(0, BIP84_VERSION_BYTES.zpub, false);
    return payload;
  })(),
);
const OTHER_ZPUB = encodeBase58Check(
  (() => {
    const payload = new Uint8Array(OTHER_ACCOUNT.payload);
    new DataView(payload.buffer).setUint32(0, BIP84_VERSION_BYTES.zpub, false);
    return payload;
  })(),
);
const NORMALIZED_XPUB = encodeBase58Check(ACCOUNT.payload);

const VERIFIED_CLAIM_RESULT = {
  creator: 'pubkygy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
  accountIndex: 0,
  keyFingerprint: accountKeyFingerprint(ACCOUNT.payload),
  firstDerivedAddress: deriveBip84P2wpkhAddress(ACCOUNT.payload, 'mainnet', 0),
  nextChildIndex: 0,
  stackId: 'proof:3f6f4b2a-0000-4000-8000-000000000000',
};

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
    mockedController.putMyPaymentConfig.mockReset().mockImplementation(async (input) => ({
      bitcoinEnabled: input.bitcoinEnabled,
      stripePaymentLink: input.stripePaymentLink,
      paypalMerchantEmail: input.paypalMerchantEmail,
      stripeRestrictedKeySet: Boolean('stripeRestrictedKey' in input && input.stripeRestrictedKey),
      updatedAt: '2026-08-22T12:30:00.000Z',
    }));
    mockedController.beginPaykitClaimFlow.mockReset().mockReturnValue({
      authorizationUrl: 'https://auth.example/claim',
      awaitClaim: () => new Promise<typeof VERIFIED_CLAIM_RESULT>(() => {}),
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

  it('a verified claim opens the gate for the CURRENT key; changing the key text invalidates it and forces the toggle off', async () => {
    mockedController.beginPaykitClaimFlow.mockReturnValue({
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
    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(false);
    await act(async () => {
      await result.current.save({ stripePaymentLink: '', stripeRestrictedKey: '', paypalMerchantEmail: '' });
    });
    expect(mockedController.putMyPaymentConfig).toHaveBeenCalledWith(
      expect.objectContaining({ bitcoinEnabled: false }),
    );
  });

  it('a server-reported claim (Bitkit setup) opens the gate without a session claim', async () => {
    mockedController.isOwnPaykitAccountClaimed.mockResolvedValue(true);
    const { result } = await renderPaymentConfig();

    expect(result.current.canEnableBitcoin).toBe(true);
    act(() => result.current.setBitcoinEnabled(true));
    expect(result.current.bitcoinEnabled).toBe(true);
  });
});
