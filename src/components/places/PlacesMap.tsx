import type { Feature, FeatureCollection, Point } from 'geojson';
import type { GeoJSONSource, Map as MapLibreMap, MapMouseEvent } from 'maplibre-gl';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { PublicPlacePin } from '../../public/places-discovery';
import type { DiscoveryViewport } from '../../state/discovery-url';
import {
  addPinImages,
  addPlaceLayers,
  buildPlaceFeatureCollection,
  clusterLayerId,
  mapLoadTimeoutMs,
  mapStyleRetryDelayMs,
  normalizeMapViewport,
  pointHoverLayerId,
  pointLayerId,
  selectedPlaceInitialZoom,
  sourceId,
} from './map-data';

interface PlacesMapProps {
  pins: PublicPlacePin[];
  selectedPlace: string | null;
  committedViewport: DiscoveryViewport | null;
  focusViewport: DiscoveryViewport | null;
  onSelectPlace: (placeSlug: string) => void;
  onClearSelection?: () => void;
  onViewportChange: (viewport: DiscoveryViewport) => void;
  onBoundsChange: (bounds: [number, number, number, number]) => void;
}

type RuntimeState = 'loading' | 'ready' | 'unsupported' | 'error';

function mapViewportChanged(a: DiscoveryViewport, b: DiscoveryViewport): boolean {
  return (
    Math.abs(a.latitude - b.latitude) > 0.000001 ||
    Math.abs(a.longitude - b.longitude) > 0.000001 ||
    Math.abs(a.zoom - b.zoom) > 0.01
  );
}

function boundsFromMap(map: MapLibreMap): [number, number, number, number] {
  const bounds = map.getBounds();
  return [bounds.getWest(), bounds.getSouth(), bounds.getEast(), bounds.getNorth()];
}

function updateSelectedFilter(map: MapLibreMap, selectedPlace: string | null) {
  if (!map.getLayer(pointLayerId)) return;
  map.setPaintProperty(pointLayerId, 'circle-stroke-width', [
    'case',
    ['==', ['get', 'placeSlug'], selectedPlace ?? ''],
    5,
    2,
  ]);
  map.setPaintProperty(pointLayerId, 'circle-radius', [
    'case',
    ['==', ['get', 'placeSlug'], selectedPlace ?? ''],
    10,
    7,
  ]);
}

