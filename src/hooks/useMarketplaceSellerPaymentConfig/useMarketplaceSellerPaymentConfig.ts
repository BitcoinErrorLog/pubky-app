'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getBitcoinNetwork } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  type ClaimVerificationRejectionReason,
  deriveBip84P2wpkhAddress,
  verifyClaimedAccount,
} from '@/libs/commerce/bip84-preview';
import {
  type AccountXpubRejectionReason,
  isStripePaymentLink,
  isStripeRestrictedKey,
  normalizeAccountXpub,
  parseBitcoinNetwork,
  type SellerPaymentConfigOwnView,
} from '@/libs/commerce/payment-methods';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/use-toast';

type ClaimStatus = 'idle' | 'awaiting' | 'claimed' | 'error';

type ClaimFlow = ReturnType<typeof CommerceController.beginPaykitClaimFlow>;

/** The watched account as the verified claim response reported it. */
export interface WatchedAccount {
  accountIndex: number;
  firstDerivedAddress: string;
  nextChildIndex: number;
}

/**
 * Static seller-facing copy for each named xpub rejection. Never interpolate
 * the pasted key into these strings (or anywhere else in the claim UI).
 */
export const CLAIM_REJECTION_COPY: Record<AccountXpubRejectionReason, string> = {
  bitcoin_network_unconfigured:
    'This deployment has no Bitcoin network configured, so a watch-only account cannot be claimed. Contact the operator.',
  not_base58check: 'That does not look like an account xpub. Export the BIP84 account key from your wallet.',
  unexpected_length: 'That does not look like an account xpub. Export the BIP84 account key from your wallet.',
  invalid_checksum: 'That key fails its checksum — a character is mistyped. Export the BIP84 account key again.',
  unrecognized_version_bytes:
    'That is not a BIP84 native-segwit account key. Export the account xpub (xpub/zpub, or tpub/vpub on a test network).',
  test_network_key_on_mainnet:
    'That is a test-network key, but this deployment settles on Bitcoin mainnet. Export the mainnet account key.',
  mainnet_key_on_test_network:
    'That is a mainnet key, but this deployment settles on a test network. Export the test-network account key.',
  master_key: 'That is a master key, not an account key. Export the BIP84 account xpub from your wallet.',
  non_account_depth:
    'That key is not an account-level key. Export the BIP84 account xpub (depth 3, m/84’/coin’/account’) from your wallet.',
  unhardened_account_child:
    'That key is not a hardened account key. Export the BIP84 account xpub from your wallet, not a derived address key.',
  invalid_public_key: 'That key carries an invalid public key. Export the BIP84 account xpub from your wallet again.',
  deny_listed_key:
    'That key is a publicly known test key — anyone can spend from it. Export your own account key from your wallet.',
};

/**
 * The §C.10 disclosure sentence, rendered verbatim on the manual claim
 * screen before the irreversible submit. Static copy, no interpolation —
 * asserted in the payment-settings tests so it cannot be dropped in a later
 * copy pass.
 */
export const CLAIM_DISCLOSURE_SENTENCE =
  'If any other wallet also receives payments on this account, a Shop order can be marked paid when nobody paid it — and you will ship the item for free. We recommend a dedicated account used only by Shop; tapping "Use Bitkit" creates one for you.';

/**
 * Static copy for the post-claim verification gate (design §B.6): the client
 * recomputes the key fingerprint and first address from the exact normalized
 * bytes it POSTed and refuses to enable bitcoin on any disagreement.
 */
export const CLAIM_VERIFICATION_COPY: Record<ClaimVerificationRejectionReason, string> = {
  server_fingerprint_missing:
    'The Paykit server did not return the key details Shop needs to verify the claim. The server must be updated before claiming works here — nothing was enabled.',
  server_fingerprint_mismatch:
    'The Paykit server reported a different key than the one you submitted, so bitcoin payments were not enabled. Do not use this account for Shop; contact the operator.',
  server_address_mismatch:
    'The Paykit server derived a different first address than this app computed from your key, so bitcoin payments were not enabled. Contact the operator.',
};

