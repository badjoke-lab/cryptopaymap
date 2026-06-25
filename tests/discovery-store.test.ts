import { describe, expect, it } from 'vitest';
import { createDiscoveryStore } from '../src/state/discovery-store';

describe('discovery UI store', () => {
  it('creates isolated state for each application area', () => {
    const first = createDiscoveryStore();
    const second = createDiscoveryStore();

    first.getState().patchUrlState({ assets: ['btc'], view: 'list' });
    first.getState().setBottomSheet('expanded');
    first.getState().setListScrollOffset(480);

    expect(first.getState().urlState.assets).toEqual(['btc']);
    expect(first.getState().urlState.view).toBe('list');
    expect(first.getState().bottomSheet).toBe('expanded');
    expect(first.getState().listScrollOffset).toBe(480);

    expect(second.getState().urlState.assets).toEqual([]);
    expect(second.getState().urlState.view).toBe('map');
    expect(second.getState().bottomSheet).toBe('closed');
    expect(second.getState().listScrollOffset).toBe(0);
  });

  it('clamps negative scroll offsets and resets ephemeral state', () => {
    const store = createDiscoveryStore({
      bottomSheet: 'peek',
      listScrollOffset: 240,
      filterPanelOpen: true,
      pendingViewport: { latitude: 35.68, longitude: 139.76, zoom: 13 },
    });

    store.getState().setListScrollOffset(-50);
    expect(store.getState().listScrollOffset).toBe(0);

    store.getState().resetEphemeralState();
    expect(store.getState().bottomSheet).toBe('closed');
    expect(store.getState().filterPanelOpen).toBe(false);
    expect(store.getState().pendingViewport).toBeNull();
  });
});
