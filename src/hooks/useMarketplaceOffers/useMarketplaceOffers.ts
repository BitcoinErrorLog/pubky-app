'use client';

import { type Dispatch, type SetStateAction, useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm } from 'react-hook-form';
import { getCommercePollIntervalMs } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  type MarketplaceOfferData,
  marketplaceOfferDefaults,
  marketplaceOfferSchema,
} from '@/hooks/useMarketplaceOffer/useMarketplaceOffer.types';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceOffer } from '@/services/marketplace/marketplace';
import { useAuthStore } from '@/stores/auth/auth.store';

export function useMarketplaceOffers() {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const [offers, setOffers] = useState<MarketplaceOffer[]>([]);
  const [isLoading, setIsLoading] = useState(Boolean(currentUserPubky));
  const [error, setError] = useState<string | null>(null);
  const form = useForm<MarketplaceOfferData>({
    resolver: zodResolver(marketplaceOfferSchema),
    defaultValues: marketplaceOfferDefaults,
    mode: 'onChange',
  });

  const refresh = () => loadOffers(currentUserPubky, setOffers, setIsLoading, setError);

  useEffect(() => {
    if (!currentUserPubky) {
      setIsLoading(false);
      return;
    }
    let active = true;
    void loadOffers(currentUserPubky, setOffers, setIsLoading, setError);
    const timer = window.setInterval(() => {
      if (active) void loadOffers(currentUserPubky, setOffers, setIsLoading, setError);
    }, getCommercePollIntervalMs());
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [currentUserPubky]);

  const act = async (offer: MarketplaceOffer, kind: 'offer.accept' | 'offer.reject' | 'offer.withdraw') => {
    try {
      const response = await CommerceController.executeMarketplaceCommand({
        version: 1,
        commandId: crypto.randomUUID(),
        aggregateId: offer.aggregateId,
        expectedRevision: offer.revision,
        issuedAt: new Date().toISOString(),
        kind,
        payload: { offerId: offer.id },
      });
      if (!response.ok) {
        toast({ variant: 'error', description: response.error.message });
        return false;
      }
      await refresh();
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not update this offer.' });
      return false;
    }
  };

  const counter = async (offer: MarketplaceOffer): Promise<boolean> => {
    let succeeded = false;
    await form.handleSubmit(async (data) => {
      try {
        const response = await CommerceController.executeMarketplaceCommand({
          version: 1,
          commandId: crypto.randomUUID(),
          aggregateId: offer.aggregateId,
          expectedRevision: offer.revision,
          issuedAt: new Date().toISOString(),
          kind: 'offer.counter',
          payload: {
            offerId: offer.id,
            amount: { amountMinor: Math.round(Number(data.amount) * 100), currency: 'USD', exponent: 2 },
            quantity: Number(data.quantity),
            expiresInSeconds: 24 * 60 * 60,
            message: data.message,
          },
        });
        if (!response.ok) {
          toast({ variant: 'error', description: response.error.message });
          return;
        }
        succeeded = true;
        form.reset(marketplaceOfferDefaults);
        await refresh();
      } catch {
        toast({ variant: 'error', description: 'Could not send this counteroffer.' });
      }
    })();
    return succeeded;
  };

  return { offers, isLoading, error, form, refresh, act, counter };
}

async function loadOffers(
  currentUserPubky: string | null,
  setOffers: Dispatch<SetStateAction<MarketplaceOffer[]>>,
  setIsLoading: Dispatch<SetStateAction<boolean>>,
  setError: Dispatch<SetStateAction<string | null>>,
): Promise<void> {
  if (!currentUserPubky) return;
  try {
    setOffers(await CommerceController.getMarketplaceOffers());
    setError(null);
  } catch {
    setError('Marketplace offers are unavailable.');
  } finally {
    setIsLoading(false);
  }
}
