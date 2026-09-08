import { describe, expect, it } from 'vitest';
import { nextConfig } from './next.config';

describe('nextConfig redirects', () => {
  it('permanently redirects the Vercel production alias to bots.pubky.app', async () => {
    const redirects = await nextConfig.redirects?.();

    expect(redirects).toEqual(
      expect.arrayContaining([
        {
          source: '/:path*',
          has: [{ type: 'host', value: 'pubky-app-pubchi.vercel.app' }],
          destination: 'https://bots.pubky.app/:path*',
          permanent: true,
        },
      ]),
    );
  });
});
