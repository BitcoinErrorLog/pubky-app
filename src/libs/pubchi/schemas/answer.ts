/**
 * Vendored from @pubky/pubchi-schemas (pubky-ai-bot-pubchi).
 * Source commit: bbf8a73
 */

import { z } from 'zod';
import { err, ok, type ParseResult } from './codes';
import { isPubkyId } from './pubky';
import { ToolTraceSummaryV1Schema } from './query';
import { fromZod, zPubky, zUnix, zVersion1 } from './zod';

const PUBKY_APP_URI = /^pubky:\/\/([ybndrfg8ejkmcpqxot1uwisza345h769]{52})\/pub\/pubky\.app\/[^/?#]+(?:\/[^/?#]+)*$/;

const evidenceUri = z.string().refine(
  (uri) => {
    const match = uri.match(PUBKY_APP_URI);
    return match !== null && isPubkyId(match[1]);
  },
  { message: 'URI_FORBIDDEN' },
);

const EvidenceSectionSchema = z.enum(['followed_posts', 'replies_to_you', 'tags_on_you']);

const ContinuationSchema = z
  .object({
    since: z.string().datetime({ offset: true }),
    until: z.string().datetime({ offset: true }),
    complete: z.boolean(),
    skipped: z.number().int().nonnegative(),
  })
  .strict();

export const ExecutionScopeSchema = z
  .object({
    time: z
      .object({
        since_ms: z.number().int().nonnegative(),
        until_ms: z.number().int().nonnegative(),
        label: z.string().max(80),
        source: z.enum(['explicit', 'default', 'tool']),
      })
      .strict()
      .nullable(),
    graph: z
      .object({
        kind: z.enum(['whole_graph', 'owner_network', 'none']),
        hops: z.union([z.literal(1), z.literal(2), z.literal(3)]).optional(),
      })
      .strict(),
    filters: z.array(z.string().max(60)).max(10),
    complete: z.boolean(),
  })
  .strict();

export type ExecutionScope = z.infer<typeof ExecutionScopeSchema>;

export const PubchiCitationSchema = z
  .object({
    kind: z.enum(['knowledge', 'web']),
    title: z.string().min(1).max(160),
    url: z
      .string()
      .max(512)
      .url()
      .refine((value) => value.startsWith('https://'), 'citation URLs must use HTTPS'),
    source_id: z.string().max(80).optional(),
    corpus_version: z.string().max(40).optional(),
    snippet: z.string().max(240).optional(),
  })
  .strict();

export const PubchiEvidenceV1Schema = z
  .object({
    kind: z.enum(['user', 'post', 'tag', 'claim']),
    label: z.string().min(1).max(80),
    uri: evidenceUri,
    claimants: z.array(zPubky).max(10),
    claimant_count: z.number().int().nonnegative().max(10_000),
    in_your_graph: z.boolean().nullable(),
    section: EvidenceSectionSchema.optional(),
  })
  .strict();

export const PubchiAnswerV1Schema = z
  .object({
    schema: z.literal('pubchi-answer'),
    version: zVersion1,
    bot: zPubky,
    owner: zPubky,
    generated_at: zUnix,
    run_id: z.string().regex(/^[A-Za-z0-9_-]{1,64}$/),
    purpose: z.literal('ask'),
    question: z.string().min(1).max(500),
    summary: z.string().max(1200),
    evidence: z.array(PubchiEvidenceV1Schema).max(50),
    sources: z.array(evidenceUri).max(50),
    tool_trace_summary: ToolTraceSummaryV1Schema,
    policy_version: z.literal(1),
    continuation: ContinuationSchema.optional(),
    scope: ExecutionScopeSchema.optional(),
    basis: z.enum(['graph', 'knowledge', 'model', 'mixed']).optional(),
    citations: z.array(PubchiCitationSchema).max(8).optional(),
  })
  .strict();

export type PubchiEvidenceV1 = z.infer<typeof PubchiEvidenceV1Schema>;
export type PubchiAnswerV1 = z.infer<typeof PubchiAnswerV1Schema>;
export type PubchiCitation = z.infer<typeof PubchiCitationSchema>;
export type PubchiAnswerBasis = NonNullable<PubchiAnswerV1['basis']>;

export function parsePubchiAnswerV1(input: unknown): ParseResult<PubchiAnswerV1> {
  const parsed = fromZod(PubchiAnswerV1Schema, input);
  if (!parsed.ok) return parsed;
  if (parsed.value.owner !== parsed.value.bot && !isPubkyId(parsed.value.owner)) return err('INVALID_PUBKY');
  if (parsed.value.basis !== undefined) {
    const graphKind = parsed.value.scope?.graph.kind;
    if (parsed.value.basis !== 'mixed' && graphKind !== 'none') return err('SCHEMA_INVALID');
    if (parsed.value.basis === 'model' && parsed.value.citations?.length) return err('SCHEMA_INVALID');
  }
  return ok(parsed.value);
}
