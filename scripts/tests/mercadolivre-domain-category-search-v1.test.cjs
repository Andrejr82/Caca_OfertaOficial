'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runMercadoLivreOfficialIntentCoverage } = require('../mercadolivre-official-intents-v5.cjs');

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function productResponse({ id = 'MLBPRODUCT1', itemId = 'MLBITEM1', title = 'Air Fryer Fritadeira Sem Óleo 4L', price = 299.9, domainId = 'MLB-AIR_FRYERS', categoryId = 'MLB456045' } = {}) {
  return {
    catalogItems: { results: [{ item_id: itemId, price }] },
    productMeta: {
      name: title,
      pictures: [{ url: 'https://img.example/airfryer.jpg' }],
      permalink: `https://www.mercadolivre.com.br/p/${id}`,
    },
    details: [{
      code: 200,
      body: {
        id: itemId,
        title,
        price,
        original_price: price * 1.2,
        seller_id: 123,
        shipping: { free_shipping: true },
        thumbnail: 'https://img.example/airfryer-item.jpg',
        permalink: `https://produto.mercadolivre.com.br/${itemId}`,
        domain_id: domainId,
        category_id: categoryId,
      },
    }],
  };
}

test('1. Flag false: fluxo legado preservado e idêntico sem telemetria V1 obrigatória', async () => {
  const calls = [];
  const fixture = productResponse({ title: 'Cafeteira Tradicional', domainId: 'MLB-COFFEE_MAKERS' });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['cafeteira'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'false' },
    fetchImpl: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.includes('/domain_discovery/search')) return json([{ domain_id: 'MLB-COFFEE_MAKERS', category_id: 'MLB1576', category_name: 'Cafeteiras' }]);
      if (value.includes('/products/search?')) return json({ results: [{ id: 'MLBPROD1' }] });
      if (value.includes('/products/MLBPROD1/items')) return json(fixture.catalogItems);
      if (value.endsWith('/products/MLBPROD1')) return json(fixture.productMeta);
      if (value.includes('/items?ids=')) return json(fixture.details);
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.equal(result.mercadolivreDomainCategorySearchV1, undefined, 'Não deve ter telemetria V1 quando flag está desativada');
  assert.equal(result.source, 'official_api');
  assert.equal(result.products.length, 1);
});

test('2. Flag true: usa somente famílias certificadas e preenche telemetria V1', async () => {
  const calls = [];
  const fixtureAirFryer = productResponse({
    id: 'MLBPROD_AIRFRYER',
    itemId: 'MLBITEM_AIRFRYER',
    title: 'Fritadeira Elétrica Air Fryer 4L Inox',
    price: 349.9,
    domainId: 'MLB-AIR_FRYERS',
    categoryId: 'MLB456045'
  });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer', 'panela'], // 'panela' não é certificada (investigar), deve ser pulada
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      calls.push(value);
      if (value.includes('/products/search?') && value.includes('domain_id=MLB-AIR_FRYERS')) {
        return json({ results: [{ id: 'MLBPROD_AIRFRYER' }] });
      }
      if (value.includes('/products/MLBPROD_AIRFRYER/items')) return json(fixtureAirFryer.catalogItems);
      if (value.endsWith('/products/MLBPROD_AIRFRYER')) return json(fixtureAirFryer.productMeta);
      if (value.includes('/items?ids=')) return json(fixtureAirFryer.details);
      if (value.includes('/reviews/item/')) return json({ rating_average: 4.8, paging: { total: 50 } });
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.ok(result.mercadolivreDomainCategorySearchV1, 'Telemetria V1 deve existir quando flag está ativada');
  assert.equal(result.mercadolivreDomainCategorySearchV1.enabled, true);
  assert.equal(result.mercadolivreDomainCategorySearchV1.familiesAvailable, 30);
  assert.equal(result.mercadolivreDomainCategorySearchV1.familiesUsed, 1);
  assert.deepEqual(result.mercadolivreDomainCategorySearchV1.selectedFamilies, ['air fryer']);
  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Fritadeira Elétrica Air Fryer 4L Inox');

  // Verificar que panela foi ignorada como skipped_non_certified
  const panelaQuery = result.queries.find((q) => q.intent === 'panela');
  assert.ok(panelaQuery, 'Query de panela deve existir');
  assert.equal(panelaQuery.status, 'skipped_non_certified');
});

