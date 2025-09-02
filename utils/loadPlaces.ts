export type Place = { id:string; name:string; category:string; lat:number; lng:number; coins:string[];
  city?:string; country?:string; last_verified?:string; address?:string; website?:string; tags?:string[]; status?:string; source?:string; };
export type CityIndex = { country:string; city:string; path:string; updated?:string };
export async function loadIndex(){ const r=await fetch('/data/places/index.json',{cache:'no-store'}); if(!r.ok) throw new Error('index.json not found'); return r.json(); }
export async function loadAllPlaces(){ const idx=await loadIndex(); const files=idx.cities.map((c:any)=>`/data/places/${c.path}`);
  const chunks=await Promise.all(files.map((p:string)=>fetch(p,{cache:'no-store'}).then(r=>r.json())));
  const all=([] as any[]).concat(...chunks); return all.map((p:any)=>({...p, lng:p.lng ?? p.lon ?? p.longitude})) as Place[]; }
