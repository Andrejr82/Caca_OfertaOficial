'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { runMercadoLivreOfficialIntentCoverage } = require('../mercadolivre-official-intents-v5.cjs');

const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'content-type': 'application/json' },
});

test('1. intent=geladeira rejeita TOY_REFRIGERATORS e explora REFRIGERATORS', async () => {
  const toyDomain = { domain_id: 'MLB-TOY_REFRIGERATORS', category_id: 'MLB270287', category_name: 'Geladeiras de Brinquedo' };
  const realDomain = { domain_id: 'MLB-REFRIGERATORS', category_id: 'MLB181294', category_name: 'Geladeiras' };

  const calls = [];
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['geladeira'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/domain_discovery/search')) return json([toyDomain, realDomain]);
      if (u.includes('domain_id=MLB-TOY_REFRIGERATORS')) {
        throw new Error('Não deve chamar products/search para TOY_REFRIGERATORS em busca padrão de geladeira');
      }
      if (u.includes('domain_id=MLB-REFRIGERATORS')) {
        return json({ results: [{ id: 'MLBPRODREALGEL' }] });
      }
      if (u.includes('/products/MLBPRODREALGEL/items')) {
        return json({ results: [{ item_id: 'MLBITEMGEL1', price: 2999 }] });
      }
      if (u.endsWith('/products/MLBPRODREALGEL')) {
        return json({ name: 'Geladeira Frost Free Duplex 400L Inox', pictures: [{ url: 'https://img.example/gel.jpg' }] });
      }
      if (u.includes('/items?ids=')) {
        return json([{ code: 200, body: { id: 'MLBITEMGEL1', title: 'Geladeira Frost Free Duplex 400L Inox', price: 2999, seller_id: 100 } }]);
      }
      if (u.includes('/reviews/item/')) {
        return json({ rating_average: 4.7, paging: { total: 150 } });
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].domain_id, 'MLB-REFRIGERATORS');
  assert.equal(result.products[0].title, 'Geladeira Frost Free Duplex 400L Inox');
});

test('2. intent=air fryer rejeita MINERAL_WATERS e aceita AIR_FRYERS', async () => {
  const waterDomain = { domain_id: 'MLB-MINERAL_WATERS', category_id: 'MLB269718', category_name: 'Águas Minerais' };
  const fryerDomain = { domain_id: 'MLB-AIR_FRYERS', category_id: 'MLB456045', category_name: 'Fritadeiras Elétricas' };

  const calls = [];
  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      calls.push(u);
      if (u.includes('/domain_discovery/search')) return json([waterDomain, fryerDomain]);
      if (u.includes('domain_id=MLB-MINERAL_WATERS')) {
        throw new Error('Não deve chamar products/search para MINERAL_WATERS em busca de air fryer');
      }
      if (u.includes('domain_id=MLB-AIR_FRYERS')) {
        return json({ results: [{ id: 'MLBPRODFRYER1' }] });
      }
      if (u.includes('/products/MLBPRODFRYER1/items')) {
        return json({ results: [{ item_id: 'MLBITEMFRY1', price: 349 }] });
      }
      if (u.endsWith('/products/MLBPRODFRYER1')) {
        return json({ name: 'Fritadeira Elétrica Air Fryer 4L Digital', pictures: [{ url: 'https://img.example/fryer.jpg' }] });
      }
      if (u.includes('/items?ids=')) {
        return json([{ code: 200, body: { id: 'MLBITEMFRY1', title: 'Fritadeira Elétrica Air Fryer 4L Digital', price: 349, seller_id: 101 } }]);
      }
      if (u.includes('/reviews/item/')) {
        return json({ rating_average: 4.9, paging: { total: 420 } });
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].domain_id, 'MLB-AIR_FRYERS');
  assert.equal(result.products[0].title, 'Fritadeira Elétrica Air Fryer 4L Digital');
});

