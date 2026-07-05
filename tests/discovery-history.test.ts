import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  readDiscoveryHistorySnapshot,
  writeDiscoveryHistory,
} from '../src/state/discovery-history';
import { defaultDiscoveryUrlState } from '../src/state/discovery-url';

beforeEach(() => {
  window.history.replaceState({ preserved: true }, '', '/places');
});

afterEach(() => {
  vi.restoreAllMocks();
  window.history.replaceState({}, '', '/');
});

describe('discovery browser history contract', () => {
  it('parses URL-owned state and validates UI restoration state', () => {
    const snapshot = readDiscoveryHistorySnapshot('?q=coffee&view=list', {
      cpmDiscovery: {
        bottomSheet: 'expanded',
        listScrollOffset: 240,
        filterPanelOpen: true,
        activeBounds: { west: 139, south: 35, east: 140, north: 36 },
      },
    });

    expect(snapshot.urlState.search).toBe('coffee');
    expect(snapshot.urlState.view).toBe('list');
    expect(snapshot.uiState).toEqual({
      bottomSheet: 'expanded',
      listScrollOffset: 240,
      filterPanelOpen: true,
      activeBounds: { west: 139, south: 35, east: 140, north: 36 },
    });
  });

  it('falls back safely when UI restoration state is malformed', () => {
    const snapshot = readDiscoveryHistorySnapshot('', {
      cpmDiscovery: {
        bottomSheet: 'invalid',
        listScrollOffset: -40,
        filterPanelOpen: 'yes',
        activeBounds: { west: 'bad' },
      },
    });

    expect(snapshot.uiState).toEqual({
      bottomSheet: 'closed',
      listScrollOffset: 0,
      filterPanelOpen: false,
      activeBounds: null,
    });
  });

  it('writes bounded UI restoration state without dropping unrelated history state', () => {
    writeDiscoveryHistory(
      { ...defaultDiscoveryUrlState, selectedPlace: 'example-coffee-tokyo' },
      {
        bottomSheet: 'peek',
        listScrollOffset: 180,
        filterPanelOpen: false,
        activeBounds: { west: 139, south: 35, east: 140, north: 36 },
      },
      'replace',
    );

    expect(window.location.search).toContain('place=example-coffee-tokyo');
    expect(window.history.state.preserved).toBe(true);
    expect(window.history.state.cpmDiscovery).toEqual({
      bottomSheet: 'peek',
      listScrollOffset: 180,
      filterPanelOpen: false,
      activeBounds: { west: 139, south: 35, east: 140, north: 36 },
    });
  });

  it('uses pushState only for explicit history commits', () => {
    const pushState = vi.spyOn(window.history, 'pushState');
    const replaceState = vi.spyOn(window.history, 'replaceState');

    writeDiscoveryHistory(
      { ...defaultDiscoveryUrlState, view: 'list' },
      {
        bottomSheet: 'closed',
        listScrollOffset: 0,
        filterPanelOpen: false,
        activeBounds: null,
      },
      'push',
    );

    expect(pushState).toHaveBeenCalledTimes(1);
    expect(replaceState).not.toHaveBeenCalled();
  });
});
