import fs from 'fs'; import path from 'path';
const root = path.resolve(process.cwd(), 'public/data'); const placesDir = path.join(root, 'places'); const outAgg = path.join(root, 'aggregates');
fs.mkdirSync(outAgg, { recursive: true }); const load = p=>JSON.parse(fs.readFileSync(p,'utf-8'));
const daysFrom = s=>{ const d=new Date(s+'T00:00:00Z'); const now=new Date(); return Math.floor((now-d)/86400000); };
const idxPath = path.join(placesDir,'index.json');
if (!fs.existsSync(idxPath)) { console.error('index.json not found under public/data/places'); process.exit(0); }
const idx = load(idxPath); let all=[]; for(const c of (idx.cities||[])){ const p=path.join(placesDir, c.path); if(fs.existsSync(p)) all=all.concat(load(p)); }
const WINDOW=30;
const new_arrivals = all.filter(p=>p.last_verified && daysFrom(p.last_verified)<=WINDOW);
const recently_verified = new_arrivals.slice(0,20);
const cityAgg=new Map(); for(const p of all){ const k=`${p.city}|${p.country}`; const v=cityAgg.get(k)||{city:p.city,country:p.country,total:0,added_30d:0}; v.total++; if(p.last_verified && daysFrom(p.last_verified)<=WINDOW) v.added_30d++; cityAgg.set(k,v); }
const hot_cities = [...cityAgg.values()].sort((a,b)=>b.added_30d-a.added_30d);
const catCount=new Map(); for(const p of all){ catCount.set(p.category,(catCount.get(p.category)||0)+1); }
const popular_categories=[...catCount.entries()].map(([category,count])=>({category,count})).sort((a,b)=>b.count-a.count);
const discover={ generated_at:new Date().toISOString(), window_days:WINDOW, new_arrivals:new_arrivals.slice(0,20), recently_verified, hot_cities, popular_categories };
fs.writeFileSync(path.join(outAgg,'discover.json'), JSON.stringify(discover,null,2));
const byCoin=new Map(); for(const p of all){ for(const c of (p.coins||[])){ const v=byCoin.get(c)||{total:0,added_30d:0,rows:[]}; v.total++; if(p.last_verified && daysFrom(p.last_verified)<=WINDOW) v.added_30d++; v.rows.push(p); byCoin.set(c,v); } }
const coinsOut={ generated_at:new Date().toISOString(), coins:{} }; for(const [coin,v] of byCoin.entries()){ const city=new Map(); for(const p of v.rows){ const k=`${p.city}|${p.country}`; const r=city.get(k)||{city:p.city,country:p.country,count:0,added_30d:0}; r.count++; if(p.last_verified && daysFrom(p.last_verified)<=WINDOW) r.added_30d++; city.set(k,r); }
  const arr=[...city.values()].sort((a,b)=>b.count-a.count); const total=v.total; const top_cities=arr.map(r=>({...r,share: total? r.count/total : 0})); coinsOut.coins[coin]={ total:v.total, added_30d:v.added_30d, top_cities }; }
fs.writeFileSync(path.join(outAgg,'coins.json'), JSON.stringify(coinsOut,null,2));
console.log('[OK] Aggregates -> discover.json, coins.json (places:', all.length, ')');
