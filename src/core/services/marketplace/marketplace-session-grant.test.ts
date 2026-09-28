import { describe, expect, it } from 'vitest';
import captured from '@/test/fixtures/auth/marketplace-grant-priv-parity.staging.json';
import {
  isMarketplaceSessionGrantUrl,
  MARKETPLACE_PREVIOUS_SESSION_GRANT,
  MARKETPLACE_SESSION_GRANT,
  sessionGrantApprovalCaption,
} from './marketplace-session-grant';

type CapturedRequest = { scheme: string; host: string; params: string[]; caps: string; cid: string };

function urlFor(request: CapturedRequest, overrides: Record<string, string> = {}): string {
  const values: Record<string, string> = {
    caps: request.caps,
    relay: 'https://relay.example/inbox',
    secret: 's',
    cid: request.cid,
    cpk: 'k',
    ...overrides,
  };
  return `${request.scheme}//${request.host}?${request.params
    .map((name) => `${name}=${encodeURIComponent(values[name])}`)
    .join('&')}`;
}

describe('marketplace session grant', () => {
  it('is the grant Bitkit showed and the staging homeserver verified', () => {
    expect(captured.parity_request.caps).toBe(MARKETPLACE_SESSION_GRANT);
    expect(captured.parity_request.bitkit_shown).toBe(MARKETPLACE_SESSION_GRANT);
    expect(captured.parity_request.homeserver_verified).toBe(MARKETPLACE_SESSION_GRANT);
    expect(captured.previous_request.caps).toBe(MARKETPLACE_PREVIOUS_SESSION_GRANT);
  });

  it('accepts the captured parity and previous service requests', () => {
    expect(isMarketplaceSessionGrantUrl(urlFor(captured.parity_request))).toBe(true);
    expect(isMarketplaceSessionGrantUrl(urlFor(captured.previous_request))).toBe(true);
  });

  it('refuses any other capability request', () => {
    for (const caps of [
      captured.shop_signin_request.caps,
      `${MARKETPLACE_SESSION_GRANT},/pub/paykit/:rw`,
      '/:rw',
      '/priv/:rw,/pub/pubky.app/marketplace-service/v1/:rw',
      '/priv/pubky.app/:rw',
      '',
    ]) {
      expect(isMarketplaceSessionGrantUrl(urlFor(captured.parity_request, { caps })), caps).toBe(false);
    }
    const duplicated = `${urlFor(captured.parity_request)}&caps=${encodeURIComponent('/:rw')}`;
    expect(isMarketplaceSessionGrantUrl(duplicated)).toBe(false);
    expect(isMarketplaceSessionGrantUrl('not a url')).toBe(false);
  });

  it('captions the scope the signer shows', () => {
    expect(sessionGrantApprovalCaption(urlFor(captured.parity_request), 'Bitkit')).toBe(
      'Bitkit shows this request from marketplace.staging.shop.pubky.app, for marketplace purchases and your private Shop data.',
    );
    expect(sessionGrantApprovalCaption(urlFor(captured.previous_request), 'Bitkit')).toBe(
      'Bitkit shows this request from marketplace.staging.shop.pubky.app, for marketplace purchases only.',
    );
    expect(sessionGrantApprovalCaption('pubkyauth://signin_grant?caps=x', 'Bitkit')).toBeNull();
    expect(
      sessionGrantApprovalCaption(
        urlFor(captured.parity_request, { caps: captured.shop_signin_request.caps }),
        'Bitkit',
      ),
    ).toBeNull();
    expect(sessionGrantApprovalCaption('not a url', 'Bitkit')).toBeNull();
  });
});
