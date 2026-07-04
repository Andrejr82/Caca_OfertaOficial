export interface AIDecisionInput {
  marketplace?: string;
  product_name?: string;
  price?: number;
  commercialTier: string;
  isDuplicate: boolean;
  priority: number;
}

export type AIDecisionType = 'APPROVE' | 'REVIEW' | 'REJECT';

export interface AIDecisionResult {
  decision: AIDecisionType;
  reason: string;
  priority: number;
  shouldGenerateCopy: boolean;
  shouldPublish: boolean;
  shouldReview: boolean;
  shouldReject: boolean;
}

export interface AIConfig {
  consumeOnTierB: boolean;
}

export class AIDecisionEngine {
  /**
   * Responde exclusivamente à pergunta: "Esta oferta merece consumir IA e seguir para publicação?"
   * A IA consome exclusivamente o contrato oficial produzido pelo AI Decision Engine.
   * A IA jamais poderá conhecer Official Policy, Commercial Policy, Shadow Mode, ou Versões.
   */
  static evaluate(offer: AIDecisionInput, config: AIConfig = { consumeOnTierB: true }): AIDecisionResult {
    // 1. Rejeição Imediata: Ofertas Duplicadas
    if (offer.isDuplicate) {
      return {
        decision: 'REJECT',
        reason: 'OFERTA_DUPLICADA',
        priority: 0,
        shouldGenerateCopy: false,
        shouldPublish: false,
        shouldReview: false,
        shouldReject: true
      };
    }

    // 2. Política de Consumo Baseada no Tier Comercial
    switch (offer.commercialTier) {
      case 'S':
      case 'A':
        return {
          decision: 'APPROVE',
          reason: `TIER_${offer.commercialTier}_SEMPRE_APROVADO`,
          priority: offer.priority || 10,
          shouldGenerateCopy: true,
          shouldPublish: true,
          shouldReview: false,
          shouldReject: false
        };

      case 'B':
        if (config.consumeOnTierB) {
          return {
            decision: 'APPROVE',
            reason: 'TIER_B_CONFIGURADO_PARA_CONSUMO',
            priority: offer.priority || 5,
            shouldGenerateCopy: true,
            shouldPublish: true,
            shouldReview: false,
            shouldReject: false
          };
        } else {
          return {
            decision: 'REVIEW',
            reason: 'TIER_B_CONSUMO_DESATIVADO',
            priority: offer.priority || 5,
            shouldGenerateCopy: false,
            shouldPublish: false,
            shouldReview: true,
            shouldReject: false
          };
        }

      case 'C':
        return {
          decision: 'REVIEW',
          reason: 'TIER_C_BAIXA_PRIORIDADE',
          priority: offer.priority || 1,
          shouldGenerateCopy: false,
          shouldPublish: false,
          shouldReview: true,
          shouldReject: false
        };

      case 'LIXO':
      default:
        return {
          decision: 'REJECT',
          reason: 'TIER_LIXO_REJEITADO',
          priority: 0,
          shouldGenerateCopy: false,
          shouldPublish: false,
          shouldReview: false,
          shouldReject: true
        };
    }
  }
}
