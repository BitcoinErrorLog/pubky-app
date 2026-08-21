'use client';

import { useEffect, useRef, useState } from 'react';
import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn, useWatch } from 'react-hook-form';
import { COMMERCE_CONTRACT_VERSION, COMMERCE_TAXONOMY_VERSION } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  type ListingMediaRecord,
  type PrepareListingMediaResult,
  useListingMediaManager,
  type UseListingMediaManagerResult,
} from '@/hooks/useListingMediaManager/useListingMediaManager';
import { type CommerceListingRecord, commerceListingRecordSchema } from '@/libs/commerce/marketplace-records';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
  createMarketplaceListingDraftSchema,
  createMarketplaceListingSchema,
} from './useCreateMarketplaceListing.types';

export interface UseCreateMarketplaceListingResult {
  form: UseFormReturn<CreateMarketplaceListingData>;
  media: UseListingMediaManagerResult;
  /** True when the form was hydrated from a locally autosaved draft. */
  restoredDraft: boolean;
  submit: () => Promise<string | null>;
  reset: () => void;
}

export function useCreateMarketplaceListing(): UseCreateMarketplaceListingResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const media = useListingMediaManager();
  const [draftId, setDraftId] = useState(() => crypto.randomUUID().replaceAll('-', ''));
  const [restoredDraft, setRestoredDraft] = useState(false);
  const draftReadyRef = useRef(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const form = useForm<CreateMarketplaceListingData>({
    resolver: zodResolver(createMarketplaceListingSchema),
    defaultValues: createMarketplaceListingDefaults,
    mode: 'onChange',
  });
  const watchedValues = useWatch({ control: form.control });

  useEffect(() => {
    if (!currentUserPubky) return;
    let active = true;
    CommerceController.getListingDrafts()
      .then((drafts) => {
        if (!active) return;
        const latest = drafts[0];
        const parsed = createMarketplaceListingDraftSchema.safeParse(latest?.data.form);
        if (latest && parsed.success) {
          const { altText: _legacyAltText, ...draftForm } = parsed.data;
          setDraftId(latest.listing_id);
          form.reset({ ...createMarketplaceListingDefaults, ...draftForm });
          setRestoredDraft(true);
        }
        draftReadyRef.current = true;
      })
      .catch(() => {
        draftReadyRef.current = true;
      });
    return () => {
      active = false;
    };
  }, [currentUserPubky, form]);

  useEffect(() => {
    if (!currentUserPubky) return;
    if (!draftReadyRef.current) return;
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(() => {
      const serialized = JSON.stringify(watchedValues);
      if (serialized) {
        void CommerceController.commitUpdateListingDraft(draftId, JSON.parse(serialized));
      }
    }, 750);
    return () => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    };
  }, [currentUserPubky, draftId, watchedValues]);

  const submit = async (): Promise<string | null> => {
    if (!currentUserPubky) return null;
    let createdListingId: string | null = null;

    await form.handleSubmit(async (data) => {
      const preparedMedia = await media.prepare(currentUserPubky);
      if (!preparedMedia.ok) {
        toast({ variant: 'error', description: describeMediaFailure(preparedMedia.reason) });
        return;
      }

      try {
        await uploadListingMedia(preparedMedia.uploads);
        const listing = buildListingRecord(currentUserPubky, data, preparedMedia.media);
        await CommerceController.commitUpsertListing(listing);
        await CommerceController.commitDeleteListingDraft(draftId);
        createdListingId = `${currentUserPubky}:${listing.listingId}`;
        toast({ title: 'Listing published', description: 'Your owner-signed listing is now available.' });
      } catch {
        toast({ variant: 'error', description: 'Could not publish this listing.' });
      }
    })();

    return createdListingId;
  };

  const reset = () => {
    form.reset(createMarketplaceListingDefaults);
    media.reset();
    setRestoredDraft(false);
    draftReadyRef.current = false;
    void CommerceController.commitDeleteListingDraft(draftId);
    setDraftId(crypto.randomUUID().replaceAll('-', ''));
    draftReadyRef.current = true;
  };

  return { form, media, restoredDraft, submit, reset };
}

export function describeMediaFailure(reason: Extract<PrepareListingMediaResult, { ok: false }>['reason']): string {
  switch (reason) {
    case 'no-photos':
      return 'Add at least one photo.';
    case 'missing-alt-text':
      return 'Every photo needs a description for screen readers.';
    case 'decode-failed':
      return 'A photo could not be processed. Remove it and try another file.';
  }
}

export async function uploadListingMedia(
  uploads: Array<{ record: ListingMediaRecord; bytes: Uint8Array }>,
): Promise<void> {
  for (const upload of uploads) {
    await CommerceController.commitCreateMedia(upload.record.id, upload.bytes);
  }
}

function buildListingRecord(
  ownerPubky: string,
  data: CreateMarketplaceListingData,
  media: ListingMediaRecord[],
): CommerceListingRecord {
  const now = new Date();
  const listingId = crypto.randomUUID().replaceAll('-', '');
  const amountMinor = Math.round(Number(data.price) * 100);
  const unitPrice = { amountMinor, currency: 'USD', exponent: 2 };
  const sale: CommerceListingRecord['sale'] =
    data.saleFormat === 'auction'
      ? {
          format: 'auction',
          startingPrice: unitPrice,
          minimumIncrement: { ...unitPrice, amountMinor: Math.max(100, Math.round(amountMinor * 0.05)) },
          startsAt: now.toISOString(),
          endsAt: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1_000).toISOString(),
          antiSnipingWindowSeconds: 120,
          antiSnipingExtensionSeconds: 120,
        }
      : {
          format: 'fixed_price',
          unitPrice,
          acceptsOffers: true,
        };
  const isPhysical = data.fulfillment === 'physical';
  const returnWindowDays = data.returnDays === 'none' ? undefined : Number(data.returnDays);

  return commerceListingRecordSchema.parse({
    schemaVersion: COMMERCE_CONTRACT_VERSION,
    recordType: 'listing',
    ownerPubky,
    revision: 1,
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    listingId,
    state: 'active',
    title: data.title,
    description: data.description,
    taxonomyVersion: COMMERCE_TAXONOMY_VERSION,
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
            label: 'Seller shipping',
            price: { amountMinor: Math.round(Number(data.shippingPrice) * 100), currency: 'USD', exponent: 2 },
            estimatedMinDays: 3,
            estimatedMaxDays: 7,
          },
        ]
      : [],
    returnPolicy: {
      acceptsReturns: returnWindowDays !== undefined,
      returnWindowDays,
      buyerPaysReturnShipping: true,
    },
    adultOnly: false,
  });
}

export function buildListingVariants(
  data: Pick<CreateMarketplaceListingData, 'variants'>,
  media: ListingMediaRecord[],
): Array<Record<string, unknown>> {
  return data.variants.map((variant, index) => ({
    id: `variant_${index + 1}`,
    sku: variant.sku || undefined,
    options: Object.fromEntries(
      [
        ['size', variant.size],
        ['color', variant.color],
        ['style', variant.style],
      ].filter((entry) => entry[1]),
    ),
    priceOverride: variant.priceOverride
      ? { amountMinor: Math.round(Number(variant.priceOverride) * 100), currency: 'USD', exponent: 2 }
      : undefined,
    quantity: Number(variant.quantity),
    mediaIds: media.map(({ id }) => id),
    enabled: true,
  }));
}

export function deriveTags(title: string): string[] {
  return [
    ...new Set(
      title
        .toLocaleLowerCase('en-US')
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 3),
    ),
  ].slice(0, 5);
}
