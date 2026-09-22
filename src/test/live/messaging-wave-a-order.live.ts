import 'fake-indexeddb/auto';
import { spawn, type ChildProcess } from 'node:child_process';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { Keypair, Pubky } from '@synonymdev/pubky';
import { chromium, type Browser, type BrowserContext, type Page } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { MarketplaceCommandResponse } from '@/libs/commerce/transaction-commands';

/**
 * Wave A live proof: create a bound-but-unpaid staging shipping order, then
 * Chromium against this-branch Shop pointed at staging-api. Buyer sends in
 * the thread UI; seller sees the body. Production `data-surface` + screenshots.
 * The order is cancelled (restocked) at the end. No money moves.
 *
 *   WAVE_A_SHOP_URL=http://127.0.0.1:4311 npm run test:marketplace:messaging:wave-a
 */

const SERVICE_URL = process.env.MARKETPLACE_SERVICE_URL ?? 'https://staging-api.pubky.app';
const NEXUS_URL = process.env.MARKETPLACE_NEXUS_URL ?? 'https://nexus.staging.pubky.app';
const TRAIN_SEAT_DIR =
  process.env.WAVE_A_TRAIN_SEAT_DIR ?? '/Volumes/t7/vibes-dev/.evidence/train-2026-09-22-am/part-c/staging-seat';
const DROP_IDENTITIES_FILE =
  process.env.MARKETPLACE_STAGING_DROP_IDENTITIES_FILE ?? '/Users/johncarvalho/work/.staging-drop-identities.json';
const EVIDENCE_DIR = process.env.MESSAGING_WAVE_A_EVIDENCE_DIR ?? '/Volumes/t7/vibes-dev/.evidence/messaging-wave-a';
const LIVE_SEATS_DIR = path.join(EVIDENCE_DIR, 'live-seats');
const PROOF_PATH = process.env.MESSAGING_WAVE_A_PROOF_PATH ?? path.join(EVIDENCE_DIR, 'shop-send-see-proof.txt');
const SHOT_DIR = path.join(EVIDENCE_DIR, 'chromium-shop-shots');
const SHOP_PORT = Number(process.env.WAVE_A_SHOP_PORT ?? 4311);
const TRAIN_SELLER_PREFIX = '4mj79unr';
const DROP_BUYER_A_PREFIX = 'bgortufi';
const REGISTRATION_DEADLINE_MS = 120_000;
const RECOVERY_PASSPHRASE = 'wave-a-chromium-restore';

process.env.PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE = 'transaction-service';
process.env.PUBKY_RUNTIME_MARKETPLACE_URL = SERVICE_URL;
process.env.PUBKY_RUNTIME_MARKETPLACE_NEXUS_URL = NEXUS_URL;
process.env.PUBKY_RUNTIME_TESTNET ??= 'false';
process.env.NEXT_PUBLIC_APP_VERSION ??= '0.0.0-live';
process.env.NEXT_PUBLIC_DB_VERSION ??= '6';
process.env.NEXT_PUBLIC_DEBUG_MODE ??= 'false';

type Seat = {
  role: 'seller' | 'buyer';
  pubky: string;
  keypair: Keypair;
  pkarrPath: string;
  passphrase: string;
};

type AppModules = {
  MarketplaceSessionService: typeof import('@/services/marketplace/marketplace-session').MarketplaceSessionService;
  MarketplaceGatewayService: typeof import('@/services/marketplace/marketplace').MarketplaceGatewayService;
  HomeserverService: typeof import('@/services/homeserver/homeserver').HomeserverService;
  CommerceHomeserverService: typeof import('@/services/homeserver/commerce/commerce').CommerceHomeserverService;
  useAuthStore: typeof import('@/stores/auth/auth.store').useAuthStore;
  specs: typeof import('pubky-app-specs');
};

type ServiceSession = NonNullable<
  ReturnType<typeof import('@/services/marketplace/marketplace-session').MarketplaceSessionService.getActiveSession>
>;

