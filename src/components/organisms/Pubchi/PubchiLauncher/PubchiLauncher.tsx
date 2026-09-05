'use client';

import { useState } from 'react';
import { Bot } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { isPubchiPanelEnabled } from '@/libs/pubchi/flags';
import { PubchiPanel } from '@/organisms/Pubchi/PubchiPanel/PubchiPanel';

export function PubchiLauncher() {
  const [open, setOpen] = useState(false);

  if (!isPubchiPanelEnabled()) {
    return null;
  }

  return (
    <>
      <Button
        type="button"
        variant="secondary"
        size="icon"
        className="fixed right-4 bottom-24 z-40 md:bottom-8"
        data-testid="pubchi-open"
        aria-label="Open Pubchi"
        onClick={() => setOpen(true)}
      >
        <Bot className="h-5 w-5" />
      </Button>
      <PubchiPanel open={open} onOpenChange={setOpen} />
    </>
  );
}
