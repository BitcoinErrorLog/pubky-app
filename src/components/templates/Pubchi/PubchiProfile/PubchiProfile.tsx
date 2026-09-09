'use client';

import { ArrowRight, Settings, Smartphone } from 'lucide-react';
import { Badge } from '@/atoms/Badge/Badge';
import { Card, CardContent, CardHeader, CardTitle } from '@/atoms/Card/Card';
import { Link } from '@/atoms/Link/Link';
import { Typography } from '@/atoms/Typography/Typography';
import { PubchiCapabilities } from '@/components/organisms/Pubchi/PubchiCapabilities/PubchiCapabilities';
import { PubchiProfileCard } from '@/components/organisms/Pubchi/PubchiProfileCard/PubchiProfileCard';
import { usePubchiEnrollment } from '@/hooks/usePubchiEnrollment/usePubchiEnrollment';
import { effectiveTier } from '@/libs/pubchi/effective-tier';

export function PubchiProfile() {
  const { pubchi, config, devices, needsReapproval } = usePubchiEnrollment();

  if (!pubchi) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6">
        <Typography size="xl" className="font-semibold">Your Pubchi</Typography>
        <Card><CardContent className="p-6"><Typography>Your Pubchi has not been created yet.</Typography><Link href="/settings/pubchi" className="mt-3 inline-flex items-center gap-2">Create it in Settings <ArrowRight aria-hidden="true" /></Link></CardContent></Card>
      </main>
    );
  }

  const tier = effectiveTier({
    desired: config?.tier ?? 'read-only',
    ceiling: 'assisted',
    sessionCoversPubchi: !needsReapproval,
  });
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 p-6" data-surface="pubchi-profile-page" data-testid="pubchi-profile-page">
      <div className="flex items-center justify-between gap-3">
        <div><Typography size="xl" className="font-semibold">Your Pubchi</Typography><Typography className="text-muted-foreground">Your graph assistant and its permissions.</Typography></div>
        <Link href="/settings/pubchi" className="inline-flex items-center gap-2"><Settings aria-hidden="true" /> Settings</Link>
      </div>
      <PubchiProfileCard bot={pubchi.bot} displayName={pubchi.displayName} createdAt={pubchi.createdAt} verified={pubchi.verified} backupConfirmed={Boolean(pubchi.backupConfirmedAt)} tier={tier} brainLabel={config?.brain.execution === 'self-hosted' ? 'Own endpoint' : 'Hosted Kimi'} />
      <PubchiCapabilities tier={tier} onSelect={() => undefined} onBuildFeed={() => undefined} />
      <Card data-testid="pubchi-built-feeds">
        <CardHeader><CardTitle>Feeds built by your Pubchi</CardTitle></CardHeader>
        <CardContent><Typography size="sm" className="text-muted-foreground">No Pubchi-built feeds yet. Build one from the Pubchi flyout.</Typography></CardContent>
      </Card>
      <Card data-testid="pubchi-devices">
        <CardHeader><CardTitle className="flex items-center gap-2"><Smartphone aria-hidden="true" /> Devices</CardTitle></CardHeader>
        <CardContent className="flex items-center justify-between gap-3"><Typography>{devices.length} device signer{devices.length === 1 ? '' : 's'}</Typography><Link href="/settings/pubchi" className="inline-flex items-center gap-2">Manage <ArrowRight aria-hidden="true" /></Link></CardContent>
      </Card>
      <Card>
        <CardHeader><CardTitle>Pubchi settings</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Badge variant="outline"><Link href="/settings/pubchi#rename">Rename</Link></Badge>
          <Badge variant="outline"><Link href="/settings/pubchi#tier">Permission tier</Link></Badge>
          <Badge variant="outline"><Link href="/settings/pubchi#brain">Brain</Link></Badge>
          <Badge variant="outline"><Link href="/settings/pubchi#preferences">Preferences</Link></Badge>
        </CardContent>
      </Card>
    </main>
  );
}
