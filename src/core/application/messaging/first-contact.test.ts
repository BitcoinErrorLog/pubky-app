import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommercePrivKeyringApplication } from '@/application/commerce/priv-keyring';
import { decryptPrivRecord, encryptPrivRecord, privEntryName, privEntryUrl } from '@/libs/commerce/priv-envelope';
import { HttpMethod } from '@/libs/http/http.types';
import { conversationRequestUrl } from '@/libs/messaging/first-contact';
import { applyMuteChange, emptyMuteList, MUTE_LIST_MAX_ENTRIES, parseMuteList } from '@/libs/messaging/mute-list';
import { CommerceMessagingConversationModel, CommerceMessagingMessageModel } from '@/models/messaging/messaging.models';
import { MarketplaceGatewayService } from '@/services/marketplace/marketplace';
import { type FakeHomeserver, installFakeHomeserver } from '@/test-utils/fake-homeserver';
import {
  establishMarketplaceSession,
  expectSafeAtEverySessionReplacement,
  releasedKeyring,
} from '@/test-utils/priv-session-replacement';
import { FirstContactApplication } from './first-contact';

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => 'transaction-service' };
});

const OWNER = 'o'.repeat(52);
const OTHER_OWNER = 'p'.repeat(52);
const A = 'a'.repeat(52);
const B = 'b'.repeat(52);
const LISTING = '0033GVVN22HJ0FYQGZZS8R2BFC';

const muteUrl = () => privEntryUrl(releasedKeyring(OWNER), 'messaging_mutes', 'mutes');

function plantMuteList(homeserver: FakeHomeserver, record: unknown) {
  const keyring = releasedKeyring(OWNER);
  homeserver.files.set(
    muteUrl(),
    encryptPrivRecord({
      keyring,
      family: 'messaging_mutes',
      name: privEntryName(keyring, 'messaging_mutes', 'mutes'),
      record,
    }),
  );
}

function storedMuteList(homeserver: FakeHomeserver) {
  const keyring = releasedKeyring(OWNER);
  const envelope = homeserver.files.get(muteUrl());
  if (envelope === undefined) return null;
  return parseMuteList(
    decryptPrivRecord({
      keyring,
      family: 'messaging_mutes',
      name: privEntryName(keyring, 'messaging_mutes', 'mutes'),
      envelope,
    }),
    OWNER,
  );
}

let homeserver: FakeHomeserver;

beforeEach(async () => {
  homeserver = installFakeHomeserver();
  FirstContactApplication.clear();
  CommercePrivKeyringApplication.clear();
  establishMarketplaceSession(OWNER);
  vi.spyOn(MarketplaceGatewayService, 'getPrivKeys').mockImplementation(async (owner: string) => ({
    kind: 'keys',
    keyring: releasedKeyring(owner),
  }));
  await Promise.all([CommerceMessagingConversationModel.clear(), CommerceMessagingMessageModel.clear()]);
});

afterEach(() => {
  FirstContactApplication.clear();
  CommercePrivKeyringApplication.clear();
  vi.restoreAllMocks();
});

