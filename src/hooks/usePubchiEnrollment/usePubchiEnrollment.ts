'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { AppError } from '@/libs/error/error';
import { BotPhraseRevealController } from '@/libs/pubchi/bot-phrase-reveal';
import { capabilitiesCoverPubchiWrite } from '@/libs/pubchi/capabilities';
import { getCurrentDeviceKey } from '@/libs/pubchi/device-key';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import type { OwnerBindingV1, PubchiConfigV1 } from '@/libs/pubchi/schemas';
import { toast } from '@/molecules/Toaster/toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type BackupConfirmationData,
  backupConfirmationDefaults,
  backupConfirmationSchema,
  ENROLL_FORM_FIELDS,
  type EnrollPubchiFormData,
  enrollPubchiFormDefaults,
  enrollPubchiFormSchema,
} from './usePubchiEnrollment.types';

export function usePubchiEnrollment() {
  const owner = useAuthStore((state) => state.currentUserPubky);
  const session = useAuthStore((state) => state.session);
  const [binding, setBinding] = useState<OwnerBindingV1 | undefined>(undefined);
  const [pubchi, setPubchi] = useState<Awaited<ReturnType<typeof PubchiController.loadPubchi>>>(undefined);
  const [config, setConfig] = useState<PubchiConfigV1 | null>(null);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupPositions, setBackupPositions] = useState<number[]>([]);
  const [backupController] = useState(() => new BotPhraseRevealController());
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof PubchiController.listDeviceKeys>>>([]);
  const [currentSigner, setCurrentSigner] = useState<string | undefined>(undefined);
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
      backupController.clear();
      if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
    };
  }, [backupController]);

  const form = useForm<EnrollPubchiFormData>({
    resolver: zodResolver(enrollPubchiFormSchema),
    defaultValues: enrollPubchiFormDefaults,
  });
  const backupForm = useForm<BackupConfirmationData>({
    resolver: zodResolver(backupConfirmationSchema),
    defaultValues: backupConfirmationDefaults,
  });

  useEffect(() => {
    if (!isPubchiEnabled()) {
      setBinding(undefined);
      return;
    }
    void (async () => {
      try {
        const nextPubchi =
          typeof PubchiController.loadPubchi === 'function' ? await PubchiController.loadPubchi() : undefined;
        const nextBinding = await PubchiController.reconcileActiveBinding();
        const [nextDevices, nextConfig] = await Promise.all([
          typeof PubchiController.listDeviceKeys === 'function' ? PubchiController.listDeviceKeys() : Promise.resolve([]),
          typeof PubchiController.loadPubchiConfig === 'function'
            ? PubchiController.loadPubchiConfig()
            : Promise.resolve(null),
        ]);
        setBinding(nextBinding);
        setPubchi(nextPubchi);
        setDevices(nextDevices);
        setConfig(nextConfig);
        if (owner) {
          void getCurrentDeviceKey(owner).then((key) => setCurrentSigner(key?.signer));
        }
      } catch {
        setBinding(undefined);
        setPubchi(undefined);
        setDevices([]);
        setConfig(null);
        toast({ variant: 'error', title: 'Pubchi could not be loaded', dismissButton: true });
      }
    })();
  }, [owner]);

  const saveConfig = async (partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1 | undefined> => {
    if (typeof PubchiController.savePubchiConfig !== 'function') return undefined;
    const next = await PubchiController.savePubchiConfig(partial);
    setConfig(next);
    return next;
  };

  const submit = async (): Promise<boolean> => {
    let ok = false;
    await form.handleSubmit(
      async (values) => {
        setLoading(true);
        setCreating(true);
        try {
          const next = await PubchiController.createPubchi({
            displayName: values[ENROLL_FORM_FIELDS.DISPLAY_NAME],
          });
          backupController.set(next.phrase);
          if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
          phraseTimerRef.current = setTimeout(() => {
            backupController.clear();
            setBackupOpen(false);
            backupForm.reset(backupConfirmationDefaults);
          }, 5 * 60 * 1000);
          setPubchi({
            bot: next.bot,
            displayName: next.displayName,
            createdAt: next.createdAt,
            backupConfirmedAt: next.backupConfirmedAt,
            verified: next.verified,
          });
          setBinding(await PubchiController.reconcileActiveBinding());
          setDevices(await PubchiController.listDeviceKeys());
          form.reset(enrollPubchiFormDefaults);
          toast({ variant: 'default', title: 'Pubchi created', dismissButton: true });
          ok = true;
        } catch (error) {
          if (error instanceof AppError && error.message === 'PUBCHI_ALREADY_EXISTS') {
            try {
              setPubchi(await PubchiController.loadPubchi());
              setBinding(await PubchiController.reconcileActiveBinding());
              toast({
                variant: 'info',
                title: 'You already have a Pubchi on this account. It is shown below.',
                dismissButton: true,
              });
            } catch {
              toast({
                variant: 'error',
                title: 'Pubchi could not be loaded',
                dismissButton: true,
              });
            }
          } else {
            toast({
              variant: 'error',
              title: 'Pubchi could not be created because the homeserver state could not be verified',
              dismissButton: true,
            });
          }
        } finally {
          setCreating(false);
          setLoading(false);
        }
      },
      () => {
        document.getElementById(ENROLL_FORM_FIELDS.DISPLAY_NAME)?.focus();
      },
    )();
    return ok;
  };

  const remove = async (): Promise<boolean> => {
    setLoading(true);
    try {
      await PubchiController.commitDeleteBinding({ bot: binding?.bot });
      setBinding(undefined);
      setPubchi(undefined);
      backupController.clear();
      if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
      setBackupOpen(false);
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

  const openBackup = (): void => {
    if (!backupController.reveal()) {
      toast({ variant: 'warning', title: 'This key is no longer available', dismissButton: true });
      return;
    }
    setBackupPositions(randomWordPositions());
    backupForm.reset(backupConfirmationDefaults);
    setBackupOpen(true);
  };

  const closeBackup = (): void => {
    backupForm.reset(backupConfirmationDefaults);
    backupController.clear();
    if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
    setBackupOpen(false);
  };

  const confirmBackup = async (): Promise<boolean> => {
    let ok = false;
    await backupForm.handleSubmit(async (values) => {
      const phrase = backupController.phraseForConfirmation();
      if (!phrase) return;
      setLoading(true);
      try {
        const entered = [values.wordOne, values.wordTwo, values.wordThree];
        const next = await PubchiController.confirmBackup({
          phrase,
          confirmations: backupPositions.map((position, index) => ({ position, word: entered[index] ?? '' })),
        });
        setPubchi(next);
        backupController.clear();
        if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
        closeBackup();
        toast({ variant: 'default', title: 'Pubchi key backup confirmed', dismissButton: true });
        ok = true;
      } catch (error) {
        backupForm.reset(backupConfirmationDefaults);
        const isMismatch =
          error instanceof AppError && (error.message === 'SIGNATURE_INVALID' || error.message === 'BOT_MISMATCH');
        const locked = isMismatch && backupController.recordMismatch();
        if (locked) {
          if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
          setBackupOpen(false);
          toast({
            variant: 'warning',
            title: 'Too many mismatches. The recovery phrase has been cleared.',
            dismissButton: true,
          });
        } else if (isMismatch) {
          toast({ variant: 'error', title: 'Those words did not match', dismissButton: true });
        } else {
          toast({ variant: 'error', title: 'Could not verify the recovery phrase. Try again.', dismissButton: true });
        }
      } finally {
        setLoading(false);
      }
    })();
    return ok;
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
    backupForm,
    submit,
    confirmBackup,
    openBackup,
    closeBackup,
    remove,
    revokeDevice,
    revokeAllDevices,
    binding,
    pubchi,
    config,
    saveConfig,
    creating,
    backupOpen,
    backupPositions,
    backupController,
    devices,
    currentSigner,
    needsReapproval,
    reapprove,
    cancelReapproval,
    loading,
    enabled: isPubchiEnabled(),
  };
}

function randomWordPositions(): number[] {
  const positions = new Set<number>();
  while (positions.size < 3) {
    const value = new Uint32Array(1);
    crypto.getRandomValues(value);
    positions.add(value[0]! % 12);
    value.fill(0);
  }
  return [...positions].sort((a, b) => a - b);
}
