'use strict';
const assert = require('node:assert/strict');
const { test } = require('node:test');
const { controlledCandidateQuality, selectControlledPersistCandidates } = require('../shopee-openapi-v1-controlled-persist.cjs');
const { validateProductTitle } = require('../product-title-quality.cjs');
const { classifyCandidate } = require('../classification-coverage.cjs');
const { selectOfferQualityQueueProducts } = require('../offer-quality-queue-runtime.cjs');

const p = (overrides={}) => ({ itemId: String(overrides.itemId || '1'), ratingStar: 4.8, sales: 1200, priceMin: 49.9, priceMax: 59.9, priceRangeAmbiguous: true, safeForPublication: true, productName: 'Webcam Full HD 1080p com Microfone', ...overrides });

test('bloqueia rating abaixo de 4.7', () => assert.equal(controlledCandidateQuality(p({ ratingStar: 4.6 })).eligible, false));
test('bloqueia vendas abaixo de 100', () => assert.equal(controlledCandidateQuality(p({ sales: 44 })).eligible, false));
test('bloqueia faixa extrema de preço ambígua', () => assert.deepEqual(controlledCandidateQuality(p({ priceMin: 10.8, priceMax: 39.5 })).reasons, ['extreme_price_range']));
test('mantém variação de preço normal', () => assert.equal(controlledCandidateQuality(p()).eligible, true));
test('preenche o limite com os próximos candidatos qualificados', () => {
  const rows = [p({ itemId:'1', ratingStar:4.6 }), p({ itemId:'2', sales:50 }), p({ itemId:'3' }), p({ itemId:'4' }), p({ itemId:'5' })];
  const selected = selectControlledPersistCandidates(rows, { maxNewCandidates:2 });
  assert.deepEqual(selected.map((x)=>x.itemId), ['3','4']);
});

test('Shopee bloqueia manutenção de impressora 3D antes da persistência', () => {
  const candidate = p({
    productName: 'Kit 10 Agulha Limpeza Desentupidor Bico Nozzle 0.4mm Impressora 3D Inox Hotend Extrusora Ender Creality MK8 Bambulab',
  });
  const quality = controlledCandidateQuality(candidate);
  assert.equal(quality.eligible, false);
  assert.ok(quality.reasons.includes('accessory_only_product'));
});

test('gate compartilhado bloqueia cabo de carregamento vendido como produto de informática', () => {
  const result = validateProductTitle('Cabo de carregamento USB para mouse gamer Logitech G502 Lightspeed');
  assert.equal(result.valid, false);
  assert.equal(result.reason, 'ACCESSORY_ONLY_PRODUCT');
});

test('Mercado Livre classifica família certificada pelo domínio nativo', () => {
  const classification = classifyCandidate({
    title: 'Roteador TP-Link Archer AX53 Wi-Fi 6 Gigabit',
    rawPayload: { domain_id: 'MLB-ROUTERS_AND_WIRELESS_SYSTEMS', category_id: 'MLB1648' },
  }, 'Mercado Livre');
  assert.equal(classification.status, 'classified');
  assert.equal(classification.productType, 'roteador');
  assert.match(classification.source, /^mercadolivre-certified:/);
});

test('Amazon usa evidência do título antes de browse node amplo', () => {
  const classification = classifyCandidate({
    title: 'Notebook Dell Inspiron Intel Core i5 16GB SSD 512GB',
    category: { browseNodeId: '16243803011' },
    marketplaceMetrics: { browseNodeId: '16243803011' },
  }, 'Amazon');
  assert.equal(classification.status, 'classified');
  assert.equal(classification.productType, 'notebook');
  assert.equal(classification.source, 'title');
});

test('Offer Quality prioriza valor comprovado e confiança, não apenas preço baixo', () => {
  const base = {
    sourceUrl: 'https://www.amazon.com.br/dp/B000000001',
    imageUrl: 'https://images.example/item.jpg',
    originalPrice: null,
    monetization: { valid: true },
  };
  const cheapLowSignal = {
    ...base,
    sourceItemId: 'B000000001',
    title: 'Mouse sem fio básico USB',
    currentPrice: 59.9,
    marketplaceMetrics: { asin: 'B000000001', rating: 4.1, reviewCount: 8 },
  };
  const strongMainProduct = {
    ...base,
    sourceItemId: 'B000000002',
    sourceUrl: 'https://www.amazon.com.br/dp/B000000002',
    title: 'Notebook Lenovo IdeaPad Ryzen 5 16GB SSD 512GB',
    currentPrice: 2499,
    originalPrice: 3199,
    discountEvidence: true,
    marketplaceMetrics: { asin: 'B000000002', rating: 4.8, reviewCount: 1800, shippingFree: true },
  };
  const result = selectOfferQualityQueueProducts([cheapLowSignal, strongMainProduct], {
    marketplace: 'Amazon',
    maxAccepted: 1,
    monetizationValid: () => true,
  });
  assert.deepEqual(result.accepted.map((item) => item.sourceItemId), ['B000000002']);
});
