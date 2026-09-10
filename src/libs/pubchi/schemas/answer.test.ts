import { describe, expect, it } from 'vitest';
import invalidScopeFixture from './__fixtures__/answer.scope.invalid-extra-key.json';
import scopedFixture from './__fixtures__/answer.scope.valid.json';
import invalidSectionFixture from './__fixtures__/answer.section.invalid.json';
import sectionFixture from './__fixtures__/answer.section.valid.json';
import fixture from './__fixtures__/answer.valid.json';
import { parsePubchiAnswerV1 } from './answer';

describe('pubchi answer schema', () => {
  it('parses the captured answer fixture', () => {
    const result = parsePubchiAnswerV1(fixture);
    expect(result.ok).toBe(true);
  });

  it('parses the service scope fixture', () => {
    const result = parsePubchiAnswerV1(scopedFixture);
    expect(result.ok).toBe(true);
  });

  it('parses the service section fixture', () => {
    expect(parsePubchiAnswerV1(sectionFixture).ok).toBe(true);
  });

  it('parses a strict continuation', () => {
    expect(parsePubchiAnswerV1({
      ...fixture,
      continuation: {
        since: '2026-09-10T06:00:00Z',
        until: '2026-09-10T07:00:00Z',
        complete: true,
        skipped: 0,
      },
    }).ok).toBe(true);
  });

  it('allows an omitted evidence section and parses C3 sections', () => {
    const result = parsePubchiAnswerV1({
      ...fixture,
      evidence: fixture.evidence.map((item, index) => ({
        ...item,
        ...(index === 0 ? { section: 'followed_posts' } : {}),
      })),
    });
    expect(result.ok).toBe(true);
  });

  it.each([
    ['extra key', { ...fixture, verdict: 'high' }],
    ['forbidden verdict', { ...fixture, evidence: fixture.evidence.map((item) => ({ ...item, verdict: 'high' })) }],
    ['too many items', { ...fixture, evidence: Array.from({ length: 51 }, (_, index) => ({ ...fixture.evidence[0], label: `item-${index}` })) }],
    ['long summary', { ...fixture, summary: 'x'.repeat(1201) }],
    ['bad uri', { ...fixture, sources: ['https://example.com'] }],
    ['continuation extra key', { ...fixture, continuation: { since: '2026-09-10T06:00:00Z', until: '2026-09-10T07:00:00Z', complete: true, skipped: 0, extra: true } }],
    ['continuation non-ISO', { ...fixture, continuation: { since: 'yesterday', until: '2026-09-10T07:00:00Z', complete: true, skipped: 0 } }],
    ['continuation complete string', { ...fixture, continuation: { since: '2026-09-10T06:00:00Z', until: '2026-09-10T07:00:00Z', complete: 'true', skipped: 0 } }],
    ['scope extra key', invalidScopeFixture],
    ['unknown evidence section', invalidSectionFixture],
  ])('rejects %s', (_, input) => {
    expect(parsePubchiAnswerV1(input).ok).toBe(false);
  });
});
