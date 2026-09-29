import { z } from 'zod';
import { commercePubkySchema } from '@/libs/commerce/transaction-contracts';

/**
 * The people an account muted in messages, kept as an add-only log. Every
 * mute or unmute is its own record, sealed under `/priv/pubky.app/` with the
 * same keys and envelope as the watchlist, under a fresh random entry name.
 * A record is never rewritten or deleted, so two devices, two tabs, or a
 * reload in the middle of a change can add records at the same time without
 * one replacing another. The list is the fold of every record: per person
 * the latest change wins, and a mute wins a tie.
 */

export const MUTE_CHANGE_KIND = 'pubky_app.messaging_mute_change.v0';
/** At most this many people can be muted at once. */
export const MUTED_PEOPLE_MAX = 1000;

export const muteChangeSchema = z
  .object({
    version: z.literal(1),
    kind: z.literal(MUTE_CHANGE_KIND),
    owner_pubky: commercePubkySchema,
    counterparty_pubky: commercePubkySchema,
    muted: z.boolean(),
    changed_at: z.number().int().nonnegative(),
  })
  .strict();

export type MuteChange = z.infer<typeof muteChangeSchema>;

/** Per person, the change that currently applies. */
export type MuteState = ReadonlyMap<string, { muted: boolean; changed_at: number }>;

/** The record, or `null` unless it is a valid change of `ownerPubky` about someone else. */
export function parseMuteChange(raw: unknown, ownerPubky: string): MuteChange | null {
  const parsed = muteChangeSchema.safeParse(raw);
  if (!parsed.success) return null;
  const change = parsed.data;
  if (change.owner_pubky !== ownerPubky || change.counterparty_pubky === ownerPubky) return null;
  return change;
}

/** Per person, the latest change wins; on a tie, the mute wins. */
export function foldMuteChanges(changes: Iterable<MuteChange>): MuteState {
  const state = new Map<string, { muted: boolean; changed_at: number }>();
  for (const change of changes) {
    const current = state.get(change.counterparty_pubky);
    if (
      !current ||
      change.changed_at > current.changed_at ||
      (change.changed_at === current.changed_at && change.muted && !current.muted)
    ) {
      state.set(change.counterparty_pubky, { muted: change.muted, changed_at: change.changed_at });
    }
  }
  return state;
}

export function mutedPubkys(state: MuteState): Set<string> {
  const muted = new Set<string>();
  for (const [pubky, entry] of state) if (entry.muted) muted.add(pubky);
  return muted;
}

/**
 * A new change record, dated after every change to the same person in
 * `state`, so it wins the fold even when this device's clock runs behind.
 */
export function buildMuteChange(input: {
  ownerPubky: string;
  counterpartyPubky: string;
  muted: boolean;
  now: number;
  state: MuteState;
}): MuteChange {
  const previous = input.state.get(input.counterpartyPubky);
  return muteChangeSchema.parse({
    version: 1,
    kind: MUTE_CHANGE_KIND,
    owner_pubky: input.ownerPubky,
    counterparty_pubky: input.counterpartyPubky,
    muted: input.muted,
    changed_at: previous ? Math.max(input.now, previous.changed_at + 1) : input.now,
  });
}
