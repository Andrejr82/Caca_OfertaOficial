'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
  WEIGHTS_V4,
  parsePercentage,
  classifyTicket,
  calculateEconomicReturn,
  calculateInternalConversion,
  calculateMarketplaceDemand,
  calculateReputation,
  calculateOfferCompetitiveness,
  calculateIdentityTraceability,
  calculateVisualPotential,
  classifyCommercialDecision,
  calculateCommercialOpportunityScoreV4,
} = require('../../src/core/trends/commercial-opportunity-score-v4.cjs');

test('parsePercentage: normaliza valores inteiros e fracionários sem distorcer 1 como 100%', () => {
  // Obrigatórios pela especificação:
  assert.equal(parsePercentage(1), 1, '1 deve representar 1% e não 100%');
  assert.equal(parsePercentage(0.01), 1, '0.01 deve representar 1%');
  assert.equal(parsePercentage('1'), 1, "'1' em string deve representar 1%");
  assert.equal(parsePercentage('0.01'), 1, "'0.01' em string deve representar 1%");

  // Combinação 4 + 1 => 5%:
  const candidate = {
    currentPrice: 100,
    commissionRate: 4,
    sellerCommissionRate: 1,
  };
  const econ = calculateEconomicReturn(candidate);
  assert.equal(econ.effectiveCommissionPercent, 5, 'commissionRate=4 + sellerCommissionRate=1 deve resultar em 5%');
  assert.equal(econ.estimatedCommissionPerSale, 5.0, 'R$ 100 a 5% deve ser R$ 5.00');

  // Formatos válidos existentes:
  assert.equal(parsePercentage(15), 15);
  assert.equal(parsePercentage('10'), 10);
  assert.equal(parsePercentage(0.15), 15);
  assert.equal(parsePercentage('0.08'), 8);
  assert.equal(parsePercentage(0), 0);
  assert.equal(parsePercentage(null), null);
  assert.equal(parsePercentage('abc'), null);
});

test('weights V4 sum to exactly 100', () => {
  const sum = Object.values(WEIGHTS_V4).reduce((acc, val) => acc + val, 0);
  assert.equal(sum, 100);
  assert.equal(WEIGHTS_V4.marketplaceDemand, 25);
  assert.equal(WEIGHTS_V4.economicReturn, 20);
  assert.equal(WEIGHTS_V4.internalConversion, 20);
  assert.equal(WEIGHTS_V4.reputation, 10);
  assert.equal(WEIGHTS_V4.offerCompetitiveness, 10);
  assert.equal(WEIGHTS_V4.identityTraceability, 10);
  assert.equal(WEIGHTS_V4.visualPotential, 5);
});

test('classifyTicket categorizes price into impulse, core, upper, premium accurately', () => {
  assert.equal(classifyTicket(19.90), 'impulse');
  assert.equal(classifyTicket(99.99), 'impulse');
  assert.equal(classifyTicket(100.00), 'core');
  assert.equal(classifyTicket(499.90), 'core');
  assert.equal(classifyTicket(500.00), 'upper');
  assert.equal(classifyTicket(1499.00), 'upper');
  assert.equal(classifyTicket(1500.00), 'premium');
  assert.equal(classifyTicket(3500.00), 'premium');
  assert.equal(classifyTicket(0), 'unknown');
  assert.equal(classifyTicket(-10), 'unknown');
  assert.equal(classifyTicket(null), 'unknown');
});

test('TESTE 1: Produto R$ 20 a 13% vs Produto R$ 900 a 5% com demanda equivalente -> R$ 900 vence com vantagem econômica clara', () => {
  // Produto A: Barato (R$ 20) com 13% de comissão -> Retorno estimado = R$ 2,60 (Banda >= R$ 2 = 6 pontos)
  const productA = {
    itemId: 'item-cheap',
    productName: 'Acessório Pequeno Barato',
    permalink: 'https://shopee.com.br/product/1/item-cheap',
    imageUrl: 'https://cf.shopee.com.br/cheap.jpg',
    currentPrice: 20.0,
    sales: 1000,
    ratingStar: 4.8,
    discountPercent: 20,
    commissionRate: 13,
  };

  // Produto B: Core/Upper (R$ 900) com 5% de comissão -> Retorno estimado = R$ 45,00 (Banda >= R$ 40 = 20 pontos)
  const productB = {
    itemId: 'item-core',
    productName: 'Monitor Gamer 27 Pol IPS 165Hz',
    permalink: 'https://shopee.com.br/product/1/item-core',
    imageUrl: 'https://cf.shopee.com.br/core.jpg',
    currentPrice: 900.0,
    sales: 1000,
    ratingStar: 4.8,
    discountPercent: 20,
    commissionRate: 5,
  };

  const scoreA = calculateCommercialOpportunityScoreV4(productA);
  const scoreB = calculateCommercialOpportunityScoreV4(productB);

  assert.equal(scoreA.economic_return.estimatedCommissionPerSale, 2.60);
  assert.equal(scoreA.breakdown.economicReturn, 6);

  assert.equal(scoreB.economic_return.estimatedCommissionPerSale, 45.00);
  assert.equal(scoreB.breakdown.economicReturn, 20);

  assert.ok(scoreB.total > scoreA.total, `Score B (${scoreB.total}) deve ser superior ao Score A (${scoreA.total})`);
  assert.equal(scoreB.total - scoreA.total, 14, 'Diferença deve corresponder exatamente à vantagem de retorno econômico');
});

test('TESTE 2: Produto caro sem demanda não pontua em demanda e não ganha só pelo ticket', () => {
  const expensiveWithoutDemand = {
    itemId: 'item-expensive-no-demand',
    productName: 'Geladeira Inox Smart 500L',
    permalink: 'https://shopee.com.br/product/1/geladeira',
    imageUrl: 'https://cf.shopee.com.br/geladeira.jpg',
    currentPrice: 4500.0,
    sales: null, // sem vendas
    ratingStar: null, // sem rating
    discountPercent: 0,
    commissionRate: 4,
  };

  const score = calculateCommercialOpportunityScoreV4(expensiveWithoutDemand);
  assert.equal(score.breakdown.marketplaceDemand, 0);
  assert.equal(score.ticket_class, 'premium');
  assert.ok(score.total < 60, `Score (${score.total}) deve ser inferior a 60 (IGNORAR)`);
  assert.equal(score.decision, 'IGNORAR');
});

