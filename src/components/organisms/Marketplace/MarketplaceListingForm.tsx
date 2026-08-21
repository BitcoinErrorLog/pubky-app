'use client';

import { ArrowDown, ArrowUp, Film, ImagePlus, Plus, Trash2 } from 'lucide-react';
import { Controller, useFieldArray, type UseFormReturn, useWatch } from 'react-hook-form';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Input } from '@/atoms/Input/Input';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { COMMERCE_CATEGORIES } from '@/config/commerce';
import { FORM_LABEL_CLASSES } from '@/config/forms';
import {
  CREATE_MARKETPLACE_LISTING_FIELDS,
  type CreateMarketplaceListingData,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import type {
  ListingMediaItem,
  UseListingMediaManagerResult,
} from '@/hooks/useListingMediaManager/useListingMediaManager';
import { amountInputUnitLabel, assetForListingCurrency } from '@/libs/commerce/pricing';
import { dimensionUnitLabel, weightUnitLabel } from '@/libs/commerce/units';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export interface MarketplaceListingFormProps {
  form: UseFormReturn<CreateMarketplaceListingData>;
  media: UseListingMediaManagerResult;
  onSubmit: () => Promise<void>;
  isPublishing: boolean;
  /** Edit mode locks the sale format (and auction terms) and relabels submit. */
  mode?: 'create' | 'edit';
  /** True for auctions being edited: price and format were fixed at publish. */
  saleTermsLocked?: boolean;
}

export function MarketplaceListingForm({
  form,
  media,
  onSubmit,
  isPublishing,
  mode = 'create',
  saleTermsLocked = false,
}: MarketplaceListingFormProps) {
  const {
    items: mediaItems,
    maxPhotos,
    error: pickerError,
    inputRef,
    onInputChange,
    choose,
    removeItem,
    moveItem,
    setAltText,
  } = media;
  const fulfillment = useWatch({ control: form.control, name: CREATE_MARKETPLACE_LISTING_FIELDS.FULFILLMENT });
  const saleFormat = useWatch({ control: form.control, name: CREATE_MARKETPLACE_LISTING_FIELDS.SALE_FORMAT });
  const currency = useWatch({ control: form.control, name: CREATE_MARKETPLACE_LISTING_FIELDS.CURRENCY });
  const measurementSystem = useWatch({
    control: form.control,
    name: CREATE_MARKETPLACE_LISTING_FIELDS.MEASUREMENT_SYSTEM,
  });
  const variants = useFieldArray({ control: form.control, name: CREATE_MARKETPLACE_LISTING_FIELDS.VARIANTS });
  const isEdit = mode === 'edit';
  const priceUnit = amountInputUnitLabel(assetForListingCurrency(currency));
  const pricePlaceholder = currency === 'SATS' ? '150000' : '125.00';
  const isImperial = measurementSystem === 'imperial';
  const mediaError =
    pickerError === 'invalid-type'
      ? 'Choose image files only.'
      : pickerError === 'too-large'
        ? 'An image is too large.'
        : pickerError === 'decode-failed'
          ? 'A photo could not be processed.'
          : pickerError === 'limit-reached'
            ? `Listings support up to ${maxPhotos} photos.`
            : null;

  return (
    <form
      className="flex flex-col gap-6"
      onSubmit={(event) => {
        event.preventDefault();
        void onSubmit();
      }}
    >
      <Card className="border">
        <CardContent className="flex flex-col gap-5 px-6">
          <div>
            <Typography as="h2" className="text-xl font-semibold">
              Photos
            </Typography>
            <Typography as="p" className="mt-1 text-sm text-muted-foreground">
              Up to {media.maxPhotos} photos. The first photo is the cover buyers see everywhere. Metadata is stripped
              before publication.
            </Typography>
          </div>

          {mediaItems.length > 0 && (
            <ul className="flex flex-col gap-3" aria-label="Listing photos in display order">
              {mediaItems.map((item, index) => (
                <ListingPhotoRow
                  key={item.key}
                  item={item}
                  index={index}
                  count={mediaItems.length}
                  isPublishing={isPublishing}
                  onMove={moveItem}
                  onRemove={removeItem}
                  onAltTextChange={setAltText}
                />
              ))}
            </ul>
          )}

          <Button
            type="button"
            variant="secondary"
            className="w-fit rounded-full"
            disabled={isPublishing || mediaItems.length >= maxPhotos}
            onClick={choose}
          >
            <ImagePlus className="mr-2 size-4" />
            Add photos ({mediaItems.length}/{maxPhotos})
          </Button>
          <input
            ref={inputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            hidden
            onChange={onInputChange}
          />
          {mediaError && (
            <Typography as="p" role="alert" className="text-sm text-destructive">
              {mediaError}
            </Typography>
          )}
        </CardContent>
      </Card>

      <Card className="border">
        <CardContent className="grid gap-5 px-6">
          <Typography as="h2" className="text-xl font-semibold">
            Item details
          </Typography>
          <ControlledInputField
            name={CREATE_MARKETPLACE_LISTING_FIELDS.TITLE}
            control={form.control}
            label="Title"
            placeholder="What are you selling?"
            disabled={isPublishing}
          />
          <ControlledTextareaField
            name={CREATE_MARKETPLACE_LISTING_FIELDS.DESCRIPTION}
            control={form.control}
            label="Description"
            placeholder="Condition, provenance, measurements, and anything a buyer should know"
            rows={6}
            disabled={isPublishing}
          />
          <div className="grid gap-5 sm:grid-cols-2">
            <FormSelect
              form={form}
              name={CREATE_MARKETPLACE_LISTING_FIELDS.CATEGORY}
              label="Category"
              disabled={isPublishing}
              options={COMMERCE_CATEGORIES.map(({ id, label }) => ({ value: id, label }))}
            />
            <FormSelect
              form={form}
              name={CREATE_MARKETPLACE_LISTING_FIELDS.CONDITION}
              label="Condition"
              disabled={isPublishing}
              options={[
                { value: 'new', label: 'New' },
                { value: 'like_new', label: 'Like new' },
                { value: 'excellent', label: 'Excellent' },
                { value: 'good', label: 'Good' },
                { value: 'fair', label: 'Fair' },
                { value: 'for_parts', label: 'For parts' },
              ]}
            />
            <ControlledInputField
              name={CREATE_MARKETPLACE_LISTING_FIELDS.COUNTRY_CODE}
              control={form.control}
              label="Country"
              placeholder="US"
              disabled={isPublishing}
            />
            <ControlledInputField
              name={CREATE_MARKETPLACE_LISTING_FIELDS.REGION}
              control={form.control}
              label="Region (optional)"
              placeholder="NY"
              disabled={isPublishing}
            />
          </div>
        </CardContent>
      </Card>

      <Card className="border">
        <CardContent className="grid gap-5 px-6">
          <Typography as="h2" className="text-xl font-semibold">
            Price and availability
          </Typography>
          <div className="grid gap-5 sm:grid-cols-3">
            <FormSelect
              form={form}
              name={CREATE_MARKETPLACE_LISTING_FIELDS.SALE_FORMAT}
              label="Sale format"
              disabled={isPublishing || isEdit}
              options={[
                { value: 'fixed_price', label: 'Buy now' },
                { value: 'auction', label: '7-day auction' },
              ]}
            />
            <FormSelect
              form={form}
              name={CREATE_MARKETPLACE_LISTING_FIELDS.CURRENCY}
              label="Pricing currency"
              disabled={isPublishing || saleTermsLocked}
              options={[
                { value: 'USD', label: 'US dollars (USD)' },
                { value: 'SATS', label: 'Bitcoin (sats)' },
              ]}
            />
            <ControlledInputField
              name={CREATE_MARKETPLACE_LISTING_FIELDS.PRICE}
              control={form.control}
              label={saleFormat === 'auction' ? `Starting price (${priceUnit})` : `Price (${priceUnit})`}
              placeholder={pricePlaceholder}
              disabled={isPublishing || saleTermsLocked}
            />
          </div>
          {isEdit && (
            <Typography as="p" className="text-sm text-muted-foreground">
              {saleTermsLocked
                ? 'Auction terms (format, starting price, and schedule) are fixed once the auction is published.'
                : 'The sale format cannot change after publishing.'}
            </Typography>
          )}

          <div className="flex items-center justify-between gap-4 border-t pt-5">
            <div>
              <Typography as="h3" className="font-semibold">
                Variants and inventory
              </Typography>
              <Typography as="p" className="text-sm text-muted-foreground">
                Up to three option dimensions with independent SKU, price, and quantity.
              </Typography>
            </div>
            <Button
              type="button"
              size="sm"
              variant="secondary"
              className="shrink-0 rounded-full"
              disabled={isPublishing || saleFormat === 'auction' || variants.fields.length >= 100}
              onClick={() =>
                variants.append({ sku: '', size: '', color: '', style: '', quantity: '1', priceOverride: '' })
              }
            >
              <Plus className="mr-2 size-4" />
              Add variant
            </Button>
          </div>

          <div className="flex flex-col gap-4">
            {variants.fields.map((variant, index) => (
              <div key={variant.id} className="relative grid gap-4 rounded-xl border bg-card/60 p-4 sm:grid-cols-3">
                <ControlledInputField
                  name={`variants.${index}.sku`}
                  control={form.control}
                  label="Seller SKU"
                  placeholder="BOOTS-42"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={`variants.${index}.size`}
                  control={form.control}
                  label="Size"
                  placeholder="42"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={`variants.${index}.color`}
                  control={form.control}
                  label="Color"
                  placeholder="Brown"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={`variants.${index}.style`}
                  control={form.control}
                  label="Style"
                  placeholder="Classic"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={`variants.${index}.quantity`}
                  control={form.control}
                  label="Quantity"
                  placeholder="1"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={`variants.${index}.priceOverride`}
                  control={form.control}
                  label={`Price override (${priceUnit})`}
                  placeholder="Optional"
                  disabled={isPublishing}
                />
                {variants.fields.length > 1 && (
                  <Button
                    type="button"
                    size="icon"
                    variant="ghost"
                    className="absolute top-2 right-2 rounded-full"
                    aria-label={`Remove variant ${index + 1}`}
                    disabled={isPublishing}
                    onClick={() => variants.remove(index)}
                  >
                    <Trash2 className="size-4" />
                  </Button>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card className="border">
        <CardContent className="grid gap-5 px-6">
          <Typography as="h2" className="text-xl font-semibold">
            Delivery and returns
          </Typography>
          <div className="grid gap-5 sm:grid-cols-2">
            <FormSelect
              form={form}
              name={CREATE_MARKETPLACE_LISTING_FIELDS.FULFILLMENT}
              label="Delivery"
              disabled={isPublishing}
              options={[
                { value: 'physical', label: 'Ship item' },
                { value: 'pickup', label: 'Local pickup' },
              ]}
            />
            <FormSelect
              form={form}
              name={CREATE_MARKETPLACE_LISTING_FIELDS.RETURN_DAYS}
              label="Returns"
              disabled={isPublishing}
              options={[
                { value: '30', label: '30 days' },
                { value: '14', label: '14 days' },
                { value: 'none', label: 'Final sale' },
              ]}
            />
          </div>

          {fulfillment === 'physical' && (
            <>
              <div className="grid gap-5 sm:grid-cols-2">
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.SHIPPING_PRICE}
                  control={form.control}
                  label={`Flat shipping (${priceUnit})`}
                  placeholder={currency === 'SATS' ? '15000' : '12.00'}
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_WEIGHT}
                  control={form.control}
                  label={`Weight (${weightUnitLabel(measurementSystem)})`}
                  placeholder={isImperial ? '42.3' : '1200'}
                  disabled={isPublishing}
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_LENGTH}
                  control={form.control}
                  label={`Length (${dimensionUnitLabel(measurementSystem)})`}
                  placeholder={isImperial ? '13.8' : '35.0'}
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_WIDTH}
                  control={form.control}
                  label={`Width (${dimensionUnitLabel(measurementSystem)})`}
                  placeholder={isImperial ? '9.8' : '25.0'}
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.PACKAGE_HEIGHT}
                  control={form.control}
                  label={`Height (${dimensionUnitLabel(measurementSystem)})`}
                  placeholder={isImperial ? '5.9' : '15.0'}
                  disabled={isPublishing}
                />
              </div>
              <Typography as="p" className="text-sm text-muted-foreground">
                Package details are entered in {isImperial ? 'inches and ounces' : 'centimeters and grams'} (your
                measurement preference) and stored exactly in millimeters and grams.
              </Typography>
            </>
          )}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full rounded-full" disabled={isPublishing}>
        {isEdit ? (isPublishing ? 'Saving…' : 'Save changes') : isPublishing ? 'Publishing…' : 'Publish listing'}
      </Button>
    </form>
  );
}

function ListingPhotoRow({
  item,
  index,
  count,
  isPublishing,
  onMove,
  onRemove,
  onAltTextChange,
}: {
  item: ListingMediaItem;
  index: number;
  count: number;
  isPublishing: boolean;
  onMove: (key: string, direction: -1 | 1) => void;
  onRemove: (key: string) => void;
  onAltTextChange: (key: string, altText: string) => void;
}) {
  const position = `Photo ${index + 1} of ${count}`;
  return (
    <li className="flex flex-col gap-3 rounded-xl border bg-card/60 p-3 sm:flex-row sm:items-center">
      <div className="relative size-24 shrink-0 overflow-hidden rounded-lg border bg-card">
        {item.previewUrl ? (
          // Plain <img>: previews are local object URLs or direct homeserver
          // reads, neither of which should go through Next image optimization.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={item.previewUrl} alt={item.altText || position} className="size-full object-cover" />
        ) : (
          <span className="flex size-full items-center justify-center">
            <Film aria-hidden="true" className="size-8 text-muted-foreground" />
          </span>
        )}
        {index === 0 && <Badge className="absolute bottom-1 left-1 px-1.5 py-0 text-[10px]">Cover</Badge>}
      </div>
      <div className="flex min-w-0 flex-1 flex-col gap-2">
        <Label htmlFor={`listing-photo-alt-${item.key}`} className={FORM_LABEL_CLASSES}>
          Photo {index + 1} description
        </Label>
        <Input
          id={`listing-photo-alt-${item.key}`}
          value={item.altText}
          placeholder="Describe this photo for people using screen readers"
          disabled={isPublishing}
          onChange={(event) => onAltTextChange(item.key, event.target.value)}
        />
      </div>
      <div className="flex shrink-0 items-center gap-1 self-end sm:self-center">
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label={`Move photo ${index + 1} earlier`}
          disabled={isPublishing || index === 0}
          onClick={() => onMove(item.key, -1)}
        >
          <ArrowUp className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label={`Move photo ${index + 1} later`}
          disabled={isPublishing || index === count - 1}
          onClick={() => onMove(item.key, 1)}
        >
          <ArrowDown className="size-4" />
        </Button>
        <Button
          type="button"
          size="icon"
          variant="ghost"
          className="rounded-full"
          aria-label={`Remove photo ${index + 1}`}
          disabled={isPublishing}
          onClick={() => onRemove(item.key)}
        >
          <Trash2 className="size-4" />
        </Button>
      </div>
    </li>
  );
}

function FormSelect({
  form,
  name,
  label,
  options,
  disabled,
}: {
  form: UseFormReturn<CreateMarketplaceListingData>;
  name:
    | typeof CREATE_MARKETPLACE_LISTING_FIELDS.CATEGORY
    | typeof CREATE_MARKETPLACE_LISTING_FIELDS.CONDITION
    | typeof CREATE_MARKETPLACE_LISTING_FIELDS.SALE_FORMAT
    | typeof CREATE_MARKETPLACE_LISTING_FIELDS.CURRENCY
    | typeof CREATE_MARKETPLACE_LISTING_FIELDS.FULFILLMENT
    | typeof CREATE_MARKETPLACE_LISTING_FIELDS.RETURN_DAYS;
  label: string;
  options: Array<{ value: string; label: string }>;
  disabled: boolean;
}) {
  return (
    <Container className="gap-2">
      <Label htmlFor={name} className={FORM_LABEL_CLASSES}>
        {label}
      </Label>
      <Controller
        name={name}
        control={form.control}
        render={({ field, fieldState }) => (
          <>
            <Select value={field.value} onValueChange={field.onChange} disabled={disabled}>
              <SelectTrigger id={name} className="h-11 w-full rounded-md border px-3" aria-invalid={!!fieldState.error}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {options.map((option) => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {fieldState.error && (
              <Typography as="p" role="alert" className="text-sm text-destructive">
                {fieldState.error.message}
              </Typography>
            )}
          </>
        )}
      />
    </Container>
  );
}
