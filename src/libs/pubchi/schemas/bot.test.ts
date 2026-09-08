import { Keypair } from '@synonymdev/pubky';
import { describe, expect, it } from 'vitest';
import { parsePubchiBotV1 } from './bot';
import { botUri, PATHS } from './paths';

const OWNER = Keypair.random().publicKey.z32();
const BOT = Keypair.random().publicKey.z32();

const VALID = {
  schema: 'pubchi-bot',
  version: 1,
  bot: BOT,
  owner: OWNER,
  display_name: 'Pubchi',
  created_at: 1,
  backup_confirmed_at: null,
  homeserver_account: null,
  key_generation: 1,
};

describe('PubchiBotV1', () => {
  it('strictly parses the custody v1 document', () => {
    expect(parsePubchiBotV1(VALID)).toEqual({ ok: true, value: VALID });
    expect(PATHS.bot).toBe('/pub/pubchi.app/bot.json');
    expect(botUri(OWNER)).toBe(`pubky://${OWNER}/pub/pubchi.app/bot.json`);
  });

  it.each([
    { ...VALID, display_name: '' },
    { ...VALID, display_name: 'x'.repeat(41) },
    { ...VALID, key_generation: 0 },
    { ...VALID, phrase: 'forbidden' },
    { ...VALID, extra_field: true },
  ])('rejects invalid and forbidden fields', (candidate) => {
    expect(parsePubchiBotV1(candidate).ok).toBe(false);
  });
});
