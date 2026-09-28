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

const PRIV_APP_GRANT = '/priv/pubky.app/:rw';

function capsParam(authorizationUrl: string): string | null {
  try {
    return new URL(authorizationUrl).searchParams.getAll('caps').join(',');
  } catch {
    return null;
  }
}

/**
 * True only for a grant URL whose `caps` is exactly one of the two
 * marketplace session requests. Anything wider is never shown to a signer.
 */
export function isMarketplaceSessionGrantUrl(authorizationUrl: string): boolean {
  const caps = capsParam(authorizationUrl);
  return caps === MARKETPLACE_SESSION_GRANT || caps === MARKETPLACE_PREVIOUS_SESSION_GRANT;
}

function coversPrivateData(capabilities: string): boolean {
  return capabilities
    .split(',')
    .map((part) => part.trim())
    .includes(PRIV_APP_GRANT);
}

/**
 * What the signer shows for a marketplace session approval: the client id it
 * names and the scope in plain words. Null when the URL names no client or
 * requests something else.
 */
export function sessionGrantApprovalCaption(authorizationUrl: string, signer: string): string | null {
  let cid: string | null;
  try {
    cid = new URL(authorizationUrl).searchParams.get('cid');
  } catch {
    return null;
  }
  if (!cid || !isMarketplaceSessionGrantUrl(authorizationUrl)) return null;
  const scope = coversPrivateData(capsParam(authorizationUrl) ?? '')
    ? 'for marketplace purchases and your private Shop data'
    : 'for marketplace purchases only';
  return `${signer} shows this request from ${cid}, ${scope}.`;
}
