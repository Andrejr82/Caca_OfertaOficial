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

  const impulseTitles = [
    'Fone de Ouvido Intra-auricular', 'Cabo Tipo C Trançado', 'Suporte Celular Mesa', 'Mousepad Speed Médio',
    'Mini Lanterna Tática LED', 'Adaptador USB OTG', 'Película de Vidro 3D', 'Limpador de Tela Spray',
    'Organizador de Cabos', 'Capa Protetora Silicone',
  ];
  const coreTitles = [
    'Teclado Gamer Mecânico RGB', 'Mouse Gamer Sem Fio', 'Headset 7.1 Surround', 'Webcam Full HD 1080p',
    'Microfone Condensador USB', 'Suporte Articulado Monitor', 'Luminária de Mesa LED', 'Gabinete Gamer Vidro',
    'Memória RAM 16GB DDR4', 'Processador Octa Core',
  ];
  const upperTitles = [
    'Monitor Gamer 165Hz IPS', 'Cadeira Ergonômica Pro Mesh', 'Placa de Vídeo 8GB GDDR6', 'Fonte 750W 80 Plus Gold',
    'SSD NVMe 2TB Gen4', 'Roteador Wi-Fi 6 Mesh Tri-Band', 'Smartwatch Esportivo AMOLED', 'Impressora Tanque de Tinta',
    'Caixa de Som Portátil 60W', 'Tablet 10 Polegadas Octa Core',
  ];
  const premTitles = [
    'Notebook Gamer RTX 4060', 'Smart TV 65 Polegadas QLED 4K', 'Smartphone Flagship 256GB', 'Drone Profissional 4K Gimbal',
    'Câmera Mirrorless Full Frame', 'Projetor Laser 4K Cinema', 'Console de Video Game 1TB', 'Bicicleta Elétrica Dobrável',
    'Ar Condicionado Inverter 18000', 'Geladeira Frost Free Inox',
  ];

  const candidates = [];

  // 10 Impulse (R$ 50)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `IMP_${i + 1}`,
      shopId: `shop-i-${i + 1}`,
      productName: `${impulseTitles[i]} Modelo Shopee`,
      category: `Categoria Impulso ${i + 1}`,
      currentPrice: 50,
      oldPrice: 100,
      discountPercent: 50,
      sales: 5000,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/1/imp_${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/imp_${i + 1}.jpg`,
    });
  }

  // 10 Core (R$ 250)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `CORE_${i + 1}`,
      shopId: `shop-c-${i + 1}`,
      productName: `${coreTitles[i]} Modelo Shopee`,
      category: `Categoria Core ${i + 1}`,
      currentPrice: 250,
      oldPrice: 500,
      discountPercent: 50,
      sales: 2000,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/2/core_${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/core_${i + 1}.jpg`,
    });
  }

  // 10 Upper (R$ 800)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `UPPER_${i + 1}`,
      shopId: `shop-u-${i + 1}`,
      productName: `${upperTitles[i]} Modelo Shopee`,
      category: `Categoria Upper ${i + 1}`,
      currentPrice: 800,
      oldPrice: 1600,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 10,
      permalink: `https://shopee.com.br/product/3/upper_${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/upper_${i + 1}.jpg`,
    });
  }

  // 10 Premium (R$ 2000)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `PREM_${i + 1}`,
      shopId: `shop-p-${i + 1}`,
      productName: `${premTitles[i]} Modelo Shopee`,
      category: `Categoria Premium ${i + 1}`,
      currentPrice: 2000,
      oldPrice: 4000,
      discountPercent: 50,
      sales: 1000,
      ratingStar: 4.9,
      commissionPercent: 8,
      permalink: `https://shopee.com.br/product/4/prem_${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/prem_${i + 1}.jpg`,
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

  const coreTitles = [
    'Teclado Gamer Mecânico RGB', 'Mouse Gamer Sem Fio', 'Headset 7.1 Surround', 'Webcam Full HD 1080p',
    'Microfone Condensador USB', 'Suporte Articulado Monitor', 'Luminária de Mesa LED', 'Gabinete Gamer Vidro',
    'Memória RAM 16GB DDR4', 'Processador Octa Core',
  ];
  const impulseTitles = [
    'Fone de Ouvido Intra-auricular', 'Cabo Tipo C Trançado', 'Suporte Celular Mesa', 'Mousepad Speed Médio',
    'Mini Lanterna Tática LED', 'Adaptador USB OTG', 'Película de Vidro 3D', 'Limpador de Tela Spray',
    'Organizador de Cabos', 'Capa Protetora Silicone', 'Hub USB 4 Portas', 'Carregador Parede 20W',
    'Cabo Auxiliar P2', 'Mini Caixa de Som', 'Suporte Veicular Celular',
  ];

  const candidates = [];

  // Apenas 1 Premium viável
  candidates.push({
    marketplace: 'Shopee',
    itemId: 'PREM_SINGLE',
    shopId: 'shop-p',
    productName: 'Notebook Ultra 16GB SSD 512GB',
    category: 'Informática',
    currentPrice: 3500,
    oldPrice: 7000,
    discountPercent: 50,
    sales: 1000,
    ratingStar: 4.8,
    commissionPercent: 8,
    permalink: 'https://shopee.com.br/product/p/single',
    imageUrl: 'https://cf.shopee.com.br/single.jpg',
  });

  // 10 Core
  for (let i = 0; i < 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `CORE_R_${i + 1}`,
      shopId: `shop-c-${i + 1}`,
      productName: `${coreTitles[i]} Modelo Shopee`,
      category: `Categoria C ${i + 1}`,
      currentPrice: 200 + i * 10,
      oldPrice: 400 + i * 20,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/c/core_${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/core_${i + 1}.jpg`,
    });
  }

  // 15 Impulse
  for (let j = 0; j < 15; j++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `IMP_R_${j + 1}`,
      shopId: `shop-i-${j + 1}`,
      productName: `${impulseTitles[j]} Modelo Shopee`,
      category: `Categoria I ${j + 1}`,
      currentPrice: 80 + j,
      oldPrice: 160 + j * 2,
      discountPercent: 50,
      sales: 10000,
      ratingStar: 4.8,
      commissionPercent: 15,
      permalink: `https://shopee.com.br/product/i/imp_${j + 1}`,
      imageUrl: `https://cf.shopee.com.br/imp_${j + 1}.jpg`,
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

  const coreTitles = [
    'Teclado Gamer Mecânico RGB', 'Mouse Gamer Sem Fio', 'Headset 7.1 Surround', 'Webcam Full HD 1080p',
    'Microfone Condensador USB',
  ];

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
  for (let i = 0; i < 5; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `CORE_GOOD_${i + 1}`,
      shopId: `shop-g-${i + 1}`,
      productName: `${coreTitles[i]} Modelo Shopee`,
      category: `Cat ${i + 1}`,
      currentPrice: 200,
      oldPrice: 400,
      discountPercent: 50,
      sales: 1500,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/g/core_${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/core_${i + 1}.jpg`,
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
    offers: [{ id: 'offer-zero', user_id: 'user-1', platform: 'Shopee', shopee_item_id: 'ITEM-ZERO', shopee_shop_id: 'shop-zero' }],
    affiliateLinks: [{ id: 'link-zero-conv', offer_id: 'offer-zero', clicks: 12 }],
    clickEvents,
    sales: [], // 0 vendas
  });

  const candidate = {
    marketplace: 'Shopee',
    shopId: 'shop-zero',
    itemId: 'ITEM-ZERO',
    productName: 'Produto Muita Visita Sem Venda',
    category: 'Geral',
    currentPrice: 150,
    oldPrice: 300,
    discountPercent: 50,
    sales: 1500,
    ratingStar: 4.8,
    commissionPercent: 12,
    permalink: 'https://shopee.com.br/product/1/ITEM-ZERO',
    imageUrl: 'https://cf.shopee.com.br/item-zero.jpg',
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

test('TASK 4 (Competitividade): OMO 4kg vs OMO 5L -> NÃO comparar R$/kg com R$/L (unit_not_comparable)', () => {
  const omo4kg = {
    itemId: 'omo-4kg',
    productName: 'Sabão em Pó OMO Lavagem Perfeita 4kg',
    currentPrice: 95.88,
    discountPercent: 40,
    sales: 1000,
    ratingStar: 4.8,
  };

  const omo5L = {
    itemId: 'omo-5l',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 5L',
    currentPrice: 50.00,
    discountPercent: 10,
    sales: 1000,
    ratingStar: 4.8,
  };

  const peers = [omo4kg, omo5L];

  const score4kg = calculateCommercialOpportunityScoreV4(omo4kg, { peers });
  const score5L = calculateCommercialOpportunityScoreV4(omo5L, { peers });

  assert.equal(score5L.normalized_unit, 'L');
  assert.equal(score5L.normalized_price, 10.00);
  assert.equal(score5L.relative_price_position, 'unit_not_comparable', 'Unidades diferentes (L vs kg) não devem gerar best_in_family');

  assert.equal(score4kg.normalized_unit, 'kg');
  assert.equal(score4kg.normalized_price, 23.97);
  assert.equal(score4kg.relative_price_position, 'unit_not_comparable', 'Unidades diferentes (kg vs L) não devem gerar unfavorable');
});

test('TASK 4 (Competitividade): OMO 5L vs OMO 7L -> comparação R$/L válida', () => {
  const omo5L = {
    itemId: 'omo-5l',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 5L',
    currentPrice: 50.00, // R$ 10.00/L
    discountPercent: 10,
  };

  const omo7L = {
    itemId: 'omo-7l',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 7L',
    currentPrice: 105.00, // R$ 15.00/L (+50%)
    discountPercent: 10,
  };

  const peers = [omo5L, omo7L];

  const score5L = calculateCommercialOpportunityScoreV4(omo5L, { peers });
  const score7L = calculateCommercialOpportunityScoreV4(omo7L, { peers });

  assert.equal(score5L.normalized_unit, 'L');
  assert.equal(score5L.normalized_price, 10.00);
  assert.equal(score5L.relative_price_position, 'best_in_family');
  assert.equal(score5L.breakdown.offerCompetitiveness, 10);

  assert.equal(score7L.normalized_unit, 'L');
  assert.equal(score7L.normalized_price, 15.00);
  assert.equal(score7L.relative_price_position, 'unfavorable');
  assert.equal(score7L.breakdown.offerCompetitiveness, 1);
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
    currentPrice: 70.00,
    oldPrice: 140.00,
    discountPercent: 50,
    sales: 5000,
    ratingStar: 4.9,
    commissionPercent: 15,
    permalink: 'https://shopee.com.br/product/1/omo5l',
    imageUrl: 'https://cf.shopee.com.br/omo5l.jpg',
  };

  const shopeeCandidate2 = {
    marketplace: 'Shopee',
    itemId: 'shopee-omo-7l',
    shopId: 'shop-2',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 7L',
    currentPrice: 140.00,
    oldPrice: 180.00,
    discountPercent: 22,
    sales: 1500,
    ratingStar: 4.8,
    commissionPercent: 12,
    permalink: 'https://shopee.com.br/product/2/omo7l',
    imageUrl: 'https://cf.shopee.com.br/omo7l.jpg',
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
  assert.equal(direct.normalized_price, 14.00);
  assert.equal(direct.relative_price_position, 'best_in_family');
  assert.ok(direct.competitiveness_reason.includes('Melhor preço'));
});

// ============================================================================
// TASK 5: TOP 20 COMERCIAL SEM PREENCHIMENTO ARTIFICIAL
// ============================================================================

test('TASK 5: 25 candidatos (20 TESTAR/PRIORIDADE + 5 IGNORAR) -> retorna exatamente 20 e zero IGNORAR', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];

  // 10 PRIORIDADE (score >= 80)
  for (let i = 0; i < 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `PRIO_${i + 1}`,
      shopId: `shop-prio-${i + 1}`,
      productName: `Produto Prioridade Especial ${i + 1} Original`,
      category: `Categoria Prio ${i + 1}`,
      currentPrice: 200,
      oldPrice: 400,
      discountPercent: 50,
      sales: 15000,
      ratingStar: 4.9,
      commissionPercent: 15,
      permalink: `https://shopee.com.br/product/prio/${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/prio_${i + 1}.jpg`,
      internalPerformance: {
        matched: true,
        humanProbableClicks: 50,
        attributedSales: 10,
      },
    });
  }

  // 10 TESTAR (score 60-79)
  for (let j = 0; j < 10; j++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `TEST_${j + 1}`,
      shopId: `shop-test-${j + 1}`,
      productName: `Produto Testar Elegivel ${j + 1} Original`,
      category: `Categoria Test ${j + 1}`,
      currentPrice: 150,
      oldPrice: 300,
      discountPercent: 50,
      sales: 3000,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/test/${j + 1}`,
      imageUrl: `https://cf.shopee.com.br/test_${j + 1}.jpg`,
    });
  }

  // 5 IGNORAR (score < 60)
  for (let k = 0; k < 5; k++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `IGN_${k + 1}`,
      shopId: `shop-ign-${k + 1}`,
      productName: `Produto Ruim Descartavel ${k + 1}`,
      category: `Categoria Ign ${k + 1}`,
      currentPrice: 10,
      oldPrice: 10,
      discountPercent: 0,
      sales: 0,
      ratingStar: 0,
      commissionPercent: 1,
      permalink: `https://shopee.com.br/product/ign/${k + 1}`,
      imageUrl: `https://cf.shopee.com.br/ign_${k + 1}.jpg`,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-task5-25-candidates',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 20, 'Deve selecionar exatamente os 20 produtos elegíveis');
  const ignoreInResult = products.filter(p => p.selection_decision === 'IGNORAR' || p.commercial_score < 60);
  assert.equal(ignoreInResult.length, 0, 'Zero produtos com decisão IGNORAR no resultado final');
});

