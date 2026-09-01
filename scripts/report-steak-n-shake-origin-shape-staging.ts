import { and, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string,string|undefined> };
const TARGET='fixed-review-staging';
type Rec=Record<string,unknown>;
const rec=(v:unknown):Rec=>v&&typeof v==='object'&&!Array.isArray(v)?v as Rec:{};
const num=(v:unknown)=>typeof v==='number'&&Number.isFinite(v)?v:null;
async function main(){
  if(process.env.CPM_CANDIDATE_ACQUISITION_TARGET!==TARGET) throw new Error(`Refusing outside ${TARGET}`);
  const url=process.env.DATABASE_URL?.trim(); if(!url) throw new Error('DATABASE_URL is required.');
  const db=createDatabase(url);
  const rows=await db.select({candidateId:sourceCandidates.id,rawPayload:sourceRecords.rawPayload})
    .from(sourceCandidates)
    .innerJoin(candidateSourceRecords,eq(candidateSourceRecords.candidateId,sourceCandidates.id))
    .innerJoin(sourceRecords,eq(sourceRecords.id,candidateSourceRecords.sourceRecordId))
    .where(and(eq(sourceCandidates.candidateType,'physical_place'),ilike(sourceCandidates.normalizedName,'%steak%n%shake%'),eq(candidateSourceRecords.relationship,'origin')));
  const unique=new Map(rows.map(r=>[r.candidateId,r]));
  const counts={total:unique.size,elementLatLon:0,elementCenter:0,rootLatLon:0,rootLatitudeLongitude:0,normalizedLatLon:0,normalizedLatitudeLongitude:0,nameElement:0,nameNormalized:0};
  for(const row of unique.values()){
    const root=rec(row.rawPayload); const normalized=rec(root.normalizedRecord); const element=rec(root.element??root.rawRecord??normalized??root); const center=rec(element.center);
    if(num(element.lat)!==null&&num(element.lon)!==null) counts.elementLatLon++;
    if(num(center.lat)!==null&&num(center.lon)!==null) counts.elementCenter++;
    if(num(root.lat)!==null&&num(root.lon)!==null) counts.rootLatLon++;
    if(num(root.latitude)!==null&&num(root.longitude)!==null) counts.rootLatitudeLongitude++;
    if(num(normalized.lat)!==null&&num(normalized.lon)!==null) counts.normalizedLatLon++;
    if(num(normalized.latitude)!==null&&num(normalized.longitude)!==null) counts.normalizedLatitudeLongitude++;
    if(typeof rec(element.tags).name==='string') counts.nameElement++;
    if(typeof normalized.name==='string') counts.nameNormalized++;
  }
  console.log(JSON.stringify({...counts,readOnly:true,candidatePayloadExposed:false}));
}
await main();