/**
 * The seller's "Get paid" configuration: stored rails (loaded from the
 * durable service), the save action, and the manual watch-only claim flow.
 * Claim state (`accountClaimed`) is read from paykit-server, so it reflects
 * the Bitkit-driven setup and the manual claim alike.
 */
export function useMarketplaceSellerPaymentConfig() {
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [config, setConfig] = useState<SellerPaymentConfigOwnView | null>(null);
  const [accountClaimed, setAccountClaimed] = useState<boolean | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [claimStatus, setClaimStatus] = useState<ClaimStatus>('idle');
  const [claimAuthorizationUrl, setClaimAuthorizationUrl] = useState('');
  const [claimError, setClaimError] = useState<string | null>(null);
  /** Preview address at 0/0 derived from the exact normalized bytes being POSTed. */
  const [claimPreviewAddress, setClaimPreviewAddress] = useState<string | null>(null);
  /** The verified watched account from the claim response (this session only). */
  const [watchedAccount, setWatchedAccount] = useState<WatchedAccount | null>(null);
  const activeClaimRef = useRef<ClaimFlow | null>(null);

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      const [configResult, claimedResult] = await Promise.allSettled([
        CommerceController.getMyPaymentConfig(),
        CommerceController.isOwnPaykitAccountClaimed(),
      ]);
      if (!active) return;
      if (configResult.status === 'fulfilled') {
        setConfig(configResult.value);
      } else {
        Logger.error('Failed to load the payment configuration', { error: configResult.reason });
        setLoadError(getErrorMessage(configResult.reason));
      }
      // A paykit outage must not block the fiat form: claim state renders
      // as unknown instead.
      setAccountClaimed(claimedResult.status === 'fulfilled' ? claimedResult.value : null);
      setIsLoading(false);
    };
    void load();
    return () => {
      active = false;
    };
  }, []);

  const save = useCallback(
    async (input: {
      bitcoinEnabled: boolean;
      stripePaymentLink: string;
      stripeRestrictedKey: string;
      paypalMerchantEmail: string;
    }): Promise<boolean> => {
      const stripePaymentLink = input.stripePaymentLink.trim();
      const paypalMerchantEmail = input.paypalMerchantEmail.trim();
      const stripeRestrictedKey = input.stripeRestrictedKey.trim();
      if (stripePaymentLink && !isStripePaymentLink(stripePaymentLink)) {
        toast({
          title: 'Invalid Stripe payment link',
          description: 'Paste the https://buy.stripe.com/… link from your Stripe dashboard.',
        });
        return false;
      }
      if (stripeRestrictedKey && !isStripeRestrictedKey(stripeRestrictedKey)) {
        toast({
          title: 'Invalid Stripe key',
          description:
            'Paste a restricted key (rk_…) with read access to Checkout Sessions. Secret keys (sk_…) are refused and should never leave your Stripe account.',
        });
        return false;
      }
      setIsSaving(true);
      try {
        const saved = await CommerceController.putMyPaymentConfig({
          bitcoinEnabled: input.bitcoinEnabled,
          stripePaymentLink: stripePaymentLink || null,
          // Omit to preserve the stored key; the empty string clears it only
          // when a key exists to clear (an explicit user action in the form).
          ...(stripeRestrictedKey ? { stripeRestrictedKey } : {}),
          paypalMerchantEmail: paypalMerchantEmail || null,
        });
        setConfig(saved);
        toast({ title: 'Payment settings saved' });
        return true;
      } catch (error) {
        Logger.error('Failed to save the payment configuration', { error });
        toast({ title: 'Saving payment settings failed', description: getErrorMessage(error) });
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [],
  );

  const clearStripeKey = useCallback(async (): Promise<boolean> => {
    if (!config) return false;
    setIsSaving(true);
    try {
      const saved = await CommerceController.putMyPaymentConfig({
        bitcoinEnabled: config.bitcoinEnabled,
        stripePaymentLink: config.stripePaymentLink,
        stripeRestrictedKey: '',
        paypalMerchantEmail: config.paypalMerchantEmail,
      });
      setConfig(saved);
      toast({ title: 'Stripe key removed' });
      return true;
    } catch (error) {
      Logger.error('Failed to remove the Stripe key', { error });
      toast({ title: 'Removing the Stripe key failed', description: getErrorMessage(error) });
      return false;
    } finally {
      setIsSaving(false);
    }
  }, [config]);

  const cancelClaim = useCallback(() => {
    const flow = activeClaimRef.current;
    activeClaimRef.current = null;
    if (flow) flow.cancel();
    setClaimStatus('idle');
    setClaimAuthorizationUrl('');
    setClaimError(null);
    setClaimPreviewAddress(null);
  }, []);

  const startClaim = useCallback((accountXpub: string) => {
    // Validate against the configured network and normalize (zpub→xpub /
    // vpub→tpub) BEFORE anything is sent: the claim submits the normalized
    // xpub, never the raw paste. Unset/unrecognised network refuses the claim.
    const network = parseBitcoinNetwork(getBitcoinNetwork());
    const normalized = normalizeAccountXpub(accountXpub, network);
    if (!normalized.ok) {
      setClaimError(CLAIM_REJECTION_COPY[normalized.reason]);
      setClaimStatus('error');
      return;
    }
    const previous = activeClaimRef.current;
    activeClaimRef.current = null;
    if (previous) previous.cancel();
    setClaimError(null);

    let flow: ClaimFlow;
    try {
      flow = CommerceController.beginPaykitClaimFlow(normalized.xpub);
    } catch (error) {
      Logger.error('Failed to start the watch-only claim flow', { error });
      setClaimError(getErrorMessage(error));
      setClaimStatus('error');
      return;
    }
    activeClaimRef.current = flow;
    // The preview derives from the exact normalized 78 bytes about to be
    // POSTed — never from the pasted string (design §B.6).
    setClaimPreviewAddress(deriveBip84P2wpkhAddress(normalized.bytes, network!, 0));
    setClaimAuthorizationUrl(flow.authorizationUrl);
    setClaimStatus('awaiting');

    flow
      .awaitClaim()
      .then((result) => {
        if (activeClaimRef.current !== flow) return;
        // The confirmation gate (design §B.6): the server must prove it stored
        // exactly the key that was POSTed. On any mismatch, missing
        // fingerprint, or disagreeing first address, bitcoin stays disabled.
        const verification = verifyClaimedAccount(normalized.bytes, network!, result);
        if (!verification.ok) {
          activeClaimRef.current = null;
          setClaimAuthorizationUrl('');
          setClaimError(CLAIM_VERIFICATION_COPY[verification.reason]);
          setClaimStatus('error');
          return;
        }
        activeClaimRef.current = null;
        setClaimAuthorizationUrl('');
        setWatchedAccount({
          accountIndex: result.accountIndex,
          firstDerivedAddress: result.firstDerivedAddress!,
          nextChildIndex: result.nextChildIndex!,
        });
        setClaimStatus('claimed');
        setAccountClaimed(true);
        toast({ title: 'Watch-only account claimed', description: 'Bitcoin payment requests now use this account.' });
      })
      .catch((error: unknown) => {
        if (activeClaimRef.current !== flow) return;
        activeClaimRef.current = null;
        Logger.error('Watch-only claim failed', { error });
        setClaimAuthorizationUrl('');
        setClaimError(getErrorMessage(error));
        setClaimStatus('error');
      });
  }, []);

  useEffect(() => {
    return () => {
      const flow = activeClaimRef.current;
      activeClaimRef.current = null;
      if (flow) flow.cancel();
    };
  }, []);

  return {
    isLoading,
    isSaving,
    config,
    accountClaimed,
    loadError,
    save,
    clearStripeKey,
    claimStatus,
    claimAuthorizationUrl,
    claimError,
    claimPreviewAddress,
    watchedAccount,
    startClaim,
    cancelClaim,
  };
}