test('TASK 5: 8 TESTAR + 12 IGNORAR -> retorna somente 8, sem erro artificial e sem preenchimento', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];

  // 8 TESTAR
  for (let i = 0; i < 8; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `VALID_${i + 1}`,
      shopId: `shop-val-${i + 1}`,
      productName: `Produto Valido Testar ${i + 1} Oficial`,
      category: `Categoria Val ${i + 1}`,
      currentPrice: 180,
      oldPrice: 360,
      discountPercent: 50,
      sales: 2000,
      ratingStar: 4.8,
      commissionPercent: 12,
      permalink: `https://shopee.com.br/product/val/${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/val_${i + 1}.jpg`,
    });
  }

  // 12 IGNORAR
  for (let j = 0; j < 12; j++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `BAD_${j + 1}`,
      shopId: `shop-bad-${j + 1}`,
      productName: `Produto Sem Condicoes ${j + 1}`,
      category: `Categoria Bad ${j + 1}`,
      currentPrice: 15,
      oldPrice: 15,
      discountPercent: 0,
      sales: 0,
      ratingStar: 0,
      commissionPercent: 0,
      permalink: `https://shopee.com.br/product/bad/${j + 1}`,
      imageUrl: `https://cf.shopee.com.br/bad_${j + 1}.jpg`,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-task5-8-candidates',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 8, 'Deve retornar exatamente os 8 produtos elegíveis');
  const ignoreInResult = products.filter(p => p.selection_decision === 'IGNORAR' || p.commercial_score < 60);
  assert.equal(ignoreInResult.length, 0, 'Nenhum produto IGNORAR deve ser introduzido para completar quota');
});

