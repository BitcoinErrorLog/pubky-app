import 'fake-indexeddb/auto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import {
  listingIdFromOrder,
  marketplaceConversationHref,
  reportRejectedConversationQuery,
  resolveMarketplaceConversationQuery,
} from '@/libs/commerce/marketplace-conversation-query';
import { buildMarketplaceConversationAggregateId } from '@/libs/commerce/transaction-commands';
import { Logger } from '@/libs/logger/logger';

/**
 * Wave A live proof: after a durable staging order, `?conversation=` opens
 * that listing thread for both participants and fail-closes malformed /
 * `dm:` / other-account values without logging the raw id.
 *
 *   MARKETPLACE_STAGING_MESSAGING_IDENTITIES_FILE=/Volumes/t7/vibes-dev/.evidence/train-2026-09-22-am/part-c/staging-seat/identities.json \
 *   npm run test:marketplace:messaging:wave-a
 */

const SERVICE_URL = process.env.MARKETPLACE_SERVICE_URL ?? 'https://staging-api.pubky.app';
const NEXUS_URL = process.env.MARKETPLACE_NEXUS_URL ?? 'https://nexus.staging.pubky.app';
const IDENTITIES_FILE =
  process.env.MARKETPLACE_STAGING_MESSAGING_IDENTITIES_FILE ??
  '/Volumes/t7/vibes-dev/.evidence/train-2026-09-22-am/part-c/staging-seat/identities.json';
const PROOF_PATH =
  process.env.MESSAGING_WAVE_A_PROOF_PATH ?? '/Volumes/t7/vibes-dev/.evidence/messaging-wave-a/order-query-proof.txt';

process.env.PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE = 'transaction-service';
process.env.PUBKY_RUNTIME_MARKETPLACE_URL = SERVICE_URL;
process.env.PUBKY_RUNTIME_MARKETPLACE_NEXUS_URL = NEXUS_URL;
process.env.NEXT_PUBLIC_APP_VERSION ??= '0.0.0-live';
process.env.NEXT_PUBLIC_DB_VERSION ??= '1';
process.env.NEXT_PUBLIC_DEBUG_MODE ??= 'false';

type AppModules = {
  MarketplaceSessionService: typeof import('@/services/marketplace/marketplace-session').MarketplaceSessionService;
  MarketplaceTransactionService: typeof import('@/services/marketplace/marketplace-transaction').MarketplaceTransactionService;
  HomeserverService: typeof import('@/services/homeserver/homeserver').HomeserverService;
  sdk: typeof import('@synonymdev/pubky');
};

let modules: AppModules;

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

describe('Wave A conversation query after a durable staging order', () => {
  beforeAll(async () => {
    modules = {
      MarketplaceSessionService: (await import('@/services/marketplace/marketplace-session')).MarketplaceSessionService,
      MarketplaceTransactionService: (await import('@/services/marketplace/marketplace-transaction'))
        .MarketplaceTransactionService,
      HomeserverService: (await import('@/services/homeserver/homeserver')).HomeserverService,
      sdk: await import('@synonymdev/pubky'),
    };
  });

  it('opens the listing conversation for both order participants and fail-closes otherwise', async () => {
    expect(existsSync(IDENTITIES_FILE), 'MARKETPLACE_STAGING_MESSAGING_IDENTITIES_FILE must exist').toBe(true);
    const saved = JSON.parse(readFileSync(IDENTITIES_FILE, 'utf8')) as Record<string, string>;
    const secretHex = saved.seller ?? saved.buyerA ?? Object.values(saved)[0];
    expect(secretHex, 'a saved identity secret is required').toBeTruthy();
    expect(secretHex.length).toBe(64);

    const { HomeserverService, MarketplaceSessionService, MarketplaceTransactionService, sdk } = modules;
    const keypair = sdk.Keypair.fromSecret(hexToBytes(secretHex));
    const pubky = keypair.publicKey.z32();
    expect(pubky.length).toBe(52);

    const signedIn = await HomeserverService.signIn({ keypair });
    expect(signedIn, 'homeserver sign-in must succeed').not.toBeNull();

    const flow = MarketplaceSessionService.beginSessionFlow();
    await new sdk.Pubky().signer(keypair).approveAuthRequest(flow.authorizationUrl);
    await flow.awaitSession();
    expect(MarketplaceSessionService.getActiveSession()?.pubky).toBe(pubky);

    const orders = await MarketplaceTransactionService.getOrders(pubky);
    const withListing = orders
      .map((order) => ({
        sellerPubky: order.sellerPubky,
        buyerPubky: order.buyerPubky,
        listingId: listingIdFromOrder(order),
      }))
      .find((order) => order.listingId);
    expect(withListing, 'staging-api must already hold a durable order with a listing id').toBeTruthy();
    if (!withListing?.listingId) return;

    const conversationId = buildMarketplaceConversationAggregateId(
      withListing.sellerPubky,
      withListing.buyerPubky,
      withListing.listingId,
    );
    const sellerQuery = resolveMarketplaceConversationQuery({
      values: [conversationId],
      currentUserPubky: withListing.sellerPubky,
    });
    const buyerQuery = resolveMarketplaceConversationQuery({
      values: [conversationId],
      currentUserPubky: withListing.buyerPubky,
    });
    expect(sellerQuery.status).toBe('open');
    expect(buyerQuery.status).toBe('open');
    expect(sellerQuery.status === 'open' && sellerQuery.listingId).toBe(withListing.listingId);

    const hrefValues = new URL(
      marketplaceConversationHref(conversationId),
      'https://shop.pubky.app',
    ).searchParams.getAll('conversation');
    expect(resolveMarketplaceConversationQuery({ values: hrefValues, currentUserPubky: pubky }).status).toBe('open');

    expect(
      resolveMarketplaceConversationQuery({ values: ['not-a-conversation'], currentUserPubky: pubky }).status,
    ).toBe('invalid');
    expect(
      resolveMarketplaceConversationQuery({ values: [`dm:${withListing.buyerPubky}`], currentUserPubky: pubky }).status,
    ).toBe('invalid');
    expect(
      resolveMarketplaceConversationQuery({ values: [conversationId], currentUserPubky: 'o'.repeat(52) }).status,
    ).toBe('other-account');

    const warn = vi.spyOn(Logger, 'warn');
    reportRejectedConversationQuery();
    const serialized = JSON.stringify(warn.mock.calls);
    expect(serialized).toContain('invalid_conversation_query');
    expect(serialized).not.toContain(conversationId);
    expect(serialized).not.toContain(withListing.sellerPubky);
    expect(serialized).not.toContain(withListing.buyerPubky);
    warn.mockRestore();

    mkdirSync('/Volumes/t7/vibes-dev/.evidence/messaging-wave-a', { recursive: true });
    writeFileSync(
      PROOF_PATH,
      [
        `service=${SERVICE_URL}`,
        `actor_len=${pubky.length}`,
        `orders=${orders.length}`,
        'query_seller=open',
        'query_buyer=open',
        'malformed=invalid',
        'dm=invalid',
        'other_account=other-account',
        'raw_id_logged=false',
      ].join('\n') + '\n',
    );
  }, 180_000);
});
