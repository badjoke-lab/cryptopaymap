
import { loadCountry, loadAll, filterByBounds, type Place } from "../dataLoader";
import React, { useEffect, useMemo, useRef, useState } from "react";
// import { loadCountry, loadAll, filterByBounds, type Place } from "@/dataLoader";

// 既存の地図・リスト・詳細などに渡していたprops名に合わせて調整してください。
// ここでは例として MapView / ListView という子を想定した薄いダミーを置いています。
// 実プロジェクトでは既存の子コンポーネントをimportして差し替えてください。
type Bounds = { minLat: number; maxLat: number; minLng: number; maxLng: number };

type MapShellProps = {
  // 初期国コード（クエリやルートから渡している場合は省略可）
  initialCountry?: string;
  // 既存の子にデータやイベントを橋渡しするためのrender props（任意）
  render?: (ctx: {
    data: Place[];
    loading: boolean;
    error?: string;
    onMapMove: (b: Bounds) => void;
    onResetFilter: () => void;
    total: number;
  }) => React.ReactNode;
};

export default function MapShell(props: MapShellProps) {
  const [allData, setAllData] = useState<Place[]>([]);
  const [viewData, setViewData] = useState<Place[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | undefined>(undefined);

  // URL ?cc=XX を優先し、なければ props.initialCountry
  const countryFromURL = useMemo(() => {
    const cc = new URLSearchParams(window.location.search).get("cc") || "";
    return cc.trim();
  }, []);
  const cc = (countryFromURL || props.initialCountry || "").toUpperCase();

  // 初回ロード（shard優先→fallback all）
  useEffect(() => {
    let alive = true;
    (async () => {
      setLoading(true);
      setErr(undefined);
      try {
        const base = cc ? await loadCountry(cc) : await loadAll();
        if (!alive) return;
        setAllData(base);
        setViewData(base);
      } catch (e: any) {
        console.error(e);
        if (!alive) return;
        setErr(String(e?.message ?? e));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => {
      alive = false;
    };
  }, [cc]);

  // 地図の移動で範囲絞り込み（既存の map の onMoveEnd 等から呼ぶ）
  const onMapMove = (bbox: Bounds) => {
    if (!allData.length) return;
    setViewData(filterByBounds(allData, bbox));
  };

  // フィルタ解除（一覧全件に戻す）
  const onResetFilter = () => setViewData(allData);

  // 既存の描画に合わせて、render props が渡されていればそれを使う
  if (props.render) {
    return (
      <>
        {props.render({
          data: viewData,
          loading,
          error: err,
          onMapMove,
          onResetFilter,
          total: allData.length,
        })}
      </>
    );
  }

  // デフォルトの簡易UI（置き換えてOK）
  return (
    <div className="w-full h-full flex flex-col">
      <div className="p-2 text-sm flex items-center gap-3">
        {loading ? (
          <span>Loading…</span>
        ) : err ? (
          <span className="text-red-600">Error: {err}</span>
        ) : (
          <>
            <span>
              Loaded: <b>{allData.length}</b>
              {cc ? ` (country=${cc})` : " (all)"}
            </span>
            <span>
              View: <b>{viewData.length}</b>
            </span>
            <button
              onClick={onResetFilter}
              className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
            >
              Reset filter
            </button>
          </>
        )}
      </div>

      {/* ↓↓↓ ここを既存の Map/Sidebar に差し替えてください ↓↓↓ */}
      <div className="flex-1 grid grid-cols-2 gap-2 p-2">
        <div className="border rounded p-2 overflow-auto">
          <h3 className="font-semibold mb-2">List (demo)</h3>
          {!loading &&
            !err &&
            viewData.slice(0, 2000).map((p) => (
              <div key={p.id} className="py-1 text-sm border-b last:border-b-0">
                <div className="font-medium">{p.name}</div>
                <div className="opacity-70">
                  {p.country}/{p.city} · {p.category}
                </div>
                {p.payment && (
                  <div className="opacity-60">
                    LN:{p.payment.lightning ? "✓" : "—"} / ONC:
                    {p.payment.onchain ? "✓" : "—"} / CARD:
                    {p.payment.credit_cards ? "✓" : "—"} / CASH:
                    {p.payment.cash ? "✓" : "—"}
                  </div>
                )}
              </div>
            ))}
        </div>
        <div className="border rounded p-2">
          <h3 className="font-semibold mb-2">Map (demo)</h3>
          <p className="text-sm opacity-70 mb-2">
            実プロダクションの地図コンポーネントを使ってください。
          </p>
          <div className="flex gap-2">
            <button
              className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={() =>
                onMapMove({
                  // 東京近辺（デモ）
                  minLat: 35.4,
                  maxLat: 35.8,
                  minLng: 139.4,
                  maxLng: 139.9,
                })
              }
            >
              Filter to Tokyo-ish (demo)
            </button>
            <button
              className="px-2 py-1 rounded bg-gray-200 hover:bg-gray-300"
              onClick={onResetFilter}
            >
              Reset
            </button>
          </div>
        </div>
      </div>
      {/* ↑↑↑ ここを既存の Map/Sidebar に差し替えてください ↑↑↑ */}
    </div>
  );
}
