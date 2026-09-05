'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { feedProposalToCreateParams } from '@/libs/pubchi/feed-map';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import type { Phase0Purpose } from '@/libs/pubchi/schemas';
import { getPubchiSigningSeedCopy, usePubchiSigningAvailable } from '@/libs/pubchi/signing-seed';
import { toast } from '@/molecules/Toaster/use-toast';
import {
  type PubchiQueryFormData,
  pubchiQueryFormDefaults,
  pubchiQueryFormSchema,
  QUERY_FORM_FIELDS,
} from './usePubchiQuery.types';

const SIGNING_UNAVAILABLE =
  'Pubchi signing is unavailable for this session type in Phase 0; sign in with your recovery phrase or key to use it';

export function usePubchiQuery() {
  const signingAvailable = usePubchiSigningAvailable((state) => state.available);
  const [result, setResult] = useState<PubchiQuerySuccess | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const form = useForm<PubchiQueryFormData>({
    resolver: zodResolver(pubchiQueryFormSchema),
    defaultValues: pubchiQueryFormDefaults,
  });

  const submit = async (purpose: Phase0Purpose): Promise<boolean> => {
    if (!isPubchiPanelEnabled()) {
      setErrorCode('PUBCHI_DISABLED');
      toast({ variant: 'error', title: 'PUBCHI_DISABLED', dismissButton: true });
      return false;
    }
    if (!signingAvailable) {
      setErrorCode(SIGNING_UNAVAILABLE);
      return false;
    }
    const valid = await form.trigger();
    if (!valid) return false;
    setLoading(true);
    setErrorCode(undefined);
    const secretSeed = getPubchiSigningSeedCopy();
    if (!secretSeed) {
      setLoading(false);
      setErrorCode(SIGNING_UNAVAILABLE);
      return false;
    }
    try {
      const values = form.getValues();
      const next = await PubchiController.fetchPubchiQuery({
        question: values[QUERY_FORM_FIELDS.QUESTION],
        purpose,
        secretSeed,
      });
      setResult(next);
      return true;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
      setErrorCode(message);
      setResult(undefined);
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    } finally {
      secretSeed.fill(0);
      setLoading(false);
    }
  };

  const applyFeed = async (): Promise<boolean> => {
    if (!result || result.kind !== 'feed' || !result.applyAllowed) return false;
    try {
      await FeedController.commitCreate(feedProposalToCreateParams(result.result));
      toast({ variant: 'default', title: 'Feed applied', dismissButton: true });
      return true;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'FEED_SPECS_INVALID';
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    }
  };

  return {
    form,
    submit,
    applyFeed,
    result,
    errorCode,
    loading,
    enabled: isPubchiPanelEnabled(),
    signingAvailable,
    signingUnavailableMessage: SIGNING_UNAVAILABLE,
  };
}
