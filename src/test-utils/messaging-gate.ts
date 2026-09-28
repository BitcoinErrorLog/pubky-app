import type { MessagingIntakeGate } from '@/libs/messaging/intake-gate';

/** An intake gate that stores every message as coming from a known contact. */
export const ADMIT_ALL_GATE: MessagingIntakeGate = {
  admit: async () => ({ store: true, origin: 'known' }),
};
