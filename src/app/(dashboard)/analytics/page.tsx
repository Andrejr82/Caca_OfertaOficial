import { listOffers, listAffiliateLinks, listSales } from "@/lib/offers/queries";
import { MarketplaceAnalyticsEngine } from "@/core/analytics/analytics-engine";
import { Badge } from "@/components/ui/badge";
import { BarChart3 } from "lucide-react";

export default async function AnalyticsPage() {
  const [offers, links, sales] = await Promise.all([
    listOffers(),
    listAffiliateLinks(),
    listSales()
  ]);

  const report = MarketplaceAnalyticsEngine.generateReport(offers, sales, links, []);

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
          <BarChart3 size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Marketplace Analytics</h1>
          <p className="text-xs text-white/35">Inteligência de negócio baseada em eventos das Engines.</p>
        </div>
      </header>

      {/* Analytics Timeline */}
      <section className="glass-card p-5 w-full flex flex-col gap-2 border-l-4 border-indigo-500">
        <h2 className="text-sm font-bold text-white/50 uppercase">Timeline Analítica</h2>
        <div className="flex items-center gap-2 text-xs font-bold text-white/60 overflow-x-auto pb-2">
          <span>Extração ({report.overview.totalProcessed})</span> <span className="text-white/20">→</span>
          <span>Normalização ({report.overview.totalProcessed})</span> <span className="text-white/20">→</span>
          <span className="text-green-400">Quality Aprovadas ({report.quality.approved})</span> <span className="text-white/20">→</span>
          <span className="text-blue-400">Ranking ({report.ranking.avgOfficialPolicy.toFixed(1)})</span> <span className="text-white/20">→</span>
          <span className="text-emerald-400">Tier S ({report.intelligence.tiers.S})</span> <span className="text-white/20">→</span>
          <span className="text-yellow-400">Dedup ({report.overview.totalDuplicates})</span> <span className="text-white/20">→</span>
          <span className="text-indigo-400">AI Approve ({report.aiDecision.approve})</span> <span className="text-white/20">→</span>
          <span>Publicadas ({report.overview.totalPublished})</span>
        </div>
      </section>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Resumo Geral */}
        <div className="glass-card p-4 flex flex-col gap-2">
          <h3 className="text-xs text-white/50 uppercase font-bold">Resumo Geral</h3>
          <div className="text-2xl font-bold text-white">{report.overview.totalProcessed} <span className="text-sm text-white/40">processadas</span></div>
          <div className="text-sm text-green-400">{report.overview.approvalRate.toFixed(1)}% Taxa de Aprovação</div>
          <div className="text-sm text-red-400">{report.overview.rejectionRate.toFixed(1)}% Taxa de Rejeição</div>
        </div>
        
        {/* Quality Engine */}
        <div className="glass-card p-4 flex flex-col gap-2">
          <h3 className="text-xs text-white/50 uppercase font-bold">Quality Engine</h3>
          <div className="text-sm text-white/80">Aprovados: {report.quality.approved}</div>
          <div className="text-sm text-yellow-400">Revisão: {report.quality.review}</div>
          <div className="text-sm text-red-400">Rejeitados: {report.quality.rejected}</div>
        </div>

        {/* Deduplication Engine */}
        <div className="glass-card p-4 flex flex-col gap-2">
          <h3 className="text-xs text-white/50 uppercase font-bold">Deduplication</h3>
          <div className="text-2xl font-bold text-white">{report.deduplication.duplicatesAvoided} <span className="text-sm text-white/40">evitadas</span></div>
          <div className="text-sm text-yellow-400">{report.overview.duplicateRate.toFixed(1)}% de Duplicidade</div>
        </div>

        {/* AI Consumption */}
        <div className="glass-card p-4 flex flex-col gap-2">
          <h3 className="text-xs text-white/50 uppercase font-bold">Consumo de IA</h3>
          <div className="text-2xl font-bold text-emerald-400">{report.aiConsumption.savingsPercentage.toFixed(1)}% <span className="text-sm text-white/40">economia</span></div>
          <div className="text-sm text-white/80">{report.aiConsumption.callsAvoided} chamadas evitadas</div>
          <div className="text-sm text-emerald-400">~{report.aiConsumption.tokensSavedEstimate} tokens salvos</div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Intelligence Tiers */}
        <section className="glass-card p-5">
          <h3 className="text-sm font-bold text-white/50 uppercase mb-4">Marketplace Intelligence (Tiers)</h3>
          <div className="space-y-2">
            {Object.entries(report.intelligence.percentages).map(([tier, pct]) => (
              <div key={tier} className="flex justify-between items-center">
                <span className="text-sm font-bold">Tier {tier}</span>
                <span className="text-sm text-white/60">{pct.toFixed(1)}% ({report.intelligence.tiers[tier as keyof typeof report.intelligence.tiers]})</span>
              </div>
            ))}
          </div>
        </section>

        {/* Ranking & Publications */}
        <section className="glass-card p-5">
          <h3 className="text-sm font-bold text-white/50 uppercase mb-4">Ranking & Conversões</h3>
          <div className="space-y-2 text-sm text-white/80">
            <div className="flex justify-between"><span>Avg Official Policy</span> <span className="font-bold">{report.ranking.avgOfficialPolicy.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Avg Commercial Policy</span> <span className="font-bold">{report.ranking.avgCommercialPolicy.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>Total Cliques</span> <span className="font-bold">{report.publication.totalClicks}</span></div>
            <div className="flex justify-between"><span>Total Conversões</span> <span className="font-bold text-emerald-400">{report.publication.totalConversions}</span></div>
          </div>
        </section>
      </div>

      {/* Badges Analíticas */}
      <section className="glass-card p-5 w-full flex flex-wrap gap-2">
        <h3 className="w-full text-sm font-bold text-white/50 uppercase mb-2">Badges Analíticas</h3>
        <Badge label={`Melhor Economia IA: ${report.aiConsumption.savingsPercentage.toFixed(1)}%`} tone="good" />
        <Badge label={`Maior Taxa de Aprovação: ${report.overview.approvalRate.toFixed(1)}%`} tone="neutral" />
        <Badge label={`Total Publicadas: ${report.overview.totalPublished}`} tone="good" />
      </section>

    </div>
  );
}
