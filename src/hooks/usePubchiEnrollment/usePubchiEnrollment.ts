'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { capabilitiesCoverPubchiWrite } from '@/libs/pubchi/capabilities';
import { getCurrentDeviceKey } from '@/libs/pubchi/device-key';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import type { OwnerBindingV1 } from '@/libs/pubchi/schemas';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  ENROLL_FORM_FIELDS,
  type EnrollPubchiFormData,
  enrollPubchiFormDefaults,
  enrollPubchiFormSchema,
} from './usePubchiEnrollment.types';

export function usePubchiEnrollment() {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const session = useAuthStore((state) => state.session);
  const [binding, setBinding] = useState<OwnerBindingV1 | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof PubchiController.listDeviceKeys>>>([]);
  const [currentSigner, setCurrentSigner] = useState<string>();
  const needsReapproval = !capabilitiesCoverPubchiWrite(session?.info.capabilities ?? []);
  const approvalCancelRef = useRef<(() => void) | null>(null);

  const cancelReapproval = () => {
    approvalCancelRef.current?.();
    approvalCancelRef.current = null;
  };

  useEffect(() => {
    return () => {
      approvalCancelRef.current?.();
      approvalCancelRef.current = null;
    };
  }, []);

  const form = useForm<EnrollPubchiFormData>({
    resolver: zodResolver(enrollPubchiFormSchema),
    defaultValues: enrollPubchiFormDefaults,
  });

  useEffect(() => {
    if (!isPubchiEnabled()) {
      setBinding(undefined);
      return;
    }
    void Promise.all([PubchiController.reconcileActiveBinding(), PubchiController.listDeviceKeys()]).then(
      ([nextBinding, nextDevices]) => {
        setBinding(nextBinding);
        setDevices(nextDevices);
        if (owner) {
          void getCurrentDeviceKey(owner).then((key) => setCurrentSigner(key?.signer));
        }
      },
    );
  }, [owner]);

  const submit = async (): Promise<boolean> => {
    let ok = false;
    await form.handleSubmit(
      async (values) => {
        setLoading(true);
        try {
          const next = await PubchiController.commitCreateBinding({ bot: values[ENROLL_FORM_FIELDS.BOT] });
          setBinding(next);
          setDevices(await PubchiController.listDeviceKeys());
          form.reset(enrollPubchiFormDefaults);
          toast({ variant: 'default', title: 'Pubchi bot enrolled', dismissButton: true });
          ok = true;
        } catch (error) {
          const message = error instanceof AppError ? error.message : 'INVALID_PUBKY';
          toast({ variant: 'error', title: message, dismissButton: true });
        } finally {
          setLoading(false);
        }
      },
      () => {
        document.getElementById(ENROLL_FORM_FIELDS.BOT)?.focus();
      },
    )();
    return ok;
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

  const revokeDevice = async (signer: string): Promise<boolean> => {
    setLoading(true);
    try {
      await PubchiController.revokeDevice(signer);
      setDevices(await PubchiController.listDeviceKeys());
      return true;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const revokeAllDevices = async (): Promise<boolean> => {
    setLoading(true);
    try {
      await PubchiController.revokeAllDevices();
      setDevices([]);
      return true;
    } catch (error) {
      const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    } finally {
      setLoading(false);
    }
  };

  const reapprove = async (): Promise<boolean> => {
    cancelReapproval();
    try {
      const { authorizationUrl, awaitApproval, cancelAuthFlow } = await PubchiController.getCapabilityApprovalUrl();
      approvalCancelRef.current = cancelAuthFlow;
      window.open(authorizationUrl, '_blank', 'noopener,noreferrer');
      try {
        const approved = await awaitApproval;
        await PubchiController.adoptCapabilityApproval(approved);
        return true;
      } finally {
        cancelAuthFlow();
        if (approvalCancelRef.current === cancelAuthFlow) {
          approvalCancelRef.current = null;
        }
      }
    } catch (error) {
      cancelReapproval();
      const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
      toast({ variant: 'error', title: message, dismissButton: true });
      return false;
    }
  };

  return {
    form,
    submit,
    remove,
    revokeDevice,
    revokeAllDevices,
    binding,
    devices,
    currentSigner,
    needsReapproval,
    reapprove,
    cancelReapproval,
    loading,
    enabled: isPubchiEnabled(),
  };
}
