import { createHash, randomUUID } from 'node:crypto';
import { commercePubkySchema } from '../../../src/libs/commerce/transaction-contracts';
import {
  type AcceptOfferCommand,
  buildMarketplaceListingAggregateId,
  buildMarketplaceOfferAggregateId,
  type CounterOfferCommand,
  type CreateOfferCommand,
  type MarketplaceCommand,
  marketplaceCommandSchema,
  type PlaceBidCommand,
  type RegisterListingCommand,
  type RejectOfferCommand,
  type ReserveInventoryCommand,
  type WithdrawOfferCommand,
} from './contracts';

export interface MarketplaceListingAggregate {
  aggregateId: string;
  sellerPubky: string;
  listingId: string;
  listingRevision: number;
  contentHash: string;
  serverRevision: number;
  state: 'available' | 'reserved' | 'sold';
  totalQuantity: number;
  availableQuantity: number;
  reservedQuantity: number;
  soldQuantity: number;
  unitPrice: {
    amountMinor: number;
    currency: string;
    exponent: number;
  };
  saleFormat: 'fixed_price' | 'auction';
  auction: {
    startsAt: string;
    endsAt: string;
    minimumIncrement: MarketplaceListingAggregate['unitPrice'];
    reservePrice?: MarketplaceListingAggregate['unitPrice'];
    antiSnipingWindowSeconds: number;
    antiSnipingExtensionSeconds: number;
    currentPrice: MarketplaceListingAggregate['unitPrice'];
    leaderPubky: string | null;
    bidCount: number;
    reserveMet: boolean;
  } | null;
  updatedAt: string;
}

export interface MarketplaceReservation {
  id: string;
  aggregateId: string;
  buyerPubky: string;
  quantity: number;
  status: 'active';
  expiresAt: string;
  createdAt: string;
}

export interface MarketplaceOfferHistoryEntry {
  revision: number;
  actorPubky: string;
  action: 'created' | 'countered' | 'accepted' | 'rejected' | 'withdrawn';
  amount: MarketplaceListingAggregate['unitPrice'];
  quantity: number;
  message: string;
  occurredAt: string;
}

export interface MarketplaceOffer {
  id: string;
  aggregateId: string;
  listingAggregateId: string;
  buyerPubky: string;
  sellerPubky: string;
  revision: number;
  state: 'pending' | 'countered' | 'accepted' | 'rejected' | 'withdrawn' | 'expired';
  offeredBy: string;
  amount: MarketplaceListingAggregate['unitPrice'];
  quantity: number;
  message: string;
  expiresAt: string;
  createdAt: string;
  updatedAt: string;
  history: MarketplaceOfferHistoryEntry[];
}

export interface MarketplaceBid {
  id: string;
  listingAggregateId: string;
  bidderPubky: string;
  maximumAmount: MarketplaceListingAggregate['unitPrice'];
  sequence: number;
  createdAt: string;
}

export interface MarketplaceEvent {
  id: string;
  commandId: string;
  aggregateId: string;
  revision: number;
  actorPubky: string;
  kind:
    | 'listing.registered'
    | 'inventory.reserved'
    | 'offer.created'
    | 'offer.countered'
    | 'offer.accepted'
    | 'offer.rejected'
    | 'offer.withdrawn'
    | 'auction.bid_placed';
  occurredAt: string;
}

export type MarketplaceCommandSuccess = {
  ok: true;
  version: 1;
  commandId: string;
  aggregateId: string;
  revision: number;
  eventIds: string[];
  result:
    | { kind: 'listing'; listing: MarketplaceListingAggregate }
    | { kind: 'reservation'; listing: MarketplaceListingAggregate; reservation: MarketplaceReservation }
    | { kind: 'offer'; offer: MarketplaceOffer }
    | {
        kind: 'bid';
        listing: MarketplaceListingAggregate;
        bid: MarketplaceBid;
      }
    | {
        kind: 'accepted_offer';
        offer: MarketplaceOffer;
        listing: MarketplaceListingAggregate;
        reservation: MarketplaceReservation;
      };
};

