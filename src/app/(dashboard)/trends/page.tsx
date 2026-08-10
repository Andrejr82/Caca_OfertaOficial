import { BrainCircuit } from "lucide-react";
import { GoogleTrendsCollectButton } from "@/components/trends/google-trends-collect-button";
import { ClassifyTrendSignalsButton } from "@/components/trends/classify-trend-signals-button";
import { MatchTrendSignalsButton } from "@/components/trends/match-trend-signals-button";
import { partitionTrendSignalsForView } from "@/core/trends/view";
import { TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";

export default async function TrendsPage() {
  const [signals, opportunities] = await Promise.all([listTrendSignals(), listTrendOpportunities()]);
  const opportunityBySignal = new Map(opportunities.map((opportunity) => [opportunity.signalId, opportunity]));
  const { operational: eligibleSignals, audit: rejectedSignals, pending: pendingSignals } = partitionTrendSignalsForView(signals, TREND_COMMERCIAL_STRATEGY_VERSION);

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
          <BrainCircuit size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Tendências IA</h1>
          <p className="text-xs text-white/35">Oportunidades orientadas por sinais e decisões humanas.</p>
        </div>
      </header>

      <section className="glass-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-white/70">Fonte ativa: Google Trends</h2>
          <p className="mt-1 text-xs text-white/30">Região BR · daily trends · sem associação automática de oferta.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <GoogleTrendsCollectButton />
          <ClassifyTrendSignalsButton />
          <MatchTrendSignalsButton />
        </div>
      </section>

      {eligibleSignals.length > 0 ? (
        <section className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white/70">Operação comercial</h2>
            <span className="text-xs text-white/30">{eligibleSignals.length} elegível(is)</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {eligibleSignals.map((signal) => (
              <article key={signal.id} className="rounded-lg border border-white/[0.05] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-bold text-white">{signal.classification?.normalizedProductTerm}</h3>
                  <span className="rounded-full bg-amber-500/10 px-2 py-1 text-[10px] font-bold uppercase text-amber-300">{opportunityBySignal.get(signal.id)?.matchStatus ?? "no_match"}</span>
                </div>
                <p className="mt-2 text-xs text-white/35">Original: {signal.term}</p>
                <p className="mt-1 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Direção: {signal.trendDirection}</p>
                <div className="mt-3 border-t border-white/[0.05] pt-3 text-xs text-white/45">
                  <p>Relevância comercial: <span className="text-emerald-300">{signal.classification?.commercialRelevance}</span></p>
                  <p className="mt-1">Marketplace: {opportunityBySignal.get(signal.id)?.marketplace ?? "n/d"}</p>
                  <p className="mt-1">Oferta: {opportunityBySignal.get(signal.id)?.offerId ?? "Nenhuma oferta compatível encontrada"}</p>
                  <p className="mt-1">Preço: {opportunityBySignal.get(signal.id)?.currentPrice == null ? "n/d" : `R$ ${opportunityBySignal.get(signal.id)?.currentPrice?.toFixed(2)}`}</p>
                  <p className="mt-1 text-white/30">{opportunityBySignal.get(signal.id)?.matchReason ?? "Nenhuma oferta compatível encontrada."}</p>
                </div>
              </article>
            ))}
          </div>
        </section>
      ) : (
        <section className="glass-card p-8 text-center">
          <h2 className="text-sm font-bold text-white/60">Nenhum sinal elegível para operação</h2>
          <p className="mt-2 text-sm text-white/30">Sinais rejeitados permanecem disponíveis em Descartados / Auditoria.</p>
        </section>
      )}

      <details className="glass-card p-5">
        <summary className="cursor-pointer text-sm font-bold text-white/60">Descartados / Auditoria ({rejectedSignals.length})</summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {rejectedSignals.map((signal) => (
            <article key={signal.id} className="rounded-lg border border-white/[0.05] p-3 opacity-70">
              <div className="flex items-center justify-between gap-2">
                <h3 className="truncate text-sm font-bold text-white/70">{signal.term}</h3>
                <span className="text-[10px] font-bold uppercase text-rose-300">rejected</span>
              </div>
              <p className="mt-2 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Direção: {signal.trendDirection}</p>
              <p className="mt-2 text-xs text-white/35">Relevância: {signal.classification?.commercialRelevance ?? "n/d"}</p>
              <p className="mt-2 text-xs text-white/30">{signal.classification?.reason ?? "Sem motivo registrado."}</p>
            </article>
          ))}
        </div>
      </details>

      {pendingSignals.length > 0 ? (
        <details className="glass-card p-5" open>
          <summary className="cursor-pointer text-sm font-bold text-white/60">Pendentes de classificação ({pendingSignals.length})</summary>
          <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {pendingSignals.map((signal) => (
              <article key={signal.id} className="rounded-lg border border-white/[0.05] p-3 opacity-70">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-bold text-white/70">{signal.term}</h3>
                  <span className="text-[10px] font-bold uppercase text-sky-300">pending</span>
                </div>
                <p className="mt-2 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Direção: {signal.trendDirection}</p>
                <p className="mt-2 text-xs text-white/30">Aguardando classificação na estratégia atual.</p>
              </article>
            ))}
          </div>
        </details>
      ) : null}

      {opportunities.length === 0 ? (
        <section className="glass-card p-10 text-center">
          <BrainCircuit size={32} className="mx-auto text-white/20" />
          <h2 className="mt-4 text-sm font-bold text-white/60">Nenhum match válido registrado</h2>
          <p className="mt-2 text-sm text-white/30">Sinais elegíveis sem oferta compatível não geram oportunidade nem recomendação.</p>
        </section>
      ) : (
        <section className="grid gap-3">
          {opportunities.map((opportunity) => (
            <article key={opportunity.id} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold text-white">{opportunity.signalTitle}</h2>
                <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">{opportunity.status}</span>
              </div>
              <p className="mt-3 text-sm text-white/40">Produto: {opportunity.normalizedProductTerm || "n/d"} · Marketplace: {opportunity.marketplace || "n/d"}</p>
              <p className="mt-1 text-sm text-white/40">Oferta: {opportunity.offerId || "Nenhuma oferta compatível encontrada"} · Confiança: {opportunity.matchConfidence ?? "n/d"}</p>
              <p className="mt-1 text-sm text-white/40">Preço atual: {opportunity.currentPrice == null ? "n/d" : `R$ ${opportunity.currentPrice.toFixed(2)}`} · Desconto real: {opportunity.oldPrice && opportunity.currentPrice && opportunity.oldPrice > opportunity.currentPrice ? `${Math.round((1 - opportunity.currentPrice / opportunity.oldPrice) * 100)}%` : "n/d"}</p>
              <p className="mt-1 text-xs text-white/30">{opportunity.matchReason || "Sem motivo registrado."}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
