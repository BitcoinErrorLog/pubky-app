'use client';

import { useMarketplaceActivityUnread } from '@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread';
import { useMarketplaceOrdersAttention } from '@/hooks/useMarketplaceOrdersAttention/useMarketplaceOrdersAttention';

/** Unread action on Activity plus orders that still need this identity. */
export function useMarketplaceNavAttention(): number {
  return useMarketplaceActivityUnread() + useMarketplaceOrdersAttention();
}
