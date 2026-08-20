'use client';

import { useState } from 'react';
import { useWatch } from 'react-hook-form';
import { Button } from '@/atoms/Button/Button';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/atoms/Dialog/Dialog';
import { useMarketplaceOrderAction } from '@/hooks/useMarketplaceOrderAction/useMarketplaceOrderAction';
import type { MarketplaceOrderActionData } from '@/hooks/useMarketplaceOrderAction/useMarketplaceOrderAction.types';
import { ControlledInputField } from '@/molecules/ControlledInputField/ControlledInputField';
import { ControlledTextareaField } from '@/molecules/ControlledTextareaField/ControlledTextareaField';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';

export function MarketplaceOrderActions({
  order,
  isBuyer,
  canCancel,
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
  actOnOrder: (order: MarketplaceOrder, kind: string, payload: Record<string, unknown>) => Promise<boolean>;
}) {
  const [open, setOpen] = useState(false);
  const action = useMarketplaceOrderAction(order, actOnOrder);
  const actionType = useWatch({ control: action.form.control, name: 'action' });

  const begin = (next: MarketplaceOrderActionData['action']) => {
    action.setAction(next);
    setOpen(true);
  };
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
              <ControlledInputField name="carrier" control={action.form.control} label="Carrier" />
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
          {actionType === 'review' && (
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
  }
}
