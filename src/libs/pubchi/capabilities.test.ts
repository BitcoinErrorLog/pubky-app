import { describe, expect, it } from 'vitest';
import {
  capabilitiesCoverPubchiWrite,
  PUBCHI_PRIVATE_DIRECTORY,
  PUBCHI_SIGNIN_CAPABILITIES,
  sessionCovers,
} from './capabilities';

describe('capabilitiesCoverPubchiWrite', () => {
  it('accepts root /:rw (keypair session mint)', () => {
    expect(capabilitiesCoverPubchiWrite(['/:rw'])).toBe(true);
    expect(sessionCovers(['/:rw'], PUBCHI_PRIVATE_DIRECTORY)).toBe(true);
  });

  it('accepts /pub/:rw', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/:rw'])).toBe(true);
  });

  it('accepts /pub/pubchi.app/:rw', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/pubchi.app/:rw'])).toBe(true);
  });

  it('accepts write-only /pub/pubchi.app/:w (SDK CapabilityAction includes w)', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/pubchi.app/:w'])).toBe(true);
  });

  it('rejects Ring default /pub/pubky.app/:rw', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/pubky.app/:rw'])).toBe(false);
  });

  it('rejects near-miss scopes that share a string prefix but not a path segment', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/pubchi.app.evil/:rw'])).toBe(false);
    expect(capabilitiesCoverPubchiWrite(['/pub/pubchi.appfoo/:rw'])).toBe(false);
  });

  it('rejects a read-only capability over a covering scope', () => {
    expect(capabilitiesCoverPubchiWrite(['/:r'])).toBe(false);
    expect(capabilitiesCoverPubchiWrite(['/pub/:r'])).toBe(false);
    expect(capabilitiesCoverPubchiWrite(['/pub/pubchi.app/:r'])).toBe(false);
  });

  it('rejects a file-scope grant of the same name', () => {
    expect(capabilitiesCoverPubchiWrite(['/pub/pubchi.app:rw'])).toBe(false);
  });

  it('accepts a private Pubchi directory grant and rejects read-only coverage', () => {
    expect(sessionCovers([`${PUBCHI_PRIVATE_DIRECTORY}:rw`], PUBCHI_PRIVATE_DIRECTORY)).toBe(true);
    expect(sessionCovers([`${PUBCHI_PRIVATE_DIRECTORY}:r`], PUBCHI_PRIVATE_DIRECTORY)).toBe(false);
  });
});

describe('PUBCHI_SIGNIN_CAPABILITIES', () => {
  it('requests public, Pubchi homeserver, and private Pubchi write access', () => {
    expect(PUBCHI_SIGNIN_CAPABILITIES).toBe(
      '/pub/pubky.app/:rw,/pub/pubchi.app/:rw,/priv/pubchi.app/:rw',
    );
  });
});
