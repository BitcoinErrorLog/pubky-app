import { z } from 'zod';

export const ENROLL_FORM_FIELDS = {
  BOT: 'bot',
} as const;

export const enrollPubchiFormSchema = z.object({
  [ENROLL_FORM_FIELDS.BOT]: z
    .string()
    .trim()
    .regex(/^[ybndrfg8ejkmcpqxot1uwisza345h769]{52}$/, { message: 'Enter a 52-character z-base-32 bot pubky.' }),
});

export type EnrollPubchiFormData = z.infer<typeof enrollPubchiFormSchema>;

export const enrollPubchiFormDefaults: EnrollPubchiFormData = {
  [ENROLL_FORM_FIELDS.BOT]: '',
};
