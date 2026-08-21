// LIVE two-party proof of encrypted marketplace messaging, in a real Chromium
// page against a live local Pubky testnet. Nothing is mocked below the module
// seam: real vendored WASM crypto, real pkarr resolution, real homeserver
// reads/writes, real IndexedDB persistence.
//
// Alice runs the app's FULL PaykitMessagingService stack (receiver
// provisioning, marker publish, link state machine, Dexie persistence,
// snapshot restore). Bob is the counterparty running the raw binding exactly
// the way the binding's own browser e2e does. Sessions come from the
// binding's dev/test signup helper — the ONLY leg swapped relative to
// production, where Pubky Ring approves the `/pub/paykit/:rw` grant
// interactively (a human with a signer cannot honestly be automated).
//
// Requires a running local testnet on the stock ports:
//   pubky-testnet        # pkarr relay 15411, homeserver HTTP 6286
// Run with: npm run test:marketplace:messaging

import { beforeAll, describe, expect, it, vi } from 'vitest';
import { buildChatMessage, decodeChatMessage } from '@/libs/commerce/messaging-contracts';
import {
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
} from '@/libs/commerce/transaction-commands';
import { LocalMessagingService } from '@/services/local/messaging/messaging';
import { PaykitMessagingService, setPaykitWasmModuleForTests } from '@/services/paykit/paykit-messaging';

// Self-contained factories, hoisted by vitest above the imports (browser-mode
// mocking cannot use importActual here): the messaging service imports exactly
// these members from each module, so nothing else in its graph is affected.
vi.mock('@/config/commerce', () => ({
  getCommerceAdapterMode: () => 'transaction-service' as const,
  isDurableCommerceMode: (mode: string) => mode === 'transaction-service' || mode === 'locks-paykit',
  COMMERCE_CONTRACT_VERSION: 1 as const,
}));

vi.mock('@/libs/runtime-config/runtime-config', () => ({
  getTestnet: () => true,
  // Imported by the error factories' Sentry capture path; disabled here.
  getSentryDsn: () => undefined,
  getSentryEnvironment: () => undefined,
  getSentryTracesSampleRate: () => 0,
}));

type PaykitWasmModule = typeof import('paykit-wasm');
type SessionHandle = import('paykit-wasm').SessionHandle;

const HOMESERVER_PUBKY = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
const RECEIVER_PATH = 'marketplace/wallet';
const LISTING_ID = '0033GVVN22HJ0FYQGZZS8R2BFC';

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let wasm: PaykitWasmModule;

function randomIdentitySecret(): Uint8Array {
  const secret = new Uint8Array(32);
  crypto.getRandomValues(secret);
  return secret;
}

async function preflight(url: string, what: string): Promise<void> {
  try {
    const response = await fetch(url, { method: 'GET' });
    if (!response.ok && response.status !== 404) throw new Error(`status ${response.status}`);
  } catch (error) {
    throw new Error(
      `${what} is not reachable at ${url}. This live proof needs a local Pubky testnet on the stock ports — start one with \`pubky-testnet\` (pkarr relay 15411, homeserver 6286). Cause: ${String(error)}`,
    );
  }
}

/**
 * This testnet homeserver runs with signup tokens enabled; mint one through
 * its admin endpoint (dev credentials, local testnet only).
 */
async function mintSignupToken(): Promise<string> {
  const response = await fetch('http://localhost:6288/generate_signup_token', {
    headers: { 'X-Admin-Password': 'admin' },
  });
  if (!response.ok) {
    throw new Error(`Could not mint a signup token from the testnet admin endpoint (status ${response.status}).`);
  }
  return (await response.text()).trim();
}

async function signup(secret: Uint8Array): Promise<{ session: SessionHandle; pubky: string }> {
  const client = wasm.PubkyClient.testnet();
  const session = (await client.signupWithSecret(secret, HOMESERVER_PUBKY, await mintSignupToken())) as SessionHandle;
  return { session, pubky: session.pubky() };
}

