import { describe, expect, it } from 'vitest';
import {
  applyMuteChange,
  emptyMuteList,
  mergeMuteLists,
  MUTE_LIST_MAX_ENTRIES,
  mutedPubkys,
  muteListSchema,
  parseMuteList,
} from './mute-list';

const OWNER = 'o'.repeat(52);
const A = 'a'.repeat(52);
const B = 'b'.repeat(52);

describe('mute list', () => {
  it('records mutes and unmutes per person', () => {
    const muted = applyMuteChange(applyMuteChange(emptyMuteList(OWNER), A, true, 10), B, true, 11);
    expect([...mutedPubkys(muted)].sort()).toEqual([A, B]);
    const unmuted = applyMuteChange(muted, A, false, 12);
    expect([...mutedPubkys(unmuted)]).toEqual([B]);
    expect(unmuted.entries[A]).toEqual({ muted: false, changed_at: 12 });
  });

  it('dates a change after the previous one even when the clock runs behind', () => {
    const list = applyMuteChange(emptyMuteList(OWNER), A, true, 1_000);
    expect(applyMuteChange(list, A, false, 5).entries[A]).toEqual({ muted: false, changed_at: 1_001 });
  });

  it('merges two devices to the latest change per person, muted winning a tie', () => {
    const left = applyMuteChange(applyMuteChange(emptyMuteList(OWNER), A, true, 10), B, false, 20);
    const right = applyMuteChange(applyMuteChange(emptyMuteList(OWNER), A, false, 15), B, true, 20);
    const merged = mergeMuteLists(left, right);
    expect(merged.entries[A]).toEqual({ muted: false, changed_at: 15 });
    expect(merged.entries[B]).toEqual({ muted: true, changed_at: 20 });
    expect(mergeMuteLists(right, left)).toEqual({ ...merged, entries: merged.entries });
  });

  it('refuses a list that belongs to another account or does not validate', () => {
    const list = applyMuteChange(emptyMuteList(OWNER), A, true, 10);
    expect(parseMuteList(list, OWNER)).toEqual(list);
    expect(parseMuteList(list, A)).toBeNull();
    expect(parseMuteList({ ...list, entries: { 'not-a-pubky': { muted: true, changed_at: 1 } } }, OWNER)).toBeNull();
    expect(parseMuteList({ ...list, extra: true }, OWNER)).toBeNull();
  });

  it('drops the oldest unmutes to stay within the entry limit, never a mute', () => {
    const z32 = 'ybndrfg8ejkmcpqxot1uwisza345h769';
    const pubkyFor = (n: number) =>
      [3, 2, 1, 0]
        .map((power) => z32[Math.floor(n / 32 ** power) % 32])
        .join('')
        .padStart(52, 'y');
    let list = emptyMuteList(OWNER);
    for (let index = 0; index < MUTE_LIST_MAX_ENTRIES; index += 1) {
      list = applyMuteChange(list, pubkyFor(index), index % 2 === 0, index + 1);
    }
    expect(Object.keys(list.entries)).toHaveLength(MUTE_LIST_MAX_ENTRIES);

    const next = applyMuteChange(list, A, true, 10_000);

    expect(Object.keys(next.entries)).toHaveLength(MUTE_LIST_MAX_ENTRIES);
    expect(next.entries[pubkyFor(1)]).toBeUndefined();
    expect(next.entries[pubkyFor(3)]).toEqual({ muted: false, changed_at: 4 });
    expect(mutedPubkys(next).size).toBe(mutedPubkys(list).size + 1);
    expect(muteListSchema.safeParse(next).success).toBe(true);
  });
});
