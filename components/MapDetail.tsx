"use client";

import React, { useMemo, useState } from "react";
import { VerificationBadge } from "./VerificationBadge";

/* ===== Types ===== */
export type SocialItem = {
  platform?:
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
  country?: string;   // ISO alpha-2
  city?: string;
  address?: string;
  website?: string | null;
  phone?: string | null;            // ★ 追加：Phone を正式サポート
  verification?: {
    status?: "owner" | "community" | "directory" | "unverified";
    sources?: Array<{ type?: string; name?: string; url?: string; when?: string }>;
    last_verified?: string;
    verified_by?: string;
  };
  profile?: { summary?: string };
  media?: { images?: Array<{ url?: string; hash?: string; ext?: string; caption?: string }> };
  payment?: {
    accepts?: Array<{ asset?: string; chain?: string; method?: string }>;
    notes?: string;
  };
  socials?: SocialItem[];
} & Record<string, any>;

/* ---- constants ---- */
const SUM_OWNER_MAX = 600;
const SUM_COMMUNITY_MAX = 300;
const CAP_OWNER_MAX = 600;
const CAP_COMMUNITY_MAX = 300;

/* ---- helpers ---- */
function mediaUrl(img: any) {
  if (img?.hash) return `/api/media/${img.hash}${img?.ext ? `.${img.ext}` : ""}`;
  if (img?.url) return String(img.url);
  return "";
}

/* URL からプラットフォームを推定（X/Instagram 等） */
function inferPlatformFromUrl(url?: string): SocialItem["platform"] | undefined {
  if (!url) return;
  const u = url.toLowerCase();
  if (/instagram\.com/.test(u)) return "instagram";
  if (/twitter\.com|x\.com/.test(u)) return "x";
  if (/facebook\.com/.test(u)) return "facebook";
  if (/tiktok\.com/.test(u)) return "tiktok";
  if (/youtube\.com|youtu\.be/.test(u)) return "youtube";
  if (/t\.me|telegram\.me|telegram\.org/.test(u)) return "telegram";
  if (/whatsapp\.com/.test(u)) return "whatsapp";
  if (/wechat\.com|weixin\.qq\.com/.test(u)) return "wechat";
  if (/line\.me/.test(u)) return "line";
  if (/threads\.net/.test(u)) return "threads";
  if (/pinterest\.com/.test(u)) return "pinterest";
  return "other";
}

type Platform = NonNullable<SocialItem["platform"]>;
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

/* Payments */
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

/* Country label */
const COUNTRY_EN: Record<string, string> = {
  JP: "Japan", US: "United States", GB: "United Kingdom", FR: "France", DE: "Germany",
  IT: "Italy", ES: "Spain", KR: "South Korea", CN: "China", TW: "Taiwan",
  SG: "Singapore", AU: "Australia", CA: "Canada", BR: "Brazil",
};
const countryNameFromAlpha2 = (code?: string) =>
  (code && COUNTRY_EN[code.toUpperCase()]) || code || "";

