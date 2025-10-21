// src/lib/sanitize.ts
// Phase5: sanitize utilities
// Node/Next 共通で動く純粋関数のみ。外部依存なし（Nodeのcryptoのみ任意）。

/** 制御文字（U+0000–U+001F, U+007F）ただし \t \n \r は除外 */
const CONTROL_CHARS_EXCEPT_WS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
/** 連続空白（スペース・改行・タブなど）を1スペースへ */
const WHITESPACE_COMPRESS = /[\s\u00A0]+/g;
/** ヘッダー改行注入対策（メールヘッダーで使用） */
const HEADER_BREAK = /(\r|\n|%0a|%0d)/gi;
/** URL 改行エンコード除去 */
const URL_BREAK = /(%0a|%0d)/gi;
/** 許容ファイル名（英数字と - _ . ）以外を - に置換 */
const SAFE_FILENAME = /[^A-Za-z0-9._-]+/g;
/** パス・トラバーサル除去対象 */
const TRAVERSAL = /(\.\.(\/|\\)|[\/\\]|%2f|%5c)/gi;

export type SanitizeTextOptions = { maxLen?: number };

/** テキストの安全化 */
export function sanitizeText(input: string | null | undefined, opts?: SanitizeTextOptions): string {
  if (!input) return "";
  let s = String(input);

  // 1) 改行・タブは空白に正規化（消さない）
  s = s.replace(/[\r\n\t]+/g, " ");

  // 2) その他の制御文字は除去
  s = s.replace(CONTROL_CHARS_EXCEPT_WS, "");

  // 3) 前後空白を整え、連続空白を1つに圧縮
  s = s.trim().replace(WHITESPACE_COMPRESS, " ");

  // 4) 最大長トリム
  if (opts?.maxLen && opts.maxLen > 0 && s.length > opts.maxLen) {
    s = s.slice(0, opts.maxLen);
  }
  return s;
}

/** ヘッダー値の安全化（メール等で使用）
 * 改行は完全削除（折り返し無効化）、制御文字も削除。コロンは空白へ。
 * ※ sanitizeText は使わない（空白圧縮を避けるため）
 */
export function sanitizeHeaderValue(input: string | null | undefined, opts?: SanitizeTextOptions): string {
  let s = String(input ?? "");

  // 改行注入の可能性を完全に排除
  s = s.replace(HEADER_BREAK, "");

  // 残りの制御文字（\t含む）を削除
  s = s.replace(/[\u0000-\u001F\u007F]/g, "");

  // コロンは区切りになるため空白に置換
  s = s.replace(/:/g, " ");

  // 前後の空白だけ整える（連続空白の圧縮はしない）
  s = s.trim();

  if (opts?.maxLen && opts.maxLen > 0 && s.length > opts.maxLen) {
    s = s.slice(0, opts.maxLen);
  }
  return s;
}

/** 簡易メールアドレス検証（空なら "" を返す＝未指定扱い） */
export function sanitizeEmail(input: string | null | undefined, opts?: SanitizeTextOptions): string {
  const s = sanitizeText(input ?? "", opts);
  if (!s) return "";
  // RFC完全準拠までは不要。実運用レベルの簡易検証。
  const ok = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  return ok ? s : "";
}

/** 非 http(s) / 相対URL / 不正URL を null に */
export function sanitizeUrl(url: string | null | undefined): string | null {
  if (!url) return null;
  let s = String(url).replace(CONTROL_CHARS_EXCEPT_WS, "").trim();
  if (!s) return null;
  // 改行エンコードを除去
  s = s.replace(URL_BREAK, "");

  // まず絶対URLとして判定
  try {
    const u = new URL(s);
    const scheme = u.protocol.toLowerCase();
    if (scheme !== "http:" && scheme !== "https:") return null;
    // ホスト必須
    if (!u.hostname) return null;
    return u.toString();
  } catch {
    // 相対URL → 明示的に不可（仕様）
    return null;
  }
}

