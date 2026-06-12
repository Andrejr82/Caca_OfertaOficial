import { generateAffiliateLinkAction } from "@/lib/offers/actions";
import { listOffers, getTrackingReports } from "@/lib/offers/queries";
import { channels } from "@/types/domain";
import { Button } from "@/components/ui/button";
import { TrackingForm } from "./tracking-form";
import { Field, Select } from "@/components/ui/field";
import { Badge } from "@/components/ui/badge";
import { ExternalLink, Link2, TrendingUp, TrendingDown } from "lucide-react";

export default async function TrackingPage() {
  const offers = await listOffers();
  const reports = await getTrackingReports();

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-cyan-500 to-blue-600 shadow-lg shadow-cyan-500/20">
          <Link2 size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Tracking</h1>
          <p className="text-xs text-white/35">Gere links de afiliado com rastreamento de sub_id e parâmetros UTM customizados por canal.</p>
        </div>
      </header>

      {/* Link Generator Form */}
      <section className="glass-card p-5">
        <div className="border-b border-white/[0.04] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Gerador de Link Rastreado</h2>
        </div>
        <TrackingForm offers={offers as any} />
      </section>

      {/* Reports Table */}
      <section className="glass-card p-5">
        <div className="border-b border-white/[0.04] pb-3 mb-4">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">Links Gerados & Relatório de Performance</h2>
          <p className="text-xs text-white/25 mt-1">Estatísticas consolidadas de desempenho para cada canal e link.</p>
        </div>

        <div className="overflow-x-auto rounded-lg border border-white/[0.04]">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/[0.04]">
                <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Canal</th>
                <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Produto</th>
                <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Plataforma</th>
                <th className="py-3 px-4 text-[10px] font-bold uppercase tracking-wider text-white/30">Link Trackeado</th>
                <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/30">Cliques</th>
                <th className="py-3 px-4 text-center text-[10px] font-bold uppercase tracking-wider text-white/30">Conversões</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-white/30">Comissão</th>
                <th className="py-3 px-4 text-right text-[10px] font-bold uppercase tracking-wider text-white/30">ROI Est.</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/[0.03] text-sm">
              {reports.length ? (
                reports.map((report) => {
                  const isPositive = report.roi >= 0;
                  const channelTone = report.channel === "instagram" ? "instagram"
                    : report.channel === "telegram" ? "telegram"
                    : report.channel === "facebook" ? "facebook"
                    : report.channel === "whatsapp" ? "whatsapp"
                    : "neutral";
                  return (
                    <tr key={report.id} className="transition-colors hover:bg-white/[0.02]">
                      <td className="py-3 px-4">
                        <Badge label={report.channel} tone={channelTone as any} />
                      </td>
                      <td className="py-3 px-4 font-semibold text-white/70 max-w-xs truncate" title={report.productName}>
                        {report.productName}
                      </td>
                      <td className="py-3 px-4">
                        <Badge label={report.platform} />
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate">
                        <a
                          href={report.trackedUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-xs text-emerald-400 hover:underline font-semibold"
                        >
                          {report.trackedUrl}
                          <ExternalLink size={10} />
                        </a>
                      </td>
                      <td className="py-3 px-4 text-center font-bold text-white/60 tabular-nums">{report.clicks}</td>
                      <td className="py-3 px-4 text-center font-bold text-white/60 tabular-nums">{report.conversions}</td>
                      <td className="py-3 px-4 text-right font-extrabold text-emerald-400 tabular-nums">
                        {new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(report.revenue)}
                      </td>
                      <td className={`py-3 px-4 text-right font-extrabold tabular-nums ${isPositive ? "text-emerald-400" : "text-red-400"}`}>
                        <span className="inline-flex items-center gap-0.5">
                          {isPositive ? <TrendingUp size={12} /> : <TrendingDown size={12} />}
                          {report.roi.toFixed(0)}%
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-10 text-center text-sm text-white/25">
                    Nenhum link rastreado gerado para exibir relatórios.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
