import type { StrongNiche7d } from "@/core/trends/strongest-niches-7d";
import type { ExecutiveRadarRankingItem } from "@/core/trends/executive-radar-ranking";
import type { TrendExperimentListItem } from "@/core/trends/types";
import type {
  TrendRadarSnapshotView,
  TrendRadarSnapshotProductView,
  TrendRadarBenchmarkView,
  TrendRadarEconomicReturnView,
} from "@/lib/trends/radar-queries";

interface ExecutiveRadarOverviewProps {
  latestSnapshot: TrendRadarSnapshotView | null;
  strongestNiches: StrongNiche7d[];
  ranking: ExecutiveRadarRankingItem[];
  radarSources: string[];
  activeExperiments: TrendExperimentListItem[];
}

function scoreLabel(value: number): string {
  return `${Math.round(value * 10) / 10}/100`;
}

function formatCurrency(value: number | null): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function decisionBadge(decision: string | null) {
  if (!decision) return null;
  const upper = decision.toUpperCase();
  let colorClass = "bg-white/10 text-white/70 border-white/20";
  if (upper === "PRIORIDADE") colorClass = "bg-emerald-500/20 text-emerald-300 border-emerald-400/30";
  else if (upper === "TESTAR") colorClass = "bg-cyan-500/20 text-cyan-300 border-cyan-400/30";
  else if (upper === "OBSERVAR") colorClass = "bg-amber-500/20 text-amber-300 border-amber-400/30";
  else if (upper === "IGNORAR") colorClass = "bg-rose-500/20 text-rose-300 border-rose-400/30";

  return (
    <span className={`inline-flex items-center rounded border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider ${colorClass}`}>
      {upper}
    </span>
  );
}

function formatBenchmark(benchmark: TrendRadarBenchmarkView | null): string | null {
  if (!benchmark) return null;
  const parts: string[] = [];

  if (typeof benchmark.priceVsMedianPercent === "number") {
    if (benchmark.priceVsMedianPercent > 0) {
      parts.push(`${benchmark.priceVsMedianPercent}% abaixo da mediana`);
    } else if (benchmark.priceVsMedianPercent < 0) {
      parts.push(`${Math.abs(benchmark.priceVsMedianPercent)}% acima da mediana`);
    } else {
      parts.push("na mediana");
    }
  }

  const confidence = benchmark.peerConfidence ? `Benchmark ${benchmark.peerConfidence}` : null;
  const peers = typeof benchmark.peerCount === "number" ? `${benchmark.peerCount} peer${benchmark.peerCount === 1 ? "" : "s"}` : null;

  const meta = [confidence, peers].filter(Boolean).join(" · ");
  if (meta) parts.push(meta);

  return parts.length ? parts.join(" · ") : null;
}

function formatEconomics(econ: TrendRadarEconomicReturnView | null): string {
  if (econ && econ.status === "observed") {
    const percent = typeof econ.effectiveCommissionPercent === "number" ? `Comissão ${econ.effectiveCommissionPercent}%` : null;
    const perSale = typeof econ.estimatedCommissionPerSale === "number" ? `~R$ ${econ.estimatedCommissionPerSale.toFixed(2).replace(".", ",")}/venda` : null;
    const summary = [percent, perSale].filter(Boolean).join(" · ");
    return summary || "Comissão não observada";
  }
  return "Comissão não observada";
}

function renderScoreBreakdown(breakdown: Record<string, number>) {
  if (!breakdown || !Object.keys(breakdown).length) return null;
  const labels: Record<string, string> = {
    competitiveness: "Competitividade",
    demandAcceleration: "Demanda",
    offerStrength: "Oferta",
    economicReturn: "Economia",
    reputation: "Reputação",
    internalConversion: "Conversão Int.",
    executionQuality: "Execução",
    price_competitiveness: "Competitividade",
    velocity: "Velocidade",
    affiliate: "Afiliado",
  };
  const entries = Object.entries(breakdown).filter(([_, v]) => typeof v === "number");
  if (!entries.length) return null;
  return (
    <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 rounded bg-white/[0.03] p-2 text-[11px] text-white/50 border border-white/[0.04]">
      {entries.slice(0, 4).map(([k, v]) => (
        <span key={k}>
          <strong className="font-medium text-white/70">{labels[k] || k}:</strong> {v}
        </span>
      ))}
    </div>
  );
}

