// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { describe, expect, it, vi } from 'vitest';
import { renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
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
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/messages',
}));

vi.mock('@/stores/auth/auth.store', async () => {
  const { buyer } = await fixtures;
  return {
    useAuthStore: (selector: (state: { currentUserPubky: string }) => unknown) => selector({ currentUserPubky: buyer }),
  };
});

vi.mock('@/hooks/useMarketplaceInbox/useMarketplaceInbox', () => ({
  useMarketplaceInbox: () => ({
    conversations: view.conversations,
    isLoading: view.isLoading,
    error: view.error,
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main className="w-full py-6">{children}</main>,
}));

describe('Marketplace inbox — visual regression', () => {
  it('renders the conversations list at desktop viewport', async () => {
    const { conversations } = await fixtures;
    view.conversations = conversations;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('inbox-conversations-desktop');
  });

  it('renders the conversations list at mobile viewport', async () => {
    const { conversations } = await fixtures;
    view.conversations = conversations;
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_MOBILE });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('inbox-conversations-mobile');
  });

  it('renders the empty state at desktop viewport', async () => {
    view.conversations = [];
    view.isLoading = false;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('inbox-empty-desktop');
  });

  it('renders the error state at desktop viewport', async () => {
    view.conversations = [];
    view.isLoading = false;
    view.error = 'Marketplace messages are unavailable.';

    const screen = await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('inbox-error-desktop');
  });

  it('renders the loading state at desktop viewport', async () => {
    view.conversations = [];
    view.isLoading = true;
    view.error = null;

    const screen = await renderForVRT(<MarketplaceInbox />, { viewport: VRT_VIEWPORT_DESKTOP });
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('inbox-loading-desktop');
  });
});
