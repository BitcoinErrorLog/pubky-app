'use client';

import { useEffect, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  buildListingVariants,
  deriveTags,
  describeMediaFailure,
  uploadListingMedia,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
  createMarketplaceListingSchema,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import {
  useListingMediaManager,
  type UseListingMediaManagerResult,
} from '@/hooks/useListingMediaManager/useListingMediaManager';
import { type CommerceListingRecord, commerceListingRecordSchema } from '@/libs/commerce/marketplace-records';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';

export type EditMarketplaceListingStatus = 'loading' | 'ready' | 'not-found' | 'not-owner' | 'unsupported';

export interface UseEditMarketplaceListingResult {
  status: EditMarketplaceListingStatus;
  form: UseFormReturn<CreateMarketplaceListingData>;
  media: UseListingMediaManagerResult;
  /** True for auction listings: the sale terms were fixed at publish time. */
  saleTermsLocked: boolean;
  submit: () => Promise<string | null>;
}

/**
 * The edit side of the sell studio: hydrates the form and photo set from the
 * seller's published record and republishes the SAME listing (same
 * `listingId`, same `createdAt`) with a bumped revision. Already-uploaded
 * photos are reused as-is — only newly added photos upload bytes.
 *
 * Honest scope limits, enforced as `unsupported` instead of destructive
 * saves: listings with digital delivery (a `digitalLock` this studio cannot
 * author) cannot be edited here, and auction sale terms are locked because
 * rewriting a live auction's window or starting price would falsify terms
 * bidders may already have acted on. Item facts (title, description, photos,
 * inventory, delivery) stay editable for auctions.
 */
export function useEditMarketplaceListing(sellerPubky: string, listingId: string): UseEditMarketplaceListingResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const media = useListingMediaManager();
  const [status, setStatus] = useState<EditMarketplaceListingStatus>('loading');
  const [record, setRecord] = useState<CommerceListingRecord | null>(null);
  const form = useForm<CreateMarketplaceListingData>({
    resolver: zodResolver(createMarketplaceListingSchema),
    defaultValues: createMarketplaceListingDefaults,
    mode: 'onChange',
  });

  useEffect(() => {
    let active = true;
    if (!currentUserPubky) return;
    if (currentUserPubky !== sellerPubky) {
      setStatus('not-owner');
      return;
    }
    CommerceController.getOrFetchListing(sellerPubky, listingId)
      .then((loaded) => {
        if (!active) return;
        if (loaded.fulfillmentMethods.includes('digital')) {
          setStatus('unsupported');
          return;
        }
        setRecord(loaded);
        form.reset(formDataFromRecord(loaded));
        media.seed(loaded.media);
        setStatus('ready');
      })
      .catch(() => {
        if (active) setStatus('not-found');
      });
    return () => {
      active = false;
    };
    // `form` and `media` are stable hook results; re-running on their identity
    // would re-seed and clobber in-progress edits.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentUserPubky, sellerPubky, listingId]);

  const submit = async (): Promise<string | null> => {
    if (!currentUserPubky || !record) return null;
    let savedListingId: string | null = null;

    await form.handleSubmit(async (data) => {
      const preparedMedia = await media.prepare(currentUserPubky);
      if (!preparedMedia.ok) {
        toast({ variant: 'error', description: describeMediaFailure(preparedMedia.reason) });
        return;
      }

      try {
        await uploadListingMedia(preparedMedia.uploads);
        const updated = buildUpdatedRecord(record, data, preparedMedia.media);
        await CommerceController.commitUpsertListing(updated);
        setRecord(updated);
        savedListingId = `${currentUserPubky}:${updated.listingId}`;
        toast({ title: 'Listing updated', description: `Revision ${updated.revision} is now published.` });
      } catch {
        toast({ variant: 'error', description: 'Could not save these changes.' });
      }
    })();

    return savedListingId;
  };

  return {
    status,
    form,
    media,
    saleTermsLocked: record?.sale.format === 'auction',
    submit,
  };
}

function formDataFromRecord(record: CommerceListingRecord): CreateMarketplaceListingData {
  const price = record.sale.format === 'fixed_price' ? record.sale.unitPrice : record.sale.startingPrice;
  const isPhysical = record.fulfillmentMethods.includes('physical');
  const flatShipping = record.shippingOptions.find((option) => option.pricing === 'flat');
  const returnDays =
    record.returnPolicy.acceptsReturns && record.returnPolicy.returnWindowDays !== undefined
      ? record.returnPolicy.returnWindowDays <= 14
        ? ('14' as const)
        : ('30' as const)
      : ('none' as const);

  return {
    title: record.title,
    description: record.description,
    categoryId: record.categoryId,
    condition: record.condition,
    countryCode: record.location.countryCode,
    region: record.location.region ?? '',
    saleFormat: record.sale.format,
    price: minorToInput(price.amountMinor),
    variants: record.variants.map((variant) => ({
      sku: variant.sku ?? '',
      size: variant.options.size ?? '',
      color: variant.options.color ?? '',
      style: variant.options.style ?? '',
      quantity: String(variant.quantity),
      priceOverride: variant.priceOverride ? minorToInput(variant.priceOverride.amountMinor) : '',
    })),
    fulfillment: isPhysical ? 'physical' : 'pickup',
    shippingLabel: flatShipping ? flatShipping.label : createMarketplaceListingDefaults.shippingLabel,
    shippingPrice: flatShipping ? minorToInput(flatShipping.price.amountMinor) : '',
    shippingMinDays: flatShipping
      ? String(flatShipping.estimatedMinDays)
      : createMarketplaceListingDefaults.shippingMinDays,
    shippingMaxDays: flatShipping
      ? String(flatShipping.estimatedMaxDays)
      : createMarketplaceListingDefaults.shippingMaxDays,
    weightGrams: record.package ? String(record.package.weightGrams) : '',
    lengthMillimeters: record.package ? String(record.package.lengthMillimeters) : '',
    widthMillimeters: record.package ? String(record.package.widthMillimeters) : '',
    heightMillimeters: record.package ? String(record.package.heightMillimeters) : '',
    returnDays,
  };
}

function buildUpdatedRecord(
  record: CommerceListingRecord,
  data: CreateMarketplaceListingData,
  media: CommerceListingRecord['media'],
): CommerceListingRecord {
  const now = new Date().toISOString();
  const amountMinor = Math.round(Number(data.price) * 100);
  const unitPrice = { amountMinor, currency: 'USD', exponent: 2 };
  // Auction sale terms are immutable after publish (see the hook doc); the
  // fixed-price branch rebuilds from the form but keeps the offers setting.
  const sale: CommerceListingRecord['sale'] =
    record.sale.format === 'auction'
      ? record.sale
      : { format: 'fixed_price', unitPrice, acceptsOffers: record.sale.acceptsOffers };
  const isPhysical = data.fulfillment === 'physical';
  const returnWindowDays = data.returnDays === 'none' ? undefined : Number(data.returnDays);

  return commerceListingRecordSchema.parse({
    ...record,
    revision: record.revision + 1,
    updatedAt: now,
    title: data.title,
    description: data.description,
    categoryId: data.categoryId,
    condition: data.condition,
    tags: deriveTags(data.title),
    location: {
      countryCode: data.countryCode.toUpperCase(),
      region: data.region || undefined,
    },
    media,
    variants: buildListingVariants(data, media),
    sale,
    fulfillmentMethods: [data.fulfillment],
    package: isPhysical
      ? {
          weightGrams: Number(data.weightGrams),
          lengthMillimeters: Number(data.lengthMillimeters),
          widthMillimeters: Number(data.widthMillimeters),
          heightMillimeters: Number(data.heightMillimeters),
        }
      : undefined,
    shippingOptions: isPhysical
      ? [
          {
            id: 'seller_flat_rate',
            pricing: 'flat',
            label: data.shippingLabel,
            price: { amountMinor: Math.round(Number(data.shippingPrice) * 100), currency: 'USD', exponent: 2 },
            estimatedMinDays: Number(data.shippingMinDays),
            estimatedMaxDays: Number(data.shippingMaxDays),
          },
        ]
      : [],
    returnPolicy: {
      acceptsReturns: returnWindowDays !== undefined,
      returnWindowDays,
      buyerPaysReturnShipping: true,
    },
  });
}

function minorToInput(amountMinor: number): string {
  return (amountMinor / 100).toFixed(2);
}
