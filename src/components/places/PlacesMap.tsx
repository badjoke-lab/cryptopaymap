import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { ExpressionSpecification, GeoJSONSource, Map as MapLibreMap } from 'maplibre-gl';
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
const pointHoverLayerId = 'public-place-point-hover';
const confirmedPinImageId = 'place-pin-confirmed';
const stalePinImageId = 'place-pin-stale';
const selectedConfirmedPinImageId = 'place-pin-selected-confirmed';
const selectedStalePinImageId = 'place-pin-selected-stale';
const configuredStyleUrl = import.meta.env.PUBLIC_MAP_STYLE_URL?.trim();
const defaultStyleUrl = configuredStyleUrl || 'https://tiles.openfreemap.org/styles/bright';
const defaultMapCenter: [number, number] = [0, 20];
const defaultMapZoom = 2;
const selectedPlaceInitialZoom = 13;
const mapLoadTimeoutMs = 12_000;

const confirmedPinColor = [5, 150, 105] as const;
const stalePinColor = [217, 119, 6] as const;
const selectedPinHaloColor = [15, 118, 110] as const;
const white = [255, 255, 255] as const;

type Rgb = readonly [number, number, number];
type RuntimeState = 'loading' | 'ready' | 'unsupported' | 'error';

interface PlacesMapProps {
  pins: PublicPlacePin[];
  selectedPlace: string | null;
  committedViewport: DiscoveryViewport | null;
  focusViewport?: DiscoveryViewport | null;
  onSelectPlace: (placeSlug: string) => void;
  onClearSelection?: () => void;
  onViewportChange: (viewport: DiscoveryViewport) => void;
  onBoundsChange?: (bounds: PlaceMapBounds) => void;
  styleUrl?: string;
}

function initialCamera(
  pins: readonly PublicPlacePin[],
  viewport: DiscoveryViewport | null,
  selectedPlace: string | null,
): { center: [number, number]; zoom: number } {
  if (viewport) {
    const normalized = normalizeMapViewport(viewport);
    return { center: [normalized.longitude, normalized.latitude], zoom: normalized.zoom };
  }

  const selectedPin = selectedPlace
    ? pins.find((pin) => pin.placeSlug === selectedPlace)
    : undefined;
  return selectedPin
    ? {
        center: [selectedPin.longitude, selectedPin.latitude],
        zoom: selectedPlaceInitialZoom,
      }
    : { center: defaultMapCenter, zoom: defaultMapZoom };
}

function pinShapeContains(x: number, y: number, inset: number): boolean {
  const centerX = 32;
  const centerY = 28;
  const radius = 23 - inset;
  if (radius <= 0) return false;

  const dx = x - centerX;
  const dy = y - centerY;
  const insideHead = dx * dx + dy * dy <= radius * radius;
  const baseY = centerY + 13 + inset * 0.2;
  const tipY = 75 - inset * 0.5;
  if (y < baseY || y > tipY || tipY <= baseY) return insideHead;

  const progress = (y - baseY) / (tipY - baseY);
  const halfWidth = Math.max(1, 14 - inset * 0.4) * (1 - progress);
  return insideHead || Math.abs(dx) <= halfWidth;
}

function setPixel(data: Uint8Array, offset: number, color: Rgb) {
  data[offset] = color[0];
  data[offset + 1] = color[1];
  data[offset + 2] = color[2];
  data[offset + 3] = 255;
}

function createPlacePinImage(fill: Rgb, selected: boolean) {
  const width = 64;
  const height = 80;
  const data = new Uint8Array(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const offset = (y * width + x) * 4;
      if (!pinShapeContains(x, y, 0)) continue;

      if (selected) {
        setPixel(data, offset, selectedPinHaloColor);
        if (pinShapeContains(x, y, 4)) setPixel(data, offset, white);
        if (pinShapeContains(x, y, 8)) setPixel(data, offset, fill);
      } else {
        setPixel(data, offset, white);
        if (pinShapeContains(x, y, 4)) setPixel(data, offset, fill);
      }

      const dx = x - 32;
      const dy = y - 28;
      if (dx * dx + dy * dy <= 7.5 * 7.5) setPixel(data, offset, white);
    }
  }

  return { width, height, data };
}

function pinImageExpression(): ExpressionSpecification {
  return [
    'case',
    ['==', ['get', 'selected'], true],
    [
      'case',
      ['==', ['get', 'status'], 'stale'],
      selectedStalePinImageId,
      selectedConfirmedPinImageId,
    ],
    ['case', ['==', ['get', 'status'], 'stale'], stalePinImageId, confirmedPinImageId],
  ];
}

function addPinImages(map: MapLibreMap) {
  const images = [
    [confirmedPinImageId, createPlacePinImage(confirmedPinColor, false)],
    [stalePinImageId, createPlacePinImage(stalePinColor, false)],
    [selectedConfirmedPinImageId, createPlacePinImage(confirmedPinColor, true)],
    [selectedStalePinImageId, createPlacePinImage(stalePinColor, true)],
  ] as const;
  for (const [id, image] of images) map.addImage(id, image, { pixelRatio: 2 });
}

