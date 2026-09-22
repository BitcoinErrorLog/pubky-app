// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { createMarketplaceVrtAuthStore } from '@/test/mocks/marketplace-vrt';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { expectVrtSurface, renderForVRT } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { MarketplaceInbox } from '@/templates/Marketplace/MarketplaceInbox';

const fixtures = vi.hoisted(async () => {
  const { createInboxConversationsFixture, CONVERSATION_FIXTURE_BUYER } =
    await import('@/test/fixtures/commerce/conversations');
  return {
    buyer: CONVERSATION_FIXTURE_BUYER,
    conversations: createInboxConversationsFixture(),
  };
});

const view = vi.hoisted(() => ({
  conversations: [] as unknown[],
  isLoading: false,
  error: null as string | null,
  isSandbox: true,
}));

const encryptedView = vi.hoisted(() => ({
  status: 'ready' as string,
  conversations: [] as unknown[],
  receiverProvisioned: false,
  errorMessage: null as string | null,
}));

const config = vi.hoisted(() => ({ mode: 'sandbox' as string }));

const ENCRYPTED_SELLER = 's'.repeat(52);
const ENCRYPTED_LISTING = '0033GVVN22HJ0FYQGZZS8R2BFC';

function encryptedConversationFixture(buyer: string) {
  const conversationId = `conversation:${ENCRYPTED_SELLER}_${buyer}_${ENCRYPTED_LISTING}`;
  return {
    id: `${buyer}:${conversationId}`,
    owner_id: buyer,
    conversation_id: conversationId,
    listing_ref: `listing:${ENCRYPTED_SELLER}:${ENCRYPTED_LISTING}`,
    counterparty_pubky: ENCRYPTED_SELLER,
    last_message_at: 1_755_691_200_000,
    last_read_at: 1_755_691_200_000,
    created_at: 1_755_604_800_000,
    updated_at: 1_755_691_200_000,
    lastMessage: {
      id: `${buyer}:m1`,
      owner_id: buyer,
      conversation_id: conversationId,
      listing_ref: `listing:${ENCRYPTED_SELLER}:${ENCRYPTED_LISTING}`,
      counterparty_pubky: ENCRYPTED_SELLER,
      direction: 'received',
      body: 'Yes — happy to answer questions about the record player.',
      sent_at: 1_787_227_200_000,
      recorded_at: 1_787_227_200_000,
    },
  };
}

const search = vi.hoisted(() => ({ params: new URLSearchParams() }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/messages',
  useSearchParams: () => search.params,
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

vi.mock('@/config/commerce', async () => {
  const actual = await vi.importActual<typeof import('@/config/commerce')>('@/config/commerce');
  return { ...actual, getCommerceAdapterMode: () => config.mode };
});

vi.mock('@/stores/auth/auth.store', async () => ({
  useAuthStore: createMarketplaceVrtAuthStore({ currentUserPubky: (await fixtures).buyer }),
}));

vi.mock('@/hooks/useMarketplaceInbox/useMarketplaceInbox', () => ({
  useMarketplaceInbox: () => ({
    conversations: view.conversations,
    isLoading: view.isLoading,
    error: view.error,
    isSandbox: view.isSandbox,
  }),
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

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace inbox — visual regression', () => {
  beforeEach(() => {
    search.params = new URLSearchParams();
    config.mode = 'sandbox';
    view.conversations = [];
    view.isLoading = false;
    view.error = null;
    view.isSandbox = true;
    encryptedView.status = 'ready';
    encryptedView.conversations = [];
    encryptedView.receiverProvisioned = false;
    encryptedView.errorMessage = null;
  });

  it('renders the conversations list at desktop viewport', async () => {
    const { conversations } = await fixtures;
    view.conversations = conversations;

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-conversations-desktop');
  });

  it('renders the conversations list at mobile viewport', async () => {
    const { conversations } = await fixtures;
    view.conversations = conversations;

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_MOBILE, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-conversations-mobile');
  });

  it('renders the empty state at desktop viewport', async () => {
    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-empty-desktop');
  });

  it('renders the error state at desktop viewport', async () => {
    view.error = 'Marketplace messages are unavailable.';

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-error-desktop');
  });

  it('renders the loading state at desktop viewport', async () => {
    view.isLoading = true;

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-loading-desktop');
  });

  // Modes with no messaging backend at all (`unavailable`): honest dead end.
  it('renders the unavailable notice in modes with no messaging backend at desktop viewport', async () => {
    view.isSandbox = false;

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-unavailable-desktop');
  });

  // Durable modes: the encrypted inbox.
  it('renders the encrypted enable prompt when messaging was never enabled at desktop viewport', async () => {
    config.mode = 'transaction-service';
    encryptedView.status = 'needs-enable';

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-encrypted-enable-desktop');
  });

  it('renders the encrypted reconnect prompt with readable local history at desktop viewport', async () => {
    const { buyer } = await fixtures;
    config.mode = 'transaction-service';
    encryptedView.status = 'needs-enable';
    encryptedView.receiverProvisioned = true;
    encryptedView.conversations = [encryptedConversationFixture(buyer)];

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-encrypted-reconnect-desktop');
  });

  it('renders the encrypted conversations list at desktop viewport', async () => {
    const { buyer } = await fixtures;
    config.mode = 'transaction-service';
    encryptedView.conversations = [encryptedConversationFixture(buyer)];

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-encrypted-conversations-desktop');
  });

  it('renders the encrypted empty state at desktop viewport', async () => {
    config.mode = 'transaction-service';

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-encrypted-empty-desktop');
  });

  it('renders the encrypted empty state at mobile viewport', async () => {
    config.mode = 'transaction-service';

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_MOBILE, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-encrypted-empty-mobile');
  });

  it('renders the encrypted enable prompt at mobile viewport', async () => {
    config.mode = 'transaction-service';
    encryptedView.status = 'needs-enable';

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_MOBILE, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-encrypted-enable-mobile');
  });

  it('renders the empty state at mobile viewport', async () => {
    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_MOBILE, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-empty-mobile');
  });

  it('renders the error state at mobile viewport', async () => {
    view.error = 'Marketplace messages are unavailable.';

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_MOBILE, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-error-mobile');
  });

  it('renders the fail-closed invalid conversation query at desktop viewport', async () => {
    config.mode = 'transaction-service';
    search.params = new URLSearchParams('conversation=not-a-conversation');

    await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP, disableHover: true });
    await expect(expectVrtSurface('marketplace-inbox')).toMatchScreenshot('inbox-invalid-conversation-desktop');
  });
});
