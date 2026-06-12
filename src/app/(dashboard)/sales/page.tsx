import { createSaleAction } from "@/lib/offers/actions";
import { listAffiliateLinks, listOffers, listSales } from "@/lib/offers/queries";
import { SalesDashboard } from "@/components/dashboard/sales-dashboard";
import { Wallet } from "lucide-react";

export default async function SalesPage() {
  const [offers, links, sales] = await Promise.all([
    listOffers(),
    listAffiliateLinks(),
    listSales()
  ]);

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-500 to-teal-600 shadow-lg shadow-emerald-500/20">
          <Wallet size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Painel de Vendas</h1>
          <p className="text-xs text-white/35">Análise detalhada de faturamento, comissões de afiliados e taxa de conversão.</p>
        </div>
      </header>

      <SalesDashboard
        initialSales={sales}
        offers={offers}
        links={links}
        createSaleAction={createSaleAction}
      />
    </div>
  );
}
