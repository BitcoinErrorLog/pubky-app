'use client';

import { useState } from 'react';
import { ArrowLeft, ImageIcon, Package, RefreshCw, ShoppingBag } from 'lucide-react';
import { MARKETPLACE_ROUTES } from '@/app/routes';
import type { InventoryBoardRow } from '@/application/commerce/inventory';
import { Badge } from '@/atoms/Badge/Badge';
import { Button } from '@/atoms/Button/Button';
import { Card, CardContent } from '@/atoms/Card/Card';
import { Checkbox } from '@/atoms/Checkbox/Checkbox';
import { Container } from '@/atoms/Container/Container';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Heading } from '@/atoms/Heading/Heading';
import { Image } from '@/atoms/Image/Image';
import { Input } from '@/atoms/Input/Input';
import { Link } from '@/atoms/Link/Link';
import { Skeleton } from '@/atoms/Skeleton/Skeleton';
import { Typography } from '@/atoms/Typography/Typography';
import { useMarketplaceInventory } from '@/hooks/useMarketplaceInventory/useMarketplaceInventory';
import { ContentLayout } from '@/organisms/ContentLayout/ContentLayout';
import { MarketplaceInventoryGrantBanner } from '@/organisms/Marketplace/MarketplaceInventoryGrantBanner';
import { MarketplaceSectionNav } from '@/organisms/Marketplace/MarketplaceSectionNav';
import { MarketplaceSessionRequiredCard } from '@/organisms/Marketplace/MarketplaceSessionRequiredCard';

