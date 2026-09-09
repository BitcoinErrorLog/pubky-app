'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/atoms/Sheet/Sheet';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { usePubchiQuery } from '@/hooks/usePubchiQuery/usePubchiQuery';
import { QUERY_FORM_FIELDS } from '@/hooks/usePubchiQuery/usePubchiQuery.types';
import { PUBCHI_DEGRADED_SESSION_MESSAGE } from '@/libs/pubchi/capabilities';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { useAuthStore } from '@/stores/auth/auth.store';
import { PubchiAnswerCard } from '../PubchiAnswerCard/PubchiAnswerCard';

export const PUBCHI_PANEL_SURFACE = 'pubchi-panel';

export type PubchiPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PubchiPanel({ open, onOpenChange }: PubchiPanelProps) {
  const {
    form, submit, applyFeed, result, errorCode, loading, elapsedMs, enabled, pubchiAvailable,
    signingAvailable, signingUnavailableMessage, setupDevice, setupLoading,
  } = usePubchiQuery();
  const {
    needsReapproval,
    reapprove,
    loading: reapprovalLoading,
  } = usePubchiEnrollment();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const question = form.watch(QUERY_FORM_FIELDS.QUESTION);

  if (!enabled || !isPubchiPanelEnabled()) {
    return null;
  }

  const actionsDisabled = loading || setupLoading || !signingAvailable;

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
            <div className="flex flex-col gap-2 sm:flex-row">
              <Button type="submit" data-testid="pubchi-ask" disabled={actionsDisabled}>
                Ask {loading ? <span data-testid="pubchi-ask-timer">({elapsedMs} ms)</span> : null}
              </Button>
              <Button
                type="button"
                variant="secondary"
                data-testid="pubchi-who-tagged-me"
                disabled={actionsDisabled}
                onClick={() => {
                  void submit('who-tagged-me');
                }}
              >
                Who tagged me?
              </Button>
              <Button
                type="button"
                variant="secondary"
                data-testid="pubchi-build-feed"
                disabled={actionsDisabled}
                onClick={() => {
                  void submit('build-feed');
                }}
              >
                Build feed
              </Button>
            </div>
          </form>

          {errorCode ? (
            <Typography data-testid="pubchi-error" size="sm">
              {errorCode}
            </Typography>
          ) : null}

          {result?.kind === 'answer' ? <PubchiAnswerCard answer={result.result} currentUserPubky={currentUserPubky} /> : null}

          {result?.kind === 'query' ? (
            <div className="flex flex-col gap-3" data-testid="pubchi-evidence">
              {result.result.items.length > 0 ? result.result.items.map((item) => {
                const href = pubkyUriToAppHref(item.source_uri, currentUserPubky);
                return (
                  <Card key={`${item.source_uri}-${item.label}`}>
                    <CardContent className="flex flex-col gap-1 pt-4">
                      <CardTitle>{item.label}</CardTitle>
                      <Typography size="sm">Claimants: {item.claimant_count}</Typography>
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

          {result?.kind === 'feed' ? (
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

          {result?.kind === 'feed-unsupported' ? (
            <Typography data-testid="pubchi-error" size="sm">
              {result.code}
            </Typography>
          ) : null}
        </div>
      </SheetContent>
    </Sheet>
  );
}
