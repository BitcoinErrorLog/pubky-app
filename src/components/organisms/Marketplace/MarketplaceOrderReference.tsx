'use client';

import { useState } from 'react';
import { ExternalLink } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Link } from '@/atoms/Link/Link';
import { copyToClipboard } from '@/libs/utils/utils';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';
import { sellerPaypalActivityUrl, shortOrderReference } from './order-reference';

export function MarketplaceOrderReference({ order, isBuyer }: { order: MarketplaceOrder; isBuyer: boolean }) {
  const reference = shortOrderReference(order.id);
  const paypalUrl = sellerPaypalActivityUrl(order, isBuyer);
  const [copied, setCopied] = useState(false);

  return (
    <div className="mt-2 flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1" data-testid="order-reference">
      <span className="text-sm font-medium" data-testid="order-reference-label">
        Order {reference}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-7 px-2 text-xs"
        data-testid="order-reference-copy"
        onClick={() => {
          void copyToClipboard({ text: reference })
            .then(() => setCopied(true))
            .catch(() => setCopied(false));
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </Button>
      {paypalUrl ? (
        <Link
          href={paypalUrl}
          overrideDefaults
          data-testid="open-in-paypal"
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          Open in PayPal
          <ExternalLink className="size-3.5" />
        </Link>
      ) : null}
    </div>
  );
}
