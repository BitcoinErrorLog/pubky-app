// Intentional import order — browser-mode mock factories rely on stable aliases.
/* eslint-disable simple-import-sort/imports */
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { preloadImages, renderForVRT, VRT_ROOT_TESTID } from '@/test-utils/vrt';
import { VRT_VIEWPORT_DESKTOP, VRT_VIEWPORT_MOBILE } from '@/test-utils/vrt.viewports';
import { Button } from '@/atoms/Button/Button';
import { MarketplaceEncryptedConversationDialog } from '@/organisms/Marketplace/MarketplaceEncryptedConversationDialog';
import { MarketplaceMessagingEnableDialog } from '@/organisms/Marketplace/MarketplaceMessagingEnableDialog';
import type { CommerceMessagingMessageModelSchema } from '@/models/messaging/messaging.schema';

const SELLER = 's'.repeat(52);
const BUYER = 'b'.repeat(52);
const LISTING_ID = '0033GVVN22HJ0FYQGZZS8R2BFC';
const CONVERSATION_ID = `conversation:${SELLER}_${BUYER}_${LISTING_ID}`;

// Fixed fake pubkyauth URL: the QR encodes it verbatim, so it must be
// byte-stable across runs and OSes. It is never dereferenced.
const VRT_AUTH_URL =
  'pubkyauth:///?relay=https%3A%2F%2Fvrt.invalid%2Flink%2F&capabilities=%2Fpub%2Fpaykit%2F%3Arw&secret=vrt-fixed-secret';

const QR_LOGO_URLS = ['/images/ring-logo.svg'];

function fixedMessage(
  id: string,
  direction: 'sent' | 'received',
  body: string,
  recordedAt: number,
): CommerceMessagingMessageModelSchema {
  return {
    id,
    owner_id: BUYER,
    conversation_id: CONVERSATION_ID,
    listing_ref: `listing:${SELLER}:${LISTING_ID}`,
    counterparty_pubky: SELLER,
    direction,
    body,
    sent_at: '2026-08-20T12:00:00.000Z',
    recorded_at: recordedAt,
  };
}

const conversationView = vi.hoisted(() => ({
  status: 'ready' as string,
  errorMessage: null as string | null,
  messages: [] as unknown[],
  receiverProvisioned: false,
  draft: '',
  bodyBudgetBytes: 620,
  draftBytes: 0,
  isSending: false,
  sendError: null as string | null,
}));

const enableView = vi.hoisted(() => ({
  status: 'awaiting' as string,
  authorizationUrl: '',
  errorMessage: null as string | null,
  isOpeningRing: false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn() }),
  usePathname: () => '/marketplace/messages',
}));

vi.mock('@/hooks/useRequireAuth/useRequireAuth', () => ({
  useRequireAuth: () => ({ requireAuth: <T,>(action: () => T) => action() }),
}));

vi.mock('@/hooks/useEncryptedConversation/useEncryptedConversation', () => ({
  useEncryptedConversation: () => ({
    status: conversationView.status,
    errorMessage: conversationView.errorMessage,
    messages: conversationView.messages,
    receiverProvisioned: conversationView.receiverProvisioned,
    draft: conversationView.draft,
    setDraft: vi.fn(),
    bodyBudgetBytes: conversationView.bodyBudgetBytes,
    draftBytes: conversationView.draftBytes,
    isSending: conversationView.isSending,
    sendError: conversationView.sendError,
    send: vi.fn(async () => true),
    refresh: vi.fn(),
  }),
}));

vi.mock('@/hooks/useMarketplaceMessagingEnable/useMarketplaceMessagingEnable', () => ({
  useMarketplaceMessagingEnable: () => ({
    status: enableView.status,
    authorizationUrl: enableView.authorizationUrl,
    errorMessage: enableView.errorMessage,
    start: vi.fn(),
    cancel: vi.fn(),
    copyAuthUrl: vi.fn(async () => {}),
    openInRing: vi.fn(),
    isOpeningRing: enableView.isOpeningRing,
  }),
}));

async function openDialog(trigger: { click: () => Promise<void> }) {
  await trigger.click();
  await vi.waitFor(() => {
    if (!document.querySelector('[role="dialog"]')) throw new Error('Dialog has not opened yet.');
  });
}

function Harness({ children }: { children: React.ReactNode }) {
  return <main className="mx-auto flex w-full max-w-xl flex-col gap-6 px-6 py-10">{children}</main>;
}

