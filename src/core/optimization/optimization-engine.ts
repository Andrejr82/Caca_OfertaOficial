import type { LearningReport, Recommendation as LearningRecommendation } from "../learning/learning-engine";

export type Priority = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type Impact = "Baixo" | "Médio" | "Alto" | "Muito Alto";

export interface OptimizationRecommendation {
  recommendation: string;
  expectedGain: string;
  confidence: string;
  expectedImpact: string;
  rollbackAvailable: boolean;
  justification: string;
}

export class MarketplaceOptimizationEngine {
  /**
   * O Optimization Engine consome exclusivamente o conhecimento do Learning Engine.
   * Ele NÃO executa ações. Ele gera prescrições (recomendações de otimização)
   * que serão consumidas na próxima fase (Sprint 11 - Automation) ou por humanos.
   */
  static generateRecommendations(learning: LearningReport): OptimizationRecommendation[] {
    const opts: OptimizationRecommendation[] = [];

    // Traduz os aprendizados em ações de otimização estruturadas
    learning.recommendations.forEach(rec => {
      let priority: Priority = "MEDIUM";
      let impact: Impact = "Médio";
      let targetEngine = rec.targetAudience;

      // Classificação determinística baseada na métrica do Learning
      if (rec.metric.includes("CTR") || rec.metric.includes("Conversions")) {
        priority = "HIGH";
        impact = "Alto";
        targetEngine = "Ranking Engine / Publication Pipeline";
      }

      if (rec.metric.includes("Tier C") || rec.metric.includes("Rejection")) {
        priority = "MEDIUM";
        impact = "Baixo";
        targetEngine = "Quality Engine";
      }

      if (rec.metric.includes("Commercial Delta")) {
        priority = "HIGH";
        impact = "Muito Alto";
        targetEngine = "Ranking Engine / Intelligence Engine";
        rec.title = "Ativar Commercial Policy (V2)";
        rec.description = "Evidências do Shadow Mode indicam que a transição para a Política Comercial candidata reduzirá prioridade de bugigangas e aumentará tickets maiores. Avaliar ativação oficial.";
      }

      opts.push({
        recommendation: `Ativar recomendação originada de: ${rec.title}`,
        expectedGain: `Otimização na fase de ${targetEngine} baseada no padrão '${rec.title}'.`,
        confidence: rec.confidence,
        expectedImpact: impact,
        rollbackAvailable: true,
        justification: `Ação gerada pelo Learning Engine. Regras: ${rec.description}.`
      });
    });

    // Detecta anomalias graves nas tendências para forçar otimização estrutural
    const decliningTrends = learning.trends.filter(t => t.status === "Queda");
    if (decliningTrends.length > 0) {
      opts.push({
        recommendation: "Revisão Crítica de Extração e Qualidade",
        expectedGain: "Prevenção de degradação massiva da base de ofertas.",
        confidence: "HIGH",
        expectedImpact: "Muito Alto",
        rollbackAvailable: false,
        justification: `Detectada queda consolidada em métricas vitais (${decliningTrends.map(t => t.title).join(", ")}).`
      });
    }

    // Se a economia de IA estiver muito boa, sugere escalar
    const aiTrend = learning.trends.find(t => t.metric === "AI Savings");
    if (aiTrend && aiTrend.status === "Crescimento") {
      opts.push({
        recommendation: "Escalar AI Decision Engine",
        expectedGain: "Maximizar qualidade de copy e conversão com risco financeiro mínimo.",
        confidence: "HIGH",
        expectedImpact: "Alto",
        rollbackAvailable: true,
        justification: "A economia de tokens está em crescimento graças à inteligência anterior (Tiers/Quality)."
      });
    }

    return opts;
  }
}
