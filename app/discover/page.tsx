'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { loadAllPlaces, type Place } from '@/utils/loadPlaces';

type Discover={ generated_at:string; window_days:number; new_arrivals:any[]; recently_verified:any[];
  hot_cities:{city:string;country:string;added_30d:number;total:number}[]; popular_categories:{category:string;count:number}[]; };
type HotTop={ topic_id:string; rank:number; score:number };
type Topic={ id:string; title:string; coins?:string[]; cities?:string[]; countries?:string[]; categories?:string[]; articles?:string[]; publisher_count:number; last_seen:string; trend?:string; score?:number; };

function countByCityCoin(places: Place[], city: string, coin: string){
  const c = city.toLowerCase();
  return places.filter(p => (p.city||'').toLowerCase()===c && (p.coins||[]).includes(coin)).length;
}

export default function DiscoverPage(){
  const params = useSearchParams();
  const tab = (params.get('tab')||'overview').toLowerCase();
  const focusTopicId = params.get('topic')||'';

  const [disc,setDisc]=useState<Discover|null>(null);
  const [hot,setHot]=useState<HotTop[]>([]);
  const [topics,setTopics]=useState<Topic[]>([]);
  const [articles,setArticles]=useState<any[]>([]);
  const [places,setPlaces]=useState<Place[]>([]);

  useEffect(()=>{ Promise.all([
    fetch('/data/aggregates/discover.json').then(r=>r.json()),
    fetch('/data/aggregates/hot-topics.json').then(r=>r.json()).then(j=>j.top||[]),
    fetch('/data/news/topics.json').then(r=>r.json()).then(j=>j.topics||[]),
    fetch('/data/news/articles.json').then(r=>r.json()).then(j=>j.items||[]),
    loadAllPlaces(),
  ]).then(([d,h,t,a,p])=>{ setDisc(d); setHot(h); setTopics(t); setArticles(a); setPlaces(p); }); }, []);

  const focusTopic = useMemo(()=> topics.find(t=>t.id===focusTopicId)||null, [topics, focusTopicId]);

  function linkForTopic(t: Topic){
    const coins = (t.coins||[]).filter(Boolean);
    const cities = (t.cities||[]).filter(Boolean);
    const combos: {city:string, coin:string, count:number}[] = [];
    for(const city of cities){
      for(const coin of coins){
        const count = countByCityCoin(places, city, coin);
        if(count>0) combos.push({ city, coin, count });
      }
    }
    if(combos.length===1){
      const { city, coin } = combos[0];
      return `/map?city=${encodeURIComponent(city)}&coins=${encodeURIComponent(coin)}&fromTopic=${encodeURIComponent(t.id)}`;
    }
    return `/discover?tab=news&topic=${encodeURIComponent(t.id)}`;
  }

  const topTopics = useMemo(()=>{
    const topicsById = new Map(topics.map(t=>[t.id,t]));
    return (hot||[]).slice(0,8).map(h=>topicsById.get(h.topic_id)).filter(Boolean) as Topic[];
  }, [hot, topics]);

  return (<div className="container">
    <h1>Discover</h1>

    {tab==='overview' && (<>
      <section style={{marginTop:16}}>
        <h2>Hot Topics</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
          {topTopics.map(t=>(
            <a key={t.id} href={linkForTopic(t)} style={{border:'1px solid #eee',borderRadius:12,padding:12,textDecoration:'none',color:'#111'}}>
              <div style={{fontWeight:700}}>{t.title}</div>
              <div style={{fontSize:12,color:'#555',marginTop:4}}>{(t.coins||[]).join(', ')} · {(t.cities||[]).slice(0,3).join(', ')}</div>
              <div style={{fontSize:12,color:'#666',marginTop:4}}>Publishers: {t.publisher_count}</div>
            </a>
          ))}
        </div>
      </section>

      <section style={{marginTop:24}}>
        <h2>Hot cities (30d)</h2>
        <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(220px,1fr))',gap:10}}>
          {disc?.hot_cities?.slice(0,8).map(c=>(
            <a key={c.city} href={`/map?city=${encodeURIComponent(c.city)}`} style={{border:'1px solid #eee',borderRadius:10,padding:10,textDecoration:'none',color:'#111'}}>
              <div style={{fontWeight:600}}>{c.city} ({c.country})</div>
              <div style={{fontSize:12,color:'#666'}}>+{c.added_30d} · total {c.total}</div>
            </a>
          ))}
        </div>
      </section>
    </>)}
  </div>);
}
