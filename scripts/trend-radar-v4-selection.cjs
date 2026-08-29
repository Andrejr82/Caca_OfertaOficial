'use strict';
const cfg=require('./trend-radar-v4-config.cjs');
const d=require('./trend-radar-v4-domain.cjs');
const temporal=require('./trend-radar-v4-temporal.cjs');
function calculateCommercialScore(candidate={},peers=[],scorer=null){if(typeof scorer!=='function')return{score:d.num(candidate.commercialScore??candidate.commercial_score??candidate.score)||0,breakdown:{}};try{const result=scorer(candidate,{peers});return{score:d.num(result?.total)||0,breakdown:result?.breakdown||{},decision:result?.selection_decision||result?.decision||null};}catch(_){return{score:d.num(candidate.commercialScore??candidate.commercial_score??candidate.score)||0,breakdown:{}};}}
function isIndependentFamilySignal(item={}){if(item.primaryFamily===false||item.primaryFamilyMatch===false)return false;if(item.scope&&item.matchQuality>0)return true;if(d.isBestSeller(item))return true;if(item.strongSalesAcceleration||item.strongRankRise||item.sustainedSalesMomentum)return true;return false;}
function historyFor(previousByIdentity,identityKey,raw={}){if(!(previousByIdentity instanceof Map))return[];const rawId=String(raw.itemId||raw.productId||raw.asin||'');return previousByIdentity.get(identityKey)||previousByIdentity.get(rawId)||[];}
function latestObservation(history=[],observedAt=Date.now()){const currentMs=new Date(observedAt).getTime();return(history||[]).map(row=>({...row,observedMs:new Date(row.observedAt||row.observed_at||0).getTime()})).filter(row=>Number.isFinite(row.observedMs)&&row.observedMs<=currentMs).sort((a,b)=>b.observedMs-a.observedMs)[0]||null;}
function hasSignificantNewEvidence(item={}){return item.strongSalesAcceleration===true||item.strongRankRise===true;}
function applyRepeatGate(item,history=[]){const latest=latestObservation(history,item.observedAt||Date.now());if(!latest)return{...item,repeatBlocked:false};const ageHours=(new Date(item.observedAt||Date.now()).getTime()-latest.observedMs)/3600000;const repeatBlocked=ageHours>=0&&ageHours<cfg.REPEAT_COOLDOWN_HOURS&&!hasSignificantNewEvidence(item);return{...item,repeatBlocked,repeatObservationAgeHours:ageHours};}
function evaluateCandidates(candidates=[],previousByIdentity=new Map(),{niches=null,commercialScorer=null}={}){
  const canonical=[];
  for(const raw of Array.isArray(candidates)?candidates:[]){
    const classification=d.classifyCanonicalNiche(raw,niches);
    if(!classification){canonical.push({...raw,evidenceStatus:'rejected',rejectionReasons:['niche_or_family_not_verified'],trending:false,trendScore:0,commercialScore:0});continue;}
    const identityKey=d.resolveIdentity(raw),contract=d.validateCommercialContract(raw),history=historyFor(previousByIdentity,identityKey,raw),base={...raw,...classification,identityKey,primaryFamilyMatch:true};
    if(!contract.valid){canonical.push({...base,evidenceStatus:'rejected',rejectionReasons:contract.reasons,trending:false,trendScore:0,commercialScore:0,commercialGate:contract});continue;}
    canonical.push({...base,...temporal.calculateTrendEvidence(base,history),commercialGate:contract});
  }
  const validCanonical=canonical.filter(item=>item.evidenceStatus!=='rejected');
  const familySignals=new Map();
  for(const item of validCanonical.filter(isIndependentFamilySignal)){const family=`${item.nicheId}:${item.matchedTerm}`,set=familySignals.get(family)||new Set();set.add(item.marketplace);familySignals.set(family,set);}
  const evaluated=canonical.map(item=>{
    if(item.evidenceStatus==='rejected')return item;
    const family=`${item.nicheId}:${item.matchedTerm}`,crossStrongCount=familySignals.get(family)?.size||1,history=historyFor(previousByIdentity,item.identityKey,item),retrended=temporal.calculateTrendEvidence({...item,crossStrongCount,primaryFamilyMatch:true},history),commercial=calculateCommercialScore(item,validCanonical,commercialScorer),gated=applyRepeatGate({...item,...retrended,crossStrongCount,commercialScore:commercial.score,commercialBreakdown:commercial.breakdown,commercialDecision:commercial.decision||null},history);
    return{...gated,evidenceStatus:gated.trending&&!gated.repeatBlocked?'verified':'partial',rejectionReasons:gated.repeatBlocked?['repeat_cooldown_without_significant_new_evidence']:[]};
  });
  return evaluated;
}
function selectSnapshot(evaluated=[],{maxRows=cfg.MAX_SNAPSHOT_ROWS,maxVerifiedPerNiche=cfg.MAX_VERIFIED_PER_NICHE}={}){
  const eligible=evaluated.filter(x=>x.evidenceStatus!=='rejected');
  const verified=eligible.filter(x=>x.trending&&!x.repeatBlocked).sort((a,b)=>b.trendScore-a.trendScore||b.commercialScore-a.commercialScore);
  const selectedVerified=[],nicheCounts=new Map(),selectedIds=new Set();
  const byNiche=new Map();
  for(const item of verified){const list=byNiche.get(item.nicheId)||[];list.push(item);byNiche.set(item.nicheId,list);}
  for(const list of byNiche.values()){
    if(selectedVerified.length>=maxRows)break;
    const item=list[0];
    if(item&&!selectedIds.has(item.identityKey)){selectedVerified.push(item);selectedIds.add(item.identityKey);nicheCounts.set(item.nicheId,1);}
  }
  for(const item of verified){
    if(selectedVerified.length>=maxRows||selectedIds.has(item.identityKey))continue;
    const count=nicheCounts.get(item.nicheId)||0;
    if(count>=maxVerifiedPerNiche)continue;
    nicheCounts.set(item.nicheId,count+1);selectedVerified.push(item);selectedIds.add(item.identityKey);
  }
  selectedVerified.sort((a,b)=>b.trendScore-a.trendScore||b.commercialScore-a.commercialScore);
  const observations=[],observationNiches=new Map();
  const observationCandidates=eligible.filter(item=>!selectedIds.has(item.identityKey)&&(item.evidenceStatus==='partial'||item.repeatBlocked===true||(item.evidenceStatus===undefined&&item.trending!==true)));
  for(const item of observationCandidates.sort((a,b)=>b.trendScore-a.trendScore||b.commercialScore-a.commercialScore)){const list=observationNiches.get(item.nicheId)||[];list.push(item);observationNiches.set(item.nicheId,list);}
  const nicheIds=[...observationNiches.keys()];
  while(selectedVerified.length+observations.length<maxRows&&nicheIds.some(id=>(observationNiches.get(id)||[]).length)){for(const nicheId of nicheIds){if(selectedVerified.length+observations.length>=maxRows)break;const next=(observationNiches.get(nicheId)||[]).shift();if(next)observations.push(next);}}
  return{verified:selectedVerified,observations,rejected:evaluated.filter(x=>x.evidenceStatus==='rejected'),persisted:[...selectedVerified,...observations]};
}
module.exports={calculateCommercialScore,isIndependentFamilySignal,historyFor,evaluateCandidates,selectSnapshot};
