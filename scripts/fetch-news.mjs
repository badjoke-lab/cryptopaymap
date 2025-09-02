import fs from 'fs'; import path from 'path';
import Parser from 'rss-parser';

const shouldFetch = (process.env.NEWS_FETCH||'off').toLowerCase()==='on';
const projectRoot = process.cwd();
const sourcesFile = process.env.NEWS_SOURCES_FILE || './data/news_sources.json';
const outDir = path.resolve(projectRoot, 'public/data/news');
fs.mkdirSync(outDir, { recursive: true });
const articlesPath = path.join(outDir, 'articles.json');
const topicsPath = path.join(outDir, 'topics.json');

// Load existing as base
let articles = fs.existsSync(articlesPath) ? JSON.parse(fs.readFileSync(articlesPath,'utf-8')) : { generated_at:null, window_days:30, items:[] };
let topics = fs.existsSync(topicsPath) ? JSON.parse(fs.readFileSync(topicsPath,'utf-8')) : { generated_at:null, topics:[] };

if(!shouldFetch){
  // No-op; just bump timestamps
  const now = new Date().toISOString();
  articles.generated_at = now; topics.generated_at = now;
  fs.writeFileSync(articlesPath, JSON.stringify(articles,null,2));
  fs.writeFileSync(topicsPath, JSON.stringify(topics,null,2));
  console.log('[OK] News fetch: OFF (unchanged)');
  process.exit(0);
}

// Fetch RSS
let sources = { sources: [] };
try{
  sources = JSON.parse(fs.readFileSync(path.resolve(projectRoot, sourcesFile),'utf-8'));
}catch{
  console.warn('[WARN] sources file missing; skipping fetch');
  const now = new Date().toISOString();
  articles.generated_at = now; topics.generated_at = now;
  fs.writeFileSync(articlesPath, JSON.stringify(articles,null,2));
  fs.writeFileSync(topicsPath, JSON.stringify(topics,null,2));
  process.exit(0);
}

const parser = new Parser();
const MAX_PER = parseInt(process.env.NEWS_MAX_PER_SOURCE||'50',10);
const WINDOW_DAYS = parseInt(process.env.NEWS_WINDOW_DAYS||'30',10);
const since = Date.now() - WINDOW_DAYS*86400000;
const coinKeywords = [
  {key:'BTC', words:['bitcoin','btc']},
  {key:'ETH', words:['ethereum','eth']},
  {key:'USDT', words:['tether','usdt']},
  {key:'USDC', words:['usd coin','usdc']},
  {key:'SOL', words:['solana','sol']},
  {key:'BNB', words:['bnb','binance coin']},
  {key:'DOGE', words:['dogecoin','doge']},
  {key:'AVAX', words:['avalanche','avax']}
];

function detectCoins(text){
  const t = (text||'').toLowerCase();
  const hits = [];
  for(const c of coinKeywords){
    if(c.words.some(w=>t.includes(w))) hits.push(c.key);
  }
  return hits;
}

function uniqBy(arr, keyFn){ const map = new Map(); for(const it of arr){ map.set(keyFn(it), it); } return [...map.values()]; }

const fetched = [];
for(const s of sources.sources||[]){
  if(s.type!=='rss') continue;
  try{
    const feed = await parser.parseURL(s.url);
    for(const item of (feed.items||[]).slice(0,MAX_PER)){
      const published = item.isoDate ? new Date(item.isoDate).getTime() : (item.pubDate? new Date(item.pubDate).getTime(): 0);
      if(published && published < since) continue;
      const title = item.title || '';
      const summary = (item.contentSnippet || item.summary || '').trim();
      const url = item.link || '';
      const coins = detectCoins(title + ' ' + summary);
      if(coins.length===0) continue;

      fetched.push({
        id: Buffer.from(url).toString('base64').slice(0,16),
        title, url,
        publisher: (feed.title||s.id||'rss'),
        published_at: new Date(published||Date.now()).toISOString(),
        language: 'en',
        coins,
        cities: [], countries: [], categories: [],
        summary
      });
    }
  }catch(e){
    console.warn('[WARN] failed to fetch', s.url, e?.message);
  }
}

// Merge
const merged = uniqBy([...(articles.items||[]), ...fetched], x=>x.url);
articles = { generated_at: new Date().toISOString(), window_days: WINDOW_DAYS, items: merged };

// Topics by coin (simple)
const byCoin = new Map();
for(const a of merged){
  const key = (a.coins && a.coins[0]) || 'OTHER';
  const arr = byCoin.get(key) || []; arr.push(a); byCoin.set(key, arr);
}
const newTopics = [];
for(const [coin, arr] of byCoin.entries()){
  const id = `t-${coin.toLowerCase()}-${Date.now().toString(36)}`;
  newTopics.push({
    id, title: `${coin} payments adoption — recent coverage`,
    coins:[coin], cities:[], countries:[], categories:[],
    articles: arr.slice(0,5).map(a=>a.id),
    publisher_count: new Set(arr.map(a=>a.publisher)).size,
    last_seen: new Date().toISOString(),
    score: Math.min(1, arr.length/10)
  });
}
topics = { generated_at: new Date().toISOString(), topics: newTopics };

fs.writeFileSync(articlesPath, JSON.stringify(articles,null,2));
fs.writeFileSync(topicsPath, JSON.stringify(topics,null,2));
console.log('[OK] News fetch: wrote articles and topics');