export function PlacesMap({
  pins,
  selectedPlace,
  committedViewport,
  focusViewport,
  onSelectPlace,
  onClearSelection,
  onViewportChange,
  onBoundsChange,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectPlace);
  const clearSelectionRef = useRef(onClearSelection);
  const viewportChangeRef = useRef(onViewportChange);
  const boundsChangeRef = useRef(onBoundsChange);
  const selectedPlaceRef = useRef(selectedPlace);
  const committedViewportRef = useRef(committedViewport);
  const featureCollectionRef = useRef<FeatureCollection<Point>>(buildPlaceFeatureCollection(pins));
  const initialSelectedPlaceRef = useRef(selectedPlace);
  const lastFocusedSelectedPlaceRef = useRef<string | null>(null);
  const focusMovePendingRef = useRef(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('loading');

  const featureCollection = useMemo(() => buildPlaceFeatureCollection(pins), [pins]);
  featureCollectionRef.current = featureCollection;
  selectRef.current = onSelectPlace;
  clearSelectionRef.current = onClearSelection;
  viewportChangeRef.current = onViewportChange;
  boundsChangeRef.current = onBoundsChange;
  selectedPlaceRef.current = selectedPlace;
  committedViewportRef.current = committedViewport;

  const styleUrl = import.meta.env.PUBLIC_MAP_STYLE_URL ?? 'https://demotiles.maplibre.org/style.json';

  useEffect(() => {
    const map = mapRef.current;
    if (!map || runtimeState !== 'ready') return;
    updateSelectedFilter(map, selectedPlace);
  }, [runtimeState, selectedPlace]);

  useEffect(() => {
    if (!containerRef.current) return;
    if (!('WebGLRenderingContext' in window)) {
      setRuntimeState('unsupported');
      return;
    }

    let active = true;
    let map: MapLibreMap | null = null;
    let observer: ResizeObserver | null = null;
    let loadTimeout: number | null = null;
    let styleRetryTimer: number | null = null;
    let styleRetryAttempted = false;
    let loaded = false;
    let userViewportChangePending = false;

    const clearLoadTimeout = () => {
      if (loadTimeout !== null) window.clearTimeout(loadTimeout);
      loadTimeout = null;
    };
    const clearStyleRetry = () => {
      if (styleRetryTimer !== null) window.clearTimeout(styleRetryTimer);
      styleRetryTimer = null;
    };
    const reportMovedViewport = () => {
      if (!map) return;
      const center = map.getCenter();
      if (focusMovePendingRef.current) {
        focusMovePendingRef.current = false;
        return;
      }
      if (!userViewportChangePending) return;
      userViewportChangePending = false;
      viewportChangeRef.current({
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      });
      boundsChangeRef.current(boundsFromMap(map));
    };

    const initialize = async () => {
      try {
        const maplibregl = await import('maplibre-gl');
        if (!active || !containerRef.current) return;
        const camera = normalizeMapViewport(committedViewportRef.current);
        map = new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          center: camera.center,
          zoom: camera.zoom,
          minZoom: 1,
          maxZoom: 22,
        });
        mapRef.current = map;
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');
        loadTimeout = window.setTimeout(() => {
          if (!loaded && active) setRuntimeState('error');
        }, mapLoadTimeoutMs);

        map.on('load', () => {
          if (!map) return;
          loaded = true;
          clearLoadTimeout();
          clearStyleRetry();
          addPinImages(map);
          addPlaceLayers(map, featureCollectionRef.current);
          updateSelectedFilter(map, selectedPlaceRef.current);

          map.on('click', pointLayerId, (event) => {
            const slug = event.features?.[0]?.properties?.placeSlug;
            if (typeof slug === 'string') selectRef.current(slug);
          });
          map.on('click', clusterLayerId, async (event) => {
            if (!map) return;
            userViewportChangePending = true;
            const feature = map.queryRenderedFeatures(event.point, { layers: [clusterLayerId] })[0];
            const clusterId = feature?.properties?.cluster_id;
            if (typeof clusterId !== 'number') return;
            const source = map.getSource(sourceId) as GeoJSONSource;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            const coordinates = feature?.geometry.type === 'Point' ? feature.geometry.coordinates : null;
            if (coordinates) map.easeTo({ center: [coordinates[0], coordinates[1]], zoom });
          });
          map.on('click', (event: MapMouseEvent) => {
            if (!map || !selectedPlaceRef.current) return;
            const features = map.queryRenderedFeatures(event.point, {
              layers: [pointLayerId, pointHoverLayerId, clusterLayerId],
            });
            if (features.length === 0) clearSelectionRef.current?.();
          });
          map.on('mouseenter', pointLayerId, (event) => {
            if (!map) return;
            map.getCanvas().style.cursor = 'pointer';
            const slug = event.features?.[0]?.properties?.placeSlug;
            if (typeof slug === 'string') {
              map.setFilter(pointHoverLayerId, ['==', ['get', 'placeSlug'], slug]);
            }
          });
          map.on('mouseleave', pointLayerId, () => {
            if (!map) return;
            map.getCanvas().style.cursor = '';
            map.setFilter(pointHoverLayerId, ['==', ['get', 'placeSlug'], '']);
          });

          const markUserViewportChange = (event: { originalEvent?: unknown }) => {
            if (event.originalEvent) userViewportChangePending = true;
          };
          map.on('dragstart', markUserViewportChange);
          map.on('zoomstart', markUserViewportChange);
          map.on('rotatestart', markUserViewportChange);
          map.on('pitchstart', markUserViewportChange);
          map.on('moveend', reportMovedViewport);
          setRuntimeState('ready');
        });
        map.on('error', () => {
          if (loaded || !active || styleRetryAttempted || styleRetryTimer !== null) return;
          styleRetryTimer = window.setTimeout(() => {
            styleRetryTimer = null;
            if (!active || loaded || !map || styleRetryAttempted) return;
            styleRetryAttempted = true;
            map.setStyle(styleUrl);
          }, mapStyleRetryDelayMs);
        });
        observer = new ResizeObserver(() => map?.resize());
        observer.observe(containerRef.current);
      } catch {
        clearLoadTimeout();
        if (active) setRuntimeState('error');
      }
    };

    void initialize();
    return () => {
      active = false;
      clearLoadTimeout();
      clearStyleRetry();
      observer?.disconnect();
      map?.remove();
      mapRef.current = null;
    };
  }, [styleUrl]);

  useEffect(() => {
    const source = mapRef.current?.getSource(sourceId) as GeoJSONSource | undefined;
    source?.setData(featureCollection);
  }, [featureCollection]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || !committedViewport) return;
    const current = {
      latitude: map.getCenter().lat,
      longitude: map.getCenter().lng,
      zoom: map.getZoom(),
    };
    if (!mapViewportChanged(current, committedViewport)) return;
    const normalized = normalizeMapViewport(committedViewport);
    map.easeTo({ center: [normalized.longitude, normalized.latitude], zoom: normalized.zoom });
  }, [committedViewport]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || runtimeState !== 'ready' || !focusViewport) return;
    const normalized = normalizeMapViewport(focusViewport);
    focusMovePendingRef.current = true;
    map.easeTo({ center: [normalized.longitude, normalized.latitude], zoom: normalized.zoom });
  }, [focusViewport, runtimeState]);

  useEffect(() => {
    const map = mapRef.current;
    if (!map || runtimeState !== 'ready') return;
    if (!selectedPlace) {
      lastFocusedSelectedPlaceRef.current = null;
      return;
    }
    if (lastFocusedSelectedPlaceRef.current === selectedPlace) return;

    const selectedPin = pins.find((pin) => pin.placeSlug === selectedPlace);
    if (!selectedPin) return;

    const initialSelectionWithCommittedViewport =
      lastFocusedSelectedPlaceRef.current === null &&
      initialSelectedPlaceRef.current === selectedPlace &&
      committedViewportRef.current !== null;
    lastFocusedSelectedPlaceRef.current = selectedPlace;
    if (initialSelectionWithCommittedViewport) return;

    const current = map.getCenter();
    const alreadyCentered =
      Math.abs(current.lat - selectedPin.latitude) < 0.000001 &&
      Math.abs(current.lng - selectedPin.longitude) < 0.000001;
    const targetZoom = Math.max(map.getZoom(), selectedPlaceInitialZoom);
    const needsZoom = map.getZoom() < selectedPlaceInitialZoom;
    if (!alreadyCentered || needsZoom) {
      map.easeTo({
        center: [selectedPin.longitude, selectedPin.latitude],
        zoom: targetZoom,
      });
    }
  }, [pins, runtimeState, selectedPlace]);

  return (
    <div className="relative h-[calc(100dvh-7.75rem)] min-h-[32rem] w-full lg:h-full lg:min-h-0">
      <section className="absolute inset-0" aria-label="Interactive places map">
        <div ref={containerRef} className="h-full w-full" />
      </section>
      {runtimeState === 'loading' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-50/90 text-sm font-semibold text-muted">
          Loading map…
        </div>
      ) : null}
      {runtimeState === 'unsupported' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-50 p-6 text-center">
          <div>
            <p className="m-0 text-lg font-semibold text-ink">Interactive map unavailable</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              Use the public result list to browse every visible place.
            </p>
          </div>
        </div>
      ) : null}
      {runtimeState === 'error' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-brand-50 p-6 text-center">
          <div>
            <p className="m-0 text-lg font-semibold text-ink">Map could not be loaded</p>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted">
              The result list remains available while the map service is unavailable.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}
