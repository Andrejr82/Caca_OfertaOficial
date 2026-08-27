'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../trend-radar-seven-niches-authoritative.cjs');

const niches = {
  beleza:{name:'Beleza',guardrails:{allowedProductTerms:['serum','depilador'],blockedProductTerms:[]}},
  moda:{name:'Moda',guardrails:{allowedProductTerms:['bolsa','tenis feminino','tenis masculino'],blockedProductTerms:['bolsa de transporte']}},
  eletrodomesticos:{name:'Eletrodomésticos',guardrails:{allowedProductTerms:['geladeira','ar condicionado','freezer','microondas'],blockedProductTerms:['transformador','adaptador de voltagem','conversor de voltagem']}},
  informatica:{name:'Informática',guardrails:{allowedProductTerms:['notebook','monitor','computador'],blockedProductTerms:['cartao de memoria']}},
  casa_cozinha_organizacao:{name:'Casa',guardrails:{allowedProductTerms:['organizador','cafeteira'],blockedProductTerms:[]}},
  ferramentas:{name:'Ferramentas',guardrails:{allowedProductTerms:['furadeira','parafusadeira'],blockedProductTerms:[]}},
  pet:{name:'Pet',guardrails:{allowedProductTerms:['racao para gato','caixa de areia'],blockedProductTerms:[]}},
};

test('real snapshot false positives are rejected', () => {
  assert.equal(core.classifyCanonicalNiche({productName:'190cm Tripé Câmera Profissional com Bolsa de Transporte'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'Transformador 7000va para Ar Condicionado Geladeira Freezer'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'Kit 2 Cartão De Memória 128gb Câmera Notebook Wifi Ultra Hd'}, niches), null);
});

test('canonical products route correctly', () => {
  assert.equal(core.classifyCanonicalNiche({productName:'Notebook Acer Aspire 5 8GB 512GB SSD'}, niches).nicheId, 'informatica');
  assert.equal(core.classifyCanonicalNiche({productName:'Depilador Indolor Caneta Sobrancelha'}, niches).nicheId, 'beleza');
  assert.equal(core.classifyCanonicalNiche({productName:'Caixa Saco Organizador Guarda Roupa'}, niches).nicheId, 'casa_cozinha_organizacao');
});

test('strong Shopee temporal acceleration can verify a real trend', () => {
  const now = new Date();
  const previousAt = new Date(now.getTime() - 38.7*3600000).toISOString();
  const candidate = {marketplace:'Shopee', productName:'Niacinamide Serum', sales:33305, observedAt:now.toISOString()};
  const previous = {sales:30417, observedAt:previousAt};
  const result = core.calculateTrendEvidence(candidate, previous);
  assert.equal(result.strongSalesAcceleration, true);
  assert.equal(result.trending, true);
  assert.ok(result.trendScore >= 50);
});

test('small positive sales movement remains an observation', () => {
  const now = new Date();
  const candidate = {marketplace:'Shopee', productName:'Organizador', sales:13943, observedAt:now.toISOString()};
  const previous = {sales:13783, observedAt:new Date(now.getTime()-31.3*3600000).toISOString()};
  const result = core.calculateTrendEvidence(candidate, previous);
  assert.equal(result.trending, false);
});

test('Mercado Livre category trend with exact match verifies', () => {
  const candidate = {marketplace:'Mercado Livre', productName:'Notebook Acer Aspire 5', nativeTrend:true, observedAt:new Date().toISOString(), marketplaceTrendEvidence:{source:'mercadolivre_category_trends', keyword:'notebook'}};
  const result = core.calculateTrendEvidence(candidate, null);
  assert.equal(result.trending, true);
  assert.ok(result.trendScore >= 50);
});

test('Mercado Livre global trend alone does not verify without corroboration', () => {
  const candidate = {marketplace:'Mercado Livre', productName:'Notebook Acer Aspire 5', nativeTrend:true, observedAt:new Date().toISOString(), marketplaceTrendEvidence:{source:'mercadolivre_global_trends', keyword:'notebook'}};
  const result = core.calculateTrendEvidence(candidate, null);
  assert.equal(result.trending, false);
});

test('Amazon Best Seller alone is observation; rank rise can verify later', () => {
  const now = new Date();
  const base = {marketplace:'Amazon', productName:'Notebook Gamer', amazonBestSeller:true, bestSeller:true, rank:6, rankSource:'Amazon Best Sellers', observedAt:now.toISOString()};
  assert.equal(core.calculateTrendEvidence(base, null).trending, false);
  const previous = {rank:18, observedAt:new Date(now.getTime()-24*3600000).toISOString()};
  const moved = core.calculateTrendEvidence(base, previous);
  assert.equal(moved.strongRankRise, true);
  assert.equal(moved.trending, true);
});

test('snapshot persists observations but only verified trends lead ordering', () => {
  const evaluated = [
    {identityKey:'a', nicheId:'beleza', trendScore:55, trending:true, commercialScore:20},
    {identityKey:'b', nicheId:'pet', trendScore:20, trending:false, commercialScore:90},
    {identityKey:'c', nicheId:'informatica', trendScore:60, trending:true, commercialScore:10},
  ];
  const s = core.selectSnapshot(evaluated,{maxRows:20});
  assert.deepEqual(s.verified.map(x=>x.identityKey), ['c','a']);
  assert.equal(s.observations.length,1);
  assert.equal(s.persisted.length,3);
});

test('cross-market bonus requires independently strong evidence', () => {
  const now = new Date();
  const candidates = [
    {marketplace:'Mercado Livre', itemId:'1', productName:'Notebook Acer', nativeTrend:true, observedAt:now.toISOString(), marketplaceTrendEvidence:{source:'mercadolivre_category_trends',keyword:'notebook'}},
    {marketplace:'Shopee', itemId:'2', productName:'Notebook Asus', sales:100, observedAt:now.toISOString()},
  ];
  const evaluated = core.evaluateCandidates(candidates,new Map(),{niches});
  assert.equal(evaluated.find(x=>x.marketplace==='Mercado Livre').crossStrongCount,1);
});

test('seven canonical niches can coexist in the history snapshot',()=>{
 const products=[
  ['casa_cozinha_organizacao','Cafeteira Elétrica'],['beleza','Serum Facial'],['moda','Tenis Feminino'],
  ['eletrodomesticos','Geladeira Frost Free'],['informatica','Notebook Core i5'],['ferramentas','Furadeira de Impacto'],['pet','Racao para Gato'],
 ].map(([,productName],i)=>({marketplace:'Shopee',itemId:String(i),productName,currentPrice:100,sales:10,observedAt:new Date().toISOString()}));
 const evaluated=core.evaluateCandidates(products,new Map(),{niches});
 const snapshot=core.selectSnapshot(evaluated,{maxRows:20});
 assert.equal(new Set(snapshot.persisted.map(x=>x.nicheId)).size,7);
});