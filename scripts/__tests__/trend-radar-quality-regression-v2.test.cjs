'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const core = require('../trend-radar-seven-niches-authoritative.cjs');

const niches = {
  beleza:{name:'Beleza',guardrails:{allowedProductTerms:['shampoo','serum','depilador'],blockedProductTerms:[]}},
  moda:{name:'Moda',guardrails:{allowedProductTerms:['bolsa','tenis feminino','tenis masculino','relogio'],blockedProductTerms:[]}},
  eletrodomesticos:{name:'Eletrodomésticos',guardrails:{allowedProductTerms:['geladeira','freezer','microondas'],blockedProductTerms:[]}},
  informatica:{name:'Informática',guardrails:{allowedProductTerms:['notebook','monitor','computador'],blockedProductTerms:[]}},
  casa_cozinha_organizacao:{name:'Casa',guardrails:{allowedProductTerms:['organizador','cafeteira','liquidificador'],blockedProductTerms:[]}},
  ferramentas:{name:'Ferramentas',guardrails:{allowedProductTerms:['furadeira','parafusadeira','alicate'],blockedProductTerms:[]}},
  pet:{name:'Pet',guardrails:{allowedProductTerms:['tapete higienico','racao para gato'],blockedProductTerms:[]}},
};

const now = () => new Date().toISOString();

test('snapshot 55676515 domain false positives are blocked or rerouted', () => {
  assert.equal(core.classifyCanonicalNiche({productName:'Monitor De Pressão Arterial De Pulso Recarregável Alta XYY-2551'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'vonixx Shampoo Automotivo Concentrado 1:400 V-floc 3 Litros'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'Bolsa Premium para Lavar Tênis e Sapatos na Máquina'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'Porta Relógio de 6 Lugares'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'Adaptador Angular Para Parafusadeira'}, niches), null);
  assert.equal(core.classifyCanonicalNiche({productName:'Kit 2 Organizadores De Geladeira Com Bandeja'}, niches), null);
});

test('canonical products remain accepted after domain hardening', () => {
  assert.equal(core.classifyCanonicalNiche({productName:'Notebook Lenovo IdeaPad Slim 3'}, niches).nicheId, 'informatica');
  assert.equal(core.classifyCanonicalNiche({productName:'Geladeira EOS 230 Litros Duplex Inox'}, niches).nicheId, 'eletrodomesticos');
  assert.equal(core.classifyCanonicalNiche({productName:'Shampoo Hidratante Dove 400ml'}, niches).nicheId, 'beleza');
  assert.equal(core.classifyCanonicalNiche({productName:'Parafusadeira 20V Brushless'}, niches).nicheId, 'ferramentas');
});

test('official ML global trend is recognized as global rather than generic native', () => {
  const c = {marketplace:'Mercado Livre',marketplaceTrendEvidence:{source:'mercadolivre_trends',keyword:'notebook'}};
  assert.equal(core.nativeTrendScope(c),'global');
});

test('official ML intent product headed by canonical trending term can verify immediately', () => {
  const candidate = {
    marketplace:'Mercado Livre', productName:'Notebook Lenovo', matchedTerm:'notebook',
    provenance:'mercadolivre_official_intent', observedAt:now(),
    marketplaceTrendEvidence:{source:'mercadolivre_trends',keyword:'notebook'}, nativeTrend:true,
  };
  const out = core.calculateTrendEvidence(candidate,null);
  assert.equal(out.trending,true);
  assert.ok(out.trendScore >= 50);
  assert.ok(out.reasons.includes('produto_representa_intencao_nativa_em_tendencia'));
});

test('official ML broad trend mention inside accessory-like title does not auto verify', () => {
  const candidate = {
    marketplace:'Mercado Livre', productName:'Capa Para Notebook 15 Polegadas', matchedTerm:'notebook',
    provenance:'mercadolivre_official_intent', observedAt:now(),
    marketplaceTrendEvidence:{source:'mercadolivre_trends',keyword:'notebook'}, nativeTrend:true,
  };
  const out = core.calculateTrendEvidence(candidate,null);
  assert.equal(out.trending,false);
});

test('global native + independent best seller in another marketplace can corroborate family', () => {
  const candidates = [
    {marketplace:'Mercado Livre',itemId:'ml1',productName:'Geladeira EOS 230L',provenance:'mercadolivre_official_intent',observedAt:now(),marketplaceTrendEvidence:{source:'mercadolivre_trends',keyword:'geladeira'},nativeTrend:true},
    {marketplace:'Amazon',itemId:'amz1',asin:'amz1',productName:'Geladeira Frost Free 400L',bestSeller:true,amazonBestSeller:true,rank:4,rankSource:'Amazon Best Sellers',rankAuthoritative:true,observedAt:now()},
  ];
  const evaluated = core.evaluateCandidates(candidates,new Map(),{niches});
  const ml = evaluated.find((x)=>x.marketplace==='Mercado Livre');
  assert.equal(ml.crossStrongCount,2);
  assert.equal(ml.trending,true);
  assert.ok(ml.reasons.includes('confirmacao_forte_2_marketplaces'));
});

test('best seller alone still does not become a trend', () => {
  const out = core.calculateTrendEvidence({marketplace:'Amazon',productName:'Notebook Gamer',bestSeller:true,amazonBestSeller:true,rank:1,rankSource:'Amazon Best Sellers',rankAuthoritative:true,observedAt:now()},null);
  assert.equal(out.trending,false);
});