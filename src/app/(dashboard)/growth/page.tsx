import { getGrowthMetrics } from "@/lib/analytics/growth-queries";
import { Badge } from "@/components/ui/badge";
import { TrendingUp, BarChart3, Smartphone, Monitor, Link2, DollarSign, Activity, Calendar } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic"; // Bypass cache for up-to-date metrics
export const revalidate = 0;

export default async function GrowthDashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ days?: string }>;
}) {
  const params = await searchParams;
  const days = params.days ? parseInt(params.days, 10) : 30;
  const data = await getGrowthMetrics(days);

  if (!data) {
    return <div className="p-10 text-white/50 text-center">Nenhum dado de tracking encontrado.</div>;
  }

  const { trafficTrends, sourceData, deviceData, funnelData, totalClicks, totalSales } = data;

  const getSourceTone = (source: string) => {
    if (source === 'instagram') return 'instagram';
    if (source === 'telegram') return 'telegram';
    if (source === 'whatsapp') return 'whatsapp';
    if (source === 'facebook') return 'facebook';
    return 'neutral';
  };

  return (
    <div className="grid gap-6 animate-fadeIn pb-10">
      {/* Header */}
      <header className="flex items-center gap-3 mb-2">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg shadow-indigo-500/20">
          <Activity size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Growth Analytics</h1>
          <p className="text-xs text-white/40">Visão consolidada de tráfego, fontes e funil de conversão real em {days} dias.</p>
        </div>
        
        <div className="ml-auto flex items-center gap-2 bg-white/5 p-1 rounded-lg border border-white/[0.04]">
          {[7, 15, 30, 90].map(d => (
            <Link 
              key={d}
              href={`?days=${d}`}
              className={`px-3 py-1.5 text-xs font-semibold rounded-md transition-colors ${
                days === d ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/80'
              }`}
            >
              {d} Dias
            </Link>
          ))}
        </div>
      </header>

      {/* Global KPIs */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="glass-card p-5 border border-white/[0.04]">
          <h3 className="text-xs font-bold text-white/40 uppercase tracking-widest mb-1 flex items-center gap-2">
            <Link2 size={14} /> Total de Cliques
          </h3>
          <p className="text-3xl font-black text-white">{totalClicks.toLocaleString('pt-BR')}</p>
        </div>
        <div className="glass-card p-5 border border-emerald-500/10">
          <h3 className="text-xs font-bold text-emerald-400/70 uppercase tracking-widest mb-1 flex items-center gap-2">
            <DollarSign size={14} /> Vendas Convertidas
          </h3>
          <p className="text-3xl font-black text-emerald-400">{totalSales.toLocaleString('pt-BR')}</p>
        </div>
        <div className="glass-card p-5 border border-purple-500/10">
          <h3 className="text-xs font-bold text-purple-400/70 uppercase tracking-widest mb-1 flex items-center gap-2">
            <TrendingUp size={14} /> Conversão Média Global
          </h3>
          <p className="text-3xl font-black text-purple-400">
            {totalClicks > 0 ? ((totalSales / totalClicks) * 100).toFixed(2) : 0}%
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mt-2">
        {/* Source Breakdown */}
        <section className="glass-card p-6 border border-white/[0.04]">
          <div className="border-b border-white/[0.04] pb-3 mb-5">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em] flex items-center gap-2">
              <BarChart3 size={16} /> Performance por Canal
            </h2>
          </div>
          <div className="space-y-4">
            {sourceData.length === 0 ? (
               <p className="text-sm text-white/30 text-center py-4">Sem dados</p>
            ) : sourceData.map((item) => {
              const percentage = totalClicks > 0 ? (item.count / totalClicks) * 100 : 0;
              return (
                <div key={item.source} className="group">
                  <div className="flex justify-between text-sm mb-1.5">
                    <span className="font-semibold text-white/80 capitalize">{item.source}</span>
                    <span className="text-white/50 font-medium">{item.count} cliques ({percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2.5 w-full bg-white/5 rounded-full overflow-hidden">
                    <div 
                      className={`h-full rounded-full transition-all duration-1000 ${
                        item.source === 'telegram' ? 'bg-[#0088cc]' : 
                        item.source === 'instagram' ? 'bg-gradient-to-r from-[#f09433] via-[#dc2743] to-[#bc1888]' : 
                        item.source === 'whatsapp' ? 'bg-[#25D366]' : 'bg-white/30'
                      }`}
                      style={{ width: `${percentage}%` }}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Device Breakdown */}
        <section className="glass-card p-6 border border-white/[0.04]">
          <div className="border-b border-white/[0.04] pb-3 mb-5">
            <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em] flex items-center gap-2">
              <Smartphone size={16} /> Tráfego por Dispositivo
            </h2>
          </div>
          <div className="flex flex-col justify-center h-full pb-8">
            {deviceData.length === 0 ? (
               <p className="text-sm text-white/30 text-center py-4">Sem dados</p>
            ) : (
              <div className="flex w-full h-8 rounded-lg overflow-hidden bg-white/5 gap-[2px]">
                {deviceData.map(item => {
                  const percentage = totalClicks > 0 ? (item.count / totalClicks) * 100 : 0;
                  return (
                    <div 
                      key={item.device} 
                      className={`h-full flex items-center justify-center text-[10px] font-bold ${
                        item.device === 'mobile' ? 'bg-blue-500/80 text-white' : 
                        item.device === 'desktop' ? 'bg-purple-500/80 text-white' : 
                        'bg-white/20 text-white/70'
                      }`}
                      style={{ width: `${percentage}%` }}
                      title={`${item.device}: ${percentage.toFixed(1)}%`}
                    >
                      {percentage > 15 ? `${percentage.toFixed(0)}%` : ''}
                    </div>
                  );
                })}
              </div>
            )}
            
            <div className="flex gap-6 mt-6 justify-center">
              {deviceData.map(item => (
                <div key={item.device} className="flex items-center gap-2">
                  <div className={`w-3 h-3 rounded-full ${
                        item.device === 'mobile' ? 'bg-blue-500/80' : 
                        item.device === 'desktop' ? 'bg-purple-500/80' : 'bg-white/20'
                  }`} />
                  <span className="text-sm text-white/70 capitalize flex items-center gap-1.5">
                    {item.device === 'mobile' ? <Smartphone size={14} /> : <Monitor size={14} />}
                    {item.device} ({item.count})
                  </span>
                </div>
              ))}
            </div>
          </div>
        </section>
      </div>

      {/* Funnel Table: A Mina de Ouro */}
      <section className="glass-card p-6 border border-white/[0.04] mt-2">
        <div className="border-b border-white/[0.04] pb-3 mb-5">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em] flex items-center gap-2">
            <TrendingUp size={16} /> Funil Profundo: Conversão por Campanha
          </h2>
          <p className="text-xs text-white/30 mt-1">Comparativo de performance entre ofertas e canais. Descubra o que converte.</p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.04] bg-white/[0.01]">
                <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Produto</th>
                <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Canal</th>
                <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/30">Cliques</th>
                <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/30">Vendas</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-white/30">Receita Total</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-emerald-400/80">Conversão (CR%)</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-purple-400/80">Rec. / Clique</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-sm">
              {funnelData.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-white/30 text-sm">Nenhuma campanha registrada no período.</td>
                </tr>
              ) : (
                funnelData.map((row) => (
                  <tr key={row.id} className="transition-colors hover:bg-white/[0.02]">
                    <td className="py-3 px-4 font-semibold text-white/70 max-w-[200px] truncate" title={row.productName}>
                      {row.productName}
                    </td>
                    <td className="py-3 px-4">
                      <Badge label={row.channel} tone={getSourceTone(row.channel) as any} />
                    </td>
                    <td className="py-3 px-4 text-center font-bold text-white/50 tabular-nums">{row.clicks}</td>
                    <td className="py-3 px-4 text-center font-bold text-white/80 tabular-nums">{row.sales}</td>
                    <td className="py-3 px-4 text-right font-black text-emerald-400 tabular-nums">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.revenue)}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <div className="w-16 h-1.5 bg-white/5 rounded-full overflow-hidden">
                          <div 
                            className="h-full bg-emerald-500 rounded-full" 
                            style={{ width: `${Math.min(row.conversionRate * 5, 100)}%` }} // Escala visual 20% = 100% da barra
                          />
                        </div>
                        <span className="font-extrabold text-white tabular-nums min-w-[4ch]">{row.conversionRate.toFixed(1)}%</span>
                      </div>
                    </td>
                    <td className="py-3 px-4 text-right font-bold text-purple-400 tabular-nums">
                      {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(row.revenuePerClick)}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
