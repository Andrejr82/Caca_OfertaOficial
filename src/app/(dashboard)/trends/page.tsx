import { BrainCircuit } from "lucide-react";
import { DailyRadarRefreshButton } from "@/components/trends/daily-radar-refresh-button";
import { GoogleTrendsCollectButton } from "@/components/trends/google-trends-collect-button";
import { MercadoLivreTrendsCollectButton } from "@/components/trends/mercado-livre-trends-collect-button";
import { ClassifyTrendSignalsButton } from "@/components/trends/classify-trend-signals-button";
import { MatchTrendSignalsButton } from "@/components/trends/match-trend-signals-button";
import { buildDailyRadarFromTrendSignals, rankDailyTrendRadar } from "@/core/trends/daily-radar";
import { partitionTrendSignalsForView } from "@/core/trends/view";
import { TREND_COMMERCIAL_STRATEGY_VERSION } from "@/core/ai/trend-commercial-classifier";
import { listTrendExperiments, listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";

function radarSourceLabel(signal: { source: string; sourceName: string; evidence: Record<string, unknown> }) {
  const source = signal.source.toLocaleLowerCase("pt-BR");
  const provenance = typeof signal.evidence.provenance === "string" ? signal.evidence.provenance.toLocaleLowerCase("pt-BR") : "";
  if (source.includes("google") || signal.sourceName.toLocaleLowerCase("pt-BR").includes("google")) return "Google Trends";
  if (source.includes("mercado") || source.includes("mercadolivre") || signal.sourceName.toLocaleLowerCase("pt-BR").includes("mercado")) return "Mercado Livre";
  if (provenance === "external_radar" || source.includes("external") || source.includes("radar")) return "Radar externo";
  return signal.sourceName || signal.source;
}

function parseMatchEvidence(value: string | null) {
  if (!value) return { reason: null, provenance: null, discoverySource: null, queries: [], marketplaceIdentity: null as Record<string, unknown> | null };
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return {
      reason: typeof parsed.reason === "string" ? parsed.reason : null,
      provenance: typeof parsed.provenance === "string" ? parsed.provenance : null,
      discoverySource: typeof parsed.discovery_source === "string" ? parsed.discovery_source : null,
      queries: Array.isArray(parsed.discovery_queries) ? parsed.discovery_queries.filter((item): item is string => typeof item === "string") : [],
      marketplaceIdentity: parsed.marketplace_identity && typeof parsed.marketplace_identity === "object" ? parsed.marketplace_identity as Record<string, unknown> : null
    };
  } catch {
    return { reason: value, provenance: null, discoverySource: null, queries: [], marketplaceIdentity: null };
  }
}

function experimentIsActive(experiment: { startedAt: string | null; endsAt: string | null; status: string }) {
  if (!experiment.startedAt || !experiment.endsAt || !["approved", "active", "measuring"].includes(experiment.status)) return false;
  const now = Date.now();
  return new Date(experiment.startedAt).getTime() <= now && now <= new Date(experiment.endsAt).getTime();
}

