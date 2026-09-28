import { z } from 'zod';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';

/**
 * The private list of people an account muted in messages. It is stored
 * sealed under `/priv/pubky.app/` with the same keys and envelope as the
 * watchlist, so it follows the account across devices and nobody but the
 * account can read it.
 *
 * Every pubky ever muted keeps an entry: `muted: false` records an unmute,
 * so two devices that change the list at once merge to the latest change per
 * person instead of one overwriting the other.
 */

export const MUTE_LIST_KIND = 'pubky_app.messaging_mutes.v0';
/** Upper bound on entries (muted or not) in one stored list. */
export const MUTE_LIST_MAX_ENTRIES = 1000;

const muteEntrySchema = z
  .object({
    muted: z.boolean(),
    changed_at: z.number().int().nonnegative(),
  })
  .strict();

export const muteListSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal(MUTE_LIST_KIND),
    owner_pubky: commercePubkySchema,
    entries: z
      .record(commercePubkySchema, muteEntrySchema)
      .refine((entries) => Object.keys(entries).length <= MUTE_LIST_MAX_ENTRIES, 'Too many mute entries'),
  })
  .strict();

export type MuteList = z.infer<typeof muteListSchema>;

export function emptyMuteList(ownerPubky: string): MuteList {
  return { version: 1, kind: MUTE_LIST_KIND, owner_pubky: commercePubkySchema.parse(ownerPubky), entries: {} };
}

/** The stored list, or `null` when it is not a valid list of `ownerPubky`. */
export function parseMuteList(raw: unknown, ownerPubky: string): MuteList | null {
  const parsed = muteListSchema.safeParse(raw);
  if (!parsed.success || parsed.data.owner_pubky !== ownerPubky) return null;
  return parsed.data;
}

/** Per person, the later change wins; on a tie, muted wins. */
export function mergeMuteLists(left: MuteList, right: MuteList): MuteList {
  const entries: MuteList['entries'] = { ...left.entries };
  for (const [pubky, entry] of Object.entries(right.entries)) {
    const current = entries[pubky];
    if (
      !current ||
      entry.changed_at > current.changed_at ||
      (entry.changed_at === current.changed_at && entry.muted && !current.muted)
    ) {
      entries[pubky] = entry;
    }
  }
  return { ...left, entries: pruneEntries(entries) };
}

/**
 * The list after muting or unmuting `pubky` at `now`. The change is dated
 * after any earlier change to the same person, so it wins a merge even when
 * another device's clock runs ahead.
 */
export function applyMuteChange(list: MuteList, pubky: string, muted: boolean, now: number): MuteList {
  const key = commercePubkySchema.parse(pubky);
  const previous = list.entries[key];
  const changedAt = previous ? Math.max(now, previous.changed_at + 1) : now;
  return { ...list, entries: pruneEntries({ ...list.entries, [key]: { muted, changed_at: changedAt } }) };
}

export function mutedPubkys(list: MuteList): Set<string> {
  const muted = new Set<string>();
  for (const [pubky, entry] of Object.entries(list.entries)) if (entry.muted) muted.add(pubky);
  return muted;
}

export function muteListsEqual(left: MuteList, right: MuteList): boolean {
  const leftKeys = Object.keys(left.entries);
  if (leftKeys.length !== Object.keys(right.entries).length) return false;
  return leftKeys.every((pubky) => {
    const a = left.entries[pubky];
    const b = right.entries[pubky];
    return b !== undefined && a.muted === b.muted && a.changed_at === b.changed_at;
  });
}

/**
 * Keeps the list within {@link MUTE_LIST_MAX_ENTRIES} by dropping the oldest
 * unmute records first. Mutes are never dropped: a list that would need to
 * drop one keeps them all and fails {@link muteListSchema}, which writers
 * check before writing.
 */
function pruneEntries(entries: MuteList['entries']): MuteList['entries'] {
  const keys = Object.keys(entries);
  if (keys.length <= MUTE_LIST_MAX_ENTRIES) return entries;
  const unmuted = keys
    .filter((pubky) => !entries[pubky].muted)
    .sort((a, b) => entries[a].changed_at - entries[b].changed_at);
  const pruned = { ...entries };
  let excess = keys.length - MUTE_LIST_MAX_ENTRIES;
  for (const pubky of unmuted) {
    if (excess === 0) break;
    delete pruned[pubky];
    excess -= 1;
  }
  return pruned;
}