test('3. Flag true: rejeita estritamente domínios proibidos como MLB-MINERAL_WATERS e MLB-DJ_MIXERS', async () => {
  const fixtureSpoofed = productResponse({
    id: 'MLBPROD_SPOOF',
    itemId: 'MLBITEM_SPOOF',
    title: 'Fritadeira Fake Mineral Water',
    price: 350.0,
    domainId: 'MLB-MINERAL_WATERS',
    categoryId: 'MLB456045'
  });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/products/search?')) return json({ results: [{ id: 'MLBPROD_SPOOF' }] });
      if (value.includes('/products/MLBPROD_SPOOF/items')) return json(fixtureSpoofed.catalogItems);
      if (value.endsWith('/products/MLBPROD_SPOOF')) return json(fixtureSpoofed.productMeta);
      if (value.includes('/items?ids=')) return json(fixtureSpoofed.details);
      if (value.includes('/sites/MLB/search?')) return json({ results: [] });
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.equal(result.products.length, 0, 'Item com MLB-MINERAL_WATERS não deve ser aceito');
  assert.ok(result.mercadolivreDomainCategorySearchV1.forbiddenDomainsRejected >= 1);
});

test('4. Flag true: rejeita acessórios e peças via negativeTerms', async () => {
  const fixtureAccessory = productResponse({
    id: 'MLBPROD_ACC',
    itemId: 'MLBITEM_ACC',
    title: 'Forma de Silicone para Air Fryer Fritadeira',
    price: 39.9,
    domainId: 'MLB-AIR_FRYERS',
    categoryId: 'MLB456045'
  });

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/products/search?')) return json({ results: [{ id: 'MLBPROD_ACC' }] });
      if (value.includes('/products/MLBPROD_ACC/items')) return json(fixtureAccessory.catalogItems);
      if (value.endsWith('/products/MLBPROD_ACC')) return json(fixtureAccessory.productMeta);
      if (value.includes('/items?ids=')) return json(fixtureAccessory.details);
      if (value.includes('/sites/MLB/search?')) return json({ results: [] });
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.equal(result.products.length, 0, 'Acessório (forma de silicone) deve ser rejeitado');
  assert.ok(result.mercadolivreDomainCategorySearchV1.semanticRejected >= 1 || result.mercadolivreDomainCategorySearchV1.minPriceRejected >= 1);
});

test('5. Flag true: respeita minConfidence para famílias de média confiança', async () => {
  // 'tênis feminino' tem confiança média
  const resultHighOnly = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['tênis feminino'],
    maxPerIntent: 20,
    delayMs: 0,
    minConfidence: 'alta',
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async () => json({ results: [] }),
  });

  const qHigh = resultHighOnly.queries.find((q) => q.intent === 'tênis feminino');
  assert.equal(qHigh.status, 'skipped_non_certified', 'Tênis feminino deve ser ignorado quando minConfidence=alta');

  const fixtureTenis = productResponse({
    id: 'MLBPROD_TENIS',
    itemId: 'MLBITEM_TENIS',
    title: 'Tênis Feminino Casual Confortável',
    price: 149.9,
    domainId: 'MLB-SNEAKERS',
    categoryId: 'MLB188065'
  });

  const resultAllConf = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['tênis feminino'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/highlights/')) return json({ content: [{ id: 'MLBPROD_TENIS', type: 'PRODUCT' }] });
      if (value.includes('/products/MLBPROD_TENIS/items')) return json(fixtureTenis.catalogItems);
      if (value.endsWith('/products/MLBPROD_TENIS')) return json(fixtureTenis.productMeta);
      if (value.includes('/items?ids=')) return json(fixtureTenis.details);
      if (value.includes('/reviews/item/')) return json({ rating_average: 4.7, paging: { total: 80 } });
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.equal(resultAllConf.products.length, 1);
  assert.equal(resultAllConf.products[0].title, 'Tênis Feminino Casual Confortável');
});
