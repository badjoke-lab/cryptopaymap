import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
import type { PublicPlacePin } from '../../public/places-discovery';
import type { DiscoveryViewport } from '../../state/discovery-url';
import {
  buildPlaceMapFeatureCollection,
  mapViewportChanged,
  normalizeMapBounds,
  normalizeMapViewport,
  type PlaceMapBounds,
} from './map-data';

const sourceId = 'public-places';
const clusterLayerId = 'public-place-clusters';
const clusterCountLayerId = 'public-place-cluster-count';
const pointLayerId = 'public-place-points';
const configuredStyleUrl = import.meta.env.PUBLIC_MAP_STYLE_URL?.trim();
const defaultStyleUrl = configuredStyleUrl || 'https://tiles.openfreemap.org/styles/liberty';
const mapLoadTimeoutMs = 12_000;

interface PlacesMapProps {
  pins: PublicPlacePin[];
  selectedPlace: string | null;
  committedViewport: DiscoveryViewport | null;
  onSelectPlace: (placeSlug: string) => void;
  onViewportChange: (viewport: DiscoveryViewport) => void;
  onBoundsChange?: (bounds: PlaceMapBounds) => void;
  styleUrl?: string;
}

type RuntimeState = 'loading' | 'ready' | 'unsupported' | 'error';

function initialCamera(
  pins: readonly PublicPlacePin[],
  viewport: DiscoveryViewport | null,
): { center: [number, number]; zoom: number } {
  if (viewport) {
    const normalized = normalizeMapViewport(viewport);
    return { center: [normalized.longitude, normalized.latitude], zoom: normalized.zoom };
  }

  const first = pins[0];
  return first
    ? { center: [first.longitude, first.latitude], zoom: 11 }
    : { center: [0, 20], zoom: 1.5 };
}

export function PlacesMap({
  pins,
  selectedPlace,
  committedViewport,
  onSelectPlace,
  onViewportChange,
  onBoundsChange,
  styleUrl = defaultStyleUrl,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectPlace);
  const viewportRef = useRef(onViewportChange);
  const boundsRef = useRef(onBoundsChange);
  const committedViewportRef = useRef(committedViewport);
  const pinsRef = useRef(pins);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('loading');
  const featureCollection = useMemo(
    () => buildPlaceMapFeatureCollection(pins, selectedPlace),
    [pins, selectedPlace],
  );
  const featureCollectionRef = useRef(featureCollection);

  selectRef.current = onSelectPlace;
  viewportRef.current = onViewportChange;
  boundsRef.current = onBoundsChange;
  committedViewportRef.current = committedViewport;
  pinsRef.current = pins;
  featureCollectionRef.current = featureCollection;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    if (typeof WebGLRenderingContext === 'undefined') {
      setRuntimeState('unsupported');
      return;
    }

    let active = true;
    let loaded = false;
    let map: MapLibreMap | null = null;
    let observer: ResizeObserver | null = null;
    let loadTimeout: number | null = null;

    function clearLoadTimeout() {
      if (loadTimeout !== null) {
        window.clearTimeout(loadTimeout);
        loadTimeout = null;
      }
    }

    function reportMovedViewport() {
      if (!map || !loaded) return;
      const center = map.getCenter();
      const nextViewport = normalizeMapViewport({
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      });
      if (mapViewportChanged(committedViewportRef.current, nextViewport)) {
        viewportRef.current(nextViewport);
        if (boundsRef.current) {
          const visibleBounds = map.getBounds();
          boundsRef.current(
            normalizeMapBounds({
              west: visibleBounds.getWest(),
              south: visibleBounds.getSouth(),
              east: visibleBounds.getEast(),
              north: visibleBounds.getNorth(),
            }),
          );
        }
      }
    }

    async function initialize() {
      try {
        const maplibregl = await import('maplibre-gl');
        if (!active || !containerRef.current) return;

        const camera = initialCamera(pinsRef.current, committedViewportRef.current);
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
          map.addSource(sourceId, {
            type: 'geojson',
            data: featureCollectionRef.current,
            cluster: true,
            clusterMaxZoom: 14,
            clusterRadius: 48,
          });
          map.addLayer({
            id: clusterLayerId,
            type: 'circle',
            source: sourceId,
            filter: ['has', 'point_count'],
            paint: {
              'circle-color': '#0f766e',
              'circle-radius': ['step', ['get', 'point_count'], 18, 20, 22, 100, 28],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          });
          map.addLayer({
            id: clusterCountLayerId,
            type: 'symbol',
            source: sourceId,
            filter: ['has', 'point_count'],
            layout: {
              'text-field': ['get', 'point_count_abbreviated'],
              'text-size': 12,
            },
            paint: { 'text-color': '#ffffff' },
          });
          map.addLayer({
            id: pointLayerId,
            type: 'circle',
            source: sourceId,
            filter: ['!', ['has', 'point_count']],
            paint: {
              'circle-color': [
                'case',
                ['==', ['get', 'selected'], true],
                '#0f766e',
                ['==', ['get', 'status'], 'stale'],
                '#d97706',
                '#059669',
              ],
              'circle-radius': ['case', ['==', ['get', 'selected'], true], 10, 7],
              'circle-stroke-color': '#ffffff',
              'circle-stroke-width': 2,
            },
          });

          map.on('click', pointLayerId, (event) => {
            const placeSlug = event.features?.[0]?.properties?.placeSlug;
            if (typeof placeSlug === 'string') selectRef.current(placeSlug);
          });
          map.on('click', clusterLayerId, async (event) => {
            if (!map) return;
            const feature = map.queryRenderedFeatures(event.point, { layers: [clusterLayerId] })[0];
            const clusterId = feature?.properties?.cluster_id;
            if (typeof clusterId !== 'number') return;
            const source = map.getSource(sourceId) as GeoJSONSource;
            const zoom = await source.getClusterExpansionZoom(clusterId);
            const coordinates =
              feature?.geometry.type === 'Point' ? feature.geometry.coordinates : null;
            if (!coordinates) return;
            map.easeTo({ center: [coordinates[0], coordinates[1]], zoom });
          });
          map.on('mouseenter', pointLayerId, () => {
            if (map) map.getCanvas().style.cursor = 'pointer';
          });
          map.on('mouseleave', pointLayerId, () => {
            if (map) map.getCanvas().style.cursor = '';
          });
          map.on('moveend', reportMovedViewport);

          setRuntimeState('ready');
        });

        map.on('error', () => {
          if (!loaded && active) {
            clearLoadTimeout();
            setRuntimeState('error');
          }
        });

        observer = new ResizeObserver(() => map?.resize());
        observer.observe(containerRef.current);
      } catch {
        clearLoadTimeout();
        if (active) setRuntimeState('error');
      }
    }

    void initialize();

    return () => {
      active = false;
      clearLoadTimeout();
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
    map.easeTo({
      center: [normalized.longitude, normalized.latitude],
      zoom: normalized.zoom,
    });
  }, [committedViewport]);

  return (
    <div className="relative min-h-[38rem] w-full">
      <section className="absolute inset-0" aria-label="Interactive places map">
        <div ref={containerRef} className="absolute inset-0" />
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
