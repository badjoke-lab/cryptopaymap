// components/MapDetail.tsx
"use client";

import React from "react";

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  country?: string;
  city?: string;
  address?: string;
  coins?: string[] | string;
  website?: string | null;
  url?: string | null;
  hours?: string | null;
  phone?: string | null;
  instagram?: string | null;
  twitter?: string | null;
  x?: string | null;
  last_verified?: string | null;
} & Record<string, any>;

type Props = { place: Place; onClose?: () => void };

/* ---- helpers ---- */
function asArray<T>(v: T[] | T | undefined | null): T[] {
  if (v == null) return [];
  return Array.isArray(v) ? v : [v];
}
function fmtCoins(v?: string[] | string): string {
  const arr = asArray(v);
  return arr.length ? arr.join(", ") : "";
}
function firstNonEmpty(obj: any, keys: string[]): string | null {
  if (!obj || typeof obj !== "object") return null;
  for (const k of keys) {
    if (!Object.prototype.hasOwnProperty.call(obj, k)) continue;
    const raw = obj[k];
    if (raw == null) continue;
    let s = "";
    if (typeof raw === "string") s = raw.trim();
    else if (Array.isArray(raw)) s = raw.filter(Boolean).join(", ").trim();
    else s = String(raw ?? "").trim();
    if (s.length > 0) return s;
  }
  return null;
}
function normInstagram(v?: string | null): { handle: string; url: string } | null {
  if (!v) return null;
  let handle = v.trim();
  const m = handle.match(/^https?:\/\/(?:www\.)?instagram\.com\/([^\/\?\#]+)/i);
  if (m) handle = m[1];
  handle = handle.replace(/^@/, "");
  if (!handle) return null;
  return { handle, url: `https://instagram.com/${handle}` };
}
function normTwitterOrX(v?: string | null): { handle: string; url: string } | null {
  if (!v) return null;
  let handle = v.trim();
  const m = handle.match(/^https?:\/\/(?:www\.)?(?:twitter\.com|x\.com)\/([^\/\?\#]+)/i);
  if (m) handle = m[1];
  handle = handle.replace(/^@/, "");
  if (!handle) return null;
  return { handle, url: `https://x.com/${handle}` };
}

/** 値の整形（payment 等のブール系に ✓/✗） */
const isBoolLike = (v: any) =>
  typeof v === "boolean" ||
  (typeof v === "string" && /^(true|false|yes|no|1|0)$/i.test(v.trim())) ||
  (typeof v === "number" && (v === 0 || v === 1));
const toBool = (v: any) => {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  if (typeof v === "string") return /^(true|yes|1)$/i.test(v.trim());
  return false;
};
const humanizeKey = (k: string) => k.replace(/_/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
function renderObjectInline(obj: Record<string, any>): React.ReactNode {
  const entries = Object.entries(obj).filter(([, v]) => v != null && (String(v).trim?.() ?? String(v)) !== "");
  if (!entries.length) return null;
  const allBool = entries.every(([, v]) => isBoolLike(v));
  if (allBool) {
    return (
      <span>
        {entries.map(([k, v], i) => (
          <span key={k}>
            {i ? " / " : ""}
            {humanizeKey(k)} {toBool(v) ? "✓" : "✗"}
          </span>
        ))}
      </span>
    );
  }
  return (
    <span>
      {entries.map(([k, v], i) => (
        <span key={k}>
          {i ? ", " : ""}
          {humanizeKey(k)}: {String(v)}
        </span>
      ))}
    </span>
  );
}
function stringifyValuePretty(v: any): React.ReactNode {
  if (v == null) return "";
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join(", ");
  if (typeof v === "object") return renderObjectInline(v as Record<string, any>);
  return String(v);
}

/** Share: Copy */
function buildShareUrl(place: { id: string; lat: number; lng: number }): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  if (place?.id) u.searchParams.set("select", place.id);
  else u.searchParams.set("ll", `${place.lat},${place.lng}`);
  u.hash = "";
  return `${u.origin}${u.pathname}?${u.searchParams.toString()}`;
}
function copy(text: string) {
  try {
    if (navigator.clipboard?.writeText) return navigator.clipboard.writeText(text);
  } catch {}
  const ta = document.createElement("textarea");
  ta.value = text;
  ta.style.position = "fixed";
  ta.style.opacity = "0";
  document.body.appendChild(ta);
  ta.select();
  try { document.execCommand("copy"); } finally { document.body.removeChild(ta); }
}

/* ---- component ---- */
export default function MapDetail({ place, onClose }: Props) {
  const website = firstNonEmpty(place, ["website", "url"]);
  const phone = firstNonEmpty(place, ["phone", "contact:phone", "contact_phone", "tel", "telephone"]);
  const hours = firstNonEmpty(place, ["hours", "opening_hours"]);
  const igRaw = firstNonEmpty(place, ["instagram", "contact:instagram", "social_instagram"]);
  const twRaw = firstNonEmpty(place, ["twitter", "x", "contact:twitter", "contact:x", "social_twitter"]);
  const ig = normInstagram(igRaw);
  const tw = normTwitterOrX(twRaw);
  const coinsText = fmtCoins(place.coins);
  const shareUrl = buildShareUrl(place);

  const gmap = `https://maps.google.com/?q=${encodeURIComponent(place.name || "")}&ll=${place.lat},${place.lng}&z=18`;
  const amap = `http://maps.apple.com/?ll=${place.lat},${place.lng}&q=${encodeURIComponent(place.name || "")}`;
  const osm = `https://www.openstreetmap.org/?mlat=${place.lat}&mlon=${place.lng}#map=18/${place.lat}/${place.lng}`;

  const copyAddress = () => { if (place.address) navigator.clipboard?.writeText(place.address).catch(() => {}); };

  // 「tags」を非表示（その他は表示）
  const consumed = new Set<string>([
    "id","name","lat","lng",
    "city","country","address","category","coins",
    "website","url",
    "phone","contact:phone","contact_phone","tel","telephone",
    "hours","opening_hours",
    "instagram","contact:instagram","social_instagram",
    "twitter","x","contact:twitter","contact:x","social_twitter",
    "last_verified",
    "tags",
  ]);
  const otherEntries = Object.entries(place)
    .filter(([k, v]) => !consumed.has(k) && v != null && (String(v).trim?.() ?? String(v)) !== "");

  return (
    <aside className="h-full overflow-y-auto bg-white">
      <div className="flex items-start justify-between px-6 pt-6">
        <h2 className="text-2xl font-semibold leading-tight">{place.name}</h2>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="rounded p-2 text-neutral-500 hover:bg-neutral-100">×</button>
        )}
      </div>

      <div className="space-y-4 px-6 py-4 text-[15px] leading-relaxed">
        {(place.city || place.country) && (
          <div><span className="font-semibold">Location:</span> {[place.city, place.country].filter(Boolean).join(", ")}</div>
        )}

        {place.address && (
          <div>
            <span className="font-semibold">Address:</span> <span>{place.address}</span>{" "}
            <button onClick={copyAddress} className="ml-2 rounded border border-neutral-300 px-2 py-0.5 text-sm hover:bg-neutral-50" title="Copy address">Copy</button>
          </div>
        )}

        {place.category && <div><span className="font-semibold">Category:</span> {place.category}</div>}

        {coinsText && <div><span className="font-semibold">Coins:</span> {coinsText}</div>}

        {/* Share（中段・Copyのみ） */}
        <div>
          <span className="font-semibold">Share:</span>{" "}
          <button
            type="button"
            onClick={() => copy(shareUrl)}
            className="rounded border border-neutral-300 px-2 py-0.5 text-sm hover:bg-neutral-50"
            title="Copy link"
          >
            Copy
          </button>
        </div>

        {website && (
          <div><span className="font-semibold">Website:</span>{" "}
            <a href={website} target="_blank" rel="noopener noreferrer" className="underline">Open ↗</a>
          </div>
        )}

        {phone && (
          <div><span className="font-semibold">Phone:</span>{" "}
            <a href={`tel:${phone.replace(/[^\d\+]/g, "")}`} className="underline">{phone}</a>
          </div>
        )}

        {hours && <div><span className="font-semibold">Hours:</span> {hours}</div>}

        {ig && (
          <div><span className="font-semibold">Instagram:</span>{" "}
            <a href={ig.url} target="_blank" rel="noopener noreferrer" className="underline">@{ig.handle}</a>
          </div>
        )}

        {tw && (
          <div><span className="font-semibold">X:</span>{" "}
            <a href={tw.url} target="_blank" rel="noopener noreferrer" className="underline">@{tw.handle}</a>
          </div>
        )}

        {place.last_verified && <div><span className="font-semibold">Last verified:</span> {place.last_verified}</div>}

        {/* 未知キーはすべて列挙（オブジェクトは上の整形で表示） */}
        {otherEntries.length > 0 && otherEntries.map(([k, v]) => {
          const valNode = stringifyValuePretty(v);
          if (!valNode) return null;
          return (
            <div key={k}>
              <span className="font-semibold">{humanizeKey(k)}:</span>{" "}
              <span className="break-words">{valNode}</span>
            </div>
          );
        })}

        <div className="pt-2">
          <div className="font-semibold">Navigate:</div>
          <div className="mt-1 space-x-4">
            <a href={gmap} target="_blank" rel="noopener noreferrer" className="underline">Google</a>
            <a href={amap} target="_blank" rel="noopener noreferrer" className="underline">Apple</a>
            <a href={osm} target="_blank" rel="noopener noreferrer" className="underline">OSM</a>
          </div>
        </div>
      </div>
    </aside>
  );
}
