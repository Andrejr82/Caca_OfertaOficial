'use strict';
const cfg=require('./trend-radar-v4-config.cjs');
const d=require('./trend-radar-v4-domain.cjs');
function normalizeHistorySeries(value){const rows=Array.isArray(value)?value:(value&&typeof value==='object'?[value]:[]);return rows.filter(Boolean).map(x=>({sales:d.num(x.sales??x.current_sales),rank:d.num(x.rank??x.current_rank),observedAt:x.observedAt||x.observed_at||null,rankAuthoritative:x.rankAuthoritative===true||x.rank_authoritative===true})).filter(x=>x.observedAt);}
function chooseBaseline(history,currentAt,metric){const currentMs=new Date(currentAt).getTime();if(!Number.isFinite(currentMs))return null;const eligible=history.map(row=>({...row,ageHours:(currentMs-new Date(row.observedAt).getTime())/3600000})).filter(row=>Number.isFinite(row.ageHours)&&row.ageHours>0&&row.ageHours<=cfg.HISTORY_LOOKBACK_HOURS&&d.num(row[metric])!==null);const byClosest=(rows,target)=>rows.slice().sort((a,b)=>Math.abs(a.ageHours-target)-Math.abs(b.ageHours-target)||b.ageHours-a.ageHours)[0]||null;let pool=eligible.filter(x=>x.ageHours>=cfg.PREFERRED_BASELINE_MIN_HOURS&&x.ageHours<=cfg.PREFERRED_BASELINE_MAX_HOURS);if(pool.length)return{...byClosest(pool,24),tier:'preferred'};pool=eligible.filter(x=>x.ageHours>=cfg.MIN_BASELINE_GAP_HOURS&&x.ageHours<=cfg.RECENT_BASELINE_MAX_HOURS);if(pool.length)return{...byClosest(pool,24),tier:'recent'};pool=eligible.filter(x=>x.ageHours>cfg.RECENT_BASELINE_MAX_HOURS&&x.ageHours<=cfg.HISTORY_LOOKBACK_HOURS);if(pool.length)return{...byClosest(pool,168),tier:'fallback'};return null;}
function calculateTemporal(candidate={},historyValue=null){const history=normalizeHistorySeries(historyValue),currentSales=d.num(candidate.sales??candidate.sold_quantity),currentRank=d.num(candidate.rank??candidate.currentRank??candidate.sourcePosition),currentAt=candidate.observedAt||new Date().toISOString(),salesBase=chooseBaseline(history,currentAt,'sales'),authoritativeRank=d.isAuthoritativeRank(candidate),rankBase=authoritativeRank?chooseBaseline(history.filter(x=>x.rankAuthoritative!==false),currentAt,'rank'):null,previousSales=d.num(salesBase?.sales),salesHours=salesBase?.ageHours??null,salesDelta=currentSales!==null&&previousSales!==null?currentSales-previousSales:null,growthPct=salesDelta!==null&&previousSales>0?(salesDelta/previousSales)*100:null,salesVelocity=salesDelta!==null&&salesHours>0?salesDelta/salesHours:null,salesVelocityPerDay=salesVelocity!==null?salesVelocity*24:null,dailyizedGrowthPct=growthPct!==null&&salesHours>0?(growthPct/salesHours)*24:null,previousRank=d.num(rankBase?.rank),rankHours=rankBase?.ageHours??null,rankDelta=authoritativeRank&&currentRank!==null&&previousRank!==null?previousRank-currentRank:null,baselineStatus=salesBase||rankBase?'usable':history.length?'no_usable_window':'no_history';return{currentSales,previousSales,salesDelta,growthPct,salesVelocity,salesVelocityPerDay,dailyizedGrowthPct,currentRank,previousRank,rankDelta,hours:salesHours??rankHours,salesHours,rankHours,authoritativeRank,salesBaselineTier:salesBase?.tier||null,rankBaselineTier:rankBase?.tier||null,salesBaselineObservedAt:salesBase?.observedAt||null,rankBaselineObservedAt:rankBase?.observedAt||null,historyObservations:history.length,baselineStatus};}
function calculateTrendEvidence(candidate={},historyValue=null){
  const temporal=calculateTemporal(candidate,historyValue);
  const scope=d.nativeTrendScope(candidate);
  const matchQuality=d.nativeMatchQuality(candidate);
  const bestSeller=d.isBestSeller(candidate);
  const crossStrongCount=Math.max(1,Number(candidate.crossStrongCount||1));
  const primaryFamily=candidate.primaryFamilyMatch!==false&&d.isPrimaryProductFamilyMatch(candidate);
  const recentSalesBaseline=['preferred','recent'].includes(temporal.salesBaselineTier);
  const recentRankBaseline=['preferred','recent'].includes(temporal.rankBaselineTier);
  const salesDeltaEvidence=recentSalesBaseline&&temporal.salesDelta!==null&&temporal.salesDelta>=50;
  const salesGrowthEvidence=recentSalesBaseline&&temporal.growthPct!==null&&temporal.growthPct>=1;
  const salesVelocityEvidence=recentSalesBaseline&&temporal.salesVelocityPerDay!==null&&temporal.salesVelocityPerDay>=20;
  const strongSalesAcceleration=salesDeltaEvidence||salesGrowthEvidence||salesVelocityEvidence;
  const sustainedSalesMomentum=temporal.salesBaselineTier==='fallback'&&temporal.salesDelta!==null&&temporal.salesDelta>=100&&temporal.dailyizedGrowthPct!==null&&temporal.dailyizedGrowthPct>=0.35&&temporal.salesVelocityPerDay!==null&&temporal.salesVelocityPerDay>=20;
  const strongRankRise=recentRankBaseline&&temporal.authoritativeRank&&temporal.rankDelta!==null&&temporal.rankDelta>=4;
  let temporalScore=0;
  if(strongSalesAcceleration) temporalScore=40;
  else if(sustainedSalesMomentum) temporalScore=20;
  else if(recentSalesBaseline&&temporal.salesVelocityPerDay>0) temporalScore=Math.min(16,6+Math.log10(1+temporal.salesVelocityPerDay)*4);
  const nativeScore=scope==='category'?25:scope==='global'?20:scope==='native'?15:0;
  const matchScore=matchQuality>0&&primaryFamily?matchQuality:0;
  const bestSellerScore=bestSeller&&primaryFamily?10:0;
  let rankScore=0;
  if(temporal.authoritativeRank&&temporal.currentRank!==null&&temporal.currentRank<=20&&primaryFamily) rankScore+=10;
  if(strongRankRise&&primaryFamily) rankScore+=Math.min(30,24+temporal.rankDelta);
  else if(recentRankBaseline&&temporal.rankDelta>0&&primaryFamily) rankScore+=Math.min(12,temporal.rankDelta*3);
  const crossScore=crossStrongCount>=2&&primaryFamily?20:0;
  const observedAt=candidate.observedAt?new Date(candidate.observedAt).getTime():Date.now();
  const ageHours=Math.max(0,(Date.now()-observedAt)/3600000);
  const freshness=ageHours<=6?10:ageHours<=24?7:ageHours<=48?4:0;
  const nativeProductCorroborated=primaryFamily&&matchQuality>0&&Boolean(scope)&&bestSeller;
  const crossMarketProductCorroborated=primaryFamily&&bestSeller&&crossStrongCount>=2;
  const fallbackMomentumCorroborated=primaryFamily&&sustainedSalesMomentum&&crossStrongCount>=2;
  const productSpecificStrong=primaryFamily&&(strongSalesAcceleration||strongRankRise||nativeProductCorroborated||crossMarketProductCorroborated||fallbackMomentumCorroborated);
  const score=Math.round(Math.min(100,temporalScore+nativeScore+matchScore+bestSellerScore+rankScore+crossScore+freshness)*10)/10;
  const historyAvailable=temporal.baselineStatus==='usable';
  const trending=historyAvailable&&productSpecificStrong&&score>=cfg.MIN_TREND_SCORE;
  const reasons=[];
  if(scope) reasons.push(`sinal_nativo_${scope}`);
  if(salesDeltaEvidence) reasons.push(`aumento_vendas_${temporal.salesDelta}_unidades`);
  if(salesGrowthEvidence) reasons.push(`crescimento_vendas_${temporal.growthPct.toFixed(2)}pct`);
  if(salesVelocityEvidence) reasons.push(`velocidade_vendas_${temporal.salesVelocityPerDay.toFixed(1)}_unidades_dia`);
  if(sustainedSalesMomentum) reasons.push(`momentum_vendas_${temporal.dailyizedGrowthPct.toFixed(2)}pct_dia_${temporal.salesVelocityPerDay.toFixed(1)}_unidades_dia`);
  if(strongRankRise) reasons.push(`subida_ranking_${temporal.previousRank}_para_${temporal.currentRank}`);
  if(bestSeller) reasons.push('best_seller_autoritativo');
  if(nativeProductCorroborated) reasons.push('tendencia_nativa_com_prova_do_produto');
  if(crossMarketProductCorroborated) reasons.push(`produto_corrobora_familia_em_${crossStrongCount}_marketplaces`);
  if(fallbackMomentumCorroborated) reasons.push(`momentum_historico_corrobora_${crossStrongCount}_marketplaces`);
  if(!historyAvailable) reasons.push('historico_insuficiente_para_verified');
  return{trendScore:score,trending,strongEvidence:productSpecificStrong,productSpecificStrong,strongSalesAcceleration,salesDeltaEvidence,salesGrowthEvidence,salesVelocityEvidence,sustainedSalesMomentum,strongRankRise,nativeProductCorroborated,crossMarketProductCorroborated,fallbackMomentumCorroborated,historyAvailable,reasons,temporal,scope,matchQuality,primaryFamily,breakdown:{temporal:temporalScore,native:nativeScore,matchQuality:matchScore,bestSeller:bestSellerScore,rank:rankScore,cross:crossScore,freshness}};
}
module.exports={normalizeHistorySeries,chooseBaseline,calculateTemporal,calculateTrendEvidence};
