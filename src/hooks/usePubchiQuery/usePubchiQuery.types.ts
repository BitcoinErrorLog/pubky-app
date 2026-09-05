import { z } from 'zod';

export const QUERY_FORM_FIELDS = {
  QUESTION: 'question',
} as const;

export const pubchiQueryFormSchema = z.object({
  [QUERY_FORM_FIELDS.QUESTION]: z.string().trim().min(1, { message: 'Enter a question.' }).max(500),
});

export type PubchiQueryFormData = z.infer<typeof pubchiQueryFormSchema>;

export const pubchiQueryFormDefaults: PubchiQueryFormData = {
  [QUERY_FORM_FIELDS.QUESTION]: '',
};
