import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import { CommerceActionTypes, commerceInitialState, type CommerceStore } from './commerce.types';

export const useCommerceStore = create<CommerceStore>()(
  devtools(
    (set) => ({
      ...commerceInitialState,
      setQuery: (query) => set({ query }, false, CommerceActionTypes.SET_QUERY),
      setCategoryId: (categoryId) => set({ categoryId }, false, CommerceActionTypes.SET_CATEGORY),
      setSaleFormat: (saleFormat) => set({ saleFormat }, false, CommerceActionTypes.SET_SALE_FORMAT),
      setConditions: (conditions) =>
        set({ conditions: [...new Set(conditions)] }, false, CommerceActionTypes.SET_CONDITIONS),
      setPriceRange: (minimumPriceMinor, maximumPriceMinor) =>
        set({ minimumPriceMinor, maximumPriceMinor }, false, CommerceActionTypes.SET_PRICE_RANGE),
      setSort: (sort) => set({ sort }, false, CommerceActionTypes.SET_SORT),
      setLayout: (layout) => set({ layout }, false, CommerceActionTypes.SET_LAYOUT),
      setSelectedListingId: (selectedListingId) =>
        set({ selectedListingId }, false, CommerceActionTypes.SET_SELECTED_LISTING),
      setEntityPending: (entityId, isPending) =>
        set(
          (state) => ({
            pendingEntityIds: isPending
              ? state.pendingEntityIds.includes(entityId)
                ? state.pendingEntityIds
                : [...state.pendingEntityIds, entityId]
              : state.pendingEntityIds.filter((pendingId) => pendingId !== entityId),
          }),
          false,
          CommerceActionTypes.SET_ENTITY_PENDING,
        ),
      resetFilters: () =>
        set(
          {
            query: commerceInitialState.query,
            categoryId: commerceInitialState.categoryId,
            saleFormat: commerceInitialState.saleFormat,
            conditions: commerceInitialState.conditions,
            minimumPriceMinor: commerceInitialState.minimumPriceMinor,
            maximumPriceMinor: commerceInitialState.maximumPriceMinor,
            sort: commerceInitialState.sort,
          },
          false,
          CommerceActionTypes.RESET_FILTERS,
        ),
      reset: () => set(commerceInitialState, false, CommerceActionTypes.RESET),
    }),
    {
      name: 'commerce-store',
      enabled: process.env.NODE_ENV === 'development',
    },
  ),
);
