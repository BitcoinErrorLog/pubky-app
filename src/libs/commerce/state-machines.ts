import type { AuctionState, ListingState, OfferState, OrderState, PaymentState } from './transaction-contracts';

type TransitionMap<State extends string> = Readonly<Record<State, readonly State[]>>;

export const listingTransitions = {
  draft: ['active', 'removed'],
  active: ['paused', 'reserved', 'sold', 'expired', 'removed'],
  paused: ['active', 'expired', 'removed'],
  reserved: ['active', 'sold', 'expired', 'removed'],
  sold: ['active', 'removed'],
  expired: ['active', 'removed'],
  removed: [],
} as const satisfies TransitionMap<ListingState>;

export const offerTransitions = {
  pending: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  countered: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
} as const satisfies TransitionMap<OfferState>;

export const auctionTransitions = {
  scheduled: ['active', 'cancelled'],
  active: ['sold', 'unsold', 'cancelled'],
  sold: [],
  unsold: [],
  cancelled: [],
} as const satisfies TransitionMap<AuctionState>;

export const paymentTransitions = {
  created: ['awaiting_entitlement'],
  awaiting_entitlement: ['confirmed', 'window_elapsed', 'manual_review'],
  confirmed: ['external_refund_required'],
  window_elapsed: ['confirmed', 'manual_review'],
  manual_review: ['confirmed', 'external_refund_required'],
  external_refund_required: ['refunded_external', 'manual_review'],
  refunded_external: [],
} as const satisfies TransitionMap<PaymentState>;

export const orderTransitions = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['processing', 'cancel_requested', 'cancelled', 'disputed'],
  processing: ['ready_for_pickup', 'shipped', 'cancel_requested', 'cancelled', 'disputed'],
  ready_for_pickup: ['delivered', 'cancel_requested', 'disputed'],
  shipped: ['delivered', 'return_requested', 'disputed'],
  delivered: ['completed', 'return_requested', 'disputed'],
  completed: ['return_requested', 'disputed', 'closed'],
  cancel_requested: ['processing', 'cancelled', 'disputed'],
  cancelled: ['closed'],
  return_requested: ['return_in_transit', 'return_inspection', 'completed', 'disputed'],
  return_in_transit: ['return_inspection', 'disputed'],
  return_inspection: ['completed', 'refunded_external', 'disputed'],
  disputed: ['completed', 'refunded_external', 'closed'],
  refunded_external: ['closed'],
  closed: [],
} as const satisfies TransitionMap<OrderState>;

export function canTransitionListing(from: ListingState, to: ListingState): boolean {
  return includesState(listingTransitions[from], to);
}

export function canTransitionOffer(from: OfferState, to: OfferState): boolean {
  return includesState(offerTransitions[from], to);
}

export function canTransitionAuction(from: AuctionState, to: AuctionState): boolean {
  return includesState(auctionTransitions[from], to);
}

export function canTransitionPayment(from: PaymentState, to: PaymentState): boolean {
  return includesState(paymentTransitions[from], to);
}

export function canTransitionOrder(from: OrderState, to: OrderState): boolean {
  return includesState(orderTransitions[from], to);
}

function includesState<State extends string>(allowed: readonly State[], target: State): boolean {
  return allowed.includes(target);
}
