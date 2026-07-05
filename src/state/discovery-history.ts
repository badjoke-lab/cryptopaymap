import type {
  BottomSheetState,
  DiscoveryMapBounds,
} from './discovery-store';
import {
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
  type DiscoveryUrlState,
} from './discovery-url';

export interface DiscoveryHistoryUiState {
  bottomSheet: BottomSheetState;
  listScrollOffset: number;
  filterPanelOpen: boolean;
  activeBounds: DiscoveryMapBounds | null;
}

export interface DiscoveryHistorySnapshot {
  urlState: DiscoveryUrlState;
  uiState: DiscoveryHistoryUiState;
}

export type DiscoveryHistoryMode = 'push' | 'replace';

const defaultHistoryUiState: DiscoveryHistoryUiState = {
  bottomSheet: 'closed',
  listScrollOffset: 0,
  filterPanelOpen: false,
  activeBounds: null,
};

const bottomSheetStates = new Set<BottomSheetState>(['closed', 'peek', 'expanded']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function parseBounds(value: unknown): DiscoveryMapBounds | null {
  if (value === null) return null;
  if (!isRecord(value)) return null;

  const west = finiteNumber(value.west);
  const south = finiteNumber(value.south);
  const east = finiteNumber(value.east);
  const north = finiteNumber(value.north);
  if (west === null || south === null || east === null || north === null) return null;

  return { west, south, east, north };
}

function parseHistoryUiState(value: unknown): DiscoveryHistoryUiState {
  if (!isRecord(value)) return { ...defaultHistoryUiState };

  const bottomSheet = bottomSheetStates.has(value.bottomSheet as BottomSheetState)
    ? (value.bottomSheet as BottomSheetState)
    : defaultHistoryUiState.bottomSheet;
  const listScrollOffset =
    typeof value.listScrollOffset === 'number' && Number.isFinite(value.listScrollOffset)
      ? Math.max(0, value.listScrollOffset)
      : defaultHistoryUiState.listScrollOffset;
  const filterPanelOpen =
    typeof value.filterPanelOpen === 'boolean'
      ? value.filterPanelOpen
      : defaultHistoryUiState.filterPanelOpen;

  return {
    bottomSheet,
    listScrollOffset,
    filterPanelOpen,
    activeBounds: parseBounds(value.activeBounds),
  };
}

function readExistingHistoryState(value: unknown): Record<string, unknown> {
  return isRecord(value) ? value : {};
}

export function readDiscoveryHistorySnapshot(
  search: string,
  historyState: unknown,
): DiscoveryHistorySnapshot {
  const stateRecord = readExistingHistoryState(historyState);

  return {
    urlState: parseDiscoveryUrlState(search),
    uiState: parseHistoryUiState(stateRecord.cpmDiscovery),
  };
}

export function readDiscoveryHistoryFromWindow(): DiscoveryHistorySnapshot {
  if (typeof window === 'undefined') {
    return readDiscoveryHistorySnapshot('', null);
  }

  return readDiscoveryHistorySnapshot(window.location.search, window.history.state);
}

export function writeDiscoveryHistory(
  urlState: DiscoveryUrlState,
  uiState: DiscoveryHistoryUiState,
  mode: DiscoveryHistoryMode,
): void {
  if (typeof window === 'undefined') return;

  const url = new URL(window.location.href);
  const serialized = serializeDiscoveryUrlState(urlState).toString();
  url.search = serialized;

  const nextHistoryState = {
    ...readExistingHistoryState(window.history.state),
    cpmDiscovery: {
      bottomSheet: uiState.bottomSheet,
      listScrollOffset: Math.max(0, uiState.listScrollOffset),
      filterPanelOpen: uiState.filterPanelOpen,
      activeBounds: uiState.activeBounds ? { ...uiState.activeBounds } : null,
    },
  };

  if (mode === 'push') {
    window.history.pushState(nextHistoryState, '', url);
  } else {
    window.history.replaceState(nextHistoryState, '', url);
  }
}
