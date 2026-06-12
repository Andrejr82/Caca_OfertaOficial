import { Badge } from "@/components/ui/badge";
import { MetricCard } from "@/components/dashboard/metric-card";
import { ConversionFunnel } from "@/components/dashboard/conversion-funnel";
import { TrendsAction } from "@/components/dashboard/trends-action";
import { getDashboardData } from "@/lib/offers/queries";
import { ShoppingBag, CheckCircle2, Send, Coins, Star } from "lucide-react";

function money(value: number) {
  return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(value);
}

function getGreeting(): string {
  const hour = new Date().getHours();
  if (hour < 12) return "Bom dia";
  if (hour < 18) return "Boa tarde";
  return "Boa noite";
}

// Generate mock sparkline data based on a base value
function generateSparkData(base: number): number[] {
  const points = 12;
  return Array.from({ length: points }, (_, i) => {
    const variation = Math.sin(i * 0.8) * (base * 0.15) + Math.random() * (base * 0.1);
    return Math.max(0, base * 0.6 + variation + (i / points) * (base * 0.3));
  });
}

export default async function DashboardPage() {
  const data = await getDashboardData();

  const funnelStages = [
    { label: "Total de Ofertas", value: data.totals.offers || 0, color: "#38bdf8" },
    { label: "Aprovadas", value: data.totals.approved || 0, color: "#10b981" },
    { label: "Publicadas", value: data.totals.posted || 0, color: "#fbbf24" },
    {
      label: "Comissão Gerada",
      value: Math.round(data.totals.estimatedCommission || 0),
      color: "#34d399"
    }
  ];

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">
          {getGreeting()} 👋
        </h1>
        <p className="mt-1 text-sm text-white/40">
          Sua operação, canais e comissões em uma visão rápida.
        </p>
      </header>

      {/* Trends Action */}
      <TrendsAction />

      {/* KPI Grid */}
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          label="Total de ofertas"
          value={data.totals.offers}
          icon={ShoppingBag}
          accentColor="#38bdf8"
          sparkData={generateSparkData(data.totals.offers || 5)}
          trend={{ value: 12.3, isPositive: true }}
        />
        <MetricCard
          label="Aprovadas"
          value={data.totals.approved}
          icon={CheckCircle2}
          accentColor="#10b981"
          sparkData={generateSparkData(data.totals.approved || 3)}
          trend={{ value: 8.1, isPositive: true }}
        />
        <MetricCard
          label="Publicadas"
          value={data.totals.posted}
          icon={Send}
          accentColor="#fbbf24"
          sparkData={generateSparkData(data.totals.posted || 2)}
        />
        <MetricCard
          label="Comissão estimada"
          value={money(data.totals.estimatedCommission)}
          detail={`Confirmada: ${money(data.totals.confirmedCommission)}`}
          icon={Coins}
          accentColor="#34d399"
          sparkData={generateSparkData(data.totals.estimatedCommission || 100)}
          trend={{ value: 5.7, isPositive: true }}
        />
      </section>

      {/* Conversion Funnel */}
      <ConversionFunnel stages={funnelStages} />

      {/* Bento Layout */}
      <section className="grid gap-4 lg:grid-cols-5">
        {/* Top Offers — 3 columns */}
        <div className="glass-card p-5 lg:col-span-3 animate-slideUp stagger-1">
          <div className="flex items-center justify-between border-b border-white/[0.04] pb-3 mb-4">
            <div className="flex items-center gap-2">
              <Star size={16} className="text-amber-400" />
              <h2 className="text-sm font-bold text-white/70">Ofertas com Maior Score</h2>
            </div>
            <span className="text-[10px] font-bold text-white/25 uppercase tracking-wider">
              Top {data.topOffers.length}
            </span>
          </div>
          <div className="space-y-2">
            {data.topOffers.length ? (
              data.topOffers.map((offer, index) => (
                <div
                  key={offer.id}
                  className="flex items-center gap-3 rounded-lg border border-white/[0.03] p-3 transition-colors hover:bg-white/[0.02]"
                >
                  <span className="grid h-7 w-7 flex-shrink-0 place-items-center rounded-lg bg-emerald-500/10 text-xs font-extrabold text-emerald-400">
                    {index + 1}
                  </span>
                  <span className="flex-1 truncate text-sm font-semibold text-white/80">
                    {offer.product_name}
                  </span>
                  <Badge label={offer.platform} />
                  <span className="text-sm font-extrabold tabular-nums text-emerald-400">
                    {offer.score}/10
                  </span>
                </div>
              ))
            ) : (
              <p className="py-6 text-center text-sm text-white/30">
                Cadastre ofertas para popular este painel.
              </p>
            )}
          </div>
        </div>

        {/* Platform & Channel Distribution — 2 columns */}
        <div className="space-y-4 lg:col-span-2">
          {/* By Platform */}
          <div className="glass-card p-5 animate-slideUp stagger-2">
            <h2 className="mb-4 text-sm font-bold text-white/50 uppercase tracking-[0.08em]">
              Por Plataforma
            </h2>
            <div className="space-y-3">
              {Object.keys(data.byPlatform).length > 0 ? (
                Object.entries(data.byPlatform).map(([platform, count]) => {
                  const percentage = data.totals.offers > 0 ? (count / data.totals.offers) * 100 : 0;
                  return (
                    <div key={platform}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/60">{platform}</span>
                        <span className="text-xs font-bold tabular-nums text-emerald-400">
                          {count} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-emerald-400 transition-all duration-700"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-4 text-center text-xs text-white/25">
                  Nenhuma oferta cadastrada.
                </p>
              )}
            </div>
          </div>

          {/* By Channel */}
          <div className="glass-card p-5 animate-slideUp stagger-3">
            <h2 className="mb-4 text-sm font-bold text-white/50 uppercase tracking-[0.08em]">
              Por Canal
            </h2>
            <div className="space-y-3">
              {Object.keys(data.byChannel).length > 0 ? (
                Object.entries(data.byChannel).map(([channel, count]) => {
                  const totalLinks = data.links.length;
                  const percentage = totalLinks > 0 ? (count / totalLinks) * 100 : 0;
                  const channelName = channel.charAt(0).toUpperCase() + channel.slice(1);
                  return (
                    <div key={channel}>
                      <div className="mb-1 flex items-center justify-between">
                        <span className="text-xs font-semibold text-white/60">{channelName}</span>
                        <span className="text-xs font-bold tabular-nums text-sky-400">
                          {count} ({percentage.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/[0.04]">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-sky-500 to-sky-400 transition-all duration-700"
                          style={{ width: `${percentage}%` }}
                        />
                      </div>
                    </div>
                  );
                })
              ) : (
                <p className="py-4 text-center text-xs text-white/25">
                  Nenhum link rastreado.
                </p>
              )}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
