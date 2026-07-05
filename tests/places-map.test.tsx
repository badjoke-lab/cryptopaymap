import '@testing-library/jest-dom/vitest';
import { act, cleanup, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlacesMap } from '../src/components/places/PlacesMap';
import type { PublicPlacePin } from '../src/public/places-discovery';

interface HandlerRegistration {
  event: string;
  layerId: string | null;
  handler: (event: Record<string, unknown>) => void | Promise<void>;
}

class MockGeoJsonSource {
  data: unknown;

  constructor(data: unknown) {
    this.data = data;
  }

  setData(data: unknown) {
    this.data = data;
  }

  async getClusterExpansionZoom() {
    return 14;
  }
}

class MockMap {
  static latest: MockMap | null = null;

  readonly handlers: HandlerRegistration[] = [];
  readonly layers: Array<Record<string, unknown>> = [];
  readonly sources = new Map<string, MockGeoJsonSource>();
  readonly options: Record<string, unknown>;
  center = { lat: 35.681236, lng: 139.767125 };
  zoom = 11;
  canvas = { style: { cursor: '' } };
  removed = false;

  constructor(options: Record<string, unknown>) {
    this.options = options;
    MockMap.latest = this;
  }

  addControl() {}

  on(
    event: string,
    layerOrHandler: string | ((event: Record<string, unknown>) => void | Promise<void>),
    maybeHandler?: (event: Record<string, unknown>) => void | Promise<void>,
  ) {
    const layerId = typeof layerOrHandler === 'string' ? layerOrHandler : null;
    const handler = typeof layerOrHandler === 'function' ? layerOrHandler : maybeHandler;
    if (handler) this.handlers.push({ event, layerId, handler });
    return this;
  }

  addSource(id: string, source: { data: unknown }) {
    this.sources.set(id, new MockGeoJsonSource(source.data));
  }

  addLayer(layer: Record<string, unknown>) {
    this.layers.push(layer);
  }

  getSource(id: string) {
    return this.sources.get(id);
  }

  getCenter() {
    return this.center;
  }

  getZoom() {
    return this.zoom;
  }

  getCanvas() {
    return this.canvas;
  }

  queryRenderedFeatures() {
    return [];
  }

  easeTo(options: { center?: [number, number]; zoom?: number }) {
    if (options.center) {
      this.center = { lng: options.center[0], lat: options.center[1] };
    }
    if (options.zoom !== undefined) this.zoom = options.zoom;
  }

  resize() {}

  remove() {
    this.removed = true;
  }

  async trigger(
    event: string,
    payload: Record<string, unknown> = {},
    layerId: string | null = null,
  ) {
    const handlers = this.handlers.filter(
      (registration) => registration.event === event && registration.layerId === layerId,
    );
    for (const registration of handlers) await registration.handler(payload);
  }
}

class MockNavigationControl {}

vi.mock('maplibre-gl', () => ({
  Map: MockMap,
  NavigationControl: MockNavigationControl,
}));

const pins: PublicPlacePin[] = [
  {
    placeSlug: 'example-coffee-tokyo',
    name: 'Example Coffee',
    categorySlug: 'cafe',
    countryCode: 'JP',
    locality: 'Tokyo',
    latitude: 35.681236,
    longitude: 139.767125,
    status: 'confirmed',
    assetSlugs: ['bitcoin'],
    networkSlugs: ['lightning'],
    routeTypes: ['direct_wallet'],
    lastConfirmedAt: '2026-06-20T00:00:00Z',
    thumbnail: null,
  },
];

beforeEach(() => {
  MockMap.latest = null;
  vi.stubGlobal('WebGLRenderingContext', class {});
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('PlacesMap renderer', () => {
  it('registers the public source and layers, selects markers, and reports moved viewport', async () => {
    const onSelectPlace = vi.fn();
    const onViewportChange = vi.fn();

    render(
      <PlacesMap
        pins={pins}
        selectedPlace={null}
        committedViewport={null}
        onSelectPlace={onSelectPlace}
        onViewportChange={onViewportChange}
        styleUrl="/test-style.json"
      />,
    );

    await waitFor(() => expect(MockMap.latest).not.toBeNull());
    const map = MockMap.latest;
    if (!map) throw new Error('Map renderer did not initialize.');

    await act(async () => map.trigger('load'));

    expect(map.options.style).toBe('/test-style.json');
    expect(map.sources.has('public-places')).toBe(true);
    expect(map.layers.map((layer) => layer.id)).toEqual([
      'public-place-clusters',
      'public-place-cluster-count',
      'public-place-points',
    ]);

    await act(async () =>
      map.trigger(
        'click',
        { features: [{ properties: { placeSlug: 'example-coffee-tokyo' } }] },
        'public-place-points',
      ),
    );
    expect(onSelectPlace).toHaveBeenCalledWith('example-coffee-tokyo');

    map.center = { lat: 34.6937, lng: 135.5023 };
    map.zoom = 10.25;
    await act(async () => map.trigger('moveend'));
    expect(onViewportChange).toHaveBeenCalledWith({
      latitude: 34.6937,
      longitude: 135.5023,
      zoom: 10.25,
    });
  });

  it('shows a list-preserving fallback when WebGL is unavailable', async () => {
    vi.stubGlobal('WebGLRenderingContext', undefined);

    render(
      <PlacesMap
        pins={pins}
        selectedPlace={null}
        committedViewport={null}
        onSelectPlace={vi.fn()}
        onViewportChange={vi.fn()}
      />,
    );

    expect(await screen.findByText('Interactive map unavailable')).toBeInTheDocument();
    expect(screen.getByText(/Use the public result list/)).toBeInTheDocument();
  });
});
