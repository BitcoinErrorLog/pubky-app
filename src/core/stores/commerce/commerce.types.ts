export type CommerceSaleFormatFilter = 'all' | 'fixed_price' | 'auction';
export type CommerceConditionFilter = 'new' | 'like_new' | 'excellent' | 'good' | 'fair' | 'for_parts';
export type CommerceSort = 'recommended' | 'newest' | 'price_low' | 'price_high' | 'ending_soon';
export type CommerceLayout = 'grid' | 'list';

export interface CommerceState {
  query: string;
  categoryId: string | null;
  saleFormat: CommerceSaleFormatFilter;
  conditions: CommerceConditionFilter[];
  minimumPriceMinor: number | null;
  maximumPriceMinor: number | null;
  sort: CommerceSort;
  layout: CommerceLayout;
  selectedListingId: string | null;
  pendingEntityIds: string[];
}

export interface CommerceActions {
  setQuery: (query: string) => void;
  setCategoryId: (categoryId: string | null) => void;
  setSaleFormat: (saleFormat: CommerceSaleFormatFilter) => void;
  setConditions: (conditions: CommerceConditionFilter[]) => void;
  setPriceRange: (minimumPriceMinor: number | null, maximumPriceMinor: number | null) => void;
  setSort: (sort: CommerceSort) => void;
  setLayout: (layout: CommerceLayout) => void;
  setSelectedListingId: (listingId: string | null) => void;
  setEntityPending: (entityId: string, isPending: boolean) => void;
  resetFilters: () => void;
  reset: () => void;
}

export type CommerceStore = CommerceState & CommerceActions;

export const commerceInitialState: CommerceState = {
  query: '',
  categoryId: null,
  saleFormat: 'all',
  conditions: [],
  minimumPriceMinor: null,
  maximumPriceMinor: null,
  sort: 'recommended',
  layout: 'grid',
  selectedListingId: null,
  pendingEntityIds: [],
};

export enum CommerceActionTypes {
  SET_QUERY = 'SET_QUERY',
  SET_CATEGORY = 'SET_CATEGORY',
  SET_SALE_FORMAT = 'SET_SALE_FORMAT',
  SET_CONDITIONS = 'SET_CONDITIONS',
  SET_PRICE_RANGE = 'SET_PRICE_RANGE',
  SET_SORT = 'SET_SORT',
  SET_LAYOUT = 'SET_LAYOUT',
  SET_SELECTED_LISTING = 'SET_SELECTED_LISTING',
  SET_ENTITY_PENDING = 'SET_ENTITY_PENDING',
  RESET_FILTERS = 'RESET_FILTERS',
  RESET = 'RESET',
}
