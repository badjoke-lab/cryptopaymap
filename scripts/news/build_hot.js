/* eslint-disable */
const fs = require("fs");
const path = require("path");

const NEWS_DIR = path.join(__dirname, "..", "..", "public", "data", "news");
const AGG_DIR  = path.join(__dirname, "..", "..", "public", "data", "aggregates");
const TOPICS   = path.join(NEWS_DIR, "topics.json");
const HOT      = path.join(AGG_DIR, "hot-topics.json");

const decay = (days) => Math.exp(-days / 7); // 1週間ハーフライフ程度

function main() {
  const tf = JSON.parse(fs.readFileSync(TOPICS, "utf-8"));
  const topics = tf.topics || [];

  const now = Date.now();
  const scores = topics.map((t) => {
    const days = (now - +new Date(t.last_seen || t.first_seen)) / 86400000;
    const pubs = t.publisher_count || 0;
    const reach = (t.cities ? new Set(t.cities).size : 0);
    const score = (pubs + reach) * decay(days);
    return { topic_id: t.id, score };
  });

  const top = scores
    .sort((a, b) => b.score - a.score)
    .map((x, i) => ({ ...x, rank: i + 1 }));

  fs.mkdirSync(AGG_DIR, { recursive: true });
  fs.writeFileSync(
    HOT,
    JSON.stringify({ generated_at: new Date().toISOString(), top }, null, 2)
  );
  console.log(`hot: ${top.length} → ${HOT}`);
}

main();
