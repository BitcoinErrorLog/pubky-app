import { slowCypressDown } from 'cypress-slow-down';
import { backupDownloadFilePath, userIdFromPubky } from '../support/common';
import { createQuickPost, waitForFeedToLoad } from '../support/posts';
import { BackupType, HasBackedUp } from '../support/types/enums';

// Own-profile posts live at /profile/posts. /profile itself is the notifications tab,
// and profile.cy.ts onboards a new user in beforeEach, so this spec seeds once.
const owner = { username: 'Filter Owner', pubkyAlias: 'filter_owner_pubky' };
const other = { username: 'Filter Other', pubkyAlias: 'filter_other_pubky' };

// Letters only: Nexus tokenises on letter/digit boundaries, and a content query
// must be 2–30 characters (see search.cy.ts).
const stamp = Date.now()
  .toString()
  .replace(/\d/g, (digit) => 'abcdefghij'[Number(digit)]);
const appleWord = `apple${stamp}`;
const berryWord = `berry${stamp}`;
const missingWord = `nomatch${stamp}`;

const postApple = `Citrus note ${appleWord}`;
const postBerry = `Orchard note ${berryWord}`;
const postBoth = `Mixed note ${appleWord} ${berryWord}`;
const postOther = `Elsewhere note ${appleWord}`;

const OWNER_POSTS = [postApple, postBerry, postBoth];

const FILTER_INPUT = '[data-cy="profile-filter-posts-input"]';
const PROFILE_TAB = '[data-cy="profile-tab-content"]';

// Nexus indexes new posts asynchronously. Poll the read the filter uses rather than sleeping once.
const NEXUS_INDEX_TIMEOUT_MS = 90_000;
const NEXUS_INDEX_POLL_MS = 2_000;

const profileTab = () => cy.get(PROFILE_TAB).filter(':visible');

const visiblePostCards = () =>
  profileTab().find('[data-cy="timeline-posts"]').filter(':visible').find('[data-cy="post-card"]').filter(':visible');

const timelinePosts = () => profileTab().find('[data-cy="timeline-posts"]').filter(':visible');

const filterInput = () => cy.get(FILTER_INPUT).filter(':visible');

const postKeysFromBody = (body: unknown): string[] => {
  if (Array.isArray(body)) {
    return body.flatMap((hit) => {
      if (typeof hit === 'object' && hit !== null && 'post_key' in hit && typeof hit.post_key === 'string') {
        return [hit.post_key];
      }
      return [];
    });
  }
  if (typeof body === 'object' && body !== null && 'post_keys' in body && Array.isArray(body.post_keys)) {
    return body.post_keys.filter((key): key is string => typeof key === 'string');
  }
  return [];
};

const pollNexusUntil = (url: string, ready: (body: unknown, status: number) => boolean, label: string) => {
  const deadline = Date.now() + NEXUS_INDEX_TIMEOUT_MS;
  const poll = () => {
    cy.request({ url, failOnStatusCode: false }).then((response) => {
      if (ready(response.body, response.status)) return;
      if (Date.now() >= deadline) {
        const body = JSON.stringify(response.body)?.slice(0, 500);
        throw new Error(`Nexus did not index ${label} (status ${response.status}, body ${body})`);
      }
      cy.wait(NEXUS_INDEX_POLL_MS);
      poll();
    });
  };
  poll();
};

const waitForIndexedPosts = (authorId: string, query: string, expectedCount: number) => {
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const nexusOrigin = String(nexusUrl).replace(/\/$/, '');
    const contentParams = new URLSearchParams({ q: query, author: authorId, skip: '0', limit: '10' });
    pollNexusUntil(
      `${nexusOrigin}/v0/search/posts/by_content?${contentParams.toString()}`,
      (body, status) => {
        const keys = postKeysFromBody(body).filter((key) => key.startsWith(`${authorId}:`));
        return status === 200 && keys.length === expectedCount;
      },
      `${expectedCount} by_content hits for ${authorId} q=${query}`,
    );
  });
};

const waitForAuthorStream = (authorId: string, expectedCount: number) => {
  cy.env(['nexusUrl']).then(({ nexusUrl }) => {
    const nexusOrigin = String(nexusUrl).replace(/\/$/, '');
    const params = new URLSearchParams({ source: 'author', author_id: authorId, skip: '0', limit: '10' });
    pollNexusUntil(
      `${nexusOrigin}/v0/stream/posts/keys?${params.toString()}`,
      (body, status) => {
        const keys = postKeysFromBody(body).filter((key) => key.startsWith(`${authorId}:`));
        return status === 200 && keys.length === expectedCount;
      },
      `${expectedCount} author posts for ${authorId}`,
    );
  });
};