test('TASK 5: Todos IGNORAR -> retorna lista vazia com 0 produtos', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const candidates = [];
  for (let i = 0; i < 15; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `ALL_IGN_${i + 1}`,
      shopId: `shop-all-ign-${i + 1}`,
      productName: `Produto Sem Atratividade ${i + 1}`,
      category: `Categoria ${i + 1}`,
      currentPrice: 10,
      sales: 0,
      ratingStar: 0,
      commissionPercent: 0,
      permalink: `https://shopee.com.br/product/all/${i + 1}`,
      imageUrl: `https://cf.shopee.com.br/all_${i + 1}.jpg`,
    });
  }

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-task5-all-ignore',
    shopeeCandidates: candidates,
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 0, 'Quando todos são IGNORAR, deve retornar lista vazia');
});

test('TASK 5: PRIORIDADE ranqueia acima de TESTAR quando score for maior', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const prioCandidate = {
    marketplace: 'Shopee',
    itemId: 'ITEM-PRIO',
    shopId: 'shop-prio',
    productName: 'Monitor Gamer 144Hz IPS 1ms FreeSync',
    category: 'Monitores',
    currentPrice: 800,
    oldPrice: 1600,
    discountPercent: 50,
    sales: 10000,
    ratingStar: 4.9,
    commissionPercent: 12,
    permalink: 'https://shopee.com.br/product/prio/1',
    imageUrl: 'https://cf.shopee.com.br/prio.jpg',
    internalPerformance: {
      matched: true,
      humanProbableClicks: 100,
      attributedSales: 20,
    },
  };

  const testCandidate = {
    marketplace: 'Shopee',
    itemId: 'ITEM-TEST',
    shopId: 'shop-test',
    productName: 'Cabo HDMI 2.1 8K Ultra High Speed',
    category: 'Cabos',
    currentPrice: 150,
    oldPrice: 300,
    discountPercent: 50,
    sales: 2000,
    ratingStar: 4.8,
    commissionPercent: 15,
    permalink: 'https://shopee.com.br/product/test/1',
    imageUrl: 'https://cf.shopee.com.br/test.jpg',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-task5-ranking',
    shopeeCandidates: [testCandidate, prioCandidate],
    mlCandidates: [],
    maxProducts: 20,
  });

  assert.equal(products.length, 2);
  assert.equal(products[0].direct_evidence[0].decision, 'PRIORIDADE');
  assert.equal(products[1].direct_evidence[0].decision, 'TESTAR');
  assert.ok(products[0].commercial_score > products[1].commercial_score);
});

