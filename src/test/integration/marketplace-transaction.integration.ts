import { beforeAll, describe, expect, it } from 'vitest';

/**
 * End-to-end proof that the client transport speaks to the REAL Marketplace
 * Transaction Service (github.com/BitcoinErrorLog/pubky-marketplace-service):
 * a genuine Pubky auth flow (the test acts as the signer with a throwaway
 * keypair via `Signer.approveAuthRequest`, exactly what Pubky Ring does),
 * `AuthToken` bytes exchanged for a bearer session, and snake_case commands
 * executed and parsed back through the client's own transport code.
 *
 * Requirements (see docs/ecommerce/RUNNING.md):
 *   - the service running at MARKETPLACE_SERVICE_URL (default http://127.0.0.1:8080)
 *   - network access to the Pubky HTTP relay (staging relay by default)
 *
 * Nothing here is mocked; this file is excluded from the unit gates and run
 * explicitly with `npm run test:marketplace:service`.
 */

const SERVICE_URL = process.env.MARKETPLACE_SERVICE_URL ?? 'http://127.0.0.1:8080';

// Runtime config must be present before any app module is imported (lenient
// env parse: these layer over staging defaults). The `Env` singleton also
// parses at import time, so its required values are set here too.
process.env.PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE = 'transaction-service';
process.env.PUBKY_RUNTIME_MARKETPLACE_URL = SERVICE_URL;
process.env.PUBKY_RUNTIME_TESTNET = 'false';
process.env.NEXT_PUBLIC_APP_VERSION ??= '0.0.0-integration';
process.env.NEXT_PUBLIC_DB_VERSION ??= '1';
process.env.NEXT_PUBLIC_DEBUG_MODE ??= 'false';

type AppModules = {
  MarketplaceSessionService: typeof import('@/services/marketplace/marketplace-session').MarketplaceSessionService;
  MarketplaceGatewayService: typeof import('@/services/marketplace/marketplace').MarketplaceGatewayService;
  sdk: typeof import('@synonymdev/pubky');
};

async function loadModules(): Promise<AppModules> {
  const [{ MarketplaceSessionService }, { MarketplaceGatewayService }, sdk] = await Promise.all([
    import('@/services/marketplace/marketplace-session'),
    import('@/services/marketplace/marketplace'),
    import('@synonymdev/pubky'),
  ]);
  return { MarketplaceSessionService, MarketplaceGatewayService, sdk };
}

