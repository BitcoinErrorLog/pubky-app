'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Bell, HandCoins, Heart, LayoutDashboard, MessageCircle, ReceiptText, ShoppingCart } from 'lucide-react';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceActivityUnread } from '@/hooks/useMarketplaceActivityUnread/useMarketplaceActivityUnread';
import { useMarketplaceCartCount } from '@/hooks/useMarketplaceCartCount/useMarketplaceCartCount';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';

type MarketplaceSectionItem = {
  label: string;
  href: string;
  icon: typeof MessageCircle;
  badge?: 'cart' | 'activity';
  activePrefixes?: readonly string[];
};

const ITEMS: readonly MarketplaceSectionItem[] = [
  { label: 'Messages', href: MARKETPLACE_ROUTES.MESSAGES, icon: MessageCircle },
  { label: 'Offers', href: MARKETPLACE_ROUTES.OFFERS, icon: HandCoins },
  { label: 'Watchlist', href: MARKETPLACE_ROUTES.WATCHLIST, icon: Heart },
  { label: 'Cart', href: MARKETPLACE_ROUTES.CART, icon: ShoppingCart, badge: 'cart' },
  { label: 'Orders', href: MARKETPLACE_ROUTES.ORDERS, icon: ReceiptText },
  { label: 'Activity', href: MARKETPLACE_ROUTES.NOTIFICATIONS, icon: Bell, badge: 'activity' },
  {
    label: 'Seller studio',
    href: MARKETPLACE_ROUTES.DASHBOARD,
    icon: LayoutDashboard,
    activePrefixes: [
      MARKETPLACE_ROUTES.DASHBOARD,
      MARKETPLACE_ROUTES.SELL,
      MARKETPLACE_ROUTES.MY_SHOP,
      MARKETPLACE_ROUTES.SETTINGS,
    ],
  },
] as const;

export function MarketplaceSectionNav({ requireAuthentication = false }: { requireAuthentication?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();
  const { isAuthenticated, requireAuth } = useRequireAuth();
  const cartCount = useMarketplaceCartCount();
  const activityUnreadCount = useMarketplaceActivityUnread();

  return (
    <nav
      aria-label="Marketplace sections"
      data-testid="marketplace-section-nav"
      data-surface="marketplace-section-nav"
      className="w-full overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      <div className="flex min-w-max">
        {ITEMS.map(({ label, href, icon: Icon, badge, activePrefixes }) => {
          const prefixes = activePrefixes ?? [href];
          const active =
            typeof pathname === 'string' &&
            prefixes.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
          const count = badge === 'cart' ? cartCount : badge === 'activity' ? activityUnreadCount : 0;
          return (
            <Link
              key={label}
              href={href}
              overrideDefaults
              aria-current={active ? 'page' : undefined}
              onClick={(event) => {
                if (requireAuthentication && !isAuthenticated) {
                  event.preventDefault();
                  requireAuth(() => router.push(href));
                }
              }}
              className={cn(
                'relative inline-flex min-h-12 shrink-0 items-center gap-2 border-b px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors',
                active
                  ? 'border-foreground text-foreground'
                  : 'border-border text-muted-foreground hover:text-foreground',
              )}
            >
              <Icon className="size-4" aria-hidden="true" />
              {label}
              {count > 0 && (
                <Badge
                  data-testid={`marketplace-section-nav-${badge}-badge`}
                  aria-label={`${count} ${badge === 'cart' ? 'cart items' : 'unread activity'}`}
                  className="h-5 min-w-5 rounded-full bg-brand px-1.5 shadow-sm"
                  variant="secondary"
                >
                  <Typography
                    className={cn('font-semibold text-primary-foreground', count > 21 && 'text-xs')}
                    size="xs"
                  >
                    {count > 21 ? '21+' : count}
                  </Typography>
                </Badge>
              )}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
