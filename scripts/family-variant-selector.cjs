'use strict';

/**
 * FamilyVariantSelector — Sprint V5
 *
 * Recebe lista de candidatos já filtrados pelo qualityGate e ranqueados.
 * Agrupa por family_key e seleciona a melhor variante de cada família.
 * Os demais recebem deferralReason = 'SIMILAR_TO_BETTER_SELECTED_OFFER'.
 *
 * Critérios de seleção (variant_selection_score):
 * 1. desconto certificado
 * 2. preço anterior válido
 * 3. rating
 * 4. quantidade de avaliações
 * 5. Prime
 * 6. cupom
 * 7. valor percebido (quantidade/tamanho favorecem maior)
 * 8. qualityScore
 *
 * Regra: não assume que mais barato = melhor.
 * Kit 24 peças pode ter maior valor percebido que kit 4.
 * Assadeira 34cm pode ser mais desejável que 22cm.
 */

const { computeAllKeys, FAMILY_MIN_CONFIDENCE } = require('./family-key-engine.cjs');
const { qualityGate, scoreCandidate } = require('./curation-policy.cjs');

// Estados que bloqueiam promoção de deferred (família ainda ativa) — Ajuste #9
const ACTIVE_FAMILY_STATES = new Set(['pending_manual_review', 'approved', 'selected', 'posted']);

/**
 * Extrai quantidade de kit do título, se presente.
 * Retorna 1 se não detectado.
 */
function extractQuantityFromTitle(title) {
  const text = String(title || '');
  const kitMatch = text.match(/\b(?:kit|jogo|conjunto|pack)\s+(?:com\s+)?(\d+)\b/i);
  if (kitMatch) return Number(kitMatch[1]);
  const unMatch = text.match(/\b(\d+)\s*(?:pç|pcs|peças?|unidades?|un)\b/i);
  if (unMatch) return Number(unMatch[1]);
  return 1;
}

/**
 * variant_selection_score — auditável.
 * Score composto para escolher a melhor variante dentro de uma família.
 * NÃO confunde com o score de qualidade da fila (scoreCandidate).
 *
 * @param {object} product — candidato normalizado
 * @param {object} gate    — resultado de qualityGate(product)
 * @returns {{ score: number, reasons: string[] }}
 */
function variantSelectionScore(product, gate) {
  const metrics = product.marketplaceMetrics || {};
  const discount = gate.discountPercent || 0;
  const savings = gate.absoluteSavings || 0;
  const rating = Number(metrics.rating || 0);
  const reviewCount = Number(metrics.reviewCount || metrics.sales || 0);
  const prime = Boolean(metrics.prime || metrics.isPrime);
  const coupon = Boolean(metrics.coupon || metrics.hasVerifiedCoupon);
  const quantity = extractQuantityFromTitle(product.title);
  const hasOldPrice = Boolean(product.originalPrice && product.originalPrice > product.currentPrice);

  const reasons = [];
  let score = 0;

  // Desconto certificado (peso dominante)
  if (discount > 0 && hasOldPrice) {
    score += Math.min(30, discount * 0.8);
    reasons.push(`discount=${discount.toFixed(1)}%`);
  }

  // Preço anterior válido
  if (hasOldPrice) {
    score += 10;
    reasons.push('has_valid_old_price');
  }

  // Rating (até 20 pontos)
  if (rating >= 4.7) { score += 20; reasons.push(`rating=${rating}`); }
  else if (rating >= 4.5) { score += 15; reasons.push(`rating=${rating}`); }
  else if (rating >= 4.0) { score += 8;  reasons.push(`rating=${rating}`); }

  // Avaliações (até 15 pontos via log)
  if (reviewCount > 0) {
    const pts = Math.min(15, Math.log10(reviewCount + 1) * 5);
    score += pts;
    reasons.push(`reviews=${reviewCount}`);
  }

  // Prime
  if (prime) { score += 8; reasons.push('prime'); }

  // Cupom
  if (coupon) { score += 5; reasons.push('coupon'); }

  // Valor percebido por quantidade (não assume mais barato = melhor)
  if (quantity > 1) {
    score += Math.min(10, Math.log2(quantity) * 3);
    reasons.push(`quantity=${quantity}`);
  }

  // qualityScore como sinal base
  const qs = scoreCandidate(product, gate);
  score += qs * 0.3;

  return { score: Number(score.toFixed(2)), reasons };
}

/**
 * Verifica se a família de um candidato ainda tem representante ativo
 * no Map de famílias ativas carregado uma vez por ciclo.
 *
 * @param {string} familyKey
 * @param {Map<string, { sourceItemId: string, score: number, status: string }>} activeFamilyMap
 * @param {string} candidateSourceItemId — excluir o próprio candidato da verificação
 * @returns {{ hasActiveBetter: boolean, activeEntry: object|null }}
 */
