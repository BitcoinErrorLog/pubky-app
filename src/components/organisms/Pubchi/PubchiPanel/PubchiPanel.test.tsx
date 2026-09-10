import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from './PubchiPanel';

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock('@/organisms/RingApprovalDialog/RingApprovalDialog', () => ({
  RingApprovalDialog: () => null,
}));

const submit = vi.fn();
const reapprove = vi.fn();
const setupDevice = vi.fn();
const { consumePrefill, getFeed } = vi.hoisted(() => ({ consumePrefill: vi.fn(), getFeed: vi.fn() }));
const builderProps = vi.hoisted(() => ({ current: undefined as Record<string, unknown> | undefined }));
const hookState = {
  form: {
    control: {},
    getValues: () => ({ question: '' }),
    watch: () => '',
    trigger: async () => true,
    setValue: vi.fn(),
  },
  submit,
  result: undefined as PubchiQuerySuccess | undefined,
  errorCode: undefined as string | undefined,
  loading: false,
  elapsedMs: 0,
  enabled: true,
  pubchiAvailable: true as boolean | undefined,
  signingAvailable: true,
  signingUnavailableMessage: "This browser isn't set up for Pubchi yet. Set it up to start asking.",
  setupDevice,
  setupLoading: false,
};
const enrollmentState = {
  needsReapproval: false,
  reapprove,
  loading: false,
};

vi.mock('@/hooks/usePubchiQuery/usePubchiQuery', () => ({
  usePubchiQuery: () => hookState,
}));

vi.mock('@/hooks/usePubchiEnrollment/usePubchiEnrollment', () => ({
  usePubchiEnrollment: () => enrollmentState,
}));

vi.mock('@/libs/pubchi/flags', () => ({
  isPubchiPanelEnabled: () => true,
  isPubchiEnabled: () => true,
}));

vi.mock('@/controllers/pubchi/pubchi', () => ({
  PubchiController: {
    consumePrefill,
  },
}));

vi.mock('@/controllers/feed/feed', () => ({
  FeedController: {
    get: getFeed,
  },
}));

vi.mock('../PubchiFeedBuilder/PubchiFeedBuilder', () => ({
  PubchiFeedBuilder: (props: Record<string, unknown>) => {
    builderProps.current = props;
    return (
      <div data-testid="pubchi-feed-builder">
        <button type="button" onClick={() => void (props.onInterpret as (question: string) => Promise<void>)('make it wider')}>
          Interpret
        </button>
      </div>
    );
  },
}));

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) =>
    selector({ currentUserPubky: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo' }),
}));

vi.mock('@/molecules/ControlledTextareaField/ControlledTextareaField', () => ({
  ControlledTextareaField: () => <textarea data-testid="pubchi-question" />,
}));

