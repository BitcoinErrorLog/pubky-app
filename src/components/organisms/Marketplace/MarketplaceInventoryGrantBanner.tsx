'use client';

import { KeyRound } from 'lucide-react';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { MarketplaceInventoryGrantDialog } from './MarketplaceInventoryGrantDialog';

export function MarketplaceInventoryGrantBanner({ onConnected }: { onConnected?: () => void }) {
  return (
    <div
      role="alert"
      data-testid="inventory-grant-banner"
      className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-brand/40 bg-brand/5 px-6 py-8 text-center"
    >
      <KeyRound className="size-10 text-muted-foreground" />
      <div>
        <Heading level={2} size="md">
          Stock and imports need a marketplace-service grant
        </Heading>
        <Typography as="p" className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          Approve /pub/pubky.app/marketplace-service/v1/:rw in your Pubky signer. This grant is only for inventory. It
          never requests /:rw.
        </Typography>
      </div>
      <MarketplaceInventoryGrantDialog onConnected={onConnected} />
    </div>
  );
}
