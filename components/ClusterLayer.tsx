'use client';

import * as React from 'react';
import { useMap, Marker, Popup } from 'react-leaflet';
import type { PointFeature, ClusterFeature, AnyProps } from 'supercluster';
import type { Place } from '@/utils/loadPlaces';

// ClusterLayer が受け取る props
type Props = {
  points: Place[];
  onSelect: (id: string) => void;
};

// supercluster はデフォルトエクスポートのクラス
type SuperclusterClass = (await import('supercluster')).default;
type SCIndex = InstanceType<SuperclusterClass>;

// supercluster の返すジオメトリ型
type SCFeature = PointFeature<AnyProps> | ClusterFeature<AnyProps>;

export default function ClusterLayer({ points, onSelect }: Props) {
  const map = useMap();

  // supercluster のインデックスを保持
  const indexRef = React.useRef<SCIndex | null>(null);

  // ポイント → Supercluster にロード
  React.useEffect(() => {
    let cancelled = false;
    (async () => {
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
      if (!cancelled) indexRef.current = idx;
      refresh(); // 初回描画
    })();

    return () => {
      cancelled = true;
      indexRef.current = null;
    };
    // points が変わったら作り直す
  }, [points]);

  // 表示中クラスタ
  const [clusters, setClusters] = React.useState<SCFeature[]>([]);

  // Map の表示範囲からクラスタを取り出して state 更新
  const refresh = React.useCallback(() => {
    if (!indexRef.current) return;
    const b = map.getBounds();
    const bbox: [number, number, number, number] = [
      b.getWest(),
      b.getSouth(),
      b.getEast(),
      b.getNorth(),
    ];
    const z = Math.round(map.getZoom());
    const result = indexRef.current.getClusters(bbox, z);
    setClusters(result as SCFeature[]);
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

  // クラスタをクリックしたらズームイン
  const zoomToCluster = React.useCallback((clusterId: number) => {
    const idx = indexRef.current;
    if (!idx) return;
    const expansionZoom = Math.min(idx.getClusterExpansionZoom(clusterId), 18);
    const cluster = clusters.find(
      (f): f is ClusterFeature<AnyProps> =>
        'properties' in f && (f as any).properties.cluster === true
    );
    if (!cluster) return;
    const [lng, lat] = (cluster.geometry as any).coordinates as [number, number];
    map.setView([lat, lng], expansionZoom, { animate: true });
  }, [clusters, map]);

  return (
    <>
      {clusters.map((f) => {
        const [lng, lat] = (f.geometry as any).coordinates as [number, number];

        // クラスタ（複数点の塊）
        if ((f as any).properties.cluster) {
          const count = (f as any).properties.point_count as number;
          const cid = (f as any).properties.cluster_id as number;
          return (
            <Marker
              key={`c-${cid}`}
              position={[lat, lng]}
              eventHandlers={{ click: () => zoomToCluster(cid) }}
            >
              <Popup>
                <div style={{ fontWeight: 700 }}>{count}</div>
              </Popup>
            </Marker>
          );
        }

        // 単一ポイント
        const id = (f.properties as any)?.id as string;
        return (
          <Marker
            key={id}
            position={[lat, lng]}
            eventHandlers={{ click: () => onSelect(id) }}
          >
            <Popup>
              <div style={{ fontWeight: 700 }}>{(f.properties as any)?.title}</div>
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
