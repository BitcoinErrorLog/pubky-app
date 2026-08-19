'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { COMMERCE_CONTRACT_VERSION, COMMERCE_TAXONOMY_VERSION } from '@/config/commerce';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  useListingMediaPicker,
  type UseListingMediaPickerResult,
} from '@/hooks/useListingMediaPicker/useListingMediaPicker';
import { type CommerceListingRecord, commerceListingRecordSchema } from '@/libs/commerce/marketplace-records';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import {
  type CreateMarketplaceListingData,
  createMarketplaceListingDefaults,
  createMarketplaceListingSchema,
} from './useCreateMarketplaceListing.types';

export interface UseCreateMarketplaceListingResult {
  form: UseFormReturn<CreateMarketplaceListingData>;
  media: UseListingMediaPickerResult;
  submit: () => Promise<string | null>;
  reset: () => void;
}

export function useCreateMarketplaceListing(): UseCreateMarketplaceListingResult {
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const media = useListingMediaPicker();
  const form = useForm<CreateMarketplaceListingData>({
    resolver: zodResolver(createMarketplaceListingSchema),
    defaultValues: createMarketplaceListingDefaults,
    mode: 'onChange',
  });

  const submit = async (): Promise<string | null> => {
    if (!currentUserPubky) return null;
    let createdListingId: string | null = null;

    await form.handleSubmit(async (data) => {
      const preparedMedia = await media.prepare(currentUserPubky, data.altText);
      if (!preparedMedia) {
        toast({
          variant: 'error',
          description: media.file ? 'Could not prepare this listing image.' : 'Add a listing image.',
        });
        return;
      }

      try {
        await CommerceController.commitCreateMedia(preparedMedia.record.id, preparedMedia.bytes);
        const listing = buildListingRecord(currentUserPubky, data, preparedMedia.record);
        await CommerceController.commitUpsertListing(listing);
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
  };

  return { form, media, submit, reset };
}

function buildListingRecord(
  ownerPubky: string,
  data: CreateMarketplaceListingData,
  media: CommerceListingRecord['media'][number],
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
    media: [media],
    variants: [
      {
        id: 'default',
        options: {},
        quantity: Number(data.quantity),
        mediaIds: [media.id],
        enabled: true,
      },
    ],
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

function deriveTags(title: string): string[] {
  return [
    ...new Set(
      title
        .toLocaleLowerCase('en-US')
        .split(/[^a-z0-9]+/)
        .filter((part) => part.length >= 3),
    ),
  ].slice(0, 5);
}