/* ===== Component ===== */
export default function MapDetail({ place, onClose }: { place: Place; onClose?: () => void }) {
  const website = typeof place.website === "string" && place.website.trim() ? place.website.trim() : undefined;
  const phone = typeof place.phone === "string" && place.phone.trim() ? place.phone.trim() : undefined;

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

  const media = (place as any)?.media ?? {};
  const images: any[] = Array.isArray(media?.images) ? media.images : [];

  const sumLimit = isOwner ? SUM_OWNER_MAX : SUM_COMMUNITY_MAX;
  const capLimit = isOwner ? CAP_OWNER_MAX : CAP_COMMUNITY_MAX;

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

  /* Socials 正規化：URLからプラットフォーム推定＋ラベル常時表示 */
  const socials = useMemo(() => {
    const src: SocialItem[] = Array.isArray(place?.socials) ? place.socials : [];
    return src
      .map((s) => {
        const platform = s.platform ?? inferPlatformFromUrl(s.url) ?? "other";
        const handle = s.handle?.replace(/^@/, "");
        return { platform, url: s.url, handle };
      })
      .filter((s) => s.url || s.handle);
  }, [place?.socials]);

  /* ライトボックス（拡大表示） */
  const [lightbox, setLightbox] = useState<string | null>(null);

  return (
    <aside className="h-full overflow-y-auto bg-white">
      {/* Header */}
      <div className="flex items-start justify-between gap-3 px-6 pt-6">
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <VerificationBadge status={status} />
            {verification?.last_verified && (
              <span className="text-xs text-neutral-500">
                Last verified: {verification.last_verified}
              </span>
            )}
          </div>
          <h2 className="mt-2 text-2xl font-semibold leading-tight break-words">
            {place.name}
          </h2>
          {(place.category || place.city) && (
            <div className="text-sm text-neutral-600 mt-1">
              {place.category}{place.category && place.city ? " · " : ""}{place.city}
              {place.country ? `, ${countryNameFromAlpha2(place.country)}` : ""}
            </div>
          )}
        </div>
        {onClose && (
          <button onClick={onClose} aria-label="Close" className="rounded p-2 text-neutral-500 hover:bg-neutral-100 shrink-0">×</button>
        )}
      </div>

      <div className="space-y-5 px-6 py-5 text-[15px] leading-relaxed">

        {/* Photos：横スクロールのカルーセル＋クリック拡大 */}
        {canShowRich && images.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold mb-2 text-neutral-700">Photos</h3>
            <ul className="flex gap-2 overflow-x-auto snap-x snap-mandatory">
              {images.map((img: any, i: number) => {
                const url = mediaUrl(img);
                if (!url) return null;
                const caption = typeof img?.caption === "string" ? img.caption : "";
                return (
                  <li key={img?.hash ?? img?.url ?? i} className="snap-start">
                    <img
                      src={url}
                      alt=""
                      className="h-[180px] w-[240px] sm:h-[200px] sm:w-[280px] object-cover rounded-md ring-1 ring-neutral-200 cursor-zoom-in"
                      onClick={() => setLightbox(url)}
                    />
                    {caption && (
                      <p className="w-[240px] sm:w-[280px] text-xs text-neutral-700 mt-1">
                        {caption.slice(0, capLimit)}{caption.length > capLimit ? "…" : ""}
                      </p>
                    )}
                  </li>
                );
              })}
            </ul>

            {/* Lightbox */}
            {lightbox && (
              <div className="fixed inset-0 z-[5000] bg-black/70 flex items-center justify-center" onClick={() => setLightbox(null)}>
                <img src={lightbox} alt="" className="max-w-[92vw] max-h-[92vh] rounded-lg shadow-2xl" />
              </div>
            )}
          </section>
        )}

        {/* About */}
        {canShowRich && typeof place?.profile?.summary === "string" && place.profile.summary.trim() && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">About</h3>
            <p className="text-sm leading-6">
              {place.profile.summary.slice(0, sumLimit)}
              {place.profile.summary.length > sumLimit ? "…" : ""}
            </p>
          </section>
        )}

        {/* Payments */}
        {(accepts.length > 0 || paymentNote) && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Payments</h3>
            {accepts.length > 0 && (
              <>
                <div className="text-[14px] font-medium">Assets</div>
                <ul className="mt-1 ml-6 list-disc space-y-1">
                  {accepts.slice(0, 6).map((line, i) => (<li key={`${line}-${i}`} className="text-sm">{line}</li>))}
                </ul>
                {accepts.length > 6 && (<div className="text-xs text-slate-500 mt-1">+{accepts.length - 6}</div>)}
              </>
            )}
            {paymentNote && (
              <p className="mt-2 text-xs text-slate-700">
                <span className="font-medium">Note:</span> {paymentNote}
              </p>
            )}
          </section>
        )}

        {/* Contact：すべて見出し付きで統一 */}
        {(website || phone || socials.length > 0) && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Contact</h3>

            {website && (
              <div><span className="font-semibold">Website:</span>{" "}
                <a href={website} target="_blank" rel="noopener noreferrer" className="underline">Open ↗</a>
              </div>
            )}

            {phone && (
              <div><span className="font-semibold">Phone:</span>{" "}
                <a href={`tel:${phone.replace(/\s+/g,"")}`} className="underline">{phone}</a>
              </div>
            )}

            {socials.map((s, i) => {
              const platform = s.platform ?? "other";
              const label = prettyPlatformName(platform);
              const text =
                s.handle?.replace(/^@/, "") ||
                s.url?.replace(/^https?:\/\/(www\.)?/i, "") ||
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

        {/* Location */}
        {(place.city || place.country || place.address) && (() => {
          const hasLL = Number.isFinite(place.lat as any) && Number.isFinite(place.lng as any);
          const ll = `${place.lat},${place.lng}`;
          const q = encodeURIComponent([place.address, place.city, countryNameFromAlpha2(place.country)].filter(Boolean).join(", "));
          const google = hasLL ? `https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ll)}`
                               : `https://www.google.com/maps/dir/?api=1&destination=${q}`;
          const apple  = hasLL ? `https://maps.apple.com/?daddr=${encodeURIComponent(ll)}`
                               : `https://maps.apple.com/?daddr=${q}`;
          const osm    = hasLL ? `https://www.openstreetmap.org/directions?to=${encodeURIComponent(ll)}`
                               : `https://www.openstreetmap.org/directions?to=${q}`;

          return (
            <section>
              <h3 className="text-sm font-semibold text-neutral-700 mb-1">Location</h3>
              {place.city && (
                <div>
                  {place.city}{place.country ? `, ${countryNameFromAlpha2(place.country)}` : ""}
                </div>
              )}
              {place.address && <div>{place.address}</div>}
              <div className="mt-1 text-sm">
                <span className="text-neutral-700 font-medium">Navigation:</span>{" "}
                <a href={google} target="_blank" rel="noopener noreferrer" className="underline">Google Maps</a>{" "}
                <span className="text-neutral-400">|</span>{" "}
                <a href={apple} target="_blank" rel="noopener noreferrer" className="underline">Apple Maps</a>{" "}
                <span className="text-neutral-400">|</span>{" "}
                <a href={osm} target="_blank" rel="noopener noreferrer" className="underline">OpenStreetMap</a>
              </div>
            </section>
          );
        })()}

        {/* Evidence */}
        {Array.isArray(verification?.sources) && verification.sources.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold text-neutral-700 mb-1">Evidence</h3>
            <ul className="mt-1 ml-6 list-disc space-y-1">
              {verification.sources
                .map((s, i) => (s?.url ? <li key={`${s.url}-${i}`} className="text-sm"><a href={s.url} target="_blank" rel="noopener noreferrer" className="underline">{s.url}</a></li> : null))}
            </ul>
          </section>
        )}

        {/* Footer CTA */}
        {place?.id && (
          <section className="pt-2">
            <a href={`/submit.html?placeId=${encodeURIComponent(String(place.id))}`}
               className="inline-flex items-center gap-2 rounded px-3 py-2 text-sm border hover:bg-neutral-50">
              Contribute / Report
            </a>
          </section>
        )}
      </div>
    </aside>
  );
}
