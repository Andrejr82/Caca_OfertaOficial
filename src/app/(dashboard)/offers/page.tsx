import { Badge } from "@/components/ui/badge";
import { OfferForm } from "@/components/offers/offer-form";
import { listOffersWithDraftStatus } from "@/lib/offers/queries";
import { ShoppingBag } from "lucide-react";
import { OffersClient } from "./OffersClient";

export default async function OffersPage() {
  const offers = await listOffersWithDraftStatus();

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
      <OffersClient initialOffers={offers} />
    </div>
  );
}
