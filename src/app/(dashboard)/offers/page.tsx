import { Badge } from "@/components/ui/badge";
import { OfferForm } from "@/components/offers/offer-form";
import { listOffers } from "@/lib/offers/queries";
import { ShoppingBag } from "lucide-react";

export default async function OffersPage() {
  const offers = await listOffers();

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-lg shadow-amber-500/20">
          <ShoppingBag size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Ofertas</h1>
          <p className="text-xs text-white/35">Cadastre produtos, calcule score e prepare publicação.</p>
        </div>
        {offers.length > 0 && (
          <span className="ml-auto grid h-7 min-w-7 place-items-center rounded-lg bg-amber-500/15 px-2 text-xs font-extrabold text-amber-400">
            {offers.length}
          </span>
        )}
      </header>

      {/* Form */}
      <OfferForm />

      {/* Offers List */}
      <section className="glass-card p-5 w-full overflow-hidden flex flex-col">
        <div className="border-b border-white/[0.04] pb-3 mb-4 flex-shrink-0">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Últimas Ofertas</h2>
        </div>
        <div className="overflow-x-auto pb-4 w-full">
          <div className="space-y-2 min-w-[750px]">
            {offers.length ? offers.map((offer, index) => (
              <div
                key={offer.id}
                className="flex items-center gap-3 rounded-lg border border-white/[0.03] p-3 transition-colors hover:bg-white/[0.02] animate-fadeIn"
                style={{ animationDelay: `${index * 50}ms` }}
              >
                <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-white/[0.04] text-xs font-extrabold text-white/30">
                  {index + 1}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-white/80 truncate">{offer.product_name}</p>
                  <p className="text-[11px] text-white/30">{offer.category || "Sem categoria"}</p>
                </div>
                <Badge label={offer.platform} />
                <Badge label={offer.status} tone={offer.status === "approved" || offer.status === "posted" ? "good" : "neutral"} />
                <span className="text-sm font-extrabold tabular-nums text-emerald-400 mr-2">{offer.score}/10</span>
                
                <a 
                  href={`/publish?url=${encodeURIComponent(offer.original_url || "")}`}
                  className="grid h-8 place-items-center rounded-lg bg-blue-600 hover:bg-blue-500 px-3 text-xs font-bold text-white transition-colors flex-shrink-0"
                >
                  Publicar
                </a>
              </div>
            )) : (
              <p className="py-6 text-center text-sm text-white/30">Nenhuma oferta cadastrada.</p>
            )}
          </div>
        </div>
      </section>
    </div>
  );
}
