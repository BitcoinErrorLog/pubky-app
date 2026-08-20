import { describe, expect, it } from 'vitest';
import {
  canTransitionAuction,
  canTransitionListing,
  canTransitionOffer,
  canTransitionOrder,
  canTransitionPayment,
} from './state-machines';
import type { AuctionState, ListingState, OfferState, OrderState, PaymentState } from './transaction-contracts';

describe('listing state machine', () => {
  it.each<[ListingState, ListingState]>([
    ['draft', 'active'],
    ['active', 'reserved'],
    ['reserved', 'sold'],
    ['reserved', 'active'],
    ['active', 'paused'],
    ['paused', 'active'],
    ['active', 'expired'],
    ['expired', 'active'],
    ['sold', 'active'],
    ['active', 'removed'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransitionListing(from, to)).toBe(true);
  });

  it.each<[ListingState, ListingState]>([
    ['draft', 'sold'],
    ['paused', 'sold'],
    ['sold', 'reserved'],
    ['removed', 'active'],
    ['active', 'active'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransitionListing(from, to)).toBe(false);
  });
});

describe('offer state machine', () => {
  it.each<[OfferState, OfferState]>([
    ['pending', 'countered'],
    ['countered', 'countered'],
    ['countered', 'accepted'],
    ['pending', 'rejected'],
    ['pending', 'withdrawn'],
    ['countered', 'expired'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransitionOffer(from, to)).toBe(true);
  });

  it.each<[OfferState, OfferState]>([
    ['accepted', 'withdrawn'],
    ['rejected', 'pending'],
    ['expired', 'accepted'],
    ['pending', 'pending'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransitionOffer(from, to)).toBe(false);
  });
});

describe('auction state machine', () => {
  it.each<[AuctionState, AuctionState]>([
    ['scheduled', 'active'],
    ['scheduled', 'cancelled'],
    ['active', 'sold'],
    ['active', 'unsold'],
    ['active', 'cancelled'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransitionAuction(from, to)).toBe(true);
  });

  it.each<[AuctionState, AuctionState]>([
    ['scheduled', 'sold'],
    ['sold', 'active'],
    ['unsold', 'active'],
    ['cancelled', 'active'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransitionAuction(from, to)).toBe(false);
  });
});

describe('payment state machine', () => {
  it.each<[PaymentState, PaymentState]>([
    ['created', 'awaiting_entitlement'],
    ['awaiting_entitlement', 'confirmed'],
    ['awaiting_entitlement', 'window_elapsed'],
    ['awaiting_entitlement', 'manual_review'],
    ['window_elapsed', 'confirmed'],
    ['window_elapsed', 'manual_review'],
    ['confirmed', 'external_refund_required'],
    ['external_refund_required', 'refunded_external'],
    ['external_refund_required', 'manual_review'],
    ['manual_review', 'confirmed'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransitionPayment(from, to)).toBe(true);
  });

  it.each<[PaymentState, PaymentState]>([
    ['created', 'confirmed'],
    ['confirmed', 'window_elapsed'],
    ['refunded_external', 'confirmed'],
    ['awaiting_entitlement', 'refunded_external'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransitionPayment(from, to)).toBe(false);
  });
});

describe('order state machine', () => {
  it.each<[OrderState, OrderState]>([
    ['pending_payment', 'paid'],
    ['paid', 'processing'],
    ['processing', 'shipped'],
    ['processing', 'ready_for_pickup'],
    ['shipped', 'delivered'],
    ['ready_for_pickup', 'delivered'],
    ['delivered', 'completed'],
    ['completed', 'closed'],
    ['paid', 'cancel_requested'],
    ['cancel_requested', 'processing'],
    ['cancel_requested', 'cancelled'],
    ['shipped', 'return_requested'],
    ['return_requested', 'return_in_transit'],
    ['return_in_transit', 'return_inspection'],
    ['return_inspection', 'refunded_external'],
    ['disputed', 'refunded_external'],
    ['refunded_external', 'closed'],
  ])('allows %s -> %s', (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(true);
  });

  it.each<[OrderState, OrderState]>([
    ['pending_payment', 'shipped'],
    ['paid', 'delivered'],
    ['shipped', 'cancelled'],
    ['completed', 'processing'],
    ['cancelled', 'paid'],
    ['closed', 'return_requested'],
    ['refunded_external', 'processing'],
  ])('rejects %s -> %s', (from, to) => {
    expect(canTransitionOrder(from, to)).toBe(false);
  });
});