describe('marketplace transaction service integration', () => {
  let modules: AppModules;

  beforeAll(async () => {
    const health = await fetch(`${SERVICE_URL}/health`).catch(() => null);
    if (!health?.ok) {
      throw new Error(
        `The marketplace transaction service is not reachable at ${SERVICE_URL}. ` +
          'Start it first: docker compose up -d --wait && cargo run -p marketplace-service ' +
          '(see docs/ecommerce/RUNNING.md).',
      );
    }
    modules = await loadModules();
  });

  /**
   * Runs the full app-side session flow for one throwaway identity: start the
   * auth-token flow, approve it as the signer (what Pubky Ring does), and let
   * `awaitSession` exchange the AuthToken bytes for a bearer session.
   */
  async function establishSessionFor(keypair: import('@synonymdev/pubky').Keypair): Promise<string> {
    const { MarketplaceSessionService, sdk } = modules;
    const flow = MarketplaceSessionService.beginSessionFlow();
    expect(flow.authorizationUrl).toContain('pubkyauth');
    const signerSdk = new sdk.Pubky();
    await signerSdk.signer(keypair).approveAuthRequest(flow.authorizationUrl);
    const session = await flow.awaitSession();
    const actor = keypair.publicKey.z32();
    expect(session.pubky).toBe(actor);
    expect(session).not.toHaveProperty('token');
    return actor;
  }

  it('establishes signer-approved sessions and executes real commands', async () => {
    const { MarketplaceSessionService, MarketplaceGatewayService, sdk } = modules;

    // --- Seller session: register a listing ---
    const seller = await establishSessionFor(sdk.Keypair.random());

    const listingId = `it_${Date.now().toString(36)}`;
    const registerCommand = {
      version: 1 as const,
      commandId: crypto.randomUUID(),
      aggregateId: `listing:${seller}_${listingId}`,
      expectedRevision: 0,
      issuedAt: new Date().toISOString(),
      kind: 'listing.register' as const,
      payload: {
        sellerPubky: seller,
        listingId,
        title: 'Integration test listing',
        listingRevision: 1,
        contentHash: 'a'.repeat(64),
        quantity: 5,
        unitPrice: { amountMinor: 12_500, currency: 'USD', exponent: 2 },
        saleFormat: 'fixed_price' as const,
      },
    };
    const registered = await MarketplaceGatewayService.execute(seller, registerCommand);
    expect(registered).toMatchObject({
      ok: true,
      aggregateId: registerCommand.aggregateId,
      revision: 1,
      result: { kind: 'listing' },
    });

    // Idempotency: replaying the exact command returns the stored result.
    const replayed = await MarketplaceGatewayService.execute(seller, registerCommand);
    expect(replayed).toEqual(registered);

    // The transport acts only for the pubky its session was minted for.
    await expect(
      MarketplaceGatewayService.execute(sdk.Keypair.random().publicKey.z32(), registerCommand),
    ).rejects.toMatchObject({ code: 'FORBIDDEN' });

    // --- Buyer session (a second full auth flow replaces the seller's): reserve ---
    const buyer = await establishSessionFor(sdk.Keypair.random());

    const reserved = await MarketplaceGatewayService.execute(buyer, {
      version: 1 as const,
      commandId: crypto.randomUUID(),
      aggregateId: registerCommand.aggregateId,
      expectedRevision: 1,
      issuedAt: new Date().toISOString(),
      kind: 'inventory.reserve' as const,
      payload: { quantity: 2, reservationTtlSeconds: 300 },
    });
    expect(reserved).toMatchObject({ ok: true, revision: 2, result: { kind: 'reservation' } });

    // A stale revision is a structured conflict, parsed from the snake_case
    // error body (current_revision -> currentRevision).
    const conflicted = await MarketplaceGatewayService.execute(buyer, {
      version: 1 as const,
      commandId: crypto.randomUUID(),
      aggregateId: registerCommand.aggregateId,
      expectedRevision: 1,
      issuedAt: new Date().toISOString(),
      kind: 'inventory.reserve' as const,
      payload: { quantity: 1, reservationTtlSeconds: 300 },
    });
    expect(conflicted).toMatchObject({
      ok: false,
      error: { code: 'REVISION_CONFLICT', currentRevision: 2 },
    });

    // trust.report + role-scoped GET /v1/reports: a non-moderator reads
    // exactly the reports they filed.
    const reportCommandId = crypto.randomUUID();
    const reportResponse = await MarketplaceGatewayService.execute(buyer, {
      version: 1 as const,
      commandId: reportCommandId,
      aggregateId: `report:${reportCommandId}`,
      expectedRevision: 0,
      issuedAt: new Date().toISOString(),
      kind: 'trust.report' as const,
      payload: {
        targetType: 'listing' as const,
        targetId: registerCommand.aggregateId,
        reason: 'other' as const,
        details: 'Integration test report.',
      },
    });
    expect(reportResponse).toMatchObject({ ok: true, result: { kind: 'report' } });
    const reports = await MarketplaceGatewayService.getReports(buyer);
    expect(reports.length).toBeGreaterThanOrEqual(1);
    expect(reports.every((report) => report.reporterPubky === buyer)).toBe(true);

    // Sandbox-only affordances stay client-rejected in this mode — no bytes sent.
    await expect(
      MarketplaceGatewayService.execute(buyer, {
        version: 1 as const,
        commandId: crypto.randomUUID(),
        aggregateId: 'payment:00000000-0000-4000-8000-000000000001',
        expectedRevision: 1,
        issuedAt: new Date().toISOString(),
        kind: 'payment.sandbox_advance' as const,
        payload: { paymentId: '00000000-0000-4000-8000-000000000001', target: 'confirmed' as const, confirmations: 1 },
      }),
    ).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    // After the session is dropped (sign-out path), the transport refuses to send.
    MarketplaceSessionService.clearSession();
    await expect(MarketplaceGatewayService.execute(buyer, registerCommand)).rejects.toMatchObject({
      code: 'SESSION_EXPIRED',
    });
  });
});
