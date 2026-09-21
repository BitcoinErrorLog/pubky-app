import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PubchiApplication } from '@/application/pubchi/pubchi';
import { PostController } from '@/controllers/post/post';
import * as pubchiDatabase from '@/database/pubchi/pubchi';
import { useDraftPostApplication } from '@/hooks/useDraftPostApplication/useDraftPostApplication';
import * as flags from '@/libs/pubchi/flags';
import { useAuthStore } from '@/stores/auth/auth.store';
import { asOpaque } from '@/test-utils/type-assertions';
import { PubchiController } from './pubchi';

const owner = 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo';
const postId = '0032W6CBGDBP0';
const prepared = {
  applicationId: 'a'.repeat(64),
  binding: { owner },
  draft: {
    content: 'Pubky keeps public social state on your homeserver.',
    kind: 'short' as const,
    tags: ['pubky-app'],
    rationale: 'Matches the public profile evidence.',
    evidence: [`pubky://${owner}/pub/pubky.app/profile.json`],
  },
};

describe('PubchiController draft post application', () => {
  beforeEach(() => {
    vi.spyOn(useAuthStore, 'getState').mockReturnValue(
      asOpaque<ReturnType<typeof useAuthStore.getState>>({
        selectCurrentUserPubky: () => owner,
        selectSession: () => ({ info: { capabilities: ['/pub/pubky.app/:rw', '/priv/app.pubchi/v1/:rw'] } }),
      }),
    );
    vi.spyOn(PubchiApplication, 'prepareDraftPostApplication').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostApplication>>>(prepared),
    );
    vi.spyOn(PubchiApplication, 'finalizeDraftPostApplication').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'recordDraftPostApplyOutcome').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'recordDraftPostRevertOperation').mockResolvedValue();
    vi.spyOn(PubchiController, 'getDraftPostStatus').mockResolvedValue('failed');
  });

  afterEach(() => vi.restoreAllMocks());

  it('C finalizes a published post as applied under U', async () => {
    const create = vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    const remove = vi.spyOn(PostController, 'commitDelete');

    await expect(PubchiController.applyDraftPost('record')).resolves.toBe('applied');
    expect(create).toHaveBeenCalledWith({
      authorId: owner,
      content: prepared.draft.content,
      isArticle: false,
      tags: ['pubky-app'],
    });
    expect(remove).not.toHaveBeenCalled();
    expect(PubchiApplication.finalizeDraftPostApplication).toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'applied',
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
      `${owner}:${postId}`,
    );
  });

  it('C records failure and exposes failed hook status when creation throws', async () => {
    vi.spyOn(PostController, 'commitCreate').mockRejectedValue(new Error('post write failed'));
    const { result } = renderHook(() => useDraftPostApplication('record'));

    await act(async () => result.current.approve());

    expect(result.current.status).toBe('failed');
    expect(PubchiApplication.finalizeDraftPostApplication).toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'failed',
    );
  });

  it('C marks a completed apply reconciliation-pending when receipt finalization fails', async () => {
    vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    const finalize = vi
      .spyOn(PubchiApplication, 'finalizeDraftPostApplication')
      .mockRejectedValue(new Error('receipt unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();

    await expect(PubchiController.applyDraftPost('record')).rejects.toMatchObject({ category: 'network' });

    expect(PubchiApplication.recordDraftPostApplyOutcome).toHaveBeenCalledWith(
      'record',
      `${owner}:${postId}`,
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
    );
    expect(finalize).toHaveBeenCalledWith(
      'record',
      prepared.applicationId,
      'applied',
      `pubky://${owner}/pub/pubky.app/posts/${postId}`,
      `${owner}:${postId}`,
    );
    expect(finalize).not.toHaveBeenCalledWith('record', prepared.applicationId, 'failed');
    expect(pending).toHaveBeenCalledWith('record');
  });

  it('C moves directly to reconciliation-pending when apply outcome persistence throws', async () => {
    vi.spyOn(PostController, 'commitCreate').mockResolvedValue(`${owner}:${postId}`);
    vi.spyOn(PubchiApplication, 'recordDraftPostApplyOutcome').mockRejectedValue(new Error('outcome unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();
    const { result } = renderHook(() => useDraftPostApplication('record'));

    await act(async () => result.current.approve());

    expect(pending).toHaveBeenCalledWith('record');
    expect(result.current.status).toBe('reconciliation-pending');
  });

  it('reject never calls commitCreate', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostReject').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostReject>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
      }),
    );
    const create = vi.spyOn(PostController, 'commitCreate');
    const { result } = renderHook(() => useDraftPostApplication('record'));

    await act(async () => result.current.reject());

    expect(create).not.toHaveBeenCalled();
    expect(result.current.status).toBe('rejected');
  });

  it('does not hydrate drafts or open Dexie while Pubchi is disabled', () => {
    vi.spyOn(flags, 'isPubchiEnabled').mockReturnValue(false);
    const getDatabase = vi.spyOn(pubchiDatabase, 'getPubchiDatabase');
    const getStatus = vi.spyOn(PubchiController, 'getDraftPostStatus');

    renderHook(() => useDraftPostApplication('record'));

    expect(getStatus).not.toHaveBeenCalled();
    expect(getDatabase).not.toHaveBeenCalled();
  });

  it('reconciles pending applications again when the card becomes visible', async () => {
    vi.spyOn(flags, 'isPubchiEnabled').mockReturnValue(true);
    vi.spyOn(PubchiController, 'getDraftPostStatus').mockResolvedValue('reconciliation-pending');
    const reconcile = vi.spyOn(PubchiController, 'reconcileDraftPost').mockResolvedValue('applied');
    const { rerender } = renderHook(({ visible }) => useDraftPostApplication('record', visible), {
      initialProps: { visible: true },
    });

    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(1));
    rerender({ visible: false });
    rerender({ visible: true });
    await waitFor(() => expect(reconcile).toHaveBeenCalledTimes(2));
  });

  it('D leaves the receipt untouched when delete fails', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostRevert>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
        compositePostId: `${owner}:${postId}`,
      }),
    );
    vi.spyOn(PostController, 'commitDelete').mockRejectedValue(new Error('delete failed'));

    await expect(PubchiController.revertDraftPost('record')).rejects.toThrow('delete failed');
    expect(PubchiApplication.finalizeDraftPostApplication).not.toHaveBeenCalled();
  });

  it('D persists reconciliation-pending and returns a typed retryable error when receipt finalization fails', async () => {
    vi.spyOn(PubchiApplication, 'prepareDraftPostRevert').mockResolvedValue(
      asOpaque<Awaited<ReturnType<typeof PubchiApplication.prepareDraftPostRevert>>>({
        applicationId: prepared.applicationId,
        binding: prepared.binding,
        compositePostId: `${owner}:${postId}`,
      }),
    );
    vi.spyOn(PostController, 'commitDelete').mockResolvedValue();
    vi.spyOn(PubchiApplication, 'finalizeDraftPostApplication').mockRejectedValue(new Error('receipt unavailable'));
    const pending = vi.spyOn(PubchiApplication, 'markDraftPostReconciliationPending').mockResolvedValue();

    await expect(PubchiController.revertDraftPost('record')).rejects.toMatchObject({ category: 'network' });
    expect(pending).toHaveBeenCalledWith('record');
  });
});