test('TESTE 3: Produto barato forte (alta demanda, bom rating, comissão viável) continua elegível e prioritário', () => {
  const strongImpulse = {
    itemId: 'item-impulse-strong',
    productName: 'Organizador Multiuso Giratório 360',
    permalink: 'https://shopee.com.br/product/1/organizador',
    imageUrl: 'https://cf.shopee.com.br/organizador.jpg',
    currentPrice: 49.90,
    sales: 15000,
    ratingStar: 4.9,
    discountPercent: 40,
    commissionRate: 12,
  };

  const score = calculateCommercialOpportunityScoreV4(strongImpulse, {
    velocityInfo: { velocity_status: 'computed', sales_velocity: 250 },
  });

  assert.equal(score.ticket_class, 'impulse');
  assert.equal(score.breakdown.marketplaceDemand, 22);
  assert.equal(score.breakdown.reputation, 10);
  assert.ok(score.total >= 60, `Score (${score.total}) deve ser elegível para teste/prioridade`);
});

test('TESTE 4: Comissão desconhecida permanece unknown e nunca vira 0% observado', () => {
  const candidateUnknownComm = {
    itemId: 'ml-item-no-comm',
    productName: 'Notebook Profissional 16GB',
    permalink: 'https://mercadolivre.com.br/MLB123',
    currentPrice: 3500.0,
    sales: 200,
    commissionRate: null,
    sellerCommissionRate: null,
  };

  const economic = calculateEconomicReturn(candidateUnknownComm);
  assert.equal(economic.commissionStatus, 'unknown');
  assert.equal(economic.estimatedCommissionPerSale, null);
  assert.equal(economic.effectiveCommissionPercent, null);
  assert.equal(economic.score, 0);
  assert.ok(economic.reason.includes('não informada'));
});

test('TESTE 5: estimatedCommissionPerSale somente é calculada quando comissão válida existe', () => {
  const withComm = { currentPrice: 200, commissionRate: 10 };
  const withoutComm = { currentPrice: 200 };

  const resWith = calculateEconomicReturn(withComm);
  const resWithout = calculateEconomicReturn(withoutComm);

  assert.equal(resWith.estimatedCommissionPerSale, 20.0);
  assert.equal(resWith.commissionStatus, 'observed');

  assert.equal(resWithout.estimatedCommissionPerSale, null);
  assert.equal(resWithout.commissionStatus, 'unknown');
});

test('TESTE 6 & 7: Matching interno só aceita IDs oficiais; produtos com mesmo nome e ID diferente não recebem histórico', () => {
  // Oferta interna cadastrada para o item ID 'OFFICIAL-123'
  const matchedPerformance = {
    matched: true,
    matchedOfferId: 'OFFICIAL-123',
    humanProbableClicks: 50,
    attributedSales: 5,
  };

  // Candidato com mesmo ID oficial
  const candidateOfficial = {
    itemId: 'OFFICIAL-123',
    productName: 'Garrafa Térmica Inox 1L',
    currentPrice: 80,
  };

  // Outro candidato com mesmo nome mas ID diferente ('OTHER-999')
  const candidateDifferentId = {
    itemId: 'OTHER-999',
    productName: 'Garrafa Térmica Inox 1L', // Mesmo nome exato!
    currentPrice: 80,
  };

  const scoreOfficial = calculateCommercialOpportunityScoreV4(candidateOfficial, {
    internalPerformance: matchedPerformance,
  });

  // O candidato de ID diferente não tem match determinístico
  const scoreDifferent = calculateCommercialOpportunityScoreV4(candidateDifferentId, {
    internalPerformance: { matched: false, matchedOfferId: null },
  });

  assert.equal(scoreOfficial.internal_conversion.internalConversionStatus, 'observed_conversion');
  assert.equal(scoreOfficial.breakdown.internalConversion, 20);

  assert.equal(scoreDifferent.internal_conversion.internalConversionStatus, 'no_internal_history');
  assert.equal(scoreDifferent.breakdown.internalConversion, 0);
});

test('TESTE 8: Cliques técnicos e ambíguos não aumentam internalConversion', () => {
  // Somente humanProbableClicks conta
  const internalData = {
    matched: true,
    humanProbableClicks: 0,
    technicalClicks: 500, // Muitos cliques técnicos de bots
    ambiguousClicks: 200, // Muitos cliques ambíguos
    attributedSales: 0,
  };

  const conv = calculateInternalConversion({ itemId: '1' }, { internalPerformance: internalData });
  assert.equal(conv.internalConversionStatus, 'insufficient_history');
  assert.equal(conv.score, 0);
  assert.equal(conv.humanProbableClicks, 0);
});

test('TESTE 9: insufficient_history (<10 human clicks e 0 vendas) não vira conversão zero comprovada', () => {
  const internalData = {
    matched: true,
    humanProbableClicks: 4,
    attributedSales: 0,
  };

  const conv = calculateInternalConversion({ itemId: '1' }, { internalPerformance: internalData });
  assert.equal(conv.internalConversionStatus, 'insufficient_history');
  assert.equal(conv.score, 0);
  assert.ok(conv.reason.includes('insuficiente'));
});

test('TESTE 10: Venda atribuída gera sinal positivo real mesmo com poucos cliques', () => {
  const internalData = {
    matched: true,
    humanProbableClicks: 5,
    attributedSales: 1, // 1 venda em 5 cliques = 20% conversão
  };

  const conv = calculateInternalConversion({ itemId: '1' }, { internalPerformance: internalData });
  assert.equal(conv.internalConversionStatus, 'observed_conversion');
  assert.equal(conv.score, 20);
  assert.equal(conv.attributedSales, 1);
  assert.equal(conv.internalConversionRate, 20.0);
});

test('TESTE 11: >= 10 human clicks e 0 vendas gera observed_zero_conversion com score 0', () => {
  const internalData = {
    matched: true,
    humanProbableClicks: 25,
    attributedSales: 0,
  };

  const conv = calculateInternalConversion({ itemId: '1' }, { internalPerformance: internalData });
  assert.equal(conv.internalConversionStatus, 'observed_zero_conversion');
  assert.equal(conv.score, 0);
  assert.ok(conv.reason.includes('sem conversão'));
});

test('TESTE 12: Score total V4 nunca excede 100 e breakdown bate exatamente com total', () => {
  const perfectCandidate = {
    itemId: 'perfect-id',
    shopId: 'shop-1',
    productName: 'Smart TV 4K UHD 55 Polegadas com Comando de Voz',
    permalink: 'https://shopee.com.br/product/1/perfect',
    imageUrl: 'https://cf.shopee.com.br/tv.jpg',
    currentPrice: 2800.0,
    sales: 50000,
    discountPercent: 50,
    commissionRate: 10,
    ratingStar: 5.0,
  };

  const score = calculateCommercialOpportunityScoreV4(perfectCandidate, {
    velocityInfo: { velocity_status: 'computed', sales_velocity: 800 },
    internalPerformance: { matched: true, humanProbableClicks: 100, attributedSales: 15 },
  });

  assert.equal(score.total, 100);
  assert.equal(score.strategyVersion, COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION);
  assert.equal(score.decision, 'PRIORIDADE');
  assert.equal(score.ticket_class, 'premium');

  const sumBreakdown = Object.values(score.breakdown).reduce((a, b) => a + b, 0);
  assert.equal(sumBreakdown, score.total);
});

