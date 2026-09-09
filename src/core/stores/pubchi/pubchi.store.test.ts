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
});
