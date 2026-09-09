/**
 * The single https-or-loopback rule every paykit URL passes through (W1.8
 * F1, W1.8b N1). One pure predicate, shared by all three paykit gates so
 * they can never diverge:
 *
 *  - the token-carrying choke point `paykitServerOrigin()`
 *    (`marketplace-paykit-claim.ts`) — refuses to SEND a claim credential
 *    to an insecure origin;
 *  - the setup-navigation builder `buildPaykitSetupUrl`
 *    (`services/locks/locks.ts`) — refuses to NAVIGATE the seller to an
 *    origin the app itself would not send tokens to;
 *  - the boot-time config refinement (`runtime-config.schema.ts`) — refuses
 *    to PARSE an insecure `PUBKY_RUNTIME_PAYKIT_SETUP_URL`.
 *
 * Pure by design — no imports — so the zod-only runtime-config schema can
 * share it without pulling in the `env -> libs/error -> logger -> env`
 * import cycle.
 */

/**
 * The static user-facing copy every insecure-origin refusal carries
 * (`paykit_origin_insecure`), shared so the token paths and the setup
 * navigation say the same thing.
 */
export const PAYKIT_ORIGIN_INSECURE_MESSAGE =
  'The Paykit server address is not a secure HTTPS origin, so Shop refused to send your approval to it. Contact the operator.';

/**
 * Loopback hosts a dev deployment may reach over plain `http:` (the schema
 * default is `http://localhost:3102/setup`). Every other paykit origin must
 * be HTTPS: the claim POST sends `auth_token` in the body and the status GET
 * sends `Authorization: Bearer <AuthToken>` — a claim credential must never
 * travel to a cleartext origin (W1.8 F1). Hostname matching is exact:
 * `localhost.evil.example`, `127.0.0.1.evil` and `localhost.` are NOT
 * loopback.
 */
const PAYKIT_INSECURE_ALLOWED_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

/** `true` when a paykit URL is safe to send claim credentials to. */
export function isSecurePaykitOrigin(url: URL): boolean {
  return url.protocol === 'https:' || PAYKIT_INSECURE_ALLOWED_HOSTNAMES.has(url.hostname);
}
