'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import {
  PUBCHI_SYNC_DEBOUNCE_MS,
  PUBCHI_SYNC_MAX_AGE_MS,
  subscribeToPubchiSync,
} from '@/controllers/pubchi/pubchi-sync';
import { AppError } from '@/libs/error/error';
import { BotPhraseRevealController } from '@/libs/pubchi/bot-phrase-reveal';
import { capabilitiesCoverPubchiWrite, PUBCHI_PRIVATE_DIRECTORY, sessionCovers } from '@/libs/pubchi/capabilities';
import { getCurrentDeviceKey } from '@/libs/pubchi/device-key';
import { isPubchiEnabled } from '@/libs/pubchi/flags';
import { readPendingDelegationDeletes } from '@/libs/pubchi/pending-delegation-deletes';
import type { OwnerBindingV1, PubchiConfigV1, PubchiOwnerContextV1 } from '@/libs/pubchi/schemas';
import type { Pubky } from '@/models/models.types';
import { toast } from '@/molecules/Toaster/toast';
import { AUTH_FLOW_CANCELED_ERROR_NAME } from '@/services/homeserver/error.utils';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
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
  const storedPubchi = usePubchiStore((state) => state.pubchi);
  const storedConfig = usePubchiStore((state) => state.config);
  const storedContext = usePubchiStore((state) => state.context);
  const storedOwner = usePubchiStore((state) => state.ownerPubky);
  const lastUpdatedAt = usePubchiStore((state) => state.lastUpdatedAt);
  const pubchi = owner && storedOwner === owner ? storedPubchi : undefined;
  const config = owner && storedOwner === owner ? storedConfig : null;
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [backupOpen, setBackupOpen] = useState(false);
  const [backupPositions, setBackupPositions] = useState<number[]>([]);
  const [backupController] = useState(() => new BotPhraseRevealController());
  const phraseTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [devices, setDevices] = useState<Awaited<ReturnType<typeof PubchiController.listDeviceKeys>>>([]);
  const [pendingRevocations, setPendingRevocations] = useState<string[]>([]);
  const [deviceListingHadFailures, setDeviceListingHadFailures] = useState(false);
  const [currentSigner, setCurrentSigner] = useState<string | undefined>(undefined);
  const needsReapproval = !capabilitiesCoverPubchiWrite(session?.info.capabilities ?? []);
  const contextEditable = sessionCovers(session?.info.capabilities ?? [], PUBCHI_PRIVATE_DIRECTORY);
  const approvalCancelRef = useRef<(() => void) | null>(null);
  const approvalFlowRef = useRef<Promise<boolean> | null>(null);
  const approvalGenerationRef = useRef(0);

  const cancelReapproval = () => {
    approvalGenerationRef.current += 1;
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
    if (!owner) {
      usePubchiStore.getState().clear();
      setBinding(undefined);
      setPendingRevocations([]);
      return;
    }
    const ownerAtStart = owner;
    const isCurrentOwner = () => readCurrentOwner(ownerAtStart) === ownerAtStart;
    void (async () => {
      try {
        const nextPubchi =
          typeof PubchiController.loadPubchi === 'function' ? await PubchiController.loadPubchi() : undefined;
        if (!isCurrentOwner()) return;
        if (typeof PubchiController.ensureDeviceReady === 'function') {
          try {
            await PubchiController.ensureDeviceReady();
            if (!isCurrentOwner()) return;
          } catch {
            if (!isCurrentOwner()) return;
            toast({ variant: 'error', title: 'Could not set up this browser', dismissButton: true });
          }
        }
        const nextBinding = await PubchiController.reconcileActiveBinding();
        if (!isCurrentOwner()) return;
        const [nextDevices, nextConfig, nextContext] = await Promise.all([
          typeof PubchiController.listDeviceKeys === 'function'
            ? PubchiController.listDeviceKeys()
            : Promise.resolve([]),
          typeof PubchiController.loadPubchiConfig === 'function'
            ? PubchiController.loadPubchiConfig()
            : Promise.resolve(null),
          typeof PubchiController.loadPubchiContext === 'function'
            ? PubchiController.loadPubchiContext()
            : Promise.resolve(null),
        ]);
        if (!isCurrentOwner()) return;
        setBinding(nextBinding);
        usePubchiStore.getState().setPubchi(nextPubchi, ownerAtStart);
        setDevices(nextDevices);
        setPendingRevocations(readPendingDelegationDeletes(ownerAtStart).map((item) => item.signer));
        setDeviceListingHadFailures(
          typeof PubchiController.hadDeviceListingFailures === 'function' &&
            PubchiController.hadDeviceListingFailures(),
        );
        usePubchiStore.getState().setConfig(nextConfig, ownerAtStart);
        usePubchiStore.getState().setContext(nextContext, ownerAtStart);
        if (owner) {
          void getCurrentDeviceKey(owner).then((key) => {
            if (isCurrentOwner()) setCurrentSigner(key?.signer);
          });
        }
      } catch {
        if (!isCurrentOwner()) return;
        setBinding(undefined);
        usePubchiStore.getState().clear();
        setDevices([]);
        toast({ variant: 'error', title: 'Pubchi could not be loaded', dismissButton: true });
      }
    })();
  }, [owner]);

  useEffect(() => {
    if (!owner) return;

    let reloadTimer: ReturnType<typeof setTimeout> | undefined;
    let reloadInFlight = false;
    const reload = async (): Promise<void> => {
      if (reloadInFlight || readCurrentOwner(owner) !== owner) return;
      reloadInFlight = true;
      try {
        const [nextPubchi, nextConfig, nextContext] = await Promise.all([
          PubchiController.loadPubchi(),
          typeof PubchiController.loadPubchiConfig === 'function'
            ? PubchiController.loadPubchiConfig()
            : Promise.resolve(usePubchiStore.getState().config),
          typeof PubchiController.loadPubchiContext === 'function'
            ? PubchiController.loadPubchiContext()
            : Promise.resolve(usePubchiStore.getState().context),
        ]);
        if (readCurrentOwner(owner) !== owner) return;
        const store = usePubchiStore.getState();
        store.setPubchi(nextPubchi, owner);
        store.setConfig(nextConfig, owner);
        store.setContext(nextContext, owner);
        if (nextConfig && store.pubchi) {
          store.setPubchi({ ...store.pubchi, displayName: nextConfig.display_name }, owner);
        }
      } finally {
        reloadInFlight = false;
      }
    };
    const scheduleReload = () => {
      if (reloadTimer) clearTimeout(reloadTimer);
      reloadTimer = setTimeout(() => {
        reloadTimer = undefined;
        void reload();
      }, PUBCHI_SYNC_DEBOUNCE_MS);
    };
    const unsubscribe = subscribeToPubchiSync((message) => {
      if (message.owner !== readCurrentOwner(owner)) return;
      if (message.kind === 'signed-out') {
        usePubchiStore.getState().clear();
        return;
      }
      scheduleReload();
    });
    const refreshIfStale = () => {
      if (document.visibilityState !== 'visible') return;
      if (lastUpdatedAt === null || Date.now() - lastUpdatedAt > PUBCHI_SYNC_MAX_AGE_MS) scheduleReload();
    };
    document.addEventListener('visibilitychange', refreshIfStale);
    window.addEventListener('focus', refreshIfStale);
    return () => {
      unsubscribe();
      if (reloadTimer) clearTimeout(reloadTimer);
      document.removeEventListener('visibilitychange', refreshIfStale);
      window.removeEventListener('focus', refreshIfStale);
    };
  }, [owner, lastUpdatedAt]);

  const saveConfig = async (partial: Partial<PubchiConfigV1>): Promise<PubchiConfigV1 | undefined> => {
    if (typeof PubchiController.savePubchiConfig !== 'function') return undefined;
    const ownerAtStart = readCurrentOwner(owner);
    if (!ownerAtStart) return undefined;
    const next = await PubchiController.savePubchiConfig(partial);
    if (readCurrentOwner(ownerAtStart) !== ownerAtStart) return next;
    usePubchiStore.getState().setConfig(next, ownerAtStart);
    if (usePubchiStore.getState().pubchi) {
      usePubchiStore
        .getState()
        .setPubchi({ ...usePubchiStore.getState().pubchi!, displayName: next.display_name }, ownerAtStart);
    }
    return next;
  };

  const saveContext = async (
    partial: Pick<PubchiOwnerContextV1, 'about' | 'instructions'>,
  ): Promise<PubchiOwnerContextV1> => {
    const ownerAtStart = readCurrentOwner(owner);
    setLoading(true);
    try {
      const next = await PubchiController.savePubchiContext(partial);
      if (ownerAtStart && readCurrentOwner(ownerAtStart) === ownerAtStart) {
        usePubchiStore.getState().setContext(next, ownerAtStart);
      }
      toast({ variant: 'default', title: 'Private context saved', dismissButton: true });
      return next;
    } finally {
      setLoading(false);
    }
  };

  const acceptSavedConfig = (next: PubchiConfigV1): void => {
    const ownerAtStart = readCurrentOwner(owner);
    if (!ownerAtStart) return;
    usePubchiStore.getState().setConfig(next, ownerAtStart);
    const current = usePubchiStore.getState().pubchi;
    if (current) usePubchiStore.getState().setPubchi({ ...current, displayName: next.display_name }, ownerAtStart);
  };

  const submit = async (): Promise<boolean> => {
    let ok = false;
    await form.handleSubmit(
      async (values) => {
        setLoading(true);
        setCreating(true);
        const ownerAtStart = readCurrentOwner(owner);
        try {
          if (!ownerAtStart) return;
          const next = await PubchiController.createPubchi({
            displayName: values[ENROLL_FORM_FIELDS.DISPLAY_NAME],
          });
          if (readCurrentOwner(ownerAtStart) !== ownerAtStart) return;
          backupController.set(next.phrase);
          if (phraseTimerRef.current) clearTimeout(phraseTimerRef.current);
          phraseTimerRef.current = setTimeout(
            () => {
              backupController.clear();
              setBackupOpen(false);
              backupForm.reset(backupConfirmationDefaults);
            },
            5 * 60 * 1000,
          );
          usePubchiStore.getState().setPubchi({
            bot: next.bot,
            displayName: next.displayName,
            createdAt: next.createdAt,
            backupConfirmedAt: next.backupConfirmedAt,
            verified: next.verified,
          }, ownerAtStart);
          const nextBinding = await PubchiController.reconcileActiveBinding();
          if (readCurrentOwner(ownerAtStart) !== ownerAtStart) return;
          setBinding(nextBinding);
          const nextDevices = await PubchiController.listDeviceKeys();
          if (readCurrentOwner(ownerAtStart) !== ownerAtStart) return;
          setDevices(nextDevices);
          form.reset(enrollPubchiFormDefaults);
          toast({ variant: 'default', title: 'Pubchi created', dismissButton: true });
          ok = true;
        } catch (error) {
          if (error instanceof AppError && error.message === 'PUBCHI_ALREADY_EXISTS') {
            try {
              const loaded = await PubchiController.loadPubchi();
              if (ownerAtStart && readCurrentOwner(ownerAtStart) === ownerAtStart) {
                usePubchiStore.getState().setPubchi(loaded, ownerAtStart);
              }
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
    const ownerAtStart = readCurrentOwner(owner);
    if (!ownerAtStart) {
      setLoading(false);
      return false;
    }
    try {
      await PubchiController.commitDeleteBinding({ bot: binding?.bot });
      if (readCurrentOwner(ownerAtStart) !== ownerAtStart) return false;
      setBinding(undefined);
      usePubchiStore.getState().clear();
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
        const ownerAtStart = readCurrentOwner(owner);
        if (!ownerAtStart) return;
        const next = await PubchiController.confirmBackup({
          phrase,
          confirmations: backupPositions.map((position, index) => ({ position, word: entered[index] ?? '' })),
        });
        if (readCurrentOwner(ownerAtStart) === ownerAtStart) {
          usePubchiStore.getState().setPubchi(next, ownerAtStart);
        }
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
      setPendingRevocations(owner ? readPendingDelegationDeletes(owner).map((item) => item.signer) : []);
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
      const result = await PubchiController.revokeAllDevices();
      const nextDevices = await PubchiController.listDeviceKeys();
      const listingHadFailures =
        typeof PubchiController.hadDeviceListingFailures === 'function' && PubchiController.hadDeviceListingFailures();
      setDevices(nextDevices);
      setPendingRevocations(owner ? readPendingDelegationDeletes(owner).map((item) => item.signer) : []);
      setDeviceListingHadFailures(listingHadFailures);
      if (result.unlisted > 0 || result.failed.length > 0 || listingHadFailures) {
        toast({
          variant: 'warning',
          title:
            'Some device records could not be loaded, so they may still be active. Try again or revoke them individually.',
          dismissButton: true,
        });
        return false;
      }
      setDevices([]);
      setDeviceListingHadFailures(false);
      toast({ variant: 'default', title: 'All devices revoked', dismissButton: true });
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
    if (approvalFlowRef.current) return approvalFlowRef.current;
    const generation = approvalGenerationRef.current;
    let flow!: Promise<boolean>;
    flow = (async (): Promise<boolean> => {
      try {
        const { authorizationUrl, awaitApproval, cancelAuthFlow } = await PubchiController.getCapabilityApprovalUrl();
        approvalCancelRef.current = cancelAuthFlow;
        window.open(authorizationUrl, '_blank', 'noopener,noreferrer');
        try {
          const approved = await awaitApproval;
          if (approvalGenerationRef.current !== generation || approvalFlowRef.current !== flow) return false;
          await PubchiController.adoptCapabilityApproval(approved);
          await PubchiController.ensureDeviceReady();
          setDevices(await PubchiController.listDeviceKeys());
          setPendingRevocations(owner ? readPendingDelegationDeletes(owner).map((item) => item.signer) : []);
          setDeviceListingHadFailures(
            typeof PubchiController.hadDeviceListingFailures === 'function' &&
              PubchiController.hadDeviceListingFailures(),
          );
          if (owner) {
            const key = await getCurrentDeviceKey(owner);
            setCurrentSigner(key?.signer);
          }
          return true;
        } finally {
          cancelAuthFlow();
          if (approvalCancelRef.current === cancelAuthFlow) {
            approvalCancelRef.current = null;
          }
        }
      } catch (error) {
        if (
          approvalGenerationRef.current !== generation ||
          (error instanceof Error && error.name === AUTH_FLOW_CANCELED_ERROR_NAME)
        ) {
          return false;
        }
        const message = error instanceof AppError ? error.message : 'SCHEMA_INVALID';
        toast({ variant: 'error', title: message, dismissButton: true });
        return false;
      } finally {
        if (approvalFlowRef.current === flow) approvalFlowRef.current = null;
      }
    })();
    approvalFlowRef.current = flow;
    return flow;
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
    context: owner && storedOwner === owner ? storedContext : null,
    contextEditable,
    saveContext,
    saveConfig,
    acceptSavedConfig,
    creating,
    backupOpen,
    backupPositions,
    backupController,
    devices,
    deviceListingHadFailures,
    pendingRevocations,
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

function readCurrentOwner(fallback: Pubky | null): Pubky | null {
  const getState = (useAuthStore as typeof useAuthStore & { getState?: () => { currentUserPubky: Pubky | null } }).getState;
  return getState ? getState().currentUserPubky : fallback;
}
