/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 * Do not redefine these contracts. Chosen over a `file:` dependency so
 * `npm run build` does not need a second checkout of pubky-ai-bot-pubchi.
 */

export {
  type ExecutionScope,
  ExecutionScopeSchema,
  parsePubchiAnswerV1,
  type PubchiAnswerV1,
  PubchiAnswerV1Schema,
  type PubchiEvidenceV1,
  PubchiEvidenceV1Schema,
} from './answer';
export {
  parsePubchiBotV1,
  type PubchiBotV1,
  PubchiBotV1Schema,
} from './bot';
export { bodySha256, bytesToHex, canonicalize, canonicalJson, hexToBytes, SHA256_HEX_RE, sha256Hex } from './canonical';
export { err, ERROR_CODES, type ErrorCode, ok, type ParseErr, type ParseOk, type ParseResult } from './codes';
export {
  DEFAULT_SEND_PUBLIC_WEB_CONTEXT,
  parsePubchiConfigV1,
  type PubchiConfigV1,
  PubchiConfigV1Schema,
} from './config';
export { contextForRequest, parsePubchiOwnerContextV1, type PubchiOwnerContextV1,PubchiOwnerContextV1Schema } from './context';
export {
  delegationPath,
  delegationUri,
  DEVICE_DELEGATION_MAX_SECONDS,
  type DeviceDelegationV1,
  DeviceDelegationV1Schema,
  parseDeviceDelegationV1,
  signDeviceDelegationV1,
  unsignedDelegationBytes,
  type UnsignedDeviceDelegationV1,
  verifyDeviceDelegationV1,
} from './delegation';
export { verifyEd25519, verifyPubkySignature } from './ed25519';
export {
  type CommonEnvelopeV1,
  CommonEnvelopeV1Schema,
  envelopeFields,
  parseCommonEnvelopeV1,
  SCHEMA_NAMES,
  type SchemaName,
} from './envelope';
export {
  APP_FEED_CONTENT,
  APP_FEED_REACH,
  APP_SUPPORTED_CONTENT,
  APP_SUPPORTED_LAYOUT,
  APP_SUPPORTED_REACH,
  APP_SUPPORTED_SORT,
  type FeedDraftV2,
  type FeedMappingV2,
  type FeedProposalV1,
  FeedProposalV1Schema,
  type FeedProposalV2,
  FeedProposalV2Schema,
  parseFeedProposal,
  parseFeedProposalV1,
  parseFeedProposalV2,
} from './feed';
export { FORBIDDEN_CATEGORIES, scanForbidden, scanForbiddenPublicState } from './forbidden';
export { type ManifestV1, ManifestV1Schema, parseManifestV1 } from './manifest';
export { MemoryNonceStore, type NonceStore } from './nonce';
export { parseBySchema } from './parse';
export {
  ALLOWLISTED_PATH_PATTERNS,
  botObjectUri,
  botProfileUri,
  botUri,
  feedDefinitionPath,
  followerSnapshotPath,
  isAllowlistedPath,
  ownerBindingPath,
  ownerBindingsUri,
  ownerBindingUri,
  PATHS,
  PUBCHI_APP,
  PUBKY_APP,
  requestBindingPath,
  runReceiptPath,
  suggestionPath,
} from './paths';
export { isPubkyId, parsePubkyId, PUBKY_ID_RE, pubkyPublicBytes } from './pubky';
export { parseQueryResultV1, type QueryResultV1, QueryResultV1Schema } from './query';
export {
  CLOCK_SKEW_SECONDS,
  type OwnerContextV2,
  parseRequestBindingV1,
  parseRequestObjectV1,
  parseRequestObjectV2,
  PHASE0_PURPOSES,
  type Phase0Purpose,
  REQUEST_TTL_SECONDS,
  type RequestBindingV1,
  RequestBindingV1Schema,
  type RequestObjectV1,
  RequestObjectV1Schema,
  type RequestObjectV2,
  RequestObjectV2Schema,
  signRequestObjectV1,
  signRequestObjectV2,
  unsignedBytes,
  unsignedBytesV2,
  type UnsignedRequestObjectV1,
  type UnsignedRequestObjectV2,
  type VerifiedRequest,
  type VerifyRequestInput,
  verifyRequestObjectV1,
  type VerifySignedRequestInput,
  verifySignedRequestObjectV1,
} from './request';
export {
  type OwnerBindingV1,
  OwnerBindingV1Schema,
  parseOwnerBindingV1,
  parseTenantV1,
  PHASE0_BRAIN,
  PHASE0_BUDGETS,
  PHASE0_TIER,
  type TenantV1,
  TenantV1Schema,
} from './tenant';
