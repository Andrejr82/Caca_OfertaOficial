'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../trend-radar-seven-niches-authoritative.cjs');
const {createAuthoritativeRadarRunner,buildMercadoLivreKeywords}=require('../oracle-trends-radar-runner-seven-niches.cjs');

const niches={
  casa_cozinha_organizacao:{name:'Casa',coreProducts:['cafeteira','organizador'],expansionProducts:['air fryer'],guardrails:{allowedProductTerms:['cafeteira','organizador','air fryer'],blockedProductTerms:[]}},
  beleza:{name:'Beleza',coreProducts:['serum','depilador'],expansionProducts:['shampoo'],guardrails:{allowedProductTerms:['serum','depilador','shampoo'],blockedProductTerms:[]}},
  moda:{name:'Moda',coreProducts:['tenis feminino','tenis masculino'],expansionProducts:['bolsa'],guardrails:{allowedProductTerms:['tenis feminino','tenis masculino','bolsa'],blockedProductTerms:['bolsa de transporte']}},
  eletrodomesticos:{name:'Eletro',coreProducts:['geladeira','ar condicionado'],expansionProducts:['freezer'],guardrails:{allowedProductTerms:['geladeira','ar condicionado','freezer'],blockedProductTerms:['transformador']}},
  informatica:{name:'Informática',coreProducts:['notebook','monitor'],expansionProducts:['computador'],guardrails:{allowedProductTerms:['notebook','monitor','computador'],blockedProductTerms:['cartao de memoria']}},
  ferramentas:{name:'Ferramentas',coreProducts:['furadeira','parafusadeira'],expansionProducts:['lixadeira'],guardrails:{allowedProductTerms:['furadeira','parafusadeira','lixadeira'],blockedProductTerms:[]}},
  pet:{name:'Pet',coreProducts:['racao para gato','caixa de areia'],expansionProducts:['arranhador'],guardrails:{allowedProductTerms:['racao para gato','caixa de areia','arranhador'],blockedProductTerms:[]}},
};

test('ML keywords derive only from canonical niches',()=>{
 const terms=buildMercadoLivreKeywords(niches);
 assert.ok(terms.includes('notebook'));
 assert.ok(terms.includes('racao para gato'));
 assert.equal(terms.includes('smart TV 4K'),false);
});

test('authoritative runner scans 3 marketplaces and never publishes',async()=>{
 let shopeeCalls=0,mlCalls=0,amazonCalls=0;
 const runner=createAuthoritativeRadarRunner({
  __skipDefaults:true,
  engine:{collectShopeeMarketplaceCandidates:async()=>[],collectMercadoLivreMarketplaceCandidates:async()=>[],enrichMercadoLivreWithHighlightsAndReviews:async(rows)=>rows},
  runtime:{enrichMercadoLivreCategoryTrends:async(rows)=>rows},amazon:{},contracts:{SHOPEE_CATEGORIES_BY_NICHE:{beleza:[1],pet:[2]}},
  nicheConfig:{COMMERCIAL_NICHES:niches},trend:core,calculateCommercialOpportunityScoreV4:()=>({total:50,breakdown:{}}),fetchImpl:async()=>{},
 });
 const result=await runner({dryRun:true,dedicatedRuntime:true,
  shopeeCollector:async()=>{shopeeCalls++;return [{marketplace:'Shopee',itemId:`s${shopeeCalls}`,shopId:'1',productName:shopeeCalls===1?'Serum Facial':'Racao para Gato',currentPrice:50,sales:100,permalink:'https://shopee.test/x',observedAt:new Date().toISOString()}];},
  mlCollector:async()=>{mlCalls++;return mlCalls===1?[{marketplace:'Mercado Livre',itemId:'m1',productName:'Notebook Acer',currentPrice:2500,permalink:'https://ml.test/x',nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_category_trends',keyword:'notebook'},observedAt:new Date().toISOString()}]:[];},
  amazonCollector:async()=>{amazonCalls++;return {products:[{asin:'B123456789',title:'Furadeira 12V',price:200,rank:4,canonical_url:'https://www.amazon.com.br/dp/B123456789',image:'https://img.test/a.jpg',marketplaceMetrics:{}}]};},
 });
 assert.equal(shopeeCalls,2); assert.ok(mlCalls>=1); assert.equal(amazonCalls,1); assert.equal(result.processed,true); assert.equal(result.verifiedTrendsCount,1); assert.ok(result.observationsCount>=2);
 assert.equal(result.publishCalls,0); assert.equal(result.postsWrites,0); assert.equal(result.offersWrites,0); assert.equal(result.sourceHealth.Amazon.status,'completed');
});

test('completion metadata is authoritative and has no legacy fill target',()=>{
 const {buildCompletionMetadata}=require('../oracle-trends-radar-runner-seven-niches.cjs');
 const metadata=buildCompletionMetadata({run:{source_health:{request_reason:'manual_refresh'}},rows:[{},{}],evaluated:[],
  selection:{verified:[{nicheId:'informatica',marketplace:'Mercado Livre',productName:'Notebook',trendScore:55}],observations:[{}]},
  health:{Shopee:{status:'completed'},'Mercado Livre':{status:'completed'},Amazon:{status:'empty'}},trend:core});
 assert.equal(metadata.sourceHealth.engine,'seven_niche_authoritative'); assert.equal(metadata.sourceHealth.strategy_version,'trend-radar-seven-niches-v2');
 assert.equal('target_products' in metadata.sourceHealth,false); assert.equal(metadata.sourceHealth.snapshot_row_cap,20); assert.equal(metadata.executiveSummary.generated_by,'oracle_radar_seven_niche_trend_engine');
});