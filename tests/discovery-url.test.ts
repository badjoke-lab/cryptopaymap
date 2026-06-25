import { describe, expect, it } from 'vitest';
import {
  defaultDiscoveryUrlState,
  parseDiscoveryUrlState,
  serializeDiscoveryUrlState,
} from '../src/state/discovery-url';

describe('discovery URL state', () => {
  it('normalizes, bounds, and filters public values', () => {
    const state = parseDiscoveryUrlState(
      '?q=%20coffee%20%20shop%20&asset=USDC,btc,btc&network=Base&status=candidate,stale&route=direct_wallet&lat=91&lng=-181&z=99&place=Example-Coffee&view=list',
    );

    expect(state.search).toBe('coffee shop');
    expect(state.assets).toEqual(['btc', 'usdc']);
    expect(state.networks).toEqual(['base']);
    expect(state.statuses).toEqual(['stale']);
    expect(state.routes).toEqual(['direct_wallet']);
    expect(state.viewport).toEqual({ latitude: 90, longitude: -180, zoom: 22 });
    expect(state.selectedPlace).toBe('example-coffee');
    expect(state.view).toBe('list');
  });

  it('uses safe defaults for unsupported values', () => {
    const state = parseDiscoveryUrlState('?status=candidate&view=grid&place=../private');

    expect(state.statuses).toEqual(['confirmed']);
    expect(state.view).toBe('map');
    expect(state.selectedPlace).toBeNull();
  });

  it('serializes defaults without redundant parameters', () => {
    expect(serializeDiscoveryUrlState(defaultDiscoveryUrlState).toString()).toBe('');
  });

  it('round-trips into a deterministic canonical query', () => {
    const parsed = parseDiscoveryUrlState(
      '?network=lightning,base&asset=usdc,btc&status=stale,confirmed&view=list',
    );
    const serialized = serializeDiscoveryUrlState(parsed).toString();

    expect(serialized).toBe(
      'asset=btc%2Cusdc&network=base%2Clightning&status=confirmed%2Cstale&view=list',
    );
    expect(parseDiscoveryUrlState(serialized)).toEqual(parsed);
  });
});
