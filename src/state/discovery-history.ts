import type { BottomSheetState } from './discovery-store';
import {
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
  type DiscoveryUrlState,
} from './discovery-url';

export interface DiscoveryHistoryUiState {
  bottomSheet: BottomSheetState;
  listScrollOffset: number;
  filterPanelOpen: boolean;
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
};

const bottomSheetStates = new Set<BottomSheetState>(['closed', 'peek', 'expanded']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
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

  return { bottomSheet, listScrollOffset, filterPanelOpen };
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
    },
  };

  if (mode === 'push') {
    window.history.pushState(nextHistoryState, '', url);
  } else {
    window.history.replaceState(nextHistoryState, '', url);
  }
}
