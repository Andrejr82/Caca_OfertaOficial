const {
  COMMERCIAL_CURATION_VERSION,
  COMMERCIAL_INTENTS,
  classifyCommercialIntent,
  scoreCommercialOffer,
  isCommerciallyEligible,
  rankCommercialOffers,
  buildCommercialCopy,
  explainCommercialDecision,
  buildCommercialMetadata,
  getCommercialRiskFlags,
  getRecommendedChannel,
} = require('../commercial-curation-v1.cjs');

const base = (overrides = {}) => ({
  marketplace: 'Shopee',
  title: 'Organizador de gaveta ajustável',
  price: 39.9,
  discountPercent: 20,
  rating: 4.8,
  sales: 1200,
  imageUrl: 'https://example.test/image.jpg',
  affiliateUrl: 'https://example.test/offer',
  category: 'Organização',
  marketplaceMetrics: { ratingStar: 4.8, sales: 1200, priceDiscountRate: 20 },
  ...overrides,
});

describe('Commercial Curation V1', () => {
  it('scores Shopee evidence and ranks stronger evidence above a weak peer', () => {
    const strong = scoreCommercialOffer(base());
    const weak = scoreCommercialOffer(base({ rating: null, sales: null, discountPercent: null, marketplaceMetrics: {} }));
    expect(strong.score).toBeGreaterThan(weak.score);
    expect(strong.score).not.toBe(80);
    expect(rankCommercialOffers([base({ title: 'Fraco', rating: null, sales: null, discountPercent: null, marketplaceMetrics: {} }), base({ title: 'Forte' })])[0].title).toBe('Forte');
  });

  it('keeps Mercado Livre conservative and outside Shopee-only claims', () => {
    const product = base({ marketplace: 'Mercado Livre', title: 'Suporte para notebook', category: 'Informática', rating: undefined, sales: undefined, marketplaceMetrics: {} });
    const copy = buildCommercialCopy(product);
    expect(copy).not.toMatch(/mais vendido|avaliação|reviews|loja oficial|cupom/i);
    expect(getCommercialRiskFlags(product)).toContain('ml_missing_social_proof');
  });

  it('admits Amazon into manual commercial ranking', () => {
    const amazon = base({ marketplace: 'Amazon' });
    expect(isCommerciallyEligible(amazon).eligible).toBe(true);
    expect(rankCommercialOffers([amazon])).toHaveLength(1);
  });

  it('routes expensive, large furniture, complex fashion, and missing data to safe outcomes', () => {
    expect(getCommercialRiskFlags(base({ price: 1500, title: 'Notebook Gamer' }))).toContain('high_ticket_requires_manual');
    expect(getCommercialRiskFlags(base({ title: 'Sofá retrátil 3 lugares', category: 'Móveis' }))).toContain('large_furniture_manual');
    expect(getCommercialRiskFlags(base({ title: 'Calça jeans feminina tamanho especial', category: 'Moda' }))).toContain('fashion_size_complexity');
    expect(isCommerciallyEligible(base({ price: null, affiliateUrl: null })).eligible).toBe(false);
  });

  it('generates intention-specific safe copy only from present fields', () => {
    const shopeeCopy = buildCommercialCopy(base({ title: 'Caixa de som Bluetooth portátil', category: 'Áudio' }));
    expect(shopeeCopy).toMatch(/Gadget visual com preço interessante/);
    expect(shopeeCopy).toMatch(/Avaliação 4\.8/);
    expect(shopeeCopy).toMatch(/1\.200 vendas informadas/);
    const mlCopy = buildCommercialCopy(base({ marketplace: 'Mercado Livre', title: 'Varal dobrável', category: 'Varais', rating: null, sales: null, marketplaceMetrics: {}, shippingFree: true }));
    expect(mlCopy).toMatch(/Frete grátis informado/);
    expect(mlCopy).toMatch(/20% OFF informado/);
    expect(mlCopy).not.toMatch(/Avaliação|vendas informadas/);
  });

  it('uses the concise dynamic discount wording and omits untrusted discounts', () => {
    expect(buildCommercialCopy(base({ discountPercent: 64 }))).toMatch(/✅ 64% OFF informado/);
    expect(buildCommercialCopy(base({ discountPercent: 10 }))).toMatch(/✅ 10% OFF informado/);
    expect(buildCommercialCopy(base({ discountPercent: null, discount: null, marketplaceMetrics: {} }))).not.toMatch(/OFF informado/);
  });

  it('shows freight only when the runtime explicitly confirms free shipping', () => {
    const mercadoLivre = { marketplace: 'Mercado Livre', title: 'Varal dobrável', category: 'Varais', rating: null, sales: null, marketplaceMetrics: {} };
    expect(buildCommercialCopy({ ...base(), ...mercadoLivre, shippingFree: true })).toMatch(/✅ Frete grátis informado/);
    expect(buildCommercialCopy({ ...base(), ...mercadoLivre, shippingFree: false })).not.toMatch(/Frete grátis informado/);
    expect(buildCommercialCopy({ ...base(), ...mercadoLivre, shippingFree: undefined })).not.toMatch(/Frete grátis informado/);
  });

  it('uses the final price and stock warning while preserving the offer structure', () => {
    const copy = buildCommercialCopy(base({ title: 'Produto com título completo' }));
    expect(copy).toMatch(/^🔥 .+\n\nProduto com título completo\n💰 R\$ /);
    expect(copy).toContain('🔗 Ver oferta');
    expect(copy).toContain('⚠️ Preço e estoque podem mudar a qualquer momento');
  });

  it('exposes gates, metadata, risks, and channel without publishing', () => {
    const product = base({ sourceScenarioId: 'casa_cozinha_editorial' });
    const decision = explainCommercialDecision(product);
    const metadata = buildCommercialMetadata(product);
    expect(COMMERCIAL_CURATION_VERSION).toBe('commercial-curation/v1');
    expect(COMMERCIAL_INTENTS).toContain('utilidade_casa_essencial');
    expect(decision).toHaveProperty('eligible');
    expect(metadata).toMatchObject({ commercialCurationVersion: 'commercial-curation/v1', commercialIntent: 'casa_organizada_antes_depois', copyVersion: 'commercial-copy/v1', marketplaceFocus: 'shopee' });
    expect(getRecommendedChannel(product)).toBe('telegram');
  });

  it('produces clean copy without duplicate hooks or separator artifacts', () => {
    const copy = buildCommercialCopy(base({ title: 'Caixa de som Bluetooth portátil', category: 'Áudio' }));
    expect(copy).not.toContain('/ /');
    expect(copy).not.toMatch(/\n\n\n/);
    expect(copy).not.toMatch(/Oferta com boa prova social/);
    expect(copy.split('\n').filter((line) => line.startsWith('✅ ')).length).toBeLessThanOrEqual(4);
  });

  it('classifies known ambiguous products into their commercial intent', () => {
    expect(classifyCommercialIntent({ title: 'Papel adesivo de parede para sala e lavanderia', category: 'Decoração' })).toBe('casa_organizada_antes_depois');
    expect(classifyCommercialIntent({ title: 'Bermuda gestante modeladora', category: 'Moda' })).toBe('look_sem_erro');
    expect(classifyCommercialIntent({ title: 'Sensor de pneu e válvula para motocicleta e carro', category: 'Automotivo' })).toBe('carro_pratico');
    const camera = base({ title: 'Câmera IP com sensor de movimento', category: 'Segurança' });
    expect(classifyCommercialIntent(camera)).not.toBe('upgrade_trabalho_estudo');
    expect(getCommercialRiskFlags(camera)).toContain('category_requires_manual');
    expect(getCommercialRiskFlags(camera)).toContain('security_camera_manual');
    expect(classifyCommercialIntent({ title: 'Varal retrátil para lavanderia', category: 'Casa' })).toBe('casa_organizada_antes_depois');
    expect(classifyCommercialIntent({ title: 'Kit óculos festa fantasia', category: 'Festa' })).toBe('look_sem_erro');
  });

  it('classifies home fitness products as movimento_em_casa and uses exercise copy', () => {
    const product = base({
      title: 'Kit Elásticos Extensores 11 Peças para Treino Funcional em Casa Academia Musculação Fitness Resistência Exercícios Braços Pernas Glúteos Alongamento',
      category: 'Esportes e Fitness',
    });

    expect(classifyCommercialIntent(product)).toBe('movimento_em_casa');
    const copy = buildCommercialCopy(product);
    expect(copy).toMatch(/Movimento em casa|Treino prático em casa|treino em casa/);
    expect(copy).toMatch(/Ajuda no treino em casa|Acessório útil para exercícios e alongamento/);
    expect(copy).not.toMatch(/rotina da casa|tarefa da casa/i);
  });

  it.each([
    'Acessório para treino funcional em casa',
    'Kit para academia e musculação',
    'Elástico extensor para exercícios e alongamento',
  ])('does not classify fitness product "%s" as a home intent', (title) => {
    const product = base({ title, category: 'Esportes' });
    const copy = buildCommercialCopy(product);
    expect(classifyCommercialIntent(product)).toBe('movimento_em_casa');
    expect(classifyCommercialIntent(product)).not.toMatch(/utilidade_casa|casa_organizada|casa_escritorio|eletro_validado/);
    expect(copy).not.toMatch(/rotina da casa|tarefa da casa/i);
    expect(copy).toMatch(/Movimento em casa|Treino prático em casa|treino em casa/);
  });

  it('separates manual-first products from automatic candidates', () => {
    const products = rankCommercialOffers([
      base({ title: 'Caixa de som portátil', price: 49 }),
      base({ title: 'Cadeira gamer reclinável', category: 'Móveis', price: 700 }),
      base({ title: 'Smartphone 5G 256GB', category: 'Celular', price: 1200 }),
    ]);
    const automatic = products.filter((product) => product.automaticEligible);
    expect(automatic.every((product) => !product.manualReviewRequired)).toBe(true);
    expect(products.find((product) => /Cadeira gamer/.test(product.title)).manualReviewRequired).toBe(true);
    expect(products.find((product) => /Smartphone/.test(product.title)).manualReviewRequired).toBe(true);
    expect(products.find((product) => /Cadeira gamer/.test(product.title)).automaticEligible).toBe(false);
    expect(products.find((product) => /Smartphone/.test(product.title)).automaticEligible).toBe(false);
  });

  it('keeps score distribution below saturation for strong but different candidates', () => {
    const scores = rankCommercialOffers([
      base({ title: 'Forte 1', rating: 4.8, sales: 1200, discountPercent: 20 }),
      base({ title: 'Forte 2', rating: 4.7, sales: 900, discountPercent: 18 }),
      base({ title: 'Forte 3', rating: 4.6, sales: 500, discountPercent: 15 }),
      base({ title: 'Forte 4', rating: 4.5, sales: 300, discountPercent: 12 }),
    ]);
    expect(new Set(scores.map((product) => product.score)).size).toBeGreaterThan(1);
    expect(scores.filter((product) => product.score === 100).length).toBeLessThanOrEqual(3);
  });
});
