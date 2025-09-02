'use client';
import * as React from 'react';
import Supercluster from 'supercluster';
import L from 'leaflet';
import { useMap, Marker, Popup } from 'react-leaflet';
import type { Place } from '@/utils/loadPlaces';
export default function ClusterLayer({ points, onSelect }: { points: Place[]; onSelect:(id:string)=>void; }) {
  const map = useMap(); const [clusters,setClusters]=React.useState<any[]>([]);
  const index = React.useMemo(()=>{ const feats = points.map(p=>({ type:'Feature', geometry:{type:'Point',coordinates:[p.lng,p.lat]},
    properties:{ cluster:false, id:p.id, name:p.name, category:p.category, coins:p.coins, city:p.city, country:p.country, last_verified:p.last_verified } }));
    const sc = new Supercluster({ radius:60, maxZoom:18 }); sc.load(feats as any); return sc; },[points]);
  const update = React.useCallback(()=>{ const b=map.getBounds(), zoom=map.getZoom();
    const cs=index.getClusters([b.getWest(),b.getSouth(),b.getEast(),b.getNorth()] as any, Math.round(zoom)); setClusters(cs); },[map,index]);
  React.useEffect(()=>{ update(); map.on('moveend zoomend', update); return ()=>{ map.off('moveend zoomend', update); }; },[map,update]);
  const badge = (n:number)=>L.divIcon({ html:`<div style="background:#2563eb;color:#fff;border-radius:999px;border:2px solid #eff6ff;width:36px;height:36px;display:grid;place-items:center;font-weight:700">${n}</div>`,
    className:'cluster-badge', iconSize:[36,36] });
  return (<>{clusters.map((c:any)=>{ const [lng,lat]=c.geometry.coordinates; const {cluster:isc, point_count}=c.properties;
    if(isc){ const id=c.properties.cluster_id; return (<Marker key={`c-${id}`} position={[lat,lng]} icon={badge(point_count)} eventHandlers={{click:()=>{
      const z=index.getClusterExpansionZoom(id); (map as any).setView([lat,lng], z, {animate:true}); }}}/>); }
    return (<Marker key={c.properties.id} position={[lat,lng]} eventHandlers={{click:()=>onSelect(c.properties.id)}}>
      <Popup><b>{c.properties.name}</b><br/>{c.properties.city}{c.properties.country?`, ${c.properties.country}`:''}<br/>{c.properties.category} / {(c.properties.coins||[]).join(', ')}<br/>
      {c.properties.last_verified?`verified: ${c.properties.last_verified}`:''}<br/><br/>
      <button onClick={()=>onSelect(c.properties.id)} style={{padding:'4px 8px',borderRadius:6,border:'1px solid #ddd'}}>View details</button></Popup>
    </Marker>); })}</>); }
