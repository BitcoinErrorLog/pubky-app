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
  toast: vi.fn(),
  signingAvailable: true,
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

vi.mock('@/molecules/Toaster/toast', () => ({
  toast: (...args: unknown[]) => mocks.toast(...args),
}));

vi.mock('@/libs/pubchi/device-key', () => ({
  getCurrentDeviceKey: () => Promise.resolve(mocks.signingAvailable ? {} : undefined),
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'a'.repeat(52) }),
}));

describe('usePubchiQuery', () => {
  beforeEach(() => {
    mocks.fetchPubchiQuery.mockReset();
    mocks.commitCreate.mockReset();
    mocks.toast.mockReset();
    mocks.fetchPubchiQuery.mockResolvedValue(FEED_SUCCESS);
    mocks.commitCreate.mockResolvedValue({ id: 'feed-1' });
    mocks.signingAvailable = true;
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
    mocks.signingAvailable = false;
    const { result } = renderHook(() => usePubchiQuery());

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