test('decision thresholds V4 are deterministic', () => {
  assert.equal(classifyCommercialDecision(100), 'PRIORIDADE');
  assert.equal(classifyCommercialDecision(80), 'PRIORIDADE');
  assert.equal(classifyCommercialDecision(79), 'TESTAR');
  assert.equal(classifyCommercialDecision(60), 'TESTAR');
  assert.equal(classifyCommercialDecision(59), 'IGNORAR');
  assert.equal(classifyCommercialDecision(0), 'IGNORAR');
});

test('CARTEIRA COMERCIAL: Seleção Top 20 respeita quotas de ticket (max 6 impulse, >=5 core, >=4 upper, >=2 premium)', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];

  // 10 Impulse (R$ 50)
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `IMP_${i}`,
      shopId: 'shop-1',
      productName: `Item Impulso Barato ${i}`,
      category: `Categoria Impulso ${i}`,
      currentPrice: 50,
      oldPrice: 100,
      discountPercent: 50,
      sales: 5000,
      ratingStar: 4.8,
      commissionPercent: 10,
    });
  }

  // 10 Core (R$ 250)
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `CORE_${i}`,
      shopId: 'shop-2',
      productName: `Item Core Médio ${i}`,
      category: `Categoria Core ${i}`,
      currentPrice: 250,
      oldPrice: 350,
      discountPercent: 28,
      sales: 2000,
      ratingStar: 4.8,
      commissionPercent: 8,
    });
  }

  // 10 Upper (R$ 800)
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `UPPER_${i}`,
      shopId: 'shop-3',
      productName: `Item Upper Alto ${i}`,
      category: `Categoria Upper ${i}`,
      currentPrice: 800,
      oldPrice: 1000,
      discountPercent: 20,
      sales: 1000,
      ratingStar: 4.8,
      commissionPercent: 6,
    });
  }

  // 10 Premium (R$ 2000)
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `PREM_${i}`,
      shopId: 'shop-4',
      productName: `Item Premium Top ${i}`,
      category: `Categoria Premium ${i}`,
      currentPrice: 2000,
      oldPrice: 2500,
      discountPercent: 20,
      sales: 500,
      ratingStar: 4.9,
      commissionPercent: 5,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-portfolio-run',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 20);

  const impulse = products.filter(p => p.direct_evidence[0].ticket_class === 'impulse');
  const core = products.filter(p => p.direct_evidence[0].ticket_class === 'core');
  const upper = products.filter(p => p.direct_evidence[0].ticket_class === 'upper');
  const premium = products.filter(p => p.direct_evidence[0].ticket_class === 'premium');

  assert.ok(impulse.length <= 6, `Impulse (${impulse.length}) não deve exceder 6 quando há outras faixas disponíveis`);
  assert.ok(core.length >= 5, `Core (${core.length}) deve ter pelo menos 5`);
  assert.ok(upper.length >= 4, `Upper (${upper.length}) deve ter pelo menos 4`);
  assert.ok(premium.length >= 2, `Premium (${premium.length}) deve ter pelo menos 2`);
});

test('CARTEIRA COMERCIAL: Quotas redistribuem vagas quando uma faixa não possui candidatos suficientes sem forçar produtos ruins', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];

  // Apenas 1 Premium viável
  candidates.push({
    marketplace: 'Shopee',
    itemId: 'PREM_SINGLE',
    shopId: 'shop-p',
    productName: 'Notebook Ultra R$ 3500',
    category: 'Informática',
    currentPrice: 3500,
    oldPrice: 4000,
    discountPercent: 12,
    sales: 300,
    ratingStar: 4.8,
    commissionPercent: 5,
  });

  // 10 Core
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `CORE_R_${i}`,
      shopId: 'shop-c',
      productName: `Produto Core Variado ${i}`,
      category: `Categoria C ${i}`,
      currentPrice: 200 + i * 10,
      oldPrice: 300 + i * 10,
      discountPercent: 30,
      sales: 1000,
      ratingStar: 4.8,
      commissionPercent: 8,
    });
  }

  // 15 Impulse
  for (let j = 1; j <= 15; j++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `IMP_R_${j}`,
      shopId: 'shop-i',
      productName: `Produto Impulso Variado ${j}`,
      category: `Categoria I ${j}`,
      currentPrice: 40 + j,
      oldPrice: 80,
      discountPercent: 50,
      sales: 5000,
      ratingStar: 4.8,
      commissionPercent: 10,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-redistribution-run',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 20);
  const premium = products.filter(p => p.direct_evidence[0].ticket_class === 'premium');
  assert.equal(premium.length, 1, 'Deve selecionar o único premium viável disponível sem inventar outro');
  assert.ok(products.length === 20, 'Vagas restantes foram redistribuídas com sucesso');
});

test('CARTEIRA COMERCIAL: Quotas nunca forçam candidatos com viabilidade LOW ou INSUFFICIENT_DATA', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];

  // 2 Premium com LOW viability (rating ruim < 3.5)
  candidates.push({
    marketplace: 'Shopee',
    itemId: 'PREM_BAD_1',
    productName: 'Smart TV Cara Ruim 1',
    category: 'TV',
    currentPrice: 3000,
    ratingStar: 2.0, // LOW
    sales: 100,
    commissionPercent: 5,
  });

  // 2 Upper com INSUFFICIENT_DATA (sem vendas, sem destaque, sem comissão)
  candidates.push({
    marketplace: 'Mercado Livre',
    itemId: 'UPPER_NO_DATA',
    productName: 'Item Alto Sem Dados',
    category: 'Geral',
    currentPrice: 800,
    sales: null,
    ratingStar: null,
    commissionPercent: 0,
    marketplaceDemandEvidence: null, // insufficient_data
  });

  // 5 Core viáveis
  for (let i = 1; i <= 5; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `CORE_GOOD_${i}`,
      productName: `Item Core Bom ${i}`,
      category: `Cat ${i}`,
      currentPrice: 200,
      oldPrice: 300,
      discountPercent: 33,
      sales: 800,
      ratingStar: 4.8,
      commissionPercent: 8,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-no-bad-quotas',
    shopeeCandidates: candidates.filter(c => c.marketplace === 'Shopee'),
    mlCandidates: candidates.filter(c => c.marketplace === 'Mercado Livre'),
    maxProducts: 20,
  });

  assert.equal(products.length, 5, 'Apenas os 5 produtos viáveis devem entrar');
  const hasLow = products.some(p => p.direct_evidence[0].viability_classification === 'low');
  const hasInsufficient = products.some(p => p.direct_evidence[0].viability_classification === 'insufficient_data');
  assert.equal(hasLow, false);
  assert.equal(hasInsufficient, false);
});

