import { getPubchiApiUrl } from '@/libs/runtime-config/runtime-config';

export function normalizePubchiAudience(apiUrl: string): string {
  const url = new URL(apiUrl);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Invalid Pubchi API URL');
  return url.origin;
}

export function getPubchiAudience(): string {
  return normalizePubchiAudience(getPubchiApiUrl().trim());
}
