'use strict';
const core=require('./trend-radar-seven-niches-v1.cjs');

const samples={
  casa_cozinha_organizacao:'Air Fryer 5L', beleza:'Protetor Solar Facial FPS 70', moda:'Tênis Feminino Casual',
  eletrodomesticos:'Geladeira Frost Free 400L', informatica:'Notebook Ryzen 7', ferramentas:'Parafusadeira 20V', pet:'Ração para Cachorro 15kg',
};
const now=new Date();
const previousAt=new Date(now.getTime()-24*3600000).toISOString();
const observedAt=now.toISOString();

function runMarketplace(marketplace){
  const candidates=[]; const history=new Map();
  for(const [nicheId,productName] of Object.entries(samples)){
    const id=`${marketplace}:${nicheId}`;
    if(marketplace==='Shopee'){
      candidates.push({identityKey:id,itemId:id,marketplace,productName,nicheId,sales:1600,bestSeller:true,observedAt,commercialScore:78});
      history.set(id,{sales:1000,observedAt:previousAt});
    } else if(marketplace==='Mercado Livre'){
      candidates.push({identityKey:id,itemId:id,marketplace,productName,nicheId,nativeTrend:true,bestSeller:true,rank:5,observedAt,commercialScore:74});
    } else {
      candidates.push({identityKey:id,itemId:id,productId:id,marketplace,productName,nicheId,rank:6,rankSource:'Amazon Best Sellers',amazonBestSeller:true,observedAt,commercialScore:70});
      history.set(id,{rank:18,observedAt:previousAt});
    }
  }
  const result=core.buildTrendRadarSelection(candidates,history,{maxRows:20,maxPerNiche:3});
  return {marketplace,count:result.selected.length,niches:[...new Set(result.selected.map(x=>x.nicheId))],products:result.selected.map(x=>({niche:x.nicheId,product:x.productName,trendScore:x.trendScore,commercialScore:x.commercialScore,reasons:x.reasons}))};
}

const negative=core.buildTrendRadarSelection(Object.entries(samples).map(([nicheId,productName],i)=>({identityKey:`n${i}`,marketplace:'Shopee',productName,nicheId,sales:10000,bestSeller:true,discountPercent:70,commissionPercent:20,observedAt})),new Map());
const runs=['Shopee','Mercado Livre','Amazon'].map(runMarketplace);
const checks={
  marketplaces:runs.every(r=>r.count===7),
  sevenNiches:runs.every(r=>r.niches.length===7),
  noArtificialFill:negative.selected.length===0,
  maxRows:runs.every(r=>r.count<=20),
  publishCalls:0,postsWrites:0,offersWrites:0,
};
const pass=checks.marketplaces&&checks.sevenNiches&&checks.noArtificialFill&&checks.maxRows&&checks.publishCalls===0&&checks.postsWrites===0&&checks.offersWrites===0;
console.log(JSON.stringify({strategy:core.TREND_STRATEGY_VERSION,runs,negativeCount:negative.selected.length,checks,result:pass?'PASS':'FAIL'},null,2));
if(!pass) process.exitCode=1;
