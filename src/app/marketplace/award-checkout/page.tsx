import { gatedMarketplaceMetadata } from '@/app/marketplace/gated-metadata';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import { MarketplaceAwardCheckout } from '@/templates/Marketplace/MarketplaceAwardCheckout';

export function generateMetadata() {
  return gatedMarketplaceMetadata(
    'Pay agreed price | Pubky Marketplace',
    'Review and pay the terms accepted for your marketplace offer.',
    MARKETPLACE_ROUTES.AWARD_CHECKOUT,
  );
}

export default MarketplaceAwardCheckout;
