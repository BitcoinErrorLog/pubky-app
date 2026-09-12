DESIGN STATUS: STOPPED AT ROUND CAP — REPORT ONLY

# Encrypted buyer delivery address to seller

**Scope.** This is design-only, not implementation-approved. It applies to Shop `mp-ux` at `17a21e77` and marketplace-service at `c37481c`, covering shipped ordinary/drop checkout, auction-winner conversion, and accepted-offer conversion before those shipped paths enable. Marketplace derives commercial authority, stores buyer ciphertext only, and never decrypts it. Seller address access requires key proof and payment; pickup is address-free.

## A. Binding decisions and review trace

| Decision | Binding design |
| --- | --- |
| J1/J1b | Official Shippo Shipping Elements runs in the seller browser. A seller-controlled broker holds Shippo authority and mints a 12-hour JWT, but never receives address data. Marketplace has neither. |
| J2 | Legacy plaintext is irreversibly erased at service-time `terminal_at + 90d`; no legal hold; disputes retain metadata only. |
| J3/J3b | Seller keys are device-bound; no recovery/import/export. Post-payment key loss is manual review, never replacement or plaintext. |
| J4 | Without an active seller key, shipped checkout is unavailable; pickup remains; no fallback/choice. |
| J5 | Envelopes apply to ordinary, drop, auction-win, and accepted-offer shipped origins. |
| J6 | Marketplace receives no destination or address-derived/coarse shipping quote. |
| J7 | TOFU changes require explicit buyer confirmation. |
| J8/J8b | Before payment, seller proves key possession without address access. A single service-clocked 15-minute unpaid-drop revision is the only replacement exception. |

| Review finding | Disposition |
| --- | --- |
| Superior r2 P1: client authority / UUID | Server-derived `PreparedOrder`, immutable facts, prepare/commit CAS: §§C–D. |
| Superior r2 P1: incomplete AAD / hash | Exact framed facts hash, AAD/HKDF, key and boundary validation: §F. |
| Superior r2 P1: undefined state semantics | Object-by-object transition table with precondition/CAS/idempotency/invariants: §D. |
| Superior r2 P1: early address access / J8 | All-origin encrypted proof challenge; payment requires proof; bounded r2: §E. |
| Superior r2 P1: Shippo authority/leak | Browser-direct Elements, broker non-reader, metadata allowlist: §G. |
| Kimi residual: Pubky CAS assumption | Immutable root-signed hash-addressed key chain; no pointer/CAS: §H. |
| Kimi residual: purge/backup guarantee | Independent external DEK service, cutover inventory, tombstone/restore design: §I. |
| Kimi residual: telemetry/label exposure | Explicit service/client denylist and tests: §§B, G, J. |

## B. Readers, non-readers, and current wire facts

Current service wire facts: terminal order states are `completed`, `cancelled`, and `refunded_external`. `closed` and `processing` are declared unreachable and must never gate erasure. Payment states are `awaiting_entitlement`, `detected`, `confirmed`, `expired`, and `manual_review`; `manual_review` is not terminal and a resolution moves the order/payment onward. Auction close server-creates a winner order/reservation. Accepted offers currently stop at a reservation; V25 must add the conversion before shipped fulfillment. Notifications are recipient-scoped polling only. `fulfillment.ship` is seller-authenticated, expected-revision CAS. A late Bitcoin payment after cancellation/refund moves to `refunded_external` and never reacquires inventory.

Plaintext is visible only to buyer entry/local retention; seller browser after proof, payment, authorized envelope fetch, and decrypt; seller browser/OS print destinations; and Shippo directly from seller browser. The broker receives only seller authentication material and returns a JWT; it never receives plaintext, address events, rates, labels, or Shippo objects. Marketplace, DB operators, homeserver operators, public readers, service shipping, service/client logs, analytics, crash reports, notifications and webhooks must not receive plaintext, ciphertext/event bodies, address-derived quote, Shippo object ID, label/packing-slip URL or PDF, raw carrier text, rate/address object, or JWT.