test('3. intent=liquidificador rejeita produto Purificador de Água (PRODUCT_INTENT_MISMATCH)', async () => {
  const blenderDomain = { domain_id: 'MLB-BLENDERS', category_id: 'MLB73055', category_name: 'Liquidificadores' };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['liquidificador'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/domain_discovery/search')) return json([blenderDomain]);
      if (u.includes('/products/search')) {
        return json({ results: [{ id: 'MLBPRODPURIFIER' }, { id: 'MLBPRODBLENDER' }] });
      }
      if (u.includes('/products/MLBPRODPURIFIER/items')) {
        return json({ results: [{ item_id: 'MLBITEMPUR1', price: 689 }] });
      }
      if (u.endsWith('/products/MLBPRODPURIFIER')) {
        return json({ name: 'Purificador de Água Gelada Electrolux PE12G', pictures: [{ url: 'https://img.example/pur.jpg' }] });
      }
      if (u.includes('/products/MLBPRODBLENDER/items')) {
        return json({ results: [{ item_id: 'MLBITEMBLEND1', price: 149 }] });
      }
      if (u.endsWith('/products/MLBPRODBLENDER')) {
        return json({ name: 'Liquidificador Turbo Power 550W Preto', pictures: [{ url: 'https://img.example/blend.jpg' }] });
      }
      if (u.includes('/items?ids=')) {
        return json([{ code: 200, body: { id: 'MLBITEMBLEND1', title: 'Liquidificador Turbo Power 550W Preto', price: 149, seller_id: 102 } }]);
      }
      if (u.includes('/reviews/item/')) {
        return json({ rating_average: 4.6, paging: { total: 80 } });
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].title, 'Liquidificador Turbo Power 550W Preto');
  assert.equal(result.products[0].product_id, 'MLBPRODBLENDER');
});

