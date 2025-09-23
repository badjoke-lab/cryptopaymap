/* eslint-disable */
const fs = require("fs");
const path = require("path");

// I/O
const NEWS_DIR = path.join(__dirname, "..", "..", "public", "data", "news");
const ARTICLES = path.join(NEWS_DIR, "articles.json");
const TOPICS   = path.join(NEWS_DIR, "topics.json");

// 正規化（タイトルからノイズ削減→類似判定を安定化）
const normalize = (s="") =>
  s.toLowerCase()
   .replace(/“|”|’|‘/g,'"')
   .replace(/[^a-z0-9 \-]/g," ")
   .replace(/\s+/g," ")
   .trim();

// 類似キー：city + coins + 正規化タイトルの主要語
const sigOf = (a) => {
  const cities = (a.cities || []).slice(0,1).join(",");   // 代表都市だけ
  const coins  = (a.coins  || []).sort().join(",");
  const title  = normalize(a.title).split(" ").slice(0,8).join(" ");
  return `${cities}__${coins}__${title}`;
};

function main() {
  const af = JSON.parse(fs.readFileSync(ARTICLES, "utf-8"));
  const items = af.items || [];

  const bySig = new Map();
  for (const a of items) {
    const sig = sigOf(a);
    if (!bySig.has(sig)) bySig.set(sig, []);
    bySig.get(sig).push(a);
  }

  const topics = [];
  for (const [sig, arr] of bySig.entries()) {
    // 安定ID
    const id = `auto_${Buffer.from(sig).toString("base64").slice(0, 18)}`;

    // publisher_count & cities
    const pub = new Set(arr.map(x => x.publisher).filter(Boolean)).size;
    const allCities = Array.from(new Set(arr.flatMap(x => x.cities || [])));

    // トピック
    topics.push({
      id,
      title: arr[0].title,
      summary: arr[0].summary || "",
      coins: Array.from(new Set(arr.flatMap(x => x.coins || []))),
      cities: allCities,
      categories: Array.from(new Set(arr.flatMap(x => x.categories || []))),
      articles: arr.map(x => x.id),
      publisher_count: pub,
      first_seen: arr.map(x=>x.published_at).sort()[0],
      last_seen:  arr.map(x=>x.published_at).sort().slice(-1)[0],
    });

    // 各記事に cluster_id を付与
    arr.forEach(x => x.cluster_id = id);
  }

  // 出力
  fs.writeFileSync(
    TOPICS,
    JSON.stringify({ generated_at: new Date().toISOString(), topics }, null, 2)
  );
  fs.writeFileSync(
    ARTICLES,
    JSON.stringify(af, null, 2)
  );

  console.log(`topics: ${topics.length} → ${TOPICS}`);
}

main();
