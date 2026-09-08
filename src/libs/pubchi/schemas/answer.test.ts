import { describe, expect, it } from 'vitest';
import fixture from './__fixtures__/answer.valid.json';
import { parsePubchiAnswerV1 } from './answer';

describe('pubchi answer schema', () => {
  it('parses the captured answer fixture', () => {
    const result = parsePubchiAnswerV1(fixture);
    expect(result.ok).toBe(true);
  });

  it.each([
    ['extra key', { ...fixture, verdict: 'high' }],
    ['forbidden verdict', { ...fixture, evidence: fixture.evidence.map((item) => ({ ...item, verdict: 'high' })) }],
    ['too many items', { ...fixture, evidence: Array.from({ length: 51 }, (_, index) => ({ ...fixture.evidence[0], label: `item-${index}` })) }],
    ['long summary', { ...fixture, summary: 'x'.repeat(1201) }],
    ['bad uri', { ...fixture, sources: ['https://example.com'] }],
  ])('rejects %s', (_, input) => {
    expect(parsePubchiAnswerV1(input).ok).toBe(false);
  });
});
