import { createStore } from 'zustand/vanilla';
import {
  defaultDiscoveryUrlState,
  mergeDiscoveryUrlState,
  type DiscoveryUrlState,
  type DiscoveryViewport,
} from './discovery-url';

export type BottomSheetState = 'closed' | 'peek' | 'expanded';

export interface DiscoveryMapBounds {
  west: number;
  south: number;
  east: number;
  north: number;
}

export interface DiscoveryUiState {
  urlState: DiscoveryUrlState;
  bottomSheet: BottomSheetState;
  listScrollOffset: number;
  filterPanelOpen: boolean;
  pendingViewport: DiscoveryViewport | null;
  pendingBounds: DiscoveryMapBounds | null;
  activeBounds: DiscoveryMapBounds | null;
}

export interface DiscoveryUiActions {
  setUrlState: (next: DiscoveryUrlState) => void;
  patchUrlState: (patch: Partial<DiscoveryUrlState>) => void;
  setBottomSheet: (next: BottomSheetState) => void;
  setListScrollOffset: (next: number) => void;
  setFilterPanelOpen: (next: boolean) => void;
  setPendingViewport: (next: DiscoveryViewport | null) => void;
  setPendingBounds: (next: DiscoveryMapBounds | null) => void;
  setActiveBounds: (next: DiscoveryMapBounds | null) => void;
  resetEphemeralState: () => void;
}

export type DiscoveryStoreState = DiscoveryUiState & DiscoveryUiActions;

export interface DiscoveryStoreInitialState {
  urlState?: DiscoveryUrlState;
  bottomSheet?: BottomSheetState;
  listScrollOffset?: number;
  filterPanelOpen?: boolean;
  pendingViewport?: DiscoveryViewport | null;
  pendingBounds?: DiscoveryMapBounds | null;
  activeBounds?: DiscoveryMapBounds | null;
}

function cloneUrlState(state: DiscoveryUrlState): DiscoveryUrlState {
  return {
    ...state,
    assets: [...state.assets],
    networks: [...state.networks],
    categories: [...state.categories],
    routes: [...state.routes],
    statuses: [...state.statuses],
    viewport: state.viewport ? { ...state.viewport } : null,
  };
}

function cloneBounds(bounds: DiscoveryMapBounds | null | undefined): DiscoveryMapBounds | null {
  return bounds ? { ...bounds } : null;
}

export function createDiscoveryStore(initialState: DiscoveryStoreInitialState = {}) {
  const initialUrlState = cloneUrlState(initialState.urlState ?? defaultDiscoveryUrlState);

  return createStore<DiscoveryStoreState>()((set) => ({
    urlState: initialUrlState,
    bottomSheet: initialState.bottomSheet ?? 'closed',
    listScrollOffset: Math.max(0, initialState.listScrollOffset ?? 0),
    filterPanelOpen: initialState.filterPanelOpen ?? false,
    pendingViewport: initialState.pendingViewport ?? null,
    pendingBounds: cloneBounds(initialState.pendingBounds),
    activeBounds: cloneBounds(initialState.activeBounds),

    setUrlState: (next) => set({ urlState: cloneUrlState(next) }),
    patchUrlState: (patch) =>
      set((state) => ({ urlState: mergeDiscoveryUrlState(state.urlState, patch) })),
    setBottomSheet: (next) => set({ bottomSheet: next }),
    setListScrollOffset: (next) => set({ listScrollOffset: Math.max(0, next) }),
    setFilterPanelOpen: (next) => set({ filterPanelOpen: next }),
    setPendingViewport: (next) => set({ pendingViewport: next ? { ...next } : null }),
    setPendingBounds: (next) => set({ pendingBounds: cloneBounds(next) }),
    setActiveBounds: (next) => set({ activeBounds: cloneBounds(next) }),
    resetEphemeralState: () =>
      set({
        bottomSheet: 'closed',
        listScrollOffset: 0,
        filterPanelOpen: false,
        pendingViewport: null,
        pendingBounds: null,
      }),
  }));
}

export type DiscoveryStoreApi = ReturnType<typeof createDiscoveryStore>;
