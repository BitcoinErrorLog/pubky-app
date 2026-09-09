import { describe, expect, it } from 'vitest';
import { redirects } from './next.config';

describe('Next redirects', () => {
  it('redirects only the root to the marketplace', async () => {
    const configuredRedirects = await redirects();

    expect(configuredRedirects).toContainEqual({
      source: '/',
      destination: '/marketplace',
      permanent: false,
    });
    expect(configuredRedirects).not.toContainEqual(expect.objectContaining({ source: '/:path*' }));
  });
});
