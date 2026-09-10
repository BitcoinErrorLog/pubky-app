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
import type { ExecutionScope, PubchiAnswerV1, PubchiEvidenceV1 } from '@/libs/pubchi/schemas';
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

const C3_SECTIONS = [
  { id: 'followed_posts', label: 'Posts from people you follow' },
  { id: 'replies_to_you', label: 'Replies to you' },
  { id: 'tags_on_you', label: 'Tags on you' },
] as const;

type EvidenceGroup = {
  id: string;
  label: string;
  items: PubchiEvidenceV1[];
  more: number;
};

export function PubchiAnswerCard({ answer, currentUserPubky, cursorSource = 'none' }: PubchiAnswerCardProps) {
  const [names, setNames] = useState<Map<string, string>>(new Map());

  useEffect(() => {
    let active = true;
    const claimantIds = [
      ...new Set(answer.evidence.filter((item) => item.kind !== 'user').flatMap((item) => item.claimants)),
    ];
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
          {groupEvidence(answer).map((group) => {
            return (
              <section key={group.id} data-testid={`pubchi-evidence-section-${group.id}`}>
                <Typography size="sm" className="mb-1 font-medium">
                  {group.label} ({group.items.length})
                </Typography>
                <div className="flex flex-col gap-2">
                  {group.items.map((item) => (
                    <EvidenceItem
                      key={`${item.uri}-${item.label}`}
                      item={item}
                      names={names}
                      tools={answer.tool_trace_summary.tools}
                      currentUserPubky={currentUserPubky}
                    />
                  ))}
                </div>
                {group.more > 0 ? (
                  <Typography size="sm" className="text-muted-foreground">
                    and {group.more} more
                  </Typography>
                ) : null}
              </section>
            );
          })}
        </div>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>
            {answer.basis && answer.basis !== 'graph'
              ? 'From what I know'
              : hasDeterministicRoute(answer.tool_trace_summary.tools)
                ? 'What the graph shows'
                : "Pubchi's reading of the evidence"}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {answer.scope && (answer.basis === undefined || answer.basis === 'graph' || answer.basis === 'mixed') ? (
            <Typography data-testid="pubchi-answer-scope" size="xs" className="mb-2 text-muted-foreground">
              {formatScopeLine(answer.scope)}
            </Typography>
          ) : null}
          <Typography size="sm">
            {answer.summary && (answer.basis === undefined || answer.basis === 'graph' || answer.basis === 'mixed')
              ? linkifyPubkys(answer.summary).map((part, index) =>
                  typeof part === 'string' ? (
                    part
                  ) : (
                    <Link
                      key={`${part.pubky}-${index}`}
                      href={getUserProfileUrl(part.pubky, currentUserPubky)}
                      className="underline"
                    >
                      pubky:{part.pubky}
                    </Link>
                  ),
                )
              : answer.summary || 'No evidence was found for this question.'}
          </Typography>
        </CardContent>
      </Card>
      {answer.citations?.length ? (
        <Card data-testid="pubchi-answer-citations">
          <CardHeader>
            <CardTitle>Sources</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            {answer.citations.map((citation) => (
              <div key={citation.url} className="flex flex-col gap-1">
                <a href={citation.url} target="_blank" rel="noopener noreferrer" className="text-sm underline">
                  {citation.title}
                </a>
                {citation.snippet ? <Typography size="sm">{citation.snippet}</Typography> : null}
                {citation.corpus_version ? (
                  <Typography size="xs" className="text-muted-foreground">
                    Corpus version: {citation.corpus_version}
                  </Typography>
                ) : null}
              </div>
            ))}
          </CardContent>
        </Card>
      ) : null}
      {answer.continuation ? (
        <Typography data-testid="pubchi-cursor-status" size="xs" className="text-muted-foreground">
          Since {new Date(answer.continuation.since).toLocaleString()} ·{' '}
          {answer.continuation.complete ? 'complete' : 'partial — cursor kept'}
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
                <Link key={source} href={href} className="text-sm break-all underline">
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

function groupEvidence(answer: PubchiAnswerV1): EvidenceGroup[] {
  const hasSections = answer.evidence.some((item) => item.section !== undefined);
  if (!hasSections) {
    return genericEvidenceGroups(answer.evidence);
  }

  const sectionGroups = C3_SECTIONS.flatMap((section) => {
    const items = answer.evidence.filter((item) => item.section === section.id);
    return items.length > 0
      ? [{ id: section.id, label: section.label, items, more: moreEvidenceCount(answer, items.length) }]
      : [];
  });
  const unsectioned = answer.evidence.filter((item) => item.section === undefined);
  return [...sectionGroups, ...genericEvidenceGroups(unsectioned)];
}

function genericEvidenceGroups(evidence: PubchiEvidenceV1[]): EvidenceGroup[] {
  return (['post', 'claim', 'tag', 'user'] as const).flatMap((kind) => {
    const items = evidence.filter((item) => item.kind === kind);
    return items.length > 0 ? [{ id: kind, label: `${kind}s`, items, more: 0 }] : [];
  });
}

function moreEvidenceCount(answer: PubchiAnswerV1, itemCount: number): number {
  return answer.tool_trace_summary.truncated && answer.continuation?.skipped && itemCount > 0
    ? answer.continuation.skipped
    : 0;
}

function formatScopeLine(scope: ExecutionScope): string {
  if (scope.graph.kind === 'none') return 'No graph lookup';

  const graph =
    scope.graph.kind === 'whole_graph'
      ? 'whole graph'
      : `your network${scope.graph.hops ? ` (${scope.graph.hops} hops)` : ''}`;
  if (scope.time === null) return `Scope: current indexed graph (no time filter) · ${graph}`;

  const since = formatUtcDate(scope.time.since_ms);
  const until = formatUtcDate(scope.time.until_ms, scope.time.since_ms);
  return `Scope: ${scope.time.label} (${since}–${until} UTC) · ${graph}`;
}

function formatUtcDate(timestamp: number, rangeStart?: number): string {
  if (rangeStart !== undefined) {
    const startParts = utcDateParts(rangeStart);
    const endParts = utcDateParts(timestamp);
    if (startParts.month === endParts.month && startParts.year === endParts.year) return String(endParts.day);
  }
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    timeZone: 'UTC',
  }).format(timestamp);
}

function utcDateParts(timestamp: number): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    timeZone: 'UTC',
  }).formatToParts(timestamp);
  return {
    year: Number(parts.find((part) => part.type === 'year')?.value),
    month: Number(parts.find((part) => part.type === 'month')?.value),
    day: Number(parts.find((part) => part.type === 'day')?.value),
  };
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
                <span
                  className="mr-1 inline-flex h-5 w-5 items-center justify-center rounded-full bg-muted text-xs"
                  aria-hidden="true"
                >
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
  if (tools.some((tool) => tool === 'nexus_user_tags' || tool === 'get_tag_landscape' || tool === 'tag_landscape'))
    return 'Tagged by';
  if (tools.some((tool) => tool === 'nexus_influencer' || tool === 'rank_users')) return 'Followers';
  if (tools.some((tool) => tool === 'rank_tags_recv')) return 'Tags received';
  if (tools.some((tool) => tool === 'rank_tags_apply')) return 'Tags applied';
  if (tools.includes('top_posts')) return 'Replies';
  if (tools.some((tool) => tool === 'recommend_follows' || tool === 'recommend' || tool === 'stale_follows'))
    return 'Count';
  return 'Claimants';
}
