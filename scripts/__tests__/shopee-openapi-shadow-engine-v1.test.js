'use strict';

const fs = require('node:fs');
const path = require('node:path');
const {
  SCENARIO_CONTRACTS,
  SCENARIO_QUERY_PLANS,
  GRAPHQL_CONTRACTS,
  normalizeCommission,
  evaluateIntent,
  normalizeProductOffer,
  normalizeFeedColumns,
  processDeltaRows,
  runShadow,
  runScenarioPlan,
} = require('../shopee-openapi-shadow-engine-v1.cjs');

const fixture = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'fixtures', 'shopee-intent-labeled-sample.json'), 'utf8'));

function product(overrides = {}) {
  return {
    itemId: '1001', shopId: '2001', productName: 'Organizador de cozinha com tampa',
    productLink: 'https://shopee.com.br/product/2001/1001', offerLink: 'https://s.shopee.com.br/example',
    imageUrl: 'https://cf.shopee.com.br/example.jpg', priceMin: '49.90', priceMax: '79.90',
    ratingStar: '4.8', sales: '1200', priceDiscountRate: '37.5', commissionRate: '0.03',
    shopeeCommissionRate: null, sellerCommissionRate: null, shopType: [1], productCatIds: [100010],
    ...overrides,
  };
}

describe('Shopee OpenAPI Shadow Engine V1', () => {
  it('define plano de consulta coerente e limitado para cada cenário', () => {
    expect(Object.keys(SCENARIO_QUERY_PLANS)).toEqual(Object.keys(SCENARIO_CONTRACTS));
    for (const plan of Object.values(SCENARIO_QUERY_PLANS)) {
      expect(plan.keywords.length).toBeGreaterThanOrEqual(4);
      expect(plan.categoryIds.length).toBeGreaterThan(0);
      expect(plan.shopTypes).toEqual(expect.arrayContaining([1]));
      expect(plan.sources).toEqual(expect.arrayContaining(['productOfferV2', 'DELTA', 'shopOfferV2', 'shopeeOfferV2']));
      expect(plan.limits.productOfferV2PerQuery).toBeLessThanOrEqual(20);
      expect(plan.limits.maxFeedRows).toBeLessThanOrEqual(100);
    }
  });

  it('expõe os 14 contratos editoriais com todos os campos declarativos', () => {
    expect(Object.keys(SCENARIO_CONTRACTS)).toHaveLength(14);
    for (const contract of Object.values(SCENARIO_CONTRACTS)) {
      expect(contract).toEqual(expect.objectContaining({
        positiveDomain: expect.any(Array), requiredProductClass: expect.any(Array), negativeDomain: expect.any(Array),
        ambiguousTerms: expect.any(Array), allowedApiCategories: expect.any(Array), blockedApiCategories: expect.any(Array),
        minSales: expect.any(Number), minRating: expect.any(Number), minDiscount: expect.any(Number), minCommission: expect.any(Number),
        maxFamilyPerScenario: expect.any(Number), maxShopPerScenario: expect.any(Number),
      }));
    }
  });

  it('não solicita campo rejeitado pelo schema validado', () => {
    for (const contract of Object.values(GRAPHQL_CONTRACTS)) {
      for (const rejected of contract.rejectedFields) expect(contract.query || '').not.toMatch(new RegExp(`\\b${rejected}\\b`));
    }
    expect(GRAPHQL_CONTRACTS.generateShortLink.executable).toBe(false);
    expect(GRAPHQL_CONTRACTS.conversionReport.executable).toBe(false);
    expect(GRAPHQL_CONTRACTS.validatedReport.executable).toBe(false);
  });

  it('normaliza comissão sem somar campos cegamente', () => {
    expect(normalizeCommission({ commissionRate: '0.03', sellerCommissionRate: '0.08', shopeeCommissionRate: '0.12' })).toEqual({
      commissionBasis: 'max_safe_component', commissionPercent: 12, commissionUnresolved: true,
    });
    expect(normalizeCommission({ commissionRate: '3' })).toEqual({
      commissionBasis: 'commissionRate', commissionPercent: 3, commissionUnresolved: false,
    });
    expect(normalizeCommission({})).toEqual({
      commissionBasis: 'unresolved', commissionPercent: 0, commissionUnresolved: true,
    });
  });

  it('bloqueia domésticos em beleza e saúde em informática', () => {
    expect(evaluateIntent({ productName: 'Centrífuga de salada inox', productCatIds: [100010], sales: 100, ratingStar: 4.8, priceDiscountRate: 20, commissionPercent: 5 }, SCENARIO_CONTRACTS.beleza_editorial).eligible).toBe(false);
    expect(evaluateIntent({ productName: 'Monitor de pressão arterial digital', productCatIds: [100001], sales: 100, ratingStar: 4.8, priceDiscountRate: 20, commissionPercent: 5 }, SCENARIO_CONTRACTS.informatica_editorial).eligible).toBe(false);
    expect(evaluateIntent({ productName: 'Notebook gamer 16GB SSD', productCatIds: [100644], sales: 100, ratingStar: 4.8, priceDiscountRate: 20, commissionPercent: 5 }, SCENARIO_CONTRACTS.informatica_editorial).eligible).toBe(true);
  });

  it('aplica classes negativas antes do score nos cenários corrigidos', () => {
    const common = { productCatIds: [100010], sales: 1000, ratingStar: 4.9, priceDiscountRate: 30, commissionPercent: 8 };
    expect(evaluateIntent({ ...common, productName: 'Kit teclado e mouse Bluetooth compatível com TV' }, SCENARIO_CONTRACTS.tv_audio_editorial).eligible).toBe(false);
    expect(evaluateIntent({ ...common, productName: 'Caneta 3D com refil escolar' }, SCENARIO_CONTRACTS.grandes_ofertas_editorial).eligible).toBe(false);
    expect(evaluateIntent({ ...common, productName: 'Tripé de bastão de selfie para celular' }, SCENARIO_CONTRACTS.grandes_ofertas_editorial).eligible).toBe(false);
    expect(evaluateIntent({ ...common, productName: 'Chave T para máquina de lavar' }, SCENARIO_CONTRACTS.eletrodomesticos_editorial).eligible).toBe(false);
    expect(evaluateIntent({ ...common, productName: 'Mesa dobrável para notebook' }, SCENARIO_CONTRACTS.informatica_editorial).eligible).toBe(false);
    expect(evaluateIntent({ ...common, productName: 'Broche decorativo para mochila' }, SCENARIO_CONTRACTS.moda_editorial).eligible).toBe(false);
    expect(evaluateIntent({ ...common, productName: 'Soundbar Bluetooth 2.1 com subwoofer', productCatIds: [100535] }, SCENARIO_CONTRACTS.tv_audio_editorial).eligible).toBe(true);
    expect(evaluateIntent({ ...common, productName: 'Smartphone 5G 256GB', productCatIds: [100013] }, SCENARIO_CONTRACTS.grandes_ofertas_editorial).eligible).toBe(true);
  });

  it('mantém benchmark rotulado mínimo para os falsos positivos corrigidos', () => {
    const titles = fixture.cases.map((item) => item.title);
    expect(titles).toEqual(expect.arrayContaining([
      'Smart TV 4K 55 polegadas', 'Kit teclado e mouse Bluetooth compatível com TV',
      'Smartphone 5G 256GB em oferta', 'Caneta 3D com refil escolar',
      'Chave T para máquina de lavar', 'Broche decorativo para mochila', 'Mesa dobrável para notebook',
    ]));
  });

  it('exige imagem e link antes de admitir item técnico', () => {
    expect(normalizeProductOffer(product({ imageUrl: '' }), { scenarioId: 'organizacao_editorial', productCatId: 100010 }).accepted).toBe(false);
    expect(normalizeProductOffer(product({ offerLink: '', productLink: '' }), { scenarioId: 'organizacao_editorial', productCatId: 100010 }).accepted).toBe(false);
    expect(normalizeProductOffer(product(), { scenarioId: 'organizacao_editorial', productCatId: 100010 }).accepted).toBe(true);
  });

  it('transforma DELETE do DELTA em tombstone e limita linhas', () => {
    const result = processDeltaRows([
      { updateType: 'NEW', columns: JSON.stringify(product({ itemId: '1' })) },
      { updateType: 'UPDATE', columns: JSON.stringify(product({ itemId: '2' })) },
      { updateType: 'DELETE', columns: JSON.stringify({ itemId: '3', shopId: '4' }) },
    ], { datafeedId: 'delta-1', maxRows: 2 });
    expect(result.metrics.rowsRead).toBe(2);
    expect(result.tombstones).toEqual([]);
    const deleteResult = processDeltaRows([{ updateType: 'DELETE', columns: JSON.stringify({ itemId: '3', shopId: '4' }) }], { datafeedId: 'delta-1', maxRows: 10 });
    expect(deleteResult.tombstones[0]).toMatchObject({ itemId: '3', shopId: '4', updateType: 'DELETE', datafeedId: 'delta-1' });
  });

  it('normaliza columns snake_case reais do Data Feed', () => {
    const normalized = normalizeFeedColumns({ itemid: '77', product_link: 'https://shopee.com.br/product/88/77', image_link: 'https://x/y.jpg', title: 'Teclado para computador', sale_price: '99.90', item_rating: '4.8', discount_percentage: '20', global_catid1: '100644' });
    expect(normalized).toMatchObject({ itemId: '77', shopId: '88', productName: 'Teclado para computador', productCatIds: ['100644'], priceMin: '99.90', ratingStar: '4.8' });
  });

  it('não coloca shopOfferV2/shopeeOfferV2 diretamente no Top', () => {
    const result = runShadow({
      sources: { productOffers: [product()], shopOffers: [{ shopId: '99', shopName: 'Loja', offerLink: 'https://s.shopee.com.br/x', commissionRate: '0.12' }], shopeeOffers: [{ offerName: 'Campanha', offerLink: 'https://s.shopee.com.br/y', imageUrl: 'https://x/y.jpg', commissionRate: '0.1' }] },
      contracts: { organizacao_editorial: SCENARIO_CONTRACTS.organizacao_editorial }, topLimit: 10,
    });
    expect(result.auxiliary.shopOfferV2[0]).toMatchObject({ requiresProductResolution: true, resolved: false });
    expect(result.auxiliary.shopeeOfferV2[0]).toMatchObject({ requiresProductResolution: true, resolved: false });
    expect(result.scenarios.organizacao_editorial.top.every((item) => item.source === 'productOfferV2')).toBe(true);
  });

  it('permite auxiliar no Top somente depois de resolução productOfferV2', () => {
    const resolved = product({ itemId: '9901', productName: 'Organizador de cozinha resolvido', source: 'productOfferV2', resolvedFrom: 'shopOfferV2' });
    const result = runShadow({ sources: { productOffers: [], shopOffers: [{ shopId: '99', offerLink: 'https://s.shopee.com.br/x', resolvedProduct: resolved }], shopeeOffers: [] }, contracts: { organizacao_editorial: SCENARIO_CONTRACTS.organizacao_editorial }, topLimit: 10 });
    expect(result.auxiliary.shopOfferV2[0]).toMatchObject({ requiresProductResolution: true, resolved: true });
    expect(result.scenarios.organizacao_editorial.top.map((item) => item.itemId)).toContain('9901');
  });

  it('deduplica a família Romantic Crown antes do Top', () => {
    const romantic = fixture.cases.filter((item) => item.scenario === 'moda_editorial' && item.label === 'duplicidade_familia');
    const result = runShadow({ sources: { productOffers: romantic.map((item, index) => product({ itemId: String(7000 + index), shopId: '8000', productName: item.title, productCatIds: [100009] })) }, contracts: { moda_editorial: SCENARIO_CONTRACTS.moda_editorial }, topLimit: 10 });
    expect(result.scenarios.moda_editorial.metrics.duplicates).toBeGreaterThan(0);
    expect(result.scenarios.moda_editorial.top).toHaveLength(1);
  });

  it('scoreia somente depois do contrato de intenção', () => {
    const result = runShadow({ sources: { productOffers: [
      product({ itemId: '9001', productName: 'Suporte de shampoo para banheiro', sales: '99999', ratingStar: '5', productCatIds: [100010] }),
      product({ itemId: '9002', productName: 'Organizador de cozinha com tampa', sales: '10', ratingStar: '4.5', productCatIds: [100010] }),
    ] }, contracts: { organizacao_editorial: SCENARIO_CONTRACTS.organizacao_editorial }, topLimit: 10 });
    expect(result.scenarios.organizacao_editorial.top.map((item) => item.itemId)).toEqual(['9002']);
    expect(result.scenarios.organizacao_editorial.metrics.scoreable).toBe(1);
  });

  it('não expõe escrita em Supabase e retorna auditoria de zero escrita', () => {
    const source = { productOffers: [product()] };
    const result = runShadow({ sources: source, contracts: { organizacao_editorial: SCENARIO_CONTRACTS.organizacao_editorial } });
    expect(result.writeAudit).toEqual({ supabaseWrites: 0, offersWrites: 0, postsWrites: 0, publishCalls: 0, oracleCalls: 0 });
    expect(source).toEqual({ productOffers: [product()] });
    expect(fs.readFileSync(path.join(__dirname, '..', 'shopee-openapi-shadow-engine-v1.cjs'), 'utf8')).not.toMatch(/\.from\(|\.insert\(|\.upsert\(/i);
  });

  it('decompõe rejeições e calcula métricas do Top', () => {
    const result = runShadow({ sources: { productOffers: [
      product({ itemId: '9101', productName: 'Organizador de cozinha', sales: 100, ratingStar: 4.8, priceDiscountRate: 20 }),
      product({ itemId: '9102', productName: 'Suporte de shampoo para banheiro', sales: 99999, ratingStar: 5, priceDiscountRate: 80 }),
      product({ itemId: '9103', productName: 'Organizador de cozinha sem imagem', imageUrl: '', sales: 100 }),
    ] }, contracts: { organizacao_editorial: SCENARIO_CONTRACTS.organizacao_editorial }, topLimit: 30 });
    expect(result.scenarios.organizacao_editorial.metrics).toEqual(expect.objectContaining({ parsed: 3, approvedContract: 2, final: 1 }));
    expect(result.scenarios.organizacao_editorial.metrics.rejections).toEqual(expect.objectContaining({ ambiguousTerms: 1, technicalImageLink: 1, duplicates: 0 }));
    expect(result.scenarios.organizacao_editorial.metrics.topAverages).toEqual(expect.objectContaining({ price: expect.any(Number), discount: expect.any(Number), rating: expect.any(Number), sales: expect.any(Number), commission: expect.any(Number) }));
  });

  it('executa keywords e categorias do plano sem persistência', async () => {
    const calls = [];
    const request = async (operation, query, variables) => { calls.push({ operation, variables }); return { status: 200, data: { data: { productOfferV2: { nodes: [product({ productName: 'Organizador de cozinha', productCatIds: [100010] })] } } } }; };
    const result = await runScenarioPlan('organizacao_editorial', { request, maxKeywords: 4, maxCategories: 1, includeAuxiliary: false, includeDelta: false });
    expect(calls.filter((call) => call.operation === 'ShopeePromotionOffers')).toHaveLength(5);
    expect(calls.some((call) => call.variables.keyword === 'organizador de cozinha')).toBe(true);
    expect(calls.some((call) => call.variables.productCatId === 100010)).toBe(true);
    expect(result.writeAudit.supabaseWrites).toBe(0);
  });
});
