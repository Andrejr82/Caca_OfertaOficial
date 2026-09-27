'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  extractProductFamily,
  selectDiversePortfolio,
  discoverShopeeScenarioOffers,
} = require('../shopee-engine.cjs');

const {
  discoverMercadoLivreScenarioOffers,
} = require('../mercadolivre-engine.cjs');

const {
  discoverAmazonScenarioOffers,
} = require('../amazon-engine.cjs');

test('extractProductFamily identifica corretamente famílias de produtos para balanceamento', () => {
  assert.equal(extractProductFamily('Jogo de Lençol Casal 400 Fios Micropercal'), 'cama_lencol');
  assert.equal(extractProductFamily('Kit 2 Travesseiros Toque de Pluma'), 'cama_travesseiro');
  assert.equal(extractProductFamily('Edredom Dupla Face Sherpa Casal'), 'cama_edredom');
  assert.equal(extractProductFamily('Jogo de Panelas Antiaderente Cerâmica 5 Peças'), 'cozinha_panelas');
  assert.equal(extractProductFamily('Kit 10 Potes de Vidro Herméticos com Trava'), 'cozinha_armazenamento');
  assert.equal(extractProductFamily('Faqueiro Inox 24 Peças com Gaveteiro'), 'cozinha_mesa');
  assert.equal(extractProductFamily('Jogo de Toalhas de Banho Banhão 5 Peças'), 'banho_higiene');
  assert.equal(extractProductFamily('Escorredor de Louça Inox 2 Andares'), 'cozinha_utensilios');
});

test('selectDiversePortfolio distribui vagas equitativamente entre famílias sem monopólio de categoria', () => {
  const mockCandidates = [
    // 6 Lençóis (alta pontuação)
    { id: '1', title: 'Jogo de Lençol Casal A', score: 99, currentPrice: 20 },
    { id: '2', title: 'Jogo de Lençol Casal B', score: 98, currentPrice: 22 },
    { id: '3', title: 'Jogo de Lençol Casal C', score: 97, currentPrice: 25 },
    { id: '4', title: 'Jogo de Lençol Casal D', score: 96, currentPrice: 28 },
    { id: '5', title: 'Jogo de Lençol Casal E', score: 95, currentPrice: 30 },
    { id: '6', title: 'Jogo de Lençol Casal F', score: 94, currentPrice: 32 },

    // 4 Panelas
    { id: '7', title: 'Jogo de Panelas Antiaderente 5 Peças', score: 90, currentPrice: 150 },
    { id: '8', title: 'Conjunto de Panelas Cerâmica Premium', score: 89, currentPrice: 220 },
    { id: '9', title: 'Frigideira Francesa Antiaderente 24cm', score: 85, currentPrice: 45 },
    { id: '10', title: 'Panela de Pressão 4.5L Fechamento Externo', score: 84, currentPrice: 130 },

    // 4 Potes Herméticos
    { id: '11', title: 'Kit 10 Potes Herméticos de Vidro com Trava', score: 88, currentPrice: 79 },
    { id: '12', title: 'Jogo 6 Potes Herméticos Quadrados', score: 86, currentPrice: 59 },
    { id: '13', title: 'Porta Mantimentos Vidro Hermético Tampa Bambu', score: 82, currentPrice: 49 },

    // 3 Faqueiros
    { id: '14', title: 'Faqueiro Inox 24 Peças Tramontina', score: 87, currentPrice: 65 },
    { id: '15', title: 'Aparelho de Jantar 20 Peças Porcelana', score: 83, currentPrice: 190 },

    // 3 Toalhas de Banho
    { id: '16', title: 'Jogo de Toalhas Banhão 5 Peças 100% Algodão', score: 91, currentPrice: 89 },
    { id: '17', title: 'Kit Toalha de Banho Gigante Hotel', score: 86, currentPrice: 55 },
  ];

  const selected = selectDiversePortfolio(mockCandidates, { maxPerFamily: 3, targetTotal: 12 });

  assert.equal(selected.length, 12, 'Deve selecionar 12 produtos no total');

  const lencolCount = selected.filter((p) => extractProductFamily(p.title) === 'cama_lencol').length;
  assert.equal(lencolCount, 3, 'Deve conter no máximo 3 lençóis (sem monopólio da categoria)');

  const panelasCount = selected.filter((p) => extractProductFamily(p.title) === 'cozinha_panelas').length;
  assert.equal(panelasCount, 3, 'Deve conter 3 jogos de panelas');

  const potesCount = selected.filter((p) => extractProductFamily(p.title) === 'cozinha_armazenamento').length;
  assert.equal(potesCount, 2, 'Deve conter 2 potes herméticos');

  const banhoCount = selected.filter((p) => extractProductFamily(p.title) === 'banho_higiene').length;
  assert.equal(banhoCount, 2, 'Deve conter 2 toalhas de banho');

  const mesaCount = selected.filter((p) => extractProductFamily(p.title) === 'cozinha_mesa').length;
  assert.equal(mesaCount, 2, 'Deve conter 2 itens de mesa posta / faqueiro');
});

