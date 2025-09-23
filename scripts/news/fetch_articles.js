/* eslint-disable */
const fs = require("fs");
const path = require("path");
const fetch = require("node-fetch");
const { XMLParser } = require("fast-xml-parser");

// ===== 出力先 =====
const OUT_DIR = path.join(__dirname, "..", "..", "public", "data", "news");
const OUT_FILE = path.join(OUT_DIR, "articles.json");

// ===== 取得元 =====
const CRYPTOCOMPARE_URL =
  "https://min-api.cryptocompare.com/data/v2/news/?lang=EN";

const RSS_FEEDS = [
  "https://cointelegraph.com/rss/tag/adoption",
  "https://cointelegraph.com/rss/tag/payments",
  "https://decrypt.co/feed",
  "https://www.btctimes.com/rss.xml"
];

// ===== 判定パラメータ（緩める） =====
const KEYWORDS = [
  // “導入/決済” 系の緩い一致
  "accepts bitcoin","accept bitcoin","bitcoin payments","accept btc",
  "accepts ethereum","accept eth","eth payments",
  "accept usdt","accept usdc","stablecoin payments",
  "crypto payments","pay with bitcoin","lightning payments",
  "now accepts","start accepting","begins accepting","enable crypto payments"
];

const UA = {
  "User-Agent": "CryptoPayMapBot/1.0 (+https://example.com)",
  "Accept": "*/*",
};

// 英語判定を緩める（ASCII 比率が高ければ通す）
const looksEnglish = (s="") => {
  if (!s) return false;
  const n = s.length, ascii = (s.match(/[\x00-\x7F]/g)||[]).length;
  return ascii / n >= 0.8;
};

// coins 抽出を緩める（BTC を優先・無ければ推定）
const coinsOf = (text="") => {
  const t = text.toLowerCase();
  const out = new Set();
  if (/(bitcoin|btc|lightning)/.test(t)) out.add("BTC");
  if (/(ethereum|eth)/.test(t)) out.add("ETH");
  if (/\busdt\b|tether/.test(t)) out.add("USDT");
  if (/\busdc\b/.test(t)) out.add("USDC");
  // “crypto payments” だけでも最低 BTC は入れる
  if (out.size === 0 && /crypto payments|accept crypto|accepts crypto/.test(t)) {
    out.add("BTC");
  }
  return Array.from(out);
};

// 都市/カテゴリ（最低限）
const CITY_LIST = [
  "Tokyo","Osaka","Kyoto","Sapporo","Nagoya",
  "Washington","Los Angeles","San Francisco","Sacramento","Richmond","New York",
  "London","Paris","Berlin","Zug","Zurich","Geneva","Singapore","Hong Kong"
];
const citiesOf = (text="") => CITY_LIST.filter(c => new RegExp(`\\b${c}\\b`,"i").test(text));

const CATEGORY_RULES = [
  { key: "cafe",       words: ["cafe","coffee"] },
  { key: "bar",        words: ["bar","pub"] },
  { key: "restaurant", words: ["restaurant","diner","bistro"] },
  { key: "shop",       words: ["shop","store","retail","supermarket","market","spar"] },
  { key: "atm",        words: ["atm","kiosk"] },
  { key: "grocery",    words: ["grocery","supermarket","spar"] }
];
const categoriesOf = (text="") => {
  const t = text.toLowerCase();
  const out = new Set();
  for (const r of CATEGORY_RULES) if (r.words.some(w => t.includes(w))) out.add(r.key);
  return Array.from(out);
};

const keepArticle = (title="", body="") => {
  const txt = `${title} ${body}`.toLowerCase();
  return KEYWORDS.some(kw => txt.includes(kw)) && looksEnglish(title);
};

// ---- Fetch helpers ----
const getJSON = async (url) => {
  const res = await fetch(url, { headers: UA, timeout: 20000 });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.json();
};
const getText = async (url) => {
  const res = await fetch(url, { headers: UA, timeout: 20000 });
  if (!res.ok) throw new Error(`${url} -> ${res.status}`);
  return await res.text();
};

async function fetchCryptoCompare() {
  try {
    const json = await getJSON(CRYPTOCOMPARE_URL);
    const list = json?.Data || [];
    return list.map((a) => ({
      id: `cc_${a.id}`,
      title: a.title || "",
      url: a.url || "",
      publisher: a.source_info?.name || "",
      published_at: new Date((a.published_on || 0) * 1000).toISOString(),
      summary: a.body ? String(a.body).slice(0, 300) : "",
    }));
  } catch (e) {
    console.warn("CryptoCompare fetch failed:", e.message);
    return [];
  }
}

function pickLink(it) {
  // RSSの link 形状の揺れを吸収
  if (typeof it.link === "string") return it.link;
  if (Array.isArray(it.link)) {
    for (const l of it.link) {
      if (typeof l === "string") return l;
      if (l?.["@_href"]) return l["@_href"];
      if (l?.href) return l.href;
    }
  }
  if (it.link?.["@_href"]) return it.link["@_href"];
  if (it.link?.href) return it.link.href;
  return "";
}

