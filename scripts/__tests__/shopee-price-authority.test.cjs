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
