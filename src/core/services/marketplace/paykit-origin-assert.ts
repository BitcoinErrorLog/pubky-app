import { ClientErrorCode } from '@/libs/error/error.codes';
import { Err } from '@/libs/error/error.factories';
import { ErrorService } from '@/libs/error/error.types';
import { isSecurePaykitOrigin, PAYKIT_ORIGIN_INSECURE_MESSAGE } from './paykit-origin';

/**
 * The Err-throwing half of the shared secure-origin rule (the pure predicate
 * and refusal copy live in `paykit-origin.ts` so the zod-only runtime-config
 * schema can share them). Refuses with the static `paykit_origin_insecure`
 * copy (the same fail-closed shape as `bitcoin_network_unconfigured`).
 *
 * Called by BOTH the token-carrying choke point in
 * `marketplace-paykit-claim.ts` and the setup-navigation builder in
 * `services/locks/locks.ts`, so navigation and token flow can never diverge
 * (W1.8b N1). Kept in its own import-light module so `locks.ts` — which
 * deliberately loads no WASM/SDK module-scope graph — can enforce the rule
 * without pulling in the claim service's homeserver SDK imports.
 */
export function assertSecurePaykitOrigin(url: URL, operation: string): void {
  if (isSecurePaykitOrigin(url)) return;
  throw Err.client(ClientErrorCode.BAD_REQUEST, PAYKIT_ORIGIN_INSECURE_MESSAGE, {
    service: ErrorService.Paykit,
    operation,
    context: { reason: 'paykit_origin_insecure' },
  });
}
