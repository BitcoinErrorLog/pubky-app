#!/usr/bin/env node
/**
 * Launch-critical Chromium suite against a running Next server.
 *
 * Node fetch cannot catch Window.fetch "Illegal invocation". Every journey
 * here drives real Chromium against `next start`.
 */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const FIXTURE_PATH = path.join(ROOT, 'src/test/e2e/fixtures/launch-critical.json');
const SDK_DIST = path.join(ROOT, 'node_modules/@bitcoinerrorlog/pubky-shop/dist');
const AXE_PATH = path.join(ROOT, 'node_modules/axe-core/axe.min.js');
const SDK_ROUTE_PREFIX = '/__launch-e2e/shop-sdk/';
const SESSION_TOKEN = 'A'.repeat(43);
const SELLER_PUBKY = 'y'.repeat(52);

const BASE_URL = (process.env.LAUNCH_E2E_BASE_URL ?? 'http://127.0.0.1:3000').replace(/\/$/, '');
const SERVICE_URL = process.env.LAUNCH_E2E_SERVICE_URL ?? 'https://staging-api.pubky.app';

const failures = [];
const results = [];

function record(name, ok, detail) {
  results.push({ name, ok, detail });
  const mark = ok ? 'PASS' : 'FAIL';
  console.log(`${mark}  ${name}${detail ? ` — ${detail}` : ''}`);
  if (!ok) failures.push(`${name}: ${detail}`);
}

function assert(name, condition, detail) {
  record(name, Boolean(condition), condition ? detail : detail || 'assertion failed');
}

async function expectVisible(page, locator, name, timeout = 20_000) {
  try {
    await locator.waitFor({ state: 'visible', timeout });
    record(name, true, await locator.first().evaluate((el) => el.tagName.toLowerCase()));
    return true;
  } catch (error) {
    record(name, false, String(error).slice(0, 240));
    return false;
  }
}

async function closeJoinDialog(page) {
  const close = page.locator('[data-testid="dialog-close"]');
  if (await close.count()) {
    await close.first().click({ timeout: 5_000 }).catch(() => undefined);
  }
  await page.locator('[role="dialog"]:visible').waitFor({ state: 'hidden', timeout: 5_000 }).catch(() => undefined);
}

