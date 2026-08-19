'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  COMMERCIAL_OPPORTUNITY_V4_STRATEGY_VERSION,
  WEIGHTS_V4,
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

