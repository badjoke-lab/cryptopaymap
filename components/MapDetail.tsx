// components/MapDetail.tsx
"use client";

import React from "react";
import { VerificationBadge } from "./VerificationBadge";

export type SocialItem = {
  platform:
    | "instagram" | "facebook" | "x" | "tiktok" | "youtube"
    | "telegram" | "whatsapp" | "wechat" | "line" | "threads"
    | "pinterest" | "other";
  url?: string;
  handle?: string;
};

export type Place = {
  id: string;
  name: string;
  lat: number;
  lng: number;
  category?: string;
  country?: string;   // ISO alpha-2 or full name
  city?: string;
  address?: string;
  website?: string | null;

  // 画像は2系統に対応：media.images(オブジェクト配列) / images(文字列配列)
  media?: { images?: Array<{ url?: string; hash?: string; ext?: string; caption?: string }> };
  images?: string[];        // e.g. "/media/xxx.png" の配列（owner想定）

  // 文章プロフィール
  profile?: { summary?: string };

  // 支払い
  payment?: {
    accepts?: Array<{ asset?: string; chain?: string; method?: string }>;
    notes?: string;
  };
  payment_pages?: string[]; // e.g. ["https://example.com/pay"]

  // 営業情報・連絡先・属性
  hours?: string;           // OSM: opening_hours / hours を統一表示
  phone?: string;
  cuisine?: string | null;
  wifi?: string | null;     // "wlan" | null
  wifi_fee?: string | null; // "no" など
  wheelchair?: string | null; // "yes" | "no" | null
  smoking?: string | null;  // null/値
  delivery?: any;
  takeaway?: any;

  // ソーシャルは2系統に対応：配列 / オブジェクト(flat)
  socials?: SocialItem[];
  instagram?: string | null;
  twitter?: string | null;
  facebook?: string | null;

  // 検証情報
  verification?: {
    status?: "owner" | "community" | "directory" | "unverified";
    last_checked?: string; // OSM由来
    last_verified?: string; // owner/community 由来
    verified_by?: string;
    sources?: Array<{ type?: string; name?: string; url?: string; when?: string }>;
  };
} & Record<string, any>;

/* ---- constants（UIクランプ） ---- */
const SUM_OWNER_MAX = 600;
const SUM_COMMUNITY_MAX = 300;
const CAP_OWNER_MAX = 600;
const CAP_COMMUNITY_MAX = 300;
const IMG_OWNER_MAX = 8;
const IMG_COMMUNITY_MAX = 4;

/* ---- helpers ---- */
function mediaUrl(img: any) {
  if (img?.hash) return `/api/media/${img.hash}${img?.ext ? `.${img.ext}` : ""}`;
  if (img?.url) return String(img.url);
  return "";
}

/** ===== 3種ナビ URL ===== */
function navTarget(place: { lat?: number; lng?: number; address?: string; city?: string; country?: string }) {
  const hasLL = Number.isFinite(place.lat as any) && Number.isFinite(place.lng as any);
  if (hasLL) {
    const ll = `${place.lat},${place.lng}`;
    return {
      google: `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}`,
      apple: `https://maps.apple.com/?daddr=${encodeURIComponent(ll)}`,
      osm: `https://www.openstreetmap.org/directions?to=${encodeURIComponent(ll)}`,
    };
  }
  const q = encodeURIComponent([place.address, place.city, place.country].filter(Boolean).join(", "));
  return {
    google: `https://www.google.com/maps/dir/?api=1&destination=${q}`,
    apple: `https://maps.apple.com/?daddr=${q}`,
    osm: `https://www.openstreetmap.org/directions?to=${q}`,
  };
}

/* ===== Payments ===== */
function prettyAcceptItem(a: any): string | null {
  if (!a) return null;
  const asset = String(a?.asset || "").toUpperCase();
  const chain = String(a?.chain || "").toLowerCase();
  const method = String(a?.method || "").toLowerCase();
  if (!asset) return null;

  if (chain === "lightning" || method === "lightning") return "BTC (Lightning)";
  if (asset === "BTC" && (chain === "bitcoin" || method === "onchain" || method === "on-chain" || !chain)) {
    return "BTC (on-chain)";
  }
  if (asset === "ETH" && (chain === "evm-mainnet" || chain === "ethereum" || method === "onchain" || !chain)) {
    return "ETH (on-chain)";
  }

  const CHAIN_LABEL: Record<string, string> = {
    polygon: "Polygon",
    arbitrum: "Arbitrum",
    base: "Base",
    bsc: "BNB",
    solana: "Solana",
    tron: "Tron",
    ton: "TON",
    avalanche: "Avalanche",
  };
  const label = CHAIN_LABEL[chain];
  if (label) return `${asset}@${label}`;
  return asset;
}

