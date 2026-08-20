import type {
  AuctionState,
  DisputeState,
  ListingState,
  OfferState,
  OrderState,
  PaymentState,
  ReportState,
  ReservationState,
  ReturnState,
} from './transaction-contracts';

type TransitionMap<State extends string> = Readonly<Record<State, readonly State[]>>;

// -----------------------------------------------------------------------------
// Transition tables.
//
// These mirror the Marketplace Transaction Service's canonical contract
// artifact (vendored at `./contracts/state-machines.json`); the service is the
// authority when the two disagree (ADR-0022). Each table lists exactly the
// reachable `from -> to` edges — whether a transition is driven by a client
// command or a server-time sweep is the artifact's concern, not this table's.
// `state-machines.contract.test.ts` fails whenever a table drifts from the
// artifact.
// -----------------------------------------------------------------------------

export const listingTransitions = {
  available: ['reserved'],
  reserved: ['available', 'sold'],
  // Approving the cancellation of a paid order returns its quantity to stock.
  // The durable service moves quantity reserved -> sold on payment confirmation,
  // so releasing it again is a sold -> available edge rather than reserved ->
  // available. Driven only by order.cancel_approve.
  sold: ['available'],
} as const satisfies TransitionMap<ListingState>;

export const reservationTransitions = {
  active: ['converted', 'released', 'expired'],
  converted: [],
  released: [],
  expired: [],
} as const satisfies TransitionMap<ReservationState>;

export const offerTransitions = {
  pending: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  countered: ['countered', 'accepted', 'rejected', 'withdrawn', 'expired'],
  accepted: [],
  rejected: [],
  withdrawn: [],
  expired: [],
} as const satisfies TransitionMap<OfferState>;

/** `cancelled` is declared but unreachable — reserved for a future command. */
export const auctionTransitions = {
  scheduled: ['active'],
  active: ['sold', 'unsold'],
  sold: [],
  unsold: [],
  cancelled: [],
} as const satisfies TransitionMap<AuctionState>;

export const paymentTransitions = {
  awaiting_entitlement: ['detected', 'confirmed', 'expired', 'manual_review'],
  detected: ['confirmed', 'manual_review'],
  confirmed: [],
  expired: [],
  manual_review: [],
} as const satisfies TransitionMap<PaymentState>;

/** `processing` and `closed` are declared but unreachable — reserved for future commands. */
export const orderTransitions = {
  pending_payment: ['paid', 'cancelled'],
  paid: ['shipped', 'cancel_requested', 'disputed'],
  processing: ['shipped', 'cancel_requested', 'disputed'],
  shipped: ['delivered', 'disputed'],
  delivered: ['return_requested', 'completed', 'disputed'],
  completed: ['return_requested', 'disputed'],
  cancel_requested: ['cancelled'],
  cancelled: ['refunded_external'],
  return_requested: ['return_approved', 'disputed'],
  return_approved: ['return_received', 'disputed'],
  return_received: ['refunded_external'],
  disputed: ['completed', 'refunded_external'],
  refunded_external: [],
  closed: [],
} as const satisfies TransitionMap<OrderState>;

export const reportTransitions = {
  open: ['dismissed', 'actioned'],
  dismissed: [],
  actioned: [],
} as const satisfies TransitionMap<ReportState>;

export const returnTransitions = {
  requested: ['approved'],
  approved: ['received'],
  received: ['refunded'],
  refunded: [],
} as const satisfies TransitionMap<ReturnState>;

export const disputeTransitions = {
  open: ['resolved'],
  resolved: [],
} as const satisfies TransitionMap<DisputeState>;

/**
 * Every aggregate machine, keyed exactly as in the service's contract artifact.
 * The contract-drift test iterates this registry against the vendored JSON, so
 * a machine cannot be added, removed, or reshaped without the artifact agreeing.
 */
export const commerceAggregateMachines = {
  listing: { initial: 'available', transitions: listingTransitions },
  reservation: { initial: 'active', transitions: reservationTransitions },
  offer: { initial: 'pending', transitions: offerTransitions },
  auction: { initial: 'scheduled', transitions: auctionTransitions },
  order: { initial: 'pending_payment', transitions: orderTransitions },
  payment: { initial: 'awaiting_entitlement', transitions: paymentTransitions },
  report: { initial: 'open', transitions: reportTransitions },
  return: { initial: 'requested', transitions: returnTransitions },
  dispute: { initial: 'open', transitions: disputeTransitions },
} as const;

export function canTransitionListing(from: ListingState, to: ListingState): boolean {
  return includesState(listingTransitions[from], to);
}

export function canTransitionReservation(from: ReservationState, to: ReservationState): boolean {
  return includesState(reservationTransitions[from], to);
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

export function canTransitionReport(from: ReportState, to: ReportState): boolean {
  return includesState(reportTransitions[from], to);
}

function includesState<State extends string>(allowed: readonly State[], target: State): boolean {
  return allowed.includes(target);
}
