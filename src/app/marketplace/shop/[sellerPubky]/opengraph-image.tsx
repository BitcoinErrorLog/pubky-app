import { OG_CONTENT_TYPE, OG_SIZE } from '@/libs/og/ogConstants';
import { renderShopOg } from '@/libs/og/renderShopOg';

// Metadata exports read by Next for the injected <meta> tags.
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = 'Pubky Marketplace shop preview';

// Segment config must be a statically-analyzable literal — Next won't resolve an
// imported constant here — kept in sync with OG_COMMERCE_REVALIDATE.
export const revalidate = 300;

export default async function Image({ params }: { params: Promise<{ sellerPubky: string }> }) {
  const { sellerPubky } = await params;
  return renderShopOg({ sellerPubky });
}
