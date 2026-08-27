'use strict';

const HISTORY_TABLE='trend_radar_observations';
const HISTORY_LOOKBACK_DAYS=14;
const HISTORY_QUERY_LIMIT=5000;
const UPSERT_BATCH_SIZE=250;

function n(v){if(v===null||v===undefined||v==='')return null;const x=Number(v);return Number.isFinite(x)?x:null;}
function buildObservationRow(item,run,trend){
  const identityKey=trend.resolveIdentity(item),rank=n(item.rank??item.currentRank??item.sourcePosition),sales=n(item.sales??item.sold_quantity);
  return {radar_run_id:run.id,user_id:run.user_id,marketplace:String(item.marketplace||''),identity_key:identityKey,item_id:item.itemId?String(item.itemId):null,product_id:(item.productId||item.asin)?String(item.productId||item.asin):null,shop_id:item.shopId?String(item.shopId):null,product_term:String(item.productName||item.title||''),normalized_product_term:trend.normalize(item.productName||item.title||''),niche_id:item.nicheId||null,niche_label:item.nicheLabel||null,matched_product_term:item.matchedTerm||null,observed_at:item.observedAt||new Date().toISOString(),sales,rank_position:rank,rank_authoritative:trend.isAuthoritativeRank(item),best_seller_flag:trend.isBestSeller(item),native_trend_scope:item.scope||trend.nativeTrendScope(item)||null,native_trend_source:item.marketplaceTrendEvidence?.source||item.nativeTrendSource||null,native_trend_keyword:item.marketplaceTrendEvidence?.keyword||null,trend_strategy_version:trend.TREND_STRATEGY_VERSION,observation_payload:{trend_score:item.trendScore??null,commercial_score:item.commercialScore??null,product_specific_evidence:item.productSpecificStrong===true,baseline_status:item.temporal?.baselineStatus||null,reasons:item.reasons||[]}};
}
async function fetchObservationHistory(client,userId,{lookbackDays=HISTORY_LOOKBACK_DAYS,limit=HISTORY_QUERY_LIMIT,now=new Date()}={}){
  const map=new Map(); if(!client||!userId)return map; const cutoff=new Date(now.getTime()-lookbackDays*86400000).toISOString();
  const {data,error}=await client.from(HISTORY_TABLE).select('identity_key,item_id,product_id,sales,rank_position,rank_authoritative,observed_at').eq('user_id',userId).gte('observed_at',cutoff).order('observed_at',{ascending:false}).limit(limit);
  if(error)throw new Error(`Falha ao carregar histórico temporal: ${error.message}`);
  for(const row of data||[]){const entry={sales:n(row.sales),rank:n(row.rank_position),rankAuthoritative:row.rank_authoritative===true,observedAt:row.observed_at};const keys=[row.identity_key,row.item_id,row.product_id].filter(Boolean).map(String);for(const key of keys){const arr=map.get(key)||[];arr.push(entry);map.set(key,arr);}}
  Object.defineProperty(map,'diagnostics',{value:{rows:(data||[]).length,identities:new Set((data||[]).map(x=>x.identity_key)).size,lookbackDays},enumerable:false}); return map;
}
async function persistObservationLedger(client,run,evaluated,trend,{dryRun=false}={}){
  const rows=(evaluated||[]).map(item=>buildObservationRow(item,run,trend)).filter(row=>row.identity_key&&row.product_term);
  if(dryRun||!client)return{persisted:false,rows:rows.length};
  for(let i=0;i<rows.length;i+=UPSERT_BATCH_SIZE){const batch=rows.slice(i,i+UPSERT_BATCH_SIZE);const {error}=await client.from(HISTORY_TABLE).upsert(batch,{onConflict:'radar_run_id,identity_key',ignoreDuplicates:false});if(error)throw new Error(`Falha ao persistir histórico temporal: ${error.message}`);}
  return{persisted:true,rows:rows.length};
}
module.exports={HISTORY_TABLE,HISTORY_LOOKBACK_DAYS,HISTORY_QUERY_LIMIT,UPSERT_BATCH_SIZE,buildObservationRow,fetchObservationHistory,persistObservationLedger};
