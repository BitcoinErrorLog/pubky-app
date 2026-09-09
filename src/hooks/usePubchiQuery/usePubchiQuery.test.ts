import { act, renderHook, waitFor } from '@testing-library/react';
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
  commitDelete: vi.fn(),
  recordPubchiBuiltFeed: vi.fn(),
  toast: vi.fn(),
  ensureDeviceReady: vi.fn(),
  loadPubchi: vi.fn(),
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    fetchPubchiQuery: (...args: unknown[]) => mocks.fetchPubchiQuery(...args),
    ensureDeviceReady: (...args: unknown[]) => mocks.ensureDeviceReady(...args),
    loadPubchi: (...args: unknown[]) => mocks.loadPubchi(...args),
  },
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    commitCreate: (...args: unknown[]) => mocks.commitCreate(...args),
    commitDelete: (...args: unknown[]) => mocks.commitDelete(...args),
  },
}));

vi.mock('@/libs/pubchi/feed-provenance', () => ({
  recordPubchiBuiltFeed: (...args: unknown[]) => mocks.recordPubchiBuiltFeed(...args),
}));

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: 'a'.repeat(52) }),
    { getState: () => ({ currentUserPubky: 'a'.repeat(52) }) },
  ),
}));

describe('usePubchiQuery', () => {
  beforeEach(() => {
    mocks.fetchPubchiQuery.mockReset();
    mocks.commitCreate.mockReset();
    mocks.commitDelete.mockReset();
    mocks.recordPubchiBuiltFeed.mockReset();
    mocks.toast.mockReset();
    mocks.fetchPubchiQuery.mockResolvedValue(FEED_SUCCESS);
    mocks.commitCreate.mockResolvedValue({ id: 'feed-1' });
    mocks.commitDelete.mockResolvedValue(undefined);
    mocks.ensureDeviceReady.mockReset().mockResolvedValue(true);
    mocks.loadPubchi.mockReset().mockResolvedValue({ verified: true });
  });

  afterEach(() => {
    resetRuntimeConfigForTests();
    vi.clearAllMocks();
  });

  it('passes an explicit purpose through to the controller', async () => {
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'build a feed of builders');
      await result.current.submit('build-feed');
    });

    expect(mocks.fetchPubchiQuery).toHaveBeenCalledWith({
      question: 'build a feed of builders',
      purpose: 'build-feed',
    });
    expect(result.current.result).toEqual(FEED_SUCCESS);
    expect(result.current.errorCode).toBeUndefined();

    await act(async () => {
      await expect(result.current.applyFeed()).resolves.toBe(true);
    });

    expect(mocks.commitCreate).toHaveBeenCalledOnce();
    expect(mocks.recordPubchiBuiltFeed).toHaveBeenCalledWith('a'.repeat(52), FEED_PROPOSAL, { id: 'feed-1' });
    const params = mocks.commitCreate.mock.calls[0][0];
    expect(params.name).toBe('Builders');
    expect(params.tags).toEqual(['builder']);
    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'default',
      title: 'Feed applied',
      dismissButton: true,
    });
  });

  it('does not toast SIGNATURE_INVALID when no device key is available', async () => {
    mocks.ensureDeviceReady.mockResolvedValue(false);
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(mocks.ensureDeviceReady).toHaveBeenCalledOnce());

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'who tagged me?');
      await result.current.submit('who-tagged-me');
    });

    expect(mocks.fetchPubchiQuery).not.toHaveBeenCalled();
    expect(mocks.toast).not.toHaveBeenCalled();
    expect(result.current.signingAvailable).toBe(false);
    expect(result.current.signingUnavailableMessage).toBe(
      "This browser isn't set up for Pubchi yet. Set it up to start asking.",
    );
    expect(result.current.errorCode).toBe("This browser isn't set up for Pubchi yet. Set it up to start asking.");
  });

  it('rolls back the feed when provenance cannot be recorded', async () => {
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, 'build a feed of builders');
      await result.current.submit('build-feed');
    });
    expect(result.current.result).toEqual(FEED_SUCCESS);
    mocks.recordPubchiBuiltFeed.mockRejectedValue(new Error('homeserver unavailable'));
    await act(async () => {
      await expect(result.current.applyFeed()).resolves.toBe(false);
    });

    expect(mocks.commitDelete).toHaveBeenCalledWith({ feedId: 'feed-1' });
    expect(mocks.toast).toHaveBeenCalledWith({
      variant: 'error',
      title: "I couldn't turn that into a feed. Feeds show posts filtered by tags, reach (following, friends, web of trust, everyone) and sort. Try: 'a feed of posts tagged bitcoin or synonym from everyone, newest first'.",
      dismissButton: true,
    });
  });

  it('does not set up a device when the owner has no Pubchi', async () => {
    mocks.loadPubchi.mockResolvedValue(undefined);
    const { result } = renderHook(() => usePubchiQuery());

    await waitFor(() => expect(result.current.pubchiAvailable).toBe(false));

    expect(mocks.ensureDeviceReady).not.toHaveBeenCalled();
    expect(result.current.signingAvailable).toBe(false);
  });

  it('surfaces the schema message when a question is missing', async () => {
    const { result } = renderHook(() => usePubchiQuery());
    await waitFor(() => expect(result.current.signingAvailable).toBe(true));

    void result.current.form.formState.errors;
    await act(async () => {
      result.current.form.setValue(QUERY_FORM_FIELDS.QUESTION, '   ');
      await expect(result.current.submit('who-tagged-me')).resolves.toBe(false);
    });

    expect(mocks.fetchPubchiQuery).not.toHaveBeenCalled();
    expect(result.current.form.formState.errors[QUERY_FORM_FIELDS.QUESTION]?.message).toBe('Enter a question.');
  });
});
