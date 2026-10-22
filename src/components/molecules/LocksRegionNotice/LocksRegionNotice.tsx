'use client';

import { Info } from 'lucide-react';
import type { MouseEvent } from 'react';
import { Button, ButtonVariant } from '@/atoms/Button/Button';
import { Container } from '@/atoms/Container/Container';
import { Popover, PopoverContent, PopoverTrigger } from '@/atoms/Popover/Popover';
import { Typography } from '@/atoms/Typography/Typography';
import { cn } from '@/libs/utils/utils';
import type { LocksRegionNoticeProps } from './LocksRegionNotice.types';

// In a feed the notice sits inside the post card's click target, which navigates to the post.
const stopCardPropagation = (event: MouseEvent) => event.stopPropagation();

/**
 * One short line, with an info icon for the why, telling a reader or creator that paid unlocks are not
 * offered where they are. It replaces the action it explains (Unlock, the lock switch, the retry
 * screen) instead of sitting beside a live one, and it is calm, not an error: nothing here can be
 * retried and Bitkit is not involved.
 */
export function LocksRegionNotice({ cause = 'region', className }: LocksRegionNoticeProps) {
  return (
    <Container
      overrideDefaults
      role="status"
      data-testid="locks-region-notice"
      className={cn('flex items-center gap-2', className)}
      onClick={stopCardPropagation}
      onAuxClick={stopCardPropagation}
    >
      <Typography overrideDefaults className="text-base font-medium text-muted-foreground">
        {cause === 'unknown'
          ? "We can't tell where you are, so paid unlocks are paused."
          : "Paid unlocks aren't available in your region yet."}
      </Typography>
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant={ButtonVariant.GHOST}
            size="icon"
            className="size-6 text-muted-foreground"
            aria-label="About this limit"
            data-testid="locks-region-notice-info"
          >
            <Info aria-hidden />
          </Button>
        </PopoverTrigger>
        <PopoverContent side="top" align="start" sideOffset={6} className="p-3">
          <Typography overrideDefaults className="text-sm text-popover-foreground" data-testid="locks-region-info">
            {cause === 'unknown'
              ? "Paid unlocks depend on where you are, and we couldn't read your location. Free posts, content you already unlocked and everything else in Pubky work as usual."
              : 'Free posts, content you already unlocked and everything else in Pubky work as usual.'}
          </Typography>
        </PopoverContent>
      </Popover>
    </Container>
  );
}
