'use client';

import { useEffect, useRef, useState } from 'react';
import { getBitcoinNetwork } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  accountIndexFromBytes,
  accountKeyFingerprint,
  type ClaimVerificationRejectionReason,
  deriveBip84P2wpkhAddress,
  MAX_ACCOUNT_INDEX,
  verifyClaimedAccount,
} from '@/libs/commerce/bip84-preview';
import {
  type AccountXpubRejectionReason,
  isStripePaymentLink,
  isStripeRestrictedKey,
  normalizeAccountXpub,
  parseBitcoinNetwork,
  type SellerPaymentConfigOwnView,
  type VerifiedPaykitClaim,
  verifiedPaykitClaimSchema,
} from '@/libs/commerce/payment-methods';
import { getErrorMessage } from '@/libs/error/error.utils';
import { Logger } from '@/libs/logger/logger';
import { toast } from '@/molecules/Toaster/use-toast';

type ClaimStatus = 'idle' | 'awaiting' | 'claimed' | 'error';

type VerifyStatus = 'idle' | 'awaiting' | 'verified' | 'error';

type ClaimFlow = ReturnType<typeof CommerceController.beginPaykitClaimFlow>;

type ClaimStatusFlow = ReturnType<typeof CommerceController.beginPaykitClaimStatusFlow>;

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
export const CLAIM_REJECTION_COPY: Record<AccountXpubRejectionReason | 'account_index_out_of_range', string> = {
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
  // The same identifier the server uses for its 0–99 bound; refused
  // client-side before anything is POSTed.
  account_index_out_of_range: 'This account index is outside the range Shop accepts (0–99).',
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
  server_account_index_mismatch:
    'The Paykit server reported a different account index than your key declares, so bitcoin payments were not enabled. Contact the operator.',
  server_first_index_missing:
    'The Paykit server did not report the child index it derived your first address from, so bitcoin payments were not enabled. The server must be updated before claiming works here — nothing was enabled.',
  server_cursor_mismatch:
    'The Paykit server reported a derivation cursor that does not match its first-address index for a fresh claim, so bitcoin payments were not enabled. Contact the operator.',
  server_address_mismatch:
    'The Paykit server derived a different first address than this app computed from your key, so bitcoin payments were not enabled. Contact the operator.',
};

/**
 * Static copy explaining why the Accept-bitcoin toggle is disabled. The
 * toggle stays off until a verified claim exists for the CURRENT normalized
 * key (design §B.6) — a pasted key without a completed claim, a key that
 * changed after the claim, or an unreportable claim state all block it.
 */
export const BITCOIN_ENABLE_BLOCKED_COPY = {
  claim_required:
    'Bitcoin can only be enabled after a watch-only account claim is verified — claim with the signer below, or through Bitkit.',
  key_changed:
    'The account key changed, so the verified claim no longer matches it. Claim this key before enabling bitcoin.',
  claim_unknown:
    'Shop could not confirm your watch-only account, so bitcoin cannot be enabled. Verify with Ring to confirm the claim, or claim the account again.',
  account_index_mismatch:
    'The Paykit server reported a different account index than your key declares, so bitcoin cannot be enabled. Contact the operator.',
  address_mismatch:
    'The Paykit server derived a different first address than this app computed from your key, so bitcoin cannot be enabled. Contact the operator.',
} as const;

/**
 * The extra static line shown when the authenticated status read 404s: the
 * deployed paykit-server predates W1.13 (or nothing is claimed). The gate
 * fails closed identically either way.
 */
export const CLAIM_STATUS_NOT_DEPLOYED_LINE = 'Bitcoin account status is not available from this server yet.';

