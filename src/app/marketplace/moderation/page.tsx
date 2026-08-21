import { gatedMarketplaceMetadata } from '@/app/marketplace/gated-metadata';
import { MARKETPLACE_ROUTES } from '@/app/routes';

export { MarketplaceModeration as default } from '@/templates/Marketplace/MarketplaceModeration';

export function generateMetadata() {
  return gatedMarketplaceMetadata(
    'Moderation | Pubky Marketplace',
    'Pubky Marketplace moderation tools.',
    MARKETPLACE_ROUTES.MODERATION,
  );
}