export function MarketplaceInventory() {
  const board = useMarketplaceInventory();
  const [editing, setEditing] = useState<InventoryBoardRow | null>(null);
  const [target, setTarget] = useState('');
  const [selected, setSelected] = useState<string[]>([]);

  const rows = board.load.status === 'ready' ? board.load.rows : [];

  return (
    <ContentLayout
      showLeftSidebar={false}
      showRightSidebar={false}
      showLeftMobileButton={false}
      showRightMobileButton={false}
      className="pb-28 lg:pb-16"
      classNameWrapperContent="max-w-7xl"
    >
      <Container overrideDefaults className="flex w-full flex-col gap-6 px-4 sm:px-6 lg:px-8">
        <MarketplaceSectionNav />
        <Link
          href={MARKETPLACE_ROUTES.DASHBOARD}
          overrideDefaults
          className="inline-flex w-fit items-center gap-2 text-sm text-muted-foreground hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          Seller studio
        </Link>
        <div>
          <Badge className="mb-4">Seller studio · Inventory</Badge>
          <Heading level={1} size="xl" className="text-4xl sm:text-6xl">
            Inventory
          </Heading>
          <Typography as="p" className="mt-3 max-w-2xl text-muted-foreground">
            Available, reserved, and sold counts from the transaction service. Reserved is not available to sell.
          </Typography>
        </div>

        <div data-surface="inventory-studio" data-testid="inventory-studio">
          {board.isLoading ? (
            <Skeleton className="h-48 w-full" />
          ) : board.load.status === 'durable-unavailable' ? (
            <Card className="border-dashed py-5">
              <CardContent className="flex flex-col gap-2 px-5">
                <Typography as="p" className="font-semibold">
                  Inventory Studio requires the durable transaction service.
                </Typography>
                <Typography as="p" className="text-sm text-muted-foreground">
                  Sandbox mode cannot honestly show reserved and sold counts from the service.
                </Typography>
              </CardContent>
            </Card>
          ) : board.load.status === 'unauthenticated' ? (
            <Card className="border-dashed py-5">
              <CardContent className="px-5">
                <Typography as="p" className="text-sm text-muted-foreground">
                  Sign in to manage inventory.
                </Typography>
              </CardContent>
            </Card>
          ) : board.load.status === 'session-required' ? (
            <MarketplaceSessionRequiredCard onConnected={() => void board.refresh()} />
          ) : board.load.status === 'grant-needed' ? (
            <MarketplaceInventoryGrantBanner onConnected={() => void board.refresh()} />
          ) : board.load.status === 'error' ? (
            <div role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-6">
              <Heading level={3} size="md">
                Inventory could not be loaded
              </Heading>
              <Typography as="p" className="mt-2 text-muted-foreground">
                {board.load.message}
              </Typography>
            </div>
          ) : board.load.status === 'empty' ? (
            <div className="flex min-h-48 flex-col items-center justify-center rounded-xl border border-dashed bg-card/40 p-8 text-center">
              <ShoppingBag className="mb-4 size-10 text-muted-foreground" />
              <Heading level={3} size="md">
                No inventory on the service yet
              </Heading>
              <Typography as="p" className="mt-2 text-muted-foreground">
                Publish a listing, then it appears here with available, reserved, and sold counts.
              </Typography>
              <Button asChild className="mt-4 rounded-full">
                <Link href={MARKETPLACE_ROUTES.SELL} overrideDefaults>
                  Sell an item
                </Link>
              </Button>
            </div>
          ) : (
            <Card className="border">
              <CardContent className="overflow-x-auto px-5">
                <table className="w-full min-w-[52rem] text-left text-sm">
                  <thead>
                    <tr className="border-b border-border text-muted-foreground">
                      <th className="p-3 font-medium">
                        <Checkbox
                          aria-label="Select all listings"
                          checked={selected.length > 0 && selected.length === rows.length}
                          onCheckedChange={(checked) => {
                            setSelected(checked === true ? rows.map((entry) => entry.listingId) : []);
                          }}
                        />
                      </th>
                      <th className="p-3 font-medium">Listing</th>
                      <th className="p-3 font-medium">State</th>
                      <th className="p-3 font-medium">Format</th>
                      <th className="p-3 font-medium">Drop</th>
                      <th className="p-3 font-medium">Stock</th>
                      <th className="p-3 font-medium">Revision</th>
                      <th className="p-3 font-medium">Sync</th>
                      <th className="p-3 font-medium">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((entry) => (
                      <tr key={entry.listingId} className="border-b border-border last:border-0">
                        <td className="p-3">
                          <Checkbox
                            aria-label={`Select ${entry.title}`}
                            checked={selected.includes(entry.listingId)}
                            onCheckedChange={(checked) => {
                              setSelected((current) =>
                                checked === true
                                  ? [...current, entry.listingId]
                                  : current.filter((id) => id !== entry.listingId),
                              );
                            }}
                          />
                        </td>
                        <td className="p-3">
                          <div className="flex items-center gap-3">
                            {entry.thumbUrl ? (
                              <div className="relative size-10 shrink-0 overflow-hidden rounded-md">
                                <Image
                                  src={entry.thumbUrl}
                                  alt=""
                                  fill
                                  sizes="40px"
                                  className="object-cover object-center"
                                />
                              </div>
                            ) : (
                              <div className="flex size-10 items-center justify-center rounded-md bg-muted">
                                <ImageIcon className="size-4 text-muted-foreground" />
                              </div>
                            )}
                            <Typography as="p" className="font-medium">
                              {entry.title}
                            </Typography>
                          </div>
                        </td>
                        <td className="p-3">{entry.state}</td>
                        <td className="p-3">{entry.format}</td>
                        <td className="p-3">{entry.dropId ?? '—'}</td>
                        <td className="p-3">
                          <div className="flex flex-col gap-0.5" data-testid={`inventory-stock-${entry.listingId}`}>
                            <span>
                              <span className="font-medium">{entry.available}</span>
                              <span className="text-muted-foreground"> avail</span>
                            </span>
                            <span className="text-muted-foreground">
                              {entry.reserved} reserved · {entry.sold} sold · {entry.total} total
                            </span>
                            {entry.reserved > 0 && (
                              <span className="text-xs text-muted-foreground">
                                Held for a buyer. Not available to sell.
                              </span>
                            )}
                          </div>
                        </td>
                        <td className="p-3">{entry.serverRevision}</td>
                        <td className="p-3">
                          {entry.sync === 'missing' ? (
                            <Typography as="p" className="text-sm text-muted-foreground">
                              {entry.syncMessage ?? 'Published, not yet registered for checkout'}
                            </Typography>
                          ) : (
                            'Synced'
                          )}
                        </td>
                        <td className="p-3">
                          <div className="flex flex-wrap gap-2">
                            <Button
                              size="sm"
                              variant="secondary"
                              className="rounded-full"
                              disabled={board.pendingListingId === entry.listingId}
                              onClick={() => {
                                setEditing(entry);
                                setTarget(String(entry.available));
                              }}
                            >
                              <Package className="mr-2 size-4" />
                              Set available
                            </Button>
                            {entry.sync === 'missing' && (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="rounded-full"
                                onClick={() => void board.retrySync(entry)}
                              >
                                <RefreshCw className="mr-2 size-4" />
                                Retry
                              </Button>
                            )}
                          </div>
                          {board.conflictListingId === entry.listingId && (
                            <Typography as="p" className="mt-2 text-sm text-muted-foreground" role="status">
                              Stock changed since this page loaded. Refresh and set the new available amount.
                            </Typography>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          )}
        </div>
      </Container>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="border-border bg-popover">
          <DialogHeader>
            <DialogTitle>Set available</DialogTitle>
          </DialogHeader>
          {editing && (
            <>
              <Typography as="p" className="text-sm text-muted-foreground">
                {editing.title}. Reserved {editing.reserved} stays reserved. Setting available cannot go below 0.
              </Typography>
              <Input
                type="number"
                min={0}
                value={target}
                onChange={(event) => setTarget(event.target.value)}
                aria-label="Available quantity"
              />
              <DialogFooter>
                <Button variant="secondary" className="rounded-full" onClick={() => setEditing(null)}>
                  Cancel
                </Button>
                <Button
                  className="rounded-full"
                  disabled={board.pendingListingId === editing.listingId}
                  onClick={async () => {
                    const parsed = Number.parseInt(target, 10);
                    await board.setAvailable(editing, parsed);
                    setEditing(null);
                  }}
                >
                  Save
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </ContentLayout>
  );
}
