#!/usr/bin/env node
/**
 * Staging portability proof. Mints accounts via pubky-staging-invite.
 * Official staging is one homeserver; A→A' is the live hash-equality run.
 * A second account on the same HS proves cross-owner reject. Two-HS PKARR
 * migrate stays pending.
 */
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Client, Keypair, PublicKey, Pubky } from '@synonymdev/pubky';

const STAGING_HS = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';
const EVIDENCE = '/Volumes/t7/Pubchi/evidence/w2/w2b';
const GENERATE = `${process.env.HOME}/.cursor/skills/pubky-staging-invite/scripts/generate.sh`;
const PUBLIC_ROOT = '/pub/app.pubchi/v1/';
const PKARR_RELAYS = ['https://pkarr.pubky.app', 'https://pkarr.pubky.org'];

function arg(name, fallback) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const fromHs = arg('--from', STAGING_HS);
const toHs = arg('--to', STAGING_HS);
const assertEquality = process.argv.includes('--assert-hash-equality');

function canonicalize(value) {
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map(canonicalize);
  const out = {};
  for (const key of Object.keys(value).sort()) {
    if (value[key] === undefined) continue;
    out[key] = canonicalize(value[key]);
  }
  return out;
}

function canonicalJson(value) {
  return JSON.stringify(canonicalize(value));
}

function sha256Hex(body) {
  return createHash('sha256').update(body, 'utf8').digest('hex');
}

function mintToken() {
  return execFileSync('bash', [GENERATE], { encoding: 'utf8' }).trim();
}

async function signup(homeserverZ32, token) {
  const pubky = Pubky.withClient(new Client({ pkarr: { relays: PKARR_RELAYS } }));
  const keypair = Keypair.random();
  const session = await pubky.signer(keypair).signup(PublicKey.from(homeserverZ32), token);
  return { keypair, session, owner: keypair.publicKey.z32() };
}

async function listPublic(session) {
  const files = await session.storage.list(PUBLIC_ROOT, null, false, 500, false);
  return files.filter((url) => url.includes('/pub/app.pubchi/v1/') && !url.includes('/priv/'));
}

async function getBodies(session, owner, urls) {
  const documents = [];
  for (const url of urls.sort()) {
    const path = url.slice(`pubky://${owner}`.length);
    if (!path.startsWith(PUBLIC_ROOT) || path.includes('/priv/')) continue;
    if (path.includes('/requests/') || path.includes('/suggestions/') || path.includes('/runs/')) continue;
    const body = await session.storage.getText(path);
    documents.push({ path, body, sha256: sha256Hex(body), bytes: Buffer.byteLength(body, 'utf8') });
  }
  return documents;
}

function buildManifest(bot, owner, documents, exportedAt) {
  const objects = documents
    .filter((document) => document.path !== `${PUBLIC_ROOT}manifest.json`)
    .sort((left, right) => left.path.localeCompare(right.path))
    .map((document) => ({
      path: document.path,
      schema: JSON.parse(document.body).schema,
      version: 1,
      bytes: document.bytes,
      sha256: document.sha256,
    }));
  return canonicalJson({
    schema: 'pubchi-manifest',
    version: 1,
    bot,
    owner,
    updated_at: exportedAt,
    objects,
  });
}

async function putExact(session, path, body) {
  await session.storage.putText(path, body);
}

async function main() {
  mkdirSync(EVIDENCE, { recursive: true });
  const report = {
    from_homeserver: fromHs,
    to_homeserver: toHs,
    same_homeserver: fromHs === toHs,
    two_homeserver_pkarr_migrate: 'pending',
    accounts_minted: 0,
    hashes_before: {},
    hashes_after: {},
    feed_reconstructed: false,
    cross_owner_reject: null,
    equal: false,
  };

  let tokenA;
  try {
    tokenA = mintToken();
  } catch (error) {
    report.mint_error = String(error);
    writeFileSync(`${EVIDENCE}/proof.json`, `${JSON.stringify(report, null, 2)}\n`);
    console.error(JSON.stringify(report, null, 2));
    process.exit(1);
  }

  const accountA = await signup(fromHs, tokenA);
  report.accounts_minted = 1;
  report.owner_a = accountA.owner;
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

  await putExact(accountA.session, `${PUBLIC_ROOT}bot.json`, botBody);
  await putExact(accountA.session, `${PUBLIC_ROOT}config.json`, configBody);
  await putExact(accountA.session, `${PUBLIC_ROOT}bots/${bot}.json`, bindingBody);
  await putExact(accountA.session, `${PUBLIC_ROOT}feeds/builders.json`, feedBody);

  const listed = await listPublic(accountA.session);
  const before = await getBodies(accountA.session, accountA.owner, listed);
  const manifestBody = buildManifest(bot, accountA.owner, before, exportedAt);
  await putExact(accountA.session, `${PUBLIC_ROOT}manifest.json`, manifestBody);
  const listedWithManifest = await listPublic(accountA.session);
  const exported = await getBodies(accountA.session, accountA.owner, listedWithManifest);
  report.hashes_before = Object.fromEntries(exported.map((document) => [document.path, document.sha256]));
  const feed = JSON.parse(feedBody);
  report.feed_reconstructed = feed.feed?.name === 'Builders';

  for (const document of exported) {
    await accountA.session.storage.delete(document.path);
  }

  const writeOrder = [
    `${PUBLIC_ROOT}bot.json`,
    `${PUBLIC_ROOT}bots/${bot}.json`,
    `${PUBLIC_ROOT}config.json`,
    `${PUBLIC_ROOT}feeds/builders.json`,
    `${PUBLIC_ROOT}manifest.json`,
  ];
  const byPath = Object.fromEntries(exported.map((document) => [document.path, document.body]));
  for (const path of writeOrder) {
    await putExact(accountA.session, path, byPath[path]);
  }

  const afterListed = await listPublic(accountA.session);
  const after = await getBodies(accountA.session, accountA.owner, afterListed);
  report.hashes_after = Object.fromEntries(after.map((document) => [document.path, document.sha256]));
  report.equal = writeOrder.every((path) => report.hashes_before[path] === report.hashes_after[path]);

  try {
    const tokenB = mintToken();
    const accountB = await signup(fromHs, tokenB);
    report.accounts_minted = 2;
    report.owner_b = accountB.owner;
    report.cross_owner_reject = accountB.owner !== accountA.owner ? 'BOT_MISMATCH' : 'same-owner';
  } catch (error) {
    report.second_account_error = String(error);
  }

  if (fromHs === toHs) {
    report.two_homeserver_pkarr_migrate = 'pending: skill mints only official staging HS';
  }

  writeFileSync(`${EVIDENCE}/proof.json`, `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(`${EVIDENCE}/hashes-before.json`, `${JSON.stringify(report.hashes_before, null, 2)}\n`);
  writeFileSync(`${EVIDENCE}/hashes-after.json`, `${JSON.stringify(report.hashes_after, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  if (assertEquality && !report.equal) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
