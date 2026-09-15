'use client';

import { CommerceController } from '@/controllers/commerce/commerce';
import {
  MARKETPLACE_FAILURE_MESSAGES,
  marketplaceOfferCheckoutFailureMessage,
} from '@/libs/commerce/failure-messages';
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

export function useMarketplaceOfferCheckout(onCompleted?: () => Promise<void> | void) {
  const submit = async (offer: MarketplaceOffer, deliveryAddress: DeliveryAddress): Promise<boolean> => {
    let currentOffer = offer;
    try {
      currentOffer = (await CommerceController.getMarketplaceOffers()).find(({ id }) => id === offer.id) ?? offer;
    } catch {
      toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.offerCheckoutUnavailable });
      return false;
    }
    const award: MarketplaceOfferAward | undefined = currentOffer.award;
    if (!award || award.state !== 'active') {
      toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.offerCheckoutUnavailable });
      return false;
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
        return false;
      }
      await onCompleted?.();
      return true;
    } catch (error) {
      if (isMarketplaceSessionRequiredError(error)) {
        toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.session });
        return false;
      }
      toast({ variant: 'error', description: MARKETPLACE_FAILURE_MESSAGES.checkout });
      return false;
    }
  };

  return { submit };
}