export type MarketplaceCommandFailure = {
  ok: false;
  error: {
    code:
      | 'INVALID_COMMAND'
      | 'UNAUTHORIZED'
      | 'NOT_FOUND'
      | 'REVISION_CONFLICT'
      | 'IDEMPOTENCY_CONFLICT'
      | 'INSUFFICIENT_INVENTORY'
      | 'INVARIANT_VIOLATION'
      | 'OFFER_EXPIRED'
      | 'INVALID_STATE'
      | 'AUCTION_CLOSED'
      | 'BID_TOO_LOW';
    message: string;
    currentRevision?: number;
    issues?: Array<{ path: string; message: string }>;
  };
};

export type MarketplaceCommandResult = MarketplaceCommandSuccess | MarketplaceCommandFailure;

type StoredCommand = {
  requestHash: string;
  result: MarketplaceCommandSuccess;
};

export class InMemoryMarketplaceRepository {
  private listings = new Map<string, MarketplaceListingAggregate>();
  private reservations = new Map<string, MarketplaceReservation>();
  private offers = new Map<string, MarketplaceOffer>();
  private bids = new Map<string, MarketplaceBid[]>();
  private commands = new Map<string, StoredCommand>();
  private events: MarketplaceEvent[] = [];
  private lockTail: Promise<void> = Promise.resolve();

  async transaction<T>(operation: () => T | Promise<T>): Promise<T> {
    const previous = this.lockTail;
    let release = (): void => {};
    this.lockTail = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  getListing(id: string): MarketplaceListingAggregate | undefined {
    return this.listings.get(id);
  }

  putListing(listing: MarketplaceListingAggregate): void {
    this.listings.set(listing.aggregateId, listing);
  }

  putReservation(reservation: MarketplaceReservation): void {
    this.reservations.set(reservation.id, reservation);
  }

  getOffer(id: string): MarketplaceOffer | undefined {
    return this.offers.get(id);
  }

  putOffer(offer: MarketplaceOffer): void {
    this.offers.set(offer.id, offer);
  }

  getOffersForListing(listingAggregateId: string): MarketplaceOffer[] {
    return [...this.offers.values()].filter((offer) => offer.listingAggregateId === listingAggregateId);
  }

  putBid(bid: MarketplaceBid): void {
    const current = this.bids.get(bid.listingAggregateId) ?? [];
    this.bids.set(bid.listingAggregateId, [...current, bid]);
  }

  getBidsForListing(listingAggregateId: string): MarketplaceBid[] {
    return [...(this.bids.get(listingAggregateId) ?? [])];
  }

  getStoredCommand(actorPubky: string, commandId: string): StoredCommand | undefined {
    return this.commands.get(`${actorPubky}:${commandId}`);
  }

  putStoredCommand(actorPubky: string, commandId: string, stored: StoredCommand): void {
    this.commands.set(`${actorPubky}:${commandId}`, stored);
  }

  appendEvent(event: MarketplaceEvent): void {
    this.events.push(event);
  }

  getEvents(): MarketplaceEvent[] {
    return [...this.events];
  }
}

export class MarketplaceTransactionService {
  constructor(
    private readonly repository: InMemoryMarketplaceRepository,
    private readonly now: () => Date = () => new Date(),
  ) {}

  getListingProjection(aggregateId: string): MarketplaceListingAggregate | undefined {
    return this.repository.getListing(aggregateId);
  }

  getParticipantOffers(actorPubky: string, listingAggregateId: string): MarketplaceOffer[] {
    return this.repository
      .getOffersForListing(listingAggregateId)
      .filter((offer) => offer.buyerPubky === actorPubky || offer.sellerPubky === actorPubky);
  }

  async execute(actorInput: unknown, commandInput: unknown): Promise<MarketplaceCommandResult> {
    const actorResult = commercePubkySchema.safeParse(actorInput);
    const commandResult = marketplaceCommandSchema.safeParse(commandInput);
    if (!actorResult.success || !commandResult.success) {
      const issues = [
        ...(actorResult.success
          ? []
          : actorResult.error.issues.map(({ message, path }) => ({ path: `actor.${path.join('.')}`, message }))),
        ...(commandResult.success
          ? []
          : commandResult.error.issues.map(({ message, path }) => ({ path: path.join('.'), message }))),
      ];
      return failure('INVALID_COMMAND', 'The marketplace command is invalid.', { issues });
    }

    const actorPubky = actorResult.data;
    const command = commandResult.data;
    const requestHash = hashCommand(command);

    return await this.repository.transaction(() => {
      const stored = this.repository.getStoredCommand(actorPubky, command.commandId);
      if (stored) {
        return stored.requestHash === requestHash
          ? stored.result
          : failure('IDEMPOTENCY_CONFLICT', 'The command id was already used with different input.');
      }

      const result = this.dispatchCommand(actorPubky, command);

      if (result.ok) {
        this.repository.putStoredCommand(actorPubky, command.commandId, { requestHash, result });
      }
      return result;
    });
  }

