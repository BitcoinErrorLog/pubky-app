'use client';

import { Controller } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Label } from '@/atoms/Label/Label';
import { Switch } from '@/atoms/Switch/Switch';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceShopSettings } from '@/hooks/useMarketplaceShopSettings/useMarketplaceShopSettings';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';

export function MarketplaceShopSettingsForm() {
  const settings = useMarketplaceShopSettings();

  return (
    <Card className="border">
      <CardContent className="grid gap-5 px-6">
        <div>
          <Typography as="h2" className="text-xl font-semibold">
            Shop policies
          </Typography>
          <Typography as="p" className="text-sm text-muted-foreground">
            Public owner-signed storefront settings · revision {settings.revision}
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
            <Label className="justify-between">
              Vacation mode
              <Switch checked={field.value} onCheckedChange={field.onChange} aria-label="Vacation mode" />
            </Label>
          )}
        />
        <Button className="w-full rounded-full" onClick={() => void settings.submit()}>
          Save shop settings
        </Button>
      </CardContent>
    </Card>
  );
}
