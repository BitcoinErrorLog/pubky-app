import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MESSAGING_COPY } from '@/libs/commerce/messaging-copy';
import { buildMarketplaceConversationAggregateId } from '@/libs/commerce/transaction-commands';
import { Logger } from '@/libs/logger/logger';
import { MarketplaceInbox } from './MarketplaceInbox';

const SELLER = 's'.repeat(52);
const BUYER = 'b'.repeat(52);
const OTHER = 'o'.repeat(52);
const LISTING_ID = '0033GVVN22HJ0FYQGZZS8R2BFC';
const CONVERSATION_ID = buildMarketplaceConversationAggregateId(SELLER, BUYER, LISTING_ID);

const search = vi.hoisted(() => ({ params: new URLSearchParams() }));
const router = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
const auth = vi.hoisted(() => ({ currentUserPubky: 'b'.repeat(52) }));
const config = vi.hoisted(() => ({ mode: 'transaction-service' as string }));
const encryptedView = vi.hoisted(() => ({
  status: 'ready' as string,
  conversations: [] as unknown[],
  receiverProvisioned: false,
  errorMessage: null as string | null,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/marketplace/messages',
  useSearchParams: () => search.params,
}));

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode };
});

vi.mock('@/stores/auth/auth.store', () => ({
  useAuthStore: Object.assign(
    (selector: (state: { currentUserPubky: string }) => unknown) =>
      selector({ currentUserPubky: auth.currentUserPubky }),
    {
      getState: () => ({
        currentUserPubky: auth.currentUserPubky,
        selectCurrentUserPubky: () => auth.currentUserPubky,
      }),
      setState: vi.fn(),
      subscribe: vi.fn(() => vi.fn()),
    },
  ),
}));

vi.mock('@/hooks/useEncryptedInbox/useEncryptedInbox', () => ({
  useEncryptedInbox: () => ({
    status: encryptedView.status,
    conversations: encryptedView.conversations,
    receiverProvisioned: encryptedView.receiverProvisioned,
    errorMessage: encryptedView.errorMessage,
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMarketplaceInbox/useMarketplaceInbox', () => ({
  useMarketplaceInbox: () => ({ conversations: [], isLoading: false, error: null, isSandbox: false }),
}));

vi.mock('@/hooks/useUserDetails/useUserDetails', () => ({
  useUserDetails: () => ({ userDetails: null, isLoading: false }),
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: <T,>(action: () => T) => action() }),
}));

vi.mock('@/hooks/useEncryptedConversation/useEncryptedConversation', () => ({
  useEncryptedConversation: () => ({
    status: 'ready',
    errorMessage: null,
    thread: [],
    receiverProvisioned: false,
    draft: '',
    setDraft: vi.fn(),
    bodyBudgetBytes: 620,
    draftBytes: 0,
    isSending: false,
    sendError: null,
    send: vi.fn(async () => 'queued'),
    cancelQueued: vi.fn(async () => {}),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

vi.mock('@/organisms/Marketplace/MarketplaceSectionNav', () => ({
  MarketplaceSectionNav: () => null,
}));

describe('MarketplaceInbox conversation query', () => {
  beforeEach(() => {
    search.params = new URLSearchParams();
    router.push.mockReset();
    router.replace.mockReset();
    auth.currentUserPubky = BUYER;
    config.mode = 'transaction-service';
    encryptedView.status = 'ready';
    encryptedView.conversations = [];
    encryptedView.receiverProvisioned = false;
    encryptedView.errorMessage = null;
  });

  it('shows the fail-closed copy for a malformed query and does not open a thread', async () => {
    const warn = vi.spyOn(Logger, 'warn');
    search.params = new URLSearchParams('conversation=not-a-conversation');
    render(<MarketplaceInbox />);
    expect(screen.getByText(MESSAGING_COPY.deepLinkInvalid)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(document.querySelector('[data-surface="marketplace-inbox"]')).toBeTruthy();
    await waitFor(() => {
      expect(JSON.stringify(warn.mock.calls)).toContain('invalid_conversation_query');
    });
    expect(JSON.stringify(warn.mock.calls)).not.toContain('not-a-conversation');
    warn.mockRestore();
  });

  it('rejects dm: ids on the marketplace route', () => {
    search.params = new URLSearchParams(`conversation=dm:${SELLER}`);
    render(<MarketplaceInbox />);
    expect(screen.getByText(MESSAGING_COPY.deepLinkInvalid)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows the other-account copy without opening a thread', () => {
    auth.currentUserPubky = OTHER;
    search.params = new URLSearchParams(`conversation=${CONVERSATION_ID}`);
    render(<MarketplaceInbox />);
    expect(screen.getByText(MESSAGING_COPY.deepLinkOtherAccount)).toBeInTheDocument();
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('opens the listing conversation for a participant query', async () => {
    search.params = new URLSearchParams(`conversation=${CONVERSATION_ID}`);
    render(<MarketplaceInbox />);
    expect(await screen.findByRole('dialog')).toBeInTheDocument();
    expect(document.querySelector('[data-surface="marketplace-encrypted-conversation"]')).toBeTruthy();
    expect(screen.queryByText(MESSAGING_COPY.deepLinkInvalid)).not.toBeInTheDocument();
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/marketplace/messages');
    });
  });

  it('strips conversation= from the address bar after consuming the first searchParams read', async () => {
    search.params = new URLSearchParams(`conversation=${CONVERSATION_ID}`);
    render(<MarketplaceInbox />);
    await waitFor(() => {
      expect(router.replace).toHaveBeenCalledWith('/marketplace/messages');
    });
    expect(router.replace.mock.calls.some((call) => String(call[0]).includes('conversation='))).toBe(false);
  });

  it('marks a received message unread from Dexie last_read_at only', async () => {
    encryptedView.conversations = [
      {
        id: `${BUYER}:${CONVERSATION_ID}`,
        owner_id: BUYER,
        conversation_id: CONVERSATION_ID,
        listing_ref: `listing:${SELLER}:${LISTING_ID}`,
        counterparty_pubky: SELLER,
        last_message_at: 200,
        last_read_at: 50,
        created_at: 1,
        updated_at: 200,
        lastMessage: {
          id: `${BUYER}:m1`,
          owner_id: BUYER,
          conversation_id: CONVERSATION_ID,
          listing_ref: `listing:${SELLER}:${LISTING_ID}`,
          counterparty_pubky: SELLER,
          direction: 'received',
          body: 'About the order',
          sent_at: 200,
          recorded_at: 200,
        },
        lastQueued: null,
      },
    ];
    render(<MarketplaceInbox />);
    expect(await screen.findByLabelText('Unread messages')).toBeInTheDocument();
    expect(screen.getByText(MESSAGING_COPY.thisSeller)).toBeInTheDocument();
  });
});
