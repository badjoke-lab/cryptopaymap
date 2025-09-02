'use client';
import React, { useEffect, useMemo, useState } from 'react';
import { formatDistance, buildNavLinks, haversineMeters } from '@/utils/geo';
import type { Place } from '@/utils/loadPlaces';

function distance(a:[number,number], b:[number,number]){ return haversineMeters(a,b); }

export default function PlacePanel({ place, all, mapCenter, onClose, onSelect }:
  { place:Place; all:Place[]; mapCenter:[number,number]; onClose:()=>void; onSelect:(id:string)=>void; }) {
  const [origin,setOrigin]=useState<[number,number]|null>(null);
  const [justOpened,setJustOpened]=useState(true);
  const [isMobile,setIsMobile]=useState(false);
  const [copied,setCopied]=useState(false);

  useEffect(()=>{ setIsMobile(typeof window!=='undefined' && window.innerWidth<768); const t=setTimeout(()=>setJustOpened(false),220); return ()=>clearTimeout(t); },[]);
  useEffect(()=>{ let m=true; if('geolocation' in navigator){ navigator.geolocation.getCurrentPosition(
      pos=>m&&setOrigin([pos.coords.latitude,pos.coords.longitude]), ()=>m&&setOrigin(mapCenter), {enableHighAccuracy:true,timeout:5000}); } else setOrigin(mapCenter);
    return ()=>{m=false}; },[mapCenter]);
  useEffect(()=>{ const onKey=(e:KeyboardEvent)=>{ if(e.key==='Escape'){ e.stopPropagation(); onClose(); } }; window.addEventListener('keydown', onKey);
    return ()=>window.removeEventListener('keydown', onKey); }, [onClose]);

  const nearby = useMemo(()=>{ const here:[number,number]=[place.lat,place.lng]; return all.filter(p=>p.id!==place.id)
    .map(p=>({p,d:distance(here,[p.lat,p.lng])})).sort((a,b)=>a.d-b.d).slice(0,5); },[place,all]);
  const links = origin ? buildNavLinks(origin,[place.lat,place.lng]) : null;

  const overlayPointer = ()=>{ if(justOpened) return; onClose(); };
  const stopAll = (e: any)=>e.stopPropagation();
  const panelStyle:any = isMobile ? { position:'absolute',left:0,right:0,bottom:0,height:'60%',background:'#fff',borderTopLeftRadius:16,borderTopRightRadius:16,
    boxShadow:'0 -8px 30px rgba(0,0,0,.15)',padding:16,overflowY:'auto',zIndex:1200 } :
    { position:'absolute',top:52,right:0,height:'calc(100vh - 52px)',width:'min(440px,92vw)',background:'#fff',boxShadow:'-8px 0 30px rgba(0,0,0,.15)',
      padding:16,overflowY:'auto',zIndex:1200 };

  async function onShare(){
    try{
      const url = window.location.href;
      await navigator.clipboard.writeText(url);
      setCopied(true); setTimeout(()=>setCopied(false), 1200);
    }catch{}
  }

  return (<>
    <div onPointerDown={overlayPointer} style={{position:'absolute',inset:0,background:'rgba(0,0,0,.25)',backdropFilter:'blur(2px)',zIndex:1100}} aria-hidden/>
    <aside role="dialog" aria-modal="true" onClick={stopAll} onPointerDown={stopAll} style={panelStyle}>
      <div style={{display:'flex',justifyContent:'space-between',gap:8}}>
        <h2 style={{fontSize:18,fontWeight:700,lineHeight:1.2}}>{place.name}</h2>
        <div style={{display:'flex',gap:8,alignItems:'center'}}>
          <button onClick={onShare} title="Copy link" className="badge">Share</button>
          <button onClick={onClose} aria-label="Close" style={{fontSize:20,lineHeight:1,border:'none',background:'transparent',cursor:'pointer'}}>×</button>
        </div>
      </div>
      {copied && <div className="badge" style={{marginTop:6}}>Link copied</div>}
      <div style={{color:'#555',marginTop:4}}>{place.city}{place.country?`, ${place.country}`:''}</div>
      <div style={{marginTop:8,display:'flex',gap:8,flexWrap:'wrap'}}>
        <span className="badge">{place.category}</span>
        {(place.coins||[]).map(c=>(<span key={c} className="badge">{c}</span>))}
        {place.last_verified && (<span className="badge">verified: {place.last_verified}</span>)}
      </div>
      {place.address && (<div style={{marginTop:12,fontSize:14}}><b>Address: </b>{place.address} <button onClick={()=>navigator.clipboard?.writeText(place.address!)} style={{fontSize:12,marginLeft:6}}>copy</button></div>)}
      {place.website && (<div style={{marginTop:6,fontSize:14}}><a href={place.website} target="_blank" rel="noopener noreferrer">Website ↗</a></div>)}
      <div style={{marginTop:16}}>
        <div style={{fontWeight:600,marginBottom:6}}>Navigate</div>
        <div style={{display:'flex',gap:8,flexWrap:'wrap'}}>
          <a href={links?.google ?? '#'} target="_blank" rel="noopener noreferrer" className="badge">Google</a>
          <a href={links?.apple ?? '#'} target="_blank" rel="noopener noreferrer" className="badge">Apple</a>
          <a href={links?.osm ?? '#'} target="_blank" rel="noopener noreferrer" className="badge">OSM</a>
        </div>
      </div>
      <div style={{marginTop:18}}>
        <div style={{fontWeight:600,marginBottom:6}}>Nearby (top 5)</div>
        <ul style={{listStyle:'none',padding:0,margin:0,display:'grid',gap:8}}>
          {nearby.map(({p,d})=>(<li key={p.id}><button onClick={()=>onSelect(p.id)} style={{padding:10, border:'1px solid #eee', borderRadius:10, background:'#fff', width:'100%', textAlign:'left', cursor:'pointer'}}>
            <div style={{fontWeight:600}}>{p.name}</div>
            <div style={{fontSize:12,color:'#666'}}>{p.category} · {formatDistance(d)} · {(p.coins||[]).slice(0,3).join(', ')}</div>
          </button></li>))}
        </ul>
      </div>
    </aside>
  </>); }
