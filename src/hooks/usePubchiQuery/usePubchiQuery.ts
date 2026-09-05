'use client';

import { useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { ValidationErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { Identity } from '@/libs/identity/identity';
import { feedProposalToCreateParams } from '@/libs/pubchi/feed-map';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { toast } from '@/molecules/Toaster/use-toast';
import { useOnboardingStore } from '@/stores/onboarding/onboarding.store';
import {
  type PubchiQueryFormData,
  pubchiQueryFormDefaults,
  pubchiQueryFormSchema,
  QUERY_FORM_FIELDS,
} from './usePubchiQuery.types';

function secretSeedFromSession(): Uint8Array {
  const secretKey = useOnboardingStore.getState().secretKey;
  if (!secretKey) {
    throw Err.validation(ValidationErrorCode.MISSING_FIELD, 'SIGNATURE_INVALID', {
      service: ErrorService.Pubchi,
      operation: 'signRequest',
    });
  }
  return Identity.keypairFromSecretKey(secretKey).secret();
}

export function usePubchiQuery() {
  const [result, setResult] = useState<PubchiQuerySuccess | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const form = useForm<PubchiQueryFormData>({
    resolver: zodResolver(pubchiQueryFormSchema),
    defaultValues: pubchiQueryFormDefaults,
  });

  const submit = async (): Promise<boolean> => {
    if (!isPubchiPanelEnabled()) {
      setErrorCode('PUBCHI_DISABLED');
      toast({ variant: 'error', title: 'PUBCHI_DISABLED', dismissButton: true });
      return false;
    }
    const valid = await form.trigger();
    if (!valid) return false;
    setLoading(true);
    setErrorCode(undefined);
    try {
      const values = form.getValues();
      const next = await PubchiController.fetchPubchiQuery({
        question: values[QUERY_FORM_FIELDS.QUESTION],
        secretSeed: secretSeedFromSession(),
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
  };
}
