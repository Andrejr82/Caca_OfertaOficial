'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  TREND_CONFIRMED_STATUS,
  TREND_OBSERVED_STATUS,
  MAX_SNAPSHOT_ROWS,
  classifyNiche,
  calculateTrendScore,
  buildTrendRadarSelection,
  toPersistedRow,
} = require('../trend-radar-seven-niches-v1.cjs');

const now = new Date().toISOString();
const ago = (h) => new Date(Date.now() - h * 3600000).toISOString();

const cases = [
  ['Air Fryer Mondial 5L','casa_cozinha_organizacao'],
  ['Protetor Solar Facial FPS 70','beleza'],
  ['Tênis Feminino Casual','moda'],
  ['Geladeira Frost Free 400L','eletrodomesticos'],
  ['Notebook Lenovo Ryzen 7','informatica'],
  ['Parafusadeira 20V','ferramentas'],
  ['Ração para Cachorro 15kg','pet'],
];
for (const [title, niche] of cases) test(`classifica ${niche}`, () => assert.equal(classifyNiche({ productName: title }), niche));

test('rejeita nicho externo', () => assert.equal(classifyNiche({ productName: 'Console PlayStation 5' }), null));

test('best seller parado não é tendência', () => {
  const out = calculateTrendScore({ marketplace:'Shopee', bestSeller:true, sales:10000, observedAt:now }, { sales:10000, observedAt:ago(24) });
  assert.equal(out.trending, false);
});

test('desconto/comissão sem evidência temporal não é tendência', () => {
  const out = calculateTrendScore({ marketplace:'Shopee', discountPercent:60, commissionPercent:20, sales:9000, observedAt:now }, null);
  assert.equal(out.trending, false);
});

test('aceleração factual de vendas pode confirmar tendência', () => {
  const out = calculateTrendScore({ marketplace:'Shopee', sales:1600, bestSeller:true, observedAt:now }, { sales:1000, observedAt:ago(24) });
  assert.equal(out.trending, true);
  assert.ok(out.temporal.salesVelocity > 0);
});

test('subida autoritativa de rank confirma tendência', () => {
  const out = calculateTrendScore({ marketplace:'Amazon', rank:6, rankSource:'Amazon Best Sellers', amazonBestSeller:true, observedAt:now }, { rank:18, observedAt:ago(24) });
  assert.equal(out.trending, true);
  assert.equal(out.temporal.rankDelta, 12);
});

test('posição de busca Amazon não é tratada como rank comercial', () => {
  const out = calculateTrendScore({ marketplace:'Amazon', rank:3, rankSource:'search_results', observedAt:now }, { rank:20, observedAt:ago(24) });
  assert.equal(out.temporal.rankDelta, null);
  assert.equal(out.trending, false);
});

test('sinal nativo ML + best seller confirma tendência', () => {
  const out = calculateTrendScore({ marketplace:'Mercado Livre', nativeTrend:true, bestSeller:true, rank:4, observedAt:now }, null);
  assert.equal(out.trending, true);
});

test('não preenche artificialmente', () => {
  const { selected } = buildTrendRadarSelection([
    { productName:'Notebook A', marketplace:'Shopee', sales:1200, bestSeller:true, observedAt:now, identityKey:'a' },
    { productName:'Console X', marketplace:'Shopee', sales:5000, nativeTrend:true, observedAt:now, identityKey:'b' },
  ], new Map([['a',{sales:1200,observedAt:ago(24)}]]));
  assert.equal(selected.length, 0);
});

test('limita 3 tendências por nicho', () => {
  const candidates = Array.from({length:5},(_,i)=>({productName:`Notebook ${i}`,marketplace:'Mercado Livre',nativeTrend:true,bestSeller:true,rank:i+1,observedAt:now,identityKey:String(i)}));
  const { selected } = buildTrendRadarSelection(candidates);
  assert.equal(selected.length,3);
});

test('limite físico do snapshot respeita schema 1..20', () => {
  assert.equal(MAX_SNAPSHOT_ROWS, 20);
});

test('persistência usa status permitido para tendência confirmada', () => {
  const row = toPersistedRow({productName:'Notebook X',marketplace:'Shopee',nicheId:'informatica',nicheLabel:'Informática',trending:true,trendScore:82,reasons:['x'],breakdown:{},temporal:{}},1,'run');
  assert.equal(row.evidence_status,TREND_CONFIRMED_STATUS);
  assert.equal(row.evidence_status,'verified');
  assert.equal(row.trend_score,82);
  assert.equal(row.direct_evidence[0].trending_flag,true);
});

test('persistência usa status permitido para observação temporal', () => {
  const row = toPersistedRow({productName:'Notebook X',marketplace:'Shopee',nicheId:'informatica',nicheLabel:'Informática',trending:false,trendScore:30,reasons:[],breakdown:{},temporal:{}},2,'run');
  assert.equal(row.evidence_status,TREND_OBSERVED_STATUS);
  assert.equal(row.evidence_status,'partial');
  assert.equal(row.direct_evidence[0].trending_flag,false);
});
