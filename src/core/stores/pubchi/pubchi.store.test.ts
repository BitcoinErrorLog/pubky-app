import { beforeEach, describe, expect, it } from 'vitest';
import { usePubchiStore } from './pubchi.store';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

describe('PubchiStore', () => {
  beforeEach(() => {
    usePubchiStore.getState().clear();
  });

  it('rejects a recovery phrase at runtime', () => {
    expect(() =>
      usePubchiStore.getState().setPubchi(
        {
          bot: OWNER,
          displayName: 'Bot',
          createdAt: 1,
          backupConfirmedAt: null,
          verified: true,
          phrase: 'secret',
        } as never,
        OWNER,
      ),
    ).toThrow('Pubchi recovery phrase cannot be stored');
  });

  it('opens, closes, and consumes flyout prefill', () => {
    const prefill = { question: 'Summarize this thread pubky://owner/posts/1', source: 'post-menu' as const };

    usePubchiStore.getState().openFlyout(prefill, OWNER);
    expect(usePubchiStore.getState().flyout).toEqual({ open: true, prefill: { ...prefill, ownerPubky: OWNER } });

    expect(usePubchiStore.getState().consumePrefill(OWNER)).toEqual(prefill);
    expect(usePubchiStore.getState().flyout).toEqual({ open: true });

    usePubchiStore.getState().closeFlyout();
    expect(usePubchiStore.getState().flyout).toEqual({ open: false });
  });

  it('does not consume a prefill belonging to another owner', () => {
    const prefill = { question: 'Summarize this thread', source: 'post-menu' as const };

    usePubchiStore.getState().openFlyout(prefill, OWNER);

    expect(usePubchiStore.getState().consumePrefill('different-owner' as never)).toBeUndefined();
    expect(usePubchiStore.getState().flyout).toEqual({ open: true });
  });

  it('clears flyout state with the signed-out Pubchi state', () => {
    usePubchiStore.getState().openFlyout({
      question: 'Summarize this thread',
      source: 'post-menu',
    }, OWNER);

    usePubchiStore.getState().clear();

    expect(usePubchiStore.getState().flyout).toEqual({ open: false });
  });
});