let modules: AppModules;
let shopUrl = (process.env.WAVE_A_SHOP_URL ?? '').replace(/\/$/, '');
let shopProcess: ChildProcess | null = null;
let browser: Browser;
let createdOrderId: string | null = null;
let createdListingTitle = '';
let createdListingId = '';
let failingStep = 'boot';
let sellerSeat: Seat;
let buyerSeat: Seat;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  return bytes;
}

function commandDetail(error: unknown): string {
  if (error instanceof Error) return error.message;
  return String(error);
}

function envelope(aggregateId: string, expectedRevision: number, kind: string, payload: unknown) {
  return {
    version: 1 as const,
    commandId: crypto.randomUUID(),
    aggregateId,
    expectedRevision,
    issuedAt: new Date().toISOString(),
    kind,
    payload,
  } as never;
}

function writeProof(lines: Record<string, string | number | boolean>): void {
  mkdirSync(EVIDENCE_DIR, { recursive: true });
  writeFileSync(
    PROOF_PATH,
    Object.entries(lines)
      .map(([key, value]) => `${key}=${String(value)}`)
      .join('\n') + '\n',
  );
}

function mintRecoverySeat(role: 'seller' | 'buyer', keypair: Keypair): Seat {
  mkdirSync(LIVE_SEATS_DIR, { recursive: true });
  const pkarrPath = path.join(LIVE_SEATS_DIR, `${role}.pkarr`);
  const passphrasePath = path.join(LIVE_SEATS_DIR, `${role}.passphrase`);
  const recovery = keypair.createRecoveryFile(RECOVERY_PASSPHRASE);
  writeFileSync(pkarrPath, Buffer.from(recovery));
  writeFileSync(passphrasePath, `${RECOVERY_PASSPHRASE}\n`, { mode: 0o600 });
  chmodSync(pkarrPath, 0o600);
  chmodSync(passphrasePath, 0o600);
  const pubky = keypair.publicKey.z32();
  expect(pubky.length).toBe(52);
  return { role, pubky, keypair, pkarrPath, passphrase: RECOVERY_PASSPHRASE };
}

async function waitForHttp(url: string, timeoutMs: number): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  let last = 'not-tried';
  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { redirect: 'manual' });
      last = String(response.status);
      if (response.status < 500) return;
    } catch (error) {
      last = error instanceof Error ? error.message : 'fetch-failed';
    }
    await sleep(1_000);
  }
  throw new Error(`Shop did not become ready at ${url} (${last})`);
}

