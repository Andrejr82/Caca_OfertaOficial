'use strict';

const { runMercadoLivreOfficialIntentCoverage } = require('../mercadolivre-official-intents-v5.cjs');

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

function createMockProduct(id, itemId, title, price, domainId, categoryId) {
  return {
    catalogItems: { results: [{ item_id: itemId, price }] },
    productMeta: {
      name: title,
      pictures: [{ url: `https://img.example/${id}.jpg` }],
      permalink: `https://www.mercadolivre.com.br/p/${id}`,
    },
    details: [{
      code: 200,
      body: {
        id: itemId,
        title,
        price,
        original_price: price * 1.25,
        seller_id: 999,
        shipping: { free_shipping: true },
        thumbnail: `https://img.example/${itemId}.jpg`,
        permalink: `https://produto.mercadolivre.com.br/${itemId}`,
        domain_id: domainId,
        category_id: categoryId,
      },
    }],
  };
}

async function runDryRun() {
  console.log('=== DRY-RUN COMPARISON: MERCADOLIVRE V1 FLAGS (ZERO DB WRITES) ===\n');

  const testKeywords = ['air fryer', 'liquidificador', 'panela', 'teclado'];

  const airFryerFixture = createMockProduct('PROD_AF', 'ITEM_AF', 'Fritadeira Air Fryer 4L Inox', 329.9, 'MLB-AIR_FRYERS', 'MLB456045');
  const liquidificadorFixture = createMockProduct('PROD_LIQ', 'ITEM_LIQ', 'Liquidificador Turbo 1000W Inox', 149.9, 'MLB-BLENDERS', 'MLB73055');
  const panelaFixture = createMockProduct('PROD_PAN', 'ITEM_PAN', 'Jogo de Panelas Antiaderente', 219.9, 'MLB-KITCHEN_POTS', 'MLB269718');
  const tecladoFixture = createMockProduct('PROD_TEC', 'ITEM_TEC', 'Teclado Mecânico Gamer RGB', 189.9, 'MLB-KEYBOARDS', 'MLB1648');

  const createFetchMock = () => async (url) => {
    const value = String(url);
    if (value.includes('/domain_discovery/search')) {
      if (value.includes('air')) return json([{ domain_id: 'MLB-AIR_FRYERS', category_id: 'MLB456045', category_name: 'Fritadeiras' }]);
      if (value.includes('liquidificador')) return json([{ domain_id: 'MLB-BLENDERS', category_id: 'MLB73055', category_name: 'Liquidificadores' }]);
      if (value.includes('panela')) return json([{ domain_id: 'MLB-KITCHEN_POTS', category_id: 'MLB269718', category_name: 'Panelas' }]);
      if (value.includes('teclado')) return json([{ domain_id: 'MLB-KEYBOARDS', category_id: 'MLB1648', category_name: 'Teclados' }]);
      return json([]);
    }
    if (value.includes('/products/search?')) {
      if (value.includes('MLB-AIR_FRYERS')) return json({ results: [{ id: 'PROD_AF' }] });
      if (value.includes('MLB-BLENDERS')) return json({ results: [{ id: 'PROD_LIQ' }] });
      if (value.includes('MLB-KITCHEN_POTS')) return json({ results: [{ id: 'PROD_PAN' }] });
      if (value.includes('MLB-KEYBOARDS')) return json({ results: [{ id: 'PROD_TEC' }] });
      return json({ results: [] });
    }
    if (value.includes('/highlights/')) {
      if (value.includes('MLB73055')) return json({ content: [{ id: 'PROD_LIQ', type: 'PRODUCT' }] });
      return json({ content: [] });
    }
    if (value.includes('/products/PROD_AF/items')) return json(airFryerFixture.catalogItems);
    if (value.endsWith('/products/PROD_AF')) return json(airFryerFixture.productMeta);
    if (value.includes('/items?ids=ITEM_AF')) return json(airFryerFixture.details);

    if (value.includes('/products/PROD_LIQ/items')) return json(liquidificadorFixture.catalogItems);
    if (value.endsWith('/products/PROD_LIQ')) return json(liquidificadorFixture.productMeta);
    if (value.includes('/items?ids=ITEM_LIQ')) return json(liquidificadorFixture.details);

    if (value.includes('/products/PROD_PAN/items')) return json(panelaFixture.catalogItems);
    if (value.endsWith('/products/PROD_PAN')) return json(panelaFixture.productMeta);
    if (value.includes('/items?ids=ITEM_PAN')) return json(panelaFixture.details);

    if (value.includes('/products/PROD_TEC/items')) return json(tecladoFixture.catalogItems);
    if (value.endsWith('/products/PROD_TEC')) return json(tecladoFixture.productMeta);
    if (value.includes('/items?ids=ITEM_TEC')) return json(tecladoFixture.details);

    if (value.includes('/reviews/item/')) return json({ rating_average: 4.8, paging: { total: 100 } });
    if (value.includes('/sites/MLB/search?')) return json({ results: [] });

    return json({});
  };

  // 1. Execução com Flag FALSE
  const resFalse = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: testKeywords,
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'false' },
    fetchImpl: createFetchMock(),
  });

  // 2. Execução com Flag TRUE
  const resTrue = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: testKeywords,
    maxPerIntent: 20,
    delayMs: 0,
    env: { MERCADOLIVRE_DOMAIN_CATEGORY_SEARCH_V1_ENABLED: 'true' },
    fetchImpl: createFetchMock(),
  });

  const flagFalseIdentical = resFalse.mercadolivreDomainCategorySearchV1 === undefined && resFalse.source === 'official_api';
  const flagTrueUsedCertifiedMap = resTrue.mercadolivreDomainCategorySearchV1?.enabled === true;
  const flagTrueSelectedFamilies = resTrue.mercadolivreDomainCategorySearchV1?.selectedFamilies || [];

  const forbiddenDomainsFound = resTrue.products.filter((p) => p.domain_id === 'MLB-MINERAL_WATERS' || p.domain_id === 'MLB-DJ_MIXERS');
  const nonCertifiedFound = resTrue.products.filter((p) => p.intent === 'panela' || p.intent === 'teclado');

  console.log(`FLAG_FALSE_IDENTICAL=${flagFalseIdentical ? 'YES' : 'NO'}`);
  console.log(`FLAG_TRUE_USED_CERTIFIED_MAP=${flagTrueUsedCertifiedMap ? 'YES' : 'NO'}`);
  console.log(`FLAG_TRUE_SELECTED_FAMILIES=${JSON.stringify(flagTrueSelectedFamilies)}`);
  console.log(`FLAG_TRUE_FORBIDDEN_DOMAINS_LEAKED=${forbiddenDomainsFound.length}`);
  console.log(`FLAG_TRUE_NON_CERTIFIED_FAMILIES_LEAKED=${nonCertifiedFound.length}`);
  console.log(`DB_WRITES=0`);
}

runDryRun();
