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
  constructor(public data: unknown) {}

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
  readonly images = new Map<string, unknown>();
  readonly filters = new Map<string, unknown>();
  readonly options: Record<string, unknown>;
  center = { lat: 20, lng: 0 };
  zoom = 2;
  canvas = { style: { cursor: '' } };
  renderedFeatures: Array<Record<string, unknown>> = [];

  constructor(options: Record<string, unknown>) {
    this.options = options;
    const center = options.center;
    if (Array.isArray(center) && center.length >= 2) {
      this.center = { lng: Number(center[0]), lat: Number(center[1]) };
    }
    if (typeof options.zoom === 'number') this.zoom = options.zoom;
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

  addImage(id: string, image: unknown) {
    this.images.set(id, image);
  }

  addSource(id: string, source: { data: unknown }) {
    this.sources.set(id, new MockGeoJsonSource(source.data));
  }

  addLayer(layer: Record<string, unknown>) {
    this.layers.push(layer);
  }

  setFilter(layerId: string, filter: unknown) {
    this.filters.set(layerId, filter);
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

  getBounds() {
    return {
      getWest: () => this.center.lng - 0.25,
      getSouth: () => this.center.lat - 0.25,
      getEast: () => this.center.lng + 0.25,
      getNorth: () => this.center.lat + 0.25,
    };
  }

  getCanvas() {
    return this.canvas;
  }

  queryRenderedFeatures() {
    return this.renderedFeatures;
  }

  easeTo(options: { center?: [number, number]; zoom?: number }) {
    if (options.center) this.center = { lng: options.center[0], lat: options.center[1] };
    if (options.zoom !== undefined) this.zoom = options.zoom;
  }

  resize() {}
  remove() {}

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

vi.mock('maplibre-gl', () => ({ Map: MockMap, NavigationControl: MockNavigationControl }));

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

async function currentMap(): Promise<MockMap> {
  await waitFor(() => expect(MockMap.latest).not.toBeNull());
  const map = MockMap.latest;
  if (!map) throw new Error('Map renderer did not initialize.');
  return map;
}

describe('PlacesMap renderer', () => {
  it('uses a stable broad default camera and street-map style instead of the first pin', async () => {
    render(
      <PlacesMap
        pins={pins}
        selectedPlace={null}
        committedViewport={null}
        onSelectPlace={vi.fn()}
        onViewportChange={vi.fn()}
      />,
    );

    const map = await currentMap();
    expect(map.options.center).toEqual([0, 20]);
    expect(map.options.zoom).toBe(2);
    expect(map.options.style).toBe('https://tiles.openfreemap.org/styles/bright');
  });

  it('uses bounded selected-Place focus while committed viewport takes precedence', async () => {
    const first = render(
      <PlacesMap
        pins={pins}
        selectedPlace="example-coffee-tokyo"
        committedViewport={null}
        onSelectPlace={vi.fn()}
        onViewportChange={vi.fn()}
        styleUrl="/test-style.json"
      />,
    );
    const selectedMap = await currentMap();
    expect(selectedMap.options.center).toEqual([139.767125, 35.681236]);
    expect(selectedMap.options.zoom).toBe(13);
    first.unmount();

    render(
      <PlacesMap
        pins={pins}
        selectedPlace="example-coffee-tokyo"
        committedViewport={{ latitude: 51.5074, longitude: -0.1278, zoom: 8.5 }}
        onSelectPlace={vi.fn()}
        onViewportChange={vi.fn()}
        styleUrl="/test-style.json"
      />,
    );
    await waitFor(() => expect(MockMap.latest).not.toBe(selectedMap));
    const restoredMap = await currentMap();
    expect(restoredMap.options.center).toEqual([-0.1278, 51.5074]);
    expect(restoredMap.options.zoom).toBe(8.5);
  });

  it('renders cluster circles and single-Place pin symbols with hover and selection behavior', async () => {
    const onSelectPlace = vi.fn();
    const onViewportChange = vi.fn();
    const view = render(
      <PlacesMap
        pins={pins}
        selectedPlace={null}
        committedViewport={null}
        onSelectPlace={onSelectPlace}
        onViewportChange={onViewportChange}
        styleUrl="/test-style.json"
      />,
    );
    const map = await currentMap();
    await act(async () => map.trigger('load'));

    expect(map.layers.map((layer) => layer.id)).toEqual([
      'public-place-clusters',
      'public-place-cluster-count',
      'public-place-points',
      'public-place-point-hover',
    ]);
    expect(map.layers.find((layer) => layer.id === 'public-place-clusters')?.type).toBe('circle');
    expect(map.layers.find((layer) => layer.id === 'public-place-points')?.type).toBe('symbol');
    expect([...map.images.keys()]).toEqual([
      'place-pin-confirmed',
      'place-pin-stale',
      'place-pin-selected-confirmed',
      'place-pin-selected-stale',
    ]);

    const source = map.sources.get('public-places');
    if (!source) throw new Error('Public Place source was not registered.');
    map.center = { lat: 34.6937, lng: 135.5023 };
    view.rerender(
      <PlacesMap
        pins={pins}
        selectedPlace="example-coffee-tokyo"
        committedViewport={null}
        onSelectPlace={onSelectPlace}
        onViewportChange={onViewportChange}
        styleUrl="/test-style.json"
      />,
    );
    await waitFor(() => {
      const data = source.data as { features: Array<{ properties: { selected: boolean } }> };
      expect(data.features[0]?.properties.selected).toBe(true);
      expect(map.center).toEqual({ lat: 35.681236, lng: 139.767125 });
    });

    await act(async () =>
      map.trigger(
        'click',
        { features: [{ properties: { placeSlug: 'example-coffee-tokyo' } }] },
        'public-place-points',
      ),
    );
    expect(onSelectPlace).toHaveBeenCalledWith('example-coffee-tokyo');

    await act(async () =>
      map.trigger(
        'mouseenter',
        { features: [{ properties: { placeSlug: 'example-coffee-tokyo' } }] },
        'public-place-points',
      ),
    );
    expect(map.canvas.style.cursor).toBe('pointer');
    expect(map.filters.get('public-place-point-hover')).toEqual([
      '==',
      ['get', 'placeSlug'],
      'example-coffee-tokyo',
    ]);

    await act(async () => map.trigger('mouseleave', {}, 'public-place-points'));
    expect(map.canvas.style.cursor).toBe('');
    expect(map.filters.get('public-place-point-hover')).toEqual(['==', ['get', 'placeSlug'], '']);

    map.center = { lat: 34.6937, lng: 135.5023 };
    map.zoom = 10.25;
    await act(async () => map.trigger('dragstart', { originalEvent: {} }));
    await act(async () => map.trigger('moveend'));
    expect(onViewportChange).toHaveBeenCalledWith({
      latitude: 34.6937,
      longitude: 135.5023,
      zoom: 10.25,
    });
  });

  it('clears selection only on empty map canvas', async () => {
    const onClearSelection = vi.fn();
    render(
      <PlacesMap
        pins={pins}
        selectedPlace="example-coffee-tokyo"
        committedViewport={null}
        onSelectPlace={vi.fn()}
        onClearSelection={onClearSelection}
        onViewportChange={vi.fn()}
        styleUrl="/test-style.json"
      />,
    );
    const map = await currentMap();
    await act(async () => map.trigger('load'));

    map.renderedFeatures = [{ properties: { placeSlug: 'example-coffee-tokyo' } }];
    await act(async () => map.trigger('click', { point: { x: 1, y: 1 } }));
    expect(onClearSelection).not.toHaveBeenCalled();

    map.renderedFeatures = [];
    await act(async () => map.trigger('click', { point: { x: 20, y: 20 } }));
    expect(onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('reports an ephemeral focus viewport as pending map state', async () => {
    const onViewportChange = vi.fn();
    const onBoundsChange = vi.fn();
    const view = render(
      <PlacesMap
        pins={pins}
        selectedPlace={null}
        committedViewport={null}
        onSelectPlace={vi.fn()}
        onViewportChange={onViewportChange}
        onBoundsChange={onBoundsChange}
        styleUrl="/test-style.json"
      />,
    );
    const map = await currentMap();
    await act(async () => map.trigger('load'));

    view.rerender(
      <PlacesMap
        pins={pins}
        selectedPlace={null}
        committedViewport={null}
        focusViewport={{ latitude: 35.7, longitude: 139.7, zoom: 14 }}
        onSelectPlace={vi.fn()}
        onViewportChange={onViewportChange}
        onBoundsChange={onBoundsChange}
        styleUrl="/test-style.json"
      />,
    );
    await waitFor(() => expect(map.center).toEqual({ lat: 35.7, lng: 139.7 }));
    await act(async () => map.trigger('moveend'));

    expect(onViewportChange).toHaveBeenCalledWith({
      latitude: 35.7,
      longitude: 139.7,
      zoom: 14,
    });
    expect(onBoundsChange).toHaveBeenCalledWith({
      west: 139.45,
      south: 35.45,
      east: 139.95,
      north: 35.95,
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
