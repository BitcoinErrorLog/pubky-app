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
import { useMeasurementSystem } from '@/hooks/useMeasurementSystem/useMeasurementSystem';
import { type CommerceListingRecord, commerceListingRecordSchema } from '@/libs/commerce/marketplace-records';
import { amountInputToMoney, assetForListingCurrency, type CommerceAsset } from '@/libs/commerce/pricing';
import {
  dimensionInputFromMillimeters,
  gramsFromWeightInput,
  millimetersFromDimensionInput,
} from '@/libs/commerce/units';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
  type CreateMarketplaceListingDraftData,
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
  const measurementSystem = useMeasurementSystem();
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

  // Adopt the preferred measurement system while the package fields are still
  // empty. Once something is typed (or a draft restored values), the form
  // keeps ITS system so labels always match the numbers on screen.
  useEffect(() => {
    const values = form.getValues();
    if (values.measurementSystem === measurementSystem) return;
    const hasPackageInput = [
      values.packageWeight,
      values.packageLength,
      values.packageWidth,
      values.packageHeight,
    ].some((value) => value.trim() !== '');
    if (!hasPackageInput) {
      form.setValue('measurementSystem', measurementSystem);
    }
    // Watched package fields re-run this after a draft restore resets the form.
  }, [
    measurementSystem,
    form,
    watchedValues.measurementSystem,
    watchedValues.packageWeight,
    watchedValues.packageLength,
    watchedValues.packageWidth,
    watchedValues.packageHeight,
  ]);

  useEffect(() => {
    if (!currentUserPubky) return;
    let active = true;
    CommerceController.getListingDrafts()
      .then((drafts) => {
        if (!active) return;
        const latest = drafts[0];
        const parsed = createMarketplaceListingDraftSchema.safeParse(latest?.data.form);
        if (latest && parsed.success) {
          setDraftId(latest.listing_id);
          form.reset({ ...createMarketplaceListingDefaults, ...normalizeDraftForm(parsed.data) });
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
    form.reset({ ...createMarketplaceListingDefaults, measurementSystem });
    media.reset();
    setRestoredDraft(false);
    draftReadyRef.current = false;
    void CommerceController.commitDeleteListingDraft(draftId);
    setDraftId(crypto.randomUUID().replaceAll('-', ''));
    draftReadyRef.current = true;
  };

  return { form, media, restoredDraft, submit, reset };
}

/**
 * Maps a stored draft onto the current form shape. Legacy drafts carried the
 * package fields as raw record units (whole millimeters/grams under the old
 * field names); those values convert to the metric input unit (centimeters,
 * grams) and pin the draft to the metric system so labels match the numbers.
 * Legacy drafts also stored the bitcoin pricing choice as 'SATS'; it migrates
 * to the canonical 'BTC' here.
 */
export function normalizeDraftForm(draft: CreateMarketplaceListingDraftData): Partial<CreateMarketplaceListingData> {
  const {
    altText: _legacyAltText,
    weightGrams: legacyWeightGrams,
    lengthMillimeters: legacyLengthMm,
    widthMillimeters: legacyWidthMm,
    heightMillimeters: legacyHeightMm,
    currency: draftCurrency,
    ...draftForm
  } = draft;
  const normalized: Partial<CreateMarketplaceListingData> = { ...draftForm };
  if (draftCurrency !== undefined) {
    normalized.currency = draftCurrency === 'SATS' ? 'BTC' : draftCurrency;
  }

  const legacyDimension = (value: string | undefined): string | null =>
    value !== undefined && /^[1-9]\d*$/.test(value.trim())
      ? dimensionInputFromMillimeters(Number(value.trim()), 'metric')
      : null;

  const legacyLength = legacyDimension(legacyLengthMm);
  const legacyWidth = legacyDimension(legacyWidthMm);
  const legacyHeight = legacyDimension(legacyHeightMm);
  const legacyWeight = legacyWeightGrams !== undefined && /^[1-9]\d*$/.test(legacyWeightGrams.trim());

  if (legacyWeight && normalized.packageWeight === undefined) normalized.packageWeight = legacyWeightGrams.trim();
  if (legacyLength && normalized.packageLength === undefined) normalized.packageLength = legacyLength;
  if (legacyWidth && normalized.packageWidth === undefined) normalized.packageWidth = legacyWidth;
  if (legacyHeight && normalized.packageHeight === undefined) normalized.packageHeight = legacyHeight;
  if ((legacyWeight || legacyLength || legacyWidth || legacyHeight) && normalized.measurementSystem === undefined) {
    normalized.measurementSystem = 'metric';
  }

  return normalized;
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
  const asset = assetForListingCurrency(data.currency);
  const unitPrice = amountInputToMoney(data.price, asset);
  const sale: CommerceListingRecord['sale'] =
    data.saleFormat === 'auction'
      ? {
          format: 'auction',
          startingPrice: unitPrice,
          minimumIncrement: { ...unitPrice, amountMinor: Math.max(100, Math.round(unitPrice.amountMinor * 0.05)) },
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
    package: isPhysical ? buildPackageRecord(data) : undefined,
    shippingOptions: isPhysical
      ? [
          {
            id: 'seller_flat_rate',
            pricing: 'flat',
            label: data.shippingLabel,
            price: amountInputToMoney(data.shippingPrice, asset),
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
    adultOnly: false,
  });
}

/** The canonical package record: entered units converted to exact integer millimeters/grams. */
export function buildPackageRecord(
  data: Pick<
    CreateMarketplaceListingData,
    'measurementSystem' | 'packageWeight' | 'packageLength' | 'packageWidth' | 'packageHeight'
  >,
): { weightGrams: number; lengthMillimeters: number; widthMillimeters: number; heightMillimeters: number } {
  const system = data.measurementSystem;
  return {
    weightGrams: gramsFromWeightInput(Number(data.packageWeight), system),
    lengthMillimeters: millimetersFromDimensionInput(Number(data.packageLength), system),
    widthMillimeters: millimetersFromDimensionInput(Number(data.packageWidth), system),
    heightMillimeters: millimetersFromDimensionInput(Number(data.packageHeight), system),
  };
}

export function buildListingVariants(
  data: Pick<CreateMarketplaceListingData, 'variants' | 'currency'>,
  media: ListingMediaRecord[],
): Array<Record<string, unknown>> {
  const asset: CommerceAsset = assetForListingCurrency(data.currency);
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
    priceOverride: variant.priceOverride ? amountInputToMoney(variant.priceOverride, asset) : undefined,
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
