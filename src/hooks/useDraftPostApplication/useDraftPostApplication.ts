'use client';

import { useEffect, useState } from 'react';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { isPubchiEnabled } from '@/libs/pubchi/flags';

export function useDraftPostApplication(recordId?: string, visible = true) {
  const [status, setStatus] = useState<string>('proposed');

  useEffect(() => {
    let active = true;
    if (!visible || !recordId || !isPubchiEnabled()) {
      setStatus('proposed');
      return;
    }
    void PubchiController.getDraftPostStatus(recordId).then(async (stored) => {
      if (!active) return;
      const next = stored ?? 'proposed';
      setStatus(next);
      if (next !== 'applying' && next !== 'reconciliation-pending') return;
      setStatus('reconciling');
      const reconciled = await PubchiController.reconcileDraftPost(recordId);
      if (active) setStatus(reconciled);
    });
    return () => {
      active = false;
    };
  }, [recordId, visible]);

  const approve = async () => {
    if (!recordId) {
      setStatus('failed');
      return;
    }
    setStatus('applying');
    try {
      const next = await PubchiController.applyDraftPost(recordId);
      setStatus(next);
    } catch {
      const stored = await PubchiController.getDraftPostStatus(recordId);
      setStatus(stored ?? 'failed');
    }
  };

  const reject = async () => {
    if (!recordId) {
      setStatus('failed');
      return;
    }
    setStatus('rejecting');
    try {
      await PubchiController.rejectDraftPost(recordId);
      setStatus('rejected');
    } catch {
      const stored = await PubchiController.getDraftPostStatus(recordId);
      setStatus(stored ?? 'failed');
    }
  };

  const revert = async () => {
    if (!recordId) {
      setStatus('reconciliation-pending');
      return;
    }
    setStatus('reconciling');
    try {
      await PubchiController.revertDraftPost(recordId);
      setStatus('reverted');
    } catch {
      setStatus('reconciliation-pending');
    }
  };

  const reconcile = async () => {
    if (!recordId) return;
    setStatus('reconciling');
    const next = await PubchiController.reconcileDraftPost(recordId);
    setStatus(next);
  };

  return { status, approve, reject, revert, reconcile };
}
