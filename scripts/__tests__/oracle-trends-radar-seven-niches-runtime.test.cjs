'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const runtime = require('../oracle-trends-radar-seven-niches-runtime.cjs');

const now = new Date().toISOString();

test('recência observa produto recente em vez de excluir', () => {
  const filter = runtime.createObservationAwareRecencyFilter((c) => [c.key]);
  const result = filter([{key:'x'}], new Set(['x']), new Set());
  assert.equal(result.fresh.length,1);
  assert.equal(result.observedRecentHistory.length,1);
  assert.equal(result.excludedRecentHistory.length,0);
});

test('oferta já selecionada continua excluída', () => {
  const filter = runtime.createObservationAwareRecencyFilter((c) => [c.key]);
  const result = filter([{key:'x'}], new Set(['x']), new Set(['x']));
  assert.equal(result.fresh.length,0);
  assert.equal(result.excludedExistingOffers.length,1);
});

test('Shopee usa união das categorias dos 7 nichos', () => {
  const ids = runtime.canonicalShopeeCategoryIds({SHOPEE_CATEGORIES_BY_NICHE:{a:[1,2],b:[2,3]}});
  assert.deepEqual(ids,[1,2,3]);
});

test('coletor Shopee força categorias canônicas', async () => {
  let seen;
  const collector = runtime.createShopeeSevenNicheCollector(async (o)=>{seen=o; return [];},{SHOPEE_CATEGORIES_BY_NICHE:{a:[10],b:[11]}});
  await collector({page:2});
  assert.deepEqual(seen.categoryIds,[10,11]);
  assert.equal(seen.page,2);
});

test('Amazon fora dos 7 nichos é descartada', () => {
  assert.equal(runtime.normalizeAmazonProduct({title:'Console PS5',asin:'AAAAAAAAAA',rank:1}),null);
});

test('Amazon Best Seller canônico é normalizado com rank autoritativo', () => {
  const p = runtime.normalizeAmazonProduct({title:'Notebook Lenovo',asin:'AAAAAAAAAA',rank:4,canonical_url:'https://amazon.com.br/dp/AAAAAAAAAA',marketplaceMetrics:{rating:4.8}});
  assert.equal(p.marketplace,'Amazon');
  assert.equal(p.nicheId,'informatica');
  assert.equal(p.amazonBestSeller,true);
  assert.equal(p.rankSource,'Amazon Best Sellers');
});

test('coletor Amazon usa Best Sellers e filtra nichos', async () => {
  const collect = runtime.createAmazonSevenNicheCollector(async ()=>({products:[
    {title:'Notebook X',asin:'AAAAAAAAAA',rank:3},
    {title:'Console X',asin:'BBBBBBBBBB',rank:1},
  ]}));
  const items=await collect();
  assert.equal(items.length,1);
  assert.equal(items[0].productName,'Notebook X');
});

test('ML Trends por categoria marca sinal nativo quando há match', async () => {
  const fetchImpl = async ()=>({ok:true,json:async()=>[{keyword:'notebook'}]});
  const [item] = await runtime.enrichMercadoLivreCategoryTrends([{categoryId:'MLB1',productName:'Notebook Lenovo'}],{fetchImpl});
  assert.equal(item.nativeTrend,true);
  assert.equal(item.marketplaceTrendEvidence.source,'mercadolivre_category_trends');
});

test('ML Trends global funciona como fallback oficial', async () => {
  let calls=0;
  const fetchImpl = async (url)=>{ calls++; return url.endsWith('/MLB') ? {ok:true,json:async()=>[{keyword:'notebook'}]} : {ok:true,json:async()=>[]}; };
  const [item] = await runtime.enrichMercadoLivreCategoryTrends([{categoryId:'MLB1',productName:'Notebook Lenovo'}],{fetchImpl});
  assert.equal(item.nativeTrend,true);
  assert.equal(item.marketplaceTrendEvidence.source,'mercadolivre_global_trends');
  assert.ok(calls>=2);
});

test('falha no endpoint ML Trends não elimina candidato', async () => {
  const fetchImpl = async ()=>{throw new Error('down')};
  const [item] = await runtime.enrichMercadoLivreCategoryTrends([{categoryId:'MLB1',productName:'Notebook Lenovo'}],{fetchImpl});
  assert.equal(item.productName,'Notebook Lenovo');
  assert.equal(item.nativeTrend,undefined);
});

