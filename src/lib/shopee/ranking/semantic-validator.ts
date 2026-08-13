import { SemanticValidationResult, CategoryPolicy } from './types';
import { normalizeText } from './normalization';

export function evaluateSemanticConfidence(
  productName: string,
  queryTerm: string,
  policy?: CategoryPolicy
): SemanticValidationResult {
  const normalizedTitle = normalizeText(productName);
  const normalizedQuery = normalizeText(queryTerm);

  // 1. Basic fallback if no policy
  if (!policy) {
    if (normalizedTitle.includes(normalizedQuery)) {
      return { confidence: 0.8, isValid: true, reason: 'Parcial sem política' };
    }
    return { confidence: 0.0, isValid: false, rejectionCode: 'semantic_mismatch' };
  }

  // 2. Check blocked terms first (accessories, parts)
  const isQueryingAccessory = policy.blockedTerms.some(term => normalizedQuery.includes(term));
  
  if (!isQueryingAccessory) {
    // Se a query NÃO for para um acessório, bloqueamos produtos que contenham termos de acessório
    // a não ser que a intenção real fosse o acessório (ex: "capa de cadeira" em móveis)
    const hasBlockedTerm = policy.blockedTerms.some(term => normalizedTitle.includes(term));
    if (hasBlockedTerm) {
      return {
        confidence: 0.0,
        isValid: false,
        rejectionCode: 'accessory_mismatch',
        reason: 'Produto contém termo bloqueado (acessório/peça)'
      };
    }
  }

  // 3. Exact match with primary classes
  const matchesPrimary = policy.primaryClasses.some(cls => normalizedTitle.includes(cls));
  const queryMatchesPrimary = policy.primaryClasses.some(cls => normalizedQuery.includes(cls));

  if (matchesPrimary && (queryMatchesPrimary || normalizedTitle.includes(normalizedQuery))) {
    return {
      confidence: 1.0,
      isValid: true,
      reason: 'Correspondência exata com classe principal'
    };
  }

  // 4. Match with accepted aliases
  const matchesAlias = policy.acceptedAliases?.some(alias => normalizedTitle.includes(alias));
  if (matchesAlias) {
    return {
      confidence: 0.9,
      isValid: true,
      reason: 'Alias reconhecido'
    };
  }

  // 5. Partial match (query is in the title, but no blocked terms triggered)
  if (normalizedTitle.includes(normalizedQuery)) {
    return {
      confidence: 0.7,
      isValid: true,
      reason: 'Correspondência parcial com a query'
    };
  }

  // 6. Fail
  return {
    confidence: 0.0,
    isValid: false,
    rejectionCode: 'semantic_mismatch',
    reason: 'Não corresponde à intenção'
  };
}
