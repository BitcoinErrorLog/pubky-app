'use client';

import { useState } from 'react';
import { PubkyAppFeedLayout, PubkyAppFeedReach, PubkyAppFeedSort, PubkyAppPostKind } from 'pubky-app-specs';
import { Button } from '@/atoms/Button/Button';
import { Typography } from '@/atoms/Typography/Typography';
import { TAGGED_AS_FILTER_KEY } from '@/config/feed';
import { FeedController } from '@/controllers/feed/feed';
import { publishPubchiSync } from '@/controllers/pubchi/pubchi-sync';
import { CUSTOM_FEED_CONTENT_ALL, type CustomFeedFormData } from '@/hooks/useCustomFeedForm/useCustomFeedForm.types';
import { feedProposalV2ToCreateParams } from '@/libs/pubchi/feed-map';
import { recordPubchiBuiltFeed } from '@/libs/pubchi/feed-provenance';
import type { FeedProposalV2 } from '@/libs/pubchi/schemas';
import { toast } from '@/molecules/Toaster/toast';
import { CustomFeedDialog } from '@/organisms/CustomFeedDialog/CustomFeedDialog';
import { useAuthStore } from '@/stores/auth/auth.store';

export type PubchiFeedBuilderProps = {
  proposal: FeedProposalV2;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onInterpret: (question: string, replaceAll: boolean) => Promise<void>;
};

const reachValues: Record<string, PubkyAppFeedReach> = {
  following: PubkyAppFeedReach.Following,
  friends: PubkyAppFeedReach.Friends,
  all: PubkyAppFeedReach.All,
  wot: PubkyAppFeedReach.Wot,
  me: PubkyAppFeedReach.Me,
};

const sortValues: Record<string, PubkyAppFeedSort> = {
  recent: PubkyAppFeedSort.Recent,
  popularity: PubkyAppFeedSort.Popularity,
};

const layoutValues: Record<string, PubkyAppFeedLayout> = {
  columns: PubkyAppFeedLayout.Columns,
  wide: PubkyAppFeedLayout.Wide,
  visual: PubkyAppFeedLayout.Visual,
  list: PubkyAppFeedLayout.List,
};

const contentValues: Record<string, PubkyAppPostKind> = {
  short: PubkyAppPostKind.Short,
  long: PubkyAppPostKind.Long,
  image: PubkyAppPostKind.Image,
  video: PubkyAppPostKind.Video,
  link: PubkyAppPostKind.Link,
  file: PubkyAppPostKind.File,
  collection: PubkyAppPostKind.Collection,
};

function initialValues(proposal: FeedProposalV2): CustomFeedFormData {
  const config = proposal.feed.feed;
  return {
    name: proposal.feed.name,
    icon: proposal.feed.icon,
    tags: config.tags ?? [],
    domain_tags: config.domain_tags ?? [],
    reach: reachValues[config.reach] ?? PubkyAppFeedReach.All,
    sort: sortValues[config.sort] ?? PubkyAppFeedSort.Recent,
    layout: layoutValues[config.layout] ?? PubkyAppFeedLayout.Columns,
    content: config.content ? (contentValues[config.content] ?? CUSTOM_FEED_CONTENT_ALL) : CUSTOM_FEED_CONTENT_ALL,
  };
}

export function PubchiFeedBuilder({ proposal, open, onOpenChange, onInterpret }: PubchiFeedBuilderProps) {
  const [question, setQuestion] = useState('');
  const [replaceAll, setReplaceAll] = useState(false);
  const mapped = feedProposalV2ToCreateParams(proposal);
  const owner = useAuthStore((state) => state.currentUserPubky);
  const hasFollowers = proposal.feed.feed.reach === 'followers';

  const save = async (data: CustomFeedFormData): Promise<boolean> => {
    if (!mapped.canApply || !owner) return false;
    try {
      const changes = {
        ...data,
        reach: data.reach === TAGGED_AS_FILTER_KEY ? PubkyAppFeedReach.Wot : data.reach,
        content: data.content === CUSTOM_FEED_CONTENT_ALL ? null : data.content,
      };
      const feed = await FeedController.commitCreate(changes);
      await recordPubchiBuiltFeed(owner, proposal, feed);
      publishPubchiSync(owner, 'created');
      toast({ title: 'Feed applied' });
      onOpenChange(false);
      return true;
    } catch {
      toast({ variant: 'error', description: 'Could not apply feed. Try again.' });
      return false;
    }
  };

  const notices = proposal.mapping.unmapped.map((entry) => (
    <Typography key={`${entry.request}-${entry.reason}`} size="xs" className="text-muted-foreground">
      {entry.suggestion ?? entry.request}
    </Typography>
  ));

  return (
    <CustomFeedDialog
      mode="create"
      open={open}
      onOpenChange={onOpenChange}
      initialValues={initialValues(proposal)}
      onSubmitOverride={save}
      saveLabel={mapped.canApply ? 'Apply feed' : 'Choose supported settings'}
      extraContent={
        <div className="flex flex-col gap-3 rounded-md border border-dashed p-3" data-testid="pubchi-feed-builder">
          <div>
            <Typography className="font-medium">Explain this feed</Typography>
            <Typography size="xs" className="text-muted-foreground">
              Every setting is editable. Preview uses posts cached on this device; the installed feed may differ.
            </Typography>
          </div>
          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder="Describe what to change…"
            className="min-h-20 rounded-md border bg-background p-2 text-sm"
            data-testid="pubchi-feed-interpret-input"
          />
          <div className="flex items-center gap-2">
            <input
              id="pubchi-feed-replace"
              type="checkbox"
              checked={replaceAll}
              onChange={(event) => setReplaceAll(event.target.checked)}
            />
            <label htmlFor="pubchi-feed-replace" className="text-sm">
              Replace all settings
            </label>
            <Button
              type="button"
              variant="secondary"
              onClick={() => void onInterpret(question, replaceAll)}
              disabled={!question.trim()}
            >
              Interpret
            </Button>
          </div>
          {hasFollowers ? (
            <Typography size="xs" role="alert" className="text-destructive">
              Followers was requested but is not available in this App — choose another reach.
            </Typography>
          ) : null}
          {notices}
          <Typography size="xs" className="text-muted-foreground">
            Preview from this device — no matching cached posts yet. This does not block saving.
          </Typography>
        </div>
      }
    />
  );
}