// ============================================================================
// TESTES DE INTEGRAÇÃO: Carregamento Real e Determinístico de Histórico Interno
// ============================================================================

function createMockSupabaseClient({
  offers = [],
  affiliateLinks = [],
  clickEvents = [],
  sales = [],
} = {}) {
  return {
    from: (table) => {
      let currentData = [];
      if (table === 'offers') currentData = [...offers];
      else if (table === 'affiliate_links') currentData = [...affiliateLinks];
      else if (table === 'click_events') currentData = [...clickEvents];
      else if (table === 'sales') currentData = [...sales];

      const builder = {
        select: () => builder,
        eq: (col, val) => {
          currentData = currentData.filter(row => row[col] === val);
          return builder;
        },
        neq: (col, val) => {
          currentData = currentData.filter(row => row[col] !== val);
          return builder;
        },
        in: (col, vals) => {
          const set = new Set(vals);
          currentData = currentData.filter(row => set.has(row[col]));
          return builder;
        },
        gte: (col, val) => {
          currentData = currentData.filter(row => !row[col] || new Date(row[col]) >= new Date(val));
          return builder;
        },
        lte: (col, val) => {
          currentData = currentData.filter(row => !row[col] || new Date(row[col]) <= new Date(val));
          return builder;
        },
        then: (resolve) => resolve({ data: currentData, error: null }),
      };
      return builder;
    },
  };
}

