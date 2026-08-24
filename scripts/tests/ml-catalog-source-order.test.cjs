'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runMercadoLivreOfficialIntentCoverage } = require('../mercadolivre-official-intents-v5.cjs');

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function productFixtures() {
  return {
    domain: { domain_id: 'MLB-COFFEE_MAKERS', category_id: 'MLB1576', category_name: 'Cafeteiras' },
    productId: 'MLBPRODUCTCOFFEE1',
    itemId: 'MLBITEMCOFFEE1',
  };
}

function productResponse({ title = 'Cafeteira Elétrica 30 Xícaras', price = 199.9 } = {}) {
  const { itemId } = productFixtures();
  return {
    catalogItems: { results: [{ item_id: itemId, price }] },
    productMeta: {
      name: title,
      pictures: [{ url: 'https://img.example/cafeteira.jpg' }],
      permalink: 'https://www.mercadolivre.com.br/p/MLBPRODUCTCOFFEE1',
    },
    details: [{
      code: 200,
      body: {
        id: itemId,
        title,
        price,
        original_price: 249.9,
        seller_id: 123,
        shipping: { free_shipping: true },
        thumbnail: 'https://img.example/cafeteira-item.jpg',
        permalink: 'https://produto.mercadolivre.com.br/MLBITEMCOFFEE1',
      },
    }],
  };
}

test('usa products/search com intenção + domain_id como fonte primária de catálogo', async () => {
  const { domain, productId } = productFixtures();
  const fixture = productResponse();
  const calls = [];

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['cafeteira'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.includes('/domain_discovery/search')) return json([domain]);
      if (value.includes('/products/search?')) return json({ results: [{ id: productId }] });
      if (value.includes(`/products/${productId}/items`)) return json(fixture.catalogItems);
      if (value.endsWith(`/products/${productId}`)) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      if (value.includes('/highlights/')) throw new Error('highlights não deve ser necessário quando products/search encontra catálogo');
      throw new Error(`URL fixture inesperada: ${value}`);
    },
  });

  const catalogCall = calls.find((url) => url.includes('/products/search?'));
  assert.ok(catalogCall, 'products/search precisa ser chamado');
  assert.match(catalogCall, /site_id=MLB/);
  assert.match(catalogCall, /status=active/);
  assert.match(catalogCall, /q=cafeteira/);
  assert.match(catalogCall, /domain_id=MLB-COFFEE_MAKERS/);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Cafeteira Elétrica 30 Xícaras');
});

test('usa highlights como fallback quando products/search não retorna catálogo', async () => {
  const { domain, productId } = productFixtures();
  const fixture = productResponse({ title: 'Cafeteira Espresso Automática' });
  const calls = [];

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['cafeteira'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.includes('/domain_discovery/search')) return json([domain]);
      if (value.includes('/products/search?')) return json({ results: [] });
      if (value.includes('/highlights/')) return json({ content: [{ id: productId, type: 'PRODUCT' }] });
      if (value.includes(`/products/${productId}/items`)) return json(fixture.catalogItems);
      if (value.endsWith(`/products/${productId}`)) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      throw new Error(`URL fixture inesperada: ${value}`);
    },
  });

  const catalogIndex = calls.findIndex((url) => url.includes('/products/search?'));
  const highlightsIndex = calls.findIndex((url) => url.includes('/highlights/'));
  assert.ok(catalogIndex >= 0, 'products/search precisa ser tentado');
  assert.ok(highlightsIndex > catalogIndex, 'highlights deve ser fallback após catálogo');
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Cafeteira Espresso Automática');
});

test('falha local de products/search não derruba a intenção e permite fallback por highlights', async () => {
  const { domain, productId } = productFixtures();
  const fixture = productResponse({ title: 'Cafeteira Programável' });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['cafeteira'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/domain_discovery/search')) return json([domain]);
      if (value.includes('/products/search?')) return json({ message: 'temporary failure' }, 503);
      if (value.includes('/highlights/')) return json({ content: [{ id: productId, type: 'PRODUCT' }] });
      if (value.includes(`/products/${productId}/items`)) return json(fixture.catalogItems);
      if (value.endsWith(`/products/${productId}`)) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      throw new Error(`URL fixture inesperada: ${value}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Cafeteira Programável');
});
