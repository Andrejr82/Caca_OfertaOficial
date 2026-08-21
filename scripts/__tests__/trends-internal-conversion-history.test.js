const test = require('node:test');
const assert = require('node:assert/strict');
const {
  getCandidateOfficialIdentityKeys,
  getOfferOfficialIdentityKeys,
  classifyClickEvents,
  fetchInternalOfferPerformanceMap,
  buildTrendRadarProductsFromCandidates,
} = require('../oracle-trends-radar-engine.cjs');
const {
  calculateInternalConversion,
  calculateCommercialOpportunityScoreV4,
} = require('../../src/core/trends/commercial-opportunity-score-v4.cjs');

test('PARTE B: Identidades oficiais Shopee e Mercado Livre são determinísticas e estritas', () => {
  // Shopee com shopId e itemId
  const shopeeCandidate = {
    marketplace: 'Shopee',
    itemId: '23593642820',
    shopId: '1379077822',
  };
  const shopeeKeys = getCandidateOfficialIdentityKeys(shopeeCandidate);
  assert.ok(shopeeKeys.includes('shopee:shop:1379077822:item:23593642820'));

  // Shopee oferta com shopId e itemId
  const shopeeOffer = {
    platform: 'Shopee',
    shopee_item_id: '23593642820',
    shopee_shop_id: '1379077822',
  };
  const shopeeOfferKeys = getOfferOfficialIdentityKeys(shopeeOffer);
  assert.ok(shopeeOfferKeys.includes('shopee:shop:1379077822:item:23593642820'));

  // Mercado Livre candidato com catalog productId e item itemId
  const mlCandidate = {
    marketplace: 'Mercado Livre',
    productId: 'MLB45471942',
    itemId: 'MLB6937693650',
  };
  const mlKeys = getCandidateOfficialIdentityKeys(mlCandidate);
  assert.ok(mlKeys.includes('mercadolivre:catalog:mlb45471942'));
  assert.ok(mlKeys.includes('mercadolivre:item:mlb6937693650'));

  // Mercado Livre oferta com original_url contendo /p/MLB...
  const mlOffer = {
    platform: 'Mercado Livre',
    original_url: 'https://www.mercadolivre.com.br/produto/p/MLB45471942',
  };
  const mlOfferKeys = getOfferOfficialIdentityKeys(mlOffer);
  assert.ok(mlOfferKeys.includes('mercadolivre:catalog:mlb45471942'));
});

test('PARTE B: Classificação de cliques distingue tráfego humano vs técnico vs ambíguo', () => {
  const linkIdToOfferId = new Map([
    ['link-wp', 'offer-1'],
    ['link-tg', 'offer-1'],
    ['link-bot', 'offer-1'],
    ['link-fb', 'offer-1'],
  ]);
  const linkIdToChannel = new Map([
    ['link-wp', 'whatsapp'],
    ['link-tg', 'telegram'],
    ['link-bot', 'website'],
    ['link-fb', 'facebook'],
  ]);

  const nowIso = new Date().toISOString();
  const events = [
    // 1. WhatsApp humano
    { affiliate_link_id: 'link-wp', source: 'whatsapp', device_type: 'mobile', created_at: nowIso },
    // 2. Telegram humano
    { affiliate_link_id: 'link-tg', source: 'telegram', device_type: 'mobile', created_at: nowIso },
    // 3. Bot/crawler técnico
    { affiliate_link_id: 'link-bot', source: 'googlebot', device_type: 'bot', created_at: nowIso },
    // 4. Facebook desktop sem ref -> ambíguo
    { affiliate_link_id: 'link-fb', source: 'facebook', device_type: 'desktop', created_at: nowIso },
  ];

  const { statsByOfferId } = classifyClickEvents(events, {
    linkIdToOfferId,
    linkIdToChannel,
  });

  const stats = statsByOfferId.get('offer-1');
  assert.ok(stats, 'Stats devem existir para offer-1');
  assert.equal(stats.humanProbableClicks, 2, '2 cliques humanos');
  assert.equal(stats.technicalClicks, 1, '1 clique técnico de bot');
  assert.equal(stats.ambiguousClicks, 1, '1 clique ambíguo de Facebook desktop');
});

test('PARTE B: internalConversion estados conforme volume de cliques humanos e vendas', () => {
  // 1. Sem histórico correspondente
  const noHist = calculateInternalConversion({ internalPerformance: { matched: false } });
  assert.equal(noHist.internalConversionStatus, 'no_internal_history');
  assert.equal(noHist.score, 0);

  // 2. Amostra inicial insuficiente (0 a 9 cliques humanos, 0 vendas)
  const insuff = calculateInternalConversion({
    internalPerformance: {
      matched: true,
      humanProbableClicks: 5,
      attributedSales: 0,
    },
  });
  assert.equal(insuff.internalConversionStatus, 'insufficient_history');
  assert.equal(insuff.score, 0);

  // 3. Amostra representativa sem conversão (>= 10 cliques humanos, 0 vendas)
  const zeroConv = calculateInternalConversion({
    internalPerformance: {
      matched: true,
      humanProbableClicks: 15,
      attributedSales: 0,
    },
  });
  assert.equal(zeroConv.internalConversionStatus, 'observed_zero_conversion');
  assert.equal(zeroConv.score, 0);

  // 4. Conversão comprovada (>= 1 venda atribuída)
  const obsConv = calculateInternalConversion({
    internalPerformance: {
      matched: true,
      humanProbableClicks: 20,
      attributedSales: 2,
    },
  });
  assert.equal(obsConv.internalConversionStatus, 'observed_conversion');
  assert.ok(obsConv.score > 0, 'Score deve ser positivo para conversão comprovada');
  assert.equal(obsConv.attributedSales, 2);
  assert.equal(obsConv.internalConversionRate, 10); // 2/20 = 10%
});

test('PARTE A: directEvidence inclui image_url oficial e preserva integridade do snapshot', () => {
  const candidate = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB1234567890',
    productName: 'Carrinho De Bebê Teste',
    title: 'Carrinho De Bebê Teste',
    price: 350.0,
    sales: 100,
    ratingStar: 4.8,
    permalink: 'https://produto.mercadolivre.com.br/MLB-1234567890-carrinho.html',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_2X_carrinho.webp',
  };

  const radarProducts = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-img',
    mlCandidates: [candidate],
  });

  assert.ok(radarProducts.length > 0, 'Candidato deve gerar produto no radar');
  const product = radarProducts[0];
  const evidence = product.direct_evidence[0];

  assert.equal(evidence.image_url, 'https://http2.mlstatic.com/D_NQ_NP_2X_carrinho.webp', 'image_url deve ser persistida na evidência direta');
  assert.equal(evidence.commercial_metrics.image_url, 'https://http2.mlstatic.com/D_NQ_NP_2X_carrinho.webp', 'image_url deve estar nos commercial_metrics');
});
