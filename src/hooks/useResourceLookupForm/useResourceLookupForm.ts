'use client';

import { zodResolver } from '@hookform/resolvers/zod';
import { useForm, type UseFormReturn } from 'react-hook-form';
import {
  type ResourceLookupFormData,
  resourceLookupFormDefaults,
  resourceLookupFormSchema,
} from './useResourceLookupForm.types';

type UseResourceLookupFormResult = {
  form: UseFormReturn<ResourceLookupFormData>;
  submit: () => Promise<boolean>;
};

export function useResourceLookupForm(onSubmit: (uri: string) => void): UseResourceLookupFormResult {
  const form = useForm<ResourceLookupFormData>({
    resolver: zodResolver(resourceLookupFormSchema),
    defaultValues: resourceLookupFormDefaults,
    mode: 'onChange',
  });

  const submit = async (): Promise<boolean> => {
    let submitted = false;
    await form.handleSubmit((data) => {
      onSubmit(data.uri.trim());
      submitted = true;
    })();
    return submitted;
  };

  return { form, submit };
}
