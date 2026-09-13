import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const ARTIFACT_HASHES = {
  'contracts/endpoints.json': '4946005e24393b650248687c5f659b30c599456b182de291ebae1ee0fc2d1f1e',
  'contracts/samples/confirm.json': 'b78586366a46d7061e630f436afdc01779c24a8a9315be62413bfdbcd8977bbd',
  'contracts/samples/resolve.json': '8a7a03c2713b61b08914cd50fa146307753f5175d49b87918ee11a58f568f6af',
  'contracts/samples/projections.json': 'cf14b6ab8c83ee8d6e289c74610db5f3b409b2f5dfd84fde8b91137f1e1cfb99',
  'contracts/state-machines.json': '4996d49cb76e89a6fe5c5c62b6ed5f65dc584bdb612cea9a9012447f2a7d1491',
} as const;

describe('vendored marketplace contracts', () => {
  it('pins every service artifact to its source hash', () => {
    for (const [relativePath, expectedHash] of [
      ['contracts/endpoints.json', ARTIFACT_HASHES['contracts/endpoints.json']],
      ['contracts/samples/confirm.json', ARTIFACT_HASHES['contracts/samples/confirm.json']],
      ['contracts/samples/resolve.json', ARTIFACT_HASHES['contracts/samples/resolve.json']],
      ['contracts/samples/projections.json', ARTIFACT_HASHES['contracts/samples/projections.json']],
      ['contracts/state-machines.json', ARTIFACT_HASHES['contracts/state-machines.json']],
    ] as const) {
      const bytes = readFileSync(`src/libs/commerce/${relativePath}`);
      expect(createHash('sha256').update(bytes).digest('hex'), relativePath).toBe(expectedHash);
    }
  });
});
