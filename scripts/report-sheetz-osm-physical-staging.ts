import { and, asc, eq, ilike } from 'drizzle-orm';
import { createDatabase } from '../src/db/client';
import { candidateSourceRecords, sourceCandidates, sourceRecords } from '../src/db/schema';

declare const process: { env: Record<string,string|undefined> };
const TARGET='fixed-review-staging';
type Rec=Record<string,unknown>;
const rec=(v:unknown):Rec=>v&&typeof v==='object'&&!Array.isArray(v)?v as Rec:{};
const strmap=(v:unknown):Record<string,string>=>Object.fromEntries(Object.entries(rec(v)).filter((e):e is [string,string]=>typeof e[1]==='string'));
async function main(){
  if(process.env.CPM_CANDIDATE_ACQUISITION_TARGET!==TARGET) throw new Error(`Refusing outside ${TARGET}`);
  const url=process.env.DATABASE_URL?.trim(); if(!url) throw new Error('DATABASE_URL is required.');
  const db=createDatabase(url);
  const candidates=await db.select({id:sourceCandidates.id,status:sourceCandidates.candidateStatus,duplicateGroupId:sourceCandidates.duplicateGroupId,canonicalLocationId:sourceCandidates.canonicalLocationId})
    .from(sourceCandidates)
    .where(and(eq(sourceCandidates.candidateType,'physical_place'),ilike(sourceCandidates.normalizedName,'%sheetz%')))
    .orderBy(asc(sourceCandidates.id));
  const ids=candidates.map(r=>r.id);
  const relations=ids.length===0?[]:await db.select({candidateId:candidateSourceRecords.candidateId,relationship:candidateSourceRecords.relationship,rawPayload:sourceRecords.rawPayload})
    .from(candidateSourceRecords).innerJoin(sourceRecords,eq(sourceRecords.id,candidateSourceRecords.sourceRecordId))
    .where(eq(candidateSourceRecords.relationship,'origin'));
  const origins=new Map(relations.filter(r=>ids.includes(r.candidateId)).map(r=>[r.candidateId,r.rawPayload]));
  const counts={total:candidates.length,unblocked:0,duplicateGrouped:0,promoted:0,canonicalLinked:0,withOrigin:0,bitcoin:0,lightning:0,bitcoinOrLightning:0,bitcoinAndLightning:0,usDirect:0,withGeometry:0,distinctOsm:0};
  const osm=new Set<string>();
  for(const c of candidates){
    if(c.duplicateGroupId===null) counts.unblocked++; else counts.duplicateGrouped++;
    if(c.status==='promoted') counts.promoted++;
    if(c.canonicalLocationId) counts.canonicalLinked++;
    const payload=rec(origins.get(c.id)); if(Object.keys(payload).length===0) continue; counts.withOrigin++;
    const seed=rec(payload.reviewSeed); const element=rec(payload.element); const tags=strmap(element.tags); const payment=strmap(seed.paymentTags);
    const btc=['yes','only'].includes((payment['payment:bitcoin']??tags['payment:bitcoin']??'').toLowerCase());
    const ln=['yes','only'].includes((payment['payment:lightning']??tags['payment:lightning']??'').toLowerCase());
    if(btc) counts.bitcoin++; if(ln) counts.lightning++; if(btc||ln) counts.bitcoinOrLightning++; if(btc&&ln) counts.bitcoinAndLightning++;
    if((tags['addr:country']??'').trim().toUpperCase()==='US') counts.usDirect++;
    const center=rec(element.center); const lat=typeof element.lat==='number'?element.lat:typeof center.lat==='number'?center.lat:null; const lon=typeof element.lon==='number'?element.lon:typeof center.lon==='number'?center.lon:null; if(lat!==null&&lon!==null) counts.withGeometry++;
    if(typeof element.type==='string'&&typeof element.id==='number') osm.add(`${element.type}:${element.id}`);
  }
  counts.distinctOsm=osm.size;
  console.log(JSON.stringify({...counts,readOnly:true,candidatePayloadExposed:false}));
}
await main();