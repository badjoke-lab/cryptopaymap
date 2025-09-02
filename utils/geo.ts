export function haversineMeters(a:[number,number], b:[number,number]){
  const R=6371e3; const toRad=(d:number)=>d*Math.PI/180;
  const [lat1,lon1]=a,[lat2,lon2]=b;
  const dLat=toRad(lat2-lat1), dLon=toRad(lon2-lon1);
  const s1=Math.sin(dLat/2)**2; const s2=Math.cos(toRad(lat1))*Math.cos(toRad(lat2))*Math.sin(dLon/2)**2;
  return 2*R*Math.asin(Math.sqrt(s1+s2));
}
export function formatDistance(m:number){ if(m<50) return '<50 m'; if(m<1000) return `${Math.round(m)} m`; return `${(m/1000).toFixed(1)} km`; }
export function buildNavLinks(o:[number,number], d:[number,number]){
  const os=`${o[0]},${o[1]}`, ds=`${d[0]},${d[1]}`;
  return { google:`https://www.google.com/maps/dir/?api=1&origin=${os}&destination=${ds}&travelmode=walking`,
           apple:`https://maps.apple.com/?saddr=${os}&daddr=${ds}&dirflg=w`,
           osm:`https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${os};${ds}` };
}
