import 'maplibre-gl/dist/maplibre-gl.css';
import { useEffect, useRef, useState } from 'react';
import type { Map as MapLibreMap, Marker as MapLibreMarker } from 'maplibre-gl';

const configuredStyleUrl = import.meta.env.PUBLIC_MAP_STYLE_URL?.trim();
const defaultStyleUrl = configuredStyleUrl || 'https://tiles.openfreemap.org/styles/bright';

interface PublicPlaceMiniMapProps {
  latitude: number;
  longitude: number;
  name: string;
  styleUrl?: string;
}

type RuntimeState = 'loading' | 'ready' | 'unsupported' | 'error';

export function PublicPlaceMiniMap({
  latitude,
  longitude,
  name,
  styleUrl = defaultStyleUrl,
}: PublicPlaceMiniMapProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<MapLibreMap | null>(null);
  const markerRef = useRef<MapLibreMarker | null>(null);
  const [runtimeState, setRuntimeState] = useState<RuntimeState>('loading');

  useEffect(() => {
    if (!containerRef.current) return;
    if (typeof WebGLRenderingContext === 'undefined') {
      setRuntimeState('unsupported');
      return;
    }

    let active = true;
    let observer: ResizeObserver | null = null;

    const initialize = async () => {
      try {
        const maplibregl = await import('maplibre-gl');
        if (!active || !containerRef.current) return;

        const map = new maplibregl.Map({
          container: containerRef.current,
          style: styleUrl,
          center: [longitude, latitude],
          zoom: 14,
          minZoom: 3,
          maxZoom: 19,
          attributionControl: true,
          dragRotate: false,
          pitchWithRotate: false,
        });
        map.scrollZoom.disable();
        map.touchZoomRotate.disableRotation();
        map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-right');

        const marker = new maplibregl.Marker({ color: '#059669' })
          .setLngLat([longitude, latitude])
          .setPopup(new maplibregl.Popup({ offset: 24, closeButton: false }).setText(name))
          .addTo(map);

        map.on('load', () => {
          if (active) setRuntimeState('ready');
        });
        map.on('error', () => {
          if (active && !map.loaded()) setRuntimeState('error');
        });

        observer = new ResizeObserver(() => map.resize());
        observer.observe(containerRef.current);
        mapRef.current = map;
        markerRef.current = marker;
      } catch {
        if (active) setRuntimeState('error');
      }
    };

    void initialize();

    return () => {
      active = false;
      observer?.disconnect();
      markerRef.current?.remove();
      markerRef.current = null;
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [latitude, longitude, name, styleUrl]);

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
      <div
        ref={containerRef}
        className="h-64 w-full"
        role="img"
        aria-label={`Map showing ${name}`}
      />
      {runtimeState !== 'ready' ? (
        <div className="pointer-events-none absolute inset-0 grid place-items-center bg-slate-100/90 px-6 text-center text-sm text-slate-600">
          {runtimeState === 'loading'
            ? 'Loading map…'
            : 'Map preview is unavailable on this device.'}
        </div>
      ) : null}
    </div>
  );
}
