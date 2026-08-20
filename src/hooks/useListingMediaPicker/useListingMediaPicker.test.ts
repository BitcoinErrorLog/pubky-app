import { act, renderHook } from '@testing-library/react';
import type { ChangeEvent } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { asOpaque } from '@/test-utils/type-assertions';
import { type PreparedListingMedia, useListingMediaPicker } from './useListingMediaPicker';

vi.mock('@/libs/image/stripImageMetadata', () => ({
  stripImageMetadata: vi.fn((file: File) => file),
}));

const OWNER = 'y'.repeat(52);

function changeEvent(file: File): ChangeEvent<HTMLInputElement> {
  return asOpaque<ChangeEvent<HTMLInputElement>>({
    target: { files: [file] },
  });
}

describe('useListingMediaPicker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(globalThis.crypto, 'randomUUID').mockReturnValue('018f47d2-6a27-7c23-a49d-6b21bb770120');
    vi.stubGlobal(
      'createImageBitmap',
      vi.fn(async () =>
        asOpaque<ImageBitmap>({
          width: 1200,
          height: 1600,
          close: vi.fn(),
        }),
      ),
    );
  });

  it('sanitizes, hashes, measures, and prepares owner-scoped media', async () => {
    const file = new File([new Uint8Array([1, 2, 3])], 'boots.jpg', { type: 'image/jpeg' });
    Object.defineProperty(file, 'arrayBuffer', {
      value: vi.fn(async () => new Uint8Array([1, 2, 3]).buffer),
    });
    const { result } = renderHook(() => useListingMediaPicker());

    act(() => result.current.onInputChange(changeEvent(file)));
    const preparedBox: { current: PreparedListingMedia | null } = { current: null };
    await act(async () => {
      preparedBox.current = await result.current.prepare(OWNER, 'Brown leather boots');
    });
    const prepared = preparedBox.current;

    expect(stripImageMetadata).toHaveBeenCalledWith(file);
    expect(prepared).toMatchObject({
      record: {
        id: '018f47d26a277c23a49d6b21bb770120',
        type: 'image',
        mimeType: 'image/jpeg',
        byteSize: 3,
        width: 1200,
        height: 1600,
        altText: 'Brown leather boots',
      },
      bytes: new Uint8Array([1, 2, 3]),
    });
    expect(prepared?.record.contentHash).toMatch(/^[a-f0-9]{64}$/);
    expect(prepared?.record.url).toContain(`pubky://${OWNER}/pub/pubky.app/marketplace/v1/media/`);
  });

  it('rejects non-image and oversized files before preparation', () => {
    const { result } = renderHook(() => useListingMediaPicker(2));

    act(() => result.current.onInputChange(changeEvent(new File(['text'], 'notes.txt', { type: 'text/plain' }))));
    expect(result.current.error).toBe('invalid-type');

    act(() => result.current.onInputChange(changeEvent(new File(['abc'], 'large.jpg', { type: 'image/jpeg' }))));
    expect(result.current.error).toBe('too-large');
  });
});