test('builder não promove best seller parado', () => {
  const builder=runtime.createSevenNicheBuilder({legacyBuilder:()=>[],computeCandidateSalesVelocity:()=>({sales_velocity:0,sales_delta:0,previous_sales:100,current_sales:100})});
  const rows=builder({radarRunId:'r',shopeeCandidates:[{marketplace:'Shopee',itemId:'1',productName:'Notebook X',sales:100,bestSeller:true,observedAt:now}],mlCandidates:[]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].evidence_status,'partial');
  assert.equal(rows[0].direct_evidence[0].trending_flag,false);
});

test('builder promove Shopee com aceleração real', () => {
  const builder=runtime.createSevenNicheBuilder({legacyBuilder:()=>[],computeCandidateSalesVelocity:()=>({sales_velocity:500,sales_delta:500,previous_sales:100,current_sales:600})});
  const rows=builder({radarRunId:'r',shopeeCandidates:[{marketplace:'Shopee',itemId:'1',productName:'Notebook X',sales:600,bestSeller:true,observedAt:now}],mlCandidates:[]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].evidence_status,'verified');
  assert.equal(rows[0].direct_evidence[0].trending_flag,true);
});

test('builder promove Mercado Livre com trend + highlight', () => {
  const builder=runtime.createSevenNicheBuilder({legacyBuilder:()=>[],computeCandidateSalesVelocity:()=>({sales_velocity:null})});
  const rows=builder({radarRunId:'r',shopeeCandidates:[],mlCandidates:[{marketplace:'Mercado Livre',itemId:'MLB1',productName:'Notebook X',marketplaceTrendEvidence:{keyword:'notebook'},marketplaceDemandEvidence:{type:'BEST_SELLER',position:4},observedAt:now}]});
  assert.equal(rows.length,1);
  assert.ok(rows[0].trend_score>=55);
});

test('builder promove Amazon somente com histórico de rank quando não há outro sinal temporal', () => {
  const builder=runtime.createSevenNicheBuilder({legacyBuilder:()=>[],computeCandidateSalesVelocity:()=>({sales_velocity:null})});
  const rows=builder({radarRunId:'r',shopeeCandidates:[],mlCandidates:[{marketplace:'Amazon',itemId:'A',productId:'A',productName:'Notebook X',rank:6,rankSource:'Amazon Best Sellers',amazonBestSeller:true,observedAt:now}]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].evidence_status,'partial');
  assert.equal(rows[0].direct_evidence[0].trending_flag,false);
});

test('builder confirma Amazon quando rank Best Sellers sobe entre snapshots', () => {
  const builder=runtime.createSevenNicheBuilder({legacyBuilder:()=>[],computeCandidateSalesVelocity:()=>({sales_velocity:null})});
  const previous=new Map([['A',{rank:18,observedAt:new Date(Date.now()-86400000).toISOString()}]]);
  const rows=builder({radarRunId:'r',previousItemsMap:previous,shopeeCandidates:[],mlCandidates:[{marketplace:'Amazon',itemId:'A',productId:'A',productName:'Notebook X',rank:6,rankSource:'Amazon Best Sellers',amazonBestSeller:true,observedAt:now}]});
  assert.equal(rows.length,1);
  assert.equal(rows[0].direct_evidence[0].temporal_metrics.rank_delta,12);
});

test('install não publica nem cria ofertas; apenas substitui funções do engine', () => {
  const freshness={getCandidateIdentityKeys:()=>[],filterCandidatesWithRecency:()=>{}};
  const engine={collectShopeeMarketplaceCandidates:async()=>[],collectMercadoLivreMarketplaceCandidates:async()=>[],buildTrendRadarProductsFromCandidates:()=>[],computeCandidateSalesVelocity:()=>({})};
  runtime.installSevenNicheRuntime({freshness,engine,marketplaceContracts:{},amazonModule:{runAmazonNativeTop20:async()=>({products:[]})},fetchImpl:async()=>({ok:false})});
  assert.equal(typeof engine.collectShopeeMarketplaceCandidates,'function');
  assert.equal(engine.publish,undefined);
  assert.equal(engine.createOffer,undefined);
});
