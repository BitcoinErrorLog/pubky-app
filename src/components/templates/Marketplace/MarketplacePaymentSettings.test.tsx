import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CommerceController } from '@/controllers/commerce/commerce';
import type { SellerPaymentConfigOwnView } from '@/libs/commerce/payment-methods';
import { toast } from '@/molecules/Toaster/use-toast';
import { useAuthStore } from '@/stores/auth/auth.store';
import { useCommerceStore } from '@/stores/commerce/commerce.store';
import { MarketplacePaymentSettings } from './MarketplacePaymentSettings';

const view = vi.hoisted(() => ({
  locksConnect: {
    connectedCreator: null as string | null,
    isExchanging: false,
    error: null as string | null,
  },
}));

vi.mock('@/controllers/commerce/commerce', () => ({
  CommerceController: {
    getPaykitSetupUrl: vi.fn((returnTo: string, state: string, creator: string) => {
      const url = new URL('https://paykit.example/setup');
      url.searchParams.set('return_to', returnTo);
      url.searchParams.set('state', state);
      url.searchParams.set('creator', creator);
      return url.toString();
    }),
    getMyPaymentConfig: vi.fn(),
    isOwnPaykitAccountClaimed: vi.fn(),
    putMyPaymentConfig: vi.fn(),
    beginPaykitClaimFlow: vi.fn(),
    beginMarketplaceSessionConnect: vi.fn(),
    createLocksFrontendSession: vi.fn(),
  },
}));

vi.mock('@/molecules/Toaster/use-toast', () => ({
  toast: vi.fn(),
}));

vi.mock('@/hooks/useMarketplaceLocksConnect/useMarketplaceLocksConnect', () => ({
  useMarketplaceLocksConnect: () => ({
    ...view.locksConnect,
    openConnect: vi.fn(),
  }),
}));

vi.mock('@/organisms/ContentLayout/ContentLayout', () => ({
  ContentLayout: ({ children }: { children: React.ReactNode }) => <main>{children}</main>,
}));

const mockedController = vi.mocked(CommerceController);
const mockedToast = vi.mocked(toast);

const EMPTY_CONFIG: SellerPaymentConfigOwnView = {
  bitcoinEnabled: false,
  stripePaymentLink: null,
  paypalMerchantEmail: null,
  stripeRestrictedKeySet: false,
  updatedAt: '2026-08-22T12:00:00.000Z',
};

const PLAUSIBLE_XPUB = `zpub${'r'.repeat(107)}`;

