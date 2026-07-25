import { describe, it, expect } from 'vitest';
const {
  computeExactKey,
  computeCommercialKey,
  computeFamilyKey,
  computeAllKeys,
  extractBrand,
  extractProductTypeSlug,
} = require('../family-key-engine.cjs');

// ─── Fixtures ──────────────────────────────────────────────────────────────

function amazonProduct(overrides = {}) {
  return {
    marketplace: 'Amazon',
    asin: 'B012345678',
    title: 'Produto Teste',
    price: 99,
    category: { name: 'Casa e Cozinha' },
    marketplaceMetrics: { asin: 'B012345678' },
    sourceItemId: 'B012345678',
    sourceUrl: 'https://www.amazon.com.br/dp/B012345678',
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T1 — Duplicata exata: mesmo ASIN
// ═══════════════════════════════════════════════════════════════════════════
describe('T1: Duplicata exata — mesmo ASIN', () => {
  it('dois produtos com o mesmo ASIN geram a mesma exact_key', () => {
    const p1 = amazonProduct({ asin: 'B012345678' });
    const p2 = amazonProduct({ asin: 'B012345678', title: 'Título Diferente', price: 120 });
    expect(computeExactKey(p1)).toBe(computeExactKey(p2));
  });

  it('ASINs diferentes geram exact_keys diferentes', () => {
    const p1 = amazonProduct({ asin: 'B012345678' });
    const p2 = amazonProduct({ asin: 'B099999999' });
    expect(computeExactKey(p1)).not.toBe(computeExactKey(p2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T2 — Duplicata exata: mesma URL canônica
// ═══════════════════════════════════════════════════════════════════════════
describe('T2: Duplicata exata — mesma URL canônica', () => {
  it('dois produtos com a mesma URL geram a mesma exact_key quando sem ASIN', () => {
    const url = 'https://www.amazon.com.br/dp/B099887766';
    const p1 = { marketplace: 'Amazon', asin: null, sourceItemId: null, sourceUrl: url, title: 'A', category: {} };
    const p2 = { marketplace: 'Amazon', asin: null, sourceItemId: null, sourceUrl: url, title: 'B', category: {} };
    expect(computeExactKey(p1)).toBe(computeExactKey(p2));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T3 — Duplicata comercial: mesma marca + modelo
// ═══════════════════════════════════════════════════════════════════════════
describe('T3: Duplicata comercial — mesma marca e modelo', () => {
  it('Tramontina 20051034 em marketplaces diferentes → commercial_key diferente', () => {
    const pAmazon  = { marketplace: 'Amazon',  title: 'Tramontina Assadeira 20051034', category: { name: 'Cozinha' } };
    const pShopee  = { marketplace: 'Shopee',  title: 'Tramontina Assadeira 20051034', category: { name: 'Cozinha' } };
    // Marketplace diferente → commercial_key diferente (correto)
    expect(computeCommercialKey(pAmazon)).not.toBe(computeCommercialKey(pShopee));
  });

  it('mesmo marketplace e mesmo produto → commercial_key igual', () => {
    const p1 = { marketplace: 'Amazon', title: 'Tramontina 20051034 Assadeira Antiaderente', category: { name: 'Cozinha' } };
    const p2 = { marketplace: 'Amazon', title: 'Tramontina 20051034 Assadeira Funda', category: { name: 'Cozinha' } };
    // Mesmo marketplace + mesma marca + mesmo código de modelo
    const k1 = computeCommercialKey(p1);
    const k2 = computeCommercialKey(p2);
    expect(k1).toBeTruthy();
    expect(k1).toBe(k2);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T4 — Mesma família: Assadeiras Tramontina 22cm e 34cm
// ═══════════════════════════════════════════════════════════════════════════
describe('T4: Mesma família — Assadeiras Tramontina 22cm e 34cm', () => {
  it('22cm e 34cm compartilham a mesma family_key (dimensão ignorada)', () => {
    const p22 = { marketplace: 'Amazon', title: 'Tramontina Assadeira Funda 22 cm', category: { name: 'Cozinha' } };
    const p34 = { marketplace: 'Amazon', title: 'Tramontina Assadeira Funda 34 cm', category: { name: 'Cozinha' } };
    const k22 = computeFamilyKey(p22);
    const k34 = computeFamilyKey(p34);
    expect(k22).toBeTruthy();
    expect(k22).toBe(k34);
  });

  it('family_confidence >= 0.60 para ambas', () => {
    const p22 = { marketplace: 'Amazon', title: 'Tramontina Assadeira Funda 22 cm', category: { name: 'Cozinha' } };
    const r = computeAllKeys(p22);
    expect(r.family_confidence).toBeGreaterThanOrEqual(0.60);
    expect(r.canGroup).toBe(true);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T5 — Mesma família com cores diferentes
// ═══════════════════════════════════════════════════════════════════════════
describe('T5: Mesma família — mesmas cores diferentes', () => {
  it('mesma panela em preto e prata → mesma family_key', () => {
    const pPreto = { marketplace: 'Amazon', title: 'Tramontina Frigideira 24cm Preto', category: { name: 'Cozinha' } };
    const pPrata = { marketplace: 'Amazon', title: 'Tramontina Frigideira 24cm Prata', category: { name: 'Cozinha' } };
    // Cores são removidas da family_key
    expect(computeFamilyKey(pPreto)).toBe(computeFamilyKey(pPrata));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T6 — NOT família: produtos com palavras parecidas mas distintos
// ═══════════════════════════════════════════════════════════════════════════
describe('T6: Produtos distintos NÃO agrupados', () => {
  it('FP-1: Tramontina assadeira e frigideira → family_keys diferentes', () => {
    const assadeira  = { marketplace: 'Amazon', title: 'Tramontina Assadeira Funda 28cm', category: { name: 'Cozinha' } };
    const frigideira = { marketplace: 'Amazon', title: 'Tramontina Frigideira Antiaderente 28cm', category: { name: 'Cozinha' } };
    expect(computeFamilyKey(assadeira)).not.toBe(computeFamilyKey(frigideira));
  });

  it('FP-2: Liquidificador e processador Mondial → family_keys diferentes', () => {
    const liq  = { marketplace: 'Amazon', title: 'Mondial Liquidificador 550W', category: { name: 'Cozinha' } };
    const proc = { marketplace: 'Amazon', title: 'Mondial Processador de Alimentos 500W', category: { name: 'Cozinha' } };
    expect(computeFamilyKey(liq)).not.toBe(computeFamilyKey(proc));
  });

  it('FP-3: Tapete de banheiro e tapete de sala → family_keys diferentes', () => {
    const tb = { marketplace: 'Shopee', title: 'Tapete de Banheiro Antiderrapante', category: { name: 'Casa' } };
    const ts = { marketplace: 'Shopee', title: 'Tapete de Sala Shaggy', category: { name: 'Casa' } };
    expect(computeFamilyKey(tb)).not.toBe(computeFamilyKey(ts));
  });

  it('T6: Produtos distintos NÃ\u00d3 agrupados > FP-4: Pote pl\u00e1stico e pote de vidro \u2192 family_keys diferentes', () => {
    // Adicionado "Tramontina" para que a marca seja detectada e a family_key n\u00e3o seja nula
    const pp = { marketplace: 'Shopee', title: 'Kit 10 Potes Pl\u00e1sticos 350ml Tramontina' };
    const pv = { marketplace: 'Shopee', title: 'Kit 10 Potes de Vidro Herm\u00e9ticos 350ml Tramontina' };
    // "pl\u00e1stico" vs "vidro" s\u00e3o materiais distintos \u2014 devem gerar keys diferentes
    expect(computeFamilyKey(pp)).not.toBe(computeFamilyKey(pv));
  });

  it('FP-5: iPhone 15 e iPhone 15 Pro → family_keys diferentes', () => {
    const i15    = { marketplace: 'Amazon', title: 'Apple iPhone 15 128GB', category: { name: 'Celulares' } };
    const i15pro = { marketplace: 'Amazon', title: 'Apple iPhone 15 Pro 256GB', category: { name: 'Celulares' } };
    expect(computeFamilyKey(i15)).not.toBe(computeFamilyKey(i15pro));
  });

  it('FP-6: Kit 4 peças e kit 24 peças — NÃO geram exact_key igual', () => {
    const k4  = { marketplace: 'Shopee', title: 'Kit 4 Marmitas Fitness', category: { name: 'Cozinha' }, sourceItemId: 'SH-001', sourceUrl: 'https://shopee.com.br/kit4' };
    const k24 = { marketplace: 'Shopee', title: 'Kit 24 Marmitas Fitness', category: { name: 'Cozinha' }, sourceItemId: 'SH-002', sourceUrl: 'https://shopee.com.br/kit24' };
    expect(computeExactKey(k4)).not.toBe(computeExactKey(k24));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Preservação de números relevantes
// ═══════════════════════════════════════════════════════════════════════════
describe('Preservação de números relevantes (Ajuste #3)', () => {
  it('Air Fryer 4L e 12L: capacidade preservada → family_keys DIFERENTES', () => {
    const af4  = { marketplace: 'Amazon', title: 'Mondial Air Fryer 4L Digital', category: { name: 'Cozinha' } };
    const af12 = { marketplace: 'Amazon', title: 'Mondial Air Fryer 12L Digital', category: { name: 'Cozinha' } };
    // Capacidade em litros é preservada → keys diferentes
    expect(computeFamilyKey(af4)).not.toBe(computeFamilyKey(af12));
  });

  it('Liquidificador 550W e 1200W → family_keys DIFERENTES', () => {
    const l550  = { marketplace: 'Amazon', title: 'Philips Walita Liquidificador 550W', category: { name: 'Cozinha' } };
    const l1200 = { marketplace: 'Amazon', title: 'Philips Walita Liquidificador 1200W', category: { name: 'Cozinha' } };
    expect(computeFamilyKey(l550)).not.toBe(computeFamilyKey(l1200));
  });

  it('iPhone 15 e iPhone 16 → family_keys DIFERENTES', () => {
    const i15 = { marketplace: 'Amazon', title: 'Apple iPhone 15 128GB', category: { name: 'Celulares' } };
    const i16 = { marketplace: 'Amazon', title: 'Apple iPhone 16 128GB', category: { name: 'Celulares' } };
    expect(computeFamilyKey(i15)).not.toBe(computeFamilyKey(i16));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Determinismo
// ═══════════════════════════════════════════════════════════════════════════
describe('Determinismo das chaves', () => {
  it('computeAllKeys retorna a mesma chave para as mesmas entradas', () => {
    const product = { marketplace: 'Amazon', title: 'Tramontina Assadeira Funda 28cm', category: { name: 'Cozinha' }, asin: 'B012345678' };
    const r1 = computeAllKeys(product);
    const r2 = computeAllKeys({ ...product });
    expect(r1.exact_key).toBe(r2.exact_key);
    expect(r1.commercial_key).toBe(r2.commercial_key);
    expect(r1.family_key).toBe(r2.family_key);
    expect(r1.family_confidence).toBe(r2.family_confidence);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Extração de tipo de produto
// ═══════════════════════════════════════════════════════════════════════════
describe('extractProductTypeSlug', () => {
  it('identifica assadeira', () => {
    expect(extractProductTypeSlug({ title: 'Tramontina Assadeira Antiaderente 28cm', category: {} })).toBe('assadeira');
  });

  it('identifica liquidificador', () => {
    expect(extractProductTypeSlug({ title: 'Philips Walita Liquidificador Daily', category: {} })).toBe('liquidificador');
  });

  it('identifica tapete de banheiro separadamente', () => {
    expect(extractProductTypeSlug({ title: 'Tapete de Banheiro Antiderrapante', category: {} })).toBe('tapete-banheiro');
  });

  it('identifica tapete de sala separadamente', () => {
    expect(extractProductTypeSlug({ title: 'Tapete de Sala Shaggy 200x300', category: {} })).toBe('tapete-sala');
  });

  it('retorna null para produto sem tipo reconhecido', () => {
    const slug = extractProductTypeSlug({ title: 'Coisas diversas', category: {} });
    expect(slug).toBeNull();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Extração de marca
// ═══════════════════════════════════════════════════════════════════════════
describe('extractBrand', () => {
  it('extrai Tramontina', () => {
    expect(extractBrand({ title: 'Tramontina Assadeira 28cm' })).toBe('tramontina');
  });

  it('extrai Philips', () => {
    expect(extractBrand({ title: 'Philips Walita Liquidificador 550W' })).toMatch(/philips/);
  });
});
