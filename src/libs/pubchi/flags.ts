import { getPubchiApiUrl, getPubchiEnabled } from '@/libs/runtime-config/runtime-config';

/** True when the deployer turned the Pubchi flag on. */
export function isPubchiEnabled(): boolean {
  return getPubchiEnabled();
}

/**
 * Chat panel is shown only when the flag is on and an API URL is configured.
 * An empty URL hides the panel even if the flag is true.
 */
export function isPubchiPanelEnabled(): boolean {
  return isPubchiEnabled() && getPubchiApiUrl().trim() !== '';
}

export function getPubchiQueryUrl(): string {
  const base = getPubchiApiUrl().replace(/\/+$/, '');
  return `${base}/v1/query`;
}