async function fetchRSS(url) {
  try {
    const xml = await getText(url);
    const p = new XMLParser({ ignoreAttributes: false });
    const j = p.parse(xml);
    const items = j?.rss?.channel?.item || j?.feed?.entry || j?.channel?.item || [];
    return items.map((it, i) => {
      const title = it.title?.["#text"] || it.title || "";
      const link = pickLink(it);
      const pub = it.pubDate || it.published || it.updated || new Date().toISOString();
      const desc = (it.description || it.summary || "").toString().replace(/<[^>]+>/g, "");
      let host = "";
      try { host = new URL(String(link)).host.replace(/^www\./, ""); } catch {}
      return {
        id: `rss_${Buffer.from((title + link).slice(0,128)).toString("base64")}_${i}`,
        title: String(title),
        url: String(link),
        publisher: host,
        published_at: new Date(pub).toISOString(),
        summary: desc.slice(0, 300),
      };
    });
  } catch (e) {
    console.warn("RSS fetch failed:", url, e.message);
    return [];
  }
}

// フォールバック（最低限 4 件は出す）
const FALLBACK = [
  {
    id: "pubkey_dc_20250321",
    title: "Bitcoin bar “Pubkey” is coming to Washington, DC (accepts BTC)",
    url: "https://www.theverge.com/cryptocurrency/633590/crypto-bar-pubkey-washington",
    publisher: "The Verge",
    published_at: "2025-03-21T14:47:00Z",
    summary: "Pubkey expands to Washington, DC and supports Bitcoin payments.",
    coins: ["BTC"], cities: ["Washington"], countries: ["US"], categories: ["bar"]
  },
  {
    id: "sac_foodtoken_20250912",
    title: "Sacramento restaurants start accepting crypto via Food Token",
    url: "https://www.kcra.com/article/sacramento-restaurants-cryptocurrency-food-token/66072627",
    publisher: "KCRA 3",
    published_at: "2025-09-13T00:55:00Z",
    summary: "Multiple restaurants in Sacramento adopt the Food Token system to accept crypto.",
    coins: ["BTC","ETH","USDC","USDT"], cities: ["Sacramento"], countries: ["US"], categories: ["restaurant"]
  },
  {
    id: "richmond_blackiris_20250204",
    title: "Black Iris Social Club in Richmond now accepts Bitcoin",
    url: "https://www.axios.com/local/richmond/2025/02/04/black-iris-social-club-bitcoin",
    publisher: "Axios Richmond",
    published_at: "2025-02-04T12:00:00Z",
    summary: "Black Iris begins accepting Bitcoin for select payments.",
    coins: ["BTC"], cities: ["Richmond"], countries: ["US"], categories: ["bar"]
  },
  {
    id: "zug_spar_20250422",
    title: "Spar supermarket in Zug accepts Bitcoin via Lightning",
    url: "https://thepaypers.com/crypto-web3-and-cbdc/news/switzerland-based-supermarket-spar-now-accepts-bitcoin-payments",
    publisher: "The Paypers",
    published_at: "2025-04-22T12:00:00Z",
    summary: "A Spar supermarket in Zug enables in-store Bitcoin payments using Lightning.",
    coins: ["BTC"], cities: ["Zug"], countries: ["CH"], categories: ["grocery"]
  }
];

async function main() {
  // 取得
  const [cc, ...rssArr] = await Promise.all([
    fetchCryptoCompare(),
    ...RSS_FEEDS.map(fetchRSS),
  ]);
  const rss = rssArr.flat();

  // 結合→フィルタ緩和版
  const mergedRaw = [...cc, ...rss];

  const filtered = mergedRaw
    .filter((a) => keepArticle(a.title, a.summary))
    .map((a) => {
      const text = `${a.title} ${a.summary}`;
      const coins = coinsOf(text);
      const cities = citiesOf(text);
      const categories = categoriesOf(text);
      return { ...a, coins, cities, categories };
    })
    // coins が拾えなかったら BTC をデフォルトに（導入記事は多くが BTC 前提）
    .map((a) => ({ ...a, coins: a.coins?.length ? a.coins : ["BTC"] }))
    // 英語タイトルのみ
    .filter((a) => looksEnglish(a.title));

  // 窓を広げる（365日）※ 0 件回避
  const now = Date.now();
  const inWindow = filtered.filter(
    (a) => (now - +new Date(a.published_at)) / 86400000 <= 365
  );

  // URL 重複除外
  const seen = new Set();
  const uniq = [];
  for (const a of inWindow.sort((x,y)=>+new Date(y.published_at)-+new Date(x.published_at))) {
    if (!a.url || seen.has(a.url)) continue;
    seen.add(a.url);
    uniq.push(a);
  }

  // フォールバック（ゼロの場合はサンプルを吐く）
  const finalItems = (uniq.length > 0 ? uniq : FALLBACK).map((a) => ({
    id: a.id,
    title: a.title,
    url: a.url,
    publisher: a.publisher,
    published_at: a.published_at,
    summary: a.summary,
    coins: a.coins,
    cities: a.cities,
    countries: a.countries || [],
    categories: a.categories,
    cluster_id: undefined // build_topics で付与
  }));

  fs.mkdirSync(OUT_DIR, { recursive: true });
  const out = {
    generated_at: new Date().toISOString(),
    window_days: 365,
    items: finalItems,
  };
  fs.writeFileSync(OUT_FILE, JSON.stringify(out, null, 2));
  console.log(`Saved ${finalItems.length} → ${OUT_FILE}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
