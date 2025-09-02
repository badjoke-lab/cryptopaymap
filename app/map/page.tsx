'use client';
import React, { useEffect, useMemo, useState } from 'react';
import dynamic from 'next/dynamic';
import 'leaflet/dist/leaflet.css';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { loadAllPlaces, loadIndex, type Place, type CityIndex } from '@/utils/loadPlaces';
import PlacePanel from '@/components/PlacePanel';
import ClusterLayer from '@/components/ClusterLayer';
import FilterPanel from '@/components/FilterPanel';
import { useMap } from 'react-leaflet';

const MapContainer = dynamic(()=>import('react-leaflet').then(m=>m.MapContainer),{ssr:false});
const TileLayer   = dynamic(()=>import('react-leaflet').then(m=>m.TileLayer),{ssr:false});

const ALL_CATEGORIES = ['cafe','restaurant','bar','shop','service','atm','hotel','museum','other'];
const norm = (s:string)=> s.toLowerCase().replace(/\s+/g,'-');

function FitToData({ points }:{ points: Place[] }){
  const Any = (useMap as unknown) as () => any;
  const map = Any();
  useEffect(()=>{
    if (!map || !points.length) return;
    let minLat = 90, maxLat = -90, minLng = 180, maxLng = -180;
    for (const p of points){ if(p.lat<minLat) minLat=p.lat; if(p.lat>maxLat) maxLat=p.lat; if(p.lng<minLng) minLng=p.lng; if(p.lng>maxLng) maxLng=p.lng; }
    const bounds: [[number,number],[number,number]] = [[minLat,minLng],[maxLat,maxLng]];
    map.fitBounds(bounds as any, { padding:[50,50] });
  }, [points, map]);
  return null;
}

