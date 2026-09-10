'use client';

import { useEffect, useState } from 'react';
import { getUserProfileUrl } from '@/app/routes';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/atoms/Collapsible/Collapsible';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { UserController } from '@/controllers/user/user';
import { linkifyPubkys } from '@/libs/pubchi/capabilities-v1';
import type { PubchiAnswerV1, PubchiEvidenceV1 } from '@/libs/pubchi/schemas';
import { pubkyUriToAppHref } from '@/libs/pubchi/uri';

type PubchiAnswerCardProps = {
  answer: PubchiAnswerV1;
  currentUserPubky?: string | null;
  cursorSource?: 'device' | 'remote' | 'none';
};

const icons = {
  user: '●',
  post: '▤',
  tag: '#',
  claim: '◇',
} as const;

export function PubchiAnswerCard({ answer, currentUserPubky, cursorSource = 'none' }: PubchiAnswerCardProps) {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    const claimantIds = [...new Set(answer.evidence.filter((item) => item.kind !== 'user').flatMap((item) => item.claimants))];
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
        <div className="flex flex-col gap-3" data-testid="pubchi-answer-evidence">
          {(['post', 'claim', 'tag', 'user'] as const).map((kind) => {
            const items = answer.evidence.filter((item) => item.kind === kind);
            if (items.length === 0) return null;
            return (
              <section key={kind} data-testid={`pubchi-evidence-section-${kind}`}>
                <Typography size="sm" className="mb-1 font-medium capitalize">{kind}s</Typography>
                <div className="flex flex-col gap-2">
                  {items.map((item) => (
                    <EvidenceItem
                      key={`${item.uri}-${item.label}`}
                      item={item}
                      names={names}
                      tools={answer.tool_trace_summary.tools}
                      currentUserPubky={currentUserPubky}
                    />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>{hasDeterministicRoute(answer.tool_trace_summary.tools) ? 'What the graph shows' : "Pubchi's reading of the evidence"}</CardTitle>
        </CardHeader>
        <CardContent>
          <Typography size="sm">
            {answer.summary ? linkifyPubkys(answer.summary).map((part, index) => (
              typeof part === 'string' ? part : (
                <Link key={`${part.pubky}-${index}`} href={getUserProfileUrl(part.pubky, currentUserPubky)} className="underline">
                  pubky:{part.pubky}
                </Link>
              )
            )) : 'No evidence was found for this question.'}
          </Typography>
        </CardContent>
      </Card>
      {answer.continuation ? (
        <Typography data-testid="pubchi-cursor-status" size="xs" className="text-muted-foreground">
          Since {new Date(answer.continuation.since).toLocaleString()} · {answer.continuation.complete ? 'complete' : 'partial — cursor kept'}
          {cursorSource === 'device' ? ' · cursor kept on this device' : ''}
        </Typography>
      ) : null}

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
  tools,
  currentUserPubky,
}: {
  item: PubchiEvidenceV1;
  names: Map<string, string>;
  tools: string[];
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
        <Typography size="sm">
          {countLabel(tools)}: {item.claimant_count}
        </Typography>
        {item.kind !== 'user' ? (
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
        ) : null}
      </CardContent>
    </Card>
  );
}

const DETERMINISTIC_TOOLS = new Set([
  'nexus_influencer',
  'rank_users',
  'rank_tags_recv',
  'rank_tags_apply',
  'nexus_user_tags',
  'get_tag_landscape',
  'tag_landscape',
  'top_posts',
  'recommend_follows',
  'recommend',
  'stale_follows',
]);

function hasDeterministicRoute(tools: string[]): boolean {
  return tools.length > 0 && tools.every((tool) => DETERMINISTIC_TOOLS.has(tool));
}

function countLabel(tools: string[]): string {
  if (tools.some((tool) => tool === 'nexus_user_tags' || tool === 'get_tag_landscape' || tool === 'tag_landscape')) return 'Tagged by';
  if (tools.some((tool) => tool === 'nexus_influencer' || tool === 'rank_users')) return 'Followers';
  if (tools.some((tool) => tool === 'rank_tags_recv')) return 'Tags received';
  if (tools.some((tool) => tool === 'rank_tags_apply')) return 'Tags applied';
  if (tools.includes('top_posts')) return 'Replies';
  if (tools.some((tool) => tool === 'recommend_follows' || tool === 'recommend' || tool === 'stale_follows')) return 'Count';
  return 'Claimants';
}
