'use client';

import { ImagePlus, Trash2 } from 'lucide-react';
import { Controller, type UseFormReturn, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Container } from '@/atoms/Container/Container';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { Typography } from '@/atoms/Typography/Typography';
import { COMMERCE_CATEGORIES } from '@/config/commerce';
import { FORM_LABEL_CLASSES } from '@/config/forms';
import {
  CREATE_MARKETPLACE_LISTING_FIELDS,
  type CreateMarketplaceListingData,
} from '@/hooks/useCreateMarketplaceListing/useCreateMarketplaceListing.types';
import type { UseListingMediaPickerResult } from '@/hooks/useListingMediaPicker/useListingMediaPicker';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export interface MarketplaceListingFormProps {
  form: UseFormReturn<CreateMarketplaceListingData>;
  media: UseListingMediaPickerResult;
  onSubmit: () => Promise<void>;
  isPublishing: boolean;
}

export function MarketplaceListingForm({ form, media, onSubmit, isPublishing }: MarketplaceListingFormProps) {
  const { previewUrl, error: pickerError, inputRef, onInputChange, choose, remove } = media;
  const fulfillment = useWatch({ control: form.control, name: CREATE_MARKETPLACE_LISTING_FIELDS.FULFILLMENT });
  const mediaError =
    pickerError === 'invalid-type'
      ? 'Choose an image file.'
      : pickerError === 'too-large'
        ? 'Image is too large.'
        : pickerError === 'decode-failed'
          ? 'Image could not be processed.'
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
              Upload a clear cover image. Metadata is stripped before publication.
            </Typography>
          </div>
          <div
            className="relative flex min-h-56 items-center justify-center overflow-hidden rounded-xl border border-dashed bg-card bg-cover bg-center"
            style={previewUrl ? { backgroundImage: `url(${previewUrl})` } : undefined}
          >
            {previewUrl ? (
              <Button type="button" variant="secondary" className="rounded-full" onClick={remove}>
                <Trash2 className="mr-2 size-4" />
                Remove image
              </Button>
            ) : (
              <Button type="button" variant="secondary" className="rounded-full" onClick={choose}>
                <ImagePlus className="mr-2 size-4" />
                Add image
              </Button>
            )}
          </div>
          <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp" hidden onChange={onInputChange} />
          {mediaError && (
            <Typography as="p" role="alert" className="text-sm text-destructive">
              {mediaError}
            </Typography>
          )}
          <ControlledInputField
            name={CREATE_MARKETPLACE_LISTING_FIELDS.ALT_TEXT}
            control={form.control}
            label="Image description"
            placeholder="Describe the item for people using screen readers"
            disabled={isPublishing}
          />
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
              disabled={isPublishing}
              options={[
                { value: 'fixed_price', label: 'Buy now' },
                { value: 'auction', label: '7-day auction' },
              ]}
            />
            <ControlledInputField
              name={CREATE_MARKETPLACE_LISTING_FIELDS.PRICE}
              control={form.control}
              label="Price (USD)"
              placeholder="125.00"
              disabled={isPublishing}
            />
            <ControlledInputField
              name={CREATE_MARKETPLACE_LISTING_FIELDS.QUANTITY}
              control={form.control}
              label="Quantity"
              placeholder="1"
              disabled={isPublishing}
            />
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
                  label="Flat shipping (USD)"
                  placeholder="12.00"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.WEIGHT_GRAMS}
                  control={form.control}
                  label="Weight (grams)"
                  placeholder="1200"
                  disabled={isPublishing}
                />
              </div>
              <div className="grid gap-5 sm:grid-cols-3">
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.LENGTH_MM}
                  control={form.control}
                  label="Length (mm)"
                  placeholder="350"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.WIDTH_MM}
                  control={form.control}
                  label="Width (mm)"
                  placeholder="250"
                  disabled={isPublishing}
                />
                <ControlledInputField
                  name={CREATE_MARKETPLACE_LISTING_FIELDS.HEIGHT_MM}
                  control={form.control}
                  label="Height (mm)"
                  placeholder="150"
                  disabled={isPublishing}
                />
              </div>
            </>
          )}
        </CardContent>
      </Card>

      <Button type="submit" size="lg" className="w-full rounded-full" disabled={isPublishing}>
        {isPublishing ? 'Publishing…' : 'Publish listing'}
      </Button>
    </form>
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
