'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const core=require('../trend-radar-seven-niches-v3.cjs');

const niches={
  beleza:{name:'Beleza',guardrails:{allowedProductTerms:['shampoo','serum','hidratante facial'],blockedProductTerms:[]}},
  moda:{name:'Moda',guardrails:{allowedProductTerms:['tenis feminino','tenis masculino','relogio','bolsa'],blockedProductTerms:[]}},
  eletrodomesticos:{name:'Eletrodomésticos',guardrails:{allowedProductTerms:['geladeira','refrigerador','freezer','microondas','aspirador de po'],blockedProductTerms:[]}},
  informatica:{name:'Informática',guardrails:{allowedProductTerms:['notebook','monitor','computador'],blockedProductTerms:[]}},
  casa_cozinha_organizacao:{name:'Casa',guardrails:{allowedProductTerms:['air fryer','liquidificador','chaleira eletrica','cafeteira'],blockedProductTerms:[]}},
  ferramentas:{name:'Ferramentas',guardrails:{allowedProductTerms:['furadeira','parafusadeira','alicate'],blockedProductTerms:[]}},
  pet:{name:'Pet',guardrails:{allowedProductTerms:['tapete higienico','racao para gato'],blockedProductTerms:[]}},
};
const now=()=>new Date().toISOString();

test('V3 rejects snapshot accessory false confirmations',()=>{
  assert.equal(core.classifyCanonicalNiche({productName:'Romantic Crown Mochila Masculina de Viagem para Notebook'},niches),null);
  assert.equal(core.classifyCanonicalNiche({productName:'Mesa Portátil Para Notebook Suporte Cama Sofá'},niches),null);
  assert.equal(core.classifyCanonicalNiche({productName:'Mesa Dobrável Notebook Retrátil Home Office'},niches),null);
  assert.equal(core.classifyCanonicalNiche({productName:'Kit 2 Organizadores De Geladeira Com Bandeja'},niches),null);
  assert.equal(core.classifyCanonicalNiche({productName:'Adaptador Angular Para Parafusadeira'},niches),null);
});

test('canonical core products remain accepted',()=>{
  assert.equal(core.classifyCanonicalNiche({productName:'Notebook Lenovo IdeaPad Slim 3'},niches).nicheId,'informatica');
  assert.equal(core.classifyCanonicalNiche({productName:'Geladeira EOS 230 Litros Duplex Inox'},niches).nicheId,'eletrodomesticos');
});

test('ML global search trend alone never verifies a SKU',()=>{
  const c={marketplace:'Mercado Livre',productName:'Notebook Lenovo',nicheId:'informatica',matchedTerm:'notebook',primaryFamilyMatch:true,observedAt:now(),nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'notebook'}};
  const out=core.calculateTrendEvidence(c,null);
  assert.equal(out.trending,false);
  assert.equal(out.productSpecificStrong,false);
});

test('ML global trend plus same-item bestseller verifies',()=>{
  const c={marketplace:'Mercado Livre',productName:'Notebook Lenovo',nicheId:'informatica',matchedTerm:'notebook',primaryFamilyMatch:true,observedAt:now(),nativeTrend:true,bestSeller:true,rank:5,rankSource:'Mercado Livre Highlights',rankAuthoritative:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'notebook'}};
  const out=core.calculateTrendEvidence(c,null);
  assert.equal(out.trending,true);
  assert.ok(out.trendScore>=50);
  assert.ok(out.reasons.includes('tendencia_nativa_com_prova_do_produto'));
});

test('Shopee real sales acceleration verifies',()=>{
  const current={marketplace:'Shopee',productName:'Liquidificador Mondial',nicheId:'casa_cozinha_organizacao',matchedTerm:'liquidificador',primaryFamilyMatch:true,sales:12000,observedAt:now()};
  const previous={sales:11000,observedAt:new Date(Date.now()-24*3600000).toISOString()};
  const out=core.calculateTrendEvidence(current,previous);
  assert.equal(out.trending,true);
  assert.ok(out.reasons.some((r)=>r.startsWith('aceleracao_vendas_')));
});

