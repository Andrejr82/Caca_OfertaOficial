'use strict';

/**
 * Copy Claim Validator — Sprint V5
 *
 * Valida claims quantitativos e subjetivos nas copies geradas.
 * Três resultados possíveis:
 *   valid   → claim suportado pela fonte (preço, desconto calculado, etc.)
 *   warning → claim subjetivo, não verificável, mas não mentiroso
 *   blocked → claim quantitativo sem evidência na fonte
 *
 * Regra (Ajuste #16): preço correto e percentual calculado
 * corretamente NUNCA retornam blocked.
 */

// ─── Padrões de claims quantitativos não verificáveis ──────────────────

const BLOCKED_CLAIM_PATTERNS = [
  {
    id: 'EFICACIA_SEM_EVIDENCIA',
    // Cobre: "elimina 99% das bact\u00e9rias", "mata 100% dos v\u00edrus", "remove 99,9% de germes"
    // Usa \u para garantir que acentos n\u00e3o quebrem o regex em ambientes diferentes
    pattern: /\b(?:elimina|mata|remove|acaba\s+com)\s+\d+(?:[.,]\d+)?\s*%\s*(?:d[aeiou]s?\s+)?(?:bact[eé]rias?|v[ií]rus|germes?|sujeira|gordura)\b/i,
    description: 'Claim de efic\u00e1cia percentual sem evid\u00eancia cient\u00edfica na fonte',
  },
  {
    id: 'COMPARATIVO_SEM_BASE',
    // Cobre: "mant\u00e9m fresco 2x mais", "dura 3x mais", "conserva 2x melhor"
    pattern: new RegExp(
      '\\b(?:mant[e\u00e9]m?|conserva|dura|[u\u00fa]ltima)\\s+(?:fresco\\s+)?\\d+\\s*[xX]\\s+(?:mais|melhor)\\b',
      'i'
    ),
    description: 'Claim comparativo (Nx mais) sem base de compara\u00e7\u00e3o na fonte',
  },
  {
    id: 'SUPERLATIVO_ABSOLUTO',
    pattern: /\b(?:o\s+)?(?:mais?\s+)?(?:vendido|popular|comprado|procurado)\s+(?:do\s+(?:brasil|pa[ií]s|mundo))\b/i,
    description: 'Superlativo absoluto de mercado sem fonte verificável',
  },
  {
    id: 'MELHOR_DO_MERCADO',
    pattern: /\b(?:melhor\s+(?:do|no|da|na)\s+(?:mercado|brasil|categoria))\b/i,
    description: 'Claim de superioridade de mercado sem evidência',
  },
  {
    id: 'ECONOMIZE_VALOR_INVENTADO',
    pattern: /\beconomize\s+(?:até\s+)?R\$\s*[\d.,]+\b/i,
    description: 'Valor de economia mencionado — validar contra desconto real',
    requiresValidation: true,
  },
];

const WARNING_CLAIM_PATTERNS = [
  {
    id: 'BENEFICIO_SUBJETIVO',
    pattern: /\b(?:qualidade\s+)?(?:premium|superior|excepcional|incrível|perfeito)\b/i,
    description: 'Benefício subjetivo sem critério verificável',
  },
  {
    id: 'APROVADO_POR',
    pattern: /\b(?:aprovado|recomendado)\s+por\s+(?:especialistas?|nutricionistas?|m[eé]dicos?)\b/i,
    description: 'Aprovação por terceiros não verificável na fonte',
  },
  {
    id: 'DURABILIDADE_SUPOSTA',
    pattern: /\b(?:dura|[úu]ltima)\s+(?:anos?|décadas?|vida\s+toda)\b/i,
    description: 'Claim de durabilidade não verificável',
  },
];

// ─── Claims válidos por definição ──────────────────────────────────────

