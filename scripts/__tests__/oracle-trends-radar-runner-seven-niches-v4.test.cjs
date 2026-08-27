'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../trend-radar-seven-niches-v4.cjs');
const {createV4RadarRunner,buildCompletionMetadata}=require('../oracle-trends-radar-runner-seven-niches-v4.cjs');
const now='2026-08-27T02:19:19.683Z';
const previous=new Map([['Shopee:s1',[{sales:1000,observedAt:'2026-08-26T02:19:19.683Z'}]]]);
const niches={
 beleza:{name:'Beleza',coreProducts:['serum'],expansionProducts:[],guardrails:{allowedProductTerms:['serum'],blockedProductTerms:[]}},
 eletrodomesticos:{name:'Eletro',coreProducts:['geladeira'],expansionProducts:[],guardrails:{allowedProductTerms:['geladeira'],blockedProductTerms:[]}},
 informatica:{name:'Info',coreProducts:['notebook'],expansionProducts:[],guardrails:{allowedProductTerms:['notebook'],blockedProductTerms:[]}},
};

test('V4 runner scans 3 marketplaces, evaluates trend, stores all canonical observations and never publishes',async()=>{
 let ledgerRows=0,shopeeCalls=0,mlCalls=0,amazonCalls=0;
 const runner=createV4RadarRunner({
  engine:{enrichMercadoLivreWithHighlightsAndReviews:async r=>r},
  runtime:{enrichMercadoLivreCategoryTrends:async r=>r},
  amazon:{},contracts:{SHOPEE_CATEGORIES_BY_NICHE:{beleza:[1]}},nicheConfig:{COMMERCIAL_NICHES:niches},trend:core,
  history:{fetchObservationHistory:async()=>previous,persistObservationLedger:async(_c,_r,e)=>{ledgerRows=e.length;return{persisted:false,rows:e.length};}},
  calculateCommercialOpportunityScoreV4:()=>({total:50,breakdown:{}}),fetchImpl:async()=>{},
 });
 const result=await runner({dryRun:true,dedicatedRuntime:true,historyByIdentity:previous,
   shopeeCollector:async()=>{shopeeCalls++;return[{marketplace:'Shopee',itemId:'s1',productName:'Serum Facial',sales:1600,currentPrice:50,observedAt:now}]},
   mlCollector:async()=>{mlCalls++;return mlCalls===1?[{marketplace:'Mercado Livre',itemId:'m1',productName:'Geladeira EOS',currentPrice:2000,bestSeller:true,rank:4,rankSource:'Mercado Livre Highlights',rankAuthoritative:true,nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'geladeira'},observedAt:now}]:[]},
   amazonCollector:async()=>{amazonCalls++;return{products:[{asin:'A1',title:'Notebook Gamer',price:3000,rank:1,observedAt:now}],http_calls:1}},
 });
 assert.equal(shopeeCalls,1);assert.ok(mlCalls>=1);assert.equal(amazonCalls,1);
 assert.equal(result.processed,true);assert.equal(ledgerRows,3);assert.equal(result.ledgerObservationsCount,3);
 assert.equal(result.publishCalls,0);assert.equal(result.postsWrites,0);assert.equal(result.offersWrites,0);
 assert.ok(result.verifiedTrendsCount>=2);
});

test('V4 metadata reports temporal ledger contract rather than stale v2 contract',()=>{
 const map=new Map();Object.defineProperty(map,'diagnostics',{value:{rows:100,identities:80}});
 const metadata=buildCompletionMetadata({run:{source_health:{}},rows:[{}],evaluated:[],selection:{verified:[],observations:[{}]},health:{},trend:core,historyMap:map,ledger:{rows:145}});
 assert.equal(metadata.sourceHealth.engine,'seven_niche_temporal_authoritative');
 assert.equal(metadata.sourceHealth.strategy_version,'trend-radar-seven-niches-v4');
 assert.equal(metadata.sourceHealth.ledger_observation_count,145);
 assert.equal(metadata.executiveSummary.contract,'trend-radar-seven-niches/v4');
});