async function gotoAndSettle(page, pathname) {
  const response = await page.goto(`${BASE_URL}${pathname}`, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  return response;
}

async function waitForJoinPubky(page) {
  const heading = page.getByRole('heading', { name: 'Join Pubky' });
  return expectVisible(page, heading, 'join-pubky-dialog', 20_000);
}

async function runAxe(page, pageId) {
  await page.addScriptTag({ path: AXE_PATH });
  const report = await page.evaluate(async () => {
    const axe = window.axe;
    const result = await axe.run(document, { resultTypes: ['violations'] });
    return result.violations.map((violation) => ({
      id: violation.id,
      impact: violation.impact,
      description: violation.description,
      nodes: violation.nodes.length,
    }));
  });
  const blocking = report.filter((item) => item.impact === 'critical' || item.impact === 'serious');
  if (blocking.length > 0) {
    record(
      `a11y:${pageId}`,
      false,
      blocking.map((item) => `${item.impact}:${item.id}×${item.nodes}`).join('; '),
    );
    return;
  }
  record(`a11y:${pageId}`, true, report.length === 0 ? 'no violations' : `non-blocking ${report.map((item) => item.id).join(',')}`);
}

async function installSdkRoute(page) {
  await page.route(`**${SDK_ROUTE_PREFIX}**`, async (route) => {
    const url = new URL(route.request().url());
    const relative = decodeURIComponent(url.pathname.slice(SDK_ROUTE_PREFIX.length));
    if (relative.includes('..')) {
      await route.fulfill({ status: 400, body: 'bad path' });
      return;
    }
    const filePath = path.join(SDK_DIST, relative);
    if (!filePath.startsWith(SDK_DIST)) {
      await route.fulfill({ status: 400, body: 'bad path' });
      return;
    }
    try {
      await route.fulfill({
        status: 200,
        contentType: 'application/javascript; charset=utf-8',
        body: await readFile(filePath),
      });
    } catch {
      await route.fulfill({ status: 404, body: 'missing' });
    }
  });
}

async function exerciseInventoryClient(page) {
  return page.evaluate(
    async ({ importUrl, session, serviceUrl, sellerPubky }) => {
      const target = `${new URL(serviceUrl).origin}/v1/listings/${sellerPubky}?limit=1`;

      async function methodCallFetch(fetchImpl) {
        const holder = { fetch: fetchImpl };
        try {
          const response = await holder.fetch(target, { method: 'GET', credentials: 'omit' });
          return { threw: false, illegal: false, status: response.status };
        } catch (error) {
          const message = String(error?.message ?? error);
          return { threw: true, illegal: /illegal invocation/i.test(message), message: message.slice(0, 180) };
        }
      }

      const unboundCall = await methodCallFetch(globalThis.fetch);
      const boundCall = await methodCallFetch(globalThis.fetch.bind(globalThis));

      const { PubkyShopClient } = await import(importUrl);
      const client = new PubkyShopClient({ session, serviceUrl: new URL(serviceUrl).origin });
      const listings = await client.listings(sellerPubky, { limit: 1 });
      return {
        unboundCall,
        boundCall,
        sdk: listings.ok ? { ok: true, code: 'ok' } : { ok: false, code: listings.error?.code ?? 'unknown' },
      };
    },
    {
      importUrl: `${BASE_URL}${SDK_ROUTE_PREFIX}client.js`,
      session: SESSION_TOKEN,
      serviceUrl: SERVICE_URL,
      sellerPubky: SELLER_PUBKY,
    },
  );
}

async function main() {
  const fixture = JSON.parse(await readFile(FIXTURE_PATH, 'utf8'));
  const pageErrors = [];

  const browser = await chromium.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-dev-shm-usage'],
  });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
    locale: 'en-US',
  });
  const page = await context.newPage();
  page.on('pageerror', (error) => {
    pageErrors.push(String(error));
    console.error('pageerror', error);
  });

  await installSdkRoute(page);

  try {
    const catalog = await gotoAndSettle(page, fixture.pages[0].path);
    assert('catalog:http', catalog !== null && catalog.ok(), `status ${catalog?.status()}`);
    await expectVisible(page, page.getByText(fixture.catalogHeading, { exact: false }), 'catalog:heading');
    const sandbox = await page.getByText(fixture.forbiddenSandboxCopy).count();
    assert('catalog:not-sandbox', sandbox === 0, sandbox === 0 ? 'staging adapter' : 'sandbox copy present');

    const joinButton = page.getByTestId('header-explore-join-button');
    if (await expectVisible(page, joinButton, 'sign-in:header-join')) {
      await joinButton.click();
      await waitForJoinPubky(page);
      await runAxe(page, 'catalog-signin');
      await closeJoinDialog(page);
    }

    await runAxe(page, 'catalog');

    const listingCard = page.locator(fixture.listingCardSelector).first();
    const hasListing = await listingCard
      .waitFor({ state: 'visible', timeout: 25_000 })
      .then(() => true)
      .catch(() => false);
    if (!hasListing) {
      record('listing:open', false, 'no staging listing card on catalog');
    } else {
      await listingCard.click();
      await page.waitForURL(/\/marketplace\/listing\//, { timeout: 20_000 });
      record('listing:open', true, page.url());
      const buy = page.getByRole('button', { name: 'Sign in to buy' });
      const add = page.getByRole('button', { name: 'Add to cart' });
      if (await buy.count()) {
        await buy.first().click();
        await waitForJoinPubky(page);
        record('checkout:payment-step', true, 'Sign in to buy → Join Pubky');
        await runAxe(page, 'listing-checkout');
        await closeJoinDialog(page);
      } else if (await add.count()) {
        await add.first().click();
        await waitForJoinPubky(page);
        record('checkout:payment-step', true, 'Add to cart → Join Pubky');
        await closeJoinDialog(page);
      } else {
        record('checkout:payment-step', false, 'no Sign in to buy / Add to cart on listing');
      }
      await runAxe(page, 'listing');
    }

    await gotoAndSettle(page, fixture.pages[2].path);
    await page.waitForURL((url) => url.pathname === '/marketplace', { timeout: 20_000 }).catch(() => undefined);
    assert('cart:guest-redirect', new URL(page.url()).pathname === '/marketplace', page.url());
    await waitForJoinPubky(page);
    const placeOrder = await page.getByRole('button', { name: /Place .* order/i }).count();
    assert('cart:no-sandbox-checkout', placeOrder === 0, 'guest cannot place an order');
    await runAxe(page, 'cart');
    await closeJoinDialog(page);

    await gotoAndSettle(page, fixture.pages[3].path);
    await page.waitForURL((url) => url.pathname === '/marketplace', { timeout: 20_000 }).catch(() => undefined);
    assert('compose:guest-redirect', new URL(page.url()).pathname === '/marketplace', page.url());
    await waitForJoinPubky(page);
    const studio = await page.locator('[data-surface="seller-studio"]').count();
    assert('compose:no-seller-studio', studio === 0, 'composer stays behind Join Pubky');
    await runAxe(page, 'sell');
    await closeJoinDialog(page);

    const inventoryResponse = await gotoAndSettle(page, fixture.pages[4].path);
    assert(
      'inventory:next-served',
      inventoryResponse !== null && inventoryResponse.status() < 500,
      `status ${inventoryResponse?.status()}`,
    );
    await page.waitForURL((url) => url.pathname === '/marketplace', { timeout: 20_000 }).catch(() => undefined);
    await waitForJoinPubky(page);
    await runAxe(page, 'inventory');
    const board = await page.locator('[data-testid="inventory-studio"]').count();
    record(
      'inventory:board-route',
      true,
      board > 0 ? 'inventory-studio mounted' : 'guest Join Pubky gate (board is auth-only)',
    );
    await closeJoinDialog(page);

    await gotoAndSettle(page, '/marketplace');
    await page.waitForLoadState('networkidle', { timeout: 15_000 }).catch(() => undefined);
    const clientProbe = await exerciseInventoryClient(page);
    assert(
      'inventory:unbound-fetch-is-chromium-illegal',
      clientProbe.unboundCall.illegal === true,
      clientProbe.unboundCall.message ?? JSON.stringify(clientProbe.unboundCall),
    );
    assert(
      'inventory:bound-fetch-is-not-illegal',
      clientProbe.boundCall.illegal === false,
      clientProbe.boundCall.message ?? `status ${clientProbe.boundCall.status}`,
    );
    assert(
      'inventory:sdk-client-loads-in-chromium',
      typeof clientProbe.sdk.code === 'string',
      `sdk=${clientProbe.sdk.code}`,
    );

    const illegal = pageErrors.filter((message) => /illegal invocation/i.test(message));
    assert('inventory:no-uncaught-illegal-invocation', illegal.length === 0, illegal.join(' | ') || 'none');
  } finally {
    await context.close();
    await browser.close();
  }

  const summary = {
    baseUrl: BASE_URL,
    serviceUrl: SERVICE_URL,
    fixture: path.relative(ROOT, FIXTURE_PATH),
    results,
    pageErrors,
    failed: failures.length,
  };
  console.log(JSON.stringify(summary, null, 2));
  const resultsPath = process.env.LAUNCH_E2E_RESULTS ?? path.join(ROOT, 'launch-e2e-results.json');
  await writeFile(resultsPath, `${JSON.stringify(summary, null, 2)}\n`);
  if (failures.length > 0) {
    process.exitCode = 1;
  }
}

await main();
