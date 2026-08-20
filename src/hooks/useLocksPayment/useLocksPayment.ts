'use client';

import { useEffect, useState } from 'react';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { LocksAccessCredential, LocksVerificationLifecycle } from '@/services/locks/locks';

export function useLocksPayment({
  creatorPubky,
  lockResource,
  criterionId,
}: {
  creatorPubky: string;
  lockResource: string;
  criterionId: string;
}) {
  const [bundleId, setBundleId] = useState<string | null>(null);
  const [lifecycle, setLifecycle] = useState<LocksVerificationLifecycle | null>(null);
  const [credential, setCredential] = useState<LocksAccessCredential | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);

  const start = async () => {
    setIsStarting(true);
    setCredential(null);
    setError(null);
    try {
      // Bundle ids are canonical Locks identifiers; the SDK generates them.
      const nextBundleId = await CommerceController.generateLocksBundleId();
      const next = await CommerceController.submitLocksPaykitProof({
        creatorPubky,
        bundleId: nextBundleId,
        lockResource,
        criterionId,
      });
      setBundleId(next.bundle_id);
      setLifecycle(next);
      return true;
    } catch {
      setError('Could not create the Locks/Paykit payment request.');
      return false;
    } finally {
      setIsStarting(false);
    }
  };

  useEffect(() => {
    if (!bundleId || !lifecycle) return;
    if (lifecycle.status === 'completed' || lifecycle.status === 'failed' || lifecycle.status === 'expired') return;
    let active = true;
    const poll = async () => {
      try {
        const next = await CommerceController.lookupLocksVerification(creatorPubky, bundleId);
        if (!active) return;
        setLifecycle(next);
        if (next.status === 'completed') {
          const issued = await CommerceController.issueLocksAccessCredential(creatorPubky, bundleId);
          if (active) setCredential(issued);
        }
      } catch {
        if (active) setError('Payment verification is retrying.');
      }
    };
    const timer = window.setInterval(poll, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [bundleId, creatorPubky, lifecycle]);

  return { lifecycle, credential, error, isStarting, start };
}
