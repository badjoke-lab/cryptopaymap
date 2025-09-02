'use client';

import * as React from 'react';
import { useMap, Marker, Popup } from 'react-leaflet';
import type { PointFeature, ClusterFeature, AnyProps } from 'supercluster';
import type { Place } from '@/utils/loadPlaces';

type Props = {
  points: Place[];
  onSelect: (id: string) => void;
};

// supercluster が返すフィーチャ型（クラスタ or 単点）
type SCFeature = PointFeature<AnyProps> | ClusterFeature<AnyProps>;

export default function ClusterLayer({ points, onSelect }: Props) {
  const map = useMap();

  // supercluster のインデックスを保持（動的 import なので any で保持して十分）
  const indexRef = React.useRef<any>(null);

  // ポイント → supercluster へロード
  React.useEffect(() => {
    let cancelled = false;

    async function buildIndex() {
      const Supercluster = (await import('supercluster')).default;

      const idx = new Supercluster<AnyProps, AnyProps>({
        radius: 60,
        maxZoom: 18,
      });

      const features: PointFeature<AnyProps>[] = points.map((p) => ({
        type: 'Feature',
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
        properties: {
          id: p.id,
          title: p.name,
          city: p.city ?? '',
        },
      }));

      idx.load(features);
      if (!cancelled) {
        indexRef.current = idx;
        refresh(); // 初回描画
      }
    }

    buildIndex();
    return () => {
      cancelled = true;
      indexRef.current = null;
    };
  }, [points]); // points が変化したら作り直し

  // 表示中クラスタ
  const [clusters, setClusters] = React.useState<SCFeature[]>([]);

  // 表示範囲からクラスタ一覧を取得
  const refresh = React.useCallback(() => {
    const idx = indexRef.current;
    if (!idx) return;

    const b = map.getBounds();
    const bbox: [number, number, number, number] = [
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth(),
    ];
    const z = Math.round(map.getZoom());
    const result = idx.getClusters(bbox, z) as SCFeature[];
    setClusters(result);
  }, [map]);

  // move/zoom のたびに再計算
  React.useEffect(() => {
    refresh();
    map.on('moveend zoomend', refresh);
    return () => {
      map.off('moveend', refresh);
      map.off('zoomend', refresh);
    };
  }, [map, refresh]);

  // クラスタクリックでズームイン
  const zoomToCluster = React.useCallback(
    (clusterId: number, lng: number, lat: number) => {
      const idx = indexRef.current;
      if (!idx) return;
      const next = Math.min(idx.getClusterExpansionZoom(clusterId), 18);
      map.setView([lat, lng], next, { animate: true });
    },
    [map]
  );

  return (
    <>
      {clusters.map((f) => {
        const [lng, lat] = (f.geometry as any).coordinates as [number, number];
        const props: any = (f as any).properties;

        // クラスタ（複数点の塊）
        if (props?.cluster) {
          const count = props.point_count as number;
          const cid = props.cluster_id as number;
          return (
            <Marker
              key={`c-${cid}`}
              position={[lat, lng]}
              eventHandlers={{ click: () => zoomToCluster(cid, lng, lat) }}
            >
              <Popup>
                <div style={{ fontWeight: 700, fontSize: 16 }}>{count}</div>
              </Popup>
            </Marker>
          );
        }

        // 単一ポイント
        const id = props?.id as string;
        return (
          <Marker
            key={id}
            position={[lat, lng]}
            eventHandlers={{ click: () => onSelect(id) }}
          >
            <Popup>
              <div style={{ fontWeight: 700 }}>{props?.title}</div>
              <button
                onClick={() => onSelect(id)}
                style={{
                  marginTop: 6,
                  padding: '6px 10px',
                  border: '1px solid #e5e7eb',
                  borderRadius: 8,
                  background: '#fff',
                  cursor: 'pointer',
                }}
              >
                View details
              </button>
            </Popup>
          </Marker>
        );
      })}
    </>
  );
}