function checkFamilyHasActiveBetter(familyKey, activeFamilyMap, candidateSourceItemId) {
  if (!familyKey || !activeFamilyMap) return { hasActiveBetter: false, activeEntry: null };
  const active = activeFamilyMap.get(familyKey);
  if (!active) return { hasActiveBetter: false, activeEntry: null };
  // O candidato deferred NÃO bloqueia a si mesmo
  if (String(active.sourceItemId) === String(candidateSourceItemId)) {
    return { hasActiveBetter: false, activeEntry: null };
  }
  if (ACTIVE_FAMILY_STATES.has(active.status)) {
    return { hasActiveBetter: true, activeEntry: active };
  }
  return { hasActiveBetter: false, activeEntry: null };
}

/**
 * Agrupa candidatos elegíveis por family_key e seleciona a melhor variante.
 *
 * IMPORTANTE: Só deve ser chamado com candidatos que JÁ passaram pelo qualityGate.
 * Produtos inválidos não competem para representar uma família.
 *
 * @param {object[]} eligibleCandidates — candidatos pós-gate, com gate já computado
 * @param {Map<string, object>} activeFamilyMap — famílias ativas no Supabase
 * @returns {{
 *   selected: object[],            // melhor variante de cada família
 *   familyDeferred: object[],      // variantes preteridas por terem melhor da família
 *   ungrouped: object[],           // produtos sem família detectada
 *   familySummary: object[],       // auditoria por família
 * }}
 */
function selectBestVariants(eligibleCandidates, activeFamilyMap = new Map()) {
  // Enriquecer cada candidato com identidade de família e variant_selection_score
  const enriched = eligibleCandidates.map((product) => {
    const gate = product._gate || qualityGate(product);
    const identity = computeAllKeys(product);
    const vs = variantSelectionScore(product, gate);
    return { product, gate, identity, variantScore: vs.score, variantReasons: vs.reasons };
  });

  // Separar produtos sem família detectável
  const withFamily    = enriched.filter((e) => e.identity.canGroup && e.identity.family_key);
  const withoutFamily = enriched.filter((e) => !e.identity.canGroup || !e.identity.family_key);

  // Agrupar por family_key
  const familyGroups = new Map();
  for (const entry of withFamily) {
    const key = entry.identity.family_key;
    if (!familyGroups.has(key)) familyGroups.set(key, []);
    familyGroups.get(key).push(entry);
  }

  const selected = [];
  const familyDeferred = [];
  const familySummary = [];

  for (const [familyKey, members] of familyGroups) {
    // Ordenar por variant_selection_score decrescente
    members.sort((a, b) => b.variantScore - a.variantScore);
    const best = members[0];
    const siblings = members.slice(1);

    // Verificar se família já tem representante ativo no banco
    const { hasActiveBetter, activeEntry } = checkFamilyHasActiveBetter(
      familyKey,
      activeFamilyMap,
      best.product.sourceItemId
    );

    if (hasActiveBetter) {
      // Toda a família é mantida como deferred (incluindo a "melhor" desta descoberta)
      for (const member of members) {
        familyDeferred.push({
          ...member.product,
          _familyKey: familyKey,
          _familyEvidence: member.identity.family_evidence,
          _familyConfidence: member.identity.family_confidence,
          _deferralReason: 'FAMILY_STILL_HAS_BETTER_ACTIVE_OFFER',
          _selectedSourceItemId: activeEntry.sourceItemId,
          _variantScore: member.variantScore,
          _variantReasons: member.variantReasons,
        });
      }
      familySummary.push({
        family_key: familyKey,
        total_members: members.length,
        decision: 'FAMILY_STILL_HAS_BETTER_ACTIVE_OFFER',
        active_representative: activeEntry.sourceItemId,
        evidence: best.identity.family_evidence,
        confidence: best.identity.family_confidence,
      });
      continue;
    }

    // Selecionar melhor variante
    selected.push({
      ...best.product,
      _familyKey: familyKey,
      _familyEvidence: best.identity.family_evidence,
      _familyConfidence: best.identity.family_confidence,
      _selectedVariantReason: best.variantReasons.join(', '),
      _variantScore: best.variantScore,
    });

    // Demais variantes → deferred com motivo
    for (const sibling of siblings) {
      familyDeferred.push({
        ...sibling.product,
        _familyKey: familyKey,
        _familyEvidence: sibling.identity.family_evidence,
        _familyConfidence: sibling.identity.family_confidence,
        _deferralReason: 'SIMILAR_TO_BETTER_SELECTED_OFFER',
        _selectedSourceItemId: best.product.sourceItemId,
        _variantScore: sibling.variantScore,
        _variantReasons: sibling.variantReasons,
      });
    }

    familySummary.push({
      family_key: familyKey,
      total_members: members.length,
      decision: 'BEST_VARIANT_SELECTED',
      selected: best.product.sourceItemId,
      deferred_count: siblings.length,
      evidence: best.identity.family_evidence,
      confidence: best.identity.family_confidence,
      best_variant_score: best.variantScore,
    });
  }

  // Produtos sem família passam diretamente para selected (ungrouped)
  const ungrouped = withoutFamily.map((e) => e.product);

  return { selected, familyDeferred, ungrouped, familySummary };
}

module.exports = {
  ACTIVE_FAMILY_STATES,
  variantSelectionScore,
  checkFamilyHasActiveBetter,
  selectBestVariants,
  extractQuantityFromTitle,
};
