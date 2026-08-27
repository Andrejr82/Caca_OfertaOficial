'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  runMercadoLivreOfficialIntentCoverage,
  canUseMercadoLivreV1Fallback,
  evaluateV1ItemAgainstConfig
} = require('../mercadolivre-official-intents-v5.cjs');
const { getMercadoLivreFamilyConfig } = require('../mercadolivre-domain-category-map-v1.cjs');

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

test('1. Helper puro canUseMercadoLivreV1Fallback valida contratos com precisão', () => {
  const airFryerConfig = getMercadoLivreFamilyConfig('air fryer');
  assert.equal(canUseMercadoLivreV1Fallback(airFryerConfig), true);

  assert.equal(canUseMercadoLivreV1Fallback(null), false);
  assert.equal(canUseMercadoLivreV1Fallback(undefined), false);
  assert.equal(canUseMercadoLivreV1Fallback({ safeForAutomaticSearch: false, domainIds: ['MLB-AIR_FRYERS'], bestExtractionRoute: 'domain_discovery_products_search' }), false);
  assert.equal(canUseMercadoLivreV1Fallback({ safeForAutomaticSearch: true, domainIds: [], bestExtractionRoute: 'domain_discovery_products_search' }), false);
  assert.equal(canUseMercadoLivreV1Fallback({ safeForAutomaticSearch: true, domainIds: ['MLB-AIR_FRYERS'], bestExtractionRoute: 'failed' }), false);
});

test('2. Flag false: fluxo legado preservado e idêntico sem telemetria V1 obrigatória', async () => {
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

test('3. Flag true: usa somente famílias certificadas e preenche telemetria V1', async () => {
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
      if (value.includes('/sites/MLB/search?')) return json({ results: [] });
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
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackOpenCalls, 0);

  const panelaQuery = result.queries.find((q) => q.intent === 'panela');
  assert.ok(panelaQuery, 'Query de panela deve existir');
  assert.equal(panelaQuery.status, 'skipped_non_certified');
});

test('4. Flag true: Fallback whitelisted roda e aceita produto válido quando rotas primárias têm < 5 itens', async () => {
  const fallbackItem = {
    id: 'MLB_FB_AF_1',
    title: 'Fritadeira Air Fryer Sem Óleo Digital 4.5L',
    price: 289.9,
    domain_id: 'MLB-AIR_FRYERS',
    category_id: 'MLB456045',
    thumbnail: 'https://img.example/fb_af.jpg',
    permalink: 'https://produto.mercadolivre.com.br/MLB_FB_AF_1',
    shipping: { free_shipping: true }
  };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/products/search?')) return json({ results: [] });
      if (value.includes('/highlights/')) return json({ content: [] });
      if (value.includes('/sites/MLB/search?')) {
        return json({ results: [fallbackItem] });
      }
      if (value.includes('/reviews/item/')) return json({ rating_average: 4.9, paging: { total: 110 } });
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Fritadeira Air Fryer Sem Óleo Digital 4.5L');
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackWhitelistedCalls >= 1, true);
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackWhitelistedAccepted >= 1, true);
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackOpenCalls, 0);
  assert.equal(result.queries[0].source_strategy, 'mercadolivre_v1_domain_discovery_products_search');
});

test('5. Flag true: Fallback whitelisted rejeita itens com domínio proibido (ex: MLB-MINERAL_WATERS)', async () => {
  const fallbackSpoof = {
    id: 'MLB_FB_SPOOF',
    title: 'Fritadeira Fake Mineral Waters',
    price: 299.9,
    domain_id: 'MLB-MINERAL_WATERS',
    category_id: 'MLB456045',
    thumbnail: 'https://img.example/spoof.jpg',
    permalink: 'https://produto.mercadolivre.com.br/MLB_FB_SPOOF'
  };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/products/search?')) return json({ results: [] });
      if (value.includes('/highlights/')) return json({ content: [] });
      if (value.includes('/sites/MLB/search?')) {
        return json({ results: [fallbackSpoof] });
      }
      return json({});
    },
  });

  assert.equal(result.products.length, 0, 'Item do fallback com domínio proibido deve ser rejeitado');
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackWhitelistedRejected >= 1, true);
  assert.equal(result.mercadolivreDomainCategorySearchV1.forbiddenDomainsRejected >= 1, true);
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackOpenCalls, 0);
});

test('6. Flag true: Família não certificada nunca aciona fallback', async () => {
  let fallbackCalled = false;

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['panela', 'teclado'],
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: async (url) => {
      const value = String(url);
      if (value.includes('/sites/MLB/search?')) {
        fallbackCalled = true;
        return json({ results: [] });
      }
      return json({});
    },
  });

  assert.equal(fallbackCalled, false, 'Famílias não certificadas nunca devem chamar /sites/MLB/search');
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackWhitelistedCalls, 0);
  assert.equal(result.mercadolivreDomainCategorySearchV1.fallbackOpenCalls, 0);
  for (const q of result.queries) {
    assert.equal(q.status, 'skipped_non_certified');
  }
});

test('7. Flag true: rejeita acessórios e peças via negativeTerms', async () => {
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

test('8. Flag true: respeita minConfidence para famílias de média confiança', async () => {
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
      if (value.includes('/sites/MLB/search?')) return json({ results: [] });
      throw new Error(`URL inesperada: ${value}`);
    },
  });

  assert.equal(resultAllConf.products.length, 1);
  assert.equal(resultAllConf.products[0].title, 'Tênis Feminino Casual Confortável');
});
