# Resume upstream sync parked after Stage 2

## Parked state

- Branch: `sync/upstream-2026-09-20`
- Parked implementation head: `fb097209066824781f40c9ed4e8b7e87451af26b`
- Upstream base already integrated: `pubky/pubky-app:dev` at `b35cf7a59865758218868a9c626bf529aa5403bf`
- Latest release ref observed while parking: `origin/release/shop-v0.6.8` at `5e38868fb53ea00a6a4b86440222a731aa081439`
- Status: parked. Do not begin Stage 3 or Stage 4 without a new decision.

The documentation commit containing this file is a document-only successor to the parked implementation head. At resume time, record the live branch head with `git rev-parse HEAD`.

## What landed

### Stage 1

Merge commit `d6b8965b6c25ef8afcdd27c7bdbb9b096f38308e` integrated upstream framework, dependency, workflow, install-script allowlist, and CI changes while retaining Shop's Marketplace scripts, vendored dependencies, contract packages, UI behavior, and VRT sources.

Key versions include Next `16.3.4`, React `19.2.8`, Tailwind `4.3.3`, Playwright `1.62.1`, Vitest `4.1.11`, and Sentry `10.71.0`. Compatibility edits cover Next 16 router mocks and `linkify-it` v6.

### Stage 2

Commit `24e135d52944e57fb15c8646dad8e426f380dfed` integrated `@synonymdev/pubky` 0.11 and upstream auth, storage, cache, and error changes while preserving:

- the full `signin_grant` capability string;
- one-approval Shop sign-in;
- step-up identity matching and single-flight ceremony ownership;
- Marketplace bearer cleanup and cross-tab finalization;
- owned `/pub` and `/priv` routing through the SDK;
- private reserve put/get/list/exists behavior;
- Marketplace Dexie tables, tag rows, and private-data cleanup;
- stale-viewer guards, local-first tag caching, and Nexus 429 backoff;
- Shop's Sentry scrubbing and expected-error handling.

Merge commit `28faa52014c730ef2024da48c2e969fa76feb43f` then incorporated the previous `release/shop-v0.6.8` base through PR #39.

Commits `798b3c04b`, `5aa488cc8`, and `fb0972090` close the SDK 0.11 one-approval auth P1 with focused regression coverage.

## One-approval auth construction

One approved, full-capability `AuthToken` is redeemed twice:

1. `POST https://_pubky.<user>/session` with `credentials: include` creates the homeserver's HttpOnly cookie and returns postcard-serialized `CookieSessionRecord`.
2. `Session.restore(base64(responseBody), client)` hydrates and revalidates the typed browser `Session` against that cookie.
3. The same in-memory token bytes are posted to Marketplace to mint its bearer.

The Chrome staging proof used one approval and passed identity matching, all three Shop capabilities, private write/read/delete, cleanup, and signout. Evidence:

- `/Volumes/t7/vibes-dev/.evidence/upstream-sync-2026-09-20/stage2b/browser-one-approval-result.json`
- `/Volumes/t7/vibes-dev/.evidence/upstream-sync-2026-09-20/stage2b/browser-one-approval-proof-final.log`

### Deprecation caveat

SDK 0.11 marks `Session.restore` deprecated in favor of `Pubky.restoreSession`, and cookie auth itself is deprecated in favor of grant auth. Shop uses `Session.restore` deliberately because it is the public API that explicitly accepts cookie metadata plus a client. The installed browser package accepted both APIs in staging, but Node did not reproduce the browser cookie jar. No private SDK constructor or cookie value is used.

Do not replace this construction with two approvals. If a future SDK removes sound public cookie hydration, retain the working auth/session layer or hold that SDK bump out until upstream exposes a supported replacement.

## Draft upstream issue

**Title:** JS SDK: expose a supported `Session` hydration API for cookie session responses

**Body:**

