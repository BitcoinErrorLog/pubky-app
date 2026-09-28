import { describe, expect, it } from 'vitest';
import captured from '@/test/fixtures/auth/marketplace-grant-priv-parity.staging.json';
import ringCapture from '@/test/fixtures/auth/ring-signin-url.sdk-0.8.0.json';
import {
  capabilitiesCoverScope,
  claimedGrantRejection,
  isMarketplaceSessionGrant,
  isMarketplaceSessionGrantUrl,
  MARKETPLACE_PREVIOUS_SESSION_GRANT,
  MARKETPLACE_PRIVATE_DATA_SCOPE,
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
      'Bitkit shows this request from marketplace.staging.shop.pubky.app, for marketplace purchases, stock edits, and reading and writing your private Shop data.',
    );
    expect(sessionGrantApprovalCaption(urlFor(captured.previous_request), 'Bitkit')).toBe(
      'Bitkit shows this request from marketplace.staging.shop.pubky.app, for marketplace purchases and stock edits.',
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

  it('captions the Ring connect-marketplace QR, which names no client', () => {
    const ringUrl = `${ringCapture.scheme}//${ringCapture.host}?${ringCapture.params
      .map((name) => `${name}=${encodeURIComponent(name === 'caps' ? MARKETPLACE_SESSION_GRANT : 'x')}`)
      .join('&')}`;
    expect(sessionGrantApprovalCaption(ringUrl, 'Pubky Ring')).toBe(
      'Pubky Ring shows this request for marketplace purchases, stock edits, and reading and writing your private Shop data.',
    );
  });
});

describe('capabilitiesCoverScope', () => {
  it.each([
    [MARKETPLACE_SESSION_GRANT, true],
    ['/priv/:rw', true],
    ['/:rw', true],
    ['/priv/pubky.app/:wr', true],
    ['/priv/pubky.app/:r', false],
    ['/priv/pubky.app/:rwx', false],
    ['/priv/pubky.app/marketplace/:rw', false],
    ['/priv/pubky.app:rw', false],
    ['/priv/other.app/:rw', false],
    ['', false],
  ])('%s covers /priv/pubky.app/ = %s', (capabilities, covers) => {
    expect(capabilitiesCoverScope(capabilities, MARKETPLACE_PRIVATE_DATA_SCOPE)).toBe(covers);
  });
});

describe('claimedGrantRejection', () => {
  const PUBKY = 'y'.repeat(52);
  const parity = captured.parity_request.homeserver_verified;
  const previous = captured.previous_request.homeserver_verified;

  it('accepts either marketplace session grant in any order with no current session', () => {
    expect(claimedGrantRejection(parity, null, PUBKY)).toBeNull();
    expect(claimedGrantRejection(parity.split(',').reverse().join(','), null, PUBKY)).toBeNull();
    expect(claimedGrantRejection(previous, null, PUBKY)).toBeNull();
    expect(isMarketplaceSessionGrant(` ${previous} `)).toBe(true);
  });

  it.each(['', ',', `${previous},${previous}`, `${parity},`, '/pub/pubky.app/:rw', '/:rw', 'garbage'])(
    'refuses %j as unexpected',
    (capabilities) => {
      expect(claimedGrantRejection(capabilities, null, PUBKY)).toBe('unexpected_capabilities');
    },
  );

  it('refuses a claim that drops a scope the current session covers', () => {
    expect(claimedGrantRejection(previous, { pubky: PUBKY, capabilities: parity }, PUBKY)).toBe(
      'narrower_than_current',
    );
    expect(
      claimedGrantRejection(previous, { pubky: PUBKY, capabilities: captured.shop_signin_request.caps }, PUBKY),
    ).toBe('narrower_than_current');
    expect(claimedGrantRejection(parity, { pubky: PUBKY, capabilities: previous }, PUBKY)).toBeNull();
    expect(claimedGrantRejection(previous, { pubky: PUBKY, capabilities: '' }, PUBKY)).toBeNull();
  });

  it('ignores a current session that belongs to another pubky', () => {
    expect(claimedGrantRejection(previous, { pubky: 'z'.repeat(52), capabilities: parity }, PUBKY)).toBeNull();
  });
});