function buildAcceptedLines(place: any): string[] {
  const acc = Array.isArray(place?.payment?.accepts) ? place.payment.accepts : [];
  const out: string[] = [];
  for (const a of acc) {
    const row = prettyAcceptItem(a);
    if (row) out.push(row);
  }
  return Array.from(new Set(out));
}

/* ===== 国名変換（表示用、最小辞書） ===== */
const COUNTRY_EN: Record<string, string> = {
  JP: "Japan", US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", ES: "Spain", KR: "South Korea", CN: "China", TW: "Taiwan",
  SG: "Singapore", AU: "Australia", CA: "Canada", BR: "Brazil",
};
const countryNameFrom = (codeOrName?: string) => {
  if (!codeOrName) return "";
  const code = codeOrName.toUpperCase();
  return COUNTRY_EN[code] || codeOrName;
};

/* ===== Socials ===== */
type Platform = SocialItem["platform"];
function prettyPlatformName(p: Platform) {
  switch (p) {
    case "x": return "X";
    case "youtube": return "YouTube";
    case "tiktok": return "TikTok";
    case "wechat": return "WeChat";
    case "whatsapp": return "WhatsApp";
    case "telegram": return "Telegram";
    case "line": return "LINE";
    default: return p[0].toUpperCase() + p.slice(1);
  }
}