  private dispatchCommand(actorPubky: string, command: MarketplaceCommand): MarketplaceCommandResult {
    switch (command.kind) {
      case 'listing.register':
        return this.registerListing(actorPubky, command);
      case 'inventory.reserve':
        return this.reserveInventory(actorPubky, command);
      case 'offer.create':
        return this.createOffer(actorPubky, command);
      case 'offer.counter':
        return this.counterOffer(actorPubky, command);
      case 'offer.accept':
        return this.acceptOffer(actorPubky, command);
      case 'offer.reject':
        return this.rejectOffer(actorPubky, command);
      case 'offer.withdraw':
        return this.withdrawOffer(actorPubky, command);
      case 'auction.place_bid':
        return this.placeBid(actorPubky, command);
    }
  }

  private registerListing(actorPubky: string, command: RegisterListingCommand): MarketplaceCommandResult {
    const { payload } = command;
    if (actorPubky !== payload.sellerPubky) {
      return failure('UNAUTHORIZED', 'Only the listing seller may register inventory.');
    }

    const expectedAggregateId = buildMarketplaceListingAggregateId(payload.sellerPubky, payload.listingId);
    if (command.aggregateId !== expectedAggregateId) {
      return failure('INVALID_COMMAND', 'The listing aggregate id does not match its seller and listing.');
    }

    const current = this.repository.getListing(command.aggregateId);
    const currentRevision = current?.serverRevision ?? 0;
    if (command.expectedRevision !== currentRevision) {
      return failure('REVISION_CONFLICT', 'The listing revision is stale.', { currentRevision });
    }
    if (current && payload.listingRevision <= current.listingRevision) {
      return failure('REVISION_CONFLICT', 'The public listing revision must advance.', { currentRevision });
    }

    const committedQuantity = (current?.reservedQuantity ?? 0) + (current?.soldQuantity ?? 0);
    if (payload.quantity < committedQuantity) {
      return failure('INVARIANT_VIOLATION', 'Listing quantity cannot fall below committed inventory.', {
        currentRevision,
      });
    }

    const occurredAt = this.now().toISOString();
    const listing: MarketplaceListingAggregate = {
      aggregateId: command.aggregateId,
      sellerPubky: payload.sellerPubky,
      listingId: payload.listingId,
      listingRevision: payload.listingRevision,
      contentHash: payload.contentHash,
      serverRevision: currentRevision + 1,
      state: payload.quantity === committedQuantity ? (committedQuantity > 0 ? 'reserved' : 'sold') : 'available',
      totalQuantity: payload.quantity,
      availableQuantity: payload.quantity - committedQuantity,
      reservedQuantity: current?.reservedQuantity ?? 0,
      soldQuantity: current?.soldQuantity ?? 0,
      unitPrice: payload.unitPrice,
      saleFormat: payload.saleFormat,
      auction: payload.auctionTerms
        ? {
            ...payload.auctionTerms,
            currentPrice: current?.auction?.currentPrice ?? payload.unitPrice,
            leaderPubky: current?.auction?.leaderPubky ?? null,
            bidCount: current?.auction?.bidCount ?? 0,
            reserveMet:
              current?.auction?.reserveMet ??
              (payload.auctionTerms.reservePrice
                ? payload.unitPrice.amountMinor >= payload.auctionTerms.reservePrice.amountMinor
                : true),
          }
        : null,
      updatedAt: occurredAt,
    };
    const event = this.createEvent(actorPubky, command, listing.serverRevision, 'listing.registered', occurredAt);
    this.repository.putListing(listing);
    this.repository.appendEvent(event);
    return success(command, listing.serverRevision, event.id, { kind: 'listing', listing });
  }