// ============================================================================
// TASK PRÉ-MERGE: ELEGIBILIDADE SOURCE-AWARE DO MERCADO LIVRE & UNIDADES
// ============================================================================

test('TASK PRÉ-MERGE (ML): ML válido + promoção + sem vendas/comissão/rating -> selection_decision = TESTAR e entra no painel', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const mlPromo = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB1001',
    productId: 'MLBU1001',
    productName: 'Kit Ferramentas Manuais 100 Peças com Maleta',
    category: 'Ferramentas',
    currentPrice: 120.00,
    oldPrice: 200.00,
    discountPercent: 40,
    sales: null, // sem vendas
    ratingStar: null, // sem rating
    commissionPercent: 0, // sem comissão
    permalink: 'https://produto.mercadolivre.com.br/MLB-1001',
    imageUrl: 'https://http2.mlstatic.com/D_1001.jpg',
  };

  const score = calculateCommercialOpportunityScoreV4(mlPromo, { peers: [mlPromo] });

  // Score total bruto reflete a ausência de dados (auditoria pura)
  assert.ok(score.total < 60, 'Score total deve ser < 60 pela falta de vendas/comissão/rating');
  assert.equal(score.raw_decision, 'IGNORAR');
  assert.equal(score.selection_decision, 'TESTAR', 'Deve receber TESTAR por ter desconto promocional observado factual');
  assert.equal(score.decision, 'TESTAR');

  // Integrado no engine: chega ao painel comercial
  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-ml-promo',
    shopeeCandidates: [],
    mlCandidates: [mlPromo],
    maxProducts: 10,
  });

  assert.equal(products.length, 1);
  assert.equal(products[0].selection_decision, 'TESTAR');
  assert.equal(products[0].direct_evidence[0].selection_decision, 'TESTAR');
  assert.equal(products[0].direct_evidence[0].raw_decision, 'IGNORAR');
});

