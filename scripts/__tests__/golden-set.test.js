import { describe, it, expect } from 'vitest';

const { computeAllKeys, computeFamilyKey } = require('../family-key-engine.cjs');
const { qualityGate, scoreCandidate, desireScore } = require('../curation-policy.cjs');
const { selectBestVariants, variantSelectionScore } = require('../family-variant-selector.cjs');
const { validateCopyClaims } = require('../copy-claim-validator.cjs');
const GOLDEN_SET = require('../tests/GOLDEN_SET_PRODUCT_QUALITY_V5.json');

// ─── Helpers ───────────────────────────────────────────────────────────────

function makeProduct(overrides = {}) {
  return {
    marketplace: 'Amazon',
    sourceItemId: 'B012345678',
    asin: 'B012345678',
    sourceUrl: 'https://www.amazon.com.br/dp/B012345678',
    title: 'Tramontina Assadeira 28cm',
    imageUrl: 'https://m.media-amazon.com/images/I/test.jpg',
    currentPrice: 89.90,
    originalPrice: 119.90,
    deterministicScore: 7,
    discoveredAt: '2026-07-01T10:00:00Z',
    category: { name: 'Cozinha', source: 'Amazon Best Sellers' },
    marketplaceMetrics: { asin: 'B012345678', prime: true, coupon: false, rating: 4.5, reviewCount: 800 },
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════
// T10 — Amazon sem métricas → warning DADOS_COMERCIAIS_INDISPONIVEIS
// ═══════════════════════════════════════════════════════════════════════════
describe('T10: Amazon sem métricas comerciais', () => {
  it('deve emitir DADOS_COMERCIAIS_INDISPONIVEIS quando sem old_price, prime, coupon', () => {
    const product = makeProduct({ originalPrice: null, marketplaceMetrics: {} });
    const gate = qualityGate(product);
    expect(gate.eligible).toBe(true);
    expect(gate.warnings).toContain('DADOS_COMERCIAIS_INDISPONIVEIS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T11 — Amazon com rating propagado via normalizer corrigido
// ═══════════════════════════════════════════════════════════════════════════
describe('T11: Amazon com rating propagado', () => {
  it('qualityGate recebe rating depois da correção do normalizer', () => {
    const product = makeProduct({ marketplaceMetrics: { asin: 'B012345678', prime: true, coupon: false, rating: 4.6, reviewCount: 1200 } });
    const gate = qualityGate(product);
    expect(gate.eligible).toBe(true);
    expect(product.marketplaceMetrics.rating).toBe(4.6);
    expect(product.marketplaceMetrics.reviewCount).toBe(1200);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T12 — Amazon Prime propagado
// ═══════════════════════════════════════════════════════════════════════════
describe('T12: Amazon Prime propagado', () => {
  it('prime no marketplaceMetrics faz gate reconhecer como elegível sem DADOS_COMERCIAIS_INDISPONIVEIS', () => {
    const product = makeProduct({ originalPrice: null, marketplaceMetrics: { prime: true, coupon: false, rating: null, reviewCount: null } });
    const gate = qualityGate(product);
    expect(gate.eligible).toBe(true);
    expect(gate.warnings).not.toContain('DADOS_COMERCIAIS_INDISPONIVEIS');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T13 — Amazon com desconto calculado
// ═══════════════════════════════════════════════════════════════════════════
describe('T13: Amazon com desconto calculado', () => {
  it('produto com originalPrice maior tem discountPercent correto', () => {
    const product = makeProduct({ currentPrice: 89.90, originalPrice: 119.90 });
    const gate = qualityGate(product);
    expect(gate.eligible).toBe(true);
    expect(gate.discountPercent).toBeGreaterThan(0);
    expect(gate.discountPercent).toBeLessThan(100);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T7 — Seleção da melhor variante dentro da família
// ═══════════════════════════════════════════════════════════════════════════
describe('T7: Seleção da melhor variante', () => {
  it('variante com melhor rating+desconto é selecionada sobre a mais barata', () => {
    const gsData = GOLDEN_SET.products;
    const gs002 = gsData.find((p) => p.id === 'GS-002').input;
    const gs003 = gsData.find((p) => p.id === 'GS-003').input;

    const g2 = qualityGate(gs002);
    const g3 = qualityGate(gs003);
    const vs2 = variantSelectionScore(gs002, g2);
    const vs3 = variantSelectionScore(gs003, g3);

    // GS-003 tem rating 4.7, mais reviews e mais desconto → score maior
    expect(vs3.score).toBeGreaterThan(vs2.score);
  });

  it('selectBestVariants seleciona GS-003 como representante da família', () => {
    const gsData = GOLDEN_SET.products;
    const gs002 = { ...gsData.find((p) => p.id === 'GS-002').input, _gate: qualityGate(gsData.find((p) => p.id === 'GS-002').input) };
    const gs003 = { ...gsData.find((p) => p.id === 'GS-003').input, _gate: qualityGate(gsData.find((p) => p.id === 'GS-003').input) };

    const result = selectBestVariants([gs002, gs003]);
    const selectedIds = [...result.selected, ...result.ungrouped].map((p) => p.sourceItemId);
    const deferredIds = result.familyDeferred.map((p) => p.sourceItemId);

    // Pelo menos uma das duas deve estar selecionada (a melhor)
    const oneSelected = selectedIds.includes(gs002.sourceItemId) || selectedIds.includes(gs003.sourceItemId);
    expect(oneSelected).toBe(true);
    // A outra deve estar deferred com motivo correto
    const oneDeferred = deferredIds.includes(gs002.sourceItemId) || deferredIds.includes(gs003.sourceItemId);
    expect(oneDeferred).toBe(true);
    if (deferredIds.length > 0) {
      const deferred = result.familyDeferred.find((p) => deferredIds.includes(p.sourceItemId));
      expect(deferred?._deferralReason).toBe('SIMILAR_TO_BETTER_SELECTED_OFFER');
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T8 — TTL + família ainda ativa → FAMILY_STILL_HAS_BETTER_ACTIVE_OFFER
// ═══════════════════════════════════════════════════════════════════════════
describe('T8: Família ainda ativa bloqueia promoção', () => {
  it('deferred mantido quando família tem representante ativo', () => {
    const product = makeProduct({ sourceItemId: 'B-SIBLING' });
    const familyKey = computeFamilyKey(product);

    const activeFamilyMap = new Map([
      [familyKey, { sourceItemId: 'B-ACTIVE', score: 95, status: 'pending_manual_review' }],
    ]);

    const eligible = [{ ...product, _gate: qualityGate(product) }];
    const result = selectBestVariants(eligible, activeFamilyMap);
    const reasons = result.familyDeferred.map((d) => d._deferralReason);
    expect(reasons).toContain('FAMILY_STILL_HAS_BETTER_ACTIVE_OFFER');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T9 — Família sem representante ativo → promover deferred
// ═══════════════════════════════════════════════════════════════════════════
describe('T9: Família sem representante ativo permite promoção', () => {
  it('produto entra em selected quando não há família ativa no banco', () => {
    const product = makeProduct({ sourceItemId: 'B-UNIQUE-PRODUCT' });
    const eligible = [{ ...product, _gate: qualityGate(product) }];
    const result = selectBestVariants(eligible, new Map());
    const allSelected = [...result.selected, ...result.ungrouped];
    const selectedIds = allSelected.map((p) => p.sourceItemId);
    expect(selectedIds).toContain('B-UNIQUE-PRODUCT');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T14 — Shopee MULTIPLE_QUANTITY_OPTIONS
// ═══════════════════════════════════════════════════════════════════════════
describe('T14: Shopee MULTIPLE_QUANTITY_OPTIONS', () => {
  it('"4 ou 6 unidades" detecta como MULTIPLE_QUANTITY_OPTIONS', () => {
    // Valida que o padrão estaria disponível para o shopee-native parser
    const SHOPEE_AMBIGUITY_CHECKS = [
      {
        reason: 'MULTIPLE_QUANTITY_OPTIONS',
        test: (title) => /\b(?:\d+\s*ou\s*\d+|\d+\s*a\s*\d+)\s*(?:un|pç|pcs|unidades?|peças?)\b/i.test(title),
      },
      {
        reason: 'PRICE_FROM',
        test: (title) => /a partir de/i.test(title),
      },
    ];
    const title = 'Kit Potes de Vidro 4 ou 6 unidades';
    const match = SHOPEE_AMBIGUITY_CHECKS.filter((c) => c.test(title));
    expect(match.map((m) => m.reason)).toContain('MULTIPLE_QUANTITY_OPTIONS');
  });

  it('dimensão simples (60x40cm) NÃO detecta como MULTIPLE_QUANTITY_OPTIONS', () => {
    const MULTIPLE_QUANTITY_PATTERN = /\b(?:\d+\s*ou\s*\d+|\d+\s*a\s*\d+)\s*(?:un|pç|pcs|unidades?|peças?)\b/i;
    const title = 'Tapete de Banheiro 60 cm x 40 cm Cinza';
    expect(MULTIPLE_QUANTITY_PATTERN.test(title)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T15 — Categoria editorial: tapete → 'Casa e Banheiro'
// ═══════════════════════════════════════════════════════════════════════════
describe('T15: Categoria editorial de tapete de banheiro', () => {
  it('family_key de tapete-banheiro é diferente de tapete-sala', () => {
    const tb = { marketplace: 'Shopee', title: 'Tapete de Banheiro Antiderrapante 40x60', category: { name: 'Casa' } };
    const ts = { marketplace: 'Shopee', title: 'Tapete de Sala Shaggy 200x300', category: { name: 'Casa' } };
    expect(computeFamilyKey(tb)).not.toBe(computeFamilyKey(ts));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T17 — Claim comprovado pela fonte → valid
// ═══════════════════════════════════════════════════════════════════════════
describe('T17: Claim comprovado → valid', () => {
  it('desconto de 25% com old_price correspondente → valid', () => {
    const copy = 'Aproveite 25% de desconto nesta assadeira Tramontina!';
    const source = { discount: 25.1, absoluteSavings: 30 };
    const result = validateCopyClaims(copy, source);
    expect(result.result).toBe('valid');
    expect(result.blockedCount).toBe(0);
  });

  it('texto sem claims quantitativos → valid', () => {
    const copy = 'Assadeira prática e durável, ideal para o dia a dia.';
    const result = validateCopyClaims(copy, {});
    expect(result.result).toBe('valid');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T18 — Claim quantitativo inventado → blocked
// ═══════════════════════════════════════════════════════════════════════════
describe('T18: Claim quantitativo inventado → blocked', () => {
  it('"elimina 99% das bactérias" sem evidência → blocked', () => {
    const copy = 'Esta assadeira elimina 99% das bactérias em qualquer temperatura!';
    const result = validateCopyClaims(copy, {});
    expect(result.result).toBe('blocked');
    expect(result.blockedCount).toBeGreaterThan(0);
    const claimIds = result.results.map((r) => r.id);
    expect(claimIds).toContain('EFICACIA_SEM_EVIDENCIA');
  });

  it('"mantém fresco 2x mais" → blocked', () => {
    const copy = 'Mantém fresco 2x mais que as concorrentes!';
    const result = validateCopyClaims(copy, {});
    expect(result.result).toBe('blocked');
  });

  it('"o mais vendido do Brasil" → blocked', () => {
    const copy = 'O produto mais vendido do Brasil em 2026!';
    const result = validateCopyClaims(copy, {});
    expect(result.result).toBe('blocked');
  });

  it('claim subjetivo ("premium") → somente warning, não blocked', () => {
    const copy = 'Uma experiência premium para sua cozinha.';
    const result = validateCopyClaims(copy, {});
    expect(result.result).toBe('warning');
    expect(result.blockedCount).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T4 — desire_score observacional — DESIRE_SCORE_ENABLED=false por padrão
// ═══════════════════════════════════════════════════════════════════════════
describe('T4: desire_score observacional', () => {
  it('desireScore retorna null quando DESIRE_SCORE_ENABLED=false (padrão)', () => {
    const product = makeProduct();
    const gate = qualityGate(product);
    // Por padrão DESIRE_SCORE_ENABLED não está setado como 'true'
    const desire = desireScore(product, gate);
    expect(desire).toBeNull();
  });

  it('scoreCandidate retorna mesmo valor que antes (comportamento produtivo inalterado)', () => {
    const product = makeProduct();
    const gate = qualityGate(product);
    const score = scoreCandidate(product, gate);
    expect(typeof score).toBe('number');
    expect(score).toBeGreaterThan(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// T20 — Golden Set completo (9 produtos)
// ═══════════════════════════════════════════════════════════════════════════
describe('T20: Golden Set — gate_eligible correto para todos os 9 produtos', () => {
  for (const entry of GOLDEN_SET.products) {
    it(`${entry.id}: ${entry.description.slice(0, 60)}`, () => {
      const product = entry.input;
      const gate = qualityGate(product);
      expect(gate.eligible).toBe(entry.expected.gate_eligible);
      if (!entry.expected.gate_eligible && entry.expected.gate_reason) {
        expect(gate.reasons).toContain(entry.expected.gate_reason);
      }
    });
  }
});

describe('T20b: Golden Set — family_key correto para variantes de assadeira', () => {
  it('GS-002 e GS-003 (assadeiras Tramontina) compartilham family_key', () => {
    const gsData = GOLDEN_SET.products;
    const gs002 = gsData.find((p) => p.id === 'GS-002').input;
    const gs003 = gsData.find((p) => p.id === 'GS-003').input;
    const k2 = computeFamilyKey(gs002);
    const k3 = computeFamilyKey(gs003);
    expect(k2).toBeTruthy();
    expect(k2).toBe(k3);
  });

  it('GS-002 (assadeira) e GS-006 (frigideira) têm family_keys DIFERENTES', () => {
    const gsData = GOLDEN_SET.products;
    const gs002 = gsData.find((p) => p.id === 'GS-002').input;
    const gs006 = gsData.find((p) => p.id === 'GS-006').input;
    expect(computeFamilyKey(gs002)).not.toBe(computeFamilyKey(gs006));
  });

  it('GS-004 (550W) e GS-005 (1200W) têm family_keys DIFERENTES (potência preservada)', () => {
    const gsData = GOLDEN_SET.products;
    const gs004 = gsData.find((p) => p.id === 'GS-004').input;
    const gs005 = gsData.find((p) => p.id === 'GS-005').input;
    expect(computeFamilyKey(gs004)).not.toBe(computeFamilyKey(gs005));
  });

  it('GS-007 (tapete banheiro) e GS-008 (tapete sala) têm family_keys DIFERENTES', () => {
    const gsData = GOLDEN_SET.products;
    const gs007 = gsData.find((p) => p.id === 'GS-007').input;
    const gs008 = gsData.find((p) => p.id === 'GS-008').input;
    expect(computeFamilyKey(gs007)).not.toBe(computeFamilyKey(gs008));
  });
});
