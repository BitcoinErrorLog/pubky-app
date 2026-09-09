'use client';

import { Bot, CircleHelp, Rss, Search, Sparkles, Users } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';
import type { Phase0Purpose } from '@/libs/pubchi/schemas';

export type PubchiCapabilitiesProps = {
  tier: 'read-only' | 'assisted' | 'autonomous';
  compact?: boolean;
  disabled?: boolean;
  onSelect: (question: string, purpose: Phase0Purpose) => void;
  onBuildFeed: () => void;
};

const quickQuestions: Array<{ label: string; question: string; purpose: Phase0Purpose; icon: typeof Search }> = [
  { label: 'Who tagged me?', question: 'Who tagged me?', purpose: 'who-tagged-me', icon: Users },
  { label: 'Most followed users', question: 'Who are the most followed users on Pubky?', purpose: 'ask', icon: Search },
  { label: 'Active threads', question: 'What are the most active threads right now?', purpose: 'ask', icon: Sparkles },
  { label: 'Trending tags', question: 'What tags are trending this week?', purpose: 'ask', icon: Search },
  { label: 'Who should I follow?', question: 'Who should I follow?', purpose: 'ask', icon: Users },
  { label: 'Quiet follows', question: 'Which accounts I follow have gone quiet?', purpose: 'ask', icon: CircleHelp },
];

export function PubchiCapabilities({ tier, compact = false, disabled = false, onSelect, onBuildFeed }: PubchiCapabilitiesProps) {
  const content = (
    <>
      <div className={compact ? 'flex w-full flex-wrap gap-2 pb-1' : 'grid gap-2 sm:grid-cols-2'}>
        {quickQuestions.map(({ label, question, purpose, icon: Icon }) => (
          <Button
            key={question}
            data-testid={purpose === 'who-tagged-me' ? 'pubchi-who-tagged-me' : undefined}
            type="button"
            variant="secondary"
            className={compact ? 'shrink-0' : 'justify-start'}
            disabled={disabled}
            onClick={() => onSelect(question, purpose)}
          >
            <Icon aria-hidden="true" />
            {label}
          </Button>
        ))}
        <Button type="button" data-testid="pubchi-build-feed" variant="secondary" className={compact ? 'shrink-0' : 'justify-start'} disabled={disabled} onClick={onBuildFeed}>
          <Rss aria-hidden="true" />
          Build feed
        </Button>
      </div>
      {!compact ? (
        <div className="rounded-lg border border-dashed border-border p-3 opacity-60" aria-disabled="true">
          <div className="flex items-center gap-2">
            <Bot aria-hidden="true" className="size-4" />
            <Typography size="sm" className="font-medium">Coming with Autonomous</Typography>
            <Badge variant="outline">Not available</Badge>
          </div>
          <Typography size="sm" className="mt-1">Posting, replying, and proactive digests — not in this version.</Typography>
        </div>
      ) : null}
    </>
  );

  if (compact) return <div data-testid="pubchi-capabilities-compact">{content}</div>;

  return (
    <Card data-surface="pubchi-capabilities" data-testid="pubchi-capabilities">
      <CardHeader>
        <CardTitle>What it can do</CardTitle>
        <Typography size="sm" className="text-muted-foreground">
          {tier === 'assisted' ? 'Your Pubchi can prepare changes for your review.' : 'Read-only questions and feed previews.'}
        </Typography>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">{content}</CardContent>
    </Card>
  );
}