const authorIdFor = (alias: string) =>
  cy.get(`@${alias}`).then((pubky) => {
    const authorId = userIdFromPubky(String(pubky));
    return authorId;
  });

const openProfilePosts = (pathname: string, username: string) => {
  cy.visit(pathname);
  cy.location('pathname').should('eq', pathname);
  cy.get('[data-cy="profile-username-header"]').filter(':visible').should('have.text', username);
  filterInput().should('have.value', '');
};

const expectPosts = (present: string[], absent: string[], count: number) => {
  visiblePostCards().should('have.length', count);
  present.forEach((text) => {
    timelinePosts().innerTextShouldContain(text);
  });
  absent.forEach((text) => {
    timelinePosts().innerTextShouldNotContain(text);
  });
};

const expectFilterEmpty = () => {
  profileTab()
    .find('[data-cy="profile-filter-posts-empty"]')
    .filter(':visible')
    .should('have.length', 1)
    .innerTextShouldContain('No posts match your search');
  profileTab().should(($tab) => {
    expect($tab.find('[data-cy="post-card"]:visible')).to.have.length(0);
  });
};

// Debounced author-scoped by_content query. The test registers `@profilePostFilter`
// once; clearing is immediate and does not hit that endpoint.
const applyFilter = (authorId: string, query: string) => {
  filterInput().clear();
  filterInput().should('have.value', '');
  filterInput().type(query);
  cy.wait('@profilePostFilter').then(({ request }) => {
    const url = new URL(request.url);
    expect(url.searchParams.get('q')).to.eq(query);
    expect(url.searchParams.get('author')).to.eq(authorId);
  });
  filterInput().should('have.value', query);
};

describe('profile filter posts', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();

    cy.onboardAsNewUser(owner.username, 'Filters their own posts', [BackupType.EncryptedFile], owner.pubkyAlias);
    OWNER_POSTS.forEach((content) => {
      createQuickPost(content);
    });
    cy.signOut(HasBackedUp.Yes);

    cy.onboardAsNewUser(other.username, 'Posts the same word elsewhere', [BackupType.EncryptedFile], other.pubkyAlias);
    createQuickPost(postOther);
    cy.signOut(HasBackedUp.Yes);

    authorIdFor(owner.pubkyAlias).then((ownerId) => {
      return authorIdFor(other.pubkyAlias).then((otherId) => {
        waitForAuthorStream(ownerId, OWNER_POSTS.length);
        waitForAuthorStream(otherId, 1);
        waitForIndexedPosts(ownerId, appleWord, 2);
        waitForIndexedPosts(ownerId, berryWord, 2);
        waitForIndexedPosts(otherId, appleWord, 1);
      });
    });
  });

  beforeEach(() => {
    cy.wrap(Cypress.expose(owner.pubkyAlias)).as(owner.pubkyAlias);
    cy.wrap(Cypress.expose(other.pubkyAlias)).as(other.pubkyAlias);

    cy.location('pathname').then((currentPath) => {
      if (currentPath !== '/home') {
        cy.signInWithEncryptedFile(backupDownloadFilePath(owner.username));
        waitForFeedToLoad();
      }
    });
  });

  it('filters the posts tab to a matching term, shows the empty state, then restores every post', () => {
    cy.intercept('GET', '**/v0/search/posts/by_content*').as('profilePostFilter');

    authorIdFor(owner.pubkyAlias).then((ownerId) => {
      openProfilePosts('/profile/posts', owner.username);
      expectPosts(OWNER_POSTS, [postOther], OWNER_POSTS.length);

      applyFilter(ownerId, appleWord);
      expectPosts([postApple, postBoth], [postBerry, postOther], 2);

      applyFilter(ownerId, missingWord);
      expectFilterEmpty();

      filterInput().clear();
      filterInput().should('have.value', '');
      cy.get('[data-cy="profile-filter-posts-empty"]').should('not.exist');
      expectPosts(OWNER_POSTS, [postOther], OWNER_POSTS.length);
    });
  });

  it('limits the filter to the profile being viewed', () => {
    cy.intercept('GET', '**/v0/search/posts/by_content*').as('profilePostFilter');

    authorIdFor(other.pubkyAlias).then((otherId) => {
      openProfilePosts(`/profile/${otherId}`, other.username);
      expectPosts([postOther], OWNER_POSTS, 1);

      applyFilter(otherId, appleWord);
      expectPosts([postOther], OWNER_POSTS, 1);
    });
  });
});
