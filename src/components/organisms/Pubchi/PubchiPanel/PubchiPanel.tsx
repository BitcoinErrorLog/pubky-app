'use client';

import { useEffect } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/atoms/Sheet/Sheet';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { PubchiController } from '@/controllers/pubchi/pubchi';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { usePubchiQuery } from '@/hooks/usePubchiQuery/usePubchiQuery';
import { QUERY_FORM_FIELDS } from '@/hooks/usePubchiQuery/usePubchiQuery.types';
import { PUBCHI_DEGRADED_SESSION_MESSAGE } from '@/libs/pubchi/capabilities';
import { parsePostReference } from '@/libs/pubchi/capabilities-v1';
import { effectiveTier } from '@/libs/pubchi/effective-tier';
import { pubchiErrorCopy } from '@/libs/pubchi/error-copy';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { useAuthStore } from '@/stores/auth/auth.store';
import { usePubchiStore } from '@/stores/pubchi/pubchi.store';
import { PubchiAnswerCard } from '../PubchiAnswerCard/PubchiAnswerCard';
import { PubchiCapabilities } from '../PubchiCapabilities/PubchiCapabilities';
import { PubchiFlyoutHeader } from '../PubchiFlyoutHeader/PubchiFlyoutHeader';

export const PUBCHI_PANEL_SURFACE = 'pubchi-panel';

