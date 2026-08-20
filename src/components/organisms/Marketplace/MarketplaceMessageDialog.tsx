'use client';

import { useState } from 'react';
import { MessageCircle, Send } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from '@/atoms/Dialog/Dialog';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceMessages } from '@/hooks/useMarketplaceMessages/useMarketplaceMessages';
import { useRequireAuth } from '@/hooks/useRequireAuth/useRequireAuth';
import { cn } from '@/libs/utils/utils';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { useAuthStore } from '@/stores/auth/auth.store';

export function MarketplaceMessageDialog({ sellerPubky, listingId }: { sellerPubky: string; listingId: string }) {
  const [open, setOpen] = useState(false);
  const currentUserPubky = useAuthStore((state) => state.currentUserPubky);
  const { requireAuth } = useRequireAuth();
  const messages = useMarketplaceMessages(sellerPubky, listingId);

  const submit = async () => {
    await messages.submit();
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(nextOpen) => {
        if (!nextOpen) {
          setOpen(false);
          return;
        }
        requireAuth(() => setOpen(true));
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="secondary"
          className="w-full rounded-full"
          disabled={Boolean(currentUserPubky && currentUserPubky === sellerPubky)}
        >
          <MessageCircle className="mr-2 size-4" />
          Message seller
        </Button>
      </DialogTrigger>
      <DialogContent className="border-border bg-popover sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Listing conversation</DialogTitle>
        </DialogHeader>
        <div className="max-h-80 space-y-3 overflow-y-auto rounded-xl border bg-card/50 p-4">
          {messages.conversation?.messages.length ? (
            messages.conversation.messages.map((message) => {
              const mine = message.senderPubky === currentUserPubky;
              return (
                <div key={message.id} className={cn('flex', mine ? 'justify-end' : 'justify-start')}>
                  <div
                    className={cn(
                      'max-w-[85%] rounded-2xl px-4 py-2 text-sm',
                      mine ? 'bg-brand text-primary-foreground' : 'bg-secondary text-secondary-foreground',
                    )}
                  >
                    {message.text}
                  </div>
                </div>
              );
            })
          ) : (
            <Typography as="p" className="py-8 text-center text-sm text-muted-foreground">
              Ask about condition, shipping, or item details. Do not share payment credentials.
            </Typography>
          )}
        </div>
        <ControlledTextareaField
          name="text"
          control={messages.form.control}
          label="Message"
          placeholder="Is this still available?"
          rows={3}
        />
        {messages.error && (
          <Typography as="p" role="alert" className="text-sm text-destructive">
            {messages.error}
          </Typography>
        )}
        <DialogFooter>
          <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
            Close
          </Button>
          <Button className="rounded-full" onClick={submit}>
            <Send className="mr-2 size-4" />
            Send
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
