// Operator probe: prove which write paths a homeserver allows for YOUR OWN
// Pubky Ring identity. Starts a pubkyauth flow (scan the printed URL with
// Pubky Ring), then runs PUT/GET/DELETE against the marketplace-relevant path
// families and prints a status table that explicitly distinguishes the two
// 403s the homeserver can return:
//
//   403 "Write to this path is not allowed"          -> homeserver write-allowlist
//   403 "Session does not have write access to path" -> capability denial
//
// Default target is PRODUCTION (pubky 8um71us3…dty, https://homeserver.pubky.app).
// Use --homeserver / --homeserver-url to point the same probe at staging.
//
// Usage:
//   node scripts/probe-production-writes.mjs [--caps <csv>] [--relay <url>]
//     [--homeserver <z32>] [--homeserver-url <url>]
//     [--seed-durability] [--check-durability <id>]
//
// This script never writes anything to disk and never prints secrets beyond
// the short-lived pubkyauth URL the operator must scan.
import { parseArgs } from 'node:util';
import { randomUUID } from 'node:crypto';

const PRODUCTION_HOMESERVER = '8um71us3fyw6h8wbcxb5ar3rwusy1a6u49956ikzojg3gcwd1dty';
const PRODUCTION_HOMESERVER_URL = 'https://homeserver.pubky.app';
const DEFAULT_RELAY = 'https://httprelay.pubky.app/inbox';
const DEFAULT_CAPS = '/pub/pubky.app/:rw,/priv/pubky.app/:rw,/pub/paykit/:rw,/pub/locks.app/:rw,/priv/locks.app/:rw';

const WRITE_ALLOWLIST_403 = 'Write to this path is not allowed';
const CAPABILITY_DENIAL_403 = 'Session does not have write access to path';

const HELP = `probe-production-writes — prove which homeserver write paths YOUR Ring identity may use

Usage:
  node scripts/probe-production-writes.mjs [options]

Options:
  --caps <csv>             Capability string requested from Ring.
                           Default: ${DEFAULT_CAPS}
  --relay <url>            HTTP relay for the auth flow.
                           Default: ${DEFAULT_RELAY}
  --homeserver <z32>       Expected homeserver public key (informational; the
                           user's actual homeserver is resolved via pkdns and
                           a mismatch is warned about after sign-in).
                           Default: ${PRODUCTION_HOMESERVER} (production)
  --homeserver-url <url>   Homeserver base URL (informational display only).
                           Default: ${PRODUCTION_HOMESERVER_URL}
  --seed-durability        Additionally PUT
                           /priv/pubky.app/durability-probe/<id>.json
                           (same record shape as priv-durability-probe.live.ts)
                           and print the id.
  --check-durability <id>  Skip the write probes: sign in and GET
                           /priv/pubky.app/durability-probe/<id>.json,
                           printing found/not found with the HTTP status.
  --help                   Show this help.

Staging example:
  node scripts/probe-production-writes.mjs \\
    --homeserver ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy \\
    --homeserver-url https://homeserver.staging.pubky.app \\
    --relay https://httprelay.staging.pubky.app/inbox

No terminal QR is printed: the only QR dependency in package.json is
qrcode.react (a React SVG component library), which cannot render to a
terminal. Copy the printed pubkyauth URL into Pubky Ring, or open it on a
device that can render it as a QR (e.g. \`qrencode\` locally — not installed
by this script).
`;

function truncate(text, max = 200) {
  const clean = String(text).replace(/\s+/g, ' ').trim();
  return clean.length > max ? `${clean.slice(0, max)}…` : clean;
}

function classify(status, body) {
  if (status === 403 && body.includes(WRITE_ALLOWLIST_403)) return 'homeserver write-allowlist';
  if (status === 403 && body.includes(CAPABILITY_DENIAL_403)) return 'capability denial';
  return '';
}

function printTable(rows) {
  const headers = ['path', 'PUT', 'GET', 'DELETE', 'note'];
  const widths = headers.map((h, i) => Math.max(h.length, ...rows.map((r) => String(r[i]).length)));
  const line = (cells) => cells.map((c, i) => String(c).padEnd(widths[i])).join(' | ');
  console.log(`\n${line(headers)}`);
  console.log(widths.map((w) => '-'.repeat(w)).join('-+-'));
  for (const row of rows) console.log(line(row));
}

