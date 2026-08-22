// LIVE one-sided messaging proof: a fresh identity (created and given a real
// marketplace offer by scripts/probe-dm-offer.mjs) initiates an encrypted
// link to a REAL user's account and sends both a marketplace chat message and
// a general DM. The counterparty is a human on the deployed app: the
// handshake completes only when their inbox sync answers it (they are an
// offer participant, so it will), so this spec polls patiently.
//
//   PAYKIT_DM_SECRET=<hex> PAYKIT_DM_TARGET=<z32> npm run test:marketplace:dm
import { beforeAll, describe, expect, it } from 'vitest';
import {
  buildMarketplaceConversationAggregateId,
  buildMarketplaceListingAggregateId,
} from '@/libs/commerce/transaction-commands';
import { PaykitMessagingService, setPaykitWasmModuleForTests } from '@/services/paykit/paykit-messaging';

declare const __DM_SECRET_HEX__: string;
declare const __DM_TARGET_PUBKY__: string;
declare const __DM_LISTING_ID__: string;

let wasm: typeof import('paykit-wasm');

function hexToBytes(hex: string): Uint8Array {
  const out = new Uint8Array(hex.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return out;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe('live DM to a real user on the deployed staging network', () => {
  beforeAll(async () => {
    wasm = await import('paykit-wasm');
    await wasm.default();
    setPaykitWasmModuleForTests(wasm);
  });

  it('initiates the encrypted link and delivers a chat message and a DM', async () => {
    expect(__DM_SECRET_HEX__).not.toBe('');
    expect(__DM_TARGET_PUBKY__).not.toBe('');

    const client = new wasm.PubkyClient();
    const session = (await client.signinWithSecret(hexToBytes(__DM_SECRET_HEX__))) as { pubky(): string };
    const me = session.pubky();
    console.info(`[dm-live] signed in as ${me}`);

    const enabled = await PaykitMessagingService.enableWithSessionForTests(
      session as Parameters<typeof PaykitMessagingService.enableWithSessionForTests>[0],
    );
    expect(enabled.pubky).toBe(me);
    console.info(`[dm-live] messaging enabled, marker published (${enabled.receiverPath})`);

    const targetMarker = await PaykitMessagingService.getCounterpartyMarker(__DM_TARGET_PUBKY__);
    expect(targetMarker, 'the target has no receiver marker — they must enable messaging first').toBeTruthy();
    console.info(`[dm-live] target marker found at ${targetMarker?.receiverPath}`);

    // Initiate and poll: the human counterparty's app answers the handshake
    // when their inbox sync probes offer participants.
    let state = await PaykitMessagingService.ensureLink(me, __DM_TARGET_PUBKY__);
    console.info(`[dm-live] link state: ${state.status}`);
    const deadline = Date.now() + 600_000;
    while (Date.now() < deadline && state.status !== 'ready') {
      await sleep(5_000);
      state = await PaykitMessagingService.ensureLink(me, __DM_TARGET_PUBKY__);
      console.info(`[dm-live] waiting for counterparty… (${state.status})`);
    }
    expect(state.status, 'handshake did not complete — is the counterparty online with the app open?').toBe('ready');
    console.info('[dm-live] link READY');

    if (__DM_LISTING_ID__ !== '') {
      await PaykitMessagingService.sendChatMessage(me, __DM_TARGET_PUBKY__, {
        conversationId: buildMarketplaceConversationAggregateId(__DM_TARGET_PUBKY__, me, __DM_LISTING_ID__),
        listingRef: buildMarketplaceListingAggregateId(__DM_TARGET_PUBKY__, __DM_LISTING_ID__),
        body: 'Hi! I just made you a real offer on this listing — this message rode the encrypted link. (Live proof, sent by an agent-driven fresh identity.)',
      });
      console.info('[dm-live] marketplace chat message SENT');
    }

    await PaykitMessagingService.sendDmMessage(me, __DM_TARGET_PUBKY__, {
      body: 'And this one is a general direct message — Noise XX end to end, no marketplace context needed. — Fable',
    });
    console.info('[dm-live] general DM SENT');
  });
});