export default async function TrendsPage() {
  const [signals, opportunities, experiments] = await Promise.all([listTrendSignals(), listTrendOpportunities(), listTrendExperiments()]);
  const opportunityBySignal = new Map(opportunities.map((opportunity) => [opportunity.signalId, opportunity]));
  const opportunityById = new Map(opportunities.map((opportunity) => [opportunity.id, opportunity]));
  const experimentByOpportunity = new Map(experiments.map((experiment) => [experiment.opportunityId, experiment]));
  const { operational: eligibleSignals, audit: rejectedSignals, pending } = partitionTrendSignalsForView(signals, TREND_COMMERCIAL_STRATEGY_VERSION);
  const pendingSignals = pending.filter((signal) => !opportunityBySignal.has(signal.id));
  const radar = rankDailyTrendRadar(buildDailyRadarFromTrendSignals(signals, opportunities));
  const topRadar = radar
    .filter((result) => result.evidence_status === "verified" || result.evidence_status === "partial")
    .sort((left, right) => {
      const priority = (result: typeof left) => {
        const opportunity = result.opportunity_id ? opportunityById.get(result.opportunity_id) : undefined;
        const experiment = opportunity ? experimentByOpportunity.get(opportunity.id) : undefined;
        if (experiment && experimentIsActive(experiment)) return 0;
        if (opportunity?.recommendation?.status === "approved") return 1;
        if (opportunity?.recommendation?.status === "recommended") return 2;
        if (opportunity?.matchStatus === "matched") return 3;
        if (result.evidence_status === "verified") return 4;
        if (result.evidence_status === "partial") return 5;
        return 6;
      };
      return priority(left) - priority(right) || (left.rank ?? Number.MAX_SAFE_INTEGER) - (right.rank ?? Number.MAX_SAFE_INTEGER);
    });
  const radarAudit = radar.filter((result) => result.evidence_status === "unverified" || result.evidence_status === "rejected");
  const radarSources = [...new Set(signals.map(radarSourceLabel))];

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
          <h2 className="text-sm font-bold text-white/70">Fontes do Radar</h2>
          <p className="mt-1 text-xs text-white/30">{radarSources.length > 0 ? radarSources.join(" · ") : "Nenhuma fonte persistida."} · sem associação automática de oferta.</p>
        </div>
        <div className="flex flex-wrap gap-3">
          <DailyRadarRefreshButton />
          <GoogleTrendsCollectButton />
          <MercadoLivreTrendsCollectButton />
          <ClassifyTrendSignalsButton />
          <MatchTrendSignalsButton />
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white/70">Radar de hoje</h2>
            <p className="mt-1 text-xs text-white/30">Evidência atual separada de inferência. Sem scheduler ou chamada live automática.</p>
          </div>
          <span className="text-xs text-white/30">{topRadar.length} priorizado(s)</span>
        </div>
        {topRadar.length > 0 ? (
          <div className="grid gap-3 lg:grid-cols-2">
            {topRadar.map((result) => (
              <article key={`${result.normalized_product_term}-${result.source_urls[0] || "radar"}`} className="rounded-lg border border-white/[0.05] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">#{result.rank ?? "—"} · {result.evidence_status}</p>
                    <h3 className="mt-1 text-sm font-bold text-white">{result.product_term}</h3>
                  </div>
                  <span className="text-xs text-white/35">{result.marketplaces.join(", ") || "marketplace pendente"}</span>
                </div>
                <p className="mt-2 text-xs text-white/40">Categoria: {result.category || "n/d"} · Match: {result.match_status}</p>
                <p className="mt-1 text-xs text-white/40">Preço observado: {result.observed_price_min == null ? "n/d" : `R$ ${result.observed_price_min.toFixed(2)}`} {result.discount_percent == null ? "" : `· desconto ${result.discount_percent}%`}</p>
                <p className="mt-2 text-xs text-white/45">Evidência: {result.direct_evidence.map((item) => item.claim).join("; ") || "n/d"}</p>
                <p className="mt-1 text-xs text-white/30">Fontes: {result.source_urls.join(", ") || "n/d"}</p>
                <p className="mt-2 text-[11px] text-white/30">Afiliado: {result.affiliate_potential} · Visual: {result.visual_content_potential} · Confiança: {result.confidence}</p>
              </article>
            ))}
          </div>
        ) : <p className="rounded-lg border border-dashed border-white/[0.08] p-4 text-sm text-white/35">Nenhum item verificado ou parcial no radar atual.</p>}
        {radarAudit.length > 0 ? (
          <details className="mt-4 rounded-lg border border-white/[0.05] p-3">
            <summary className="cursor-pointer text-xs font-bold text-white/50">Pendentes / Auditoria ({radarAudit.length})</summary>
            <div className="mt-3 grid gap-2 sm:grid-cols-2">
              {radarAudit.map((result) => <p key={`${result.product_term}-${result.evidence_status}`} className="text-xs text-white/35">{result.product_term} · {result.evidence_status} · {result.demand_reason}</p>)}
            </div>
          </details>
        ) : null}
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
                <p className="mt-1 text-xs text-white/35">Fonte: {signal.source}</p>
                <p className="mt-1 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Direção: {signal.trendDirection ?? "n/d"}</p>
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
              <p className="mt-2 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Direção: {signal.trendDirection ?? "n/d"}</p>
              <p className="mt-1 text-xs text-white/35">Fonte: {signal.source}</p>
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
                <p className="mt-2 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Direção: {signal.trendDirection ?? "n/d"}</p>
                <p className="mt-1 text-xs text-white/35">Fonte: {signal.source}</p>
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
          {opportunities.map((opportunity) => {
            const matchEvidence = parseMatchEvidence(opportunity.matchReason);
            return <article key={opportunity.id} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">Opportunity real</p>
                  <h2 className="mt-1 font-bold text-white">{opportunity.normalizedProductTerm || opportunity.signalTitle}</h2>
                </div>
                <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">{opportunity.status}</span>
              </div>
              <p className="mt-3 text-sm text-white/40">Sinal: {opportunity.signalTitle} · Marketplace: {opportunity.marketplace || "n/d"}</p>
              <p className="mt-1 text-sm text-white/40">Oferta: {opportunity.offerId || "Nenhuma oferta compatível encontrada"} · Confiança: {opportunity.matchConfidence ?? "n/d"}</p>
              <p className="mt-1 text-sm text-white/40">Preço atual: {opportunity.currentPrice == null ? "n/d" : `R$ ${opportunity.currentPrice.toFixed(2)}`} · Desconto real: {opportunity.oldPrice && opportunity.currentPrice && opportunity.oldPrice > opportunity.currentPrice ? `${Math.round((1 - opportunity.currentPrice / opportunity.oldPrice) * 100)}%` : "n/d"}</p>
              <div className="mt-3 grid gap-1 text-xs text-white/35">
                <p>Evidência: {matchEvidence.reason || "n/d"}</p>
                <p>Origem: {matchEvidence.provenance || "n/d"}</p>
                <p>Fonte da descoberta: {matchEvidence.discoverySource || "n/d"}</p>
                <p>Consulta: {matchEvidence.queries.length > 0 ? matchEvidence.queries.join(" · ") : "n/d"}</p>
                <p>ID marketplace: {matchEvidence.marketplaceIdentity ? Object.values(matchEvidence.marketplaceIdentity).filter(Boolean).join(" · ") || "n/d" : "n/d"}</p>
              </div>
              {opportunity.matchReason && matchEvidence.reason !== opportunity.matchReason ? <details className="mt-2 text-[10px] text-white/25"><summary className="cursor-pointer">Auditoria técnica</summary><pre className="mt-1 whitespace-pre-wrap break-words">{opportunity.matchReason}</pre></details> : null}
              {opportunity.recommendation ? (
                <div className="mt-4 rounded-lg border border-cyan-400/10 bg-cyan-500/[0.04] p-3 text-xs text-white/55">
                  <p className="font-bold text-cyan-200">Recommendation IA</p>
                  <p className="mt-1">Canal: {opportunity.recommendation.channel || "n/d"} · Formato: {opportunity.recommendation.format || "n/d"} · Confiança: {opportunity.recommendation.confidence ?? "n/d"}</p>
                  <p className="mt-1">Aprovação: {opportunity.recommendation.status || "n/d"}</p>
                  {opportunity.recommendation.justification ? <p className="mt-2 text-white/40">{opportunity.recommendation.justification}</p> : null}
                </div>
              ) : <p className="mt-3 text-xs text-white/30">Recommendation: ainda não disponível.</p>}
            </article>;
          })}
        </section>
      )}

      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white/70">Experimento de 7 dias</h2>
            <p className="mt-1 text-xs text-white/30">Exige oportunidade válida, recomendação e aprovação humana. Não inicia automaticamente.</p>
          </div>
          <span className="text-xs text-white/30">{experiments.length} real(is)</span>
        </div>
        {experiments.length === 0 ? (
          <p className="mt-4 rounded-lg border border-dashed border-white/[0.08] p-4 text-sm text-white/35">Nenhum experimento ativo ou concluído.</p>
        ) : (
          <div className="mt-4 grid gap-3 lg:grid-cols-2">
            {experiments.map((experiment) => {
              const active = experimentIsActive(experiment);
              const experimentOpportunity = opportunityById.get(experiment.opportunityId);
              return <article key={experiment.id} className="rounded-lg border border-white/[0.05] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-violet-300">{opportunityById.get(experiment.opportunityId)?.normalizedProductTerm || "Experimento real"}</p>
                    <h3 className="mt-1 text-sm font-bold text-white">{experiment.hypothesis || "Hipótese não registrada"}</h3>
                  </div>
                  <span className="rounded-full bg-violet-500/10 px-2 py-1 text-[10px] font-bold uppercase text-violet-300">{active ? "active" : experiment.status}</span>
                </div>
                <p className="mt-2 text-xs text-white/40">Canal: {experiment.channel || "n/d"} · Formato: {experiment.format || "n/d"} · Duração: {experiment.windowDays} dias</p>
                <p className="mt-1 text-xs text-white/40">Início: {experiment.startedAt || "n/d"} · Fim: {experiment.endsAt || "n/d"}</p>
                <p className="mt-3 text-xs text-white/35">Métricas: vendas {experiment.metrics.salesCount ?? experiment.metrics.sales_count ?? 0} · cliques {experiment.metrics.clicks ?? 0} · comissão {experiment.metrics.commissionValue ?? experiment.metrics.commission_value ?? 0}</p>
                <p className="mt-1 text-xs text-white/35">CTR: {experiment.metrics.ctr == null ? "não disponível" : experiment.metrics.ctr}</p>
                <p className="mt-1 text-xs text-white/35">Status do experimento: {active ? "ativo" : experiment.status}</p>
                <p className="mt-1 text-xs text-white/30">Recommendation: {experimentOpportunity?.recommendation?.status || "n/d"} · Decisão final: {experiment.finalDecision || "pendente"}{experiment.decisionReason ? ` · ${experiment.decisionReason}` : ""}</p>
              </article>;
            })}
          </div>
        )}
      </section>
    </div>
  );
}