Marketplace may receive only seller-authenticated fulfillment metadata: order ID, expected revision, idempotency event ID, carrier, service level, status, `was_test`, and tracking number. Carrier plus tracking can resolve public shipment progress; this is accepted fulfillment metadata. It cannot alter address, price, parties, source authority, or envelope. The threat model does not prevent malicious intended sellers, seller-browser XSS while material is live, print retention, first-contact key substitution, or unseen-successor withholding by a seller homeserver.

## C. PreparedOrder authority protocol

`PreparedOrder` is a delivery protocol object, not Paykit `preparing`. The service creates it before any buyer encryption. It contains a random opaque `prepare_id`, server UUID, protocol version, origin variant, immutable commercial facts, `facts_hash`, source ID/revision, attempt number, state/version, and service-clock expiry. It is non-public and not an ordinary order projection.

| Origin | Service-derived facts and source action |
| --- | --- |
| Ordinary | Authenticated buyer request is matched to current seller/listing/SKU/variant, price, fulfillment, and available inventory; service holds exact inventory. |
| Drop | Service matches immutable facts and CAS-claims the existing drop claim/inventory authority. |
| Auction winner | Auction close creates winner order/reservation; service holds its winner-only conversion authority. |
| Accepted offer | V25 conversion derives the accepted award reservation; service holds buyer-only accepted-award authority. |

`prepare` returns `prepare_id`, UUID, protocol/origin, immutable public facts, `facts_hash`, expiry, and delivery-key record hash/kid—not an address and not an address-bearing order. Buyer seals only after this response. `commitEnvelope` carries `prepare_id`, envelope, digest, and TOFU confirmation. Transactionally, service locks prepare plus source authority, recomputes facts hash from stored facts, validates actor/state/expiry/envelope/key confirmation and holds, then CASes `PREPARED → ENVELOPE_COMMITTED`. Same prepare/key/digest returns the committed result; a changed digest/key, actor, facts, or expired record rejects. Commit never changes authority facts, UUID, origin, price, parties, listing/SKU/variant, fulfillment, inventory, source revision, or facts hash. Auction/offer cannot pay or fulfill before commit.

## D. State transitions

| Object | Transition | Object/precondition/CAS | Idempotency and must not change |
| --- | --- | --- | --- |
| PreparedOrder | `PREPARED → ENVELOPE_COMMITTED` | Buyer actor; service time before expiry; source held; stored facts hash/digest/key confirmation valid; `UPDATE ... WHERE state=PREPARED AND version=n`. | Same digest/key returns result. Immutable facts/source/UUID unchanged. |
| PreparedOrder | `PREPARED → EXPIRED` | Lock prepare + source; `state=PREPARED`, expiry ≤ service time, expected version. | Release is idempotency-keyed by prepare ID and once only. |
| Ordinary source | held → available | Expired prepare, source ID/revision matches and availability rules hold; source CAS. | Releases once; reprepare only through normal availability/rate limits. |
| Drop source | claimed → released | Expired prepare, exact claim/source revision; source CAS. | Releases once; next attempt is constrained by existing per-buyer claim and outer drop deadline, never an indefinite relock. |
| Auction source | `awarded_envelope_pending → prepared → awarded_envelope_pending` | Same winner, source ID/revision, conversion/payment deadline valid; attempt CAS. | At most 3 prepares; no other buyer; outer expiry releases/marks expired once. |
| Offer source | `accepted_award → prepared → accepted_award` | Same accepted buyer, source ID/revision, 30-minute award deadline valid; attempt CAS. | At most 3 prepares; seller cannot revoke; outer expiry releases/marks expired once. |
| Payment/order | committed → `detected`/`confirmed` | Authorized observer, expected order/payment version, `proof_state=PROVEN`. | Appends payment fact only; never changes delivery/commercial facts. |
| J8 drop | committed → `PROOF_PENDING → REPLACEMENT_OPEN` | Missing/failed proof; unpaid payment state; `replacement_count=0`; lock order+payment+inventory and expected versions. | Opens once; no address release. |
| J8 r2 | `REPLACEMENT_OPEN → ENVELOPE_COMMITTED(r2)` | Buyer; deadline valid; same immutable facts; new active/proven kid; TOFU confirmation; versions match. | Same r2 digest/key returns result; changed retry or r3 rejects. |
| J8 expiry | open → voiding → released | Deadline; payment not detected/confirmed; lock same order/payment/inventory versions. Void supported rail first, then CAS release. | External void event has idempotency key; release once. Late Bitcoin → manual refund, no reclaim/fulfillment. |
| Fulfillment | paid/proven → shipped | Seller actor; payment/proof-complete allowed state; expected order revision CAS; strict metadata allowlist. | Same event ID returns result; cannot mutate address/price/parties. |
| Legacy erase | terminal → erased | State is exactly `completed`, `cancelled`, or `refunded_external`; `terminal_at+90d≤service_now`; expected version. | Key deletion/tombstone occurs once; later dispute cannot restore/extend plaintext. |
| Restore | quarantined → readable | Deletion ledger re-applied to all restored data before reads/replication/export. | Erased address remains unreadable; restore cannot override tombstone. |

