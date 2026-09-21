/**
 * Live P1-PORT A→B proof. Runs through the App test harness against official
 * staging (homeserver A) and a local pubky-testnet (homeserver B). Calls
 * PubchiApplication.exportPubchiState / importPubchiState / planImportPubchiState.
 * PKARR migrate-to-B is a design precondition of import (L905–912), not an App
 * export/import step; the App only wraps publishHomeserverForce as recovery to
 * the configured deploy HS. This proof calls the SDK primitive directly.
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { describe, expect, it } from 'vitest';
import { Client, Keypair, PublicKey, Pubky, type Session } from '@synonymdev/pubky';

const STAGING_HS = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';
const TESTNET_HS = '8pinxxgqs41n4aididenw5apqp1urfmzdztr8jt4abrkdn435ewo';
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
const toHs = arg('--to', TESTNET_HS);
const assertEquality = process.argv.includes('--assert-hash-equality');

function mintToken(): string {
  return execFileSync('bash', [GENERATE], { encoding: 'utf8' }).trim();
}

function processRunning(pattern: string): boolean {
  try {
    return execFileSync('pgrep', ['-f', pattern], { encoding: 'utf8' }).trim().length > 0;
  } catch {
    return false;
  }
}

function tmuxHasSession(name: string): boolean {
  try {
    execFileSync('tmux', ['has-session', '-t', name], { encoding: 'utf8' });
    return true;
  } catch {
    return false;
  }
}

function dockerHomeserverInventory(): Record<string, unknown> {
  try {
    const status = execFileSync(
      'docker',
      [
        'inspect',
        'homeserver',
        '--format',
        '{{.State.Status}}|{{.Config.Image}}|{{json .NetworkSettings.Ports}}|{{.RestartCount}}|{{.State.ExitCode}}',
      ],
      { encoding: 'utf8' },
    ).trim();
    const [state, image, ports, restartCount, exitCode] = status.split('|');
    return {
      name: 'homeserver',
      image,
      status: state,
      ports,
      restart_count: restartCount,
      exit_code: exitCode,
      homeserver_key: TESTNET_HS,
      runnable: state === 'running' && ports !== '{}' && ports !== 'null',
      not_intended_b: true,
      log: `${EVIDENCE}/docker-homeserver.log`,
    };
  } catch (error) {
    return { name: 'homeserver', present: false, error: String(error) };
  }
}

function secondHomeserverInventory(): Record<string, unknown> {
  const testnetBin = `${homedir()}/.cargo/bin/pubky-testnet`;
  return {
    skill_homeserver: STAGING_HS,
    skill_second_homeserver: null,
    railway_docs: 'docs/pubchi-railway.md accepts no homeserver URL or credential',
    docker_homeserver: dockerHomeserverInventory(),
    pubky_testnet_binary: {
      path: testnetBin,
      installed: existsSync(testnetBin),
      running: processRunning('pubky-testnet'),
      tmux_session: 'pubchi-w2b-testnet',
      tmux_present: tmuxHasSession('pubchi-w2b-testnet'),
      homeserver_key: TESTNET_HS,
      postgres: 'postgres://postgres@127.0.0.1:15432/postgres?pubky-test=true',
      bind_note:
        'binary hardcodes 0.0.0.0 on 6286/6287/6288/15411/15412/6881; postgres published on 127.0.0.1:15432 only',
    },
  };
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

describe('P1-PORT live A→B proof via PubchiApplication', () => {
  it('exports from staging A, imports same user U to local testnet B, reconstructs feeds, rejects other owner', async () => {
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
      achieved_a_to_b: false,
    };

    const writeReport = () => {
      writeFileSync(`${EVIDENCE}/proof.json`, `${JSON.stringify(report, null, 2)}\n`);
      writeFileSync(`${EVIDENCE}/hashes-before.json`, `${JSON.stringify(report.hashes_before, null, 2)}\n`);
      writeFileSync(`${EVIDENCE}/hashes-after.json`, `${JSON.stringify(report.hashes_after, null, 2)}\n`);
    };

    try {
      const testnetMeta = inventory.pubky_testnet_binary as { running?: boolean; tmux_present?: boolean };
      if (!testnetMeta.running || !testnetMeta.tmux_present) {
        throw new Error('local pubky-testnet B is not running in tmux pubchi-w2b-testnet');
      }
      expect(fromHs).toBe(STAGING_HS);
      expect(toHs).toBe(TESTNET_HS);
      expect(fromHs).not.toBe(toHs);

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

      const hashOwnedPaths = async (owner: string, paths: string[]): Promise<Record<string, string>> => {
        const hashes: Record<string, string> = {};
        for (const path of paths) {
          const body = await HomeserverService.requestRawText(`pubky://${owner}${path}`);
          hashes[path] = await hashDocumentBody(body);
        }
        return hashes;
      };

      const userKeypair = Keypair.random();
      const owner = userKeypair.publicKey.z32();
      const stagingPubky = Pubky.withClient(new Client({ pkarr: { relays: PKARR_RELAYS } }));
      const tokenA = mintToken();
      const sessionA = await stagingPubky.signer(userKeypair).signup(PublicKey.from(fromHs), tokenA);
      report.accounts_minted = 1;
      report.owner_u = owner;
      report.session_a_capabilities = sessionA.info.capabilities ?? [];
      activate(sessionA, owner);

      const bot = Keypair.random().publicKey.z32();
      const exportedAt = Math.floor(Date.now() / 1000);
      const botBody = canonicalJson({
        schema: 'pubchi-bot',
        version: 1,
        bot,
        owner,
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
        owner,
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
        owner,
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
        owner,
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
          url: `pubky://${owner}${path}`,
          blob: encoder.encode(body),
        });
      }

      const bundle = await PubchiApplication.exportPubchiState(owner);
      (report.exercised as string[]).push('PubchiApplication.exportPubchiState');
      expect(bundle.owner).toBe(owner);
      expect(bundle.bot).toBe(bot);
      expect(bundle.objects[BUILDERS_PATH]).toBe(feedBody);

      const objectPaths = bundle.manifest.objects.map((entry) => entry.path);
      const hashesBefore = await hashOwnedPaths(owner, objectPaths);
      hashesBefore[PATHS.manifest] = await hashDocumentBody(bundle.objects[PATHS.manifest] ?? '');
      for (const entry of bundle.manifest.objects) {
        expect(hashesBefore[entry.path]).toBe(entry.sha256);
      }
      report.hashes_before = hashesBefore;
      const manifestPaths = [...objectPaths, PATHS.manifest];

      const publicPkarrBefore = await stagingPubky.getHomeserverOf(userKeypair.publicKey);
      report.pkarr_public_before = publicPkarrBefore?.z32() ?? null;

      const testnetPubky = Pubky.testnet();
      const testnetSigner = testnetPubky.signer(userKeypair);
      const sessionB = await testnetSigner.signup(PublicKey.from(toHs), null);
      await testnetSigner.pkdns.publishHomeserverForce(PublicKey.from(toHs));
      const testnetPkarr = await testnetPubky.getHomeserverOf(userKeypair.publicKey);
      report.pkarr = {
        app_migrate_api: 'none — HomeserverService.republishConfiguredHomeserver only force-publishes getHomeserver()',
        design_expectation:
          'design L905–912: import after PKARR migration as a precondition; export/import does not mint identity or republish PKARR',
        manual_step:
          'same keypair U signed up on local testnet B (open signup, token null), then signer.pkdns.publishHomeserverForce(B) on Pubky.testnet()',
        public_network_after_signup_a: publicPkarrBefore?.z32() ?? null,
        testnet_dht_after_force: testnetPkarr?.z32() ?? null,
        switched_to_b_on_testnet_dht: testnetPkarr?.z32() === toHs,
      };
      expect(testnetPkarr?.z32()).toBe(toHs);
      report.session_b_capabilities = sessionB.info.capabilities ?? [];
      activate(sessionB, owner);

      putBlobCalls.length = 0;
      const imported = await PubchiApplication.importPubchiState(owner, bundle);
      (report.exercised as string[]).push('PubchiApplication.importPubchiState');
      report.putBlob_writes_during_import = [...putBlobCalls];
      expect(putBlobCalls.some((url) => url.endsWith(BUILDERS_PATH))).toBe(true);
      expect(putBlobCalls.every((url) => url.startsWith(`pubky://${owner}/pub/app.pubchi/v1/`))).toBe(true);
      expect(putBlobCalls.every((url) => !url.includes('/priv/'))).toBe(true);

      const hashesAfter = await hashOwnedPaths(owner, manifestPaths);
      report.hashes_after = hashesAfter;
      report.import_result_hashes = imported.hashes;
      const equal = manifestPaths.every((path) => hashesBefore[path] === hashesAfter[path]);
      report.equal = equal;
      expect(equal).toBe(true);
      for (const path of manifestPaths) {
        const bodyB = await HomeserverService.requestRawText(`pubky://${owner}${path}`);
        expect(bodyB).toBe(bundle.objects[path]);
        expect(hashesAfter[path]).toBe(hashesBefore[path]);
      }

      const reconstructed = reconstructFeedsFromBundle(imported.bundle);
      (report.exercised as string[]).push('reconstructFeedsFromBundle');
      expect(reconstructed.ok).toBe(true);
      if (!reconstructed.ok) throw new Error(reconstructed.code);
      expect(reconstructed.value).toEqual([EXPECTED_FEED]);
      expect(imported.feeds).toEqual([EXPECTED_FEED]);

      const importedBuilders = await HomeserverService.requestRawText(`pubky://${owner}${BUILDERS_PATH}`);
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

      const otherKeypair = Keypair.random();
      const otherOwner = otherKeypair.publicKey.z32();
      const sessionOther = await testnetPubky.signer(otherKeypair).signup(PublicKey.from(toHs), null);
      report.accounts_minted = 2;
      report.owner_other = otherOwner;
      report.session_other_capabilities = sessionOther.info.capabilities ?? [];
      activate(sessionOther, otherOwner);

      putBlobCalls.length = 0;
      const planCode = await expectPubchiCode(
        () => PubchiApplication.planImportPubchiState(otherOwner, bundle),
        'BOT_MISMATCH',
      );
      (report.exercised as string[]).push('PubchiApplication.planImportPubchiState');
      const importCode = await expectPubchiCode(
        () => PubchiApplication.importPubchiState(otherOwner, bundle),
        'BOT_MISMATCH',
      );
      expect(putBlobCalls.filter((url) => url.includes(otherOwner))).toHaveLength(0);
      report.bot_mismatch = {
        planImportPubchiState: planCode,
        importPubchiState: importCode,
        putBlob_calls_on_other: putBlobCalls.filter((url) => url.includes(otherOwner)),
        handled_as_specified: planCode === 'BOT_MISMATCH' && importCode === 'BOT_MISMATCH',
      };

      report.achieved_a_to_b = equal === true;
      report.two_homeserver_pkarr_migrate =
        'done: same user U exported from staging A, PKARR on local testnet DHT force-published to B, imported via App to B; public PKARR still names A (distinct network)';

      writeReport();
      expect(report.equal).toBe(true);
      expect(report.achieved_a_to_b).toBe(true);
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