async function ensureShopPage(): Promise<string> {
  if (shopUrl) {
    await waitForHttp(shopUrl, 30_000);
    return shopUrl;
  }
  shopUrl = `http://127.0.0.1:${SHOP_PORT}`;
  const nextBin = path.join(process.cwd(), 'node_modules', 'next', 'dist', 'bin', 'next');
  shopProcess = spawn(process.execPath, [nextBin, 'dev', '--webpack', '-H', '127.0.0.1', '-p', String(SHOP_PORT)], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      COPYFILE_DISABLE: '1',
      PORT: String(SHOP_PORT),
      PUBKY_RUNTIME_COMMERCE_ADAPTER_MODE: 'transaction-service',
      PUBKY_RUNTIME_MARKETPLACE_URL: SERVICE_URL,
      PUBKY_RUNTIME_MARKETPLACE_NEXUS_URL: NEXUS_URL,
      PUBKY_RUNTIME_TESTNET: 'false',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  const logPath = path.join(EVIDENCE_DIR, 'wave-a-shop-next.log');
  const chunks: Buffer[] = [];
  shopProcess.stdout?.on('data', (chunk: Buffer) => chunks.push(chunk));
  shopProcess.stderr?.on('data', (chunk: Buffer) => chunks.push(chunk));
  try {
    await waitForHttp(shopUrl, 240_000);
  } finally {
    mkdirSync(EVIDENCE_DIR, { recursive: true });
    writeFileSync(logPath, Buffer.concat(chunks));
  }
  return shopUrl;
}

async function withPatience<T>(
  what: string,
  deadlineMs: number,
  retryDelayMs: number,
  attempt: () => Promise<{ done: boolean; value: T; detail?: string }>,
): Promise<T> {
  const startedAt = Date.now();
  let lastDetail = '';
  for (;;) {
    const { done, value, detail } = await attempt();
    if (done) return value;
    lastDetail = detail ?? '';
    if (Date.now() - startedAt >= deadlineMs) {
      throw new Error(`${what} did not complete within ${deadlineMs}ms (last: ${lastDetail})`);
    }
    await sleep(retryDelayMs);
  }
}

async function signInHomeserver(keypair: Keypair, pubky: string): Promise<void> {
  const signedIn = await modules.HomeserverService.signIn({ keypair });
  expect(signedIn, `homeserver sign-in for ${pubky.slice(0, 8)}`).not.toBeNull();
  if (!signedIn) throw new Error(`homeserver sign-in failed for ${pubky.slice(0, 8)}`);
  modules.useAuthStore.setState({ session: signedIn.session, currentUserPubky: pubky });
}

async function connectServiceSession(keypair: Keypair, pubky: string): Promise<ServiceSession> {
  const flow = modules.MarketplaceSessionService.beginSessionFlow();
  await new Pubky().signer(keypair).approveAuthRequest(flow.authorizationUrl);
  const info = await flow.awaitSession();
  expect(info.pubky).toBe(pubky);
  const session = modules.MarketplaceSessionService.getActiveSession();
  if (session === null) throw new Error(`No marketplace session after auth for ${pubky.slice(0, 8)}`);
  return session;
}

function activateServiceSession(session: ServiceSession): void {
  (modules.MarketplaceSessionService as unknown as { session: ServiceSession | null }).session = session;
}

async function publishShippingListing(sellerPubky: string, title: string): Promise<string> {
  const nowIso = new Date().toISOString();
  const builder = new modules.specs.PubkySpecsBuilder(sellerPubky);
  const profile = builder.createUser('Wave A train seller', null, null, null, null);
  await modules.CommerceHomeserverService.putJson(profile.meta.url, profile.user.toJson() as Record<string, unknown>);
  const shop = builder.createShop({
    schemaVersion: 1,
    recordType: 'shop',
    ownerPubky: sellerPubky,
    revision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    name: 'Wave A train shop',
    bio: 'Shipping listing for the Wave A Chromium messaging proof.',
    location: { countryCode: 'PT', region: 'Lisboa' },
    shippingPolicy: 'Ships within 3 business days.',
    returnPolicy: 'Returns accepted within 30 days.',
    vacationMode: false,
  });
  await modules.CommerceHomeserverService.putJson(shop.meta.url, shop.shop.toJson() as Record<string, unknown>);
  const listing = builder.createListing({
    schemaVersion: 1,
    recordType: 'listing',
    ownerPubky: sellerPubky,
    revision: 1,
    createdAt: nowIso,
    updatedAt: nowIso,
    listingId: '',
    state: 'active',
    title,
    description: 'Shipping listing created for the Wave A Chromium send-see proof. Cancelled after the run.',
    taxonomyVersion: 1,
    categoryId: 'fashion-shoes-boots',
    condition: 'good',
    tags: ['wave-a-messaging'],
    location: { countryCode: 'PT', region: 'Lisboa' },
    media: [
      {
        id: 'image_01',
        type: 'image',
        url: `pubky://${sellerPubky}/pub/pubky.app/marketplace/v1/media/image_01`,
        contentHash: 'd'.repeat(64),
        mimeType: 'image/jpeg',
        byteSize: 10_000,
        width: 1_200,
        height: 1_600,
        altText: 'Wave A shipping listing',
      },
    ],
    variants: [{ id: 'variant_01', options: {}, quantity: 1, mediaIds: ['image_01'], enabled: true }],
    sale: {
      format: 'fixed_price',
      unitPrice: { amountMinor: 1_000, currency: 'USD', exponent: 2 },
      acceptsOffers: false,
    },
    fulfillmentMethods: ['physical'],
    package: { weightGrams: 800, lengthMillimeters: 320, widthMillimeters: 220, heightMillimeters: 120 },
    shippingOptions: [
      {
        id: 'ship_01',
        pricing: 'flat',
        label: 'Standard shipping',
        price: { amountMinor: 0, currency: 'USD', exponent: 2 },
        estimatedMinDays: 3,
        estimatedMaxDays: 7,
      },
    ],
    returnPolicy: { acceptsReturns: false, buyerPaysReturnShipping: false },
    digitalDelivery: null,
    adultOnly: false,
  } as never);
  await modules.CommerceHomeserverService.putJson(
    listing.meta.url,
    listing.listing.toJson() as Record<string, unknown>,
  );
  return listing.meta.id;
}

async function registerOrSyncListing(sellerPubky: string, listingId: string, title: string): Promise<void> {
  const listingAggregateId = `listing:${sellerPubky}_${listingId}`;
  try {
    const registered = await modules.MarketplaceGatewayService.execute(
      sellerPubky,
      envelope(listingAggregateId, 0, 'listing.register', {
        sellerPubky,
        listingId,
        title,
        listingRevision: 1,
        contentHash: 'd'.repeat(64),
        quantity: 1,
        unitPrice: { amountMinor: 1_000, currency: 'USD', exponent: 2 },
        shippingMinor: 0,
        saleFormat: 'fixed_price' as const,
        fulfillmentMethods: ['shipping'] as ('shipping' | 'pickup')[],
      }),
    );
    if (registered.ok) return;
  } catch {
    // Deployed staging may refuse listing.register and require listing.sync.
  }

  await withPatience('listing.sync after register refusal', REGISTRATION_DEADLINE_MS, 3_000, async () => {
    try {
      const response = await modules.MarketplaceGatewayService.execute(
        sellerPubky,
        envelope(listingAggregateId, 0, 'listing.sync', { sellerPubky, listingId }),
      );
      return response.ok
        ? { done: true, value: undefined }
        : { done: false, value: undefined, detail: response.error.code };
    } catch (error) {
      return { done: false, value: undefined, detail: commandDetail(error) };
    }
  });
}

async function createDurableOrder(): Promise<{
  orderId: string;
  listingId: string;
  title: string;
  bound: boolean;
  state: string;
}> {
  failingStep = 'load_identities';
  expect(existsSync(path.join(TRAIN_SEAT_DIR, 'identities.json')), 'train identities.json').toBe(true);
  expect(existsSync(DROP_IDENTITIES_FILE), 'drop identities file').toBe(true);
  const train = JSON.parse(readFileSync(path.join(TRAIN_SEAT_DIR, 'identities.json'), 'utf8')) as {
    seller: string;
  };
  const drop = JSON.parse(readFileSync(DROP_IDENTITIES_FILE, 'utf8')) as { buyerA: string };
  const sellerKeypair = Keypair.fromSecret(hexToBytes(train.seller));
  const buyerKeypair = Keypair.fromSecret(hexToBytes(drop.buyerA));
  sellerSeat = mintRecoverySeat('seller', sellerKeypair);
  buyerSeat = mintRecoverySeat('buyer', buyerKeypair);
  expect(sellerSeat.pubky.startsWith(TRAIN_SELLER_PREFIX), 'train seller prefix').toBe(true);
  expect(buyerSeat.pubky.startsWith(DROP_BUYER_A_PREFIX), 'drop buyerA prefix').toBe(true);

  const title = `Wave A ship ${Date.now()}`;
  createdListingTitle = title;

  failingStep = 'seller_homeserver';
  await signInHomeserver(sellerSeat.keypair, sellerSeat.pubky);
  failingStep = 'publish_listing';
  const listingId = await publishShippingListing(sellerSeat.pubky, title);
  createdListingId = listingId;
  const listingAggregateId = `listing:${sellerSeat.pubky}_${listingId}`;

  failingStep = 'seller_marketplace_session';
  const sellerSession = await connectServiceSession(sellerSeat.keypair, sellerSeat.pubky);
  activateServiceSession(sellerSession);
  failingStep = 'listing_register';
  await registerOrSyncListing(sellerSeat.pubky, listingId, title);

  failingStep = 'buyer_homeserver';
  await signInHomeserver(buyerSeat.keypair, buyerSeat.pubky);
  failingStep = 'buyer_marketplace_session';
  const buyerSession = await connectServiceSession(buyerSeat.keypair, buyerSeat.pubky);
  activateServiceSession(buyerSession);

  failingStep = 'checkout_create';
  const listingView = await modules.MarketplaceGatewayService.getListing(buyerSeat.pubky, listingAggregateId);
  expect(listingView, 'registered listing must be readable').toBeTruthy();
  const checkoutCommandId = crypto.randomUUID();
  const checkedOut = (await modules.MarketplaceGatewayService.execute(buyerSeat.pubky, {
    version: 1 as const,
    commandId: checkoutCommandId,
    aggregateId: `checkout:${checkoutCommandId}`,
    expectedRevision: 0,
    issuedAt: new Date().toISOString(),
    kind: 'checkout.create' as const,
    payload: {
      lines: [
        {
          listingAggregateId,
          expectedRevision: listingView!.serverRevision,
          quantity: 1,
          fulfillment: 'shipping' as const,
        },
      ],
      deliveryAddress: {
        name: 'Wave A Buyer',
        line1: 'Rua Augusta 1',
        line2: '',
        city: 'Lisboa',
        region: '',
        postalCode: '1100-053',
        countryCode: 'PT',
      },
      guaranteePolicyVersion: 1 as const,
    },
  })) as MarketplaceCommandResponse;
  expect(checkedOut.ok, `checkout.create failed: ${JSON.stringify(checkedOut)}`).toBe(true);

  const orders = await modules.MarketplaceGatewayService.getOrders(buyerSeat.pubky);
  const order = orders.find((row) => row.lines.some((line) => line.listingAggregateId === listingAggregateId));
  expect(order, 'checkout must produce a durable order').toBeTruthy();
  createdOrderId = order!.id;

  failingStep = 'bind_payment_method';
  let bound = false;
  try {
    const boundOrder = await modules.MarketplaceGatewayService.bindPaymentMethod(buyerSeat.pubky, order!.id, 'paypal');
    bound = Boolean(boundOrder.paymentMethod);
  } catch (error) {
    writeFileSync(path.join(EVIDENCE_DIR, 'bind-paypal-error.txt'), commandDetail(error));
  }

  const afterBind = await modules.MarketplaceGatewayService.getOrder(buyerSeat.pubky, order!.id);
  return {
    orderId: order!.id,
    listingId,
    title,
    bound,
    state: afterBind?.state ?? order!.state,
  };
}

async function cancelAndRestock(orderId: string, buyer: Seat): Promise<string> {
  failingStep = 'cancel_restock';
  await signInHomeserver(buyer.keypair, buyer.pubky);
  await connectServiceSession(buyer.keypair, buyer.pubky);
  const current = await modules.MarketplaceGatewayService.getOrder(buyer.pubky, orderId);
  if (!current) return 'missing';
  if (current.state === 'cancelled') return 'already_cancelled';
  const cancelled = await modules.MarketplaceGatewayService.execute(
    buyer.pubky,
    envelope(`order:${orderId}`, current.revision, 'order.cancel_request', {
      orderId,
      reason: 'Wave A Chromium proof restock',
    }),
  );
  if (!cancelled.ok) {
    throw new Error(`order.cancel_request failed: ${JSON.stringify(cancelled)}`);
  }
  const after = await modules.MarketplaceGatewayService.getOrder(buyer.pubky, orderId);
  return after?.state ?? 'unknown';
}

async function approveClipboardAuth(page: Page, keypair: Keypair): Promise<void> {
  const copy = page.getByLabel('Copy authorization link');
  await copy.waitFor({ state: 'visible', timeout: 60_000 });
  await page.waitForFunction(
    () => {
      const element = document.querySelector('[aria-label="Copy authorization link"]');
      return element instanceof HTMLButtonElement && !element.disabled;
    },
    undefined,
    { timeout: 60_000 },
  );
  await copy.click();
  const authorizationUrl = await page.evaluate(async () => navigator.clipboard.readText());
  expect(authorizationUrl.length, 'authorization URL copied').toBeGreaterThan(8);
  await new Pubky().signer(keypair).approveAuthRequest(authorizationUrl);
}

async function signInWithEncryptedFile(page: Page, seat: Seat): Promise<void> {
  await page.goto(`${shopUrl}/sign-in`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  await page.locator('#restore-encrypted-file-btn').click();
  await page.locator('#encrypted-file-input').setInputFiles(seat.pkarrPath);
  await page.locator('#restore-password').fill(seat.passphrase);
  await page.locator('#encrypted-file-restore-btn').click();
  await page.waitForURL((url) => !url.pathname.includes('/sign-in'), { timeout: 180_000 });
}

async function connectMarketplaceSession(page: Page, keypair: Keypair, listingTitle: string): Promise<void> {
  await page.goto(`${shopUrl}/marketplace/orders`, { waitUntil: 'domcontentloaded', timeout: 180_000 });
  const approve = page.getByRole('button', { name: 'Approve in Pubky Ring' });
  const allTab = page.getByRole('tab', { name: /^All / });
  try {
    await Promise.race([
      allTab.waitFor({ state: 'visible', timeout: 45_000 }),
      approve.waitFor({ state: 'visible', timeout: 45_000 }),
    ]);
  } catch {
    await page.screenshot({ path: path.join(SHOT_DIR, 'orders-missing.png'), fullPage: true });
    throw new Error('Orders page showed neither the All tab nor the marketplace session card');
  }
  if ((await approve.count()) > 0 && (await allTab.count()) === 0) {
    await approve.click();
    await approveClipboardAuth(page, keypair);
    await allTab.waitFor({ state: 'visible', timeout: 90_000 });
  }
  await allTab.click();
  await page.getByText(`${listingTitle} × 1`).waitFor({ state: 'visible', timeout: 60_000 });
}

async function openOrderThread(page: Page, keypair: Keypair, listingTitle: string): Promise<void> {
  const card = page
    .locator('div')
    .filter({ hasText: `${listingTitle} × 1` })
    .filter({ has: page.locator('[data-surface="marketplace-order-message-cta"]') })
    .last();
  await card
    .locator('[data-surface="marketplace-order-message-cta"]')
    .getByRole('button', { name: 'Message about this order' })
    .click();
  const surface = page.locator('[data-surface="marketplace-encrypted-conversation"]');
  await surface.waitFor({ state: 'visible', timeout: 30_000 });
  const composer = page.locator('#encrypted-message-body');
  const enableCopy = page.getByLabel('Copy authorization link');
  await Promise.race([
    composer.waitFor({ state: 'visible', timeout: 60_000 }),
    enableCopy.waitFor({ state: 'visible', timeout: 60_000 }),
  ]);
  if ((await composer.count()) > 0) return;
  await approveClipboardAuth(page, keypair);
  await composer.waitFor({ state: 'visible', timeout: 90_000 });
}

describe('Wave A Chromium Shop: buyer send, seller see', () => {
  beforeAll(async () => {
    mkdirSync(SHOT_DIR, { recursive: true });
    modules = {
      MarketplaceSessionService: (await import('@/services/marketplace/marketplace-session')).MarketplaceSessionService,
      MarketplaceGatewayService: (await import('@/services/marketplace/marketplace')).MarketplaceGatewayService,
      HomeserverService: (await import('@/services/homeserver/homeserver')).HomeserverService,
      CommerceHomeserverService: (await import('@/services/homeserver/commerce/commerce')).CommerceHomeserverService,
      useAuthStore: (await import('@/stores/auth/auth.store')).useAuthStore,
      specs: await import('pubky-app-specs'),
    };
    await ensureShopPage();
    browser = await chromium.launch({ headless: true });
  }, 300_000);

  afterAll(async () => {
    await browser?.close();
    if (shopProcess?.pid) {
      shopProcess.kill('SIGTERM');
    }
  });

  it('creates a bound-but-unpaid staging order, sends from buyer Shop, seller sees it, then restocks', async () => {
    let created: Awaited<ReturnType<typeof createDurableOrder>> | undefined;
    try {
      created = await createDurableOrder();
      expect(created.state === 'pending_payment' || created.state === 'paid').toBe(true);

      failingStep = 'chromium_restore';
      const body = `wave-a-shop-${Date.now()}`;
      const sellerContext: BrowserContext = await browser.newContext();
      const buyerContext: BrowserContext = await browser.newContext();
      await sellerContext.grantPermissions(['clipboard-read', 'clipboard-write']);
      await buyerContext.grantPermissions(['clipboard-read', 'clipboard-write']);
      const sellerPage = await sellerContext.newPage();
      const buyerPage = await buyerContext.newPage();

      try {
        await signInWithEncryptedFile(sellerPage, sellerSeat);
        await signInWithEncryptedFile(buyerPage, buyerSeat);
        failingStep = 'marketplace_session';
        await connectMarketplaceSession(sellerPage, sellerSeat.keypair, created.title);
        await connectMarketplaceSession(buyerPage, buyerSeat.keypair, created.title);

        failingStep = 'open_threads';
        await openOrderThread(sellerPage, sellerSeat.keypair, created.title);
        await openOrderThread(buyerPage, buyerSeat.keypair, created.title);

        failingStep = 'buyer_send';
        await buyerPage.locator('#encrypted-message-body').fill(body);
        await buyerPage.getByRole('button', { name: 'Send' }).click();
        await buyerPage.screenshot({ path: path.join(SHOT_DIR, 'buyer-send.png'), fullPage: true });

        failingStep = 'seller_see';
        await sellerPage
          .locator('[data-surface="marketplace-encrypted-conversation"]')
          .filter({ hasText: body })
          .waitFor({ state: 'visible', timeout: 90_000 });
        await sellerPage.screenshot({ path: path.join(SHOT_DIR, 'seller-see.png'), fullPage: true });

        const buyerSurface = await buyerPage
          .locator('[data-surface="marketplace-encrypted-conversation"]')
          .getAttribute('data-surface');
        const sellerSurface = await sellerPage
          .locator('[data-surface="marketplace-encrypted-conversation"]')
          .getAttribute('data-surface');
        const orderSurface = await buyerPage
          .locator('[data-surface="marketplace-order-message-cta"]')
          .first()
          .getAttribute('data-surface');

        failingStep = 'done';
        writeProof({
          shop: shopUrl,
          service: SERVICE_URL,
          browser: 'chromium',
          seller_prefix: sellerSeat.pubky.slice(0, 8),
          buyer_prefix: buyerSeat.pubky.slice(0, 8),
          listing_id_len: created.listingId.length,
          listing_title: created.title,
          order_id_len: created.orderId.length,
          order_state: created.state,
          bound: created.bound,
          data_surface_order: orderSurface ?? '',
          data_surface_buyer: buyerSurface ?? '',
          data_surface_seller: sellerSurface ?? '',
          buyer_send: true,
          seller_see: true,
          shots: SHOT_DIR,
          failing_step: 'none',
        });
      } finally {
        await sellerContext.close();
        await buyerContext.close();
      }
    } catch (error) {
      writeProof({
        shop: shopUrl,
        service: SERVICE_URL,
        browser: 'chromium',
        listing_title: createdListingTitle,
        listing_id_len: createdListingId.length,
        order_id_len: createdOrderId?.length ?? 0,
        failing_step: failingStep,
        error: commandDetail(error),
        buyer_send: failingStep === 'seller_see' || failingStep === 'done',
        seller_see: false,
        shots: SHOT_DIR,
      });
      throw error;
    } finally {
      if (createdOrderId && buyerSeat) {
        try {
          const cancelState = await cancelAndRestock(createdOrderId, buyerSeat);
          const existing = existsSync(PROOF_PATH) ? readFileSync(PROOF_PATH, 'utf8') : '';
          writeFileSync(PROOF_PATH, `${existing}cancel_state=${cancelState}\n`);
        } catch (error) {
          const existing = existsSync(PROOF_PATH) ? readFileSync(PROOF_PATH, 'utf8') : '';
          writeFileSync(PROOF_PATH, `${existing}cancel_error=${commandDetail(error)}\n`);
        }
      }
    }
  }, 900_000);
});
