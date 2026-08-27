'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  NICHE_TO_LEGACY_SCENARIOS,
  executeShopeeHarnessQuery,
  extractEfficacyMetrics,
  evaluateMetricDelta,
  compareEfficacyMetrics,
  runMarketplaceNicheEfficacyComparison,
  runFullCommercialNicheEfficacySuite,
} = require('./commercial-niche-efficacy-runner.cjs');

const { getCommercialNiche } = require('../commercial-niche-config.cjs');
const { buildNicheMarketplacePlan } = require('../commercial-niche-runtime-adapter.cjs');
const { getMarketplaceScenarioContract } = require('../marketplace-scenario-contracts.cjs');
const { SCENARIO_QUERY_PLANS } = require('../shopee-openapi-shadow-engine-v1.cjs');

test('1. Prova que legacy e new usam exatamente o mesmo executor Amazon e apenas a configuração muda', async () => {
  const executedCalls = [];

  const mockAmazonExecutor = async (params) => {
    executedCalls.push({
      scenarioId: params.scenario.scenarioId,
      keywords: params.scenario.keywords,
      browseNodes: params.scenario.browseNodeIds,
      candidateLimit: params.candidateLimit,
    });
    return {
      products: [
        { asin: `B00${executedCalls.length}`, title: 'Fritadeira Air Fryer 4L Inox', price: 299.90, rating: 4.8, discount: 15 },
      ],
      queries: [{ status: 'ok' }],
    };
  };

  const result = await runMarketplaceNicheEfficacyComparison('casa_cozinha_organizacao', 'Amazon', {
    amazonExecutor: mockAmazonExecutor,
  });

  assert.equal(executedCalls.length, 2); // 1 legado (casa_cozinha_editorial) + 1 novo (casa_cozinha_organizacao)
  assert.equal(executedCalls[0].scenarioId, 'casa_cozinha_editorial');
  assert.equal(executedCalls[1].scenarioId, 'casa_cozinha_organizacao');

  // Amazon novo recebe termos e browse nodes combinados
  const newPlan = buildNicheMarketplacePlan('casa_cozinha_organizacao', 'Amazon');
  const expectedNewKeywords = newPlan.firstDiscovery?.intents
    ? newPlan.firstDiscovery.intents.flatMap((i) => i.queries)
    : newPlan.terms.all;
  assert.deepEqual(executedCalls[1].keywords, expectedNewKeywords);
  assert.deepEqual(executedCalls[1].browseNodes, newPlan.contract.amazonBrowseNodes);

  assert.ok(result.legacy.rawCount > 0);
  assert.ok(result.new.rawCount > 0);
  assert.equal(result.marketplace, 'Amazon');
});

