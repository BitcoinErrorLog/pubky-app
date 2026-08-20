'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { getCommerceAdapterMode, isDurableCommerceMode } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { buildMarketplaceOrderAggregateId, isMarketplaceRevisionConflict } from '@/libs/commerce/transaction-commands';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceDisputeCaseFile, MarketplaceOrder } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type MarketplaceDisputeEvidenceFormData,
  marketplaceDisputeEvidenceFormDefaults,
  marketplaceDisputeEvidenceFormSchema,
  type MarketplaceDisputeResolveFormData,
  marketplaceDisputeResolveFormDefaults,
  marketplaceDisputeResolveFormSchema,
} from './useMarketplaceDisputeCase.types';

/**
 * One dispute case file — durable transaction service only. Loads the fresh
 * single-order projection (`GET /v1/orders/{id}`, the source of the
 * `expected_revision` every adjudication command must carry) together with
 * the scoped evidence read (`GET /v1/orders/{id}/evidence`), which is the
 * ONLY place evidence bodies exist client-side; order projections carry just
 * a content-free count.
 *
 * Loading starts when `active` turns true (the case dialog opening), never
 * eagerly: a moderator-role evidence read is audited server-side, so the
 * client must not trigger it as a side effect of rendering a list.
 *
 * Both `dispute.evidence` and `dispute.resolve` send the freshly-read
 * order's revision; a `REVISION_CONFLICT` reloads the case file and asks the
 * user to retry against what actually changed — never a blind resubmit.
 */
export function useMarketplaceDisputeCase(orderId: string, active: boolean) {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [order, setOrder] = useState<MarketplaceOrder | null>(null);
  const [caseFile, setCaseFile] = useState<MarketplaceDisputeCaseFile | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const evidenceForm = useForm<MarketplaceDisputeEvidenceFormData>({
    resolver: zodResolver(marketplaceDisputeEvidenceFormSchema),
    defaultValues: marketplaceDisputeEvidenceFormDefaults,
    mode: 'onChange',
  });
  const resolveForm = useForm<MarketplaceDisputeResolveFormData>({
    resolver: zodResolver(marketplaceDisputeResolveFormSchema),
    defaultValues: marketplaceDisputeResolveFormDefaults,
    mode: 'onChange',
  });

  const refresh = () => loadCase(currentUserPubky, orderId, setOrder, setCaseFile, setIsLoading, setError);

  useEffect(() => {
    if (!active) return;
    void loadCase(currentUserPubky, orderId, setOrder, setCaseFile, setIsLoading, setError);
  }, [active, orderId, currentUserPubky]);

  const executeAgainstFreshOrder = async (kind: string, payload: Record<string, unknown>): Promise<boolean> => {
    if (!order) return false;
    try {
      const response = await CommerceController.executeMarketplaceCommand({
        version: 1,
        commandId: crypto.randomUUID(),
        aggregateId: buildMarketplaceOrderAggregateId(order.id),
        expectedRevision: order.revision,
        issuedAt: new Date().toISOString(),
        kind,
        payload: { orderId: order.id, ...payload },
      });
      if (!response.ok) {
        if (isMarketplaceRevisionConflict(response)) {
          await refresh();
          toast({
            variant: 'error',
            description: 'This dispute changed since you loaded it. The latest state was reloaded — retry from there.',
          });
          return false;
        }
        toast({ variant: 'error', description: response.error.message });
        return false;
      }
      await refresh();
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not update this dispute.' });
      return false;
    }
  };

  const submitEvidence = async (): Promise<boolean> => {
    let succeeded = false;
    await evidenceForm.handleSubmit(async (data) => {
      succeeded = await executeAgainstFreshOrder('dispute.evidence', { body: data.body });
      if (succeeded) evidenceForm.reset(marketplaceDisputeEvidenceFormDefaults);
    })();
    return succeeded;
  };

  const resolve = async (): Promise<boolean> => {
    let succeeded = false;
    await resolveForm.handleSubmit(async (data) => {
      succeeded = await executeAgainstFreshOrder('dispute.resolve', {
        resolution: data.resolution,
        rationale: data.rationale,
      });
    })();
    return succeeded;
  };

  const isParticipant = Boolean(
    order && currentUserPubky && (order.buyerPubky === currentUserPubky || order.sellerPubky === currentUserPubky),
  );
  const isDisputeOpen = Boolean(order && order.state === 'disputed' && order.dispute?.state === 'open');
  // The service accepts `dispute.evidence` from participants only, on open
  // disputes only — moderators adjudicate, they do not testify.
  const canSubmitEvidence = isParticipant && isDisputeOpen;

  return {
    order,
    caseFile,
    isLoading,
    error,
    refresh,
    evidenceForm,
    resolveForm,
    submitEvidence,
    resolve,
    isParticipant,
    isDisputeOpen,
    canSubmitEvidence,
  };
}

async function loadCase(
  currentUserPubky: string | null,
  orderId: string,
  setOrder: Dispatch<SetStateAction<MarketplaceOrder | null>>,
  setCaseFile: Dispatch<SetStateAction<MarketplaceDisputeCaseFile | null>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
): Promise<void> {
  if (!currentUserPubky || !isDurableCommerceMode(getCommerceAdapterMode())) return;
  setIsLoading(true);
  try {
    const [order, caseFile] = await Promise.all([
      CommerceController.getMarketplaceOrder(orderId),
      CommerceController.getMarketplaceOrderEvidence(orderId),
    ]);
    if (!order || !caseFile) {
      // The service's deliberate 404: an absent order and a no-access order
      // are indistinguishable, so the client cannot claim to know which.
      setOrder(null);
      setCaseFile(null);
      setError('This case file is not available to this account.');
      return;
    }
    setOrder(order);
    setCaseFile(caseFile);
    setError(null);
  } catch (loadError) {
    setError(
      loadError instanceof Error && loadError.name === 'AppError'
        ? loadError.message
        : 'The dispute case file is unavailable.',
    );
  } finally {
    setIsLoading(false);
  }
}
