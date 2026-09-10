import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PubchiQuerySuccess } from '@/application/pubchi/pubchi.types';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PUBCHI_PANEL_SURFACE, PubchiPanel } from './PubchiPanel';

const submit = vi.fn();
const applyFeed = vi.fn();
const reapprove = vi.fn();
const setupDevice = vi.fn();
const { consumePrefill } = vi.hoisted(() => ({ consumePrefill: vi.fn() }));
const hookState = {
  form: {
    control: {},
    getValues: () => ({ question: '' }),
    watch: () => '',
    trigger: async () => true,
    setValue: vi.fn(),
  },
  submit,
  applyFeed,
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
    usePubchiStore.getState().openFlyout(prefill);
    view.rerender(<PubchiPanel open onOpenChange={() => {}} />);

    expect(hookState.form.setValue).toHaveBeenCalledWith('question', prefill.question, { shouldValidate: true });
  });

  it('mounts the production panel surface', () => {
    hookState.signingAvailable = true;
    render(<PubchiPanel open onOpenChange={() => {}} />);
    expect(screen.getByTestId(PUBCHI_PANEL_SURFACE)).toHaveAttribute('data-surface', PUBCHI_PANEL_SURFACE);
    expect(screen.getByText('Pubchi')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-build-feed')).toBeInTheDocument();
    expect(screen.getByTestId('pubchi-ask')).not.toBeDisabled();
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
