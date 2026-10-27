import { slowCypressDown } from 'cypress-slow-down';
import 'cypress-slow-down/commands';
import { userIdFromPubky } from '../support/common';
import {
  assertAscendingPagesReadToEnd,
  assertScorePagesReadToEnd,
  assertSeededTextsInOrder,
  isPagingRequest,
  keyMatchesPostId,
  POSTS_PAGE_SIZE,
  postIdFromWriteUrl,
  recordStreamPages,
  scrollTimelineToEnd,
  THREAD_INITIAL_REPLIES,
  waitForNexusStream,
} from '../support/pagination';
import { createQuickPost } from '../support/posts';
import { BackupType, CheckForNewPosts, HasBackedUp, WaitForNewPosts } from '../support/types/enums';

type SeededText = { id: string; text: string };

const username = 'Mr Pagination';
const authorAlias = 'paginationAuthor';
const runId = Date.now().toString();
const tag = `page${runId.slice(-8)}`;
const postPrefix = `pagination ${runId} post `;
const replyPrefix = `pagination ${runId} reply `;
const rootText = `pagination ${runId} thread root`;

// One past a page: a full first page, then a short last page that ends the stream
const POST_COUNT = POSTS_PAGE_SIZE + 1;
// The thread opens on its oldest replies; expanding then reads one full and one short page
const REPLY_COUNT = POSTS_PAGE_SIZE + 1;

const TIMELINE = '[data-cy="timeline-posts"]:visible';
const SEARCH_TIMELINE = '[data-cy="post-search-results"] [data-cy="timeline-posts"]:visible';
const THREAD_REPLY = '[data-cy="thread-reply"]:visible';

const seededPosts: SeededText[] = [];
const seededReplies: SeededText[] = [];
let authorId = '';
let rootId = '';
let profileKeys: string[] = [];
let searchKeys: string[] = [];
let replyKeys: string[] = [];

const pad = (index: number) => String(index + 1).padStart(2, '0');

// Seeded post texts in the order a stream lists their keys
const seededTextsFor = (keys: string[]) =>
  keys.flatMap((key) => seededPosts.filter((post) => keyMatchesPostId(key, post.id)).map((post) => post.text));

const isPostTimelineQuery = (query: Record<string, string>) =>
  query['kind'] === undefined && query['sorting'] !== 'total_engagement' && isPagingRequest(query);

