import { z } from 'zod';

export const resourceLookupFormSchema = z.object({
  uri: z.url().refine((value) => {
    const protocol = new URL(value).protocol;
    return protocol === 'http:' || protocol === 'https:';
  }, 'Enter a valid HTTP or HTTPS URL'),
});

export type ResourceLookupFormData = z.infer<typeof resourceLookupFormSchema>;

export const resourceLookupFormDefaults: ResourceLookupFormData = {
  uri: '',
};