/** URL の正規化（ベースがあれば相対を解決） */
export function normalizeUrl(url: string, base?: string): string | null {
  // まず sanitizeUrl を通す（相対は null になる）
  let absolute = sanitizeUrl(url);

  // base が与えられ、かつ相対っぽい場合は解決を試みる
  if (!absolute && base) {
    try {
      const u = new URL(url, base);
      const scheme = u.protocol.toLowerCase();
      if (scheme !== "http:" && scheme !== "https:") return null;
      absolute = u.toString();
    } catch {
      return null;
    }
  }
  if (!absolute) return null;

  // ここから正規化
  const u = new URL(absolute);

  // ホスト小文字化
  u.hostname = u.hostname.toLowerCase();

  // 既定ポート除去
  if ((u.protocol === "http:" && u.port === "80") || (u.protocol === "https:" && u.port === "443")) {
    u.port = "";
  }

  // パスの末尾スラッシュ統一（root は "/"、それ以外は末尾スラッシュ無し）
  if (u.pathname !== "/") {
    u.pathname = u.pathname.replace(/\/+$/g, "");
    if (u.pathname === "") u.pathname = "/";
  }

  // 不要なドットセグメントの解決は URL クラスで済んでいる
  return u.toString();
}

/** 安全なファイル名の生成（最低限の一意性を付与） */
export function safeFilename(name: string): string {
  const raw = String(name ?? "");
  const trimmed = raw.replace(CONTROL_CHARS_EXCEPT_WS, "").trim();

  // 入力にパス区切り/トラバーサルが含まれていたら強制的にフォールバック名にする
  const hadTraversalOrSep = /(\.\.(\/|\\)|[\/\\])/g.test(trimmed);

  // 危険要素を除去
  const noTraversal = trimmed.replace(TRAVERSAL, "");

  // 拡張子分離（最後の '.' を拡張子境界とみなす）
  const lastDot = noTraversal.lastIndexOf(".");
  const rawBaseCandidate = lastDot > 0 ? noTraversal.slice(0, lastDot) : noTraversal;

  // フォールバック判定：トラバーサル/セパレータ示唆があれば base を空に
  const rawBase = hadTraversalOrSep ? "" : rawBaseCandidate;
  const rawExt = lastDot > 0 ? noTraversal.slice(lastDot + 1) : "";

  // 許容文字へ
  let base = rawBase.replace(SAFE_FILENAME, "-").replace(/-+/g, "-").replace(/^[-.]+|[-.]+$/g, "");
  let ext = rawExt.replace(SAFE_FILENAME, "").replace(/^[-.]+|[-.]+$/g, "");

  // フォールバック名（file）
  if (!base) base = "file";
  if (ext && ext.length > 16) ext = ext.slice(-16); // 異常に長い拡張子は切り詰め

  // 一意性付与（時刻 + 短ハッシュ）
  const ts = Date.now().toString(36);
  const hash = shortHash(`${raw}|${base}.${ext}.${ts}`);
  const suffix = `${ts}-${hash}`;
  const joined = ext ? `${base}-${suffix}.${ext}` : `${base}-${suffix}`;
  return joined;
}

/** 入力用の placeId 許容（cpm / osm / gmaps） */
export function validatePlaceId(id: string): boolean {
  if (!id) return false;
  const s = String(id).replace(CONTROL_CHARS_EXCEPT_WS, "").trim();
  if (!s || TRAVERSAL.test(s)) return false;
  const re =
    /^(?:cpm:[a-z0-9][a-z0-9-]{2,}|osm:(?:node|way|relation):\d+|gmaps:place:[A-Za-z0-9_-]{6,})$/i;
  return re.test(s);
}

/** どの名前空間かを返す（保存時の分岐に使う） */
export function resolvePlaceIdNamespace(id: string): "cpm" | "osm" | "gmaps" | "unknown" {
  if (!validatePlaceId(id)) return "unknown";
  const low = id.toLowerCase();
  if (low.startsWith("cpm:")) return "cpm";
  if (low.startsWith("osm:")) return "osm";
  if (low.startsWith("gmaps:place:")) return "gmaps";
  return "unknown";
}

/** 簡易短ハッシュ（Base64url→先頭8文字） */
function shortHash(input: string): string {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require("crypto") as typeof import("crypto");
    const h = crypto.createHash("sha1").update(input).digest("base64url");
    return h.slice(0, 8);
  } catch {
    return Math.random().toString(36).slice(2, 10);
  }
}

export default {
  sanitizeText,
  sanitizeHeaderValue,
  sanitizeEmail,
  sanitizeUrl,
  normalizeUrl,
  safeFilename,
  validatePlaceId,
  resolvePlaceIdNamespace,
};
