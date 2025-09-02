'use client';

import { useMemo, useState } from 'react';

export type CityIndex = { city: string; country?: string; code?: string };
export type UIFilters = { coins: Set<string>; categories: Set<string>; city: string | null };

type Props = {
  coins: string[];
  categories: string[];
  cities: CityIndex[];
  value: UIFilters;
  onChange: (v: UIFilters) => void;
  onClose?: () => void;
};

const CAT_PAGE = 18;

export default function FilterPanel({
  coins,
  categories,
  cities,
  value,
  onChange,
  onClose,
}: Props) {
  // 初期状態は閉じる
  const [open, setOpen] = useState(false);

  // 検索と段階表示
  const [coinQuery, setCoinQuery] = useState('');
  const [catQuery, setCatQuery] = useState('');
  const [catLimit, setCatLimit] = useState(CAT_PAGE);

  // 表示用データ
  const sortedCoins = useMemo(
    () =>
      [...new Set(coins.map((c) => c.toUpperCase()))]
        .filter((c) => c.includes(coinQuery.toUpperCase()))
        .sort(),
    [coins, coinQuery]
  );

  const filteredCats = useMemo(() => {
    const q = catQuery.trim().toLowerCase();
    const list = [...categories];
    return (q ? list.filter((c) => c.toLowerCase().includes(q)) : list).sort();
  }, [categories, catQuery]);

  const visibleCats = useMemo(() => filteredCats.slice(0, catLimit), [filteredCats, catLimit]);

  const sortedCities = useMemo(
    () => [...cities].sort((a, b) => a.city.localeCompare(b.city)),
    [cities]
  );

  // 操作
  const toggleCoin = (c: string) => {
    const next = new Set(value.coins);
    next.has(c) ? next.delete(c) : next.add(c);
    onChange({ ...value, coins: next });
  };

  const toggleCat = (cat: string) => {
    const next = new Set(value.categories);
    next.has(cat) ? next.delete(cat) : next.add(cat);
    onChange({ ...value, categories: next });
  };

  const setCity = (city: string) => onChange({ ...value, city: city || null });

  const clearAll = () =>
    onChange({ coins: new Set<string>(), categories: new Set<string>(), city: null });

  if (!open) {
    return (
      <button
        className="rounded-md border px-3 py-1 bg-white shadow"
        onClick={() => setOpen(true)}
        aria-label="Open filters"
      >
        Filters
      </button>
    );
  }

  return (
    <div className="rounded-xl bg-white p-4 shadow-2xl w-[360px] max-h-[80vh] overflow-auto">
      {/* ヘッダー */}
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="font-semibold text-lg">Filters</div>
        <div className="flex items-center gap-2">
          <button className="text-sm text-gray-600 underline" onClick={clearAll}>
            Clear
          </button>
          <button
            className="text-sm rounded-md border px-2 py-1"
            onClick={() => {
              setOpen(false);
              onClose?.();
            }}
          >
            Close
          </button>
        </div>
      </div>

      {/* 選択チップ */}
      {(value.coins.size > 0 || value.categories.size > 0 || value.city) && (
        <div className="flex flex-wrap gap-2 mb-3">
          {[...value.coins].map((c) => (
            <Chip key={`coin:${c}`} label={c} onClear={() => toggleCoin(c)} />
          ))}
          {[...value.categories].map((cat) => (
            <Chip key={`cat:${cat}`} label={cat} onClear={() => toggleCat(cat)} />
          ))}
          {value.city && <Chip label={value.city} onClear={() => setCity('')} />}
        </div>
      )}

      {/* Coins */}
      <section className="mb-3">
        <div className="font-semibold mb-1">Coins</div>
        <input
          className="w-full border rounded-md px-2 py-1 mb-2"
          placeholder="Search coin…"
          value={coinQuery}
          onChange={(e) => setCoinQuery(e.target.value)}
        />
        <div className="grid grid-cols-3 gap-x-3 gap-y-2">
          {sortedCoins.map((c) => (
            <label key={c} className="inline-flex items-center gap-2">
              <input type="checkbox" checked={value.coins.has(c)} onChange={() => toggleCoin(c)} />
              <span>{c}</span>
            </label>
          ))}
          {sortedCoins.length === 0 && <div className="text-sm text-gray-500">No match</div>}
        </div>
      </section>

      {/* Category（検索＋“もっと見る”段階表示） */}
      <section className="mb-3">
        <div className="font-semibold mb-1">Category</div>
        <input
          className="w-full border rounded-md px-2 py-1 mb-2"
          placeholder="Search category…"
          value={catQuery}
          onChange={(e) => {
            setCatQuery(e.target.value);
            setCatLimit(CAT_PAGE); // 検索時は先頭から
          }}
        />
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {visibleCats.map((cat) => (
            <label key={cat} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.categories.has(cat)}
                onChange={() => toggleCat(cat)}
              />
              <span className="truncate">{cat}</span>
            </label>
          ))}
        </div>
        {filteredCats.length > catLimit && (
          <button
            className="mt-2 text-sm underline"
            onClick={() => setCatLimit((n) => n + CAT_PAGE)}
          >
            Show more ({filteredCats.length - catLimit} more)
          </button>
        )}
        {filteredCats.length === 0 && <div className="text-sm text-gray-500">No match</div>}
      </section>

      {/* City */}
      <section>
        <div className="font-semibold mb-1">City</div>
        <select
          className="w-full border rounded-md px-2 py-1 bg-white"
          value={value.city ?? ''}
          onChange={(e) => setCity(e.target.value)}
        >
          <option value="">All</option>
          {sortedCities.map((c) => (
            <option key={`${c.country}:${c.city}`} value={c.city}>
              {c.city} {c.country ? `(${c.country})` : ''}
            </option>
          ))}
        </select>
      </section>
    </div>
  );
}

// 小さなチップ
function Chip({ label, onClear }: { label: string; onClear: () => void }) {
  return (
    <span className="inline-flex items-center gap-1 bg-gray-100 border rounded-full px-2 py-[2px] text-sm">
      {label}
      <button className="text-gray-500 hover:text-gray-700" onClick={onClear} aria-label="clear">
        ×
      </button>
    </span>
  );
}
