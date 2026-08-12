import { CheckCircle2, ExternalLink, ShieldCheck, XCircle } from "lucide-react";
import { approveTrendOfferAction, rejectTrendOfferAction } from "@/lib/trends/approval-actions";
import type { Offer } from "@/types/domain";

const BRL = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });

function metric(offer: Offer, key: string): number | null {
  const value = offer.explainability?.marketplace_metrics?.[key];
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function TrendApprovalQueue({ offers }: { offers: Offer[] }) {
  return (
    <section className="glass-card p-5" id="pronto-para-aprovar">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <ShieldCheck size={18} className="text-emerald-300" />
            <h2 className="text-base font-extrabold text-white">Pronto para aprovar ({offers.length})</h2>
          </div>
      <p className="mt-1 text-xs text-white/35">Shopee e Mercado Livre validados e ranqueados. Aprovar apenas seleciona a oferta; nenhuma publicação é automática.</p>
        </div>
        <a href="/offers" className="text-xs font-bold text-cyan-300 underline">Abrir operação de ofertas</a>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-2">
        {offers.map((offer) => {
          const requestedAt = new Date().toISOString();
          const trendTerm = String(offer.explainability?.product_term || "Tendência");
          const rankingPosition = Number(offer.explainability?.ranking_position || 0);
          const rating = metric(offer, "rating");
          const sales = metric(offer, "sales");
          const discount = metric(offer, "discount");
          return (
            <article key={offer.id} className="grid grid-cols-[88px_1fr] gap-3 rounded-xl border border-emerald-400/15 bg-emerald-500/[0.04] p-3">
              <div className="h-[88px] overflow-hidden rounded-lg bg-white/5">
                {offer.image_url ? <img src={offer.image_url} alt={offer.product_name} className="h-full w-full object-cover" /> : null}
              </div>
              <div className="min-w-0">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-emerald-300/70">#{rankingPosition || "–"} · {trendTerm}</p>
                    <h3 className="mt-1 line-clamp-2 text-sm font-bold text-white">{offer.product_name}</h3>
                  </div>
                  <span className="shrink-0 rounded-md bg-white/5 px-2 py-1 text-xs font-black text-white/70">{Number(offer.score || 0).toFixed(1)}</span>
                </div>
                <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-white/40">
                  <span className="font-bold text-white/75">{BRL.format(Number(offer.current_price || 0))}</span>
                  {rating != null ? <span>★ {rating.toFixed(1)}</span> : null}
                  {sales != null ? <span>{Math.round(sales)} vendas</span> : null}
                  {discount != null && discount > 0 ? <span>{discount}% desc.</span> : null}
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <form action={approveTrendOfferAction}>
                    <input type="hidden" name="offer_id" value={offer.id} />
                    <input type="hidden" name="platform" value={offer.platform} />
                    <input type="hidden" name="command_id" value={`trend-curation:${offer.id}:select:${requestedAt}`} />
                    <input type="hidden" name="requested_at" value={requestedAt} />
                    <button type="submit" className="inline-flex items-center gap-1 rounded-lg bg-emerald-400 px-3 py-1.5 text-xs font-black text-emerald-950">
                      <CheckCircle2 size={13} /> Aprovar
                    </button>
                  </form>
                  <form action={rejectTrendOfferAction}>
                    <input type="hidden" name="offer_id" value={offer.id} />
                    <input type="hidden" name="platform" value={offer.platform} />
                    <input type="hidden" name="command_id" value={`trend-curation:${offer.id}:reject:${requestedAt}`} />
                    <input type="hidden" name="requested_at" value={requestedAt} />
                    <button type="submit" className="inline-flex items-center gap-1 rounded-lg border border-red-400/25 px-3 py-1.5 text-xs font-bold text-red-300">
                      <XCircle size={13} /> Descartar
                    </button>
                  </form>
                  <a href={offer.original_url} target="_blank" rel="noreferrer" className="ml-auto inline-flex items-center gap-1 text-xs text-cyan-300 underline">
                    {offer.platform} <ExternalLink size={11} />
                  </a>
                </div>
              </div>
            </article>
          );
        })}
        {!offers.length ? (
          <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-white/35 lg:col-span-2">
            Execute o Radar para pesquisar, validar e preparar produtos dos dois marketplaces.
          </div>
        ) : null}
      </div>
    </section>
  );
}