test('INTEGRAÇÃO 1: Candidato com IDs oficiais correspondentes recebe histórico real de cliques e vendas', async () => {
  const { fetchInternalOfferPerformanceMap } = require('../oracle-trends-radar-engine.cjs');

  const mockClient = createMockSupabaseClient({
    offers: [
      {
        id: 'offer-shopee-1',
        user_id: 'user-1',
        platform: 'Shopee',
        shopee_item_id: 'ITEM-123',
        shopee_shop_id: 'SHOP-456',
        marketplace_metrics: { itemId: 'ITEM-123', shopId: 'SHOP-456' },
      },
      {
        id: 'offer-ml-1',
        user_id: 'user-1',
        platform: 'Mercado Livre',
        marketplace_metrics: { productId: 'MLB999888' },
      },
    ],
    affiliateLinks: [
      { id: 'link-shopee-1', offer_id: 'offer-shopee-1', clicks: 15 },
      { id: 'link-ml-1', offer_id: 'offer-ml-1', clicks: 8 },
    ],
    clickEvents: [
      { id: 'c1', affiliate_link_id: 'link-shopee-1', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
      { id: 'c2', affiliate_link_id: 'link-shopee-1', device_type: 'desktop', source: 'telegram', created_at: new Date().toISOString() },
      { id: 'c3', affiliate_link_id: 'link-ml-1', device_type: 'mobile', source: 'instagram', created_at: new Date().toISOString() },
    ],
    sales: [
      { id: 's1', offer_id: 'offer-shopee-1', status: 'confirmed', sold_at: new Date().toISOString() },
    ],
  });

  const candidates = [
    { marketplace: 'Shopee', itemId: 'ITEM-123', shopId: 'SHOP-456', productName: 'Item Shopee A' },
    { marketplace: 'Mercado Livre', productId: 'MLB999888', itemId: 'MLB777', productName: 'Item ML B' },
  ];

  const perfMap = await fetchInternalOfferPerformanceMap(mockClient, {
    tenantId: 'user-1',
    candidates,
    windowDays: 30,
  });

  const shopeePerf = perfMap.get('shopee:shop:shop-456:item:item-123');
  assert.ok(shopeePerf, 'Shopee deve ter encontrado match');
  assert.equal(shopeePerf.matched, true);
  assert.equal(shopeePerf.matchedOfferId, 'offer-shopee-1');
  assert.equal(shopeePerf.humanProbableClicks, 2);
  assert.equal(shopeePerf.attributedSales, 1);

  const mlPerf = perfMap.get('mercadolivre:catalog:mlb999888');
  assert.ok(mlPerf, 'Mercado Livre deve ter encontrado match por productId');
  assert.equal(mlPerf.matched, true);
  assert.equal(mlPerf.matchedOfferId, 'offer-ml-1');
  assert.equal(mlPerf.humanProbableClicks, 1);
  assert.equal(mlPerf.attributedSales, 0);
});

test('INTEGRAÇÃO 2: Mesmo nome com ID diferente NÃO recebe histórico (sem matching por nome)', async () => {
  const { fetchInternalOfferPerformanceMap } = require('../oracle-trends-radar-engine.cjs');

  const mockClient = createMockSupabaseClient({
    offers: [
      {
        id: 'offer-shopee-real',
        user_id: 'user-1',
        platform: 'Shopee',
        shopee_item_id: 'REAL-ID-100',
        product_name: 'Fone de Ouvido Bluetooth TWS Pro',
      },
    ],
    affiliateLinks: [{ id: 'link-real', offer_id: 'offer-shopee-real', clicks: 50 }],
    clickEvents: [{ id: 'c1', affiliate_link_id: 'link-real', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() }],
    sales: [{ id: 's1', offer_id: 'offer-shopee-real', status: 'confirmed', sold_at: new Date().toISOString() }],
  });

  // Candidato com mesmo nome exato mas ID diferente
  const candidateDifferentId = {
    marketplace: 'Shopee',
    itemId: 'DIFFERENT-ID-999',
    productName: 'Fone de Ouvido Bluetooth TWS Pro', // Mesmo nome!
  };

  const perfMap = await fetchInternalOfferPerformanceMap(mockClient, {
    tenantId: 'user-1',
    candidates: [candidateDifferentId],
    windowDays: 30,
  });

  assert.equal(perfMap.size, 0, 'Não deve mapear histórico para ID diferente mesmo com nome idêntico');
});

test('INTEGRAÇÃO 3 & 4: Clicks e sales de outro offer NÃO contaminam', async () => {
  const { fetchInternalOfferPerformanceMap } = require('../oracle-trends-radar-engine.cjs');

  const mockClient = createMockSupabaseClient({
    offers: [
      { id: 'offer-A', user_id: 'user-1', platform: 'Shopee', shopee_item_id: 'ITEM-A' },
      { id: 'offer-B', user_id: 'user-1', platform: 'Shopee', shopee_item_id: 'ITEM-B' },
    ],
    affiliateLinks: [
      { id: 'link-A', offer_id: 'offer-A', clicks: 100 },
      { id: 'link-B', offer_id: 'offer-B', clicks: 0 },
    ],
    clickEvents: [
      // 5 cliques no link-A
      { id: 'ca1', affiliate_link_id: 'link-A', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
      { id: 'ca2', affiliate_link_id: 'link-A', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
      { id: 'ca3', affiliate_link_id: 'link-A', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
      { id: 'ca4', affiliate_link_id: 'link-A', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
      { id: 'ca5', affiliate_link_id: 'link-A', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
    ],
    sales: [
      // 2 vendas para offer-A
      { id: 'sa1', offer_id: 'offer-A', status: 'confirmed', sold_at: new Date().toISOString() },
      { id: 'sa2', offer_id: 'offer-A', status: 'confirmed', sold_at: new Date().toISOString() },
    ],
  });

  const candidates = [
    { marketplace: 'Shopee', itemId: 'ITEM-A', productName: 'Item A' },
    { marketplace: 'Shopee', itemId: 'ITEM-B', productName: 'Item B' },
  ];

  const perfMap = await fetchInternalOfferPerformanceMap(mockClient, {
    tenantId: 'user-1',
    candidates,
    windowDays: 30,
  });

  const perfA = perfMap.get('shopee:item:item-a');
  const perfB = perfMap.get('shopee:item:item-b');

  assert.equal(perfA.humanProbableClicks, 5);
  assert.equal(perfA.attributedSales, 2);

  assert.equal(perfB.humanProbableClicks, 0, 'Offer B não pode herdar cliques de Offer A');
  assert.equal(perfB.attributedSales, 0, 'Offer B não pode herdar vendas de Offer A');
});

test('INTEGRAÇÃO 5: Candidato com >=10 cliques humanos e 0 vendas vira observed_zero_conversion no pipeline real', async () => {
  const { fetchInternalOfferPerformanceMap, buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const clickEvents = [];
  for (let i = 1; i <= 12; i++) {
    clickEvents.push({
      id: `c_${i}`,
      affiliate_link_id: 'link-zero-conv',
      device_type: 'mobile',
      source: 'whatsapp',
      created_at: new Date().toISOString(),
    });
  }

  const mockClient = createMockSupabaseClient({
    offers: [{ id: 'offer-zero', user_id: 'user-1', platform: 'Shopee', shopee_item_id: 'ITEM-ZERO' }],
    affiliateLinks: [{ id: 'link-zero-conv', offer_id: 'offer-zero', clicks: 12 }],
    clickEvents,
    sales: [], // 0 vendas
  });

  const candidate = {
    marketplace: 'Shopee',
    itemId: 'ITEM-ZERO',
    productName: 'Produto Muita Visita Sem Venda',
    category: 'Geral',
    currentPrice: 150,
    oldPrice: 200,
    discountPercent: 25,
    sales: 1000,
    ratingStar: 4.8,
    commissionPercent: 8,
  };

  const perfMap = await fetchInternalOfferPerformanceMap(mockClient, {
    tenantId: 'user-1',
    candidates: [candidate],
    windowDays: 30,
  });

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-zero-conv-run',
    shopeeCandidates: [candidate],
    internalPerformanceMap: perfMap,
    maxProducts: 20,
  });

  assert.equal(products.length, 1);
  const evidence = products[0].direct_evidence[0];
  assert.equal(evidence.internal_conversion_status, 'observed_zero_conversion');
  assert.equal(evidence.human_probable_clicks, 12);
  assert.equal(evidence.attributed_sales, 0);
  assert.equal(products[0].score_breakdown.internalConversion, 0);
});

test('INTEGRAÇÃO 6: Candidato com venda atribuída vira observed_conversion no pipeline real', async () => {
  const { fetchInternalOfferPerformanceMap, buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const mockClient = createMockSupabaseClient({
    offers: [{ id: 'offer-conv', user_id: 'user-1', platform: 'Shopee', shopee_item_id: 'ITEM-CONV' }],
    affiliateLinks: [{ id: 'link-conv', offer_id: 'offer-conv', clicks: 20 }],
    clickEvents: [
      { id: 'c1', affiliate_link_id: 'link-conv', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
      { id: 'c2', affiliate_link_id: 'link-conv', device_type: 'mobile', source: 'whatsapp', created_at: new Date().toISOString() },
    ],
    sales: [
      { id: 's1', offer_id: 'offer-conv', status: 'confirmed', sold_at: new Date().toISOString() },
    ],
  });

  const candidate = {
    marketplace: 'Shopee',
    itemId: 'ITEM-CONV',
    productName: 'Produto Com Venda Comprovada',
    category: 'Geral',
    currentPrice: 220,
    oldPrice: 300,
    discountPercent: 26,
    sales: 1500,
    ratingStar: 4.8,
    commissionPercent: 8,
  };

  const perfMap = await fetchInternalOfferPerformanceMap(mockClient, {
    tenantId: 'user-1',
    candidates: [candidate],
    windowDays: 30,
  });

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'test-conv-run',
    shopeeCandidates: [candidate],
    internalPerformanceMap: perfMap,
    maxProducts: 20,
  });

  assert.equal(products.length, 1);
  const evidence = products[0].direct_evidence[0];
  assert.equal(evidence.internal_conversion_status, 'observed_conversion');
  assert.equal(evidence.attributed_sales, 1);
  assert.ok(products[0].score_breakdown.internalConversion >= 10, 'Deve pontuar em internalConversion');
});

// ============================================================================
// TESTES DE CLASSIFICAÇÃO DETERMINÍSTICA DE CLIQUES & MATCHING SHOPEE
// ============================================================================

test('CLASSIFICAÇÃO DE CLIQUES: burst Facebook desktop com >=5 ofertas no mesmo minuto => technical_probable', () => {
  const { classifyClickEvents } = require('../oracle-trends-radar-engine.cjs');

  const linkIdToOfferId = new Map([
    ['link-1', 'offer-1'],
    ['link-2', 'offer-2'],
    ['link-3', 'offer-3'],
    ['link-4', 'offer-4'],
    ['link-5', 'offer-5'],
  ]);

  const timestamp = '2026-08-19T14:30:15.000Z'; // Mesmo minuto
  const events = [
    { id: 'e1', affiliate_link_id: 'link-1', channel: 'facebook', source: 'facebook.com', device_type: 'desktop', created_at: timestamp },
    { id: 'e2', affiliate_link_id: 'link-2', channel: 'facebook', source: 'facebook.com', device_type: 'desktop', created_at: timestamp },
    { id: 'e3', affiliate_link_id: 'link-3', channel: 'facebook', source: 'facebook.com', device_type: 'desktop', created_at: timestamp },
    { id: 'e4', affiliate_link_id: 'link-4', channel: 'facebook', source: 'facebook.com', device_type: 'desktop', created_at: timestamp },
    { id: 'e5', affiliate_link_id: 'link-5', channel: 'facebook', source: 'facebook.com', device_type: 'desktop', created_at: timestamp },
  ];

  const { classifiedEvents, statsByOfferId } = classifyClickEvents(events, { linkIdToOfferId });

  assert.equal(classifiedEvents.length, 5);
  for (const item of classifiedEvents) {
    assert.equal(item.classification, 'technical_probable', 'Burst de >=5 ofertas no mesmo minuto deve ser technical_probable');
    assert.ok(item.reason.includes('burst_technical_scan'));
  }

  const stats1 = statsByOfferId.get('offer-1');
  assert.equal(stats1.technicalClicks, 1);
  assert.equal(stats1.humanProbableClicks, 0);
  assert.equal(stats1.ambiguousClicks, 0);
});

test('CLASSIFICAÇÃO DE CLIQUES: Facebook desktop isolado sem evidência humana => ambiguous', () => {
  const { classifyClickEvents } = require('../oracle-trends-radar-engine.cjs');

  const linkIdToOfferId = new Map([['link-fb-desk', 'offer-desk-1']]);
  const events = [
    { id: 'e1', affiliate_link_id: 'link-fb-desk', channel: 'facebook', source: 'https://facebook.com', device_type: 'desktop', created_at: '2026-08-19T10:00:00.000Z' },
    { id: 'e2', affiliate_link_id: 'link-fb-desk', channel: 'facebook', source: 'facebook', device_type: 'desktop', created_at: '2026-08-19T10:05:00.000Z' },
  ];

  const { classifiedEvents, statsByOfferId } = classifyClickEvents(events, { linkIdToOfferId });

  for (const item of classifiedEvents) {
    assert.equal(item.classification, 'ambiguous', 'Facebook desktop sem evidência explícita deve ser ambiguous');
  }

  const stats = statsByOfferId.get('offer-desk-1');
  assert.equal(stats.ambiguousClicks, 2);
  assert.equal(stats.humanProbableClicks, 0);
  assert.equal(stats.technicalClicks, 0);
});

test('CLASSIFICAÇÃO DE CLIQUES: WhatsApp e Telegram => human_probable', () => {
  const { classifyClickEvents } = require('../oracle-trends-radar-engine.cjs');

  const linkIdToOfferId = new Map([
    ['link-wpp', 'offer-msg-1'],
    ['link-tg', 'offer-msg-2'],
  ]);

  const events = [
    { id: 'e1', affiliate_link_id: 'link-wpp', channel: 'whatsapp', source: 'whatsapp_group', device_type: 'mobile', created_at: '2026-08-19T11:00:00.000Z' },
    { id: 'e2', affiliate_link_id: 'link-tg', channel: 'telegram', source: 't.me/cacaofertas', device_type: 'desktop', created_at: '2026-08-19T11:01:00.000Z' },
  ];

  const { classifiedEvents, statsByOfferId } = classifyClickEvents(events, { linkIdToOfferId });

  assert.equal(classifiedEvents[0].classification, 'human_probable');
  assert.equal(classifiedEvents[1].classification, 'human_probable');

  assert.equal(statsByOfferId.get('offer-msg-1').humanProbableClicks, 1);
  assert.equal(statsByOfferId.get('offer-msg-2').humanProbableClicks, 1);
});

test('CLASSIFICAÇÃO DE CLIQUES: Facebook mobile com m.facebook / l.facebook => human_probable e source genérico => ambiguous', () => {
  const { classifyClickEvents } = require('../oracle-trends-radar-engine.cjs');

  const linkIdToOfferId = new Map([
    ['link-fb-m', 'offer-fb-1'],
    ['link-fb-l', 'offer-fb-2'],
    ['link-fb-mob', 'offer-fb-3'],
  ]);

  const events = [
    { id: 'e1', affiliate_link_id: 'link-fb-m', channel: 'facebook', source: 'https://m.facebook.com/story.php', device_type: 'mobile', created_at: '2026-08-19T12:00:00.000Z' },
    { id: 'e2', affiliate_link_id: 'link-fb-l', channel: 'facebook', source: 'http://l.facebook.com/l.php', device_type: 'mobile', created_at: '2026-08-19T12:01:00.000Z' },
    { id: 'e3', affiliate_link_id: 'link-fb-mob', channel: 'facebook', source: 'facebook', device_type: 'mobile', created_at: '2026-08-19T12:02:00.000Z' },
  ];

  const { classifiedEvents, statsByOfferId } = classifyClickEvents(events, { linkIdToOfferId });

  assert.equal(classifiedEvents[0].classification, 'human_probable', 'Facebook mobile + m.facebook => human_probable');
  assert.equal(classifiedEvents[1].classification, 'human_probable', 'Facebook mobile + l.facebook => human_probable');
  assert.equal(classifiedEvents[2].classification, 'ambiguous', 'Facebook mobile + source genérico facebook => ambiguous');

  assert.equal(statsByOfferId.get('offer-fb-1').humanProbableClicks, 1);
  assert.equal(statsByOfferId.get('offer-fb-2').humanProbableClicks, 1);
  assert.equal(statsByOfferId.get('offer-fb-3').humanProbableClicks, 0);
  assert.equal(statsByOfferId.get('offer-fb-3').ambiguousClicks, 1);
});

test('SCORE V4: ambiguous e technical NÃO entram em internalConversion', () => {
  const { calculateCommercialOpportunityScoreV4 } = require('../../src/core/trends/commercial-opportunity-score-v4.cjs');

  // Candidato com 100 cliques técnicos, 50 ambíguos, e 0 human
  const candidate = {
    marketplace: 'Shopee',
    itemId: 'ITEM-TEST-CLICKS',
    productName: 'Produto Teste Clicks',
    category: 'Geral',
    currentPrice: 100,
    sales: 500,
    ratingStar: 4.8,
    commissionPercent: 10,
    internalPerformance: {
      matched: true,
      humanProbableClicks: 0,
      technicalClicks: 100,
      ambiguousClicks: 50,
      attributedSales: 0,
    },
  };

  const result = calculateCommercialOpportunityScoreV4(candidate, {
    internalPerformance: candidate.internalPerformance,
  });

  assert.equal(result.internal_conversion.humanProbableClicks, 0);
  assert.equal(result.internal_conversion.internalConversionStatus, 'insufficient_history', 'Sem cliques humanos válidos vira insufficient_history');
  assert.equal(result.breakdown.internalConversion, 0, 'Cliques técnicos/ambíguos não geram pontos em internalConversion');
});

test('MATCHING SHOPEE: mesmo itemId em shopId diferente NÃO faz matching cruzado (fail-closed)', async () => {
  const { fetchInternalOfferPerformanceMap } = require('../oracle-trends-radar-engine.cjs');

  const mockClient = createMockSupabaseClient({
    offers: [
      {
        id: 'offer-shop-loja-a',
        user_id: 'user-1',
        platform: 'Shopee',
        shopee_item_id: 'ITEM-SHARED-ID',
        shopee_shop_id: 'SHOP-LOJA-A',
        marketplace_metrics: { itemId: 'ITEM-SHARED-ID', shopId: 'SHOP-LOJA-A' },
      },
    ],
    affiliateLinks: [{ id: 'link-loja-a', offer_id: 'offer-shop-loja-a', clicks: 20 }],
    clickEvents: [{ id: 'c1', affiliate_link_id: 'link-loja-a', channel: 'whatsapp', source: 'whatsapp', device_type: 'mobile', created_at: new Date().toISOString() }],
    sales: [{ id: 's1', offer_id: 'offer-shop-loja-a', status: 'confirmed', sold_at: new Date().toISOString() }],
  });

  // Candidato com mesmo itemId mas shopId diferente
  const candidateDifferentShop = {
    marketplace: 'Shopee',
    itemId: 'ITEM-SHARED-ID',
    shopId: 'SHOP-LOJA-B', // OUTRO SHOP!
    productName: 'Produto Compartilhado Mas Outra Loja',
  };

  const perfMap = await fetchInternalOfferPerformanceMap(mockClient, {
    tenantId: 'user-1',
    candidates: [candidateDifferentShop],
    windowDays: 30,
  });

  assert.equal(perfMap.size, 0, 'Não pode haver match quando o shopId for diferente, mesmo com mesmo itemId');
});

// ============================================================================
// TASK 4: COMPETITIVIDADE REAL DE PREÇO E NORMALIZAÇÃO DE UNIDADES
// ============================================================================

test('TASK 4 (Competitividade): OMO 4kg R$95,88 vs OMO 5L R$50 -> 5L tem competitividade superior', () => {
  const omo4kg = {
    itemId: 'omo-4kg',
    productName: 'Sabão em Pó OMO Lavagem Perfeita 4kg',
    currentPrice: 95.88,
    discountPercent: 40, // 40% de desconto próprio aparente
    sales: 1000,
    ratingStar: 4.8,
  };

  const omo5L = {
    itemId: 'omo-5l',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 5L',
    currentPrice: 50.00,
    discountPercent: 10, // apenas 10% de desconto
    sales: 1000,
    ratingStar: 4.8,
  };

  const peers = [omo4kg, omo5L];

  const score4kg = calculateCommercialOpportunityScoreV4(omo4kg, { peers });
  const score5L = calculateCommercialOpportunityScoreV4(omo5L, { peers });

  assert.equal(score5L.normalized_unit, 'L');
  assert.equal(score5L.normalized_price, 10.00); // R$ 50 / 5 = R$ 10.00/L
  assert.equal(score5L.relative_price_position, 'best_in_family');
  assert.equal(score5L.breakdown.offerCompetitiveness, 10);

  assert.equal(score4kg.normalized_unit, 'kg');
  assert.equal(score4kg.normalized_price, 23.97); // R$ 95.88 / 4 = R$ 23.97/kg
  assert.equal(score4kg.relative_price_position, 'unfavorable');
  assert.equal(score4kg.breakdown.offerCompetitiveness, 1);

  assert.ok(
    score5L.breakdown.offerCompetitiveness > score4kg.breakdown.offerCompetitiveness,
    'OMO 5L (R$ 10/L) deve ter score de competitividade superior a OMO 4kg (R$ 23.97/kg)'
  );
});

test('TASK 4 (Competitividade): Dois produtos iguais com mesma quantidade -> menor preço vence', () => {
  const foneBarato = {
    itemId: 'fone-25',
    productName: 'Fone de Ouvido Bluetooth TWS i12',
    currentPrice: 25.00,
    discountPercent: 0,
  };

  const foneCaro = {
    itemId: 'fone-35',
    productName: 'Fone de Ouvido Bluetooth TWS i12',
    currentPrice: 35.00,
    discountPercent: 50, // 50% de desconto falso
  };

  const peers = [foneBarato, foneCaro];

  const scoreBarato = calculateCommercialOpportunityScoreV4(foneBarato, { peers });
  const scoreCaro = calculateCommercialOpportunityScoreV4(foneCaro, { peers });

  assert.equal(scoreBarato.relative_price_position, 'best_in_family');
  assert.equal(scoreBarato.breakdown.offerCompetitiveness, 10);

  assert.equal(scoreCaro.relative_price_position, 'unfavorable');
  assert.equal(scoreCaro.breakdown.offerCompetitiveness, 1);

  assert.ok(scoreBarato.total > scoreCaro.total, 'Menor preço real deve vencer o anúncio mais caro mesmo com desconto falso');
});

test('TASK 4 (Competitividade): Kit 3 vs Kit 2 -> compara por unidade', () => {
  const kit3 = {
    itemId: 'kit-3',
    productName: 'Kit 3 Camisetas Básicas Algodão',
    currentPrice: 30.00, // R$ 10/unidade
    discountPercent: 10,
  };

  const kit2 = {
    itemId: 'kit-2',
    productName: 'Kit 2 Camisetas Básicas Algodão',
    currentPrice: 24.00, // R$ 12/unidade
    discountPercent: 10,
  };

  const peers = [kit3, kit2];

  const scoreKit3 = calculateCommercialOpportunityScoreV4(kit3, { peers });
  const scoreKit2 = calculateCommercialOpportunityScoreV4(kit2, { peers });

  assert.equal(scoreKit3.normalized_unit, 'unit');
  assert.equal(scoreKit3.normalized_price, 10.00);
  assert.equal(scoreKit3.relative_price_position, 'best_in_family');
  assert.equal(scoreKit3.breakdown.offerCompetitiveness, 10);

  assert.equal(scoreKit2.normalized_unit, 'unit');
  assert.equal(scoreKit2.normalized_price, 12.00);
  assert.equal(scoreKit2.relative_price_position, 'average');
  assert.ok(scoreKit3.breakdown.offerCompetitiveness > scoreKit2.breakdown.offerCompetitiveness);
});

test('TASK 4 (Competitividade): 500g vs 1kg -> compara por kg', () => {
  const cafe1kg = {
    itemId: 'cafe-1kg',
    productName: 'Café Especial Torrado em Grãos 1kg',
    currentPrice: 40.00, // R$ 40/kg
    discountPercent: 5,
  };

  const cafe500g = {
    itemId: 'cafe-500g',
    productName: 'Café Especial Torrado em Grãos 500g',
    currentPrice: 30.00, // R$ 60/kg
    discountPercent: 5,
  };

  const peers = [cafe1kg, cafe500g];

  const score1kg = calculateCommercialOpportunityScoreV4(cafe1kg, { peers });
  const score500g = calculateCommercialOpportunityScoreV4(cafe500g, { peers });

  assert.equal(score1kg.normalized_unit, 'kg');
  assert.equal(score1kg.normalized_price, 40.00);
  assert.equal(score1kg.relative_price_position, 'best_in_family');
  assert.equal(score1kg.breakdown.offerCompetitiveness, 10);

  assert.equal(score500g.normalized_unit, 'kg');
  assert.equal(score500g.normalized_price, 60.00);
  assert.equal(score500g.relative_price_position, 'unfavorable');
  assert.ok(score1kg.breakdown.offerCompetitiveness > score500g.breakdown.offerCompetitiveness);
});

test('TASK 4 (Competitividade): Produto sem quantidade detectável não inventa unidade e compara se seguro', () => {
  const mouseA = {
    itemId: 'mouse-a',
    productName: 'Mouse Gamer RGB Ergonômico 7200 DPI',
    currentPrice: 50.00,
  };

  const mouseB = {
    itemId: 'mouse-b',
    productName: 'Mouse Gamer RGB Ergonômico 7200 DPI',
    currentPrice: 80.00,
  };

  const peers = [mouseA, mouseB];

  const scoreA = calculateCommercialOpportunityScoreV4(mouseA, { peers });
  const scoreB = calculateCommercialOpportunityScoreV4(mouseB, { peers });

  assert.equal(scoreA.normalized_unit, 'unit');
  assert.equal(scoreA.normalized_price, 50.00);
  assert.equal(scoreA.relative_price_position, 'best_in_family');
  assert.equal(scoreA.breakdown.offerCompetitiveness, 10);

  assert.equal(scoreB.normalized_price, 80.00);
  assert.equal(scoreB.relative_price_position, 'unfavorable');
  assert.equal(scoreB.breakdown.offerCompetitiveness, 1);
});

test('TASK 4 (Competitividade): Produtos de famílias diferentes não são comparados entre si', () => {
  const omo = {
    itemId: 'omo-1',
    productName: 'Sabão Líquido OMO 5L',
    currentPrice: 50.00,
  };

  const fone = {
    itemId: 'fone-1',
    productName: 'Fone Bluetooth TWS i12',
    currentPrice: 25.00,
  };

  const peers = [omo, fone];

  const scoreOmo = calculateCommercialOpportunityScoreV4(omo, { peers });
  const scoreFone = calculateCommercialOpportunityScoreV4(fone, { peers });

  assert.equal(scoreOmo.peer_count, 1, 'OMO não deve ser comparado com fone');
  assert.equal(scoreOmo.relative_price_position, 'solo');

  assert.equal(scoreFone.peer_count, 1, 'Fone não deve ser comparado com sabão');
  assert.equal(scoreFone.relative_price_position, 'solo');
});

test('TASK 4 (Competitividade): Desconto próprio alto não supera concorrente equivalente muito mais barato', () => {
  const caroComDesconto = {
    itemId: 'item-caro',
    productName: 'Suporte de Celular Veicular Magnético Saída de Ar',
    currentPrice: 60.00,
    discountPercent: 60, // alega 60% de desconto (de R$ 150 por R$ 60)
  };

  const baratoSemDesconto = {
    itemId: 'item-barato',
    productName: 'Suporte de Celular Veicular Magnético Saída de Ar',
    currentPrice: 20.00,
    discountPercent: 0, // 0% de desconto anunciado
  };

  const peers = [caroComDesconto, baratoSemDesconto];

  const scoreCaro = calculateCommercialOpportunityScoreV4(caroComDesconto, { peers });
  const scoreBarato = calculateCommercialOpportunityScoreV4(baratoSemDesconto, { peers });

  assert.equal(scoreBarato.breakdown.offerCompetitiveness, 10);
  assert.equal(scoreCaro.breakdown.offerCompetitiveness, 1);
  assert.ok(scoreBarato.breakdown.offerCompetitiveness > scoreCaro.breakdown.offerCompetitiveness);
});

test('TASK 4 (Competitividade): Candidato sem concorrente no run preserva avaliação intrínseca de desconto', () => {
  const soloComDesconto = {
    itemId: 'item-solo-50',
    productName: 'Câmera de Segurança Externa Wi-Fi 360',
    currentPrice: 150.00,
    discountPercent: 50,
  };

  const score = calculateCommercialOpportunityScoreV4(soloComDesconto, { peers: [] });

  assert.equal(score.peer_count, 1);
  assert.equal(score.relative_price_position, 'solo');
  assert.equal(score.breakdown.offerCompetitiveness, 10, 'Desconto solo de 50% pontua 10 pts');
});

test('TASK 4 (Competitividade): buildTrendRadarProductsFromCandidates registra family_key, normalized_unit, normalized_price e relative_price_position no directEvidence', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const shopeeCandidate1 = {
    marketplace: 'Shopee',
    itemId: 'shopee-omo-5l',
    shopId: 'shop-1',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 5L',
    currentPrice: 50.00,
    sales: 500,
    ratingStar: 4.9,
    commissionPercent: 10,
    permalink: 'https://shopee.com.br/product/1/omo5l',
  };

  const shopeeCandidate2 = {
    marketplace: 'Shopee',
    itemId: 'shopee-omo-4kg',
    shopId: 'shop-2',
    productName: 'Sabão em Pó OMO Lavagem Perfeita 4kg',
    currentPrice: 95.88,
    discountPercent: 40,
    sales: 500,
    ratingStar: 4.8,
    commissionPercent: 10,
    permalink: 'https://shopee.com.br/product/2/omo4kg',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-test-task4',
    shopeeCandidates: [shopeeCandidate1, shopeeCandidate2],
    mlCandidates: [],
    maxProducts: 10,
  });

  assert.ok(products.length >= 1);
  const bestProduct = products.find((p) => p.product_term.includes('5L'));
  assert.ok(bestProduct, 'OMO 5L deve estar entre os produtos selecionados');

  const direct = bestProduct.direct_evidence[0];
  assert.ok(direct.family_key.includes('omo'));
  assert.equal(direct.normalized_unit, 'L');
  assert.equal(direct.normalized_price, 10.00);
  assert.equal(direct.relative_price_position, 'best_in_family');
  assert.ok(direct.competitiveness_reason.includes('Melhor preço'));
});