## E. Proof, payment ordering, and J8b

For every origin, after envelope commit and before a payment transition, service generates a 32-byte random challenge, five-minute service-clock TTL, and max three proof attempts per challenge/rate window. It uses a distinct ASCII domain `pubky-marketplace.delivery-key-proof/v1`; service creates an ephemeral X25519 keypair and 24-byte nonce, seals the challenge in a strict envelope bound to protocol version, order UUID, seller raw32, epoch record hash, kid, challenge ID, issued/expires times, and purpose. The proof KDF/AAD framing follows §F. Service stores the random plaintext only encrypted or stores a one-use expected digest. Browser must send proof over TLS only.

The seller authenticated endpoint receives the sealed challenge only—not delivery envelope/address—opens it locally with the epoch private key, and returns challenge ID plus the protocol digest. Service compares in constant time, then consumes with `UPDATE ... WHERE challenge_state=ISSUED AND version=n`; identical replay returns the prior proof outcome and never reopens replacement. Only `proof_state=PROVEN` permits payment to move from `awaiting_entitlement` to `detected`/`confirmed`.

For an unpaid drop only, exhausted/missing/failed proof opens one service-clocked 15-minute `REPLACEMENT_OPEN`. Seller first publishes a new epoch record and proves its new kid; buyer refetches, explicitly TOFU-confirms within that window, and commits r2 to unchanged prepared/order facts. Payment and expiry workers lock/CAS the same order/payment/inventory versions. At deadline service voids supported payment rails before release. If payment is detected/confirmed at opening, before r2 CAS, or while voiding, r2 is forbidden and manual review begins. Late unavoidable Bitcoin after release enters manual refund without stock reclaim or fulfillment. Non-drop proof/key failure has no r2 path: unpaid preparation expires by its origin policy; paid state is manual review.

Recipient-scoped polling notifications contain only `proof_required`, `proof_proven`, `replacement_open`, `replacement_committed`, `prepare_expired`, `payment_manual_review`, and stable reason categories. They never carry challenge/envelope/address/event bodies. A malicious seller can withhold proof and burn a bounded buyer opportunity; no protocol can prove refusal, and this is disclosed rather than bypassed by early address access.

## F. Canonical facts hash and delivery envelope

Use SHA-256 over this fixed framed binary `facts_hash` preimage, not JSON:

`u16be(domain_len)||ASCII("pubky-marketplace.prepared-order-facts/v1")||u8(version=1)||u8(origin)||uuid_ascii36||buyer_raw32||seller_raw32||u8(fulfillment)||u8(line_count)||sorted_lines||shipping||total||origin_source`

