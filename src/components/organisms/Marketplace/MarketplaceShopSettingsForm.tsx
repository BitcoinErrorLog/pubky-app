'use client';

import { Controller } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Label } from '@/atoms/Label/Label';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceShopSettings } from '@/hooks/useMarketplaceShopSettings/useMarketplaceShopSettings';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export interface MarketplaceShopSettingsFormProps {
  onSaved?: () => void;
}

export function MarketplaceShopSettingsForm({ onSaved }: MarketplaceShopSettingsFormProps) {
  const settings = useMarketplaceShopSettings();

  if (settings.isLoading) {
    return <Skeleton className="h-96 w-full" />;
  }

  const submit = async () => {
    const succeeded = await settings.submit();
    if (succeeded) onSaved?.();
  };

  return (
    <Card className="border">
      <CardContent className="grid gap-5 px-6">
        <div>
          <Typography as="h2" className="text-xl font-semibold">
            {settings.hasShop ? 'Shop details and policies' : 'Create your shop'}
          </Typography>
          <Typography as="p" className="text-sm text-muted-foreground">
            {settings.hasShop
              ? `Public owner-signed storefront settings · revision ${settings.revision}`
              : 'Buyers see this on your public shop page and next to every listing you publish.'}
          </Typography>
        </div>
        <ControlledInputField name="name" control={settings.form.control} label="Shop name" />
        <ControlledTextareaField name="bio" control={settings.form.control} label="Shop bio" />
        <div className="grid gap-4 sm:grid-cols-2">
          <ControlledInputField name="countryCode" control={settings.form.control} label="Country" />
          <ControlledInputField name="region" control={settings.form.control} label="Region" />
        </div>
        <ControlledTextareaField name="shippingPolicy" control={settings.form.control} label="Shipping policy" />
        <ControlledTextareaField name="returnPolicy" control={settings.form.control} label="Return policy" />
        <Controller
          name="vacationMode"
          control={settings.form.control}
          render={({ field }) => (
            <div>
              <Label className="justify-between">
                Vacation mode
                <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Vacation mode" />
              </Label>
              <Typography as="p" className="mt-1 text-sm text-muted-foreground">
                Shows a vacation notice on your shop and listings. Listings stay visible; pause them from the seller
                dashboard if you want them unavailable.
              </Typography>
            </div>
          )}
        />
        <Button className="w-full rounded-full" onClick={() => void submit()}>
          {settings.hasShop ? 'Save shop settings' : 'Create shop'}
        </Button>
      </CardContent>
    </Card>
  );
}
