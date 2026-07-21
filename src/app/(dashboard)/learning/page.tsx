import { listOffers, listAffiliateLinks, listSales } from "@/lib/offers/queries";
import { MarketplaceAnalyticsEngine } from "@/core/analytics/analytics-engine";
import { MarketplaceLearningEngine } from "@/core/learning/learning-engine";
import { BrainCircuit } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default async function LearningPage() {
  const [offers, links, sales] = await Promise.all([
    listOffers(),
    listAffiliateLinks(),
    listSales()
  ]);

  const report = MarketplaceAnalyticsEngine.generateReport(offers, sales, links, []);
  const learning = MarketplaceLearningEngine.analyze(report);

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/20">
          <BrainCircuit size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Marketplace Learning</h1>
          <p className="text-xs text-white/35">Aprendizado de máquina estatístico e interpretação determinística.</p>
        </div>
      </header>

      {/* TENDÊNCIAS */}
      <section className="glass-card p-5 w-full flex flex-wrap gap-4 border-l-4 border-pink-500">
        <h2 className="w-full text-sm font-bold text-white/50 uppercase">Tendências</h2>
        {learning.trends.length > 0 ? learning.trends.map((t, idx) => (
          <div key={idx} className="flex flex-col bg-white/[0.02] p-3 rounded-lg border border-white/[0.05] min-w-[200px]">
            <span className="text-xs text-white/40">{t.metric}</span>
            <span className="text-sm font-bold text-white">{t.title}</span>
            <span className={`text-xs font-bold mt-1 ${t.status === "Crescimento" ? "text-emerald-400" : t.status === "Queda" ? "text-red-400" : "text-yellow-400"}`}>{t.status}</span>
          </div>
        )) : (
          <p className="text-sm text-white/30">Sem volume suficiente para detecção de tendências.</p>
        )}
      </section>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* INSIGHTS */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white/50 uppercase">Principais Insights</h2>
          {learning.insights.length > 0 ? learning.insights.map((ins, idx) => (
            <div key={idx} className="border border-white/[0.05] rounded-lg p-4 bg-white/[0.01]">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-emerald-400">{ins.pattern}</h3>
                <Badge label={`Confiança: ${ins.confidence}`} tone={ins.confidence === "HIGH" ? "good" : ins.confidence === "MEDIUM" ? "neutral" : "warn"} />
              </div>
              <p className="text-sm text-white/80 mb-3">{ins.expectedImpact}</p>
              <div className="text-[10px] text-white/40 uppercase space-y-1">
                <div>Marketplace: {ins.marketplace}</div>
                <div>Categoria: {ins.category}</div>
                <div>Ocorrências: {ins.occurrences}</div>
              </div>
            </div>
          )) : (
             <p className="text-sm text-white/30">Dados insuficientes para insights.</p>
          )}
        </section>

        {/* RECOMENDAÇÕES */}
        <section className="glass-card p-5 flex flex-col gap-4">
          <h2 className="text-sm font-bold text-white/50 uppercase">Recomendações Determinísticas</h2>
          {learning.recommendations.length > 0 ? learning.recommendations.map((rec, idx) => (
            <div key={idx} className="border border-white/[0.05] rounded-lg p-4 bg-white/[0.01]">
              <div className="flex justify-between items-start mb-2">
                <h3 className="text-sm font-bold text-blue-400">{rec.title}</h3>
                <Badge label={`Confiança: ${rec.confidence}`} tone={rec.confidence === "HIGH" ? "good" : rec.confidence === "MEDIUM" ? "neutral" : "warn"} />
              </div>
              <p className="text-sm text-white/80 mb-3">{rec.description}</p>
              <div className="text-[10px] text-white/40 uppercase space-y-1">
                <div>Público Alvo: {rec.targetAudience}</div>
                <div>Métrica Base: {rec.metric}</div>
                <div>Origem: {rec.source}</div>
              </div>
            </div>
          )) : (
             <p className="text-sm text-white/30">Dados insuficientes para recomendações.</p>
          )}
        </section>
      </div>

    </div>
  );
}
