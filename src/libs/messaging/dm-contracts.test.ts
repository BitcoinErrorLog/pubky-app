import { describe, expect, it } from 'vitest';
import { PAYKIT_NOISE_MESSAGE_MAX_BYTES } from '@/libs/commerce/messaging-contracts';
import {
  buildDmConversationId,
  buildDmMessage,
  decodeDmMessage,
  dmBodyBudget,
  parseDmConversationId,
  PUBKY_APP_DM_KIND,
} from './dm-contracts';

const COUNTERPARTY = 'z'.repeat(52);
const EVENT_ID = '5b3f9a0e-8f2c-4f4e-9d35-1c2b4a6d8e01';
const SENT_AT = '2026-08-21T10:00:00.000Z';

function build(body: string) {
  return buildDmMessage({ eventId: EVENT_ID, sentAt: SENT_AT, body });
}

describe('pubky_app.dm.v0 direct message contract', () => {
  it('builds a valid envelope and reports its true serialized size', () => {
    const { message, json, byteSize } = build('hey — are you going on saturday?');
    expect(message.kind).toBe(PUBKY_APP_DM_KIND);
    expect(message.version).toBe(1);
    expect(JSON.parse(json)).toEqual(message);
    expect(byteSize).toBe(new TextEncoder().encode(json).byteLength);
    expect(byteSize).toBeLessThanOrEqual(PAYKIT_NOISE_MESSAGE_MAX_BYTES);
  });

  it('carries no listing or conversation field — the link names the counterparty', () => {
    const { message } = build('identity is the link');
    expect(Object.keys(message).sort()).toEqual(['body', 'event_id', 'kind', 'sent_at', 'version']);
  });

  it('trims the body and rejects whitespace-only messages', () => {
    expect(build('  hello  ').message.body).toBe('hello');
    expect(() => build('   ')).toThrow();
  });

  it('accepts a body exactly at the budget and rejects one byte over', () => {
    const budget = dmBodyBudget();
    const exact = 'a'.repeat(budget);
    expect(build(exact).byteSize).toBe(PAYKIT_NOISE_MESSAGE_MAX_BYTES);
    expect(() => build(`${exact}a`)).toThrow(/too long/);
  });

  it('counts JSON escaping and multi-byte UTF-8 against the budget, not characters', () => {
    const budget = dmBodyBudget();
    const quotes = '"'.repeat(budget); // each quote serializes as two bytes (\")
    expect(() => build(quotes)).toThrow(/too long/);
  });

  it('keeps the budget stable across event ids and timestamps (fixed-width fields)', () => {
    const budget = dmBodyBudget();
    const withOtherIds = buildDmMessage({
      eventId: crypto.randomUUID(),
      sentAt: new Date().toISOString(),
      body: 'x'.repeat(budget),
    });
    expect(withOtherIds.byteSize).toBe(PAYKIT_NOISE_MESSAGE_MAX_BYTES);
  });

  it('round-trips through decode and skips foreign or malformed payloads', () => {
    const { json, message } = build('round trip');
    expect(decodeDmMessage(json)).toEqual(message);
    expect(decodeDmMessage('not json at all')).toBeNull();
    // The marketplace kind rides the SAME link and must be skipped here, not errored.
    expect(decodeDmMessage(JSON.stringify({ ...message, kind: 'marketplace.chat_message.v0' }))).toBeNull();
    expect(decodeDmMessage(JSON.stringify({ ...message, event_id: 'not-a-uuid' }))).toBeNull();
  });

  it('builds and parses dm conversation ids keyed by counterparty', () => {
    const conversationId = buildDmConversationId(COUNTERPARTY);
    expect(conversationId).toBe(`dm:${COUNTERPARTY}`);
    expect(parseDmConversationId(conversationId)).toEqual({ counterpartyPubky: COUNTERPARTY });
    expect(parseDmConversationId(`conversation:${COUNTERPARTY}`)).toBeNull();
    expect(parseDmConversationId('dm:short')).toBeNull();
  });
});
