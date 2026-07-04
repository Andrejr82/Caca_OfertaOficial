import type { AnalyticsReport } from "../analytics/analytics-engine";

export type Confidence = "LOW" | "MEDIUM" | "HIGH";

export interface Insight {
  pattern: string;
  confidence: string;
  occurrences: number;
  expectedImpact: string;
  category: string;
  marketplace: string;
  avgCommercialDelta: number;
}

export interface Recommendation {
  title: string;
  description: string;
  source: string;
  metric: string;
  confidence: Confidence;
  targetAudience: string;
}

export interface LearningReport {
  insights: Insight[];
  recommendations: Recommendation[];
  trends: { title: string; status: "Crescimento" | "Queda" | "Estabilidade" | "Oscilação"; metric: string }[];
}

export class MarketplaceLearningEngine {
  /**
   * O Learning Engine NÃO toma decisões. Ele apenas observa os eventos
   * do AnalyticsEngine e gera conclusões determinísticas (Estatística Descritiva).
   */
  static analyze(report: AnalyticsReport): LearningReport {
    const insights: Insight[] = [];
    const recommendations: Recommendation[] = [];
    const trends: { title: string; status: "Crescimento" | "Queda" | "Estabilidade" | "Oscilação"; metric: string }[] = [];
    
    const confidence: Confidence = report.overview.totalProcessed > 1000 ? "HIGH" : report.overview.totalProcessed > 100 ? "MEDIUM" : "LOW";
    const period = "Histórico Total";

    // --- MARKETPLACES ---
    let bestMkCTR = "";
    let maxCTR = -1;
    let worstMkCTR = "";
    let minCTR = 999999;
    let highestRejectionMk = "";
    let maxRejection = -1;

    for (const [mk, data] of Object.entries(report.marketplaces)) {
      if (data.publications > 0) {
        const ctr = data.clicks / data.publications;
        if (ctr > maxCTR) { maxCTR = ctr; bestMkCTR = mk; }
        if (ctr < minCTR) { minCTR = ctr; worstMkCTR = mk; }
      }
      
      const rejectRate = data.offers > 0 ? data.rejections / data.offers : 0;
      if (rejectRate > maxRejection) { maxRejection = rejectRate; highestRejectionMk = mk; }
    }

    if (bestMkCTR) {
      insights.push({
        pattern: `Marketplace Líder em CTR: ${bestMkCTR}`,
        confidence,
        occurrences: report.marketplaces[bestMkCTR].publications,
        expectedImpact: "Aumento na taxa global de conversão ao priorizar este canal.",
        category: "Múltiplas",
        marketplace: bestMkCTR,
        avgCommercialDelta: 0
      });
      recommendations.push({
        title: `Priorizar Publicações em ${bestMkCTR}`,
        description: `Aumentar o volume de publicações diárias da fonte ${bestMkCTR} devido ao alto engajamento.`,
        source: "Marketplace Analytics Engine",
        metric: "CTR",
        confidence,
        targetAudience: "Marketplace Optimization Engine"
      });
    }

    if (highestRejectionMk) {
      insights.push({
        pattern: `Marketplace com Maior Rejeição: ${highestRejectionMk}`,
        confidence,
        occurrences: report.marketplaces[highestRejectionMk].rejections,
        expectedImpact: "Redução do desperdício de tokens otimizando este canal.",
        category: "Múltiplas",
        marketplace: highestRejectionMk,
        avgCommercialDelta: 0
      });
    }

    // --- CATEGORIES ---
    let bestCatConv = "";
    let maxConv = -1;
    for (const [cat, data] of Object.entries(report.categories)) {
      if (data.conversions > maxConv) {
        maxConv = data.conversions;
        bestCatConv = cat;
      }
    }

    if (bestCatConv && maxConv > 0) {
      insights.push({
        pattern: `Categoria Líder em Conversão: ${bestCatConv}`,
        confidence,
        occurrences: maxConv,
        expectedImpact: "Escala direta de GMV extraindo mais desta categoria.",
        category: bestCatConv,
        marketplace: "Geral",
        avgCommercialDelta: 0
      });
      recommendations.push({
        title: `Aumentar Extração na Categoria ${bestCatConv}`,
        description: `Instruir o Scraper a buscar mais ofertas desta categoria pois possui alta conversão.`,
        source: "Marketplace Analytics Engine",
        metric: "Conversions",
        confidence,
        targetAudience: "Extraction Engine"
      });
    }

    // --- TIERS & AI ---
    const sPct = report.intelligence.percentages?.S || 0;
    const cPct = report.intelligence.percentages?.C || 0;
    
    insights.push({
      pattern: "Concentração Tier S",
      confidence,
      occurrences: report.intelligence.tiers.S,
      expectedImpact: "Mapeamento da saúde comercial da base.",
      category: "Todas",
      marketplace: "Todos",
      avgCommercialDelta: 0
    });

    if (cPct > 50) {
      insights.push({
        pattern: "Alta Incidência de Tier C",
        confidence,
        occurrences: report.intelligence.tiers.C,
        expectedImpact: "Necessidade de rever parâmetros de extração para evitar pipeline poluído.",
        category: "Múltiplas",
        marketplace: "Todos",
        avgCommercialDelta: 0
      });
      recommendations.push({
        title: "Revisar Critérios de Extração",
        description: `O volume de Tier C está muito alto (${cPct.toFixed(1)}%). Recomendado ajustar filtros na origem.`,
        source: "Marketplace Intelligence Engine",
        metric: "Tier C %",
        confidence,
        targetAudience: "Optimization Engine"
      });
    }

    const aiSavings = report.aiConsumption.savingsPercentage || 0;
    insights.push({
      pattern: "Economia Estrutural de IA",
      confidence,
      occurrences: report.aiConsumption.callsAvoided,
      expectedImpact: "Redução drástica do custo de infraestrutura.",
      category: "Todas",
      marketplace: "Todos",
      avgCommercialDelta: 0
    });

    // --- COMMERCIAL EVOLUTION (Shadow Mode) ---
    if (report.commercialEvolution && report.commercialEvolution.divergences > 0) {
      insights.push({
        pattern: "Divergências na Política Comercial (Candidate vs Official)",
        confidence: "95%",
        occurrences: report.commercialEvolution.divergences,
        expectedImpact: "Alteração significativa no mix de ofertas aprovadas, priorizando alto ticket.",
        category: Object.keys(report.commercialEvolution.topCategories)[0] || "Variada",
        marketplace: Object.keys(report.commercialEvolution.topMarketplaces)[0] || "Variado",
        avgCommercialDelta: Number(((report.commercialEvolution.maxDelta + report.commercialEvolution.minDelta) / 2).toFixed(2))
      });
      
      recommendations.push({
        title: "Revisar Ofertas Divergentes",
        description: "Recomenda-se analisar manualmente as ofertas com alto delta no Dashboard para validar a política candidata.",
        source: "Marketplace Learning Engine",
        metric: "Commercial Delta",
        confidence,
        targetAudience: "Humano (Product Manager)"
      });
    }

    // --- TRENDS ---
    // Deterministic trend heuristics based on data volume
    if (report.overview.totalProcessed > 50) {
      trends.push({ title: "Volume de Extração", status: "Estabilidade", metric: "Total Processed" });
      trends.push({ title: "Taxa de Rejeição", status: report.overview.rejectionRate > 30 ? "Crescimento" : "Estabilidade", metric: "Rejection Rate" });
      trends.push({ title: "Economia de Tokens", status: aiSavings > 40 ? "Crescimento" : "Oscilação", metric: "AI Savings" });
      if (report.commercialEvolution && report.commercialEvolution.divergences > 0) {
        trends.push({ title: "Divergência Comercial", status: "Oscilação", metric: "Commercial Deltas" });
      }
    }

    return { insights, recommendations, trends };
  }
}
