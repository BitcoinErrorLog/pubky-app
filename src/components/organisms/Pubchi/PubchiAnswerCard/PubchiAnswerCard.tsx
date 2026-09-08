'use client';

import { useEffect, useState } from 'react';
import { getUserProfileUrl } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { UserController } from '@/controllers/user/user';
import type { PubchiAnswerV1, PubchiEvidenceV1 } from '@/libs/pubchi/schemas';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';

type PubchiAnswerCardProps = {
  answer: PubchiAnswerV1;
  currentUserPubky?: string | null;
};

const icons = {
  user: '●',
  post: '▤',
  tag: '#',
  claim: '◇',
} as const;

export function PubchiAnswerCard({ answer, currentUserPubky }: PubchiAnswerCardProps) {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    const claimantIds = [...new Set(answer.evidence.flatMap((item) => item.claimants))];
    if (claimantIds.length === 0) return;
    void Promise.all(
      claimantIds.map(async (userId) => {
        const user = await UserController.getOrFetch({ userId });
        return [userId, user?.name || userId] as const;
      }),
    ).then((entries) => {
      if (active) setNames(new Map(entries));
    });
    return () => {
      active = false;
    };
  }, [answer]);

  return (
    <div data-surface="pubchi-answer" data-testid="pubchi-answer" className="flex flex-col gap-3">
      {answer.evidence.length > 0 ? (
        <div className="flex flex-col gap-2" data-testid="pubchi-answer-evidence">
          {answer.evidence.map((item) => (
            <EvidenceItem key={`${item.uri}-${item.label}`} item={item} names={names} currentUserPubky={currentUserPubky} />
          ))}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Pubchi&apos;s reading of the evidence</CardTitle>
        </CardHeader>
        <CardContent>
          <Typography size="sm">{answer.summary || 'No evidence was found for this question.'}</Typography>
        </CardContent>
      </Card>

      {answer.sources.length > 0 ? (
        <Collapsible>
          <CollapsibleTrigger className="text-left text-sm underline">Sources</CollapsibleTrigger>
          <CollapsibleContent className="flex flex-col gap-1 pt-2">
            {answer.sources.map((source) => {
              const href = pubkyUriToAppHref(source, currentUserPubky);
              return href ? (
                <Link key={source} href={href} className="break-all text-sm underline">
                  {source}
                </Link>
              ) : (
                <Typography key={source} size="sm" className="break-all">
                  {source}
                </Typography>
              );
            })}
          </CollapsibleContent>
        </Collapsible>
      ) : null}

      <Collapsible>
        <CollapsibleTrigger className="text-left text-sm underline">Tool trace</CollapsibleTrigger>
        <CollapsibleContent>
          <Typography size="sm">
            {answer.tool_trace_summary.tools.join(', ') || 'none'} · {answer.tool_trace_summary.call_count} calls
            {answer.tool_trace_summary.truncated ? ' · truncated' : ''}
          </Typography>
        </CollapsibleContent>
      </Collapsible>
    </div>
  );
}

function EvidenceItem({
  item,
  names,
  currentUserPubky,
}: {
  item: PubchiEvidenceV1;
  names: Map<string, string>;
  currentUserPubky?: string | null;
}) {
  const href = pubkyUriToAppHref(item.uri, currentUserPubky);
  return (
    <Card>
      <CardContent className="flex flex-col gap-2 pt-4">
        <div className="flex items-center gap-2">
          <span aria-hidden="true">{icons[item.kind]}</span>
          {href ? (
            <Link href={href} className="font-medium underline">
              {item.label}
            </Link>
          ) : (
            <Typography>{item.label}</Typography>
          )}
          {item.in_your_graph === true ? <Badge>In your graph</Badge> : null}
        </div>
        <Typography size="sm">Claimants: {item.claimant_count}</Typography>
        <div className="flex flex-wrap gap-2">
          {item.claimants.slice(0, 3).map((claimant) => (
            <Link key={claimant} href={getUserProfileUrl(claimant, currentUserPubky)} className="text-sm underline">
              <span className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs" aria-hidden="true">
                {(names.get(claimant) ?? claimant).slice(0, 1).toUpperCase()}
              </span>
              {names.get(claimant) ?? claimant}
            </Link>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
