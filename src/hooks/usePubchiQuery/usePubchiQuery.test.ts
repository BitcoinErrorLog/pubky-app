import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import type { FeedProposalV1 } from '@/libs/pubchi/schemas';
import { resetRuntimeConfigForTests } from '@/libs/runtime-config/runtime-config';
import { usePubchiQuery } from './usePubchiQuery';
import { QUERY_FORM_FIELDS } from './usePubchiQuery.types';

const OWNER = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';

const FEED_PROPOSAL: FeedProposalV1 = {
  schema: 'pubchi-feed-proposal' as const,
  version: 1 as const,
  bot: OWNER,
  owner: OWNER,
  generated_at: 10,
  feed: {
    name: 'Builders',
    created_at: 10,
    feed: {
      tags: ['builder'],
      reach: 'following' as const,
      layout: 'columns' as const,
      sort: 'recent' as const,
    },
  },
  warnings: [] as [],
  installed_user_feed_id: null,
};

const FEED_SUCCESS: PubchiQuerySuccess = {
  kind: 'feed',
  result: FEED_PROPOSAL,
  applyAllowed: true,
};

const mocks = vi.hoisted(() => ({
  fetchPubchiQuery: vi.fn(),
  commitCreate: vi.fn(),
  toast: vi.fn(),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    fetchPubchiQuery: (...args: unknown[]) => mocks.fetchPubchiQuery(...args),
  },
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/stores/onboarding/onboarding.store', () => ({
  useOnboardingStore: {
    getState: () => ({ secretKey: 'ab'.repeat(32) }),
  },
}));

vi.mock('@/libs/identity/identity', () => ({
  Identity: {
    keypairFromSecretKey: () => ({
      secret: () => new Uint8Array(32),
    }),
  },
}));

describe('usePubchiQuery', () => {
  beforeEach(() => {
    mocks.fetchPubchiQuery.mockReset();
    mocks.commitCreate.mockReset();
    mocks.toast.mockReset();
    mocks.fetchPubchiQuery.mockResolvedValue(FEED_SUCCESS);
    mocks.commitCreate.mockResolvedValue({ id: 'feed-1' });
  });

  afterEach(() => {
    resetRuntimeConfigForTests();
    vi.clearAllMocks();
  });

  it('passes a FeedProposalV1 through to Apply', async () => {
    const { result } = renderHook(() => usePubchiQuery());

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'build a feed of builders');
      await result.current.submit();
    });

    expect(mocks.fetchPubchiQuery).toHaveBeenCalledWith({
      question: 'build a feed of builders',
      secretSeed: expect.any(Uint8Array),
    });
    expect(result.current.result).toEqual(FEED_SUCCESS);
    expect(result.current.errorCode).toBeUndefined();

    await act(async () => {
      await expect(result.current.applyFeed()).resolves.toBe(true);
    });

    expect(mocks.commitCreate).toHaveBeenCalledOnce();
    const params = mocks.commitCreate.mock.calls[0][0];
    expect(params.name).toBe('Builders');
    expect(params.tags).toEqual(['builder']);
    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'default',
      title: 'Feed applied',
      dismissButton: true,
    });
  });
});
