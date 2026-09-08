'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { getCurrentDeviceKey } from '@/libs/pubchi/device-key';
import { feedProposalToCreateParams } from '@/libs/pubchi/feed-map';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import type { Phase0Purpose } from '@/libs/pubchi/schemas';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type PubchiQueryFormData,
  pubchiQueryFormDefaults,
  pubchiQueryFormSchema,
  QUERY_FORM_FIELDS,
} from './usePubchiQuery.types';

const SIGNING_UNAVAILABLE = 'This browser is not enrolled. Enroll a bot in Settings → Pubchi.';

export function usePubchiQuery() {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const [signingAvailable, setSigningAvailable] = useState(false);
  const [result, setResult] = useState<PubchiQuerySuccess | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const form = useForm<PubchiQueryFormData>({
    resolver: zodResolver(pubchiQueryFormSchema),
    defaultValues: pubchiQueryFormDefaults,
  });

  useEffect(() => {
    if (!owner) return;
    void getCurrentDeviceKey(owner).then((key) => setSigningAvailable(Boolean(key)));
  }, [owner]);

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
    let ok = false;
    await form.handleSubmit(
      async (values) => {
        setLoading(true);
        setErrorCode(undefined);
        try {
          const next = await PubchiController.fetchPubchiQuery({
            question: values[QUERY_FORM_FIELDS.QUESTION],
            purpose,
          });
          setResult(next);
          ok = true;
        } catch (error) {
          const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
          setErrorCode(message);
          setResult(undefined);
          toast({ variant: 'error', title: message, dismissButton: true });
        } finally {
          setLoading(false);
        }
      },
      () => {
        document.getElementById(QUERY_FORM_FIELDS.QUESTION)?.focus();
      },
    )();
    return ok;
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