beforeEach(() => {
  vi.useRealTimers();
  mockedToast.mockReset();
  view.locksConnect = { connectedCreator: null, isExchanging: false, error: null };
  mockedController.getMyPaymentConfig.mockReset().mockResolvedValue(EMPTY_CONFIG);
  mockedController.isOwnPaykitAccountClaimed.mockReset().mockResolvedValue(false);
  mockedController.putMyPaymentConfig.mockReset().mockImplementation(async (input) => ({
    bitcoinEnabled: input.bitcoinEnabled,
    stripePaymentLink: input.stripePaymentLink,
    paypalMerchantEmail: input.paypalMerchantEmail,
    stripeRestrictedKeySet: Boolean('stripeRestrictedKey' in input && input.stripeRestrictedKey),
    updatedAt: '2026-08-22T12:30:00.000Z',
  }));
  mockedController.beginPaykitClaimFlow.mockReset().mockReturnValue({
    authorizationUrl: 'https://auth.example/claim',
    awaitClaim: () => new Promise<{ creator: string; accountIndex: number }>(() => {}),
    cancel: vi.fn(),
  });
  // A marketplace session makes the stored-rail forms render; the page is the
  // seller's own settings, never a guest surface.
  useCommerceStore.setState({
    marketplaceSession: {
      pubky: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
      capabilities: '/pub/pubky.app/:rw',
      issuedAt: '2026-08-21T12:00:00.000Z',
      expiresAt: '2026-09-21T12:00:00.000Z',
    },
  });
  useAuthStore.setState({ currentUserPubky: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco' });
});

afterEach(() => {
  vi.useRealTimers();
});

async function renderSettings() {
  render(<MarketplacePaymentSettings />);
  await screen.findByLabelText('PayPal merchant email');
}

function setPaykitIframeSource(iframe: HTMLIFrameElement): WindowProxy {
  const source = {} as WindowProxy;
  Object.defineProperty(iframe, 'contentWindow', { configurable: true, value: source });
  return source;
}

describe('MarketplacePaymentSettings', () => {
  it('leads with the seller-direct promise', async () => {
    await renderSettings();

    expect(screen.getByRole('heading', { name: 'How you get paid' })).toBeInTheDocument();
    expect(
      screen.getByText('Every method pays the seller directly — this marketplace never holds funds.'),
    ).toBeInTheDocument();
  });

  it('renders the three method cards in buyer-familiar order', async () => {
    await renderSettings();

    const methodsSection = screen.getByRole('region', { name: 'Payment methods' });
    const titles = within(methodsSection)
      .getAllByRole('heading', { level: 2 })
      .map((heading) => heading.textContent);
    expect(titles).toEqual(['PayPal', 'Card via Stripe', 'Bitcoin wallet']);
  });

  it('derives each status pill from the loaded configuration state', async () => {
    mockedController.getMyPaymentConfig.mockResolvedValue({
      ...EMPTY_CONFIG,
      paypalMerchantEmail: 'seller@example.com',
      // Stripe link without the restricted key cannot verify payments.
      stripePaymentLink: 'https://buy.stripe.com/test_abc',
    });
    mockedController.isOwnPaykitAccountClaimed.mockResolvedValue(true);

    await renderSettings();

    expect(screen.getByTestId('payment-method-status-paypal')).toHaveTextContent('Email saved');
    expect(screen.getByTestId('payment-method-status-stripe')).toHaveTextContent('Needs attention');
    // Claim without Lock Server authorization is not Connected.
    expect(screen.getByTestId('payment-method-status-bitcoin')).toHaveTextContent('Needs attention');
    expect(screen.getByRole('button', { name: /Open Locks connect/ })).toBeInTheDocument();
    expect(screen.getByTestId('payment-methods-ready-summary')).toHaveTextContent(
      '1 method is ready to accept payments.',
    );
  });

  it('shows Bitcoin Connected only when Lock Server authorization and the Paykit claim are both present', async () => {
    view.locksConnect = {
      connectedCreator: 'gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco',
      isExchanging: false,
      error: null,
    };
    mockedController.getMyPaymentConfig.mockResolvedValue({
      ...EMPTY_CONFIG,
      paypalMerchantEmail: 'seller@example.com',
      stripePaymentLink: 'https://buy.stripe.com/test_abc',
      stripeRestrictedKeySet: true,
    });
    mockedController.isOwnPaykitAccountClaimed.mockResolvedValue(true);

    await renderSettings();

    expect(screen.getByTestId('payment-method-status-paypal')).toHaveTextContent('Email saved');
    expect(screen.getByTestId('payment-method-status-stripe')).toHaveTextContent('Connected');
    expect(screen.getByTestId('payment-method-status-bitcoin')).toHaveTextContent('Connected');
    expect(screen.getByTestId('payment-methods-ready-summary')).toHaveTextContent(
      '3 methods are ready to accept payments.',
    );
  });

  it('shows Not set up on every pill for a new seller', async () => {
    await renderSettings();

    expect(screen.getByTestId('payment-method-status-paypal')).toHaveTextContent('Not set up');
    expect(screen.getByTestId('payment-method-status-stripe')).toHaveTextContent('Not set up');
    expect(screen.getByTestId('payment-method-status-bitcoin')).toHaveTextContent('Not set up');
    expect(screen.getByTestId('payment-methods-ready-summary')).toHaveTextContent(
      'Set up at least one method below to start selling.',
    );
  });

  it('needs attention when the Lock Server connect errored', async () => {
    view.locksConnect = { connectedCreator: null, isExchanging: false, error: 'connect rejected' };

    await renderSettings();

    expect(screen.getByTestId('payment-method-status-bitcoin')).toHaveTextContent('Needs attention');
  });

  it('keeps the bitcoin protocol details collapsed until asked', async () => {
    const user = userEvent.setup();
    await renderSettings();

    const detailsToggle = screen.getByRole('button', { name: 'Technical details' });
    expect(detailsToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText(/watch-only BIP84 account claim/)).not.toBeInTheDocument();
    expect(screen.queryByText(/^Lock Server:/)).not.toBeInTheDocument();

    await user.click(detailsToggle);

    expect(detailsToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/watch-only BIP84 account claim/)).toBeInTheDocument();
    expect(screen.getByText(/account xpub/)).toBeInTheDocument();
    expect(screen.getByText(/^Lock Server:/)).toBeInTheDocument();
  });

  it('saves the Stripe and PayPal rails with the unchanged payload shape', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.type(screen.getByLabelText('PayPal merchant email'), 'seller@example.com');
    await user.type(screen.getByLabelText('Stripe payment link'), 'https://buy.stripe.com/test_abc');
    await user.type(screen.getByLabelText('Stripe restricted key'), 'rk_test_12345678');
    await user.click(screen.getByRole('switch', { name: 'Accept bitcoin' }));

    await user.click(screen.getAllByRole('button', { name: 'Save payment settings' })[0]);

    await waitFor(() => expect(mockedController.putMyPaymentConfig).toHaveBeenCalledTimes(1));
    expect(mockedController.putMyPaymentConfig.mock.calls).toMatchSnapshot();
  });

  it('refuses to send a non-Stripe checkout link to the service', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.type(screen.getByLabelText('Stripe payment link'), 'https://evil.example/checkout');
    await user.click(screen.getAllByRole('button', { name: 'Save payment settings' })[0]);

    // The payload contract is unchanged: invalid input never leaves the browser.
    expect(mockedController.putMyPaymentConfig).not.toHaveBeenCalled();
  });

  it('validates the Bitkit setup callback', async () => {
    render(<MarketplacePaymentSettings />);
    expect(screen.getByRole('heading', { name: 'PayPal' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));

    expect(mockedController.getPaykitSetupUrl).toHaveBeenCalledTimes(1);
    const iframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const setupUrl = new URL(iframe.getAttribute('src')!);
    expect(setupUrl.origin).toBe('https://paykit.example');
    const state = String(setupUrl.searchParams.get('state'));
    expect(setupUrl.searchParams.get('creator')).toBe('gy1wnkhfwezwdnawnur1bc3kw1x3jf5ggjj3cm37e31i5ntq3pco');
    expect(state).toHaveLength(22);
    const source = setPaykitIframeSource(iframe);
    mockedController.isOwnPaykitAccountClaimed.mockResolvedValueOnce(true);

    const message = new MessageEvent('message', {
      origin: 'https://paykit.example',
      source,
      data: { type: 'paykit-setup-callback', state },
    });
    act(() => window.dispatchEvent(message));

    await waitFor(() => expect(screen.queryByTitle('Connect Bitkit')).not.toBeInTheDocument());
    expect(mockedToast).toHaveBeenCalledWith({ title: 'Bitkit setup connected' });
    await waitFor(() => expect(mockedController.getMyPaymentConfig).toHaveBeenCalledTimes(2));
  });

  it('shows the timeout state and retries with a fresh setup state', async () => {
    await renderSettings();
    vi.useFakeTimers();
    fireEvent.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));

    await act(async () => {
      await vi.advanceTimersByTimeAsync(6 * 60 * 1_000);
    });
    expect(screen.getByRole('alert')).toHaveTextContent('No approval received.');

    const firstState = new URL((screen.getByTitle('Connect Bitkit') as HTMLIFrameElement).src).searchParams.get(
      'state',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const secondState = new URL((screen.getByTitle('Connect Bitkit') as HTMLIFrameElement).src).searchParams.get(
      'state',
    );
    expect(secondState).not.toBe(firstState);
    vi.useRealTimers();
  });

  it('keeps the dialog open and shows an identity mismatch when verification is not claimed', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));
    const iframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const source = setPaykitIframeSource(iframe);
    const state = new URL(iframe.src).searchParams.get('state');
    mockedController.isOwnPaykitAccountClaimed.mockResolvedValueOnce(false);

    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://paykit.example',
          source,
          data: { type: 'paykit-setup-callback', state },
        }),
      ),
    );

    await waitFor(() =>
      expect(
        screen.getByText(
          'Bitkit approved a different account. In Bitkit, sign in with the same Pubky identity you use here, then try again.',
        ),
      ).toBeInTheDocument(),
    );
    expect(mockedToast).not.toHaveBeenCalled();
    expect(screen.getByTitle('Connect Bitkit')).toBeInTheDocument();
  });

  it('maps identity mismatch separately from other setup errors', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));
    const iframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const source = setPaykitIframeSource(iframe);
    const state = new URL(iframe.src).searchParams.get('state');

    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://paykit.example',
          source,
          data: { type: 'paykit-setup-callback', state, error: 'identity-mismatch' },
        }),
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bitkit approved a different account');

    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    const secondIframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const secondSource = setPaykitIframeSource(secondIframe);
    const secondState = new URL(secondIframe.src).searchParams.get('state');
    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://paykit.example',
          source: secondSource,
          data: { type: 'paykit-setup-callback', state: secondState, error: 'setup-failed' },
        }),
      ),
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Bitkit setup failed. Try again.');
  });

  it('closes the setup dialog when the viewer identity is cleared', async () => {
    await renderSettings();
    fireEvent.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));
    const iframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const source = setPaykitIframeSource(iframe);
    const state = new URL(iframe.src).searchParams.get('state');

    act(() => useAuthStore.setState({ currentUserPubky: null }));
    expect(screen.queryByTitle('Connect Bitkit')).not.toBeInTheDocument();

    act(() =>
      window.dispatchEvent(
        new MessageEvent('message', {
          origin: 'https://paykit.example',
          source,
          data: { type: 'paykit-setup-callback', state },
        }),
      ),
    );
    expect(mockedToast).not.toHaveBeenCalled();
  });

  it('ignores callbacks that fail any message guard', async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));
    const iframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const source = setPaykitIframeSource(iframe);
    const state = new URL(iframe.src).searchParams.get('state');
    const messages = [
      { origin: 'https://wrong.example', source, data: { type: 'paykit-setup-callback', state } },
      { origin: 'https://paykit.example', source: window, data: { type: 'paykit-setup-callback', state } },
      { origin: 'https://paykit.example', source, data: { type: 'other', state } },
      {
        origin: 'https://paykit.example',
        source,
        data: { type: 'paykit-setup-callback', state: 'wrong' },
      },
    ];
    act(() => {
      messages.forEach((message) => window.dispatchEvent(new MessageEvent('message', message)));
    });

    expect(screen.getByTitle('Connect Bitkit')).toBeInTheDocument();
    expect(mockedController.getMyPaymentConfig).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('Bitkit setup connected')).not.toBeInTheDocument();
  });

  it('shows failure and retries with a new setup state', async () => {
    const user = userEvent.setup();
    await renderSettings();
    await user.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));
    const firstIframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    const firstState = String(new URL(firstIframe.src).searchParams.get('state'));
    const source = setPaykitIframeSource(firstIframe);
    const message = new MessageEvent('message', {
      origin: 'https://paykit.example',
      source,
      data: { type: 'paykit-setup-callback', state: firstState, error: 'setup-failed' },
    });
    act(() => window.dispatchEvent(message));

    expect(screen.getByRole('alert')).toHaveTextContent('Bitkit setup failed. Try again.');
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    const secondIframe = screen.getByTitle('Connect Bitkit') as HTMLIFrameElement;
    expect(new URL(secondIframe.src).searchParams.get('state')).not.toBe(firstState);
  });

  it('removes the callback listener when the settings surface unmounts', async () => {
    const addSpy = vi.spyOn(window, 'addEventListener');
    const removeSpy = vi.spyOn(window, 'removeEventListener');
    const user = userEvent.setup();
    const { unmount } = render(<MarketplacePaymentSettings />);
    await screen.findByRole('heading', { name: 'PayPal' });
    await user.click(screen.getByRole('button', { name: /Open Bitkit setup/ }));
    unmount();
    expect(addSpy).toHaveBeenCalledWith('message', expect.any(Function));
    expect(removeSpy).toHaveBeenCalledWith('message', expect.any(Function));
    addSpy.mockRestore();
    removeSpy.mockRestore();
  });

  it('starts the watch-only claim with the pasted xpub, payload unchanged', async () => {
    const user = userEvent.setup();
    await renderSettings();

    await user.click(screen.getByRole('button', { name: 'Technical details' }));
    await user.type(screen.getByLabelText('Account xpub'), PLAUSIBLE_XPUB);
    await user.click(screen.getByRole('button', { name: 'Claim with signer' }));

    expect(mockedController.beginPaykitClaimFlow).toHaveBeenCalledTimes(1);
    expect(mockedController.beginPaykitClaimFlow.mock.calls).toMatchSnapshot();
  });
});