// Every surface reads a stream only this run writes to (one author, one tag, one thread), so the
// spec does not depend on what else the stack holds or on which test runs first.
describe('pagination', () => {
  before(() => {
    slowCypressDown();
    cy.deleteDownloadsFolder();
    cy.onboardAsNewUser(username, 'I post one page at a time', [BackupType.EncryptedFile], authorAlias);
    cy.get<string>(`@${authorAlias}`).then((pubky) => {
      authorId = userIdFromPubky(pubky);
    });

    Cypress._.times(POST_COUNT, (index) => {
      const text = `${postPrefix}${pad(index)}`;
      createQuickPost(text, [tag]);
      cy.get<{ request: { url: string } }>('@postCreated')
        .its('request.url')
        .then((url) => {
          seededPosts.push({ id: postIdFromWriteUrl(url), text });
        });
    });

    createQuickPost(rootText);
    cy.get<{ request: { url: string } }>('@postCreated')
      .its('request.url')
      .then((url) => {
        rootId = postIdFromWriteUrl(url);
      });
    // Open the thread from the feed: a fresh `cy.visit` lets the click below land on the
    // server-rendered composer before it hydrates, and the composer then never expands
    cy.findFirstPostInFeedFiltered(rootText, CheckForNewPosts.No, WaitForNewPosts.Yes).within(() => {
      cy.get('[data-cy="post-text"]').click();
    });
    // Built inside `.then()`: the ids are only set once the commands above have run
    cy.then(() => {
      cy.location('pathname').should('eq', `/post/${authorId}/${rootId}`);
    });
    cy.get('[data-cy="single-post-card"]:visible').should('have.length', 1);
    cy.get('[data-cy="quick-reply"]').filter(':visible').should('have.length', 1).as('quickReply');
    Cypress._.times(REPLY_COUNT, (index) => {
      const text = `${replyPrefix}${pad(index)}`;
      cy.get('@quickReply')
        .find('[data-cy="quick-reply-textarea"]')
        .filter(':visible')
        .should('have.length', 1)
        .should('have.value', '')
        .click();
      // The composer collapses after every reply; the click above expands it again
      cy.get('@quickReply').find('[data-cy="post-input-action-bar-reply"]').filter(':visible').should('have.length', 1);
      cy.get('@quickReply').find('[data-cy="quick-reply-textarea"]').filter(':visible').type(text);
      cy.intercept('PUT', '**/pub/pubky.app/posts/**').as('replyCreated');
      cy.get('@quickReply')
        .find('[data-cy="post-input-action-bar-reply"]')
        .filter(':visible')
        .should('not.be.disabled')
        .click();
      cy.wait('@replyCreated').then(({ request, response }) => {
        expect(response?.statusCode).to.eq(201);
        seededReplies.push({ id: postIdFromWriteUrl(request.url), text });
      });
    });

    // Signing out clears the local database, so every surface below pages from Nexus
    cy.signOut(HasBackedUp.Yes);

    // The replies are the last writes: once they are indexed, every earlier post is too
    cy.then(() =>
      waitForNexusStream(
        { source: 'post_replies', author_id: authorId, post_id: rootId, order: 'ascending' },
        seededReplies.map((reply) => reply.id),
      ).then((keys) => {
        replyKeys = keys;
      }),
    );
    cy.then(() => {
      waitForNexusStream({ source: 'author', author_id: authorId }, [
        ...seededPosts.map((post) => post.id),
        rootId,
      ]).then((keys) => {
        profileKeys = keys;
      });
      waitForNexusStream(
        { source: 'all', sorting: 'timeline', tags: tag },
        seededPosts.map((post) => post.id),
      ).then((keys) => {
        searchKeys = keys;
      });
    });
  });

  it('profile posts tab loads every page once and stops at the end', () => {
    const pages = recordStreamPages(
      (query) =>
        query['source'] === 'author' &&
        query['author_id'] === authorId &&
        query['tags'] === undefined &&
        isPostTimelineQuery(query),
    );
    cy.visit(`/profile/${authorId}`);

    cy.get('[data-cy="profile-username-header"]:visible').should('contain.text', username);
    scrollTimelineToEnd(TIMELINE, profileKeys.length);
    assertScorePagesReadToEnd(pages, profileKeys);
    assertSeededTextsInOrder(TIMELINE, postPrefix, seededTextsFor(profileKeys));
  });

  it('tag search results load every page once and stop at the end', () => {
    expect(searchKeys, 'tagged posts').to.have.length(POST_COUNT);
    const pages = recordStreamPages(
      (query) => query['source'] === 'all' && query['tags'] === tag && isPostTimelineQuery(query),
    );
    cy.visit(`/search?tags=${tag}`);

    scrollTimelineToEnd(SEARCH_TIMELINE, searchKeys.length);
    assertScorePagesReadToEnd(pages, searchKeys);
    assertSeededTextsInOrder(SEARCH_TIMELINE, postPrefix, seededTextsFor(searchKeys));
  });

  it('post replies expand to the whole thread, oldest first, page by page', () => {
    expect(replyKeys, 'thread replies').to.have.length(REPLY_COUNT);
    // The opening slice may be served from the reply stream another surface cached for this
    // post; expanding always pages from Nexus, so only those requests are recorded
    const expandPages = recordStreamPages(
      (query) =>
        query['source'] === 'post_replies' &&
        query['post_id'] === rootId &&
        query['order'] === 'ascending' &&
        query['limit'] !== String(THREAD_INITIAL_REPLIES),
    );
    const replyTexts = ($replies: JQuery<HTMLElement>) =>
      $replies.toArray().map((reply) => Cypress.$(reply).find('[data-cy="post-text"]').first().text().trim());
    const chronological = seededReplies.map((reply) => reply.text);

    cy.visit(`/post/${authorId}/${rootId}`);
    cy.get('[data-cy="single-post-card"]:visible')
      .should('have.length', 1)
      .find('[data-cy="post-text"]')
      .first()
      .should('contain.text', rootText);

    cy.get(THREAD_REPLY).should(($replies) => {
      expect(replyTexts($replies), 'oldest replies first').to.deep.equal(
        chronological.slice(0, THREAD_INITIAL_REPLIES),
      );
    });
    cy.get('[data-cy="show-more-replies-btn"]:visible').should('have.length', 1).click();

    cy.get(THREAD_REPLY).should(($replies) => {
      expect(replyTexts($replies), 'every reply once, oldest first').to.deep.equal(chronological);
    });
    cy.get('[data-cy="show-more-replies-btn"]:visible').should('not.exist');
    assertAscendingPagesReadToEnd(expandPages, replyKeys);
  });
});
