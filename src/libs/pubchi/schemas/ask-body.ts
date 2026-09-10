import { z } from 'zod';
import { fromZod } from './zod';
import type { ParseResult } from './codes';
import { PubchiCitationSchema, type PubchiAnswerBasis } from './answer';

export const MAX_CONVERSATION_TURNS = 8;
export const MAX_CONVERSATION_TURN_CODE_POINTS = 600;
export const MAX_CONVERSATION_CODE_POINTS = 4_800;

const codePointLength = (value: string) => Array.from(value).length;

export const ConversationTurnSchema = z
  .object({
    role: z.enum(['user', 'assistant']),
    text: z.string().refine((value) => codePointLength(value) <= MAX_CONVERSATION_TURN_CODE_POINTS),
    basis: z.enum(['graph', 'knowledge', 'model', 'mixed']).optional(),
    citations: z.array(PubchiCitationSchema).max(8).optional(),
  })
  .strict();

export const ConversationSchema = z
  .object({ turns: z.array(ConversationTurnSchema).max(MAX_CONVERSATION_TURNS) })
  .strict()
  .superRefine((conversation, ctx) => {
    let total = 0;
    conversation.turns.forEach((turn, index) => {
      total += codePointLength(turn.text);
      if (turn.role !== (index % 2 === 0 ? 'user' : 'assistant')) {
        ctx.addIssue({
          code: z.ZodIssueCode.custom,
          path: ['turns', index, 'role'],
          message: 'conversation turns must alternate, starting with user',
        });
      }
    });
    if (total > MAX_CONVERSATION_CODE_POINTS) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['turns'], message: 'conversation is too large' });
    }
  });

export type ConversationTurn = z.infer<typeof ConversationTurnSchema>;
export type Conversation = z.infer<typeof ConversationSchema>;
export type ConversationBasis = PubchiAnswerBasis;

export function parseConversation(input: unknown): ParseResult<Conversation> {
  return fromZod(ConversationSchema, input);
}