> `@synonymdev/pubky` 0.11 exposes `AuthFlow.awaitToken()` and low-level `Client.fetch`, but JS has no direct supported API for converting a successful cookie `/session` response into a `Session`. Rust already has `CookieCredential::from_response(response, homeserver)` and `PubkySession::from_cookie_credential`.
>
> A third-party app may need one user approval to redeem the same signed `AuthToken` with its homeserver and its own backend. `awaitApproval()` cannot be called after `awaitToken()`, and starting another flow requires another approval.
>
> Please expose an API such as:
>
> ```ts
> Session.fromResponse(
>   response: Response,
>   client: Client,
>   homeserver?: PublicKey,
> ): Promise<Session>
> ```
>
> Requirements:
>
> - parse canonical `CookieSessionRecord`;
> - use the browser's HttpOnly cookie jar when `Set-Cookie` is inaccessible;
> - retain Node/native cookie capture where available;
> - bind and revalidate the homeserver consistently with cookie auth-flow construction;
> - document response ownership and whether the body is consumed;
> - test browser and Node behavior from the same captured `/session` response.
>
> `Session.restore(base64(responseBody), client)` currently works as a browser adapter, but it is deprecated in favor of `Pubky.restoreSession` and requires app-owned base64 conversion. A supported response-hydration API would make the one-approval construction explicit and stable.

## Conflict record

Every Stage 1 and Stage 2 text conflict and its disposition is recorded at:

`/Volumes/t7/vibes-dev/.evidence/upstream-sync-2026-09-20/stage2b/conflict-dispositions.md`

No Marketplace-visible text conflict was resolved by replacing Shop behavior with upstream's version.

## Deferred full-suite failures

The final Stage 2 unit run had 104 failures:

- 100 deferred UI snapshot failures;
- `src/libs/utils/utils.test.ts`: edit-mode `canSubmitPost` attachment behavior;
- `src/components/molecules/MarkdownEditor/InitializedMDXEditor.test.tsx`: smile-icon assertion;
- `src/components/molecules/MarkdownEditor/InitializedMDXEditor.test.tsx`: markdown-mark icon assertion;
- `src/core/application/og-metadata/og-metadata.test.ts`: private-IP redirect SSRF assertion.

Exact failing-file list:

```text
src/libs/utils/utils.test.ts
src/components/atoms/Collapsible/Collapsible.test.tsx
src/components/atoms/Dialog/Dialog.test.tsx
src/components/atoms/DropdownMenu/DropdownMenu.test.tsx
src/components/atoms/Popover/Popover.test.tsx
src/components/atoms/Select/Select.test.tsx
src/components/atoms/Sheet/Sheet.test.tsx
src/components/atoms/Tooltip/Tooltip.test.tsx
src/components/molecules/ActionButtons/ActionButtons.test.tsx
src/components/molecules/FAQAccordion/FAQAccordion.test.tsx
src/components/molecules/FeedSection/FeedSection.test.tsx
src/components/molecules/HeaderHome/HeaderHome.test.tsx
src/components/molecules/IllustratedEmptyState/IllustratedEmptyState.test.tsx
src/components/molecules/Install/Install.test.tsx
src/components/molecules/MarkdownEditor/InitializedMDXEditor.test.tsx
src/components/molecules/PopoverInvite/PopoverInvite.test.tsx
src/components/molecules/PostTagPopoverWrapper/PostTagPopoverWrapper.test.tsx
src/components/molecules/TagInput/TagInput.test.tsx
src/core/application/og-metadata/og-metadata.test.ts
src/components/organisms/ClickableTagsList/ClickableTagsList.test.tsx
src/components/organisms/CopyrightForm/CopyrightForm.test.tsx
src/components/organisms/DialogWelcome/DialogWelcome.test.tsx
src/components/organisms/HotFeedFilters/HotFeedFilters.test.tsx
src/components/organisms/HumanInviteCode/HumanInviteCode.test.tsx
src/components/organisms/NotificationGroupItem/NotificationGroupItem.test.tsx
src/components/organisms/Marketplace/MarketplaceFilters.test.tsx
src/components/organisms/Marketplace/MarketplaceListingForm.test.tsx
src/components/organisms/PostInputActionBar/PostInputActionBar.test.tsx
src/components/organisms/PostInputExpandableSection/PostInputExpandableSection.integration.test.tsx
src/components/organisms/PostSavePicker/PostSavePicker.test.tsx
src/components/organisms/PostTagsExpandableRow/PostTagsExpandableRow.test.tsx
src/components/organisms/ProfilePageHeader/ProfilePageHeader.test.tsx
src/components/organisms/SignIn/SignIn.test.tsx
src/components/templates/Settings/Help/Help.test.tsx
src/components/molecules/Settings/HelpContent/HelpContent.test.tsx
src/components/molecules/Settings/SettingsInfo/SettingsInfo.test.tsx
src/components/molecules/StatusPicker/StatusPickerContent/StatusPickerContent.test.tsx
src/components/molecules/StatusPicker/StatusPickerWrapper/StatusPickerWrapper.test.tsx
src/components/organisms/Collections/CollectionCard/CollectionCard.test.tsx
src/components/organisms/Collections/CollectionLayoutPicker/CollectionLayoutPicker.test.tsx
src/components/organisms/Collections/DialogAddContent/DialogAddContent.test.tsx
src/components/organisms/PostMenuActions/PostMenuActionsContent/PostMenuActionsContent.test.tsx
src/components/organisms/Settings/EditProfileHeader/EditProfileHeader.test.tsx
```