`origin` is a closed byte enum ordinary/drop/auction-win/accepted-offer; `fulfillment` is closed ship/pickup. `line_count` is 1–32. Every line is `u16be(listing_id_len)||listing_id_ascii||u16be(sku_len)||sku_ascii||u16be(variant_len)||variant_ascii||u64be(quantity)||u64be(amount_minor)||u8(currency_len)||currency_upper_ascii||u8(exponent)`. IDs are 1–128 ASCII bytes, currency is 3 uppercase ASCII bytes, quantity positive, amount nonnegative, exponent 0–18. Lines sort by the complete encoded line, duplicates reject. `shipping` and `total` are option-tagged (`u8(0)` absent; `u8(1)||u64be(amount)||currency||exponent` present) with bounded nonnegative values. `origin_source` is `u16be(id_len)||id_ascii||u64be(revision)||u8(hash_present)||[hash_raw32]`; all fields are mandatory where the origin requires them. Unrecognized tags, non-ASCII, out-of-range values, unsorted/duplicate lines, inconsistent totals, or malformed frame reject. Service recomputes from stored facts at commit.

Pin full preimage bytes and SHA-256 digest vectors for ordinary, drop, auction, and offer in browser and Rust.

The delivery envelope is strict `{v,alg,kid,epk,nonce,ct}`, with `v=1`, X25519/HKDF-SHA-256/XChaCha20-Poly1305, 2,048-byte JSON cap, no unknown/duplicate fields, kid 16–64 decoded bytes, canonical public `epk` exactly 32 bytes, and nonce exactly 24 random bytes. Reject noncanonical X25519 encodings and all-zero DH. New ephemeral scalar/public key and nonce are generated per envelope, never retained; service rejects reused raw epk.

AAD is `u16be(domain_len)||ASCII("pubky-marketplace.delivery-address/v1")||u8(v)||u8(origin)||uuid_ascii36||facts_hash32||buyer_raw32||seller_raw32||u8(kid_len)||kid_raw||u8(line_count)||canonical_listing_ids`; listing IDs are ASCII 1–128, sorted/deduplicated, count 1–32, each length-prefixed. HKDF info is length-framed domain, v, kid and recipient public key. Canonical plaintext ≤1,000 UTF-8 bytes appends `0x80` then zeroes to 512/1,024. Thus 511 → 512, 512 → 1,024, and 1,000 → 1,024; open rejects a missing/final-invalid delimiter, nonzero tail, invalid bucket, or decoded overlimit. Ciphertext is exactly 528/1,040 bytes. Vectors cover all boundaries, malformed/noncanonical keys, all-zero DH, nonce/epk uniqueness, altered AAD/facts, and malformed framing.

## G. Seller-direct Shippo

Shop uses official Shippo Shipping Elements, not custom React shipping UI. Seller-controlled broker authenticates seller, holds long-lived Shippo OAuth/API credentials, CORS-allows only the verified Shop origin with Authorization support, calls `/embedded/authz`, and returns a `Cache-Control: no-store` 12-hour Elements JWT. Browser holds JWT only in memory and sends locally decrypted address directly to Shippo. Broker never receives plaintext/address events/rates/labels/Shippo objects; Shipping Elements callbacks can be address-bearing and stay client-only.

External Shippo documentation is pinned external evidence: it supplies `embedded:carriers` as a scope example and Authorization CORS support. Exact production label scope, account binding, JWT claims, and event surface require sandbox capture before implementation. An external fake is allowed only at the carrier boundary. Sellers without broker configuration use local decrypted packing slip/manual Shippo dashboard; no Marketplace address path results.

## H. Immutable delivery-key chain

Pubky conditional write is unsupported. Each seller device generates a separate Ed25519 delivery-authority root; it is never derived from Pubky identity. X25519 epoch keys are separate. Deterministic canonical record bytes are root-self-signed or successor-signed by that root and stored hash-addressed at `/pub/marketplace.app/delivery-keys/v1/records/<sha256-lowerhex>.cbor`. The dedicated grant is `/pub/marketplace.app/delivery-keys/:w`; broader coverage is accepted.

