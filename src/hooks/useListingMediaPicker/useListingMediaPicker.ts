'use client';

import { type ChangeEvent, type RefObject, useEffect, useRef, useState } from 'react';
import { blake3 } from '@noble/hashes/blake3.js';
import { bytesToHex } from '@noble/hashes/utils.js';
import { IMAGE_MAX_RAW_SIZE } from '@/config/images';
import { type CommerceListingRecord, commerceMediaSchema } from '@/libs/commerce/marketplace-records';
import { stripImageMetadata } from '@/libs/image/stripImageMetadata';
import { CommerceRecordNormalizer } from '@/pipes/commerce/commerce.normalizer';

export type ListingMediaPickerError = 'invalid-type' | 'too-large' | 'decode-failed';

export interface PreparedListingMedia {
  record: CommerceListingRecord['media'][number];
  bytes: Uint8Array;
}

export interface UseListingMediaPickerResult {
  file: File | null;
  previewUrl: string | null;
  error: ListingMediaPickerError | null;
  inputRef: RefObject<HTMLInputElement | null>;
  onInputChange: (event: ChangeEvent<HTMLInputElement>) => void;
  choose: () => void;
  remove: () => void;
  reset: () => void;
  prepare: (ownerPubky: string, altText: string) => Promise<PreparedListingMedia | null>;
}

export function useListingMediaPicker(maxSize = IMAGE_MAX_RAW_SIZE): UseListingMediaPickerResult {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<ListingMediaPickerError | null>(null);

  useEffect(
    () => () => {
      if (previewUrl) URL.revokeObjectURL(previewUrl);
    },
    [previewUrl],
  );

  const clearPreview = () => {
    setPreviewUrl((current) => {
      if (current) URL.revokeObjectURL(current);
      return null;
    });
  };

  const onInputChange = (event: ChangeEvent<HTMLInputElement>) => {
    const selected = event.target.files?.[0] ?? null;
    if (!selected) return;
    if (!selected.type.startsWith('image/')) {
      setError('invalid-type');
      return;
    }
    if (selected.size > maxSize) {
      setError('too-large');
      return;
    }

    clearPreview();
    setFile(selected);
    setPreviewUrl(URL.createObjectURL(selected));
    setError(null);
  };

  const remove = () => {
    setFile(null);
    clearPreview();
    setError(null);
    if (inputRef.current) inputRef.current.value = '';
  };

  const prepare = async (ownerPubky: string, altText: string): Promise<PreparedListingMedia | null> => {
    if (!file) return null;
    try {
      const sanitized = await stripImageMetadata(file);
      const bytes = new Uint8Array(await sanitized.arrayBuffer());
      const image = await createImageBitmap(sanitized);
      const dimensions = { width: image.width, height: image.height };
      image.close();
      const mediaId = crypto.randomUUID().replaceAll('-', '');
      const record = commerceMediaSchema.parse({
        id: mediaId,
        type: 'image',
        url: CommerceRecordNormalizer.mediaUri(ownerPubky, mediaId),
        contentHash: bytesToHex(blake3(bytes)),
        mimeType: sanitized.type,
        byteSize: bytes.byteLength,
        width: dimensions.width,
        height: dimensions.height,
        altText: altText.trim(),
      });
      setError(null);
      return { record, bytes };
    } catch {
      setError('decode-failed');
      return null;
    }
  };

  return {
    file,
    previewUrl,
    error,
    inputRef,
    onInputChange,
    choose: () => inputRef.current?.click(),
    remove,
    reset: remove,
    prepare,
  };
}
