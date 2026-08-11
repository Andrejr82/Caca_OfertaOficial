import { BrainCircuit } from "lucide-react";
import { DailyRadarRefreshButton } from "@/components/trends/daily-radar-refresh-button";
import { GoogleTrendsCollectButton } from "@/components/trends/google-trends-collect-button";
import { MercadoLivreTrendsCollectButton } from "@/components/trends/mercado-livre-trends-collect-button";
import { ClassifyTrendSignalsButton } from "@/components/trends/classify-trend-signals-button";
import { MatchTrendSignalsButton } from "@/components/trends/match-trend-signals-button";
import { ExecutiveRadarOverview } from "@/components/trends/executive-radar-overview";
import { TrendApprovalQueue } from "@/components/trends/trend-approval-queue";
import { buildDailyRadarFromTrendSignals } from "@/core/trends/daily-radar";
import { buildExecutiveRadarRanking } from "@/core/trends/executive-radar-ranking";
import { buildInternalPerformanceByProduct } from "@/core/trends/internal-performance-score";
import { buildStrongestNiches7d } from "@/core/trends/strongest-niches-7d";
import { partitionTrendSignalsForView } from "@/core/trends/view";
import { TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { listInternalClickSignals } from "@/lib/trends/internal-click-performance";
import { listLatestTrendRadarSnapshot } from "@/lib/trends/radar-queries";
import { listTrendExperiments, listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";
import { listTrendApprovalQueueOffers } from "@/lib/trends/approval-queue-queries";

const INTERNAL_PERFORMANCE_WINDOW_MS = 7 * 24 * 60 * 60 * 1000;

function radarSourceLabel(signal: { source: string; sourceName: string; evidence: Record<string, unknown> }) {
  const source = signal.source.toLocaleLowerCase("pt-BR");
  const provenance = typeof signal.evidence.provenance === "string" ? signal.evidence.provenance.toLocaleLowerCase("pt-BR") : "";
  if (source.includes("google") || signal.sourceName.toLocaleLowerCase("pt-BR").includes("google")) return "Google Trends";
  if (source.includes("mercado") || source.includes("mercadolivre") || signal.sourceName.toLocaleLowerCase("pt-BR").includes("mercado")) return "Mercado Livre";
  if (provenance === "external_radar" || source.includes("external") || source.includes("radar")) return "Radar externo";
  return signal.sourceName || signal.source;
}

function experimentIsActive(experiment: { startedAt: string | null; endsAt: string | null; status: string }) {
  if (!experiment.startedAt || !experiment.endsAt || !["approved", "active", "measuring"].includes(experiment.status)) return false;
  const now = Date.now();
  return new Date(experiment.startedAt).getTime() <= now && now <= new Date(experiment.endsAt).getTime();
}

export default async function TrendsPage() {
  const now = new Date();
  const internalWindowStart = new Date(now.getTime() - INTERNAL_PERFORMANCE_WINDOW_MS);
  const [signals, opportunities, experiments, latestSnapshot, internalClickSignals, approvalQueueOffers] = await Promise.all([
    listTrendSignals(),
    listTrendOpportunities(),
    listTrendExperiments(),
    listLatestTrendRadarSnapshot(),
    listInternalClickSignals(internalWindowStart.toISOString(), now.toISOString()),
    listTrendApprovalQueueOffers(),
  ]);
  const opportunityBySignal = new Map(opportunities.map((opportunity) => [opportunity.signalId, opportunity]));
  const { operational, audit: rejectedSignals, pending } = partitionTrendSignalsForView(signals, TREND_COMMERCIAL_STRATEGY_VERSION);
  const pendingSignals = pending.filter((signal) => !opportunityBySignal.has(signal.id));
  const radar = buildDailyRadarFromTrendSignals(signals, opportunities);
  const internalPerformanceByProduct = buildInternalPerformanceByProduct(internalClickSignals);
  const ranking = buildExecutiveRadarRanking(radar, { asOf: now, internalPerformanceByProduct });
  const strongestNiches = buildStrongestNiches7d(radar, { asOf: now });
  const radarAudit = radar.filter((result) => result.evidence_status === "unverified" || result.evidence_status === "rejected");
  const radarSources = [...new Set(signals.map(radarSourceLabel))];
  const activeExperiments = experiments.filter(experimentIsActive);

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
          <BrainCircuit size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Tendências IA</h1>
          <p className="text-xs text-white/35">Radar executivo auditável para decidir onde focar hoje.</p>
        </div>
      </header>

      <section className="glass-card flex flex-wrap items-center justify-between gap-4 p-5">
        <div>
          <h2 className="text-sm font-bold text-white/70">Controles atuais</h2>
          <p className="mt-1 text-xs text-white/30">Executar Radar atualiza tendências, pesquisa Shopee e prepara a fila manual; atualizar tela apenas recarrega a visão.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <DailyRadarRefreshButton />
          <GoogleTrendsCollectButton />
          <MercadoLivreTrendsCollectButton />
          <ClassifyTrendSignalsButton />
          <MatchTrendSignalsButton />
        </div>
      </section>

      <ExecutiveRadarOverview
        latestSnapshot={latestSnapshot}
        ranking={ranking}
        strongestNiches={strongestNiches}
        radarSources={radarSources}
        activeExperiments={activeExperiments}
      />

      <TrendApprovalQueue offers={approvalQueueOffers} />

      <details className="glass-card p-5">
        <summary className="cursor-pointer text-sm font-bold text-white/60">Operação comercial existente ({operational.length})</summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {operational.map((signal) => (
            <article key={signal.id} className="rounded-lg border border-white/[0.05] p-3">
              <h3 className="truncate text-sm font-bold text-white">{signal.classification?.normalizedProductTerm}</h3>
              <p className="mt-2 text-xs text-white/35">Fonte: {signal.sourceName} · {opportunityBySignal.get(signal.id)?.matchStatus ?? "no_match"}</p>
              <p className="mt-1 text-xs text-white/35">Marketplace: {opportunityBySignal.get(signal.id)?.marketplace ?? "n/d"}</p>
            </article>
          ))}
          {!operational.length ? <p className="text-sm text-white/35">Nenhum sinal operacional elegível.</p> : null}
        </div>
      </details>

      <details className="glass-card p-5">
        <summary className="cursor-pointer text-sm font-bold text-white/60">
          Auditoria / Pendentes / Rejeitados ({radarAudit.length + rejectedSignals.length + pendingSignals.length})
        </summary>
        <div className="mt-4 grid gap-4 lg:grid-cols-3">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/45">Radar sem elegibilidade</h3>
            <div className="mt-2 grid gap-2">
              {radarAudit.map((result, index) => (
                <p key={`${result.normalized_product_term}-${result.evidence_status}-${result.source_urls.join("|")}-${index}`} className="text-xs text-white/35">
                  {result.product_term} · {result.evidence_status} · {result.demand_reason}
                </p>
              ))}
              {!radarAudit.length ? <p className="text-xs text-white/30">Sem itens.</p> : null}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/45">Rejeitados</h3>
            <div className="mt-2 grid gap-2">
              {rejectedSignals.map((signal) => (
                <p key={signal.id} className="text-xs text-white/35">{signal.term} · {signal.classification?.reason ?? "Sem motivo registrado."}</p>
              ))}
              {!rejectedSignals.length ? <p className="text-xs text-white/30">Sem itens.</p> : null}
            </div>
          </div>
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white/45">Pendentes</h3>
            <div className="mt-2 grid gap-2">
              {pendingSignals.map((signal) => <p key={signal.id} className="text-xs text-white/35">{signal.term} · aguardando classificação.</p>)}
              {!pendingSignals.length ? <p className="text-xs text-white/30">Sem itens.</p> : null}
            </div>
          </div>
        </div>
      </details>
    </div>
  );
}
