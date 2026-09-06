import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { APP_ROUTES } from '@/app/routes';
import { MARKETPLACE_STATIC_SEO } from '@/libs/commerce/seo';
import { createNexusListingDetailsFixture } from '@/test/fixtures/commerce/commerce';
import MarketplacePage, { generateMetadata } from './page';

vi.mock('@/libs/runtime-config/runtime-config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/libs/runtime-config/runtime-config')>();
  return {
    ...actual,
    getCommerceAdapterMode: () => 'transaction-service',
  };
});

vi.mock('@/templates/Marketplace/Marketplace', () => ({
  Marketplace: ({ initialListings }: { initialListings: Array<{ title: string }> }) => (
    <main>
      {initialListings.map((listing) => (
        <article key={listing.title}>{listing.title}</article>
      ))}
    </main>
  ),
}));

describe('marketplace catalog page', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('emits OG title and description consistent with listing fallback copy', () => {
    const metadata = generateMetadata();

    expect(metadata.title).toBe(MARKETPLACE_STATIC_SEO.title);
    expect(metadata.description).toBe(MARKETPLACE_STATIC_SEO.description);
    expect(metadata.openGraph?.url).toBe(APP_ROUTES.MARKETPLACE);
    expect(metadata.openGraph).not.toHaveProperty('images');
    expect(metadata.twitter).not.toHaveProperty('images');
  });

  it('server-renders listing cards from a fixture Nexus stream', async () => {
    const fixture = createNexusListingDetailsFixture();
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([fixture]), { status: 200, headers: { 'Content-Type': 'application/json' } }),
    );

    render(await MarketplacePage());

    expect(screen.getByRole('article')).toHaveTextContent('Vintage leather boots');
  });
});