describe('encrypted marketplace messaging — live two-party proof', () => {
  beforeAll(async () => {
    await preflight('http://localhost:15411/', 'The pkarr relay');
    await preflight('http://localhost:6286/', 'The Pubky homeserver');
    wasm = await import('paykit-wasm');
    await wasm.default();
    // Inject the already-initialized REAL module so the service does not
    // re-initialize it. Same artifact, same crypto.
    setPaykitWasmModuleForTests(wasm);
  });

  it('runs enrollment, handshake, bidirectional chat, and snapshot-restore against the live testnet', async () => {
    // --- Bob (counterparty, raw binding — the reference usage) -------------
    const bob = await signup(randomIdentitySecret());
    const bobNoiseSecret = wasm.generateNoiseSecretKey();
    await wasm.publishReceiverMarker(
      bob.session,
      RECEIVER_PATH,
      wasm.noisePublicKeyFromSecret(bobNoiseSecret),
      true,
      false,
      false,
      false,
    );

    // --- Carol (enrolled identity WITHOUT a marker: the not-enrolled truth) -
    const carol = await signup(randomIdentitySecret());

    // --- Alice (the app's full service stack) ------------------------------
    const aliceIdentitySecret = randomIdentitySecret();
    const alice = await signup(aliceIdentitySecret);
    const enabled = await PaykitMessagingService.enableWithSessionForTests(alice.session);
    expect(enabled.pubky).toBe(alice.pubky);
    expect(enabled.receiverPath).toBe(RECEIVER_PATH);
    expect(PaykitMessagingService.hasActiveSession(alice.pubky)).toBe(true);

    // Alice's marker is publicly discoverable (Bob's client reads it).
    const bobClient = wasm.PubkyClient.testnet();
    const aliceMarker = (await wasm.getReceiverMarker(bobClient, alice.pubky, RECEIVER_PATH)) as {
      receiverPath: string;
      noisePublicKey: string;
    };
    expect(aliceMarker).toBeTruthy();
    expect(aliceMarker.noisePublicKey).toBe(enabled.noisePublicKey);

    // A counterparty with no marker is honestly not-enrolled — nothing starts.
    await expect(PaykitMessagingService.getCounterpartyMarker(carol.pubky)).resolves.toBeNull();
    await expect(PaykitMessagingService.ensureLink(alice.pubky, carol.pubky)).resolves.toEqual({
      status: 'not-enrolled',
    });

    // --- Handshake over the live homeserver --------------------------------
    // Alice initiates through the service; the first poll reports the honest
    // asymmetric truth: she cannot send until Bob's runtime answers.
    let aliceState = await PaykitMessagingService.ensureLink(alice.pubky, bob.pubky);
    expect(aliceState).toEqual({ status: 'handshaking', role: 'initiator' });

    // Bob answers with the raw binding, alternating with Alice's polls.
    const bobHandshake = wasm.acceptEncryptedLink(
      bob.session,
      bobNoiseSecret,
      alice.pubky,
      aliceMarker.noisePublicKey,
      RECEIVER_PATH,
      aliceMarker.receiverPath,
      bobClient,
    );
    let bobLink: import('paykit-wasm').EncryptedLinkHandle | null = null;
    const deadline = Date.now() + 60_000;
    while (Date.now() < deadline && (aliceState.status !== 'ready' || !bobLink)) {
      if (!bobLink) {
        const progress = (await bobHandshake.advance()) as {
          status: string;
          link?: import('paykit-wasm').EncryptedLinkHandle;
        };
        if (progress.status === 'complete' && progress.link) bobLink = progress.link;
      }
      if (aliceState.status !== 'ready') {
        aliceState = await PaykitMessagingService.ensureLink(alice.pubky, bob.pubky);
      }
      if (aliceState.status !== 'ready' || !bobLink) await sleep(500);
    }
    expect(aliceState).toEqual({ status: 'ready' });
    expect(bobLink).toBeTruthy();

    // --- Alice -> Bob chat message through the service ----------------------
    const conversationId = buildMarketplaceConversationAggregateId(bob.pubky, alice.pubky, LISTING_ID);
    const listingRef = buildMarketplaceListingAggregateId(bob.pubky, LISTING_ID);
    const sent = await PaykitMessagingService.sendChatMessage(alice.pubky, bob.pubky, {
      conversationId,
      listingRef,
      body: 'Is this still available? (live proof, Alice -> Bob)',
    });

    let bobInbox: { rawJson: string }[] = [];
    const receiveDeadline = Date.now() + 30_000;
    while (Date.now() < receiveDeadline && bobInbox.length === 0) {
      bobInbox = (await bobLink!.receivePrivateApplicationMessages()) as { rawJson: string }[];
      if (bobInbox.length === 0) await sleep(500);
    }
    expect(bobInbox).toHaveLength(1);
    const bobReceived = decodeChatMessage(bobInbox[0].rawJson);
    expect(bobReceived).toEqual(sent);

    // --- Bob -> Alice, received and persisted by the service ---------------
    const reply = buildChatMessage({
      eventId: crypto.randomUUID(),
      conversationId,
      listingRef,
      sentAt: new Date().toISOString(),
      body: 'Yes, still available. (live proof, Bob -> Alice)',
    });
    await bobLink!.sendPrivateApplicationMessageJson(reply.json);

    let aliceReceived: Awaited<ReturnType<typeof PaykitMessagingService.receiveChatMessages>> = [];
    const aliceDeadline = Date.now() + 30_000;
    while (Date.now() < aliceDeadline && aliceReceived.length === 0) {
      aliceReceived = await PaykitMessagingService.receiveChatMessages(alice.pubky, bob.pubky);
      if (aliceReceived.length === 0) await sleep(500);
    }
    expect(aliceReceived).toHaveLength(1);
    expect(aliceReceived[0].body).toBe(reply.message.body);

    const persisted = await LocalMessagingService.getMessages(alice.pubky, conversationId);
    expect(persisted.map(({ direction, body }) => ({ direction, body }))).toEqual([
      { direction: 'sent', body: sent.body },
      { direction: 'received', body: reply.message.body },
    ]);

    // --- Snapshot restore through the service -------------------------------
    // Simulate a reload: in-memory handles die, IndexedDB rows survive, a
    // fresh session is signed in, and the link restores from its persisted
    // snapshot — then still receives a message Bob sent in the meantime.
    PaykitMessagingService.clearSession();
    expect(PaykitMessagingService.hasActiveSession(alice.pubky)).toBe(false);

    const secondReply = buildChatMessage({
      eventId: crypto.randomUUID(),
      conversationId,
      listingRef,
      sentAt: new Date().toISOString(),
      body: 'Sent while Alice was away. (live proof, snapshot restore)',
    });
    await bobLink!.sendPrivateApplicationMessageJson(secondReply.json);

    const aliceSessionAgain = (await wasm.PubkyClient.testnet().signinWithSecret(aliceIdentitySecret)) as SessionHandle;
    await PaykitMessagingService.enableWithSessionForTests(aliceSessionAgain);

    const restoredState = await PaykitMessagingService.ensureLink(alice.pubky, bob.pubky);
    expect(restoredState).toEqual({ status: 'ready' });

    let afterRestore: Awaited<ReturnType<typeof PaykitMessagingService.receiveChatMessages>> = [];
    const restoreDeadline = Date.now() + 30_000;
    while (Date.now() < restoreDeadline && afterRestore.length === 0) {
      afterRestore = await PaykitMessagingService.receiveChatMessages(alice.pubky, bob.pubky);
      if (afterRestore.length === 0) await sleep(500);
    }
    expect(afterRestore).toHaveLength(1);
    expect(afterRestore[0].body).toBe(secondReply.message.body);

    // The restored link can also SEND (outbound counters survived).
    const postRestore = await PaykitMessagingService.sendChatMessage(alice.pubky, bob.pubky, {
      conversationId,
      listingRef,
      body: 'Back online after restore. (live proof, Alice -> Bob)',
    });
    let bobInboxAfterRestore: { rawJson: string }[] = [];
    const bobDeadline = Date.now() + 30_000;
    while (Date.now() < bobDeadline && bobInboxAfterRestore.length === 0) {
      bobInboxAfterRestore = (await bobLink!.receivePrivateApplicationMessages()) as { rawJson: string }[];
      if (bobInboxAfterRestore.length === 0) await sleep(500);
    }
    expect(bobInboxAfterRestore).toHaveLength(1);
    expect(decodeChatMessage(bobInboxAfterRestore[0].rawJson)).toEqual(postRestore);
  }, 240_000);
});
