'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { FeedController } from '@/controllers/feed/feed';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { pubchiErrorCopy } from '@/libs/pubchi/error-copy';
import { feedProposalToCreateParams } from '@/libs/pubchi/feed-map';
import { recordPubchiBuiltFeed } from '@/libs/pubchi/feed-provenance';
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

const SIGNING_UNAVAILABLE = "This browser isn't set up for Pubchi yet. Set it up to start asking.";

export function usePubchiQuery() {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const [signingAvailable, setSigningAvailable] = useState(false);
  const [pubchiAvailable, setPubchiAvailable] = useState<boolean | undefined>(undefined);
  const [setupLoading, setSetupLoading] = useState(false);
  const [result, setResult] = useState<PubchiQuerySuccess | undefined>(undefined);
  const [errorCode, setErrorCode] = useState<string | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);

  const form = useForm<PubchiQueryFormData>({
    resolver: zodResolver(pubchiQueryFormSchema),
    defaultValues: pubchiQueryFormDefaults,
  });

  const setupDevice = async (): Promise<boolean> => {
    setSetupLoading(true);
    try {
      const pubchi = await PubchiController.loadPubchi();
      const available = Boolean(pubchi?.verified);
      setPubchiAvailable(available);
      if (!available) {
        setSigningAvailable(false);
        return false;
      }
      const ready = await PubchiController.ensureDeviceReady();
      setSigningAvailable(ready);
      return ready;
    } catch {
      setSigningAvailable(false);
      return false;
    } finally {
      setSetupLoading(false);
    }
  };

  useEffect(() => {
    if (!owner) return;
    void setupDevice();
  }, [owner]);

  useEffect(() => {
    if (!loading) {
      setElapsedMs(0);
      return;
    }
    const startedAt = Date.now();
    const timer = window.setInterval(() => setElapsedMs(Date.now() - startedAt), 50);
    return () => window.clearInterval(timer);
  }, [loading]);

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
          const code = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
          const { message } = pubchiErrorCopy(code);
          setErrorCode(code);
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
    const owner = useAuthStore.getState().currentUserPubky;
    if (!owner) return false;
    let feedId: string | undefined;
    try {
      const feed = await FeedController.commitCreate(feedProposalToCreateParams(result.result));
      feedId = feed.id;
      await recordPubchiBuiltFeed(owner, result.result, feed);
      toast({ variant: 'default', title: 'Feed applied', dismissButton: true });
      return true;
    } catch (error) {
      if (feedId) {
        await FeedController.commitDelete({ feedId }).catch(() => undefined);
      }
      const code = error instanceof AppError ? error.message : 'FEED_SPECS_INVALID';
      toast({ variant: 'error', title: pubchiErrorCopy(code).message, dismissButton: true });
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
    elapsedMs,
    enabled: isPubchiPanelEnabled(),
    pubchiAvailable,
    signingAvailable,
    signingUnavailableMessage: SIGNING_UNAVAILABLE,
    setupDevice,
    setupLoading,
  };
}
