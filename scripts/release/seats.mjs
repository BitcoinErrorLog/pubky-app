// Shared setup for the release proof scripts: proof seats, evidence folder, and the Shop's sign-in capabilities.
//
// Seats come from the environment only. Each seat is either a hex secret or an encrypted pubky.org/recovery
// backup file plus its passphrase:
//   PROOF_SEAT_SECRET_HEX | PROOF_SELLER_RECOVERY_FILE   seller seat
//   PROOF_BUYER_SECRET_HEX | PROOF_BUYER_RECOVERY_FILE   buyer seat
//   PROOF_RECOVERY_PASSPHRASE                            passphrase for the backup files
//   PROOF_SELLER_PREFIX, PROOF_BUYER_PREFIX              optional: the run stops unless the seat's pubky starts with it
// Seat files and secrets never live in this repository.
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, isAbsolute, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const repoRequire = createRequire(resolve(REPO_ROOT, 'package.json'));
const { Keypair } = repoRequire('@synonymdev/pubky');

export const prefix = (z32) => `${String(z32 ?? '').slice(0, 8)}…`;

// The proof must assert the capabilities the checked-out release requests, so it reads them from source.
export function shopCapabilities() {
  if (process.env.PROOF_CAPABILITIES) return process.env.PROOF_CAPABILITIES;
  const source = readFileSync(resolve(REPO_ROOT, 'src/config/app.ts'), 'utf8');
  const match = source.match(/export const CAPABILITIES = '([^']+)'/);
  if (!match) throw new Error('CAPABILITIES not found in src/config/app.ts; set PROOF_CAPABILITIES');
  return match[1];
}

// Evidence holds screenshots and network logs, so it stays outside the checkout.
export function evidenceDir() {
  const value = process.env.PROOF_EVIDENCE;
  if (!value) throw new Error('set PROOF_EVIDENCE to a release evidence folder outside this repository');
  const dir = resolve(value);
  const inside = relative(REPO_ROOT, dir);
  if (!inside || (!inside.startsWith('..') && !isAbsolute(inside))) {
    throw new Error(`PROOF_EVIDENCE must be outside the repository (${REPO_ROOT})`);
  }
  return dir;
}

function loadSeat(role, hexVar, fileVar, prefixVar) {
  let keypair;
  if (process.env[hexVar]) {
    keypair = Keypair.fromSecret(new Uint8Array(Buffer.from(process.env[hexVar], 'hex')));
  } else if (process.env[fileVar]) {
    const passphrase = process.env.PROOF_RECOVERY_PASSPHRASE;
    if (!passphrase) throw new Error(`set PROOF_RECOVERY_PASSPHRASE to open ${fileVar}`);
    keypair = Keypair.fromRecoveryFile(new Uint8Array(readFileSync(process.env[fileVar])), passphrase);
  } else {
    throw new Error(`set ${hexVar} or ${fileVar} for the ${role} seat`);
  }
  const expected = process.env[prefixVar];
  const pubky = keypair.publicKey.z32();
  if (expected && !pubky.startsWith(expected))
    throw new Error(`${role} seat is ${prefix(pubky)}, expected ${expected}`);
  return keypair;
}

export const loadSellerSeat = () =>
  loadSeat('seller', 'PROOF_SEAT_SECRET_HEX', 'PROOF_SELLER_RECOVERY_FILE', 'PROOF_SELLER_PREFIX');
export const loadBuyerSeat = () =>
  loadSeat('buyer', 'PROOF_BUYER_SECRET_HEX', 'PROOF_BUYER_RECOVERY_FILE', 'PROOF_BUYER_PREFIX');
export const seatSource = () => (process.env.PROOF_SEAT_SECRET_HEX ? 'hex secret' : 'recovery file');