test('TASK PRÉ-MERGE (ML): ML válido + best_in_family + sem comissão/vendas -> selection_decision = TESTAR', () => {
  const mlBestPrice = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB2001',
    productId: 'MLBU2001',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 5L',
    currentPrice: 45.00, // R$ 9.00/L
    discountPercent: 0,
    sales: null,
    ratingStar: null,
    commissionPercent: 0,
    permalink: 'https://produto.mercadolivre.com.br/MLB-2001',
    imageUrl: 'https://http2.mlstatic.com/D_2001.jpg',
  };

  const mlPeer = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB2002',
    productId: 'MLBU2002',
    productName: 'Sabão Líquido OMO Lavagem Perfeita 5L',
    currentPrice: 75.00, // R$ 15.00/L
    discountPercent: 0,
    sales: null,
    ratingStar: null,
    commissionPercent: 0,
    permalink: 'https://produto.mercadolivre.com.br/MLB-2002',
    imageUrl: 'https://http2.mlstatic.com/D_2002.jpg',
  };

  const peers = [mlBestPrice, mlPeer];

  const scoreBest = calculateCommercialOpportunityScoreV4(mlBestPrice, { peers });
  const scorePeer = calculateCommercialOpportunityScoreV4(mlPeer, { peers });

  assert.equal(scoreBest.relative_price_position, 'best_in_family');
  assert.equal(scoreBest.selection_decision, 'TESTAR');

  assert.equal(scorePeer.relative_price_position, 'unfavorable');
  assert.equal(scorePeer.selection_decision, 'IGNORAR', 'Sem desconto, sem best_in_family e sem destaque deve ser IGNORAR');
});

