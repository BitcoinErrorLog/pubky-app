import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useResourceLookupForm } from './useResourceLookupForm';

describe('useResourceLookupForm', () => {
  it('submits HTTP URLs', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useResourceLookupForm(onSubmit));

    act(() => {
      result.current.form.setValue('uri', 'https://example.com/path');
    });
    let submitted = false;
    await act(async () => {
      submitted = await result.current.submit();
    });

    expect(submitted).toBe(true);
    expect(onSubmit).toHaveBeenCalledWith('https://example.com/path');
  });

  it('rejects malformed and non-HTTP URLs without submitting', async () => {
    const onSubmit = vi.fn();
    const { result } = renderHook(() => useResourceLookupForm(onSubmit));

    act(() => {
      result.current.form.setValue('uri', 'javascript:alert(1)');
    });
    let submitted = false;
    await act(async () => {
      submitted = await result.current.submit();
    });

    expect(submitted).toBe(false);
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
