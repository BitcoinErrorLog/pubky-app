'use client';

import { useEffect, useState } from 'react';
import { CommerceController } from '@/controllers/commerce/commerce';
import {
  classifyDigitalDeliverRefusal,
  DIGITAL_DELIVER_REFUSAL_COPY,
  DIGITAL_SELLER_COPY,
  digitalEvidenceLines,
  digitalOrderManualChannels,
  type MarketplaceDigitalDeliveryChannel,
  type MarketplaceOrderDeliveryEmail,
  sellerDeliveryEmailReadCopy,
} from '@/libs/commerce/digital';
import { AppError } from '@/libs/error/error';
import type { MarketplaceOrder } from '@/services/marketplace/marketplace';

export type SellerDeliveryEmailState =
  | { status: 'hidden' }
  | { status: 'loading' }
  | { status: 'shown'; email: MarketplaceOrderDeliveryEmail }
  | { status: 'refused'; message: string };

/**
 * The seller's delivery actions on a digital order (digital delivery design
 * §3 "Seller's orders", §4.3, §6 F6–F8, F13–F15): Show email reads the
 * buyer's address on request and holds it in memory until hidden; Mark
 * emailed and Mark delivered send `fulfillment.deliver_digital` with the
 * order revision, so a racing buyer cancel request has one winner.
 */
export function useSellerDigitalDelivery(order: MarketplaceOrder, onChanged?: () => Promise<void> | void) {
  const [email, setEmail] = useState<SellerDeliveryEmailState>({ status: 'hidden' });
  const [acting, setActing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [evidence, setEvidence] = useState<string[] | null>(null);
  const [evidenceAttempt, setEvidenceAttempt] = useState(0);
  const paid = order.fulfillment === 'digital' && order.receiptId !== null;

  // The delivery evidence (§3 "Seller's orders"): timestamps and an open
  // count only, read on view once the order is paid and after each mark.
  useEffect(() => {
    if (!paid) return;
    let current = true;
    CommerceController.fetchOrderDigitalEvidence(order.id)
      .then((read) => {
        if (current) setEvidence(digitalEvidenceLines(read, order.lines));
      })
      .catch(() => {
        if (current) setEvidence(null);
      });
    return () => {
      current = false;
    };
    // The evidence follows the order's identity and revision, not each new object of the same order.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- order identity is id+revision
  }, [paid, order.id, order.revision, evidenceAttempt]);

  const showEmail = async () => {
    setEmail({ status: 'loading' });
    try {
      setEmail({ status: 'shown', email: await CommerceController.fetchOrderDeliveryEmail(order.id) });
    } catch (error) {
      const refusal = error instanceof AppError ? error.context?.refusal : undefined;
      setEmail({
        status: 'refused',
        message: sellerDeliveryEmailReadCopy(typeof refusal === 'string' ? refusal : null),
      });
    }
  };

  const mark = async (channel: MarketplaceDigitalDeliveryChannel): Promise<boolean> => {
    setActing(true);
    setMessage(null);
    try {
      const response = await CommerceController.commitDeliverDigital(order.id, order.revision, channel);
      if (!response.ok) {
        const refusal = classifyDigitalDeliverRefusal(response.error, { orderState: order.state, channel });
        setMessage(refusal ? DIGITAL_DELIVER_REFUSAL_COPY[refusal] : DIGITAL_SELLER_COPY.deliverFailed);
        if (refusal === 'changed' || refusal === 'already_marked') await onChanged?.();
        return false;
      }
      setMessage(channel === 'email' ? DIGITAL_SELLER_COPY.markedEmailed : DIGITAL_SELLER_COPY.markedDelivered);
      setEmail({ status: 'hidden' });
      setEvidenceAttempt((value) => value + 1);
      await onChanged?.();
      return true;
    } catch {
      setMessage(DIGITAL_SELLER_COPY.deliverFailed);
      return false;
    } finally {
      setActing(false);
    }
  };

  return {
    channels: digitalOrderManualChannels(order.lines),
    email,
    showEmail,
    hideEmail: () => setEmail({ status: 'hidden' }),
    mark,
    acting,
    message,
    /** The evidence lines, or null before payment, while loading, or when the read fails. */
    evidence,
  };
}