describe('FirstContactApplication mutes', () => {
  it('merges a new mute into the stored list and keeps earlier ones', async () => {
    plantMuteList(homeserver, applyMuteChange(emptyMuteList(OWNER), A, true, 10));

    const state = await FirstContactApplication.setMuted(OWNER, B, true);

    expect(state).toEqual({ kind: 'ready', muted: new Set([A, B]) });
    expect(storedMuteList(homeserver)?.entries).toMatchObject({ [A]: { muted: true }, [B]: { muted: true } });
  });

  it('leaves a stored list it cannot open untouched', async () => {
    plantMuteList(homeserver, { version: 2, surprise: true });
    const before = structuredClone(homeserver.files.get(muteUrl()));

    await expect(FirstContactApplication.setMuted(OWNER, B, true)).resolves.toEqual({ kind: 'error' });
    await expect(FirstContactApplication.loadMutes(OWNER)).resolves.toEqual({ kind: 'error' });

    expect(homeserver.files.get(muteUrl())).toEqual(before);
    expect(homeserver.log.filter((entry) => entry.startsWith('PUT'))).toEqual([]);
  });

  it('keeps using the list it read when a later read fails', async () => {
    plantMuteList(homeserver, applyMuteChange(emptyMuteList(OWNER), A, true, 10));
    await expect(FirstContactApplication.loadMutes(OWNER)).resolves.toEqual({ kind: 'ready', muted: new Set([A]) });

    homeserver.failNext(HttpMethod.GET, muteUrl(), 503);

    await expect(FirstContactApplication.loadMutes(OWNER)).resolves.toEqual({ kind: 'ready', muted: new Set([A]) });
  });

  it('restores a mute another device overwrote the next time this device loads the list', async () => {
    plantMuteList(homeserver, emptyMuteList(OWNER));
    await FirstContactApplication.setMuted(OWNER, A, true);
    // Another device read the list before that write and saved its own change over it.
    plantMuteList(homeserver, applyMuteChange(emptyMuteList(OWNER), B, true, Date.now()));

    await expect(FirstContactApplication.loadMutes(OWNER)).resolves.toEqual({ kind: 'ready', muted: new Set([A, B]) });

    expect(storedMuteList(homeserver)?.entries).toMatchObject({ [A]: { muted: true }, [B]: { muted: true } });
  });

  it('keeps this device’s earlier changes when it writes over another device’s list', async () => {
    plantMuteList(homeserver, emptyMuteList(OWNER));
    await FirstContactApplication.setMuted(OWNER, A, true);
    plantMuteList(homeserver, applyMuteChange(emptyMuteList(OWNER), B, true, Date.now()));

    await FirstContactApplication.setMuted(OWNER, 'z'.repeat(52), true);

    expect(Object.keys(storedMuteList(homeserver)?.entries ?? {}).sort()).toEqual([A, B, 'z'.repeat(52)].sort());
  });

  it('refuses a mute past the limit without writing, so the list stays readable', async () => {
    const z32 = 'ybndrfg8ejkmcpqxot1uwisza345h769';
    const pubkyFor = (n: number) =>
      [3, 2, 1, 0]
        .map((power) => z32[Math.floor(n / 32 ** power) % 32])
        .join('')
        .padStart(52, 'y');
    let full = emptyMuteList(OWNER);
    for (let index = 0; index < MUTE_LIST_MAX_ENTRIES; index += 1)
      full = applyMuteChange(full, pubkyFor(index), true, 1);
    plantMuteList(homeserver, full);

    await expect(FirstContactApplication.setMuted(OWNER, A, true)).resolves.toEqual({ kind: 'full' });

    expect(homeserver.log.filter((entry) => entry.startsWith('PUT'))).toEqual([]);
    const state = await FirstContactApplication.loadMutes(OWNER);
    expect(state.kind).toBe('ready');
  });

  it('asks for approval when the marketplace session is not this owner’s', async () => {
    establishMarketplaceSession(OTHER_OWNER);

    await expect(FirstContactApplication.loadMutes(OWNER)).resolves.toEqual({ kind: 'needs_approval' });
    await expect(FirstContactApplication.setMuted(OWNER, B, true)).resolves.toEqual({ kind: 'needs_approval' });
    expect(homeserver.log).toEqual([]);
  });

  it('never seals a mute under revoked keys or loses a mute when the session is replaced mid-write', async () => {
    const requests = await expectSafeAtEverySessionReplacement({
      homeserver,
      ownerPubky: OWNER,
      otherPubky: OTHER_OWNER,
      plant: () => {
        FirstContactApplication.clear();
        plantMuteList(homeserver, applyMuteChange(emptyMuteList(OWNER), A, true, 10));
      },
      flow: () => FirstContactApplication.setMuted(OWNER, B, true),
      check: () => {
        expect(storedMuteList(homeserver)?.entries[A]).toEqual({ muted: true, changed_at: 10 });
      },
    });
    expect(requests).toBe(3);
  });
});

describe('FirstContactApplication intake gate', () => {
  it('has no gate while the mute list is unknown', () => {
    expect(FirstContactApplication.intakeGate(OWNER, { kind: 'error' })).toBeNull();
    expect(FirstContactApplication.intakeGate(OWNER, { kind: 'needs_approval' })).toBeNull();
    expect(FirstContactApplication.intakeGate(OWNER, { kind: 'unavailable' })).not.toBeNull();
  });

  it('refuses muted people and files strangers under Requests, known people in the inbox', async () => {
    const gate = FirstContactApplication.intakeGate(OWNER, { kind: 'ready', muted: new Set([A]) });
    FirstContactApplication.setKnownContacts(OWNER, { following: [], orderCounterparties: [B] });

    await expect(gate?.admit({ counterpartyPubky: A, kind: 'dm', conversationId: `dm:${A}` })).resolves.toEqual({
      store: false,
      reason: 'muted',
    });
    await expect(gate?.admit({ counterpartyPubky: B, kind: 'dm', conversationId: `dm:${B}` })).resolves.toEqual({
      store: true,
      origin: 'known',
    });
    await expect(
      gate?.admit({ counterpartyPubky: 'z'.repeat(52), kind: 'dm', conversationId: `dm:${'z'.repeat(52)}` }),
    ).resolves.toEqual({ store: true, origin: 'request' });
  });
});

describe('FirstContactApplication conversation requests', () => {
  it('writes the request only when there is none, and keeps a valid one', async () => {
    await expect(FirstContactApplication.writeConversationRequest(B, OWNER, LISTING)).resolves.toBe('written');
    const first = homeserver.files.get(conversationRequestUrl(B, OWNER, LISTING));
    await expect(FirstContactApplication.writeConversationRequest(B, OWNER, LISTING)).resolves.toBe('kept');
    expect(homeserver.files.get(conversationRequestUrl(B, OWNER, LISTING))).toEqual(first);
    expect(homeserver.log.filter((entry) => entry.startsWith('PUT'))).toHaveLength(1);
  });

  it('replaces an invalid document at its own path', async () => {
    homeserver.files.set(conversationRequestUrl(B, OWNER, LISTING), { junk: true });
    await expect(FirstContactApplication.writeConversationRequest(B, OWNER, LISTING)).resolves.toBe('written');
  });

  it('lists nothing for muted followers and treats a missing directory as empty', async () => {
    await FirstContactApplication.writeConversationRequest(A, OWNER, LISTING);
    homeserver.log.length = 0;

    await expect(FirstContactApplication.discoverRequests(OWNER, [A, B], new Set([A]))).resolves.toEqual([]);

    expect(homeserver.log.filter((entry) => entry.includes(A))).toEqual([]);
    await expect(CommerceMessagingConversationModel.findByOwner(OWNER)).resolves.toEqual([]);
  });
});
