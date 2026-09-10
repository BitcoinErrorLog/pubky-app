import { describe, expect, it } from 'vitest';
import { linkifyPubkys, parsePostReference } from './capabilities-v1';

const pubky = 'ufibwbmed6jeq9k4p583go95wofakh9fwpp4k734trq79pd9u1uy';

describe('Pubchi capability helpers', () => {
  it.each([
    `pubky://${pubky}/pub/pubky.app/posts/post-1`,
    `https://pubky.app/post/${pubky}/post-1`,
    `https://bots.pubky.app/post/${pubky}/post-1`,
  ])('parses %s', (reference) => {
    expect(parsePostReference(reference)).toMatchObject({ pubky, postId: 'post-1' });
  });

  it('rejects invalid post references', () => {
    expect(parsePostReference(`https://pubky.app/post/${pubky.slice(1)}/post-1`)).toBeNull();
  });

  it('linkifies only exact pubkys and leaves text escaped by React', () => {
    expect(linkifyPubkys(`<b>pubky:${pubky}</b>`)).toEqual([
      '<b>',
      { pubky, href: `/profile/${pubky}` },
      '</b>',
    ]);
  });
});
