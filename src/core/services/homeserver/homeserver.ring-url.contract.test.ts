// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { CAPABILITIES } from '@/config/app';
import captured from '@/test/fixtures/auth/ring-signin-url.sdk-0.8.0.json';
import { HomeserverService } from './homeserver';

describe('Ring sign-in QR on @synonymdev/pubky 0.11 (real SDK)', () => {
  it('ring qr matches captured 0.8.0 host and params', async () => {
    const { authorizationUrl, awaitApproval, cancelAuthFlow } = await HomeserverService.generateAuthUrl();
    // Cancelling below rejects the pending approval; this test only reads the URL.
    awaitApproval.catch(() => undefined);
    try {
      const url = new URL(authorizationUrl);

      expect(url.protocol).toBe(captured.scheme);
      expect(url.host).toBe(captured.host);
      expect([...url.searchParams.keys()]).toEqual(captured.params);
      expect(url.searchParams.get('caps')).toBe(captured.caps);
      expect(url.searchParams.get('caps')).toBe(CAPABILITIES);
    } finally {
      cancelAuthFlow();
    }
  });
});