// フラットな instagram/twitter/facebook も配列形式に正規化
function normalizeSocials(place: Place): SocialItem[] {
  const out: SocialItem[] = [];
  if (Array.isArray(place.socials)) out.push(...place.socials);
  const add = (platform: SocialItem["platform"], url?: string | null) => {
    if (!url || typeof url !== "string" || !url.trim()) return;
    out.push({ platform, url: url.trim() });
  };
  // OSM や owner JSON のフラット項目にも対応
  add("instagram", (place as any).instagram);
  add("x", (place as any).twitter);
  add("facebook", (place as any).facebook);
  // 一部のownerデータにある"socials": { instagram: "… https://x.com/…" } の様な混在にも粗く対応
  const socialsObj = (place as any).socials as any;
  if (socialsObj && !Array.isArray(socialsObj)) {
    if (typeof socialsObj.instagram === "string") add("instagram", socialsObj.instagram);
    if (typeof socialsObj.twitter === "string") add("x", socialsObj.twitter);
    if (typeof socialsObj.facebook === "string") add("facebook", socialsObj.facebook);
  }
  // 重複削除
  const seen = new Set<string>();
  return out.filter(s => {
    const key = `${s.platform}:${s.url ?? s.handle ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default function MapDetail({ place, onClose }: { place: Place; onClose?: () => void }) {
  const website = typeof place.website === "string" && place.website.trim() ? place.website.trim() : undefined;

  const verification = (place as any)?.verification ?? {};
  const status: "owner" | "community" | "directory" | "unverified" | undefined =
    verification?.status === "owner" ||
    verification?.status === "community" ||
    verification?.status === "directory" ||
    verification?.status === "unverified"
      ? verification.status
      : undefined;

  const isOwner = status === "owner";
  const isCommunity = status === "community";
  const canShowRich = isOwner || isCommunity;

  // 画像：media.images 優先、無ければ images(string[]) を使用
  const media = (place as any)?.media ?? {};
  const imageObjs: any[] = Array.isArray(media?.images) ? media.images : [];
  const imageStrings: string[] = Array.isArray(place?.images) ? place.images : [];
  const hasMediaImages = imageObjs.length > 0;
  const hasStringImages = imageStrings.length > 0;

  const sumLimit = isOwner ? SUM_OWNER_MAX : SUM_COMMUNITY_MAX;
  const capLimit = isOwner ? CAP_OWNER_MAX : CAP_COMMUNITY_MAX;
  const imgLimit = isOwner ? IMG_OWNER_MAX : IMG_COMMUNITY_MAX;

  // 支払い（accepts → それが無ければ coins フォールバック）
  let accepts = buildAcceptedLines(place);
  if (accepts.length === 0 && Array.isArray((place as any)?.coins)) {
    accepts = (place as any).coins
      .map((c: any) => String(c || "").toUpperCase())
      .filter(Boolean)
      .slice(0, 12);
  }

  const paymentNote: string | undefined =
    typeof place?.payment?.notes === "string" && place.payment.notes.trim()
      ? place.payment.notes.trim()
      : undefined;

  const socials = normalizeSocials(place);

  // Evidence: verification.sources[].url/name を採用
  const evidenceLinks: Array<{ url: string; name?: string; when?: string }> = (() => {
    const srcs = Array.isArray(verification?.sources) ? verification.sources : [];
    const out: Array<{ url: string; name?: string; when?: string }> = [];
    for (const s of srcs) {
      const url = typeof s?.url === "string" ? s.url.trim() : "";
      if (!url) continue;
      out.push({ url, name: s?.name, when: s?.when });
    }
    // 重複URL除去
    const seen = new Set<string>();
    return out.filter(x => (seen.has(x.url) ? false : (seen.add(x.url), true)));
  })();

  const countryPretty = countryNameFrom(place.country);

  return (
    <aside className="h-full overflow-y-auto bg-white">
      {/* Header（1行目=バッジ / 2行目=店名 / 3行目=category · city） */}
      <div className="flex items-start justify-between gap-3 px-6 pt-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <VerificationBadge status={status} />
            {/* 検証補足 */}
            {(verification?.last_verified || verification?.last_checked) && (
              <span className="text-xs text-neutral-500">
                {verification?.last_verified
                  ? `Last verified: ${verification.last_verified}`
                  : `Last checked: ${verification.last_checked}`}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight break-words">
            {place.name}
          </h2>
          {(place.category || place.city) && (
            <div className="text-sm text-neutral-600 mt-1">
              {place.category}
              {place.category && (place.city || countryPretty) ? " · " : ""}
              {[place.city, countryPretty].filter(Boolean).join(", ")}
            </div>
          )}
        </div>

        {onClose && (
          <button
            onClick={onClose}
            aria-label="Close"
            className="rounded p-2 text-neutral-500 hover:bg-neutral-100 shrink-0"
          >
            ×
          </button>
        )}
      </div>

      <div className="space-y-5 px-6 py-5 text-[15px] leading-relaxed">
        {/* Photos（owner/community は表示、OSMでも images(string[]) があれば表示） */}
        {(canShowRich && hasMediaImages) || hasStringImages ? (
          <section>
            <h3 className="text-sm font-semibold mb-2 text-neutral-700">Photos</h3>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-2">
              {(hasMediaImages ? imageObjs.map((img: any) => mediaUrl(img)).filter(Boolean) : imageStrings)
                .slice(0, imgLimit)
                .map((src: string, i: number) => (
                  <li key={`${src}-${i}`}>
                    <img
                      src={src}
                      alt=""
                      className="aspect-[4/3] w-full object-cover rounded-md ring-1 ring-neutral-200"
                    />
                  </li>
                ))}
            </ul>
          </section>
        ) : null}

        {/* About（owner/community のみ） */}
        {canShowRich && typeof (place as any)?.profile?.summary === "string" && (place as any).profile.summary.trim() && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">About</h3>
            <p className="text-sm leading-6">
              {(place as any).profile.summary.slice(0, sumLimit)}
              {(place as any).profile.summary.length > sumLimit ? "…" : ""}
            </p>
          </section>
        )}

        {/* Hours（OSM/ownerの hours をそのまま） */}
        {typeof place.hours === "string" && place.hours.trim() && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Hours</h3>
            <div className="text-sm whitespace-pre-wrap break-words">{place.hours}</div>
          </section>
        )}

        {/* Payments */}
        {(accepts.length > 0 || paymentNote || Array.isArray(place.payment_pages)) && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Payments</h3>

            {accepts.length > 0 && (
              <>
                <div className="text-[14px] font-medium">Assets</div>
                <ul className="mt-1 ml-6 list-disc space-y-1">
                  {accepts.slice(0, 8).map((line, i) => (
                    <li key={`${line}-${i}`} className="text-sm">{line}</li>
                  ))}
                </ul>
                {accepts.length > 8 && (
                  <div className="text-xs text-slate-500 mt-1">+{accepts.length - 8}</div>
                )}
              </>
            )}

            {Array.isArray(place.payment_pages) && place.payment_pages.length > 0 && (
              <div className="mt-2">
                <div className="text-[14px] font-medium">Payment pages</div>
                <ul className="mt-1 ml-6 list-disc space-y-1">
                  {place.payment_pages.map((u, i) => (
                    <li key={`${u}-${i}`} className="text-sm">
                      <a href={u} target="_blank" rel="noopener noreferrer" className="underline">
                        {u}
                      </a>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {paymentNote && (
              <p className="mt-2 text-xs text-slate-700">
                <span className="font-medium">Note:</span> {paymentNote}
              </p>
            )}
          </section>
        )}

        {/* Contact（Website / Phone / Socials） */}
        {(website || place.phone || normalizeSocials(place).length > 0) && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Contact</h3>
            {website && (
              <div>
                <span className="font-semibold">Website:</span>{" "}
                <a href={website} target="_blank" rel="noopener noreferrer" className="underline">
                  Open ↗
                </a>
              </div>
            )}
            {place.phone && (
              <div>
                <span className="font-semibold">Phone:</span>{" "}
                <a href={`tel:${place.phone}`} className="underline">{place.phone}</a>
              </div>
            )}
            {socials.map((s, i) => {
              const label = prettyPlatformName(s.platform);
              const text =
                s.handle?.replace(/^@/, "") ||
                s.url?.replace(/^https?:\/\/(www\.)?/i, "") ||
                s.url ||
                "";
              const href = s.url || undefined;
              if (!text) return null;
              return (
                <div key={`${label}-${text}-${i}`}>
                  <span className="font-semibold">{label}:</span>{" "}
                  {href ? (
                    <a href={href} target="_blank" rel="noopener noreferrer" className="underline">
                      {s.handle ? `@${text}` : text}
                    </a>
                  ) : (
                    <span>@{text}</span>
                  )}
                </div>
              );
            })}
          </section>
        )}

        {/* Amenities / Services / Cuisine */}
        {(place.cuisine || place.wifi || place.wheelchair || place.smoking || place.delivery != null || place.takeaway != null) && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Amenities</h3>
            <ul className="ml-6 list-disc space-y-1 text-sm">
              {place.cuisine && <li><span className="font-medium">Cuisine:</span> {place.cuisine}</li>}
              {place.wifi && <li><span className="font-medium">Wi-Fi:</span> {place.wifi}{place.wifi_fee ? ` (fee: ${place.wifi_fee})` : ""}</li>}
              {typeof place.wheelchair === "string" && <li><span className="font-medium">Wheelchair:</span> {place.wheelchair}</li>}
              {typeof place.smoking === "string" && <li><span className="font-medium">Smoking:</span> {place.smoking}</li>}
              {place.delivery != null && <li><span className="font-medium">Delivery:</span> {String(place.delivery)}</li>}
              {place.takeaway != null && <li><span className="font-medium">Takeaway:</span> {String(place.takeaway)}</li>}
            </ul>
          </section>
        )}

        {/* Location（住所＋3種ナビ） */}
        {(place.city || place.country || place.address) && (() => {
          const nav = navTarget({
            lat: place.lat, lng: place.lng,
            address: place.address, city: place.city, country: place.country
          });
          return (
            <section>
              <h3 className="text-sm font-semibold text-neutral-700 mb-1">Location</h3>
              {(place.city || countryPretty) && (
                <div>{[place.city, countryPretty].filter(Boolean).join(", ")}</div>
              )}
              {place.address && <div>{place.address}</div>}
              <div className="mt-1 text-sm">
                <span className="text-neutral-700 font-medium">Navigation:</span>{" "}
                <a href={nav.google} target="_blank" rel="noopener noreferrer" className="underline">Google Maps</a>{" "}
                <span className="text-neutral-400">|</span>{" "}
                <a href={nav.apple} target="_blank" rel="noopener noreferrer" className="underline">Apple Maps</a>{" "}
                <span className="text-neutral-400">|</span>{" "}
                <a href={nav.osm} target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a>
              </div>
            </section>
          );
        })()}

        {/* Evidence（verification.sources）＋ Verified by */}
        {(evidenceLinks.length > 0 || verification?.verified_by) && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Evidence</h3>
            {verification?.verified_by && (
              <div className="text-sm mb-1">
                <span className="font-medium">Verified by:</span> {verification.verified_by}
              </div>
            )}
            {evidenceLinks.length > 0 && (
              <ul className="mt-1 ml-6 list-disc space-y-1">
                {evidenceLinks.map((e, i) => (
                  <li key={`${e.url}-${i}`} className="text-sm">
                    <a href={e.url} target="_blank" rel="noopener noreferrer" className="underline">
                      {e.name ? `${e.name} — ` : ""}{e.url}
                    </a>
                    {e.when ? <span className="text-xs text-neutral-500"> ({e.when})</span> : null}
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Footer CTA：Contribute / Report */}
        {place?.id && (
          <section className="pt-2">
            <a
              href={`/submit.html?placeId=${encodeURIComponent(String(place.id))}`}
              className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm border hover:bg-neutral-50"
            >
              Contribute / Report
            </a>
          </section>
        )}
      </div>
    </aside>
  );
}