  private reserveInventory(actorPubky: string, command: ReserveInventoryCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The listing is not registered.');
    if (listing.sellerPubky === actorPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot reserve their own listing.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The listing revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    if (listing.availableQuantity < command.payload.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The requested quantity is unavailable.', {
        currentRevision: listing.serverRevision,
      });
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const reservation: MarketplaceReservation = {
      id: command.commandId,
      aggregateId: command.aggregateId,
      buyerPubky: actorPubky,
      quantity: command.payload.quantity,
      status: 'active',
      expiresAt: new Date(now.getTime() + command.payload.reservationTtlSeconds * 1_000).toISOString(),
      createdAt: occurredAt,
    };
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      state: listing.availableQuantity === command.payload.quantity ? 'reserved' : 'available',
      availableQuantity: listing.availableQuantity - command.payload.quantity,
      reservedQuantity: listing.reservedQuantity + command.payload.quantity,
      updatedAt: occurredAt,
    };
    const event = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      'inventory.reserved',
      occurredAt,
    );
    this.repository.putListing(updatedListing);
    this.repository.putReservation(reservation);
    this.repository.appendEvent(event);
    return success(command, updatedListing.serverRevision, event.id, {
      kind: 'reservation',
      listing: updatedListing,
      reservation,
    });
  }

  private createOffer(actorPubky: string, command: CreateOfferCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The listing is not registered.');
    if (listing.sellerPubky === actorPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot make an offer on their own listing.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The listing revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    if (listing.availableQuantity < command.payload.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The requested offer quantity is unavailable.', {
        currentRevision: listing.serverRevision,
      });
    }
    if (!sameAsset(listing.unitPrice, command.payload.amount)) {
      return failure('INVALID_COMMAND', 'Offer amount must use the listing asset and exponent.');
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const offer: MarketplaceOffer = {
      id: command.commandId,
      aggregateId: buildMarketplaceOfferAggregateId(command.commandId),
      listingAggregateId: listing.aggregateId,
      buyerPubky: actorPubky,
      sellerPubky: listing.sellerPubky,
      revision: 1,
      state: 'pending',
      offeredBy: actorPubky,
      amount: command.payload.amount,
      quantity: command.payload.quantity,
      message: command.payload.message,
      expiresAt: new Date(now.getTime() + command.payload.expiresInSeconds * 1_000).toISOString(),
      createdAt: occurredAt,
      updatedAt: occurredAt,
      history: [
        {
          revision: 1,
          actorPubky,
          action: 'created',
          amount: command.payload.amount,
          quantity: command.payload.quantity,
          message: command.payload.message,
          occurredAt,
        },
      ],
    };
    const event = this.createEvent(actorPubky, command, offer.revision, 'offer.created', occurredAt);
    this.repository.putOffer(offer);
    this.repository.appendEvent(event);
    return success(command, offer.revision, event.id, { kind: 'offer', offer });
  }

  private counterOffer(actorPubky: string, command: CounterOfferCommand): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (command.expectedRevision !== offer.value.revision) {
      return failure('REVISION_CONFLICT', 'The offer revision is stale.', {
        currentRevision: offer.value.revision,
      });
    }
    if (actorPubky === offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'The current offer author cannot counter their own terms.');
    }
    if (!sameAsset(offer.value.amount, command.payload.amount)) {
      return failure('INVALID_COMMAND', 'Counteroffer amount must use the original asset and exponent.');
    }
    const listing = this.repository.getListing(offer.value.listingAggregateId);
    if (!listing) return failure('NOT_FOUND', 'The offer listing is unavailable.');
    if (listing.availableQuantity < command.payload.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The counteroffer quantity is unavailable.', {
        currentRevision: offer.value.revision,
      });
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const updated: MarketplaceOffer = {
      ...offer.value,
      revision: offer.value.revision + 1,
      state: 'countered',
      offeredBy: actorPubky,
      amount: command.payload.amount,
      quantity: command.payload.quantity,
      message: command.payload.message,
      expiresAt: new Date(now.getTime() + command.payload.expiresInSeconds * 1_000).toISOString(),
      updatedAt: occurredAt,
      history: [
        ...offer.value.history,
        {
          revision: offer.value.revision + 1,
          actorPubky,
          action: 'countered',
          amount: command.payload.amount,
          quantity: command.payload.quantity,
          message: command.payload.message,
          occurredAt,
        },
      ],
    };
    const event = this.createEvent(actorPubky, command, updated.revision, 'offer.countered', occurredAt);
    this.repository.putOffer(updated);
    this.repository.appendEvent(event);
    return success(command, updated.revision, event.id, { kind: 'offer', offer: updated });
  }

  private acceptOffer(actorPubky: string, command: AcceptOfferCommand): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (command.expectedRevision !== offer.value.revision) {
      return failure('REVISION_CONFLICT', 'The offer revision is stale.', {
        currentRevision: offer.value.revision,
      });
    }
    if (actorPubky === offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'The current offer author cannot accept their own terms.');
    }
    const listing = this.repository.getListing(offer.value.listingAggregateId);
    if (!listing) return failure('NOT_FOUND', 'The offer listing is unavailable.');
    if (listing.availableQuantity < offer.value.quantity) {
      return failure('INSUFFICIENT_INVENTORY', 'The offered quantity is no longer available.', {
        currentRevision: offer.value.revision,
      });
    }

    const now = this.now();
    const occurredAt = now.toISOString();
    const acceptedOffer = this.finishOffer(offer.value, actorPubky, 'accepted', occurredAt);
    const reservation: MarketplaceReservation = {
      id: command.commandId,
      aggregateId: listing.aggregateId,
      buyerPubky: acceptedOffer.buyerPubky,
      quantity: acceptedOffer.quantity,
      status: 'active',
      expiresAt: new Date(now.getTime() + 30 * 60 * 1_000).toISOString(),
      createdAt: occurredAt,
    };
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      state: listing.availableQuantity === acceptedOffer.quantity ? 'reserved' : 'available',
      availableQuantity: listing.availableQuantity - acceptedOffer.quantity,
      reservedQuantity: listing.reservedQuantity + acceptedOffer.quantity,
      updatedAt: occurredAt,
    };
    const offerEvent = this.createEvent(actorPubky, command, acceptedOffer.revision, 'offer.accepted', occurredAt);
    const inventoryEvent = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      'inventory.reserved',
      occurredAt,
      updatedListing.aggregateId,
    );
    this.repository.putOffer(acceptedOffer);
    this.repository.putListing(updatedListing);
    this.repository.putReservation(reservation);
    this.repository.appendEvent(offerEvent);
    this.repository.appendEvent(inventoryEvent);
    return success(command, acceptedOffer.revision, [offerEvent.id, inventoryEvent.id], {
      kind: 'accepted_offer',
      offer: acceptedOffer,
      listing: updatedListing,
      reservation,
    });
  }

  private rejectOffer(actorPubky: string, command: RejectOfferCommand): MarketplaceCommandResult {
    return this.completeOfferAction(actorPubky, command, 'rejected', 'offer.rejected');
  }

  private withdrawOffer(actorPubky: string, command: WithdrawOfferCommand): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (actorPubky !== offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'Only the current offer author may withdraw it.');
    }
    return this.completeOfferAction(actorPubky, command, 'withdrawn', 'offer.withdrawn');
  }

  private completeOfferAction(
    actorPubky: string,
    command: RejectOfferCommand | WithdrawOfferCommand,
    state: 'rejected' | 'withdrawn',
    eventKind: 'offer.rejected' | 'offer.withdrawn',
  ): MarketplaceCommandResult {
    const offer = this.getActionableOffer(actorPubky, command.payload.offerId, command.aggregateId);
    if (!offer.ok) return offer.failure;
    if (command.expectedRevision !== offer.value.revision) {
      return failure('REVISION_CONFLICT', 'The offer revision is stale.', {
        currentRevision: offer.value.revision,
      });
    }
    if (state === 'rejected' && actorPubky === offer.value.offeredBy) {
      return failure('UNAUTHORIZED', 'The current offer author cannot reject their own terms.');
    }

    const occurredAt = this.now().toISOString();
    const updated = this.finishOffer(offer.value, actorPubky, state, occurredAt);
    const event = this.createEvent(actorPubky, command, updated.revision, eventKind, occurredAt);
    this.repository.putOffer(updated);
    this.repository.appendEvent(event);
    return success(command, updated.revision, event.id, { kind: 'offer', offer: updated });
  }

  private getActionableOffer(
    actorPubky: string,
    offerId: string,
    aggregateId: string,
  ): { ok: true; value: MarketplaceOffer } | { ok: false; failure: MarketplaceCommandFailure } {
    const offer = this.repository.getOffer(offerId);
    if (!offer) return { ok: false, failure: failure('NOT_FOUND', 'The offer was not found.') };
    if (aggregateId !== offer.aggregateId) {
      return { ok: false, failure: failure('INVALID_COMMAND', 'The offer aggregate id is invalid.') };
    }
    if (actorPubky !== offer.buyerPubky && actorPubky !== offer.sellerPubky) {
      return { ok: false, failure: failure('UNAUTHORIZED', 'Only offer participants may act on it.') };
    }
    if (offer.state !== 'pending' && offer.state !== 'countered') {
      return { ok: false, failure: failure('INVALID_STATE', 'The offer is no longer actionable.') };
    }
    if (Date.parse(offer.expiresAt) <= this.now().getTime()) {
      return { ok: false, failure: failure('OFFER_EXPIRED', 'The offer has expired.') };
    }
    return { ok: true, value: offer };
  }

  private finishOffer(
    offer: MarketplaceOffer,
    actorPubky: string,
    state: 'accepted' | 'rejected' | 'withdrawn',
    occurredAt: string,
  ): MarketplaceOffer {
    const revision = offer.revision + 1;
    return {
      ...offer,
      revision,
      state,
      updatedAt: occurredAt,
      history: [
        ...offer.history,
        {
          revision,
          actorPubky,
          action: state,
          amount: offer.amount,
          quantity: offer.quantity,
          message: '',
          occurredAt,
        },
      ],
    };
  }

  private placeBid(actorPubky: string, command: PlaceBidCommand): MarketplaceCommandResult {
    const listing = this.repository.getListing(command.aggregateId);
    if (!listing) return failure('NOT_FOUND', 'The auction listing is not registered.');
    if (listing.sellerPubky === actorPubky) {
      return failure('UNAUTHORIZED', 'A seller cannot bid on their own auction.');
    }
    if (listing.saleFormat !== 'auction' || !listing.auction) {
      return failure('INVALID_STATE', 'This listing is not an auction.');
    }
    if (command.expectedRevision !== listing.serverRevision) {
      return failure('REVISION_CONFLICT', 'The auction revision is stale.', {
        currentRevision: listing.serverRevision,
      });
    }
    const now = this.now();
    const nowMs = now.getTime();
    if (nowMs < Date.parse(listing.auction.startsAt) || nowMs >= Date.parse(listing.auction.endsAt)) {
      return failure('AUCTION_CLOSED', 'The auction is not open for bidding.');
    }
    if (!sameAsset(listing.unitPrice, command.payload.maximumAmount)) {
      return failure('INVALID_COMMAND', 'Bid maximum must use the auction asset and exponent.');
    }
    if (command.payload.maximumAmount.amountMinor <= listing.auction.currentPrice.amountMinor) {
      return failure('BID_TOO_LOW', 'Bid maximum must exceed the current visible price.', {
        currentRevision: listing.serverRevision,
      });
    }

    const previousBids = this.repository.getBidsForListing(listing.aggregateId);
    const bidderPreviousMaximum = previousBids
      .filter((bid) => bid.bidderPubky === actorPubky)
      .reduce((maximum, bid) => Math.max(maximum, bid.maximumAmount.amountMinor), 0);
    if (command.payload.maximumAmount.amountMinor <= bidderPreviousMaximum) {
      return failure('BID_TOO_LOW', 'A new proxy maximum must exceed the bidder previous maximum.', {
        currentRevision: listing.serverRevision,
      });
    }

    const occurredAt = now.toISOString();
    const bid: MarketplaceBid = {
      id: command.commandId,
      listingAggregateId: listing.aggregateId,
      bidderPubky: actorPubky,
      maximumAmount: command.payload.maximumAmount,
      sequence: listing.auction.bidCount + 1,
      createdAt: occurredAt,
    };
    const bidderMaximums = latestBidderMaximums([...previousBids, bid]);
    const ranked = [...bidderMaximums.values()].sort(
      (left, right) =>
        right.maximumAmount.amountMinor - left.maximumAmount.amountMinor || left.sequence - right.sequence,
    );
    const leader = ranked[0];
    const runnerUp = ranked[1];
    const visibleAmount = runnerUp
      ? Math.min(
          leader.maximumAmount.amountMinor,
          runnerUp.maximumAmount.amountMinor + listing.auction.minimumIncrement.amountMinor,
        )
      : listing.unitPrice.amountMinor;
    const remainingMs = Date.parse(listing.auction.endsAt) - nowMs;
    const shouldExtend =
      listing.auction.antiSnipingWindowSeconds > 0 && remainingMs <= listing.auction.antiSnipingWindowSeconds * 1_000;
    const endsAt = shouldExtend
      ? new Date(nowMs + listing.auction.antiSnipingExtensionSeconds * 1_000).toISOString()
      : listing.auction.endsAt;
    const currentPrice = { ...listing.unitPrice, amountMinor: visibleAmount };
    const updatedListing: MarketplaceListingAggregate = {
      ...listing,
      serverRevision: listing.serverRevision + 1,
      auction: {
        ...listing.auction,
        endsAt,
        currentPrice,
        leaderPubky: leader.bidderPubky,
        bidCount: listing.auction.bidCount + 1,
        reserveMet: listing.auction.reservePrice ? visibleAmount >= listing.auction.reservePrice.amountMinor : true,
      },
      updatedAt: occurredAt,
    };
    const event = this.createEvent(
      actorPubky,
      command,
      updatedListing.serverRevision,
      'auction.bid_placed',
      occurredAt,
    );
    this.repository.putBid(bid);
    this.repository.putListing(updatedListing);
    this.repository.appendEvent(event);
    return success(command, updatedListing.serverRevision, event.id, {
      kind: 'bid',
      listing: updatedListing,
      bid,
    });
  }

  private createEvent(
    actorPubky: string,
    command: MarketplaceCommand,
    revision: number,
    kind: MarketplaceEvent['kind'],
    occurredAt: string,
    aggregateId = command.aggregateId,
  ): MarketplaceEvent {
    return {
      id: randomUUID(),
      commandId: command.commandId,
      aggregateId,
      revision,
      actorPubky,
      kind,
      occurredAt,
    };
  }
}