test('4. dedup canônico: mesmo product_id com 3 itens (399, 349, 379) gera 1 produto canônico com menor preço 349 e active_offers_count=3', async () => {
  const blenderDomain = { domain_id: 'MLB-BLENDERS', category_id: 'MLB73055', category_name: 'Liquidificadores' };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['liquidificador'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/domain_discovery/search')) return json([blenderDomain]);
      if (u.includes('/products/search')) return json({ results: [{ id: 'MLBPRODBLENDERCANON' }] });
      if (u.includes('/products/MLBPRODBLENDERCANON/items')) {
        return json({
          results: [
            { item_id: 'MLBITEM_A', price: 399 },
            { item_id: 'MLBITEM_B', price: 349 },
            { item_id: 'MLBITEM_C', price: 379 },
          ]
        });
      }
      if (u.endsWith('/products/MLBPRODBLENDERCANON')) {
        return json({ name: 'Liquidificador Mondial Turbo 1000W', pictures: [{ url: 'https://img.example/blend.jpg' }] });
      }
      if (u.includes('/items?ids=')) {
        return json([
          { code: 200, body: { id: 'MLBITEM_A', title: 'Liquidificador Mondial Turbo 1000W', price: 399, seller_id: 10 } },
          { code: 200, body: { id: 'MLBITEM_B', title: 'Liquidificador Mondial Turbo 1000W', price: 349, seller_id: 20, shipping: { free_shipping: true } } },
          { code: 200, body: { id: 'MLBITEM_C', title: 'Liquidificador Mondial Turbo 1000W', price: 379, seller_id: 30 } },
        ]);
      }
      if (u.includes('/reviews/item/')) {
        return json({ rating_average: 4.8, paging: { total: 200 } });
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  const p = result.products[0];
  assert.equal(p.product_id, 'MLBPRODBLENDERCANON');
  assert.equal(p.selected_item_id, 'MLBITEM_B');
  assert.equal(p.current_price, 349);
  assert.equal(p.active_offers_count, 3);
  assert.equal(p.min_price, 349);
  assert.equal(p.max_price, 399);
  assert.equal(p.seller_count, 3);
});

test('5. reviews enriquecem rating_average=4.8 e review_count=321', async () => {
  const fryerDomain = { domain_id: 'MLB-AIR_FRYERS', category_id: 'MLB456045', category_name: 'Fritadeiras Elétricas' };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/domain_discovery/search')) return json([fryerDomain]);
      if (u.includes('/products/search')) return json({ results: [{ id: 'MLBPRODFRYER_REV' }] });
      if (u.includes('/products/MLBPRODFRYER_REV/items')) return json({ results: [{ item_id: 'MLBITEMFRY_REV', price: 299 }] });
      if (u.endsWith('/products/MLBPRODFRYER_REV')) return json({ name: 'Fritadeira Air Fryer 3.5L Inox', pictures: [{ url: 'https://img.example/fry.jpg' }] });
      if (u.includes('/items?ids=')) return json([{ code: 200, body: { id: 'MLBITEMFRY_REV', title: 'Fritadeira Air Fryer 3.5L Inox', price: 299, seller_id: 50 } }]);
      if (u.includes('/reviews/item/MLBITEMFRY_REV')) {
        return json({ rating_average: 4.8, paging: { total: 321 } });
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  const p = result.products[0];
  assert.equal(p.rating, 4.8);
  assert.equal(p.review_count, 321);
});

test('6. reviews retornando 404 mantém produto válido com rating=null e review_count=null', async () => {
  const fryerDomain = { domain_id: 'MLB-AIR_FRYERS', category_id: 'MLB456045', category_name: 'Fritadeiras Elétricas' };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['air fryer'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/domain_discovery/search')) return json([fryerDomain]);
      if (u.includes('/products/search')) return json({ results: [{ id: 'MLBPRODFRYER_NO_REV' }] });
      if (u.includes('/products/MLBPRODFRYER_NO_REV/items')) return json({ results: [{ item_id: 'MLBITEMFRY_NO_REV', price: 299 }] });
      if (u.endsWith('/products/MLBPRODFRYER_NO_REV')) return json({ name: 'Fritadeira Air Fryer 3.5L Inox', pictures: [{ url: 'https://img.example/fry.jpg' }] });
      if (u.includes('/items?ids=')) return json([{ code: 200, body: { id: 'MLBITEMFRY_NO_REV', title: 'Fritadeira Air Fryer 3.5L Inox', price: 299, seller_id: 50 } }]);
      if (u.includes('/reviews/item/MLBITEMFRY_NO_REV')) {
        return json({ message: 'Review not found' }, 404);
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  const p = result.products[0];
  assert.equal(p.product_id, 'MLBPRODFRYER_NO_REV');
  assert.equal(p.rating, null);
  assert.equal(p.review_count, null);
});

test('7. televisão 4K + MINERAL_WATERS rejeita domínio de água mineral', async () => {
  const waterDomain = { domain_id: 'MLB-MINERAL_WATERS', category_id: 'MLB269718', category_name: 'Águas Minerais' };
  const tvDomain = { domain_id: 'MLB-TELEVISIONS', category_id: 'MLB1002', category_name: 'Televisores' };

  const result = await runMercadoLivreOfficialIntentCoverage({
    accessToken: 'fixture-token',
    keywords: ['televisão 4K'],
    maxPerIntent: 20,
    delayMs: 0,
    fetchImpl: async (url) => {
      const u = String(url);
      if (u.includes('/domain_discovery/search')) return json([waterDomain, tvDomain]);
      if (u.includes('domain_id=MLB-MINERAL_WATERS')) {
        throw new Error('Não deve chamar products/search para MINERAL_WATERS em busca de televisão');
      }
      if (u.includes('domain_id=MLB-TELEVISIONS')) {
        return json({ results: [{ id: 'MLBPRODTV4K' }] });
      }
      if (u.includes('/products/MLBPRODTV4K/items')) {
        return json({ results: [{ item_id: 'MLBITEMTV1', price: 2199 }] });
      }
      if (u.endsWith('/products/MLBPRODTV4K')) {
        return json({ name: 'Smart TV 50 Polegadas 4K UHD Wi-Fi HDR', pictures: [{ url: 'https://img.example/tv.jpg' }] });
      }
      if (u.includes('/items?ids=')) {
        return json([{ code: 200, body: { id: 'MLBITEMTV1', title: 'Smart TV 50 Polegadas 4K UHD Wi-Fi HDR', price: 2199, seller_id: 60 } }]);
      }
      if (u.includes('/reviews/item/')) {
        return json({ rating_average: 4.7, paging: { total: 95 } });
      }
      throw new Error(`URL inesperada: ${u}`);
    },
  });

  assert.equal(result.products.length, 1);
  assert.equal(result.products[0].domain_id, 'MLB-TELEVISIONS');
  assert.equal(result.products[0].title, 'Smart TV 50 Polegadas 4K UHD Wi-Fi HDR');
});