function addPlaceLayers(map: MapLibreMap, data: ReturnType<typeof buildPlaceMapFeatureCollection>) {
  map.addSource(sourceId, {
    type: 'geojson',
    data,
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
      'circle-stroke-width': 3,
    },
  });
  map.addLayer({
    id: clusterCountLayerId,
    type: 'symbol',
    source: sourceId,
    filter: ['has', 'point_count'],
    layout: { 'text-field': ['get', 'point_count_abbreviated'], 'text-size': 12 },
    paint: { 'text-color': '#ffffff' },
  });
  map.addLayer({
    id: pointLayerId,
    type: 'symbol',
    source: sourceId,
    filter: ['!', ['has', 'point_count']],
    layout: {
      'icon-image': pinImageExpression(),
      'icon-size': ['case', ['==', ['get', 'selected'], true], 1.12, 1],
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
  map.addLayer({
    id: pointHoverLayerId,
    type: 'symbol',
    source: sourceId,
    filter: ['==', ['get', 'placeSlug'], ''],
    layout: {
      'icon-image': pinImageExpression(),
      'icon-size': 1.16,
      'icon-anchor': 'bottom',
      'icon-allow-overlap': true,
      'icon-ignore-placement': true,
    },
  });
}

export function PlacesMap({
  pins,
  selectedPlace,
  committedViewport,
  focusViewport = null,
  onSelectPlace,
  onClearSelection,
  onViewportChange,
  onBoundsChange,
  styleUrl = defaultStyleUrl,
}: PlacesMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const selectRef = useRef(onSelectPlace);
  const clearSelectionRef = useRef(onClearSelection);
  const viewportRef = useRef(onViewportChange);
  const boundsRef = useRef(onBoundsChange);
  const committedViewportRef = useRef(committedViewport);
  const pinsRef = useRef(pins);
  const selectedPlaceRef = useRef(selectedPlace);
  const focusMovePendingRef = useRef(false);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('loading');
  const featureCollection = useMemo(
    () => buildPlaceMapFeatureCollection(pins, selectedPlace),
    [pins, selectedPlace],
  );
  const featureCollectionRef = useRef(featureCollection);

  selectRef.current = onSelectPlace;
  clearSelectionRef.current = onClearSelection;
  viewportRef.current = onViewportChange;
  boundsRef.current = onBoundsChange;
  committedViewportRef.current = committedViewport;
  pinsRef.current = pins;
  selectedPlaceRef.current = selectedPlace;
  featureCollectionRef.current = featureCollection;

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof WebGLRenderingContext === 'undefined') {
      setRuntimeState('unsupported');
      return;
    }

    let active = true;
    let loaded = false;
    let userViewportChangePending = false;
    let map: MapLibreMap | null = null;
    let observer: ResizeObserver | null = null;
    let loadTimeout: number | null = null;

    const clearLoadTimeout = () => {
      if (loadTimeout !== null) window.clearTimeout(loadTimeout);
      loadTimeout = null;
    };

    const reportMovedViewport = () => {
      const pendingFocusMove = focusMovePendingRef.current;
      if (!map || !loaded || (!userViewportChangePending && !pendingFocusMove)) return;
      userViewportChangePending = false;
      focusMovePendingRef.current = false;
      const center = map.getCenter();
      const nextViewport = normalizeMapViewport({
        latitude: center.lat,
        longitude: center.lng,
        zoom: map.getZoom(),
      });
      if (!mapViewportChanged(committedViewportRef.current, nextViewport)) return;

      viewportRef.current(nextViewport);
      if (!boundsRef.current) return;
      const bounds = map.getBounds();
      boundsRef.current(
        normalizeMapBounds({
          west: bounds.getWest(),
          south: bounds.getSouth(),
          east: bounds.getEast(),
          north: bounds.getNorth(),
        }),
      );
    };

    const initialize = async () => {
      try {
        const maplibregl = await import('maplibre-gl');
        if (!active || !containerRef.current) return;
        const camera = initialCamera(
          pinsRef.current,
          committedViewportRef.current,
          selectedPlaceRef.current,
        );
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
          addPinImages(map);
          addPlaceLayers(map, featureCollectionRef.current);

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
            const coordinates =
              feature?.geometry.type === 'Point' ? feature.geometry.coordinates : null;
            if (coordinates) map.easeTo({ center: [coordinates[0], coordinates[1]], zoom });
          });
          map.on('click', (event) => {
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
    };

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
    if (!map || runtimeState !== 'ready' || !selectedPlace) return;
    const selectedPin = pins.find((pin) => pin.placeSlug === selectedPlace);
    if (!selectedPin) return;
    const current = map.getCenter();
    const alreadyCentered =
      Math.abs(current.lat - selectedPin.latitude) < 0.000001 &&
      Math.abs(current.lng - selectedPin.longitude) < 0.000001;
    if (!alreadyCentered) map.easeTo({ center: [selectedPin.longitude, selectedPin.latitude] });
  }, [pins, runtimeState, selectedPlace]);

  return (
    <div className="relative h-[calc(100dvh-13rem)] min-h-[28rem] w-full lg:h-auto lg:min-h-[38rem]">
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