test('TASK PRÉ-MERGE (ML): ML válido + BEST_SELLER -> selection_decision = TESTAR', () => {
  const mlBestSeller = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB3001',
    productId: 'MLBU3001',
    productName: 'Smartwatch Relógio Inteligente Pro D20',
    currentPrice: 59.90,
    discountPercent: 0,
    sales: null,
    ratingStar: null,
    commissionPercent: 0,
    marketplaceDemandEvidence: {
      source: 'mercadolivre_highlights',
      type: 'BEST_SELLER',
      position: 3,
    },
    permalink: 'https://produto.mercadolivre.com.br/MLB-3001',
    imageUrl: 'https://http2.mlstatic.com/D_3001.jpg',
  };

  const score = calculateCommercialOpportunityScoreV4(mlBestSeller, { peers: [mlBestSeller] });

  assert.equal(score.selection_decision, 'TESTAR', 'Destaque oficial BEST_SELLER torna produto ML elegível para TESTAR');
});

test('TASK PRÉ-MERGE (ML): ML válido sem qualquer sinal comercial adicional -> selection_decision = IGNORAR', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const mlPlain = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB4001',
    productId: 'MLBU4001',
    productName: 'Cabo USB Tipo C 1 Metro Preto',
    currentPrice: 20.00,
    discountPercent: 0, // sem desconto
    sales: null, // sem vendas
    ratingStar: null, // sem rating
    commissionPercent: 0, // sem comissão
    marketplaceDemandEvidence: null, // sem destaque
    permalink: 'https://produto.mercadolivre.com.br/MLB-4001',
    imageUrl: 'https://http2.mlstatic.com/D_4001.jpg',
  };

  const score = calculateCommercialOpportunityScoreV4(mlPlain, { peers: [mlPlain] });

  assert.equal(score.selection_decision, 'IGNORAR');
  assert.equal(score.raw_decision, 'IGNORAR');

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-ml-plain',
    shopeeCandidates: [],
    mlCandidates: [mlPlain],
    maxProducts: 10,
  });

  assert.equal(products.length, 0, 'ML sem qualquer sinal comercial adicional não entra no painel');
});

test('TASK PRÉ-MERGE (Shopee): Shopee mantém thresholds normais (<60 = IGNORAR, 60-79 = TESTAR, >=80 = PRIORIDADE)', () => {
  const shopeePlain = {
    marketplace: 'Shopee',
    itemId: 'SHP5001',
    shopId: 'shop-5001',
    productName: 'Item Shopee Sem Dados Suficientes',
    currentPrice: 50.00,
    discountPercent: 0,
    sales: 0,
    ratingStar: 0,
    commissionPercent: 0,
    permalink: 'https://shopee.com.br/product/1/5001',
    imageUrl: 'https://cf.shopee.com.br/5001.jpg',
  };

  const score = calculateCommercialOpportunityScoreV4(shopeePlain, { peers: [shopeePlain] });

  assert.ok(score.total < 60);
  assert.equal(score.selection_decision, 'IGNORAR');
  assert.equal(score.raw_decision, 'IGNORAR');
  assert.equal(score.decision, 'IGNORAR');
});

test('TASK PRÉ-MERGE (Auditoria): Nenhuma fabricação de dados e persistência com selection_decision real', () => {
  const { buildTrendRadarProductsFromCandidates } = require('../oracle-trends-radar-engine.cjs');

  const mlItem = {
    marketplace: 'Mercado Livre',
    itemId: 'MLB6001',
    productId: 'MLBU6001',
    productName: 'Fritadeira Sem Óleo Air Fryer 4L Digital',
    currentPrice: 280.00,
    oldPrice: 400.00,
    discountPercent: 30, // sinal factual de promoção
    sales: null,
    ratingStar: null,
    commissionPercent: 0,
    permalink: 'https://produto.mercadolivre.com.br/MLB-6001',
    imageUrl: 'https://http2.mlstatic.com/D_6001.jpg',
  };

  const products = buildTrendRadarProductsFromCandidates({
    radarRunId: 'run-ml-audit',
    shopeeCandidates: [],
    mlCandidates: [mlItem],
    maxProducts: 10,
  });

  assert.equal(products.length, 1);
  const p = products[0];
  const direct = p.direct_evidence[0];

  // Nenhuma fabricação de dados
  assert.equal(direct.sold_quantity, null);
  assert.equal(direct.rating, null);
  assert.equal(direct.effective_commission_percent, null);
  assert.equal(direct.estimated_commission_per_sale, null);
  assert.equal(direct.commission_status, 'unknown');

  // Metadados reais de decisão
  assert.equal(p.selection_decision, 'TESTAR');
  assert.equal(direct.selection_decision, 'TESTAR');
  assert.equal(direct.raw_decision, 'IGNORAR');
  assert.ok(p.commercial_score < 60, 'Commercial score bruto permanece auditável sem inflação artificial');
});