/**
 * The seller's "Get paid" configuration: stored rails (loaded from the
 * durable service), the save action, the manual watch-only claim flow, and
 * the Ring-approved status verification.
 *
 * The `bitcoinEnabled` invariant lives HERE, not in any component (F1):
 * the toggle can only turn on while a verified claim exists — recorded in
 * the seller's local payment-config record (Dexie) by one of exactly two
 * paths: a session claim whose response verified against the exact
 * normalized bytes POSTed (`session_claim`), or the authenticated
 * `GET /v0/accounts/{creator}/status` read approved in Ring
 * (`authenticated_status`). The stored `bitcoinEnabled` flag is a hint,
 * never authority: on load the toggle is `stored && verified claim exists
 * && the claim's xpub still normalizes to itself` — a pre-W1.8 config saved
 * with the flag set loads OFF. The public `{claimed}` existence boolean is
 * display-only and never opens the gate (Terra P1). Editing the key text or
 * importing a different file breaks the match and forces the toggle off, so
 * a second surface using this hook cannot bypass the claim gate.
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
  /**
   * The verified claim — the gate state. Mirrors the seller's local
   * payment-config record (Dexie), written only by the two verification
   * paths; `null` until a verification completes on this device.
   */
  const [verifiedClaim, setVerifiedClaim] = useState<VerifiedPaykitClaim | null>(null);
  /** Session-claim watch details (display only; the status read has no child index). */
  const [watchedAccount, setWatchedAccount] = useState<WatchedAccount | null>(null);
  /** The account-key text the claim flow and the enable gate both read. */
  const [xpubInput, setXpubInput] = useState('');

  const [verifyStatus, setVerifyStatus] = useState<VerifyStatus>('idle');
  const [verifyAuthorizationUrl, setVerifyAuthorizationUrl] = useState('');
  const [verifyError, setVerifyError] = useState<string | null>(null);
  /** The status read 404'd: the deployed server predates W1.13 (or nothing is claimed). */
  const [statusEndpointUnavailable, setStatusEndpointUnavailable] = useState(false);
  /**
   * The Accept-bitcoin toggle. Owned by the hook so the claim gate below is
   * the ONLY way it turns on.
   */
  const [bitcoinEnabled, setBitcoinEnabledState] = useState(false);
  const activeClaimRef = useRef<ClaimFlow | null>(null);
  const activeVerifyRef = useRef<ClaimStatusFlow | null>(null);

  // The enable gate: the toggle is available only while a verified claim
  // exists AND the current key text still binds to it. A claim recorded
  // with an xpub requires the key text to normalize to exactly that xpub; a
  // claim recorded without one (Ring-verified status read, Bitkit setup)
  // stands until a DIFFERENT valid key is entered — one whose fingerprint
  // disagrees with the record. The public `{claimed}` boolean never opens
  // this gate.
  const network = parseBitcoinNetwork(getBitcoinNetwork());
  const normalizedInput = xpubInput.trim() ? normalizeAccountXpub(xpubInput, network) : null;
  const verifiedClaimMatchesKey =
    verifiedClaim !== null &&
    (verifiedClaim.xpub !== null
      ? normalizedInput !== null && normalizedInput.ok && normalizedInput.xpub === verifiedClaim.xpub
      : !(
          normalizedInput !== null &&
          normalizedInput.ok &&
          accountKeyFingerprint(normalizedInput.bytes) !== verifiedClaim.keyFingerprintHex
        ));
  const canEnableBitcoin = verifiedClaimMatchesKey;
  const bitcoinEnableBlockedReason = canEnableBitcoin
    ? null
    : verifiedClaim
      ? BITCOIN_ENABLE_BLOCKED_COPY.key_changed
      : accountClaimed === false
        ? BITCOIN_ENABLE_BLOCKED_COPY.claim_required
        : BITCOIN_ENABLE_BLOCKED_COPY.claim_unknown;

  // Key invalidation turns the toggle off; it never turns itself back on.
  useEffect(() => {
    if (verifiedClaim && !verifiedClaimMatchesKey) setBitcoinEnabledState(false);
  }, [verifiedClaim, verifiedClaimMatchesKey]);

  /** The guarded toggle setter: `true` is refused unless the claim gate is open. */
  const setBitcoinEnabled = (enabled: boolean) => {
    setBitcoinEnabledState(enabled && canEnableBitcoin);
  };

  useEffect(() => {
    let active = true;
    const load = async () => {
      setIsLoading(true);
      setLoadError(null);
      const [configResult, claimedResult, storedClaimResult] = await Promise.allSettled([
        CommerceController.getMyPaymentConfig(),
        CommerceController.isOwnPaykitAccountClaimed(),
        CommerceController.getMyVerifiedPaykitClaim(),
      ]);
      if (!active) return;
      // Fail closed on load: a stored claim restores only when it parses AND
      // its xpub still normalizes to itself on this network. A claim
      // recorded without an xpub (Ring-verified status read with no local
      // key) is session-scoped — after a reload the seller re-verifies.
      let restoredClaim: VerifiedPaykitClaim | null = null;
      if (storedClaimResult.status === 'fulfilled' && storedClaimResult.value) {
        const record = storedClaimResult.value;
        const parsed = verifiedPaykitClaimSchema.safeParse({
          xpub: record.xpub,
          keyFingerprintHex: record.key_fingerprint_hex,
          accountIndex: record.account_index,
          firstDerivedAddress: record.first_derived_address,
          verifiedAt: record.verified_at,
          source: record.source,
          // The local read already coalesced the W1.13 r3 columns of a
          // pre-W1.8c row to null.
          firstChildIndex: record.first_child_index,
          allocationMode: record.allocation_mode,
          claimChannel: record.claim_channel,
          downgradeReason: record.downgrade_reason,
        });
        if (parsed.success && parsed.data.xpub) {
          const normalized = normalizeAccountXpub(parsed.data.xpub, parseBitcoinNetwork(getBitcoinNetwork()));
          if (normalized.ok && normalized.xpub === parsed.data.xpub) restoredClaim = parsed.data;
        }
      }
      setVerifiedClaim(restoredClaim);
      // The key text seeds from the restored claim so the seller sees (and
      // can edit, breaking the match) the exact key the claim verified.
      if (restoredClaim?.xpub) {
        const xpub = restoredClaim.xpub;
        setXpubInput((current) => (current.trim() ? current : xpub));
      }
      if (configResult.status === 'fulfilled') {
        setConfig(configResult.value);
        // The effective flag: `stored && verified claim exists && the
        // claim's xpub normalizes to itself` (restoredClaim is exactly that
        // conjunction). A pre-W1.8 config saved `true` with no verified
        // claim loads OFF and re-saves `false`.
        setBitcoinEnabledState((configResult.value?.bitcoinEnabled ?? false) && restoredClaim !== null);
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

  /**
   * The single writer of the `bitcoinEnabled` payload field: derived from
   * the gate at save time, never from the stored config or a caller
   * argument. `save` and `clearStripeKey` both build through this — no
   * other writer of the field may exist.
   */
  const buildPaymentConfigPayload = (rails: {
    stripePaymentLink: string | null;
    stripeRestrictedKey?: string;
    paypalMerchantEmail: string | null;
  }) => ({
    ...rails,
    bitcoinEnabled: bitcoinEnabled && canEnableBitcoin,
  });

  const save = async (input: {
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
      const saved = await CommerceController.putMyPaymentConfig(
        buildPaymentConfigPayload({
          stripePaymentLink: stripePaymentLink || null,
          // Omit to preserve the stored key; the empty string clears it only
          // when a key exists to clear (an explicit user action in the form).
          ...(stripeRestrictedKey ? { stripeRestrictedKey } : {}),
          paypalMerchantEmail: paypalMerchantEmail || null,
        }),
      );
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
  };

  const clearStripeKey = async (): Promise<boolean> => {
    if (!config) return false;
    setIsSaving(true);
    try {
      const saved = await CommerceController.putMyPaymentConfig(
        buildPaymentConfigPayload({
          stripePaymentLink: config.stripePaymentLink,
          stripeRestrictedKey: '',
          paypalMerchantEmail: config.paypalMerchantEmail,
        }),
      );
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
  };

  const cancelClaim = () => {
    const flow = activeClaimRef.current;
    activeClaimRef.current = null;
    if (flow) flow.cancel();
    setClaimStatus('idle');
    setClaimAuthorizationUrl('');
    setClaimError(null);
    setClaimPreviewAddress(null);
  };

  /** Persists the gate state; only the two verification paths call this. */
  const persistVerifiedClaim = (claim: VerifiedPaykitClaim) => {
    CommerceController.commitSaveVerifiedPaykitClaim(claim).catch((error: unknown) => {
      Logger.error('Failed to persist the verified watch-only claim', { error });
    });
  };

  const startClaim = (accountXpub: string) => {
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

    // The account index the key itself declares: the hardened child number
    // at offset 9..13 of the normalized 78 bytes, hardened bit cleared (the
    // hardened structure check already ran inside normalizeAccountXpub).
    // The server's 0–99 bound is enforced here BEFORE anything is POSTed,
    // under the same `account_index_out_of_range` identifier.
    const accountIndex = accountIndexFromBytes(normalized.bytes);
    if (accountIndex > MAX_ACCOUNT_INDEX) {
      setClaimError(CLAIM_REJECTION_COPY.account_index_out_of_range);
      setClaimStatus('error');
      return;
    }

    const previous = activeClaimRef.current;
    activeClaimRef.current = null;
    if (previous) previous.cancel();
    setClaimError(null);

    let flow: ClaimFlow;
    try {
      flow = CommerceController.beginPaykitClaimFlow(normalized.xpub, accountIndex);
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
          // A failed verification never leaves bitcoinEnabled on — no
          // verified claim is recorded, so the gate slams shut here too.
          setVerifiedClaim(null);
          setBitcoinEnabledState(false);
          return;
        }
        activeClaimRef.current = null;
        setClaimAuthorizationUrl('');
        // The verified claim is bound to the exact normalized xpub: editing
        // the key text or importing a different file breaks this match and
        // the enable gate closes (see verifiedClaimMatchesKey above).
        const verified: VerifiedPaykitClaim = {
          xpub: normalized.xpub,
          keyFingerprintHex: result.keyFingerprint!,
          // The client-derived index from the POSTed bytes, never the server
          // echo (W1.8 F2 — verifyClaimedAccount already refused a mismatch).
          accountIndex: accountIndexFromBytes(normalized.bytes),
          firstDerivedAddress: result.firstDerivedAddress!,
          verifiedAt: Date.now(),
          source: 'session_claim',
          firstChildIndex: result.firstChildIndex,
          allocationMode: result.allocationMode,
          claimChannel: result.claimChannel,
          downgradeReason: result.downgradeReason,
        };
        setVerifiedClaim(verified);
        setWatchedAccount({
          accountIndex: result.accountIndex,
          firstDerivedAddress: result.firstDerivedAddress!,
          nextChildIndex: result.nextChildIndex!,
        });
        persistVerifiedClaim(verified);
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
  };

  const cancelVerify = () => {
    const flow = activeVerifyRef.current;
    activeVerifyRef.current = null;
    if (flow) flow.cancel();
    setVerifyStatus('idle');
    setVerifyAuthorizationUrl('');
    setVerifyError(null);
    setStatusEndpointUnavailable(false);
  };

  /**
   * "Verify with Ring" (design §B.8.6): the seller approves the exact claim
   * capability grant on their signer, and the token authenticates one
   * `GET /v0/accounts/{creator}/status` read. A 200 binds the claim to THIS
   * session and THIS identity — the second of the two paths allowed to
   * record a verified claim. With a local key the server's
   * `key_fingerprint`, `account_index`, and `first_derived_address` MUST all
   * agree with it (any mismatch → refuse, record nothing); without one (a
   * fresh device, a Bitkit-set-up seller) the server's fingerprint and first
   * address are recorded and shown as the identity being enabled (§B.6) —
   * they are presented to the seller for OUT-OF-BAND comparison against
   * their own wallet, which is the only check possible with no local key.
   */
  const verifyWithRing = () => {
    const previous = activeVerifyRef.current;
    activeVerifyRef.current = null;
    if (previous) previous.cancel();
    setVerifyError(null);
    setStatusEndpointUnavailable(false);

    let flow: ClaimStatusFlow;
    try {
      flow = CommerceController.beginPaykitClaimStatusFlow();
    } catch (error) {
      Logger.error('Failed to start the Ring verification flow', { error });
      setVerifyError(getErrorMessage(error));
      setVerifyStatus('error');
      return;
    }
    activeVerifyRef.current = flow;
    setVerifyAuthorizationUrl(flow.authorizationUrl);
    setVerifyStatus('awaiting');

    flow
      .awaitStatus()
      .then((outcome) => {
        if (activeVerifyRef.current !== flow) return;
        activeVerifyRef.current = null;
        setVerifyAuthorizationUrl('');
        if (!outcome.ok) {
          // Fail closed on 401/403/5xx/network/parse — and on 404, which
          // means the deployed server predates W1.13 (or nothing is
          // claimed): the gate stays shut either way, with the extra
          // not-available line on the 404.
          if (outcome.reason === 'not_deployed') setStatusEndpointUnavailable(true);
          setVerifyError(BITCOIN_ENABLE_BLOCKED_COPY.claim_unknown);
          setVerifyStatus('error');
          setBitcoinEnabledState(false);
          return;
        }
        const status = outcome.status;
        // The local key the server fingerprint must agree with: the current
        // key text first, then the persisted claim's xpub.
        const localKey =
          normalizedInput?.ok === true
            ? normalizedInput
            : verifiedClaim?.xpub
              ? normalizeAccountXpub(verifiedClaim.xpub, network)
              : null;
        if (localKey?.ok && accountKeyFingerprint(localKey.bytes) !== status.keyFingerprint) {
          setVerifyError(BITCOIN_ENABLE_BLOCKED_COPY.key_changed);
          setVerifyStatus('error');
          // Do NOT record: the server watches a different key than the one
          // this seller is looking at.
          setBitcoinEnabledState(false);
          return;
        }
        // W1.13 r3: with a local key the server's derivation coordinates
        // must agree with it too — the persisted account index must be the
        // one the key itself declares, and the stable first address must
        // re-derive from the key at the immutable `first_child_index` (the
        // mutable `next_child_index` cursor is informational and never
        // compared).
        if (localKey?.ok && status.accountIndex !== accountIndexFromBytes(localKey.bytes)) {
          setVerifyError(BITCOIN_ENABLE_BLOCKED_COPY.account_index_mismatch);
          setVerifyStatus('error');
          // Do NOT record.
          setBitcoinEnabledState(false);
          return;
        }
        if (
          localKey?.ok &&
          status.firstDerivedAddress !== deriveBip84P2wpkhAddress(localKey.bytes, network!, status.firstChildIndex)
        ) {
          setVerifyError(BITCOIN_ENABLE_BLOCKED_COPY.address_mismatch);
          setVerifyStatus('error');
          // Do NOT record.
          setBitcoinEnabledState(false);
          return;
        }
        const verified: VerifiedPaykitClaim = {
          xpub: localKey?.ok ? localKey.xpub : null,
          keyFingerprintHex: status.keyFingerprint,
          accountIndex: localKey?.ok ? accountIndexFromBytes(localKey.bytes) : null,
          firstDerivedAddress: status.firstDerivedAddress,
          verifiedAt: Date.now(),
          source: 'authenticated_status',
          firstChildIndex: status.firstChildIndex,
          allocationMode: status.allocationMode,
          claimChannel: status.claimChannel,
          downgradeReason: status.downgradeReason,
        };
        setVerifiedClaim(verified);
        if (verified.xpub) {
          const xpub = verified.xpub;
          setXpubInput((current) => (current.trim() ? current : xpub));
        }
        persistVerifiedClaim(verified);
        setAccountClaimed(true);
        setVerifyStatus('verified');
        toast({ title: 'Watch-only account verified', description: 'The claim is confirmed for this identity.' });
      })
      .catch((error: unknown) => {
        if (activeVerifyRef.current !== flow) return;
        activeVerifyRef.current = null;
        Logger.error('Ring verification failed', { error });
        setVerifyAuthorizationUrl('');
        setVerifyError(getErrorMessage(error));
        setVerifyStatus('error');
      });
  };

  useEffect(() => {
    return () => {
      const claimFlow = activeClaimRef.current;
      activeClaimRef.current = null;
      if (claimFlow) claimFlow.cancel();
      const verifyFlow = activeVerifyRef.current;
      activeVerifyRef.current = null;
      if (verifyFlow) verifyFlow.cancel();
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
    verifiedClaim,
    bitcoinEnabled,
    setBitcoinEnabled,
    canEnableBitcoin,
    bitcoinEnableBlockedReason,
    xpubInput,
    setXpubInput,
    startClaim,
    cancelClaim,
    verifyStatus,
    verifyAuthorizationUrl,
    verifyError,
    statusEndpointUnavailable,
    verifyWithRing,
    cancelVerify,
  };
}