describe('PubchiPanel', () => {
  beforeEach(() => {
    enrollmentState.needsReapproval = false;
    submit.mockReset();
    reapprove.mockReset();
    setupDevice.mockReset();
    hookState.pubchiAvailable = true;
    hookState.setupLoading = false;
    hookState.loading = false;
    hookState.elapsedMs = 0;
    hookState.result = undefined;
    hookState.errorCode = undefined;
    hookState.form.setValue.mockReset();
    consumePrefill.mockReset();
    getFeed.mockReset();
    builderProps.current = undefined;
    usePubchiStore.getState().clear();
  });

  it('consumes flyout prefill without submitting a query', () => {
    consumePrefill.mockReturnValue({
      question: 'Summarize this thread pubky://owner/pub/pubky.app/posts/post-1',
      source: 'post-menu',
    });

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(hookState.form.setValue).toHaveBeenCalledWith(
      'question',
      'Summarize this thread pubky://owner/pub/pubky.app/posts/post-1',
      { shouldValidate: true },
    );
    expect(submit).not.toHaveBeenCalled();
  });

  it('consumes a prefill that arrives while the flyout is already open', () => {
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);
    const prefill = {
      question: 'Summarize this thread pubky://owner/pub/pubky.app/posts/post-1',
      source: 'post-menu' as const,
    };
    consumePrefill.mockReturnValue(prefill);
    usePubchiStore.getState().openFlyout(prefill, 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo');
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(hookState.form.setValue).toHaveBeenCalledWith('question', prefill.question, { shouldValidate: true });
  });

  it('sends no model-controlled target when interpreting a create proposal', async () => {
    hookState.result = {
      kind: 'feed-v2',
      applyAllowed: false,
      result: {
        schema: 'pubchi-feed-proposal',
        version: 2,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        mode: 'create',
        target_feed_id: 'model-controlled-target',
        feed: { name: 'Builders', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
        mapping: { status: 'exact', unmapped: [] },
        warnings: [],
        installed_user_feed_id: null,
      },
    } as PubchiQuerySuccess;

    render(<PubchiPanel open onOpenChange={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Interpret' }));
    await vi.waitFor(() => expect(submit).toHaveBeenCalled());

    expect(submit).toHaveBeenCalledWith('build-feed', {
      proposalVersion: 2,
    });
  });

  it('clears the edited feed before submitting a new create question', async () => {
    const feed = { id: 'feed-a', name: 'Feed A' };
    getFeed.mockResolvedValue(feed);
    consumePrefill.mockReturnValue({
      question: 'Update feed A',
      feedId: 'feed-a',
      source: 'feed-menu',
    });
    hookState.result = {
      kind: 'feed-v2',
      applyAllowed: false,
      result: {
        schema: 'pubchi-feed-proposal',
        version: 2,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        mode: 'update',
        target_feed_id: 'feed-a',
        feed: { name: 'Feed A', icon: '', feed: { reach: 'all', sort: 'recent', layout: 'columns' } },
        mapping: { status: 'exact', unmapped: [] },
        warnings: [],
        installed_user_feed_id: 'feed-a',
      },
    } as PubchiQuerySuccess;

    render(<PubchiPanel open onOpenChange={() => {}} />);
    await vi.waitFor(() => expect(builderProps.current?.existingFeed).toBe(feed));

    fireEvent.click(screen.getByTestId('pubchi-ask'));
    await vi.waitFor(() => expect(builderProps.current?.existingFeed).toBeUndefined());
    expect(submit).toHaveBeenCalledWith('ask', undefined);
  });

  it('mounts the production panel surface', () => {
    hookState.signingAvailable = true;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_PANEL_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-build-feed')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Quick questions' })).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-who-tagged-me')).not.toBeInTheDocument();
  });

  it('remembers the quick questions toggle in the Pubchi store', () => {
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    fireEvent.click(screen.getByRole('button', { name: 'Quick questions' }));
    expect(screen.getByTestId('pubchi-who-tagged-me')).toBeInTheDocument();

    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-who-tagged-me')).toBeInTheDocument();
  });

  it('disables Ask and Build feed when signing is unavailable', () => {
    hookState.signingAvailable = false;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId('pubchi-signing-unavailable')).toHaveTextContent(
      "This browser isn't set up for Pubchi yet. Set it up to start asking.",
    );
    expect(screen.getByTestId('pubchi-ask')).toBeDisabled();
    expect(screen.getByTestId('pubchi-build-feed')).toBeDisabled();
    fireEvent.click(screen.getByTestId('pubchi-setup-device'));
    expect(setupDevice).toHaveBeenCalledOnce();
    hookState.signingAvailable = true;
  });

  it('shows the create prompt when the owner has no Pubchi', () => {
    hookState.pubchiAvailable = false;
    hookState.signingAvailable = false;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-not-enrolled')).toHaveTextContent('Create a Pubchi in Settings');
    expect(screen.queryByTestId('pubchi-setup-device')).not.toBeInTheDocument();
    hookState.signingAvailable = true;
  });

  it('shows degraded session recovery without disabling read-only asks', () => {
    enrollmentState.needsReapproval = true;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-degraded-session')).toHaveTextContent(
      "This session can't manage Pubchi. Re-approve with the Pubchi folder to restore revocation.",
    );
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Re-approve' }));
    expect(reapprove).toHaveBeenCalledOnce();
  });

  it('explains feed errors instead of rendering the raw code', () => {
    hookState.errorCode = 'FEED_SPECS_INVALID';

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByRole('alert')).toHaveTextContent("I couldn't turn that into a feed");
    expect(screen.getByRole('alert')).not.toHaveTextContent('FEED_SPECS_INVALID');
  });

  it('shows a skeleton and elapsed seconds while an answer is loading, then replaces it', () => {
    hookState.loading = true;
    hookState.elapsedMs = 2450;
    const view = render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-answer-loading')).toBeInTheDocument();
    expect(screen.getByText('Reading the graph… 2s')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-answer')).not.toBeInTheDocument();

    hookState.loading = false;
    hookState.result = {
      kind: 'answer',
      result: {
        schema: 'pubchi-answer',
        version: 1,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        run_id: 'answer',
        purpose: 'ask',
        question: 'Who is active?',
        summary: 'Alice is active.',
        evidence: [],
        sources: [],
        tool_trace_summary: { tools: [], call_count: 0, truncated: false },
        policy_version: 1,
      },
    } as PubchiQuerySuccess;
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-answer')).toBeInTheDocument();
    expect(screen.queryByTestId('pubchi-answer-loading')).not.toBeInTheDocument();
  });

  it('labels who-tagged-me evidence as Tagged by N accounts', () => {
    hookState.result = {
      kind: 'query',
      result: {
        schema: 'pubchi-query-result',
        version: 1,
        bot: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        generated_at: 1,
        run_id: 'query',
        purpose: 'who-tagged-me',
        scope_owner: 'o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo',
        items: [
          {
            label: 'builder',
            source_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/tags/builder',
            subject_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/profile.json',
            claimant_count: 1,
          },
          {
            label: 'rust',
            source_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/tags/rust',
            subject_uri: 'pubky://o1gg96ewuojmopcjbz8895478wdtxtzzuxnfjjz8o8e77csa1ngo/pub/pubky.app/profile.json',
            claimant_count: 3,
          },
        ],
        tool_trace_summary: { tools: ['get_tag_landscape'], call_count: 1, truncated: false },
        policy_version: 1,
      },
    } as PubchiQuerySuccess;

    render(<PubchiPanel open onOpenChange={() => {}} />);

    expect(screen.getByTestId('pubchi-evidence')).toBeInTheDocument();
    expect(screen.getByText('Tagged by 1 account')).toBeInTheDocument();
    expect(screen.getByText('Tagged by 3 accounts')).toBeInTheDocument();
    expect(screen.getAllByText('Tagger')).toHaveLength(2);
    expect(screen.queryByText(/Claimants/)).not.toBeInTheDocument();
  });
});