function success(
  command: MarketplaceCommand,
  revision: number,
  eventIds: string | string[],
  result: MarketplaceCommandSuccess['result'],
): MarketplaceCommandSuccess {
  return {
    ok: true,
    version: 1,
    commandId: command.commandId,
    aggregateId: command.aggregateId,
    revision,
    eventIds: Array.isArray(eventIds) ? eventIds : [eventIds],
    result,
  };
}

function failure(
  code: MarketplaceCommandFailure['error']['code'],
  message: string,
  details: Pick<MarketplaceCommandFailure['error'], 'currentRevision' | 'issues'> = {},
): MarketplaceCommandFailure {
  return { ok: false, error: { code, message, ...details } };
}

function hashCommand(command: MarketplaceCommand): string {
  return createHash('sha256').update(JSON.stringify(command)).digest('hex');
}

function sameAsset(
  left: MarketplaceListingAggregate['unitPrice'],
  right: MarketplaceListingAggregate['unitPrice'],
): boolean {
  return left.currency === right.currency && left.exponent === right.exponent;
}

function latestBidderMaximums(bids: MarketplaceBid[]): Map<string, MarketplaceBid> {
  const latest = new Map<string, MarketplaceBid>();
  for (const bid of bids) {
    const current = latest.get(bid.bidderPubky);
    if (
      !current ||
      bid.maximumAmount.amountMinor > current.maximumAmount.amountMinor ||
      (bid.maximumAmount.amountMinor === current.maximumAmount.amountMinor && bid.sequence < current.sequence)
    ) {
      latest.set(bid.bidderPubky, bid);
    }
  }
  return latest;
}
