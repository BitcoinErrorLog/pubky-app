'use client';

import { KeyRound } from 'lucide-react';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { MarketplaceSessionConnectDialog } from './MarketplaceSessionConnectDialog';

/**
 * Replaces the dead-end "session required" error box on durable-mode
 * surfaces with the actual remedy: the session-connect dialog. `message` is
 * the REAL transport error (missing session vs. expired session carry
 * different guidance), never a rewritten summary. Rendered only when the
 * caught error is `isMarketplaceSessionRequiredError` — which only the
 * durable transport produces, so sandbox surfaces never see this card.
 */
export function MarketplaceSessionRequiredCard({
  message,
  onConnected,
}: {
  message: string;
  onConnected?: () => void | Promise<void>;
}) {
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-8 text-center"
    >
      <KeyRound className="size-10 text-muted-foreground" />
      <div>
        <Heading level={2} size="md">
          Marketplace session required
        </Heading>
        <Typography as="p" className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          {message}
        </Typography>
      </div>
      <MarketplaceSessionConnectDialog onConnected={onConnected} />
    </div>
  );
}
