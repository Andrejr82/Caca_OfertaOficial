import { listOffers, listAffiliateLinks, listSales } from "@/lib/offers/queries";
import { MarketplaceAnalyticsEngine } from "@/core/analytics/analytics-engine";
import { MarketplaceLearningEngine } from "@/core/learning/learning-engine";
import { MarketplaceOptimizationEngine } from "@/core/optimization/optimization-engine";
import { Activity, ArrowUpRight, Target } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function OptimizationPage() {
  const [offers, links, sales] = await Promise.all([
    listOffers(),
    listAffiliateLinks(),
    listSales()
  ]);

  const analytics = MarketplaceAnalyticsEngine.generateReport(offers, sales, links, []);
  const learning = MarketplaceLearningEngine.analyze(analytics);
  const optimization = MarketplaceOptimizationEngine.generateRecommendations(learning);

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-orange-500 to-amber-600 shadow-lg shadow-orange-500/20">
          <Target size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Marketplace Optimization</h1>
          <p className="text-xs text-white/35">Recomendações estruturadas para evolução sistêmica e automação futura.</p>
        </div>
      </header>

      {/* TENDÊNCIAS OBSERVADAS PELO LEARNING */}
      <section className="glass-card p-5 w-full flex flex-col gap-2 border-l-4 border-amber-500">
        <h2 className="text-sm font-bold text-white/50 uppercase flex items-center gap-2"><Activity size={16} /> Fluxo Analítico (Read-Only)</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-white/60 overflow-x-auto pb-2">
          <span>{analytics.overview.totalProcessed} Ofertas</span> <span className="text-white/20">→</span>
          <span className="text-indigo-400">{learning.insights.length} Insights</span> <span className="text-white/20">→</span>
          <span className="text-pink-400">{learning.recommendations.length} Aprendizados</span> <span className="text-white/20">→</span>
          <span className="text-amber-400">{optimization.length} Recomendações Críticas</span>
        </div>
        <p className="text-xs text-white/40 italic">Atenção: A Optimization Engine apenas gera estes planos de ação. Ela não os executa automaticamente.</p>
      </section>

      <div className="grid grid-cols-1 gap-6">
        {/* RECOMENDAÇÕES OFICIAIS */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white/50 uppercase">Top Recomendações de Otimização</h2>
          {optimization.length > 0 ? optimization.map((opt, idx) => (
            <div key={idx} className="border border-white/[0.05] rounded-lg p-5 bg-white/[0.01] hover:bg-white/[0.03] transition-colors">
              <div className="flex flex-col md:flex-row md:justify-between md:items-start gap-4 mb-3">
                <div className="flex-1">
                  <h3 className="text-base font-bold text-amber-400 flex items-center gap-2">
                    <ArrowUpRight size={18} /> {opt.recommendation}
                  </h3>
                  <p className="text-sm text-white/80 mt-1">{opt.expectedGain}</p>
                </div>
                <div className="flex flex-col gap-2 min-w-[140px]">
                  <Badge label={`Impacto: ${opt.expectedImpact}`} tone={opt.expectedImpact === "Muito Alto" ? "warn" : opt.expectedImpact === "Alto" ? "warn" : "neutral"} />
                  <Badge label={`Confiança: ${opt.confidence}`} tone={opt.confidence === "HIGH" ? "good" : "neutral"} />
                  <Badge label={`Rollback: ${opt.rollbackAvailable ? "Disponível" : "Indisponível"}`} tone={opt.rollbackAvailable ? "good" : "warn"} />
                </div>
              </div>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-4 pt-4 border-t border-white/[0.05]">
                <div className="text-[11px] text-white/60 space-y-2">
                  <div><span className="text-white/40 uppercase">Recomendação:</span> {opt.recommendation}</div>
                  <div><span className="text-white/40 uppercase">Justificativa:</span> {opt.justification}</div>
                </div>
                <div className="text-[11px] text-white/60 space-y-2">
                  <div><span className="text-white/40 uppercase">Ganho esperado:</span> {opt.expectedGain}</div>
                  <div><span className="text-white/40 uppercase">Execução automática:</span> Não — requer etapa de automação aprovada.</div>
                </div>
              </div>
            </div>
          )) : (
             <p className="text-sm text-white/30">Dados insuficientes para gerar recomendações de otimização neste momento.</p>
          )}
        </section>
      </div>

    </div>
  );
}
