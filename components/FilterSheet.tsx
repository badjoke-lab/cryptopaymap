"use client";
import { useEffect } from "react";

type Opt = { label: string; value: string };

export default function FilterSheet({
  open, onClose,
  // 既存
  coin, setCoin, coins,
  category, setCategory, categories,
  city, setCity, cities,
  onApply, onReset,
  // ▼ フェーズ5追加（全部 optional・既定値あり）
  verification = "all",
  onVerificationChange,
  sort = "verified",
  onSortChange,
}: {
  open: boolean; onClose: () => void;

  // 既存の props（変更なし）
  coin: string; setCoin: (v: string)=>void; coins: Opt[];
  category: string; setCategory: (v: string)=>void; categories: Opt[];
  city: string; setCity: (v: string)=>void; cities: Opt[];
  onApply: () => void; onReset: () => void;

  /** ▼ 追加: "all" | "owner" | "community" | "directory" | "unverified" */
  verification?: string;
  onVerificationChange?: (v: string) => void;
  /** ▼ 追加: 今は "verified" のみ（将来拡張を見越して文字列） */
  sort?: string;
  onSortChange?: (v: string) => void;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-[1050]" onClick={onClose} aria-hidden />
      <div
        className="fixed left-0 right-0 bottom-0 z-[1060] md:hidden
                   rounded-t-2xl bg-white shadow-xl p-4 pb-[calc(env(safe-area-inset-bottom,0)+12px)]
                   max-h-[80svh] overflow-y-auto"
        role="dialog" aria-modal="true" aria-label="Filters"
      >
        <div className="h-1.5 w-10 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-3">Filters</h3>

        <div className="space-y-4">
          {/* Coin */}
          <div>
            <label className="block text-sm mb-1">Coin</label>
            <select
              value={coin}
              onChange={e=>setCoin(e.target.value)}
              className="w-full rounded-lg border p-2"
            >
              {coins.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* Category */}
          <div>
            <label className="block text-sm mb-1">Category</label>
            <select
              value={category}
              onChange={e=>setCategory(e.target.value)}
              className="w-full rounded-lg border p-2"
            >
              {categories.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* City */}
          <div>
            <label className="block text-sm mb-1">City</label>
            <select
              value={city}
              onChange={e=>setCity(e.target.value)}
              className="w-full rounded-lg border p-2"
            >
              {cities.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          {/* ▼ 追加: Verification */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-2">Verification</h4>
            <div className="grid grid-cols-2 gap-2">
              {["all","owner","community","directory","unverified"].map(v => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={verification === v}
                  className={`px-3 py-2 rounded ring-1 ring-zinc-300 text-sm ${verification===v ? "bg-zinc-900 text-white" : "bg-white"}`}
                  onClick={() => onVerificationChange?.(v)}
                >
                  {v[0].toUpperCase()+v.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* ▼ 追加: Sort */}
          <div className="border-t pt-4">
            <h4 className="text-sm font-semibold mb-2">Sort</h4>
            <select
              className="w-full px-3 py-2 rounded ring-1 ring-zinc-300 bg-white text-sm"
              value={sort}
              onChange={(e) => onSortChange?.(e.target.value)}
            >
              <option value="verified">Verified priority</option>
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-5">
          <button className="text-sm underline" onClick={onReset}>Reset</button>
          <button
            className="px-4 h-10 rounded-lg bg-black text-white text-sm"
            onClick={() => { onApply(); onClose(); }}
          >
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
