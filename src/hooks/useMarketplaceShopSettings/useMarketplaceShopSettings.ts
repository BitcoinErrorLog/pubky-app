'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { COMMERCE_CONTRACT_VERSION } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type MarketplaceShopSettingsData,
  marketplaceShopSettingsDefaults,
  marketplaceShopSettingsSchema,
} from './useMarketplaceShopSettings.types';

export function useMarketplaceShopSettings() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [revision, setRevision] = useState(0);
  const [createdAt, setCreatedAt] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const form = useForm<MarketplaceShopSettingsData>({
    resolver: zodResolver(marketplaceShopSettingsSchema),
    defaultValues: marketplaceShopSettingsDefaults,
    mode: 'onChange',
  });

  useEffect(() => {
    if (!currentUserPubky) return;
    let active = true;
    // Network-first so a seller on a fresh device edits their published shop
    // instead of unknowingly starting a competing revision-1 record; the
    // local cache remains the fallback when the homeserver is unreachable.
    CommerceController.getOrFetchShop(currentUserPubky)
      .then((record) => (active ? hydrate(record) : undefined))
      .catch(async () => {
        const cached = await CommerceController.getShop(currentUserPubky).catch(() => null);
        if (!active) return;
        if (cached) hydrate(cached.record);
        else setIsLoading(false);
      });

    function hydrate(record: {
      revision: number;
      createdAt: string;
      name: string;
      bio: string;
      location: { countryCode: string; region?: string };
      shippingPolicy: string;
      returnPolicy: string;
      vacationMode: boolean;
    }) {
      setRevision(record.revision);
      setCreatedAt(record.createdAt);
      form.reset({
        name: record.name,
        bio: record.bio,
        countryCode: record.location.countryCode,
        region: record.location.region ?? '',
        shippingPolicy: record.shippingPolicy,
        returnPolicy: record.returnPolicy,
        vacationMode: record.vacationMode,
      });
      setIsLoading(false);
    }

    return () => {
      active = false;
    };
  }, [currentUserPubky, form]);

  const submit = async () => {
    if (!currentUserPubky) return false;
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      const now = new Date().toISOString();
      const isFirstSave = revision === 0;
      try {
        await CommerceController.commitUpsertShop({
          schemaVersion: COMMERCE_CONTRACT_VERSION,
          recordType: 'shop',
          ownerPubky: currentUserPubky,
          revision: revision + 1,
          createdAt: createdAt ?? now,
          updatedAt: now,
          name: data.name,
          bio: data.bio,
          location: { countryCode: data.countryCode.toUpperCase(), region: data.region || undefined },
          shippingPolicy: data.shippingPolicy,
          returnPolicy: data.returnPolicy,
          vacationMode: data.vacationMode,
        });
        setRevision((current) => current + 1);
        setCreatedAt((current) => current ?? now);
        succeeded = true;
        toast(
          isFirstSave
            ? { title: 'Shop created', description: 'Your shop page is now live for buyers.' }
            : { title: 'Shop settings saved' },
        );
      } catch {
        toast({ variant: 'error', description: 'Could not save shop settings.' });
      }
    })();
    return succeeded;
  };

  return {
    form,
    revision,
    isLoading,
    /** True once an owner-signed shop record exists (locally cached or just saved). */
    hasShop: revision > 0,
    submit,
  };
}
