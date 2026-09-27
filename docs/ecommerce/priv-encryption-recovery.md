# Reading encrypted marketplace data without the marketplace

The Shop encrypts your watchlist and order receipts before they reach your homeserver. The key is a random 32-byte data key that the marketplace service holds sealed and releases only to your signed-in session. **Settings → Privacy and Safety → Export recovery key** downloads that key. With the file and your homeserver data, you can read everything offline, even if the marketplace service no longer exists.

Anyone who has the file can read the same data. Keep it offline.

## The recovery key file

```json
{
  "format": "pubky-priv-recovery-key/v1",
  "enc": "pubky-priv-aead/v1",
  "owner": "<your pubky>",
  "currentKeyId": "<32 hex>",
  "keys": [{ "keyId": "<32 hex>", "key": "<32 bytes, base64url without padding>" }]
}
```

`keys` is oldest first. Records name the key they were sealed under by `keyId`.

## Where the data is

Encrypted records live under `/priv/pubky.app/marketplace/v2/s/` on your homeserver. Only your own session can list or read `/priv`. Each record is a JSON envelope:

```json
{ "enc": "pubky-priv-aead/v1", "kid": "<keyId>", "nonce": "<24 bytes, base64url>", "ct": "<ciphertext, base64url>" }
```

## The recipe

For each data key:

```
record key = HKDF-SHA256(ikm = data key, salt = "pubky-priv-aead/v1", info = "record", length = 32)
path key   = HKDF-SHA256(ikm = data key, salt = "pubky-priv-aead/v1", info = "path",   length = 32)
```

Paths use the path key of the **first** key in `keys`:

```
family segment = base64url(HMAC-SHA256(path key, "family|" + family))
entry segment  = base64url(HMAC-SHA256(path key, "id|" + family + "|" + id))
path           = /priv/pubky.app/marketplace/v2/s/{family segment}/{entry segment}
```

| Record                    | family                    | id                    |
| ------------------------- | ------------------------- | --------------------- |
| Watchlist                 | `watchlist`               | `watchlist`           |
| Order receipt             | `order_receipt`           | the receipt id (UUID) |
| Activity badge checkpoint | `attention_seen/activity` | the entry's name      |
| Orders badge checkpoint   | `attention_seen/orders`   | the entry's name      |

Badge checkpoints are listed entries: each is named by a random 32-character hex id (not an HMAC) directly under its family directory, and that name is its `id`. The plaintext is `{ "version": 1, "seenAt": <ms> }`; the checkpoint is the largest `seenAt`.

To open a record, find the key whose `keyId` equals the envelope's `kid`. Decrypt `ct` with XChaCha20-Poly1305 under that key's record key, the envelope's `nonce`, and associated data:

```
{owner}|{family}|{id}|{kid}
```

The plaintext is the UTF-8 JSON of the original document: a watchlist record, or an order receipt with its `pubky-order-receipt+v1` attestation. Verify the receipt attestation offline with the receipt-verification recipe in the specs.

Receipts are addressed by receipt id. When you do not know the ids, list the receipt family directory: each entry name is `entry segment` for some receipt id, and the decrypted record carries its `receiptId`, so try each entry against the ids you expect, or recompute the segment for each id you hold.

## Example (Node.js 20+)

```js
import { createHmac, hkdfSync } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { xchacha20poly1305 } from '@noble/ciphers/chacha.js';

const recovery = JSON.parse(readFileSync('pubky-marketplace-recovery-key.json', 'utf8'));
const subkey = (key, info) =>
  new Uint8Array(hkdfSync('sha256', Buffer.from(key, 'base64url'), 'pubky-priv-aead/v1', info, 32));
const segment = (pathKey, input) => createHmac('sha256', pathKey).update(input).digest('base64url');

const pathKey = subkey(recovery.keys[0].key, 'path');
const watchlistPath = `/priv/pubky.app/marketplace/v2/s/${segment(pathKey, 'family|watchlist')}/${segment(pathKey, 'id|watchlist|watchlist')}`;

function open(envelope, family, id) {
  const entry = recovery.keys.find((k) => k.keyId === envelope.kid);
  const aad = new TextEncoder().encode(`${recovery.owner}|${family}|${id}|${envelope.kid}`);
  const plaintext = xchacha20poly1305(
    subkey(entry.key, 'record'),
    Buffer.from(envelope.nonce, 'base64url'),
    aad,
  ).decrypt(Buffer.from(envelope.ct, 'base64url'));
  return JSON.parse(new TextDecoder().decode(plaintext));
}
```
