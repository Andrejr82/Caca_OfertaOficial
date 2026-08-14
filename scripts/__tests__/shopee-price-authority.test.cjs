const test = require('node:test');
const assert = require('node:assert/strict');

const {
  parseBrazilPrice,
  selectPrimaryPrice,
} = require('../../extensions/shopee-video-extractor/price-parser.js');
const {
  resolvePriceAuthority,
} = require('../shopee-price-authority.cjs');

test('seleciona preço principal e ignora parcela, cupom e frete', () => {
  const result = selectPrimaryPrice([
    { text: '12x de R$ 2,69 sem juros', className: 'installment' },
    { text: 'R$ 2.830,39', className: 'product-price current-price' },
    { text: 'R$ 2.699,00 com cupom', className: 'coupon-price' },
    { text: 'Frete R$ 29,90', className: 'shipping' },
  ]);

  assert.deepEqual(result, { raw: 'R$ 2.830,39', value: 2830.39, source: 'dom.primary-price' });
});

test('reconhece preço atual em contexto camelCase e rejeita recomendado', () => {
  const result = selectPrimaryPrice([
    { text: 'R$ 1.899,90', className: 'currentPrice productPrice' },
    { text: 'R$ 899,90', className: 'recommendationPrice' },
  ]);

  assert.deepEqual(result, { raw: 'R$ 1.899,90', value: 1899.9, source: 'dom.primary-price' });
});

test('seleciona o preço Pix da bicicleta e ignora preço riscado, cupom e frete', () => {
  const result = selectPrimaryPrice([
    { text: 'R$ 2.016,00', className: 'product-price pix-price' },
    { text: 'R$ 3.600,00', className: 'originalPrice line-through' },
    { text: 'ou R$ 2.299,99 sem cupom em outros métodos de pagamento', className: 'payment-option' },
    { text: 'Frete de R$ 53,04 R$ 13,04 com cupom', className: 'shipping' },
  ]);

  assert.deepEqual(result, { raw: 'R$ 2.016,00', value: 2016, source: 'dom.primary-price' });
});

test('desempata preço atual repetido sem escolher menor valor por heurística', () => {
  const result = selectPrimaryPrice([
    { text: 'R$ 129,90', className: 'price' },
    { text: 'R$ 99,90', className: 'price' },
    { text: 'R$ 99,90', className: 'price' },
  ]);

  assert.deepEqual(result, { raw: 'R$ 99,90', value: 99.9, source: 'dom.primary-price' });
});

test('mantém preço ambíguo bloqueado quando sinais têm a mesma força', () => {
  const result = selectPrimaryPrice([
    { text: 'R$ 129,90', className: 'price' },
    { text: 'R$ 99,90', className: 'price' },
  ]);

  assert.equal(result, null);
});

test('diagnóstico do fail-closed não altera o resultado do parser', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (_message, diagnostic) => warnings.push(diagnostic);
  try {
    const result = selectPrimaryPrice([
      { text: 'R$ 129,90', className: 'price' },
      { text: 'R$ 99,90', className: 'price' },
    ]);

    assert.equal(result, null);
    assert.equal(warnings.length, 1);
    assert.equal(warnings[0].reason, 'ambiguous_finalists');
    assert.equal(warnings[0].candidates.length, 2);
    assert.ok(warnings[0].candidates.every((candidate) => 'normalizedContext' in candidate && 'score' in candidate && 'rejection' in candidate));
    assert.equal('cookies' in warnings[0], false);
    assert.equal('token' in warnings[0], false);
  } finally {
    console.warn = originalWarn;
  }
});

test('diagnóstico registra ausência de candidatos válidos sem promover valor', () => {
  const warnings = [];
  const originalWarn = console.warn;
  console.warn = (_message, diagnostic) => warnings.push(diagnostic);
  try {
    assert.equal(selectPrimaryPrice([{ text: '12x de R$ 2,69 sem juros', className: 'installment' }]), null);
    assert.equal(warnings[0].reason, 'no_valid_candidates');
    assert.equal(warnings[0].candidates[0].rejection, 'suspicious_context');
  } finally {
    console.warn = originalWarn;
  }
});

test('não promove parcela isolada a preço principal', () => {
  assert.equal(selectPrimaryPrice([{ text: '12x de R$ 2,69 sem juros', className: 'installment' }]), null);
});

test('parse brasileiro preserva milhares e centavos', () => {
  assert.equal(parseBrazilPrice('R$ 2.830,39'), 2830.39);
  assert.equal(parseBrazilPrice('R$ 2,69'), 2.69);
});

test('oferta conhecida preserva preço canônico contra payload suspeito', () => {
  const result = resolvePriceAuthority({
    payloadPrice: '2,69',
    existingOffer: {
      current_price: 2830.39,
      shopee_shop_id: '1009975506',
      shopee_item_id: '22993279469',
    },
    payloadIdentity: { shopId: '1009975506', itemId: '22993279469' },
  });

  assert.deepEqual(result, { price: 2830.39, source: 'existing-offer-canonical', suspicious: true });
});

test('parcela não vira current_price em oferta conhecida', () => {
  const result = resolvePriceAuthority({
    payloadPrice: '12x de R$ 2,69 sem juros',
    existingOffer: {
      current_price: 2830.39,
      shopee_shop_id: '1009975506',
      shopee_item_id: '22993279469',
    },
    payloadIdentity: { shopId: '1009975506', itemId: '22993279469' },
  });

  assert.equal(result.price, 2830.39);
  assert.equal(result.source, 'existing-offer-canonical');
});

test('identidade incompatível não atualiza preço da oferta', () => {
  const result = resolvePriceAuthority({
    payloadPrice: '99,90',
    existingOffer: {
      current_price: 2830.39,
      shopee_shop_id: '1009975506',
      shopee_item_id: '22993279469',
    },
    payloadIdentity: { shopId: '999', itemId: '888' },
  });

  assert.deepEqual(result, { price: 2830.39, source: 'existing-offer-canonical', suspicious: true });
});
