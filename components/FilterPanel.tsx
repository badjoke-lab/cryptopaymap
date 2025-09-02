'use client';

import { useMemo, useState } from 'react';

export type CityIndex = {
  city: string;
  country: string;
  code?: string;
};

export type UIFilters = {
  coins: Set<string>;
  categories: Set<string>;
  city: string | null;
};

type Props = {
  /** チェック可能なコイン一覧（例: ["BTC","ETH","USDT"]） */
  coins: string[];
  /** チェック可能なカテゴリ一覧（OSMタグ由来の文字列） */
  categories: string[];
  /** 都市セレクト用の一覧 */
  cities: CityIndex[];
  /** 現在の選択状態（Set を受け取る） */
  value: UIFilters;
  /** 値が変わったら上位に通知 */
  onChange: (v: UIFilters) => void;
  /** パネルを閉じた時に（必要なら）呼ばれる */
  onClose?: () => void;
};

/**
 * Map 左上のフィルタ UI。
 * 初期状態は「閉じる」= false。ボタンで開閉します。
 */
export default function FilterPanel({
  coins,
  categories,
  cities,
  value,
  onChange,
  onClose,
}: Props) {
  // ★ 初期は閉じておく
  const [open, setOpen] = useState(false);

  // 表示用にソート
  const sortedCoins = useMemo(
    () => [...new Set(coins.map((c) => c.toUpperCase()))].sort(),
    [coins]
  );
  const sortedCats = useMemo(() => [...categories].sort(), [categories]);
  const sortedCities = useMemo(
    () => [...cities].sort((a, b) => a.city.localeCompare(b.city)),
    [cities]
  );

  const toggleCoin = (c: string) => {
    const next = new Set(value.coins);
    if (next.has(c)) next.delete(c);
    else next.add(c);
    onChange({ ...value, coins: next });
  };

  const toggleCat = (cat: string) => {
    const next = new Set(value.categories);
    if (next.has(cat)) next.delete(cat);
    else next.add(cat);
    onChange({ ...value, categories: next });
  };

  const setCity = (city: string) => {
    onChange({ ...value, city: city || null });
  };

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
    <div className="rounded-lg bg-white p-3 shadow-lg w-[340px] max-h-[80vh] overflow-auto">
      <div className="flex items-center justify-between mb-2">
        <strong>Filters</strong>
        <button
          className="text-sm underline"
          onClick={() => {
            setOpen(false);
            onClose?.();
          }}
        >
          Close
        </button>
      </div>

      {/* Coins */}
      <section className="mb-3">
        <div className="font-semibold mb-1">Coins</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {sortedCoins.map((c) => (
            <label key={c} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.coins.has(c)}
                onChange={() => toggleCoin(c)}
              />
              <span>{c}</span>
            </label>
          ))}
        </div>
      </section>

      {/* Category */}
      <section className="mb-3">
        <div className="font-semibold mb-1">Category</div>
        <div className="grid grid-cols-2 gap-x-3 gap-y-2">
          {sortedCats.map((cat) => (
            <label key={cat} className="inline-flex items-center gap-2">
              <input
                type="checkbox"
                checked={value.categories.has(cat)}
                onChange={() => toggleCat(cat)}
              />
              <span>{cat}</span>
            </label>
          ))}
        </div>
      </section>

      {/* City */}
      <section className="mb-1">
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
