'use client';

import { KeyRound } from 'lucide-react';
import { Heading } from '@/atoms/Heading/Heading';
import { Typography } from '@/atoms/Typography/Typography';
import { useIsGrantSession } from '@/hooks/useIsGrantSession/useIsGrantSession';
import { getMarketplaceGrantFlowEnabled } from '@/libs/runtime-config/runtime-config';
import { MarketplaceSessionConnectDialog } from './MarketplaceSessionConnectDialog';

/**
 * Shows static approval copy on durable marketplace surfaces when the durable
 * transport reports `isMarketplaceSessionRequiredError`: Bitkit for a Bitkit
 * (grant) sign-in that can bootstrap, Pubky Ring otherwise. Sandbox surfaces
 * never see this card because they do not use the durable transport.
 */
export function MarketplaceSessionRequiredCard({ onConnected }: { onConnected?: () => void | Promise<void> }) {
  const signer = useIsGrantSession() && getMarketplaceGrantFlowEnabled() ? 'Bitkit' : 'Pubky Ring';
  return (
    <div
      role="alert"
      className="flex min-h-56 flex-col items-center justify-center gap-4 rounded-xl border border-dashed px-6 py-8 text-center"
    >
      <KeyRound className="size-10 text-muted-foreground" />
      <div>
        <Heading level={2} size="md">
          Approve purchases in {signer}
        </Heading>
        <Typography as="p" className="mx-auto mt-2 max-w-lg text-sm text-muted-foreground">
          One approval lets you buy, bid, and make offers on this marketplace. Nothing is charged until you pay.
        </Typography>
      </div>
      <MarketplaceSessionConnectDialog triggerLabel={`Approve in ${signer}`} onConnected={onConnected} />
    </div>
  );
}