Each record includes version, root public key, sequence, previous record hash, epoch/kid/X25519 public key, and retired predecessor reference. Root record self-signs. Successors are root-signed, increase sequence by one, name prior hash, and retire their predecessor. Buyer lists/fetches/verifies a complete unique contiguous chain: roots/tips/forks/gaps, bad signatures/hashes, rollback, multiple roots/tips, or retired-kid reappearance fail closed. Returning buyer's root/tip pin detects a seen rollback; first-contact substitution and unseen-successor withholding cannot be detected.

Writer persists one pending local record and retries only identical hash PUT. An unresolved fork has no V1 repair: shipping disables. Root loss means no future valid rotation; epoch key loss disables shipping for that epoch. Retain retired X25519 private keys through all associated nonterminal orders. Ordinary sign-out/identity-clear irreversibly wipes the per-account wrapped bundle and local chain pins; shipping disables and affected paid orders enter manual review. UI requires destructive warning. Use reviewed/pinned WebCrypto or direct dependency only after feature-support evidence; do not rely on transitive tweetnacl.

## I. Destructive legacy plaintext erasure

For legacy migration only, each retained legacy address is encrypted under a unique per-order DEK whose key material lives in an independently backed external key service; DB holds ciphertext plus external key ID only. Live DB DEKs/same-DB wrapped keys do not meet erasure. At exact `terminal_at+90d`, destroy the external key, then tombstone ciphertext. New buyer ciphertext uses no service DEK. Provider selection, immediate deletion semantics, and backup behavior are evidence gates; this design does not name Railway KMS.

Before the guarantee starts, cutover inventories, deletes, or expires every pre-encryption PITR, volume snapshot, manual/logical export, and other plaintext copy; it explicitly accepts loss of plaintext rollback and attests completion. Actual Railway context is roughly four-week PITR and volume schedules up to three months, but actual schedules and manual exports must be inventoried. Already-terminal legacy rows at least 90 days old erase at cutover. Ambiguous terminal history quarantines until event-derived/manual metadata-only resolution—never `created_at` guessing. Backup tombstones alone are access suppression, not erasure.

Restores begin quarantined and reapply the external deletion ledger before any read, replication, indexing, or export. Required negative proof restores a tombstoned legacy row and demonstrates no plaintext can be read. Later disputes/reopens cannot restore or extend plaintext because only the three actual terminal states gate erasure.

## J. Implementation gates and remaining evidence

Every state-changing operation is bound by §D's object/precondition/CAS/idempotency/invariant table. Tests must use real production handlers/components and real crypto wrappers; passing gate requires a deliberate failure. Service/client telemetry tests reject address/event bodies, raw carrier errors, JWTs, object IDs, URLs/PDFs and resolvable label references. Service has no capability to call Shippo or fetch label PDFs for ciphertext orders.

Remaining evidence gates—not owner questions—are: Shippo sandbox JWT/event/scope/account capture; homeserver live append-only PUT/list/get behavior; independent external-key deletion and backup proof; backup inventory/cutover rehearsal; and facts/challenge byte+digest vectors. Final round-3 superior and Kimi reviews must validate these exact boundaries before implementation.

## K. Terminal review disposition — 2026-09-12

The final external Kimi audit returned SHIP with no P0/P1. The binding superior round-3 review returned STOP_DESIGN with five unresolved P1s: PreparedOrder pre-payment inventory authority conflicts with the current no-reservation-before-payment rule; manual-review/late-refund transitions are not reconciled across the pinned service and vendored client contracts; the challenge digest framing remains insufficiently standalone; the purge predicate conflicts with reopen/return transitions; and routine sign-out irreversibly destroys device-only authority/epoch keys and TOFU continuity.

Under the three-round cap and review hierarchy, STOP_DESIGN controls. This document is retained as a report of owner decisions, evidence, attempted mechanisms, and failure boundaries. It does not authorize encrypted shipped fulfillment, seller-key rollout, destructive legacy purge, or implementation. The named evidence probes may be reused only by a newly approved program that changes the safe subset or architecture; they do not reopen this review loop.

DESIGN VERDICT: STOPPED_REPORT_ONLY