Authoritative evidence:

- `/Volumes/t7/vibes-dev/.evidence/upstream-sync-2026-09-20/stage2/final-full-unit.log`
- `/Volumes/t7/vibes-dev/.evidence/upstream-sync-2026-09-20/stage2/final-full-unit-failing-files.txt`

## Exact resume procedure

1. Set ExFAT hygiene and verify the parked tree before changing it:

   ```bash
   export COPYFILE_DISABLE=1
   cd /Volumes/t7/vibes-dev/_worktrees/pubky-app/sync-upstream
   find . -name '._*' -delete
   git status --short --branch
   git rev-parse HEAD
   ```

2. Refresh only the required refs:

   ```bash
   git fetch origin release/shop-v0.6.8
   git fetch upstream dev
   ```

3. Record how far upstream moved after the parked implementation:

   ```bash
   git log --oneline fb097209..upstream/dev | wc -l
   git log --oneline fb097209..upstream/dev
   ```

   At parking time the count was `0`; `upstream/dev` remained `b35cf7a59865758218868a9c626bf529aa5403bf`. Recalculate at resume time.

4. Merge the current release branch before any upstream UI work:

   ```bash
   git merge --no-ff origin/release/shop-v0.6.8
   ```

   The observed release ref was `5e38868fb53ea00a6a4b86440222a731aa081439`, 17 commits outside the parked implementation. Aldert's redesign wins every Marketplace-visible conflict. Preserve the Stage 1–2 auth, storage, cache, private-path, session-bridge, and cleanup behavior around that UI.

5. Prove the release merge before continuing:

   ```bash
   npm run typecheck
   npm run lint
   npm test -- src/core/controllers/auth/auth.single-approval-seams.test.ts src/core/controllers/auth/auth.single-approval.test.ts src/core/services/homeserver/homeserver.test.ts
   ```

6. Stage 3 is shell/navigation integration only. Resolve upstream shell and navigation changes against Aldert's newly merged Marketplace UI, not against the pre-redesign UI. Aldert's Marketplace-visible layout, navigation, copy, responsive behavior, and interaction design win conflicts.

7. Stage 4 regenerates VRT baselines only for Marketplace scenes affected by the merged redesign or Stage 3 shell/navigation integration. Before accepting updates:

   - list the intended Marketplace baseline paths;
   - run the focused Marketplace VRT update;
   - inspect `git status`;
   - discard every changed baseline outside the intended Marketplace set;
   - run PASS, deliberate FAIL, then PASS calibration.

8. Run the focused auth/private-path proof again, then typecheck, lint, build, the focused Marketplace suite, and one final full unit suite. Classify the 104 deferred failures against the recorded baseline instead of silently refreshing them.

9. Before any commit or push:

   ```bash
   find . -name '._*' -delete
   git diff --check
   git status --short
   git log -N --format='%(trailers:key=Co-authored-by)'
   git remote -v
   ```

   Push only `origin` (`BitcoinErrorLog/pubky-app`). The `upstream` push URL remains disabled.
