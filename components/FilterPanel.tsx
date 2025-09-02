'use client';
import * as React from 'react';
import type { CityIndex } from '@/utils/loadPlaces';
export default function FilterPanel({ coins, categories, cities, value, onChange, onClose }:
  { coins:string[]; categories:string[]; cities:CityIndex[]; value:{coins:Set<string>;categories:Set<string>;city:string|null}; onChange:(v:any)=>void; onClose:()=>void; }){
  const toggle = (set:Set<string>, v:string)=>{ const n=new Set(set); if(n.has(v)) n.delete(v); else n.add(v);
    onChange({ ...value, coins: set===value.coins? n : value.coins, categories: set===value.categories? n : value.categories, city: value.city }); };
  const setCity=(c:string)=>onChange({ ...value, city: c||null });
  return (<div style={{position:'absolute',top:64,left:12,zIndex:1300,background:'#fff',border:'1px solid #ddd',borderRadius:12,padding:12,width:300,boxShadow:'0 6px 24px rgba(0,0,0,.12)'}}>
    <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:8}}><b>Filters</b><button onClick={onClose} className="badge">Close</button></div>
    <div style={{marginBottom:8}}><div style={{fontWeight:600,marginBottom:4}}>Coins</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {coins.map(c=>(<label key={c} style={{fontSize:14}}><input type="checkbox" checked={value.coins.has(c)} onChange={()=>toggle(value.coins,c)}/> {c}</label>))}
    </div></div>
    <div style={{marginBottom:8}}><div style={{fontWeight:600,marginBottom:4}}>Category</div><div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
      {categories.map(cat=>(<label key={cat} style={{fontSize:14}}><input type="checkbox" checked={value.categories.has(cat)} onChange={()=>toggle(value.categories,cat)}/> {cat}</label>))}
    </div></div>
    <div style={{marginBottom:8}}><div style={{fontWeight:600,marginBottom:4}}>City</div>
      <select value={value.city ?? ''} onChange={e=>setCity(e.target.value)} style={{width:'100%',padding:'6px',borderRadius:8,border:'1px solid #ddd'}}>
        <option value=''>All cities</option>
        {cities.map(c=>(<option key={c.path} value={c.city}>{c.city} ({c.country})</option>))}
      </select>
    </div>
    <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
      <button onClick={()=>onChange({ coins: new Set(coins), categories: new Set(), city: null })} className="badge">Reset</button>
      <button onClick={onClose} className="badge">Apply</button>
    </div>
  </div>); }