export default function MapPage(){
  const [places,setPlaces]=useState<Place[]>([]);
  const [cities,setCities]=useState<CityIndex[]>([]);
  const [topics,setTopics]=useState<any[]>([]);
  const [loading,setLoading]=useState(true);
  const [error,setError]=useState<string|null>(null);
  const [filtersOpen,setFiltersOpen]=useState(false);

  const router=useRouter(); const pathname=usePathname(); const params=useSearchParams();
  const availableCoins=(process.env.NEXT_PUBLIC_AVAILABLE_COINS??'BTC,ETH,USDT,USDC').split(',').map(s=>s.trim()).filter(Boolean);
  const [flt,setFlt]=useState({ coins:new Set<string>(availableCoins), categories:new Set<string>(), city: null as string|null });

  // Configure Leaflet icons on client only
  useEffect(()=>{ (async()=>{ const L = (await import('leaflet')).default;
    L.Icon.Default.mergeOptions({ iconRetinaUrl:'/leaflet/marker-icon-2x.png', iconUrl:'/leaflet/marker-icon.png', shadowUrl:'/leaflet/marker-shadow.png' });
  })(); },[]);

  useEffect(()=>{ (async()=>{ try{ const [idx,all,top] = await Promise.all([loadIndex(), loadAllPlaces(), fetch('/data/news/topics.json').then(r=>r.json()).then(j=>j.topics)]);
      setCities(idx.cities); setPlaces(all); setTopics(top);
    } catch(e:any){ console.error(e); setError(e?.message??'Failed to load'); } finally{ setLoading(false);} })(); },[]);

  // URL -> filter
  useEffect(()=>{
    const coinsParam = params.get('coins');
    let coinsSet = new Set<string>(availableCoins);
    if (coinsParam) {
      const wanted = coinsParam.split(',').map(s=>s.trim().toUpperCase()).filter(Boolean);
      const valid = wanted.filter(w => availableCoins.includes(w));
      if (valid.length) coinsSet = new Set(valid);
    }
    const cityParam = params.get('city');
    let city: string | null = null;
    if (cityParam && cities.length) {
      const hit = cities.find(c => c.city.toLowerCase() === cityParam.toLowerCase() || norm(c.city) === norm(cityParam));
      if (hit) city = hit.city;
    }
    setFlt(prev => ({ ...prev, coins: coinsSet, city }));
  }, [params, cities.length]);

  // filter -> URL
  useEffect(()=>{
    const q = new URLSearchParams(params.toString());
    const cs = Array.from(flt.coins.values());
    if (cs.length && cs.length < availableCoins.length) q.set('coins', cs.join(',')); else q.delete('coins');
    if (flt.city) q.set('city', flt.city); else q.delete('city');
    router.replace(`${pathname}?${q.toString()}`, { scroll:false });
  }, [flt.coins, flt.city]);

  const selectedId=params.get('select');
  const fromTopic=params.get('fromTopic')||'';
  const selected=useMemo(()=> (selectedId? places.find(p=>p.id===selectedId) ?? null : null), [selectedId,places]);

  const tileURL=process.env.NEXT_PUBLIC_MAP_TILES_URL ?? 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
  const tileAttr=process.env.NEXT_PUBLIC_MAP_ATTRIBUTION ?? '© OpenStreetMap contributors';

  const openPlace=(id:string)=>{ const q=new URLSearchParams(params.toString()); q.set('select', id); router.push(`${pathname}?${q.toString()}`, {scroll:false}); };
  const closePanel=()=>{ const q=new URLSearchParams(params.toString()); q.delete('select'); router.push(`${pathname}?${q.toString()}`, {scroll:false}); };

  const filtered=useMemo(()=> places.filter(p=>{
    if(!flt.coins.size) return false;
    const coinOK=p.coins?.some(c=>flt.coins.has(c)) ?? false;
    const catOK=flt.categories.size ? flt.categories.has(p.category) : true;
    const cityOK=flt.city ? p.city?.toLowerCase() === flt.city.toLowerCase() : true;
    return coinOK && catOK && cityOK;
  }), [places, flt]);

  return (
    <div style={{height:'calc(100vh - 52px)',width:'100%',position:'relative'}}>
      <MapContainer center={[20,0]} zoom={2} style={{height:'100%',width:'100%'}}>
        <TileLayer url={tileURL} attribution={tileAttr}/>
        {!loading && <ClusterLayer points={filtered} onSelect={openPlace}/>}
        {!loading && filtered.length>0 && <FitToData points={filtered}/>}
      </MapContainer>

      <div style={{position:'absolute',top:64,left:12,display:'flex',gap:8,zIndex:1200}}>
        <button onClick={()=>setFiltersOpen(v=>!v)} className="badge">Filters</button>
        {flt.city && <span className="badge">City: {flt.city}</span>}
        {flt.coins.size && flt.coins.size < availableCoins.length && <span className="badge">Coins: {Array.from(flt.coins).join(',')}</span>}
      </div>

      {fromTopic && (<a href={`/discover?tab=news`} style={{position:'absolute',top:64,right:12,zIndex:1200}} className="badge">
        From topic ↩
      </a>)}

      {filtersOpen && (<FilterPanel coins={availableCoins} categories={ALL_CATEGORIES} cities={cities} value={flt} onChange={setFlt} onClose={()=>setFiltersOpen(false)}/>)}
      {!loading && selected && (<PlacePanel place={selected} all={filtered} mapCenter={[20,0]} onClose={closePanel} onSelect={openPlace}/> )}

      {loading && (<div style={{position:'absolute',inset:0,display:'grid',placeItems:'center',pointerEvents:'none',fontSize:14,color:'#555'}}>Loading places…</div>)}
      {error && (<div style={{position:'absolute',top:80,left:120,padding:'8px 10px',background:'#fff',border:'1px solid #ddd',borderRadius:8,boxShadow:'0 2px 10px rgba(0,0,0,.06)',fontSize:13,zIndex:1200}}>Failed to load data: {error}</div>)}
    </div>
  );
}
