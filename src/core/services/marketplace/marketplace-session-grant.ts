/**
 * The capabilities a marketplace purchase session requests, whichever signer
 * approves it: the Bitkit/Ring grant flow (marketplace-service
 * `GRANT_REQUEST_CAPABILITIES`) and the Pubky Ring "Connect marketplace" QR.
 * Inventory tools, plus the private tree whose data key
 * `GET /v1/me/priv-keys` releases only to a session that can read and write
 * it. The signer shows this string verbatim.
 */
export const MARKETPLACE_SESSION_GRANT = '/pub/pubky.app/marketplace-service/v1/:rw,/priv/pubky.app/:rw' as const;

/**
 * What marketplace-service requested before it asked for `/priv/pubky.app/`.
 * A service that has not yet deployed the wider request still emits it, so
 * the Shop and the service can deploy in either order.
 */
export const MARKETPLACE_PREVIOUS_SESSION_GRANT = '/pub/pubky.app/marketplace-service/v1/:rw' as const;

/** The two directories whose authority the service checks on a purchase session. */
export const MARKETPLACE_INVENTORY_SCOPE = '/pub/pubky.app/marketplace-service/v1/';
export const MARKETPLACE_PRIVATE_DATA_SCOPE = '/priv/pubky.app/';

const READ_WRITE_ACTIONS = new Set(['rw', 'wr']);

function capabilityParts(capabilities: string): string[] {
  return capabilities
    .split(',')
    .map((part) => part.trim())
    .filter((part) => part.length > 0);
}

/**
 * True when some entry grants exactly read and write over a directory that
 * contains `scope` — the service's rule (`scope_covers_path` plus both
 * actions). Empty, read-only, narrower and unrelated grants do not cover it.
 */
export function capabilitiesCoverScope(capabilities: string, scope: string): boolean {
  return capabilityParts(capabilities).some((part) => {
    const separator = part.lastIndexOf(':');
    if (separator <= 0) return false;
    const directory = part.slice(0, separator);
    return directory.endsWith('/') && scope.startsWith(directory) && READ_WRITE_ACTIONS.has(part.slice(separator + 1));
  });
}

function sameCapabilitySet(capabilities: string, expected: string): boolean {
  const raw = capabilities.split(',').map((part) => part.trim());
  if (raw.some((part) => part.length === 0) || new Set(raw).size !== raw.length) return false;
  const wanted = expected.split(',');
  return raw.length === wanted.length && wanted.every((part) => raw.includes(part));
}

/** True only for exactly one of the two marketplace session grants, in any order. */
export function isMarketplaceSessionGrant(capabilities: string): boolean {
  return (
    sameCapabilitySet(capabilities, MARKETPLACE_SESSION_GRANT) ||
    sameCapabilitySet(capabilities, MARKETPLACE_PREVIOUS_SESSION_GRANT)
  );
}

/** Why a claimed grant session must not replace the current one, or null when it may. */
export type ClaimedGrantRejection = 'unexpected_capabilities' | 'narrower_than_current';

/**
 * A claimed grant result replaces the active purchase session only when it
 * carries exactly a marketplace session grant and keeps every scope the
 * current session for the same pubky already covers.
 */
export function claimedGrantRejection(
  claimedCapabilities: string,
  current: { pubky: string; capabilities: string } | null,
  claimedPubky: string,
): ClaimedGrantRejection | null {
  if (!isMarketplaceSessionGrant(claimedCapabilities)) return 'unexpected_capabilities';
  if (!current || current.pubky !== claimedPubky) return null;
  for (const scope of [MARKETPLACE_INVENTORY_SCOPE, MARKETPLACE_PRIVATE_DATA_SCOPE]) {
    if (capabilitiesCoverScope(current.capabilities, scope) && !capabilitiesCoverScope(claimedCapabilities, scope)) {
      return 'narrower_than_current';
    }
  }
  return null;
}

function capsParam(authorizationUrl: string): string | null {
  try {
    return new URL(authorizationUrl).searchParams.getAll('caps').join(',');
  } catch {
    return null;
  }
}

/**
 * True only for an approval URL whose `caps` is exactly one of the two
 * marketplace session requests. Anything wider is never shown to a signer.
 */
export function isMarketplaceSessionGrantUrl(authorizationUrl: string): boolean {
  const caps = capsParam(authorizationUrl);
  return caps === MARKETPLACE_SESSION_GRANT || caps === MARKETPLACE_PREVIOUS_SESSION_GRANT;
}

/**
 * What the signer shows for a marketplace session approval, in plain words:
 * the client id when the URL names one, and the authority it hands over.
 * Null when the URL requests anything but a marketplace session grant.
 */
export function sessionGrantApprovalCaption(authorizationUrl: string, signer: string): string | null {
  if (!isMarketplaceSessionGrantUrl(authorizationUrl)) return null;
  const cid = new URL(authorizationUrl).searchParams.get('cid');
  const scope = capabilitiesCoverScope(capsParam(authorizationUrl) ?? '', MARKETPLACE_PRIVATE_DATA_SCOPE)
    ? 'for marketplace purchases, stock edits, and reading and writing your private Shop data'
    : 'for marketplace purchases and stock edits';
  return cid ? `${signer} shows this request from ${cid}, ${scope}.` : `${signer} shows this request ${scope}.`;
}