test('Amazon authoritative rank rise verifies',()=>{
  const current={marketplace:'Amazon',productName:'Dove Serum Hidratante',nicheId:'beleza',matchedTerm:'serum',primaryFamilyMatch:true,bestSeller:true,amazonBestSeller:true,rank:2,rankSource:'Amazon Best Sellers',rankAuthoritative:true,observedAt:now()};
  const previous={rank:12,observedAt:new Date(Date.now()-24*3600000).toISOString()};
  const out=core.calculateTrendEvidence(current,previous);
  assert.equal(out.trending,true);
  assert.equal(out.strongRankRise,true);
});

test('best seller alone remains observation',()=>{
  const c={marketplace:'Amazon',productName:'Dove Serum Hidratante',nicheId:'beleza',matchedTerm:'serum',primaryFamilyMatch:true,bestSeller:true,amazonBestSeller:true,rank:1,rankSource:'Amazon Best Sellers',rankAuthoritative:true,observedAt:now()};
  assert.equal(core.calculateTrendEvidence(c,null).trending,false);
});

test('snapshot 7a0838f3 fake notebook cross-market reinforcement disappears',()=>{
  const candidates=[
    {marketplace:'Mercado Livre',itemId:'ml',productName:'Notebook Lenovo',observedAt:now(),nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'notebook'}},
    {marketplace:'Amazon',itemId:'a',productName:'Romantic Crown Mochila Masculina de Viagem para Notebook',bestSeller:true,amazonBestSeller:true,rank:15,rankSource:'Amazon Best Sellers',rankAuthoritative:true,observedAt:now()},
    {marketplace:'Shopee',itemId:'s',productName:'Mesa Dobrável Notebook Retrátil Home Office',sales:6310,observedAt:now()},
  ];
  const evaluated=core.evaluateCandidates(candidates,new Map(),{niches});
  assert.equal(evaluated.length,1);
  assert.equal(evaluated[0].productName,'Notebook Lenovo');
  assert.equal(evaluated[0].crossStrongCount,1);
  assert.equal(evaluated[0].trending,false);
});

test('actual best seller in another marketplace can corroborate family, but only product-specific item verifies',()=>{
  const candidates=[
    {marketplace:'Mercado Livre',itemId:'ml',productName:'Notebook Lenovo',observedAt:now(),nativeTrend:true,marketplaceTrendEvidence:{source:'mercadolivre_global_trends',keyword:'notebook'}},
    {marketplace:'Amazon',itemId:'a',productName:'Notebook Acer Aspire 5',bestSeller:true,amazonBestSeller:true,rank:4,rankSource:'Amazon Best Sellers',rankAuthoritative:true,observedAt:now()},
  ];
  const evaluated=core.evaluateCandidates(candidates,new Map(),{niches});
  const ml=evaluated.find((x)=>x.marketplace==='Mercado Livre');
  const amz=evaluated.find((x)=>x.marketplace==='Amazon');
  assert.equal(ml.crossStrongCount,2);
  assert.equal(ml.trending,false);
  assert.equal(amz.crossStrongCount,2);
  assert.equal(amz.trending,true);
});

test('persisted verified evidence declares product-specific proof and V3',()=>{
  const row=core.toPersistedRow({marketplace:'Shopee',productName:'Liquidificador',nicheId:'casa_cozinha_organizacao',nicheLabel:'Casa',matchedTerm:'liquidificador',trending:true,productSpecificStrong:true,trendScore:60,reasons:['x'],temporal:{},commercialScore:20},1,'r');
  assert.equal(row.evidence_status,'verified');
  assert.equal(row.direct_evidence[0].product_specific_evidence,true);
  assert.equal(row.direct_evidence[0].trend_strategy_version,'trend-radar-seven-niches-v3');
});
