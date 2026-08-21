export type CommerceSaleFormatFilter = 'all' | 'fixed_price' | 'auction';

/**
 * Public facts about the marketplace transaction-service session, set by the
 * controller when a signer-approved session is established. Deliberately
 * NEVER contains the bearer token — that lives only inside
 * `MarketplaceSessionService`'s private field. This mirror exists so
 * durable-mode surfaces can re-render (and refetch) the moment a session is
 * connected, and it is cleared with the rest of the store on sign-out.
 */
export interface CommerceMarketplaceSession {
  pubky: string;
  capabilities: string;
  expiresAt: string;
}
export type CommerceConditionFilter = 'new' | 'like_new' | 'excellent' | 'good' | 'fair' | 'for_parts';
export type CommerceSort = 'recommended' | 'newest' | 'price_low' | 'price_high' | 'ending_soon';
export type CommerceLayout = 'grid' | 'list';

export interface CommerceState {
  query: string;
  categoryId: string | null;
  /**
   * Active attribute facet filters (attribute key -> stored value), scoped
   * to the current category — changing or clearing the category clears them.
   */
  attributeFilters: Record<string, string>;
  saleFormat: CommerceSaleFormatFilter;
  conditions: CommerceConditionFilter[];
  minimumPriceMinor: number | null;
  maximumPriceMinor: number | null;
  sort: CommerceSort;
  layout: CommerceLayout;
  selectedListingId: string | null;
  pendingEntityIds: string[];
  marketplaceSession: CommerceMarketplaceSession | null;
}

export interface CommerceActions {
  setQuery: (query: string) => void;
  setCategoryId: (categoryId: string | null) => void;
  setAttributeFilter: (key: string, value: string | null) => void;
  setSaleFormat: (saleFormat: CommerceSaleFormatFilter) => void;
  setConditions: (conditions: CommerceConditionFilter[]) => void;
  setPriceRange: (minimumPriceMinor: number | null, maximumPriceMinor: number | null) => void;
  setSort: (sort: CommerceSort) => void;
  setLayout: (layout: CommerceLayout) => void;
  setSelectedListingId: (listingId: string | null) => void;
  setEntityPending: (entityId: string, isPending: boolean) => void;
  setMarketplaceSession: (session: CommerceMarketplaceSession | null) => void;
  resetFilters: () => void;
  reset: () => void;
}

export type CommerceStore = CommerceState & CommerceActions;

export const commerceInitialState: CommerceState = {
  query: '',
  categoryId: null,
  attributeFilters: {},
  saleFormat: 'all',
  conditions: [],
  minimumPriceMinor: null,
  maximumPriceMinor: null,
  sort: 'recommended',
  layout: 'grid',
  selectedListingId: null,
  pendingEntityIds: [],
  marketplaceSession: null,
};

export enum CommerceActionTypes {
  SET_QUERY = 'SET_QUERY',
  SET_CATEGORY = 'SET_CATEGORY',
  SET_ATTRIBUTE_FILTER = 'SET_ATTRIBUTE_FILTER',
  SET_SALE_FORMAT = 'SET_SALE_FORMAT',
  SET_CONDITIONS = 'SET_CONDITIONS',
  SET_PRICE_RANGE = 'SET_PRICE_RANGE',
  SET_SORT = 'SET_SORT',
  SET_LAYOUT = 'SET_LAYOUT',
  SET_SELECTED_LISTING = 'SET_SELECTED_LISTING',
  SET_ENTITY_PENDING = 'SET_ENTITY_PENDING',
  SET_MARKETPLACE_SESSION = 'SET_MARKETPLACE_SESSION',
  RESET_FILTERS = 'RESET_FILTERS',
  RESET = 'RESET',
}
