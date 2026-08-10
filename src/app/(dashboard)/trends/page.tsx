import { BrainCircuit } from "lucide-react";
import { GoogleTrendsCollectButton } from "@/components/trends/google-trends-collect-button";
import { listTrendOpportunities, listTrendSignals } from "@/lib/trends/queries";

export default async function TrendsPage() {
  const [signals, opportunities] = await Promise.all([listTrendSignals(), listTrendOpportunities()]);

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
          <h2 className="text-sm font-bold text-white/70">Fonte ativa: Google Trends</h2>
          <p className="mt-1 text-xs text-white/30">Região BR · daily trends · sem associação automática de oferta.</p>
        </div>
        <GoogleTrendsCollectButton />
      </section>

      {signals.length > 0 ? (
        <section className="glass-card p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-sm font-bold text-white/70">Sinais coletados</h2>
            <span className="text-xs text-white/30">{signals.length} registro(s)</span>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {signals.map((signal) => (
              <article key={signal.id} className="rounded-lg border border-white/[0.05] p-3">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate text-sm font-bold text-white/80">{signal.term}</h3>
                  <span className="text-[10px] font-bold uppercase text-emerald-400">{signal.trendDirection}</span>
                </div>
                <p className="mt-2 text-xs text-white/35">Força: {signal.trendStrength ?? "n/d"} · Região: {signal.region}</p>
              </article>
            ))}
          </div>
        </section>
      ) : null}

      {opportunities.length === 0 ? (
        <section className="glass-card p-10 text-center">
          <BrainCircuit size={32} className="mx-auto text-white/20" />
          <h2 className="mt-4 text-sm font-bold text-white/60">Nenhuma oportunidade registrada</h2>
          <p className="mt-2 text-sm text-white/30">A área está pronta para receber a primeira fonte de tendência.</p>
        </section>
      ) : (
        <section className="grid gap-3">
          {opportunities.map((opportunity) => (
            <article key={opportunity.id} className="glass-card p-5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <h2 className="font-bold text-white">{opportunity.signalTitle}</h2>
                <span className="rounded-full bg-violet-500/10 px-3 py-1 text-xs font-bold text-violet-300">{opportunity.status}</span>
              </div>
              <p className="mt-3 text-sm text-white/40">Oferta associada: {opportunity.offerId || "ainda não associada"}</p>
            </article>
          ))}
        </section>
      )}
    </div>
  );
}