test('Shopee Engine executa 100% das palavras-chave do cenário sem corte prematuro', async () => {
  const calledKeywords = [];
  const mockFetch = async () => ({
    status: 200,
    json: async () => ({
      data: {
        productOfferV2: {
          nodes: [
            {
              itemId: 'item_' + Math.random(),
              shopId: 'shop_1',
              productName: 'Produto Teste ' + Math.random(),
              price: '50.00',
              priceDiscountRate: '30',
              ratingStar: '4.8',
              sales: 100,
              commissionRate: '10',
              shopType: [1],
              imageUrl: 'https://img.shopee.com/1.jpg',
              productLink: 'https://shopee.com.br/product/1/1',
              offerLink: 'https://s.shopee.com.br/aff_1',
            },
          ],
          pageInfo: { page: 1, hasNextPage: false },
        },
      },
    }),
  });

  const res = await discoverShopeeScenarioOffers('casa_cozinha_editorial', {
    targetTotal: 10,
    fetchImpl: mockFetch,
  });

  // O cenário casa_cozinha_editorial possui 21 palavras-chave cadastradas
  assert.ok(res.calls.length >= 20, `Shopee Engine deve consultar todas as palavras-chave (chamadas: ${res.calls.length})`);
});

test('Mercado Livre Engine executa 100% das palavras-chave do cenário sem corte prematuro', async () => {
  const calledKeywords = [];
  const mockFetch = async (url) => {
    if (url.includes('/domain_discovery/')) {
      return { ok: true, json: async () => [{ domain_id: 'MLB-HOME', category_id: 'MLB1055', category_name: 'Casa' }] };
    }
    if (url.includes('/highlights/')) {
      return { ok: true, json: async () => ({ content: [] }) };
    }
    if (url.includes('/products/search')) {
      return {
        ok: true,
        json: async () => ({
          results: [
            {
              id: 'MLB_PROD_' + Math.random(),
              name: 'Item ML ' + Math.random(),
              domain_id: 'MLB-HOME',
              category_id: 'MLB1055',
              pictures: [{ url: 'https://img.ml.com/1.jpg' }],
            },
          ],
        }),
      };
    }
    if (url.includes('/items')) {
      return {
        ok: true,
        json: async () => [
          {
            id: 'MLB_ITEM_' + Math.random(),
            title: 'Item Real ' + Math.random(),
            price: 100,
            original_price: 150,
            sold_quantity: 50,
            permalink: 'https://produto.mercadolivre.com.br/p/MLB1',
            thumbnail: 'https://img.ml.com/1.jpg',
            shipping: { free_shipping: true },
          },
        ],
      };
    }
    return { ok: true, json: async () => ({}) };
  };

  const res = await discoverMercadoLivreScenarioOffers('casa_cozinha_editorial', {
    targetTotal: 10,
    fetchImpl: mockFetch,
  });

  assert.ok(res.calls.length >= 20, `ML Engine deve consultar todas as palavras-chave (chamadas: ${res.calls.length})`);
});

test('Amazon Engine executa 100% das palavras-chave do cenário sem corte slice(0, 4)', async () => {
  const mockFetch = async () => ({
    ok: true,
    status: 200,
    text: async () => `
      <div data-component-type="s-search-result" data-asin="B00EXAMPLE">
        <h2><span>Conjunto de Panelas Cerâmica</span></h2>
        <span class="a-price-whole">199</span><span class="a-price-fraction">90</span>
        <img src="https://m.media-amazon.com/images/I/panela.jpg" alt="Panela" />
        <a href="/dp/B00EXAMPLE">Link</a>
      </div>
    `,
  });

  const res = await discoverAmazonScenarioOffers('casa_cozinha_editorial', {
    targetTotal: 10,
    fetchImpl: mockFetch,
  });

  assert.ok(res.calls.length >= 20, `Amazon Engine deve consultar todas as palavras-chave (chamadas: ${res.calls.length})`);
});