/** Preço e desconto calculado corretamente NUNCA são blocked */
function isPriceOrDiscountClaim(claimText, sourceData) {
  const percentMatch = claimText.match(/(\d+)\s*%\s*(?:de\s+)?desconto/i);
  if (percentMatch && sourceData.discount) {
    const claimedDiscount = Number(percentMatch[1]);
    const realDiscount = Math.round(sourceData.discount);
    // Tolerância de ±2 pontos percentuais
    return Math.abs(claimedDiscount - realDiscount) <= 2;
  }

  const economyMatch = claimText.match(/economize\s+(?:até\s+)?R\$\s*([\d.,]+)/i);
  if (economyMatch && sourceData.absoluteSavings) {
    const claimed = Number(economyMatch[1].replace(/\./g, '').replace(',', '.'));
    const real = sourceData.absoluteSavings;
    return Math.abs(claimed - real) / real <= 0.05; // tolerância 5%
  }

  return false;
}

// ─── Extrator de claims do texto ──────────────────────────────────────

function extractAllClaims(copyText) {
  const claims = [];
  const text = String(copyText || '');

  for (const { id, pattern, description, requiresValidation } of BLOCKED_CLAIM_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      claims.push({
        id,
        matched: matches[0],
        description,
        requiresValidation: Boolean(requiresValidation),
        severity: 'blocked',
      });
    }
  }

  for (const { id, pattern, description } of WARNING_CLAIM_PATTERNS) {
    const matches = text.match(pattern);
    if (matches) {
      claims.push({
        id,
        matched: matches[0],
        description,
        requiresValidation: false,
        severity: 'warning',
      });
    }
  }

  return claims;
}

// ─── Verificador principal ────────────────────────────────────────────

/**
 * Valida todos os claims de uma copy contra os dados da fonte.
 *
 * @param {string} copyText — texto da copy gerada
 * @param {object} sourceData — { discount, absoluteSavings, rating, ... }
 * @returns {{
 *   valid: boolean,
 *   result: 'valid' | 'warning' | 'blocked',
 *   results: Array<{
 *     claim: string,
 *     id: string,
 *     source_evidence: string | null,
 *     validation_result: 'valid' | 'warning' | 'blocked',
 *   }>,
 *   blockedCount: number,
 *   warningCount: number,
 * }}
 */
function validateCopyClaims(copyText, sourceData = {}) {
  const claims = extractAllClaims(copyText);
  const results = [];
  let blockedCount = 0;
  let warningCount = 0;

  for (const claim of claims) {
    // Preço/desconto calculado corretamente → sempre valid (Ajuste #16)
    if (isPriceOrDiscountClaim(claim.matched, sourceData)) {
      results.push({
        claim: claim.matched,
        id: claim.id,
        source_evidence: `discount=${sourceData.discount}% absoluteSavings=${sourceData.absoluteSavings}`,
        validation_result: 'valid',
      });
      continue;
    }

    // Para claims com requiresValidation que não passaram pelo isPriceOrDiscountClaim
    if (claim.requiresValidation && claim.severity === 'blocked') {
      blockedCount++;
      results.push({
        claim: claim.matched,
        id: claim.id,
        source_evidence: null,
        validation_result: 'blocked',
      });
      continue;
    }

    if (claim.severity === 'blocked') {
      blockedCount++;
      results.push({
        claim: claim.matched,
        id: claim.id,
        source_evidence: null,
        validation_result: 'blocked',
      });
    } else if (claim.severity === 'warning') {
      warningCount++;
      results.push({
        claim: claim.matched,
        id: claim.id,
        source_evidence: null,
        validation_result: 'warning',
      });
    }
  }

  const result = blockedCount > 0 ? 'blocked' : warningCount > 0 ? 'warning' : 'valid';

  return {
    valid: blockedCount === 0,
    result,
    results,
    blockedCount,
    warningCount,
  };
}

module.exports = {
  validateCopyClaims,
  extractAllClaims,
  BLOCKED_CLAIM_PATTERNS,
  WARNING_CLAIM_PATTERNS,
};