export type PubchiPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PubchiPanel({ open, onOpenChange }: PubchiPanelProps) {
  const {
    form, submit, applyFeed, result, errorCode, loading, elapsedMs, enabled, pubchiAvailable,
    signingAvailable, signingUnavailableMessage, setupDevice, setupLoading, cursorSource,
  } = usePubchiQuery();
  const {
    needsReapproval,
    reapprove,
    loading: reapprovalLoading,
    pubchi,
    config,
  } = usePubchiEnrollment();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const prefill = usePubchiStore((state) => state.flyout.prefill);
  const question = form.watch(QUERY_FORM_FIELDS.QUESTION);
  const postReference = parsePostReference(question);

  useEffect(() => {
    if (!open) return;
    const nextPrefill = PubchiController.consumePrefill();
    if (!nextPrefill) return;
    form.setValue(QUERY_FORM_FIELDS.QUESTION, nextPrefill.question, { shouldValidate: true });
    document.getElementById(QUERY_FORM_FIELDS.QUESTION)?.focus();
  }, [form, open, prefill]);

  if (!enabled || !isPubchiPanelEnabled()) {
    return null;
  }

  const actionsDisabled = loading || setupLoading || !signingAvailable;
  const errorCopy = pubchiErrorCopy(errorCode);
  const tier = effectiveTier({
    desired: config?.tier ?? 'read-only',
    ceiling: 'assisted',
    sessionCoversPubchi: !needsReapproval,
  });

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="flex w-full flex-col gap-4 overflow-y-auto sm:max-w-md">
        <div data-surface={PUBCHI_PANEL_SURFACE} data-testid={PUBCHI_PANEL_SURFACE} className="flex flex-col gap-4">
          <SheetHeader>
            <SheetTitle className="flex items-center gap-2">
              <Bot className="h-5 w-5" />
              Pubchi
            </SheetTitle>
            <SheetDescription>Read-only questions. The service never receives your session or key.</SheetDescription>
          </SheetHeader>

          <PubchiFlyoutHeader
            pubchi={pubchi}
            tier={config?.tier}
            brainLabel={config?.brain.execution === 'self-hosted' ? 'Own endpoint' : 'Hosted Kimi'}
          />

          {needsReapproval ? (
            <div className="flex flex-col gap-3" data-testid="pubchi-degraded-session">
              <Typography size="sm">{PUBCHI_DEGRADED_SESSION_MESSAGE}</Typography>
              <Button type="button" disabled={reapprovalLoading} onClick={() => void reapprove()}>
                Re-approve
              </Button>
            </div>
          ) : null}

          {pubchiAvailable === false ? (
            <Typography data-testid="pubchi-not-enrolled" size="sm">
              Create a Pubchi in Settings to start asking.
            </Typography>
          ) : null}

          {!needsReapproval && pubchiAvailable !== false && !signingAvailable ? (
            <div className="flex flex-col gap-3" data-testid="pubchi-signing-unavailable">
              <Typography size="sm">{signingUnavailableMessage}</Typography>
              <Button
                type="button"
                data-testid="pubchi-setup-device"
                disabled={setupLoading}
                onClick={() => void setupDevice()}
              >
                {setupLoading ? 'Setting up…' : 'Set up this browser'}
              </Button>
            </div>
          ) : null}

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit('ask');
            }}
          >
            <ControlledTextareaField
              name={QUERY_FORM_FIELDS.QUESTION}
              control={form.control}
              label="Question"
              placeholder="Ask about your graph…"
            />
            <Typography size="xs" className="text-muted-foreground">
              {question.length}/500
            </Typography>
            <PubchiCapabilities
              compact
            tier={tier}
              disabled={actionsDisabled}
              onSelect={(nextQuestion, purpose) => {
                form.setValue(QUERY_FORM_FIELDS.QUESTION, nextQuestion, { shouldValidate: true });
                void submit(purpose);
              }}
              onBuildFeed={() => {
                void submit('build-feed');
              }}
            />
            {postReference ? (
              <Button
                type="button"
                variant="secondary"
                data-testid="pubchi-summarize-thread"
                disabled={actionsDisabled}
                onClick={() => {
                  form.setValue(QUERY_FORM_FIELDS.QUESTION, `Summarize this thread ${postReference.uri}`, { shouldValidate: true });
                  void submit('ask');
                }}
              >
                Summarize thread
              </Button>
            ) : null}
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" data-testid="pubchi-ask" disabled={actionsDisabled}>
                Ask {loading ? <span data-testid="pubchi-ask-timer">({elapsedMs} ms)</span> : null}
              </Button>
            </div>
          </form>

          {errorCode ? (
            <div data-testid="pubchi-error" role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <Typography size="sm">{errorCopy.message}</Typography>
              {errorCopy.settingsLink ? (
                <Link href={errorCopy.settingsLink} size="default">
                  Open Pubchi settings
                </Link>
              ) : null}
              {errorCopy.supportCode ? (
                <Typography size="xs" className="text-muted-foreground">
                  Support code: {errorCopy.supportCode}
                </Typography>
              ) : null}
            </div>
          ) : null}

          {loading ? <PubchiAnswerSkeleton elapsedMs={elapsedMs} /> : null}
          {!loading && result?.kind === 'answer' ? (
            <>
              <PubchiAnswerCard answer={result.result} currentUserPubky={currentUserPubky} cursorSource={cursorSource} />
            </>
          ) : null}

          {!loading && result?.kind === 'query' ? (
            <div className="flex flex-col gap-3" data-testid="pubchi-evidence">
              {result.result.items.length > 0 ? result.result.items.map((item) => {
                const href = pubkyUriToAppHref(item.source_uri, currentUserPubky);
                return (
                  <Card key={`${item.source_uri}-${item.label}`}>
                    <CardContent className="flex flex-col gap-1 pt-4">
                      <CardTitle>{item.label}</CardTitle>
                      <Typography size="sm">
                        Tagged by {item.claimant_count} {item.claimant_count === 1 ? 'account' : 'accounts'}
                      </Typography>
                      {href ? <Link href={href} className="text-sm break-all underline">Tagger</Link> : null}
                    </CardContent>
                  </Card>
                );
              }) : <Typography data-testid="pubchi-empty-query" size="sm">Nobody has tagged you yet.</Typography>}
              <Collapsible>
                <CollapsibleTrigger asChild>
                  <Button type="button" variant="ghost" data-testid="pubchi-tool-trace">
                    Tool trace
                  </Button>
                </CollapsibleTrigger>
                <CollapsibleContent>
                  <Typography size="sm">
                    {result.result.tool_trace_summary.tools.join(', ') || 'none'} ·{' '}
                    {result.result.tool_trace_summary.call_count} calls
                    {result.result.tool_trace_summary.truncated ? ' · truncated' : ''}
                  </Typography>
                </CollapsibleContent>
              </Collapsible>
            </div>
          ) : null}

          {!loading && result?.kind === 'feed' ? (
            <Card data-testid="pubchi-feed-preview">
              <CardHeader>
                <CardTitle>{result.result.feed.name}</CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-2">
                <Typography size="sm">Reach: {result.result.feed.feed.reach}</Typography>
                <Typography size="sm">Tags: {(result.result.feed.feed.tags ?? []).join(', ') || 'none'}</Typography>
                <Button
                  type="button"
                  data-testid="pubchi-apply-feed"
                  onClick={() => {
                    void applyFeed();
                  }}
                >
                  Apply
                </Button>
              </CardContent>
            </Card>
          ) : null}

          {!loading && result?.kind === 'feed-unsupported' ? (
            <div data-testid="pubchi-error" role="alert" className="flex flex-col gap-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
              <Typography size="sm">{pubchiErrorCopy(result.code).message}</Typography>
              <Typography size="xs" className="text-muted-foreground">
                Support code: {result.code}
              </Typography>
            </div>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function PubchiAnswerSkeleton({ elapsedMs }: { elapsedMs: number }) {
  return (
    <div className="flex flex-col gap-2" data-testid="pubchi-answer-loading">
      <Card>
        <CardContent className="flex flex-col gap-3 pt-4">
          <Skeleton className="h-5 w-2/3" />
          <Skeleton className="h-4 w-full" />
          <Skeleton className="h-4 w-5/6" />
          <Skeleton className="h-4 w-1/3" />
        </CardContent>
      </Card>
      <Typography size="xs" className="text-muted-foreground">
        Reading the graph… {Math.floor(elapsedMs / 1000)}s
      </Typography>
    </div>
  );
}
