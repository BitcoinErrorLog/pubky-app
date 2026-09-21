/**
 * Live P1-PORT proof. Runs through the App test harness (vitest + branch
 * modules) against official staging. Calls PubchiApplication.exportPubchiState,
 * importPubchiState, and planImportPubchiState. Evaluates reconstructFeedsFromBundle
 * against GET-back builders.json and BOT_MISMATCH on a second owner.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Client, Keypair, PublicKey, Pubky, type Session } from '@synonymdev/pubky';

const STAGING_HS = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';
const EVIDENCE = '/Volumes/t7/Pubchi/evidence/w2/w2b';
const GENERATE = `${homedir()}/.cursor/skills/pubky-staging-invite/scripts/generate.sh`;
const PKARR_RELAYS = ['https://pkarr.pubky.app', 'https://pkarr.pubky.org'];
const BUILDERS_PATH = '/pub/app.pubchi/v1/feeds/builders.json';
const EXPECTED_FEED = {
  path: BUILDERS_PATH,
  name: 'Builders',
  tags: ['builder'],
  canApply: true,
};

function polyfillBrowserStorage(): void {
  const memory = new Map<string, string>();
  const storage = {
    getItem: (key: string) => memory.get(key) ?? null,
    setItem: (key: string, value: string) => {
      memory.set(key, String(value));
    },
    removeItem: (key: string) => {
      memory.delete(key);
    },
    clear: () => memory.clear(),
    key: (index: number) => [...memory.keys()][index] ?? null,
    get length() {
      return memory.size;
    },
  };
  if (typeof globalThis.localStorage === 'undefined') {
    Object.defineProperty(globalThis, 'localStorage', { value: storage, configurable: true });
  }
  if (typeof globalThis.sessionStorage === 'undefined') {
    Object.defineProperty(globalThis, 'sessionStorage', { value: storage, configurable: true });
  }
  if (typeof (globalThis as { window?: unknown }).window === 'undefined') {
    (globalThis as { window: typeof globalThis }).window = globalThis;
  }
}

polyfillBrowserStorage();
await import('fake-indexeddb/auto');

process.env.COPYFILE_DISABLE = '1';
process.env.NEXT_PUBLIC_APP_VERSION = '0.0.0-test';
process.env.NEXT_PUBLIC_DB_VERSION = '1';
process.env.NEXT_PUBLIC_DEBUG_MODE = 'false';
process.env.PUBKY_RUNTIME_TESTNET = 'false';
process.env.PUBKY_RUNTIME_ENV = 'staging';
process.env.PUBKY_RUNTIME_PUBCHI_ENABLED = 'true';
process.env.PUBKY_RUNTIME_PUBCHI_API_URL = 'https://example.com';
process.env.PUBKY_RUNTIME_HOMESERVER = STAGING_HS;
process.env.PUBKY_RUNTIME_PKARR_RELAYS = JSON.stringify(PKARR_RELAYS);

function arg(name: string, fallback: string): string {
  const index = process.argv.indexOf(name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

const fromHs = arg('--from', STAGING_HS);
const toHs = arg('--to', STAGING_HS);
const assertEquality = process.argv.includes('--assert-hash-equality');

function mintToken(): string {
  return execFileSync('bash', [GENERATE], { encoding: 'utf8' }).trim();
}

async function signup(homeserverZ32: string, token: string): Promise<{ session: Session; owner: string }> {
  const pubky = Pubky.withClient(new Client({ pkarr: { relays: PKARR_RELAYS } }));
  const keypair = Keypair.random();
  const session = await pubky.signer(keypair).signup(PublicKey.from(homeserverZ32), token);
  return { session, owner: keypair.publicKey.z32() };
}

function pubchiCodeOf(error: unknown): string | null {
  if (error && typeof error === 'object' && 'context' in error) {
    const context = (error as { context?: { pubchiCode?: unknown } }).context;
    if (typeof context?.pubchiCode === 'string') return context.pubchiCode;
  }
  if (error instanceof Error && /\bBOT_MISMATCH\b/.test(error.message)) return 'BOT_MISMATCH';
  return null;
}

async function expectPubchiCode(run: () => Promise<unknown>, code: string): Promise<string> {
  try {
    await run();
  } catch (error) {
    const actual = pubchiCodeOf(error);
    if (actual !== code) {
      throw new Error(`expected ${code}, got ${actual ?? String(error)}`);
    }
    return actual;
  }
  throw new Error(`expected ${code}, but the call succeeded`);
}

function dockerHomeserverInventory(): Record<string, unknown> {
  try {
    const status = execFileSync(
      'docker',
      [
        'inspect',
        'homeserver',
        '--format',
        '{{.State.Status}}|{{.Config.Image}}|{{json .NetworkSettings.Ports}}',
      ],
      { encoding: 'utf8' },
    ).trim();
    const [state, image, ports] = status.split('|');
    return {
      name: 'homeserver',
      image,
      status: state,
      ports,
      homeserver_key: '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo',
      runnable: state === 'running' && ports !== '{}' && ports !== 'null',
    };
  } catch (error) {
    return { name: 'homeserver', present: false, error: String(error) };
  }
}

function secondHomeserverInventory(): Record<string, unknown> {
  const skillHs = STAGING_HS;
  const testnetBin = `${homedir()}/.cargo/bin/pubky-testnet`;
  const docker = dockerHomeserverInventory();
  const testnetRunning = (() => {
    try {
      return execFileSync('pgrep', ['-f', 'pubky-testnet'], { encoding: 'utf8' }).trim().length > 0;
    } catch {
      return false;
    }
  })();
  return {
    skill_homeserver: skillHs,
    skill_second_homeserver: null,
    railway_docs: 'docs/pubchi-railway.md accepts no homeserver URL or credential',
    service_staging_docs: 'none (docs/*staging* absent on pubky-ai-bot)',
    docker_homeserver: docker,
    pubky_testnet_binary: {
      path: testnetBin,
      installed: existsSync(testnetBin),
      running: testnetRunning,
      requires: 'ephemeral Postgres via TEST_PUBKY_CONNECTION_STRING; hardcoded HS 8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo',
    },
    achieved_a_to_b: false,
    missing:
      'A second staging homeserver identity (skill mints only ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy). Local docker homeserver is crash-looping with no published ports. pubky-testnet is installed but not running; starting it would invent a second HS.',
  };
}

describe('P1-PORT live proof via PubchiApplication', () => {
  it('exports, imports, reconstructs builders.json, and rejects B with BOT_MISMATCH', async () => {
    mkdirSync(EVIDENCE, { recursive: true });
    const inventory = secondHomeserverInventory();
    const report: Record<string, unknown> = {
      from_homeserver: fromHs,
      to_homeserver: toHs,
      same_homeserver: fromHs === toHs,
      two_homeserver_pkarr_migrate: 'pending',
      two_homeserver_inventory: inventory,
      exercised: [] as string[],
      accounts_minted: 0,
      hashes_before: {},
      hashes_after: {},
      feed_reconstructed: false,
      bot_mismatch: null,
      equal: false,
    };

    const writeReport = () => {
      writeFileSync(`${EVIDENCE}/proof.json`, `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(`${EVIDENCE}/hashes-before.json`, `${JSON.stringify(report.hashes_before, null, 2)}\n`);
      writeFileSync(`${EVIDENCE}/hashes-after.json`, `${JSON.stringify(report.hashes_after, null, 2)}\n`);
    };

    try {
      const { resetRuntimeConfigForTests } = await import('@/libs/runtime-config/runtime-config');
      resetRuntimeConfigForTests();
      const { PubchiApplication } = await import('@/core/application/pubchi/pubchi');
      const { HomeserverService } = await import('@/services/homeserver/homeserver');
      const { useAuthStore } = await import('@/stores/auth/auth.store');
      const { canonicalJson, PATHS, ownerBindingPath, parseFeedProposal, parsePubchiDocumentText } =
        await import('@/libs/pubchi/schemas');
      const { reconstructFeedsFromBundle, hashDocumentBody } = await import('@/libs/pubchi/portability');

      const putBlobCalls: string[] = [];
      const originalPutBlob = HomeserverService.putBlob.bind(HomeserverService);
      HomeserverService.putBlob = async (params) => {
        putBlobCalls.push(params.url);
        return originalPutBlob(params);
      };

      const activate = (session: Session, owner: string) => {
        useAuthStore.getState().setSession(session);
        useAuthStore.getState().setCurrentUserPubky(owner);
      };

      const tokenA = mintToken();
      const accountA = await signup(fromHs, tokenA);
      report.accounts_minted = 1;
      report.owner_a = accountA.owner;
      report.session_a_capabilities = accountA.session.info.capabilities ?? [];
      activate(accountA.session, accountA.owner);

      const bot = Keypair.random().publicKey.z32();
      const exportedAt = Math.floor(Date.now() / 1000);
      const botBody = canonicalJson({
        schema: 'pubchi-bot',
        version: 1,
        bot,
        owner: accountA.owner,
        display_name: 'Pubchi',
        created_at: exportedAt,
        backup_confirmed_at: null,
        homeserver_account: fromHs,
        key_generation: 1,
      });
      const configBody = canonicalJson({
        schema: 'pubchi-config',
        version: 1,
        bot,
        owner: accountA.owner,
        updated_at: exportedAt,
        display_name: 'Pubchi',
        tier: 'read-only',
        language: 'en',
        summary: { length: 'short', include_sources: true, include_disagreement: true },
        interests: { topics: [], excluded_topics: [] },
        proactive: { enabled: false, max_suggestions_per_day: 1, quiet_hours_utc: { start: 22, end: 7 } },
        follower_history_opt_in: false,
        brain: {
          adapter: 'vercel-ai',
          execution: 'synonym-hosted',
          provider_id: 'moonshot',
          model_id: 'kimi-k3',
          endpoint: null,
          send_public_graph_context: true,
          send_public_web_context: false,
        },
      });
      const bindingBody = canonicalJson({
        schema: 'pubchi-owner-binding',
        version: 1,
        owner: accountA.owner,
        bot,
        status: 'active',
        key_generation: 1,
        created_at: exportedAt,
        updated_at: exportedAt,
      });
      const feedBody = canonicalJson({
        schema: 'pubchi-feed-proposal',
        version: 1,
        bot,
        owner: accountA.owner,
        generated_at: exportedAt,
        feed: {
          name: 'Builders',
          created_at: exportedAt,
          feed: { tags: ['builder'], reach: 'following', layout: 'columns', sort: 'recent' },
        },
        warnings: [],
        installed_user_feed_id: null,
      });

      const encoder = new TextEncoder();
      const seed = [
        [PATHS.bot, botBody],
        [PATHS.config, configBody],
        [ownerBindingPath(bot), bindingBody],
        [BUILDERS_PATH, feedBody],
      ] as const;
      for (const [path, body] of seed) {
        await HomeserverService.putBlob({
          url: `pubky://${accountA.owner}${path}`,
          blob: encoder.encode(body),
        });
      }

      const bundle = await PubchiApplication.exportPubchiState(accountA.owner);
      (report.exercised as string[]).push('PubchiApplication.exportPubchiState');
      expect(bundle.owner).toBe(accountA.owner);
      expect(bundle.bot).toBe(bot);
      expect(bundle.objects[BUILDERS_PATH]).toBe(feedBody);

      const hashesBefore: Record<string, string> = {};
      for (const entry of bundle.manifest.objects) hashesBefore[entry.path] = entry.sha256;
      hashesBefore[PATHS.manifest] = await hashDocumentBody(bundle.objects[PATHS.manifest] ?? '');
      report.hashes_before = hashesBefore;

      for (const path of Object.keys(bundle.objects)) {
        await HomeserverService.deleteIdempotent(`pubky://${accountA.owner}${path}`);
      }

      putBlobCalls.length = 0;
      const imported = await PubchiApplication.importPubchiState(accountA.owner, bundle);
      (report.exercised as string[]).push('PubchiApplication.importPubchiState');
      report.putBlob_writes_during_import = [...putBlobCalls];
      expect(putBlobCalls.some((url) => url.endsWith(BUILDERS_PATH))).toBe(true);
      expect(putBlobCalls.every((url) => url.startsWith(`pubky://${accountA.owner}/pub/app.pubchi/v1/`))).toBe(true);
      expect(putBlobCalls.every((url) => !url.includes('/priv/'))).toBe(true);

      report.hashes_after = imported.hashes;
      report.equal = Object.keys(hashesBefore).every((path) => hashesBefore[path] === imported.hashes[path]);

      const reconstructed = reconstructFeedsFromBundle(imported.bundle);
      (report.exercised as string[]).push('reconstructFeedsFromBundle');
      expect(reconstructed.ok).toBe(true);
      if (!reconstructed.ok) throw new Error(reconstructed.code);
      expect(reconstructed.value).toEqual([EXPECTED_FEED]);
      expect(imported.feeds).toEqual([EXPECTED_FEED]);

      const importedBuilders = await HomeserverService.requestRawText(`pubky://${accountA.owner}${BUILDERS_PATH}`);
      expect(importedBuilders).toBe(feedBody);
      const parsedBuilders = parsePubchiDocumentText(importedBuilders, parseFeedProposal);
      expect(parsedBuilders.ok).toBe(true);
      if (!parsedBuilders.ok) throw new Error(parsedBuilders.code);
      const rendered = {
        path: BUILDERS_PATH,
        name: parsedBuilders.value.feed.name,
        tags: parsedBuilders.value.feed.feed.tags ?? [],
        canApply: parsedBuilders.value.version === 1,
      };
      expect(rendered).toEqual(EXPECTED_FEED);
      report.feed_reconstructed = {
        from_import_result: imported.feeds,
        from_reconstructFeedsFromBundle: reconstructed.value,
        from_imported_builders_json: rendered,
        identical: true,
      };

      const tokenB = mintToken();
      const accountB = await signup(fromHs, tokenB);
      report.accounts_minted = 2;
      report.owner_b = accountB.owner;
      report.session_b_capabilities = accountB.session.info.capabilities ?? [];
      activate(accountB.session, accountB.owner);

      putBlobCalls.length = 0;
      const planCode = await expectPubchiCode(
        () => PubchiApplication.planImportPubchiState(accountB.owner, bundle),
        'BOT_MISMATCH',
      );
      (report.exercised as string[]).push('PubchiApplication.planImportPubchiState');
      const importCode = await expectPubchiCode(
        () => PubchiApplication.importPubchiState(accountB.owner, bundle),
        'BOT_MISMATCH',
      );
      expect(putBlobCalls.filter((url) => url.includes(accountB.owner))).toHaveLength(0);
      report.bot_mismatch = {
        planImportPubchiState: planCode,
        importPubchiState: importCode,
        putBlob_calls_on_b: putBlobCalls.filter((url) => url.includes(accountB.owner)),
        handled_as_specified: planCode === 'BOT_MISMATCH' && importCode === 'BOT_MISMATCH',
      };

      if (fromHs === toHs) {
        report.two_homeserver_pkarr_migrate =
          'pending: skill mints only official staging HS; local second HS not runnable (see two_homeserver_inventory)';
      }

      writeReport();
      expect(report.equal).toBe(true);
      if (assertEquality && report.equal !== true) {
        throw new Error('hash equality failed');
      }
    } catch (error) {
      report.error = String(error);
      writeReport();
      throw error;
    }
  });
});