export function ExecutiveRadarOverview({
  latestSnapshot,
  strongestNiches,
  ranking,
  radarSources,
  activeExperiments,
}: ExecutiveRadarOverviewProps) {
  const snapshotProducts = latestSnapshot?.products ?? [];
  const focus = snapshotProducts.filter((item) => item.isFocus).slice(0, 3);

  return (
    <div className="grid gap-6">
      <section className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white/70">Status da execução e fontes</h2>
            <p className="mt-1 text-xs text-white/35">
              {latestSnapshot
                ? `Snapshot ${latestSnapshot.radarDate} · ${latestSnapshot.status} · ${latestSnapshot.strategyVersion}`
                : "Nenhum snapshot executivo persistido ainda."}
            </p>
          </div>
          <span className="text-xs text-white/35">{radarSources.length ? radarSources.join(" · ") : "Sem fontes persistidas"}</span>
        </div>
      </section>

      <section className="glass-card p-5">
        <div className="mb-4">
          <h2 className="text-sm font-bold text-white/70">Nichos mais fortes da semana</h2>
          <p className="mt-1 text-xs text-white/35">Janela observada de 7 dias; cadência não representa volume de mercado.</p>
        </div>
        {strongestNiches.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {strongestNiches.slice(0, 6).map((niche) => (
              <article key={niche.normalizedNiche} className="rounded-lg border border-white/[0.06] p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="text-sm font-bold text-white">{niche.niche}</h3>
                  <span className="text-xs font-bold text-cyan-300">{scoreLabel(niche.strengthScore)}</span>
                </div>
                <p className="mt-2 text-xs text-white/40">Confiança {niche.confidence}% · {niche.sourceCount} fonte(s) · {niche.signalCadence.acceleration}</p>
                <p className="mt-2 text-xs text-white/35">{niche.topProducts.map((item) => item.productTerm).join(" · ") || "Sem produtos elegíveis"}</p>
              </article>
            ))}
          </div>
        ) : <p className="text-sm text-white/35">Ainda não há evidência suficiente na janela de 7 dias.</p>}
      </section>

      <section className="grid gap-4 lg:grid-cols-3">
        {[
          ["Análise Shopee", "Shopee"],
          ["Análise Mercado Livre", "Mercado Livre"],
          ["Google Trends + Achadinhos", "Google"],
        ].map(([title, key]) => {
          const products = ranking.filter((item) => key === "Google"
            ? item.result.source_types.some((source) => /google|achadinho/iu.test(source))
            : item.result.marketplaces.some((marketplace) => marketplace.toLocaleLowerCase("pt-BR").includes(key.toLocaleLowerCase("pt-BR"))));
          return (
            <section key={title} className="glass-card p-5">
              <h2 className="text-sm font-bold text-white/70">{title}</h2>
              <p className="mt-2 text-xs text-white/35">
                {products.length
                  ? products.slice(0, 3).map((item) => `${item.result.product_term} (${scoreLabel(item.score.total)})`).join(" · ")
                  : "Sem evidência elegível no ranking atual."}
              </p>
            </section>
          );
        })}
      </section>

      <section className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white/70">Foco de Hoje · Top 3</h2>
            <p className="mt-1 text-xs text-white/35">Recomendação persistida no snapshot mais recente; não é evidência em si.</p>
          </div>
        </div>
        {focus.length ? (
          <div className="grid gap-3 lg:grid-cols-3">
            {focus.map((item) => {
              const decision = item.selectionDecision || item.scoreDecision || item.rawDecision;
              const formattedPrice = formatCurrency(item.price);
              const benchmarkText = formatBenchmark(item.benchmark);
              const economicsText = formatEconomics(item.economicReturn);

              return (
                <article key={item.id} className="rounded-lg border border-cyan-400/20 p-4">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-cyan-300">
                      #{item.priority} · {scoreLabel(item.commercialScore ?? 0)}
                    </p>
                    {decisionBadge(decision)}
                  </div>
                  <h3 className="mt-1 text-sm font-bold text-white">{item.productTerm}</h3>
                  <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-white/40">
                    <span>{item.category || "Sem categoria"} · {item.marketplace || "marketplace pendente"}</span>
                    {formattedPrice ? <span className="font-semibold text-white/70">· {formattedPrice}</span> : null}
                  </div>
                  {benchmarkText ? (
                    <p className="mt-2 text-xs text-cyan-300/80 font-medium">{benchmarkText}</p>
                  ) : null}
                  <p className="mt-1 text-xs text-white/50">{economicsText}</p>
                  {renderScoreBreakdown(item.scoreBreakdown)}
                  <div className="mt-3 grid gap-1">
                    {item.determiningReasons.map((reason) => (
                      <p key={reason} className="text-xs text-white/35">{reason}</p>
                    ))}
                  </div>
                </article>
              );
            })}
          </div>
        ) : <p className="text-sm text-white/35">Nenhum produto elegível para foco no snapshot mais recente.</p>}
      </section>

      <section className="glass-card p-5">
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-bold text-white/70">Ranking Operacional · Top 20</h2>
            <p className="mt-1 text-xs text-white/35">Score comercial persistido e auditável no último snapshot.</p>
          </div>
          <span className="text-xs text-white/35">{snapshotProducts.length} produto(s)</span>
        </div>
        <div className="grid gap-2">
          {snapshotProducts.map((item) => {
            const decision = item.selectionDecision || item.scoreDecision || item.rawDecision;
            const formattedPrice = formatCurrency(item.price);
            const benchmarkText = formatBenchmark(item.benchmark);

            return (
              <article key={item.id} className="grid gap-2 rounded-lg border border-white/[0.05] p-3 md:grid-cols-[60px_1fr_auto] md:items-center">
                <span className="text-sm font-bold text-cyan-300">#{item.priority}</span>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-sm font-bold text-white">{item.productTerm}</h3>
                    {formattedPrice ? <span className="text-xs font-semibold text-white/60">({formattedPrice})</span> : null}
                    {decisionBadge(decision)}
                  </div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-white/35">
                    <span>{item.evidenceStatus} · {item.sourceCount} fonte(s) · confiança {item.confidence}%</span>
                    {benchmarkText ? <span className="text-cyan-300/70 font-medium">· {benchmarkText}</span> : null}
                  </div>
                </div>
                <span className="text-sm font-bold text-white/70">{scoreLabel(item.commercialScore ?? 0)}</span>
              </article>
            );
          })}
          {!snapshotProducts.length ? <p className="text-sm text-white/35">Sem ranking operacional no snapshot mais recente.</p> : null}
        </div>
      </section>

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
    </div>
  );
}
