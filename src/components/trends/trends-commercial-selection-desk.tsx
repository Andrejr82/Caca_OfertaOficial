import { ExternalLink, FlaskConical, ShieldX } from "lucide-react";
import type { TrendRadarSnapshotView } from "@/lib/trends/radar-queries";
import { approveTrendTestAction, ignoreTrendProductAction } from "@/lib/trends/selection-actions";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function scoreLabel(value: number | null): string {
  return `${Math.round((value ?? 0) * 10) / 10}/100`;
}

function decisionClass(decision: string | null): string {
  if (decision === "PRIORIDADE") return "text-emerald-300";
  if (decision === "TESTAR") return "text-amber-300";
  return "text-white/45";
}

export function TrendsCommercialSelectionDesk({ snapshot }: { snapshot: TrendRadarSnapshotView | null }) {
  const products = snapshot?.products ?? [];

  return (
    <section className="grid gap-4">
      <div className="glass-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-extrabold text-white">Mesa de seleção comercial</h2>
            <p className="mt-1 text-xs text-white/35">Lê somente o snapshot pronto. Aprovar teste registra decisão humana; não publica automaticamente.</p>
          </div>
          <div className="text-right text-xs text-white/35">
            {snapshot ? (
              <>
                <p>{snapshot.radarDate} · {snapshot.status}</p>
                <p>{String(snapshot.sourceHealth.strategy_version || snapshot.executiveSummary.strategy_version || snapshot.strategyVersion)}</p>
              </>
            ) : <p>Nenhum snapshot disponível.</p>}
          </div>
        </div>
      </div>

      <div className="grid gap-3">
        {products.map((item) => {
          const sourceUrl = item.directEvidenceSourceUrls[0] ?? null;
          const totalCommission = (item.commissionPercent ?? 0) + (item.sellerCommissionPercent ?? 0);
          return (
            <article key={item.id} className="glass-card p-4">
              <div className="grid gap-4 lg:grid-cols-[54px_minmax(0,1fr)_180px] lg:items-start">
                <div className="text-lg font-black text-cyan-300">#{item.priority}</div>

                <div className="min-w-0">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div>
                      <p className={`text-[10px] font-black uppercase tracking-wider ${decisionClass(item.scoreDecision)}`}>
                        {item.scoreDecision || "SEM DECISÃO"} · {scoreLabel(item.commercialScore)}
                      </p>
                      <h3 className="mt-1 text-base font-extrabold text-white">{item.productTerm}</h3>
                      <p className="mt-1 text-xs text-white/35">{item.marketplace || "Marketplace"} · {item.category || "Sem categoria"}</p>
                    </div>
                    {sourceUrl ? (
                      <a href={sourceUrl} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-xs font-bold text-cyan-300 underline">
                        Ver oferta <ExternalLink size={11} />
                      </a>
                    ) : null}
                  </div>

                  <div className="mt-3 grid gap-2 text-xs sm:grid-cols-2 lg:grid-cols-4">
                    <div className="rounded-lg border border-white/[0.05] p-2">
                      <p className="text-white/30">Preço</p>
                      <p className="mt-1 font-bold text-white/75">{item.price != null ? BRL.format(item.price) : "n/d"}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] p-2">
                      <p className="text-white/30">Demanda</p>
                      <p className="mt-1 font-bold text-white/75">{item.sales != null ? `${Math.round(item.sales)} vendas` : "n/d"}</p>
                      <p className="text-[10px] text-white/30">{item.salesVelocity != null ? `velocity +${item.salesVelocity}` : item.velocityStatus || "sem histórico"}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] p-2">
                      <p className="text-white/30">Comissão</p>
                      <p className="mt-1 font-bold text-white/75">{totalCommission > 0 ? `${Math.round(totalCommission * 100) / 100}%` : "n/d"}</p>
                      <p className="text-[10px] text-white/30">{item.discountPercent != null ? `${item.discountPercent}% desconto` : "sem desconto informado"}</p>
                    </div>
                    <div className="rounded-lg border border-white/[0.05] p-2">
                      <p className="text-white/30">Execução sugerida</p>
                      <p className="mt-1 font-bold text-white/75">{item.recommendedChannel || "canal pendente"}</p>
                      <p className="text-[10px] text-white/30">{item.recommendedFormat || "formato pendente"}</p>
                    </div>
                  </div>

                  <div className="mt-3 grid gap-1">
                    {item.determiningReasons.slice(0, 4).map((reason) => (
                      <p key={reason} className="text-xs text-white/40">{reason}</p>
                    ))}
                    {!item.determiningReasons.length ? <p className="text-xs text-white/30">Sem justificativa persistida.</p> : null}
                  </div>
                </div>

                <div className="grid gap-2">
                  <form action={approveTrendTestAction}>
                    <input type="hidden" name="product_id" value={item.id} />
                    <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-black text-emerald-950">
                      <FlaskConical size={14} /> Aprovar teste
                    </button>
                  </form>
                  <form action={ignoreTrendProductAction}>
                    <input type="hidden" name="product_id" value={item.id} />
                    <button type="submit" className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-red-400/25 px-3 py-2 text-xs font-bold text-red-300">
                      <ShieldX size={14} /> Ignorar
                    </button>
                  </form>
                  <div className="rounded-lg border border-white/[0.05] p-2 text-center text-[10px] text-white/35">
                    {item.selectionDecision
                      ? `Decisão humana: ${item.selectionDecision}${item.selectionDecidedAt ? ` · ${new Date(item.selectionDecidedAt).toLocaleString("pt-BR")}` : ""}`
                      : "Aguardando decisão humana"}
                  </div>
                </div>
              </div>
            </article>
          );
        })}
        {!products.length ? (
          <div className="glass-card p-8 text-center text-sm text-white/35">Nenhuma oportunidade comercial no snapshot mais recente.</div>
        ) : null}
      </div>
    </section>
  );
}
