'use client';

import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/atoms/Sheet/Sheet';
import { Typography } from '@/atoms/Typography/Typography';
import { usePubchiQuery } from '@/hooks/usePubchiQuery/usePubchiQuery';
import { QUERY_FORM_FIELDS } from '@/hooks/usePubchiQuery/usePubchiQuery.types';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { useAuthStore } from '@/stores/auth/auth.store';

export const PUBCHI_PANEL_SURFACE = 'pubchi-panel';

export type PubchiPanelProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

export function PubchiPanel({ open, onOpenChange }: PubchiPanelProps) {
  const { form, submit, applyFeed, result, errorCode, loading, enabled } = usePubchiQuery();
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);

  if (!enabled || !isPubchiPanelEnabled()) {
    return null;
  }

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

          <form
            className="flex flex-col gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void submit();
            }}
          >
            <ControlledTextareaField
              name={QUERY_FORM_FIELDS.QUESTION}
              control={form.control}
              label="Question"
              placeholder="Who tagged me?"
            />
            <Button type="submit" data-testid="pubchi-ask" disabled={loading}>
              Ask
            </Button>
          </form>

          {errorCode ? (
            <Typography data-testid="pubchi-error" size="sm">
              {errorCode}
            </Typography>
          ) : null}

          {result?.kind === 'query' ? (
            <div className="flex flex-col gap-3" data-testid="pubchi-evidence">
              {result.result.items.map((item) => {
                const href = pubkyUriToAppHref(item.source_uri, currentUserPubky);
                return (
                  <Card key={`${item.source_uri}-${item.label}`}>
                    <CardHeader>
                      <CardTitle>{item.label}</CardTitle>
                    </CardHeader>
                    <CardContent className="flex flex-col gap-1">
                      <Typography size="sm">Claimants: {item.claimant_count}</Typography>
                      {href ? (
                        <Link href={href} className="text-sm break-all underline">
                          {item.source_uri}
                        </Link>
                      ) : (
                        <Typography size="sm" className="break-all">
                          {item.source_uri}
                        </Typography>
                      )}
                    </CardContent>
                  </Card>
                );
              })}
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