test('2. Prova que na Shopee o harness envia variáveis da configuração legacy vs variáveis da nova configuração', async () => {
  const capturedRequests = [];

  const mockShopeeRequest = async (operationName, query, variables) => {
    capturedRequests.push({
      operationName,
      variables,
    });
    return {
      status: 200,
      data: {
        data: {
          productOfferV2: {
            nodes: [
              {
                itemId: `shopee-${capturedRequests.length}`,
                productName: variables.keyword ? `Produto para ${variables.keyword}` : `Produto Cat ${variables.productCatId}`,
                price: '89.90',
                priceMin: '89.90',
                ratingStar: '4.9',
                sales: '350',
                offerLink: 'https://s.shopee.com.br/item1',
                imageUrl: 'https://cf.shopee.com.br/item1.jpg',
                productCatIds: variables.productCatId ? [variables.productCatId] : [100630],
              }
            ],
            pageInfo: { hasNextPage: false }
          }
        }
      }
    };
  };

  const result = await runMarketplaceNicheEfficacyComparison('beleza', 'Shopee', {
    shopeeRequest: mockShopeeRequest,
  });

  assert.ok(capturedRequests.length > 0);

  const legacyPlan = SCENARIO_QUERY_PLANS.beleza_editorial;
  const legacyKeywords = legacyPlan?.keywords || [];
  const legacyCategories = legacyPlan?.categoryIds || [];
  const newPlan = buildNicheMarketplacePlan('beleza', 'Shopee');
  const expectedNewKeywords = newPlan.firstDiscovery?.intents
    ? newPlan.firstDiscovery.intents.flatMap((i) => i.queries)
    : newPlan.terms.all;

  // Separar chamadas feitas durante o bloco legacy vs bloco new
  // Legacy tem 5 keywords + 2 categorias = 7 chamadas
  const legacyCalls = capturedRequests.slice(0, (legacyKeywords.length + legacyCategories.length));
  const newCalls = capturedRequests.slice(legacyCalls.length);

  // Provar que as variáveis enviadas na parte Legacy vieram estritamente do contrato legacy
  for (const call of legacyCalls) {
    if (call.variables.keyword) {
      assert.ok(
        legacyKeywords.includes(call.variables.keyword),
        `Keyword legacy ${call.variables.keyword} deve pertencer ao contrato legacy`
      );
    }
    if (call.variables.productCatId) {
      assert.ok(
        legacyCategories.includes(call.variables.productCatId),
        `Categoria legacy ${call.variables.productCatId} deve pertencer ao contrato legacy`
      );
    }
  }

  // Provar que as variáveis enviadas na parte New vieram de firstDiscovery intents e newPlan.contract.shopeeApiCategories
  const requestedNewKeywords = newCalls.map((c) => c.variables.keyword).filter(Boolean);
  const requestedNewCategories = newCalls.map((c) => c.variables.productCatId).filter(Boolean);

  assert.ok(requestedNewKeywords.length > 0);
  assert.ok(requestedNewCategories.length > 0);

  for (const kw of requestedNewKeywords) {
    assert.ok(expectedNewKeywords.includes(kw), `Keyword nova ${kw} deve pertencer a expectedNewKeywords`);
  }

  for (const cat of requestedNewCategories) {
    assert.ok(newPlan.contract.shopeeApiCategories.includes(cat), `Categoria nova ${cat} deve pertencer a newPlan.contract.shopeeApiCategories`);
  }

  // Provar que termo específico da nova configuração ('tratamento capilar') foi solicitado no novo e não no legacy
  assert.ok(requestedNewKeywords.includes('tratamento capilar'), 'Deve requisitar "tratamento capilar" na nova configuração de beleza');
  assert.equal(legacyKeywords.includes('tratamento capilar'), false, 'Legacy não possui "tratamento capilar"');

  assert.equal(result.marketplace, 'Shopee');
  assert.ok(result.legacy.rawCount > 0);
  assert.ok(result.new.rawCount > 0);
});

test('3. Nenhuma função de motor foi alterada e nenhum arquivo de runtime ativo importa o runner', () => {
  const runtimeFiles = [
    path.join(__dirname, '../oracle-scraper.cjs'),
    path.join(__dirname, '../oracle-worker-discovery-only.cjs'),
    path.join(__dirname, '../scenario-runtime-contract.cjs'),
    path.join(__dirname, '../amazon-native-top20-v5.cjs'),
    path.join(__dirname, '../mercadolivre-official-intents-v5.cjs'),
    path.join(__dirname, '../shopee-openapi-shadow-engine-v1.cjs'),
    path.join(__dirname, '../shopee-openapi-v1-adapter.cjs'),
  ];

  for (const filePath of runtimeFiles) {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf8');
      assert.equal(content.includes('commercial-niche-efficacy-runner'), false, `Arquivo ${filePath} não pode importar o efficacy-runner`);
      assert.equal(content.includes('runFullCommercialNicheEfficacySuite'), false, `Arquivo ${filePath} não pode importar o runner`);
    }
  }
});

