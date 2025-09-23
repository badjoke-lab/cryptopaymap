"use client";
import { useEffect } from "react";

type Opt = { label: string; value: string };
export default function FilterSheet({
  open, onClose,
  coin, setCoin, coins,
  category, setCategory, categories,
  city, setCity, cities,
  onApply, onReset
}: {
  open: boolean; onClose: () => void;
  coin: string; setCoin: (v: string)=>void; coins: Opt[];
  category: string; setCategory: (v: string)=>void; categories: Opt[];
  city: string; setCity: (v: string)=>void; cities: Opt[];
  onApply: () => void; onReset: () => void;
}) {
  useEffect(() => {
    document.body.style.overflow = open ? "hidden" : "";
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  if (!open) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-backdrop" onClick={onClose} />
      <div className="fixed left-0 right-0 bottom-0 z-sheet
                      rounded-t-2xl bg-white shadow-xl p-4 pb-[calc(env(safe-area-inset-bottom,0)+12px)]
                      max-h-[80svh] overflow-y-auto md:hidden">
        <div className="h-1.5 w-10 bg-gray-300 rounded-full mx-auto mb-3" />
        <h3 className="text-base font-semibold mb-3">Filters</h3>

        <div className="space-y-4">
          <div>
            <label className="block text-sm mb-1">Coin</label>
            <select value={coin} onChange={e=>setCoin(e.target.value)} className="w-full rounded-lg border p-2">
              {coins.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">Category</label>
            <select value={category} onChange={e=>setCategory(e.target.value)} className="w-full rounded-lg border p-2">
              {categories.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>

          <div>
            <label className="block text-sm mb-1">City</label>
            <select value={city} onChange={e=>setCity(e.target.value)} className="w-full rounded-lg border p-2">
              {cities.map(o=> <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
          </div>
        </div>

        <div className="flex items-center justify-between gap-3 mt-5">
          <button className="text-sm underline" onClick={onReset}>Reset</button>
          <button className="px-4 h-10 rounded-lg bg-black text-white text-sm" onClick={() => { onApply(); onClose(); }}>
            Apply
          </button>
        </div>
      </div>
    </>
  );
}
