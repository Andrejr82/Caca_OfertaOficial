import { BrainCircuit } from "lucide-react";
import { ExecutiveRadarOverview } from "@/components/trends/executive-radar-overview";
import { DailyRadarRefreshButton } from "@/components/trends/daily-radar-refresh-button";
import { GoogleTrendsCollectButton } from "@/components/trends/google-trends-collect-button";
import { MercadoLivreTrendsCollectButton } from "@/components/trends/mercado-livre-trends-collect-button";
import { ClassifyTrendSignalsButton } from "@/components/trends/classify-trend-signals-button";
import { MatchTrendSignalsButton } from "@/components/trends/match-trend-signals-button";
import { buildDailyRadarFromTrendSignals } from "@/core/trends/daily-radar";
import { buildExecutiveRadarRanking } from "@/core/trends/executive-radar-ranking";
import { buildStrongestNiches7d } from "@/core/trends/strongest-niches-7d";
import { partitionTrendSignalsForView } from "@/core/trends/view";
import { TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { listTrendExperiments, listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";
import { listLatestTrendRadarSnapshot } from "@/lib/trends/radar-queries";

function radarSourceLabel(signal: { source: string; sourceName: string; evidence: Record<string, unknown> }) {
  const source = signal.source.toLocaleLowerCase("pt-BR");
  const sourceName = signal.sourceName.toLocaleLowerCase("pt-BR");
  const provenance = typeof signal.evidence.provenance === "string"
    ? signal.evidence.provenance.toLocaleLowerCase("pt-BR")
    : "";
  if (source.includes("google") || sourceName.includes("google")) return "Google Trends";
  if (source.includes("shopee") || sourceName.includes("shopee")) return "Shopee";
  if (source.includes("mercado") || source.includes("mercadolivre") || sourceName.includes("mercado")) return "Mercado Livre";
  if (/achadinho/iu.test(source) || /achadinho/iu.test(sourceName)) return "Achadinhos";
  if (provenance === "external_radar" || source.includes("external") || source.includes("radar")) return "Radar externo";
  return signal.sourceName || signal.source;
}

function experimentIsActive(experiment: { startedAt: string | null; endsAt: string | null; status: string }, now: number) {
  if (!experiment.startedAt || !experiment.endsAt || !["approved", "active", "measuring"].includes(experiment.status)) return false;
  return new Date(experiment.startedAt).getTime() <= now && now <= new Date(experiment.endsAt).getTime();
}

export default async function TrendsPage() {
  const [signals, opportunities, experiments, snapshot] = await Promise.all([
    listTrendSignals(),
    listTrendOpportunities(),
    listTrendExperiments(),
    listLatestTrendRadarSnapshot(),
  ]);

  const now = new Date();
  const asOf = now.toISOString();
  const radar = buildDailyRadarFromTrendSignals(signals, opportunities);
  const ranking = buildExecutiveRadarRanking(radar, { asOf });
  const niches = buildStrongestNiches7d(radar, { asOf });
  const sourceLabels = [...new Set(signals.map(radarSourceLabel))];
  const activeExperiments = experiments.filter((experiment) => experimentIsActive(experiment, now.getTime()));
  const opportunityBySignal = new Map(opportunities.map((opportunity) => [opportunity.signalId, opportunity]));
  const { operational, audit: rejectedSignals, pending } = partitionTrendSignalsForView(signals, TREND_COMMERCIAL_STRATEGY_VERSION);
  const pendingSignals = pending.filter((signal) => !opportunityBySignal.has(signal.id));
  const radarAudit = radar.filter((result) => result.evidence_status === "unverified" || result.evidence_status === "rejected");

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
          <p className="mt-1 text-xs text-white/30">Atualizar tela ainda é refresh visual. A execução integrada do Radar entra na Task 2.6.</p>
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
        snapshot={snapshot}
        niches={niches}
        ranking={ranking}
        sourceLabels={sourceLabels}
      />

      <section className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white/70">Experimentos ativos</h2>
            <p className="mt-1 text-xs text-white/35">Resultados medidos alimentam aprendizado; recomendação anterior não vira evidência sozinha.</p>
          </div>
          <span className="text-xs text-white/35">{activeExperiments.length} ativo(s)</span>
        </div>
        {activeExperiments.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {activeExperiments.map((experiment) => (
              <article key={experiment.id} className="rounded-lg border border-white/[0.05] p-4">
                <h3 className="text-sm font-bold text-white">{experiment.marketplace || "Marketplace"} · {experiment.channel || "canal pendente"}</h3>
                <p className="mt-2 text-xs text-white/40">{experiment.hypothesis || "Hipótese não registrada."}</p>
                <p className="mt-2 text-xs text-white/30">{experiment.status} · termina {experiment.endsAt ? new Date(experiment.endsAt).toLocaleDateString("pt-BR") : "n/d"}</p>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-white/35">Nenhum experimento ativo no momento.</p>}
      </section>

      <details className="glass-card p-5">
        <summary className="cursor-pointer text-sm font-bold text-white/60">Operação comercial atual ({operational.length})</summary>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {operational.map((signal) => (
            <article key={signal.id} className="rounded-lg border border-white/[0.05] p-3">
              <h3 className="truncate text-sm font-bold text-white">{signal.classification?.normalizedProductTerm || signal.term}</h3>
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
              {radarAudit.map((result) => (
                <p key={`${result.normalized_product_term}-${result.evidence_status}`} className="text-xs text-white/35">
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
