import { useCallback, useEffect } from 'react';
import { useDiscoveryStoreApi } from '../components/state/DiscoveryStoreProvider';
import {
  readDiscoveryHistoryFromWindow,
  writeDiscoveryHistory,
  type DiscoveryHistoryMode,
  type DiscoveryHistoryUiState,
} from './discovery-history';
import { mergeDiscoveryUrlState, type DiscoveryUrlState } from './discovery-url';

export interface DiscoveryHistoryControls {
  commitUrlPatch: (patch: Partial<DiscoveryUrlState>, mode?: DiscoveryHistoryMode) => void;
  commitUiPatch: (patch: Partial<DiscoveryHistoryUiState>) => void;
}

export function useDiscoveryHistorySync(): DiscoveryHistoryControls {
  const store = useDiscoveryStoreApi();

  useEffect(() => {
    function restoreFromHistory() {
      const snapshot = readDiscoveryHistoryFromWindow();
      const actions = store.getState();

      actions.setUrlState(snapshot.urlState);
      actions.setBottomSheet(snapshot.uiState.bottomSheet);
      actions.setListScrollOffset(snapshot.uiState.listScrollOffset);
      actions.setFilterPanelOpen(snapshot.uiState.filterPanelOpen);
      actions.setActiveBounds(snapshot.uiState.activeBounds);
      actions.setPendingViewport(null);
      actions.setPendingBounds(null);
    }

    restoreFromHistory();
    window.addEventListener('popstate', restoreFromHistory);

    return () => window.removeEventListener('popstate', restoreFromHistory);
  }, [store]);

  const commitUrlPatch = useCallback(
    (patch: Partial<DiscoveryUrlState>, mode: DiscoveryHistoryMode = 'push') => {
      const current = store.getState();
      const nextUrlState = mergeDiscoveryUrlState(current.urlState, patch);

      current.setUrlState(nextUrlState);
      writeDiscoveryHistory(
        nextUrlState,
        {
          bottomSheet: current.bottomSheet,
          listScrollOffset: current.listScrollOffset,
          filterPanelOpen: current.filterPanelOpen,
          activeBounds: current.activeBounds,
        },
        mode,
      );
    },
    [store],
  );

  const commitUiPatch = useCallback(
    (patch: Partial<DiscoveryHistoryUiState>) => {
      const current = store.getState();
      const nextUiState: DiscoveryHistoryUiState = {
        bottomSheet: patch.bottomSheet ?? current.bottomSheet,
        listScrollOffset: patch.listScrollOffset ?? current.listScrollOffset,
        filterPanelOpen: patch.filterPanelOpen ?? current.filterPanelOpen,
        activeBounds: patch.activeBounds ?? current.activeBounds,
      };

      if (patch.bottomSheet !== undefined) current.setBottomSheet(patch.bottomSheet);
      if (patch.listScrollOffset !== undefined) current.setListScrollOffset(patch.listScrollOffset);
      if (patch.filterPanelOpen !== undefined) current.setFilterPanelOpen(patch.filterPanelOpen);
      if (patch.activeBounds !== undefined) current.setActiveBounds(patch.activeBounds);

      writeDiscoveryHistory(current.urlState, nextUiState, 'replace');
    },
    [store],
  );

  return { commitUrlPatch, commitUiPatch };
}
