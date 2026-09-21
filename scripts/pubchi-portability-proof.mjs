#!/usr/bin/env node
/**
 * Launches the App-harness live proof (scripts/pubchi-portability-proof.ts)
 * through vitest so PubchiApplication.exportPubchiState / importPubchiState
 * run against staging A then local pubky-testnet B. Extra argv is forwarded after `--`.
 */
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const vitest = join(repo, 'node_modules/.bin/vitest');
const result = spawnSync(
  vitest,
  ['run', '--config', 'scripts/vitest.portability-proof.config.ts', '--', ...process.argv.slice(2)],
  {
    cwd: repo,
    stdio: 'inherit',
    env: { ...process.env, COPYFILE_DISABLE: '1' },
  },
);
process.exit(result.status ?? 1);
