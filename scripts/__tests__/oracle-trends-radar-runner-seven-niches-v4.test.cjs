'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../trend-radar-seven-niches-v4.cjs');
const {createV4RadarRunner,buildCompletionMetadata}=require('../oracle-trends-radar-runner-seven-niches-v4.cjs');
const now=new Date().toISOString();
const previous=new Map([['Shopee:s1',[{sales:1000,observedAt:new Date(Date.now()-24*3600000).toISOString()}]]]);
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
   shopeeCollector:async()=>{shopeeCalls++;return[{marketplace:'Shopee',itemId:'s1',productName:'Serum Facial',sales:1600,currentPrice:50,permalink:'https://shopee.com.br/product/s1',imageUrl:'https://cf.shopee.com.br/serum.jpg',observedAt:now}]},
   mlCollector:async()=>{mlCalls++;return mlCalls===1?[{marketplace:'Mercado Livre',itemId:'m1',productName:'Geladeira EOS',currentPrice:2000,permalink:'https://www.mercadolivre.com.br/geladeira-m1',imageUrl:'https://http2.mlstatic.com/geladeira.jpg',bestSeller:true,rank:4,rankSource:'Mercado Livre Highlights',rankAuthoritative:true,nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'geladeira'},observedAt:now}]:[]},
amazonCollector:async()=>{amazonCalls++;return{products:[{asin:'A1',title:'Notebook Gamer',price:3000,rank:1,canonical_url:'https://www.amazon.com.br/dp/A1',image:'https://images.amazon.com/notebook.jpg',observedAt:now}],http_calls:1}},
 });
 assert.equal(shopeeCalls,1);assert.ok(mlCalls>=1);assert.equal(amazonCalls,1);
 assert.equal(result.processed,true);assert.equal(ledgerRows,3);assert.equal(result.ledgerObservationsCount,3);
 assert.equal(result.publishCalls,0);assert.equal(result.postsWrites,0);assert.equal(result.offersWrites,0);
 assert.equal(result.verifiedTrendsCount,1);
 assert.equal(result.snapshotObservationsCount,2);
});

test('V4 metadata reports temporal ledger contract rather than stale v2 contract',()=>{
 const map=new Map();Object.defineProperty(map,'diagnostics',{value:{rows:100,identities:80}});
 const metadata=buildCompletionMetadata({run:{source_health:{}},rows:[{}],evaluated:[],selection:{verified:[],observations:[{}]},health:{},trend:core,historyMap:map,ledger:{rows:145}});
 assert.equal(metadata.sourceHealth.engine,'seven_niche_temporal_authoritative');
 assert.equal(metadata.sourceHealth.strategy_version,'trend-radar-seven-niches-v4');
 assert.equal(metadata.sourceHealth.ledger_observation_count,145);
 assert.equal(metadata.executiveSummary.contract,'trend-radar-seven-niches/v4');
});
