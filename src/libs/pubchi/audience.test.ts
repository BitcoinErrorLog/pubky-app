import { describe, expect, it } from 'vitest';
import { normalizePubchiAudience } from './audience';

describe('normalizePubchiAudience', () => {
  it.each([
    ['HTTPS://PUBCHI-EXAMPLE.COM:443/path/', 'https://pubchi-example.com'],
    ['http://PUBCHI-EXAMPLE.COM:80/v1', 'http://pubchi-example.com'],
    ['https://pubchi-example.com:8443/v1/', 'https://pubchi-example.com:8443'],
  ])('normalizes %s', (input, expected) => {
    expect(normalizePubchiAudience(input)).toBe(expected);
  });
});
