# Authenticating the Browser to the Transaction Service

How the app proves who it is to the Marketplace Transaction Service, and why the first design was wrong.

## The problem with challenge–response signing

The transaction service was originally built to authenticate with an ed25519 challenge–response handshake: the service issues a nonce, the client signs it with the user's key, the service verifies the signature against the z-base-32 pubky.

**The browser cannot do that.** In the normal Pubky App flow the user signs in through Pubky Ring, an external signer device, and the app never holds the secret key. The `Keypair` class in `@synonymdev/pubky` exposes `publicKey` but no signing method at all, and the only in-app path that even produces a `Keypair` is recovery-file import.

So a client-side signature is not available, and no amount of client work makes it available. The design has to change, not the client.

## The mechanism Pubky actually provides

`AuthToken` — described in the SDK as a "signed, time-bound proof of key ownership." It is produced by the auth flow's `awaitToken()`, which blocks until the user approves on their signer device. Its own documentation states the intended use:

```js
const bytes = token.toBytes();
await fetch('/api/verify', { method: 'POST', body: bytes });
```

and on the server:

```js
const token = AuthToken.verify(bytes); // throws on failure
token.publicKey; // the authenticated pubky
token.capabilities; // what the flow requested
```

The token serializes to a canonical postcard binary form. Verification is a pure function of the bytes — no round-trip to the signer, no homeserver call.

This is the correct boundary: the signer device holds the key and signs, the service verifies a signature it did not have to trust the client for.

## Design

1. The app obtains an `AuthToken` for the marketplace service through the Pubky auth flow and sends `token.toBytes()` to `POST /v1/auth/sessions`.
2. The service verifies the token, extracts `publicKey` as the actor and `capabilities` as the granted scope, and issues its own opaque short-lived session token for subsequent requests.
3. The service enforces replay protection itself rather than relying on the token being time-bound: each token is single-use, bound to its own identifier and expiry, and rejected outside a bounded acceptance window.
4. The existing challenge endpoint is removed. It cannot be satisfied by any real client, so keeping it would be dead surface that implies a capability the system does not have.

The service's own session tokens continue to work as they do today (opaque, hashed at rest, TTL, Bearer on `/v1/commands`), so only the establishment step changes.

## Consequence to weigh

`awaitToken()` requires a signer approval. If the marketplace session is established separately from the app's existing sign-in, the user sees a second Pubky Ring prompt the first time they do something transactional.

That is a real UX cost and it is a product decision, not a technical one. Two directions:

- **Accept it.** A distinct approval for "this app may transact on my behalf in the marketplace" is arguably the honest thing to show a user, and it keeps marketplace authority scoped separately from social write access.
- **Fold it into sign-in.** Request the marketplace capability during the existing auth flow so there is one approval. Cheaper UX, but it grants marketplace authority to every user at sign-in whether or not they ever use it.

Until this is decided, the app stays on the sandbox service and marketplace outcomes remain simulated. This is the last blocker between the durable service and authoritative order and auction outcomes.

## What is not affected

Publishing shops, listings, and media is unrelated — those are signed homeserver writes using the app's existing session and `/pub/pubky.app/:rw` grant. They work today and need no new authentication.
