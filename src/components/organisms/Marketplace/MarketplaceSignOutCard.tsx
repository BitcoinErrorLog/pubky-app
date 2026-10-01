'use client';

import { LogOut } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Typography } from '@/atoms/Typography/Typography';
import { useSignOut } from '@/hooks/useSignOut/useSignOut';

/**
 * Shop sign-out for social link-out builds, where `/settings/account` (the
 * social settings page that otherwise holds sign-out) belongs to the social host.
 * Copy matches the account settings sign-out section.
 */
export function MarketplaceSignOutCard() {
  const { handleSignOut, isLoading } = useSignOut();

  return (
    <Card className="border" data-testid="marketplace-sign-out-card">
      <CardContent className="flex flex-col gap-3 px-6 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex gap-3">
          <LogOut className="mt-1 size-5 text-brand" />
          <div>
            <Typography as="h2" className="font-semibold">
              Sign out from Pubky
            </Typography>
            <Typography as="p" className="text-sm text-muted-foreground">
              Sign out to protect your account from unauthorized access.
            </Typography>
          </div>
        </div>
        <Button
          id="sign-out-btn"
          variant="secondary"
          className="shrink-0 rounded-full"
          disabled={isLoading}
          onClick={handleSignOut}
        >
          {isLoading ? 'Signing out...' : 'Sign out'}
        </Button>
      </CardContent>
    </Card>
  );
}
