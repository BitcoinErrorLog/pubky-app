'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import type { OwnerBindingV1 } from '@/libs/pubchi/schemas';
import { toast } from '@/molecules/Toaster/toast';
import {
  ENROLL_FORM_FIELDS,
  type EnrollPubchiFormData,
  enrollPubchiFormDefaults,
  enrollPubchiFormSchema,
} from './usePubchiEnrollment.types';

export function usePubchiEnrollment() {
  const [binding, setBinding] = useState<OwnerBindingV1 | undefined>(undefined);
  const [loading, setLoading] = useState(false);

  const form = useForm<EnrollPubchiFormData>({
    resolver: zodResolver(enrollPubchiFormSchema),
    defaultValues: enrollPubchiFormDefaults,
  });

  useEffect(() => {
    if (!isPubchiEnabled()) {
      setBinding(undefined);
      return;
    }
    void PubchiController.reconcileActiveBinding().then(setBinding);
  }, []);

  const submit = async (): Promise<boolean> => {
    const valid = await form.trigger();
    if (!valid) return false;
    setLoading(true);
    try {
      const values = form.getValues();
      const next = await PubchiController.commitCreateBinding({ bot: values[ENROLL_FORM_FIELDS.BOT] });
      setBinding(next);
      form.reset(enrollPubchiFormDefaults);
      toast({ variant: 'default', title: 'Pubchi bot enrolled', dismissButton: true });
      return true;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'INVALID_PUBKY';
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const remove = async (): Promise<boolean> => {
    setLoading(true);
    try {
      await PubchiController.commitDeleteBinding();
      setBinding(undefined);
      toast({ variant: 'default', title: 'Pubchi bot removed', dismissButton: true });
      return true;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    } finally {
      setLoading(false);
    }
  };

  return { form, submit, remove, binding, loading, enabled: isPubchiEnabled() };
}
