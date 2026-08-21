'use client';

import { useEffect, useState } from 'react';
import { Controller, useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { Label } from '@/atoms/Label/Label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/atoms/Select/Select';
import { COMMERCE_REVIEW_EDIT_WINDOW_SECONDS } from '@/config/commerce';
import { FORM_LABEL_CLASSES } from '@/config/forms';
import { useMarketplaceOrderAction } from '@/hooks/useMarketplaceOrderAction/useMarketplaceOrderAction';
import type { MarketplaceOrderActionData } from '@/hooks/useMarketplaceOrderAction/useMarketplaceOrderAction.types';
import { OTHER_CARRIER_ID, SHIPPING_CARRIERS } from '@/libs/commerce/carriers';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import { MarketplacePackingSlipDialog } from '@/organisms/Marketplace/MarketplacePackingSlipDialog';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';

export function MarketplaceOrderActions({
  order,
  isBuyer,
  canCancel,
  canEditReview,
  actOnOrder,
}: {
  order: MarketplaceOrder;
  isBuyer: boolean;
  /**
   * Order cancellation (`order.cancel_request`/`order.cancel_approve`) only
   * exists on the sandbox: the durable service declares those commands in its
   * contract but has not ported them, so the affordance is withheld there
   * instead of failing after a click.
   */
  canCancel: boolean;
  /**
   * `review.update` only exists on the durable service (the sandbox has no
   * review editing), so the edit affordance is withheld in sandbox mode
   * instead of failing after a click. Within the mode, the button further
   * requires the caller's own review to still be inside the service's
   * 24-hour edit window.
   */
  canEditReview: boolean;
  actOnOrder: (order: MarketplaceOrder, kind: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  // Read once per mount (render must stay pure, so the clock is sampled in an
  // effect): the affordance freezes at page entry rather than vanishing
  // mid-view, and the service enforces the real boundary on submit anyway.
  const [nowMs, setNowMs] = useState<number | null>(null);
  useEffect(() => {
    setNowMs(Date.now());
  }, []);
  const action = useMarketplaceOrderAction(order, actOnOrder);
  const actionType = useWatch({ control: action.form.control, name: 'action' });
  const carrierChoice = useWatch({ control: action.form.control, name: 'carrierChoice' });

  const begin = (next: MarketplaceOrderActionData['action'], overrides?: Partial<MarketplaceOrderActionData>) => {
    action.setAction(next, overrides);
    setOpen(true);
  };

  const ownReviewerPubky = isBuyer ? order.buyerPubky : order.sellerPubky;
  const ownReview = order.reviews?.find(({ reviewerPubky }) => reviewerPubky === ownReviewerPubky);
  // Mirrors the service's boundary exactly: the edit is refused only once
  // `now` moves PAST created_at + window, so `<=` here matches `>` there.
  const isOwnReviewEditable =
    ownReview !== undefined &&
    nowMs !== null &&
    nowMs <= Date.parse(ownReview.createdAt) + COMMERCE_REVIEW_EDIT_WINDOW_SECONDS * 1000;
  const submit = async () => {
    if (await action.submit()) setOpen(false);
  };

  return (
    <>
      <div className="flex flex-wrap gap-2">
        {canCancel && isBuyer && ['pending_payment', 'paid', 'processing'].includes(order.state) && (
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => begin('cancel')}>
            Cancel order
          </Button>
        )}
        {!isBuyer && ['paid', 'processing'].includes(order.state) && (
          <Button size="sm" className="rounded-full" onClick={() => begin('ship')}>
            Add tracking
          </Button>
        )}
        {!isBuyer && ['paid', 'processing', 'shipped', 'delivered', 'completed'].includes(order.state) && (
          <MarketplacePackingSlipDialog order={order} />
        )}
        {isBuyer && order.state === 'shipped' && (
          <Button
            size="sm"
            className="rounded-full"
            onClick={() => void actOnOrder(order, 'fulfillment.confirm_delivery', {})}
          >
            Confirm delivery
          </Button>
        )}
        {isBuyer && ['delivered', 'completed'].includes(order.state) && !order.returnRequest && (
          <Button size="sm" variant="secondary" className="rounded-full" onClick={() => begin('return')}>
            Request return
          </Button>
        )}
        {canCancel && !isBuyer && order.state === 'cancel_requested' && (
          <Button size="sm" className="rounded-full" onClick={() => void actOnOrder(order, 'order.cancel_approve', {})}>
            Approve cancellation
          </Button>
        )}
        {!isBuyer && order.state === 'return_requested' && (
          <Button size="sm" className="rounded-full" onClick={() => void actOnOrder(order, 'return.approve', {})}>
            Approve return
          </Button>
        )}
        {!isBuyer && order.state === 'return_approved' && (
          <Button size="sm" className="rounded-full" onClick={() => void actOnOrder(order, 'return.receive', {})}>
            Mark return received
          </Button>
        )}
        {!isBuyer && ['return_received', 'disputed', 'cancelled'].includes(order.state) && !order.externalRefund && (
          <Button size="sm" className="rounded-full" onClick={() => begin('refund')}>
            Record external refund
          </Button>
        )}
        {['paid', 'processing', 'shipped', 'delivered', 'completed', 'return_requested', 'return_approved'].includes(
          order.state,
        ) &&
          !order.dispute && (
            <Button size="sm" variant="ghost" className="rounded-full" onClick={() => begin('dispute')}>
              Open dispute
            </Button>
          )}
        {['delivered', 'completed'].includes(order.state) &&
          !order.reviews?.some(({ reviewerPubky }) =>
            isBuyer ? reviewerPubky === order.buyerPubky : reviewerPubky === order.sellerPubky,
          ) && (
            <Button size="sm" variant="secondary" className="rounded-full" onClick={() => begin('review')}>
              Leave review
            </Button>
          )}
        {canEditReview && ownReview && isOwnReviewEditable && (
          <Button
            size="sm"
            variant="secondary"
            className="rounded-full"
            onClick={() => begin('review_edit', { rating: String(ownReview.rating), text: ownReview.text })}
          >
            Edit review
          </Button>
        )}
      </div>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="border-border bg-popover">
          <DialogHeader>
            <DialogTitle>{actionTitle(actionType)}</DialogTitle>
          </DialogHeader>
          {['cancel', 'return', 'dispute'].includes(actionType) && (
            <ControlledTextareaField
              name="reason"
              control={action.form.control}
              label="Reason"
              placeholder="Describe what happened"
            />
          )}
          {actionType === 'ship' && (
            <>
              <div className="grid gap-2">
                <Label htmlFor="ship-carrier-select" className={FORM_LABEL_CLASSES}>
                  Carrier
                </Label>
                <Controller
                  name="carrierChoice"
                  control={action.form.control}
                  render={({ field }) => (
                    <Select value={field.value} onValueChange={field.onChange}>
                      <SelectTrigger id="ship-carrier-select" className="h-11 w-full rounded-md border px-3">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {SHIPPING_CARRIERS.map((carrier) => (
                          <SelectItem key={carrier.id} value={carrier.id}>
                            {carrier.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )}
                />
              </div>
              {carrierChoice === OTHER_CARRIER_ID && (
                <ControlledInputField name="carrier" control={action.form.control} label="Carrier name" />
              )}
              <ControlledInputField name="trackingNumber" control={action.form.control} label="Tracking number" />
            </>
          )}
          {['return', 'refund'].includes(actionType) && (
            <ControlledInputField name="amount" control={action.form.control} label="Amount (USD)" />
          )}
          {actionType === 'refund' && (
            <ControlledInputField
              name="transactionId"
              control={action.form.control}
              label="External Bitcoin transaction evidence"
            />
          )}
          {['review', 'review_edit'].includes(actionType) && (
            <>
              <ControlledInputField name="rating" control={action.form.control} label="Rating (1–5)" />
              <ControlledTextareaField name="text" control={action.form.control} label="Review" />
            </>
          )}
          <DialogFooter>
            <Button variant="secondary" className="rounded-full" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button className="rounded-full" onClick={submit}>
              Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function actionTitle(action: MarketplaceOrderActionData['action']): string {
  switch (action) {
    case 'cancel':
      return 'Request cancellation';
    case 'ship':
      return 'Add shipment tracking';
    case 'return':
      return 'Request a return';
    case 'refund':
      return 'Record external refund';
    case 'dispute':
      return 'Open a dispute';
    case 'review':
      return 'Leave a review';
    case 'review_edit':
      return 'Edit your review';
  }
}
