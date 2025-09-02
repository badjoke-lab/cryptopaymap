'use client';
import React, { useEffect, useMemo, useState } from 'react';
type Article={ id:string; title:string; url:string; publisher:string; published_at:string; language:string; summary?:string; coins?:string[]; cities?:string[]; countries?:string[]; categories?:string[]; brands?:string[]; confidence?:number; cluster_id?:string; };
type Topic={ id:string; title:string; coins?:string[]; cities?:string[]; countries?:string[]; categories?:string[]; articles:string[]; publisher_count:number; last_seen:string; trend?:string; };
type HotTop={ topic_id:string; rank:number; score:number };
export default function NewsPage(){ const [articles,setArticles]=useState<Article[]>([]); const [topics,setTopics]=useState<Topic[]>([]); const [hot,setHot]=useState<HotTop[]>([]); const [q,setQ]=useState({coin:'',city:'',period:'30d'});
  useEffect(()=>{ Promise.all([ fetch('/data/news/articles.json').then(r=>r.json()).then(j=>j.items), fetch('/data/news/topics.json').then(r=>r.json()).then(j=>j.topics), fetch('/data/aggregates/hot-topics.json').then(r=>r.json()).then(j=>j.top) ])
    .then(([a,t,h])=>{ setArticles(a); setTopics(t); setHot(h); }); },[]);
  const filtered=useMemo(()=> articles.filter(a=> (q.coin? (a.coins||[]).includes(q.coin):true) && (q.city? (a.cities||[]).includes(q.city):true) ), [articles,q]);
  return (<div className="container"><h1>News</h1>
    <div style={{display:'flex',gap:8,flexWrap:'wrap',marginBottom:12}}>
      <label>Coin: <select value={q.coin} onChange={e=>setQ({...q,coin:e.target.value})} style={{marginLeft:6}}><option value=''>All</option><option>BTC</option><option>ETH</option><option>USDT</option><option>USDC</option></select></label>
      <label>City: <input value={q.city} onChange={e=>setQ({...q,city:e.target.value})} placeholder='e.g., Tokyo' style={{marginLeft:6,padding:'4px 6px'}}/></label>
    </div>
    <section><h2>Hot Topics</h2><div style={{display:'grid',gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))',gap:12}}>
      {hot.slice(0,10).map(h=>{ const t=topics.find(t=>t.id===h.topic_id); if(!t) return null; return (
        <a key={t.id} href={`/news?topic=${t.id}`} style={{border:'1px solid #eee',borderRadius:12,padding:12,textDecoration:'none',color:'#111'}}>
          <div style={{fontWeight:700}}>{t.title}</div><div style={{fontSize:12,color:'#666'}}>{(t.coins||[]).join(', ')} · {t.publisher_count} pubs</div>
        </a> ); })}
    </div></section>
    <section style={{marginTop:16}}><h2>Articles</h2><div style={{display:'grid',gap:10}}>
      {filtered.map(a=>(<a key={a.id} href={a.url} target='_blank' rel='noopener noreferrer' style={{border:'1px solid #eee',borderRadius:12,padding:12,textDecoration:'none',color:'#111'}}>
        <div style={{fontWeight:700}}>{a.title}</div><div style={{fontSize:12,color:'#666'}}>{a.publisher} · {new Date(a.published_at).toISOString().slice(0,10)} · {(a.coins||[]).join(', ')} {(a.cities||[]).slice(0,3).join(', ')}</div>
        {a.summary && <div style={{fontSize:14,marginTop:6}}>{a.summary}</div>}</a>))}
    </div></section></div>); }