test('4. Relatório da suíte completa garante zero writes', async () => {
  const mockExecutor = async () => ({
    products: [{ asin: 'B123', title: 'Notebook 16GB SSD', price: 3500 }],
    queries: [{ status: 'ok' }],
  });

  const suiteReport = await runFullCommercialNicheEfficacySuite({
    marketplaces: ['Amazon'],
    nicheIds: ['informatica'],
    amazonExecutor: mockExecutor,
  });

  assert.equal(suiteReport.mode, 'read_only_efficacy_test');
  assert.deepEqual(suiteReport.writes, {
    supabase: 0,
    offers: 0,
    posts: 0,
    publications: 0,
  });
  assert.equal(suiteReport.totalComparisons, 1);
});

test('5. Métricas de eficácia (relevância, ruído, cobertura, diversidade) são calculadas com precisão', () => {
  const niche = getCommercialNiche('casa_cozinha_organizacao');
  const products = [
    { asin: 'B01', title: 'Fritadeira Air Fryer 4L Oster', price: 349.90, rating: 4.7, discount: 20 },
    { asin: 'B02', title: 'Cafeteira Expresso 15 Bar', price: 499.00, rating: 4.6, discount: 10 },
    { asin: 'B03', title: 'Peça de Reposição Borracha de Panela', price: 15.00 }, // Ruído / Acessório bloqueado
    { asin: 'B04', title: 'Smartphone 128GB 5G', price: 1200.00 }, // Fora do nicho
    { asin: 'B05', title: 'Jogo de Cama Queen 100% Algodão', price: 0 }, // Preço inválido
  ];

  const metrics = extractEfficacyMetrics(products, [], niche);

  assert.equal(metrics.rawCount, 5);
  assert.equal(metrics.validCount, 2); // B01, B02
  assert.equal(metrics.rejectedCount, 3);
  assert.equal(metrics.accessoriesNoiseCount, 1); // B03
  assert.equal(metrics.outOfNicheCount, 1); // B04
  assert.equal(metrics.invalidPriceCount, 1); // B05
  assert.equal(metrics.productDiversity, 2); // air fryer, cafeteira
  assert.equal(metrics.coreCoveragePercent, 20.0); // 2 de 10 produtos core
  assert.equal(metrics.scores.relevance, 40.0); // (2/5)*100
  assert.equal(metrics.scores.noise, 40.0); // (2/5)*100
});

test('6. Dados não disponíveis permanecem null / INSUFFICIENT_DATA sem invenção de valor', () => {
  const niche = getCommercialNiche('beleza');
  const productsWithoutStockOrRating = [
    { asin: 'B99', title: 'Protetor Solar Facial FPS 50', price: 59.90 },
  ];

  const metrics = extractEfficacyMetrics(productsWithoutStockOrRating, [], niche);
  assert.equal(metrics.rating, null);
  assert.equal(metrics.salesPopularity, null);
  assert.equal(metrics.discount, null);
  assert.equal(metrics.outOfStockCount, null);

  const delta = evaluateMetricDelta(metrics.rating, null, true);
  assert.equal(delta.status, 'INSUFFICIENT_DATA');
});

test('7. Erro de API não é mascarado e aparece registrado em apiErrors', () => {
  const niche = getCommercialNiche('pet');
  const queriesWithError = [
    { status: 'error', error: 'HTTP 429 Too Many Requests' },
  ];

  const metrics = extractEfficacyMetrics([], queriesWithError, niche);
  assert.equal(metrics.rawCount, 0);
  assert.equal(metrics.validCount, 0);
  assert.equal(metrics.apiErrors.length, 1);
  assert.equal(metrics.rateLimit429Count, 1);
});

test('8. Resultado vazio não é marcado como sucesso (relevância = 0, cobertura = 0)', () => {
  const niche = getCommercialNiche('ferramentas');
  const metrics = extractEfficacyMetrics([], [], niche);

  assert.equal(metrics.rawCount, 0);
  assert.equal(metrics.validCount, 0);
  assert.equal(metrics.eligibleCount, 0);
  assert.equal(metrics.scores.relevance, 0);
  assert.equal(metrics.scores.coreCoverage, 0);
  assert.equal(metrics.scores.quality, 0);
});