function renderConversationDialog() {
  return (
    <Harness>
      <MarketplaceEncryptedConversationDialog
        sellerPubky={SELLER}
        buyerPubky={BUYER}
        listingId={LISTING_ID}
        counterpartyPubky={SELLER}
        trigger={<Button variant="secondary">Message seller</Button>}
      />
    </Harness>
  );
}

describe('Marketplace encrypted messaging — visual regression', () => {
  beforeEach(() => {
    conversationView.status = 'ready';
    conversationView.errorMessage = null;
    conversationView.messages = [];
    conversationView.receiverProvisioned = false;
    conversationView.draft = '';
    conversationView.draftBytes = 0;
    conversationView.isSending = false;
    conversationView.sendError = null;
    enableView.status = 'awaiting';
    enableView.authorizationUrl = '';
    enableView.errorMessage = null;
    enableView.isOpeningRing = false;
  });

  it('renders the active conversation with messages and byte budget at desktop viewport', async () => {
    conversationView.messages = [
      fixedMessage('m1', 'sent', 'Is this still available?', 10),
      fixedMessage('m2', 'received', 'Yes — happy to answer questions.', 20),
      fixedMessage('m3', 'sent', 'Great. Does the price include shipping to Lisbon?', 30),
    ];
    conversationView.draft = 'Asking because the listing does not say.';
    conversationView.draftBytes = 40;

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-conversation-ready-desktop');
  });

  it('renders the active conversation at mobile viewport', async () => {
    conversationView.messages = [
      fixedMessage('m1', 'sent', 'Is this still available?', 10),
      fixedMessage('m2', 'received', 'Yes — happy to answer questions.', 20),
    ];

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_MOBILE });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-conversation-ready-mobile');
  });

  it('renders the over-budget composer state at desktop viewport', async () => {
    conversationView.draft = 'x'.repeat(700);
    conversationView.draftBytes = 700;

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-conversation-over-budget-desktop');
  });

  it('renders the send-failure state with the kept draft at desktop viewport', async () => {
    conversationView.messages = [fixedMessage('m1', 'sent', 'First message went through.', 10)];
    conversationView.draft = 'This one failed to send.';
    conversationView.draftBytes = 24;
    conversationView.sendError = 'The homeserver write failed. Your draft is kept — try again.';

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-conversation-send-failed-desktop');
  });

  it('renders the waiting-for-counterparty handshake state at desktop viewport', async () => {
    conversationView.status = 'handshaking-initiator';

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-handshake-initiator-desktop');
  });

  it('renders the answering-handshake (responder) state at desktop viewport', async () => {
    conversationView.status = 'handshaking-responder';

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-handshake-responder-desktop');
  });

  it('renders the counterparty-not-enrolled state at desktop viewport', async () => {
    conversationView.status = 'not-enrolled';

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-not-enrolled-desktop');
  });

  it('renders the in-conversation enable step when no session exists at desktop viewport', async () => {
    conversationView.status = 'needs-enable';
    enableView.authorizationUrl = VRT_AUTH_URL;

    await preloadImages(QR_LOGO_URLS);
    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-needs-enable-desktop');
  });

  it('renders the transport error state at desktop viewport', async () => {
    conversationView.status = 'error';
    conversationView.errorMessage = 'The homeserver could not be reached. Nothing was sent.';

    const screen = await renderForVRT(renderConversationDialog(), { viewport: VRT_VIEWPORT_DESKTOP });
    await openDialog(screen.getByRole('button', { name: 'Message seller' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-error-desktop');
  });

  it('renders the standalone enable dialog awaiting Ring approval at desktop viewport', async () => {
    enableView.authorizationUrl = VRT_AUTH_URL;

    await preloadImages(QR_LOGO_URLS);
    const screen = await renderForVRT(
      <Harness>
        <MarketplaceMessagingEnableDialog reconnect={false} />
      </Harness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openDialog(screen.getByRole('button', { name: 'Enable encrypted messaging' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-enable-awaiting-desktop');
  });

  it('renders the enable dialog failure state at desktop viewport', async () => {
    enableView.status = 'error';
    enableView.errorMessage = 'The authorization request expired before it was approved. Start a new attempt.';

    const screen = await renderForVRT(
      <Harness>
        <MarketplaceMessagingEnableDialog reconnect />
      </Harness>,
      { viewport: VRT_VIEWPORT_DESKTOP },
    );
    await openDialog(screen.getByRole('button', { name: 'Reconnect encrypted messaging' }));
    await expect(screen.getByTestId(VRT_ROOT_TESTID)).toMatchScreenshot('messaging-enable-error-desktop');
  });
});