async function main() {
  const { values: args } = parseArgs({
    options: {
      caps: { type: 'string', default: DEFAULT_CAPS },
      relay: { type: 'string', default: DEFAULT_RELAY },
      homeserver: { type: 'string', default: PRODUCTION_HOMESERVER },
      'homeserver-url': { type: 'string', default: PRODUCTION_HOMESERVER_URL },
      'seed-durability': { type: 'boolean', default: false },
      'check-durability': { type: 'string' },
      help: { type: 'boolean', default: false },
    },
    strict: true,
  });

  if (args.help) {
    process.stdout.write(HELP);
    return;
  }

  const isProduction = args.homeserver === PRODUCTION_HOMESERVER;
  console.log(`target: ${isProduction ? 'PRODUCTION' : 'override'} homeserver`);
  console.log(`  homeserver pubkey : ${args.homeserver}`);
  console.log(`  homeserver URL    : ${args['homeserver-url']}`);
  console.log(`  relay             : ${args.relay}`);
  console.log(`  capabilities      : ${args.caps}`);

  // Lazy import: --help must work without node_modules installed.
  const { Pubky, AuthFlowKind } = await import('@synonymdev/pubky');

  const pubky = new Pubky();
  const flow = pubky.startAuthFlow(args.caps, AuthFlowKind.signin(), args.relay);

  // The authorization URL contains a short-lived client_secret; it is printed
  // for the operator to scan and is never written to disk.
  console.log('\nScan this pubkyauth URL with Pubky Ring (no terminal QR available — see --help):');
  console.log(`\n${flow.authorizationUrl}\n`);
  console.log('Awaiting approval…');

  let session;
  try {
    session = await flow.awaitApproval();
  } catch (error) {
    console.error(`auth flow failed: ${error?.message ?? error}`);
    process.exit(1);
  }

  const userZ32 = session.info.publicKey.z32();
  console.log(`signed in as ${userZ32}`);
  console.log(`granted capabilities: ${JSON.stringify(session.info.capabilities)}`);

  // The SDK routes data traffic via pkdns; warn if the operator's identity is
  // not actually on the homeserver they targeted.
  try {
    const actual = await pubky.getHomeserverOf(session.info.publicKey);
    if (!actual) {
      console.warn('warning: could not resolve a homeserver for this identity via pkdns');
    } else if (actual.z32() !== args.homeserver) {
      console.warn(`warning: identity's actual homeserver is ${actual.z32()}, not ${args.homeserver}`);
    }
  } catch (error) {
    console.warn(`warning: homeserver resolution failed: ${error?.message ?? error}`);
  }

  const base = `https://_pubky.${userZ32}`;

  // One attempt per op, never retried: a silently retried PUT would hide a
  // flaky or partially-enforced write path, which is exactly what this probe
  // is meant to expose. Raw fetch (same SDK client / cookie jar as the
  // session) so the true HTTP status and body are recorded.
  async function op(method, path, body) {
    try {
      const res = await pubky.client.fetch(`${base}${path}`, {
        method,
        credentials: 'include',
        ...(body === undefined
          ? {}
          : { body: JSON.stringify(body), headers: { 'content-type': 'application/json' } }),
      });
      const text = truncate(await res.text());
      console.log(`${method} ${path} -> ${res.status}${text ? ` ${text}` : ''}`);
      return { status: res.status, body: text };
    } catch (error) {
      const status = error?.data?.statusCode ?? 'ERR';
      const text = truncate(error?.message ?? String(error));
      console.log(`${method} ${path} -> ${status} ${text}`);
      return { status, body: text };
    }
  }

  if (args['check-durability'] !== undefined) {
    const id = args['check-durability'];
    const path = `/priv/pubky.app/durability-probe/${id}.json`;
    const result = await op('GET', path);
    if (result.status === 200) {
      console.log(`durability record FOUND: ${path}`);
      console.log(`body: ${result.body}`);
    } else {
      console.log(`durability record NOT FOUND: ${path} (status ${result.status})`);
    }
    process.exit(result.status === 200 ? 0 : 1);
  }

  const probeId = randomUUID();
  const probedAt = new Date().toISOString();
  const payload = { probe: 'production-write-probe', id: probeId, at: probedAt };
  const paths = [
    `/pub/pubky.app/marketplace/v1/probe/${probeId}.json`,
    `/priv/pubky.app/marketplace/v1/probe/${probeId}.json`,
    `/pub/paykit/v0/probe/${probeId}.json`,
    `/pub/locks.app/probe/${probeId}.json`,
    `/priv/locks.app/probe/${probeId}.json`,
  ];

  const rows = [];
  for (const path of paths) {
    const put = await op('PUT', path, payload);
    const get = await op('GET', path);
    const del = await op('DELETE', path);
    const notes = [
      ...new Set([classify(put.status, put.body), classify(get.status, get.body), classify(del.status, del.body)]),
    ].filter(Boolean);
    rows.push([path, put.status, get.status, del.status, notes.join('; ') || '-']);
  }

  printTable(rows);

  if (args['seed-durability']) {
    // Same record shape as src/test/live/priv-durability-probe.live.ts.
    const seededAt = new Date().toISOString();
    const durabilityId = `${Date.parse(seededAt)}-0`;
    const record = { probe: 'priv-durability', seededAt, index: 0, nonce: randomUUID() };
    const result = await op('PUT', `/priv/pubky.app/durability-probe/${durabilityId}.json`, record);
    if (result.status >= 200 && result.status < 300) {
      console.log(`\ndurability probe seeded with id: ${durabilityId}`);
      console.log(`re-check later with: --check-durability ${durabilityId}`);
    } else {
      console.log(`\ndurability probe seed FAILED (status ${result.status})`);
      process.exit(1);
    }
  }
}

main().catch((error) => {
  console.error(`probe failed: ${error?.message ?? error}`);
  process.exit(1);
});
