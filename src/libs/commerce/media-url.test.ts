import { describe, expect, it, vi } from 'vitest';
import { resolveFirstMarketplaceMediaUrl, resolveMarketplaceMediaUrl } from './media-url';

const SELLER = 'y'.repeat(52);

vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getHomeserverUrl: () => 'https://homeserver.staging.pubky.app',
}));

describe('resolveMarketplaceMediaUrl', () => {
  it('resolves a pubky marketplace media URI to the homeserver public read URL', () => {
    const url = resolveMarketplaceMediaUrl(`pubky://${SELLER}/pub/pubky.app/marketplace/v1/media/image_01`);

    expect(url).toBe(
      `https://homeserver.staging.pubky.app/pub/pubky.app/marketplace/v1/media/image_01?pubky-host=${SELLER}`,
    );
  });

  it('passes plain http(s) URLs through unchanged', () => {
    expect(resolveMarketplaceMediaUrl('https://cdn.example.com/media/1.jpg')).toBe(
      'https://cdn.example.com/media/1.jpg',
    );
    expect(resolveMarketplaceMediaUrl('http://localhost:8787/media/1.jpg')).toBe('http://localhost:8787/media/1.jpg');
  });

  it('returns null for URIs with no browser-loadable form', () => {
    expect(resolveMarketplaceMediaUrl('')).toBeNull();
    expect(resolveMarketplaceMediaUrl('data:image/png;base64,AAAA')).toBeNull();
    expect(resolveMarketplaceMediaUrl('pubky://not-a-valid-z32/pub/pubky.app/marketplace/v1/media/x')).toBeNull();
    // Valid owner but a private (non-/pub/) path is never publicly readable.
    expect(resolveMarketplaceMediaUrl(`pubky://${SELLER}/priv/secret.jpg`)).toBeNull();
    expect(resolveMarketplaceMediaUrl(`pubky://${SELLER}`)).toBeNull();
  });
});

describe('resolveFirstMarketplaceMediaUrl', () => {
  it('returns the first resolvable URL, skipping unresolvable entries', () => {
    const url = resolveFirstMarketplaceMediaUrl([
      'not-a-uri',
      `pubky://${SELLER}/pub/pubky.app/marketplace/v1/media/image_02`,
      `pubky://${SELLER}/pub/pubky.app/marketplace/v1/media/image_03`,
    ]);

    expect(url).toBe(
      `https://homeserver.staging.pubky.app/pub/pubky.app/marketplace/v1/media/image_02?pubky-host=${SELLER}`,
    );
  });

  it('returns null when nothing resolves', () => {
    expect(resolveFirstMarketplaceMediaUrl([])).toBeNull();
    expect(resolveFirstMarketplaceMediaUrl(['nope'])).toBeNull();
  });
});
