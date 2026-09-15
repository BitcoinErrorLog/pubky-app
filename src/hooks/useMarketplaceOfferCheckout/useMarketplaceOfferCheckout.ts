'use client';

import { useRef, useState } from 'react';
import { CommerceController } from '@/controllers/commerce/commerce';
import { isMarketplaceAwardCheckoutEligible } from '@/core/services/marketplace/marketplace-projections';
import { MARKETPLACE_FAILURE_MESSAGES, marketplaceOfferCheckoutFailureMessage } from '@/libs/commerce/failure-messages';
import { isMarketplaceSessionRequiredError } from '@/libs/error/error.utils';
import { toast } from '@/molecules/Toaster/use-toast';
import type { MarketplaceOffer, MarketplaceOfferAward } from '@/services/marketplace/marketplace';

type DeliveryAddress = {
  name: string;
  line1: string;
  line2: string;
  city: string;
  region: string;
  postalCode: string;
  countryCode: string;
};

export type MarketplaceOfferCheckoutResult = { ok: true; orderId: string | null } | { ok: false; code: string | null };

export function useMarketplaceOfferCheckout(onCompleted?: () => Promise<void> | void) {
  const submittingRef = useRef(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const submit = async (
    offer: MarketplaceOffer,
    deliveryAddress: DeliveryAddress,
  ): Promise<MarketplaceOfferCheckoutResult> => {
    if (submittingRef.current) return { ok: false, code: 'SUBMITTING' };
    submittingRef.current = true;
    setIsSubmitting(true);
    try {
      let currentOffer: MarketplaceOffer | undefined;
      try {
        currentOffer = (await CommerceController.getMarketplaceOffers()).find(({ id }) => id === offer.id);
      } catch (error) {
        if (isMarketplaceSessionRequiredError(error)) {
          toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.session });
          return { ok: false, code: 'SESSION_REQUIRED' };
        }
        throw error;
      }
      if (!currentOffer) {
        toast({ variant: 'error', description: 'This offer is no longer available.' });
        return { ok: false, code: 'AWARD_UNAVAILABLE' };
      }
      const award: MarketplaceOfferAward | undefined = currentOffer.award;
      if (!award || award.state !== 'active' || !isMarketplaceAwardCheckoutEligible(award)) {
        toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.offerCheckoutUnavailable });
        return { ok: false, code: 'AWARD_UNAVAILABLE' };
      }
      try {
        const response = await CommerceController.commitOfferCheckout({
          version: 1,
          commandId: crypto.randomUUID(),
          aggregateId: currentOffer.aggregateId,
          expectedRevision: currentOffer.revision,
          issuedAt: new Date().toISOString(),
          kind: 'offer.checkout',
          payload: {
            offerId: currentOffer.id,
            awardId: award.id,
            listingAggregateId: award.listing.aggregateId,
            listingRevision: award.listing.listingRevision,
            listingRecordSha256: award.listing.listingRecordSha256,
            variantId: award.variant.id,
            quantity: award.quantity,
            deliveryAddress,
            guaranteePolicyVersion: 1,
          },
        });
        if (!response.ok) {
          toast({
            variant: 'error',
            description: marketplaceOfferCheckoutFailureMessage(response.error.code),
          });
          return { ok: false, code: response.error.code };
        }
        await onCompleted?.();
        const order = response.result.order;
        return {
          ok: true,
          orderId:
            order && typeof order === 'object' && 'id' in order && typeof order.id === 'string' ? order.id : null,
        };
      } catch (error) {
        if (isMarketplaceSessionRequiredError(error)) {
          toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.session });
          return { ok: false, code: 'SESSION_REQUIRED' };
        }
        toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.checkout });
        return { ok: false, code: null };
      }
    } catch {
      toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.offerCheckoutUnavailable });
      return { ok: false, code: 'AWARD_UNAVAILABLE' };
    } finally {
      submittingRef.current = false;
      setIsSubmitting(false);
    }
  };

  return { submit, isSubmitting };
}
