'use client';

import { useState } from 'react';
import { Printer } from 'lucide-react';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { formatCommerceMoney } from '@/libs/commerce/format';
import { formatPublicKey } from '@/libs/utils/utils';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';

/**
 * A print-friendly packing slip for the seller, rendered purely from what the
 * seller's client legitimately holds: the order projection the transaction
 * service serves to participants.
 *
 * THE DELIVERY ADDRESS IS DELIBERATELY ABSENT. The buyer's address travels
 * exactly once — inside the buyer's own `checkout.create` command — and the
 * service withholds `delivery_address` from every read projection, the
 * seller's included, by design (ADR-0019 §8). This client never invents a
 * side channel for it, so the slip says so instead of pretending: the seller
 * obtains the destination from the buyer directly (e.g. the encrypted
 * conversation) and writes it on the printed slip.
 *
 * Printing uses plain browser print CSS (`@media print` rules in
 * `globals.css` keyed on `data-packing-slip`) — no PDF dependency.
 */
export function MarketplacePackingSlipDialog({ order }: { order: MarketplaceOrder }) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <Button size="sm" variant="secondary" className="rounded-full" onClick={() => setOpen(true)}>
        <Printer className="mr-2 size-4" />
        Packing slip
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-2xl border-border bg-popover">
          <DialogHeader>
            <DialogTitle>Packing slip</DialogTitle>
          </DialogHeader>
          <div
            data-packing-slip
            className="rounded-lg border border-neutral-300 bg-white p-6 font-mono text-sm text-black"
          >
            <div className="flex items-start justify-between gap-4 border-b border-neutral-300 pb-4">
              <div>
                <p className="text-lg font-bold tracking-wide uppercase">Packing slip</p>
                <p className="mt-1">Order {order.id.slice(0, 8)}</p>
                <p className="text-neutral-600">{order.id}</p>
              </div>
              <div className="text-right">
                <p>Ordered {order.createdAt.slice(0, 10)}</p>
                <p className="mt-1">Buyer {formatPublicKey({ key: order.buyerPubky, length: 12 })}</p>
              </div>
            </div>

            <table className="mt-4 w-full border-collapse">
              <thead>
                <tr className="border-b border-neutral-300 text-left">
                  <th className="py-1 pr-2 font-semibold">Qty</th>
                  <th className="py-1 pr-2 font-semibold">Item</th>
                  <th className="py-1 text-right font-semibold">Subtotal</th>
                </tr>
              </thead>
              <tbody>
                {order.lines.map((line) => (
                  <tr key={line.listingAggregateId} className="border-b border-neutral-200 align-top">
                    <td className="py-1.5 pr-2">{line.quantity}</td>
                    <td className="py-1.5 pr-2">
                      {line.title}
                      <span className="block text-xs text-neutral-600">{formatCommerceMoney(line.unitPrice)} each</span>
                    </td>
                    <td className="py-1.5 text-right">{formatCommerceMoney(line.subtotal)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <div className="mt-2 ml-auto w-fit text-right">
              <p>Items {formatCommerceMoney(order.subtotal)}</p>
              <p>Shipping {formatCommerceMoney(order.shipping)}</p>
              <p>Tax {formatCommerceMoney(order.tax)}</p>
              <p className="font-bold">Total {formatCommerceMoney(order.total)}</p>
            </div>

            {order.shipment && (
              <div className="mt-4 border-t border-neutral-300 pt-3">
                <p className="font-semibold">Shipment</p>
                <p>
                  {order.shipment.carrier} · {order.shipment.trackingNumber}
                </p>
              </div>
            )}

            <div className="mt-4 border-t border-neutral-300 pt-3">
              <p className="font-semibold">Deliver to</p>
              <p className="mt-1 text-xs leading-relaxed text-neutral-700">
                Not printed: the delivery address is withheld from all transaction-service reads — including yours as
                the seller — by design, so this client never has it. Get the destination from the buyer (for example via
                your encrypted conversation) and write it below.
              </p>
              <div className="mt-3 space-y-4" aria-hidden="true">
                <div className="border-b border-neutral-400" />
                <div className="border-b border-neutral-400" />
                <div className="border-b border-neutral-400" />
              </div>
            </div>

            <div className="mt-4 border-t border-neutral-300 pt-3">
              <p className="font-semibold">Notes</p>
              <div className="mt-3 space-y-4" aria-hidden="true">
                <div className="border-b border-neutral-400" />
                <div className="border-b border-neutral-400" />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
              Close
            </Button>
            <Button className="rounded-full" onClick={() => window.print()}>
              <Printer className="mr-2 size-4" />
              Print
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
