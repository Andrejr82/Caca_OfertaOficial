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

test('falha em um domínio continua no próximo domínio', async () => {
  const domain1 = { domain_id: 'MLB-COFFEE_ACCESSORIES', category_id: 'MLB9999', category_name: 'Acessórios de Café' };
  const domain2 = { domain_id: 'MLB-COFFEE_MAKERS', category_id: 'MLB1576', category_name: 'Cafeteiras' };
  const { productId } = productFixtures();
  const fixture = productResponse({ title: 'Cafeteira Italiana Inox' });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['cafeteira'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/domain_discovery/search')) return json([domain1, domain2]);
      if (value.includes('domain_id=MLB-COFFEE_ACCESSORIES')) return json({ results: [] });
      if (value.includes('/highlights/MLB/category/MLB9999')) return json({ content: [] });
      if (value.includes('domain_id=MLB-COFFEE_MAKERS')) return json({ results: [{ id: productId }] });
      if (value.includes(`/products/${productId}/items`)) return json(fixture.catalogItems);
      if (value.endsWith(`/products/${productId}`)) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      throw new Error(`URL fixture inesperada: ${value}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Cafeteira Italiana Inox');
  assert.equal(result.queries[0].domain_id, 'MLB-COFFEE_MAKERS');
});

test('usa /sites/MLB/search como fallback quando catálogo e highlights não atingem cobertura mínima', async () => {
  const domain = { domain_id: 'MLB-T_SHIRTS', category_id: 'MLB31447', category_name: 'Camisetas e Regatas' };
  const calls = [];

  const fallbackResults = Array.from({ length: 12 }, (_, i) => ({
    id: `MLB_TSHIRT_${i + 1}`,
    title: `Camiseta Masculina Básica Algodão ${i + 1}`,
    price: 49.9 + i,
    original_price: 69.9 + i,
    seller_id: 1000 + i,
    shipping: { free_shipping: true },
    thumbnail: `https://img.example/camiseta_${i + 1}.jpg`,
    permalink: `https://produto.mercadolivre.com.br/MLB_TSHIRT_${i + 1}`,
    category_id: 'MLB31447',
    domain_id: 'MLB-T_SHIRTS',
    sold_quantity: 500 - i * 10,
    available_quantity: 50,
  }));

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['camiseta masculina'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.includes('/domain_discovery/search')) return json([domain]);
      if (value.includes('/products/search?')) return json({ results: [] });
      if (value.includes('/highlights/')) return json({ content: [] });
      if (value.includes('/sites/MLB/search?')) {
        return json({
          site_id: 'MLB',
          query: 'camiseta masculina',
          paging: { total: fallbackResults.length, offset: 0, limit: 30 },
          results: fallbackResults,
        });
      }
      if (value.includes('/reviews/item/')) {
        return json({ rating_average: 4.8, paging: { total: 120 } });
      }
      throw new Error(`URL fixture inesperada: ${value}`);
    },
  });

  assert.ok(result.products.length >= 10, 'esperado pelo menos 10 produtos coletados');
  const searchCall = calls.find((url) => url.includes('/sites/MLB/search?'));
  assert.ok(searchCall, 'GET /sites/MLB/search precisa ter sido chamado');
  assert.match(searchCall, /q=camiseta(%20|\+)masculina/i);
  assert.equal(result.queries[0].fallback_search_used, true);
  assert.ok(result.queries[0].fallback_search_products > 0);
  assert.equal(result.queries[0].auto_selectable, true);
  for (const prod of result.products) {
    assert.ok(prod.title, 'produto deve conter title');
    assert.ok(Number.isFinite(prod.current_price), 'produto deve conter current_price');
    assert.ok(prod.product_url, 'produto deve conter product_url');
    assert.ok(prod.image_url, 'produto deve conter image_url');
  }
});


