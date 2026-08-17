import { BrainCircuit } from "lucide-react";
import { DailyRadarRefreshButton } from "@/components/trends/daily-radar-refresh-button";
import { TrendsCommercialSelectionDesk } from "@/components/trends/trends-commercial-selection-desk";
import { listLatestTrendRadarSnapshot } from "@/lib/trends/radar-queries";

export default async function TrendsPage() {
  const latestSnapshot = await listLatestTrendRadarSnapshot();

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-violet-500 to-indigo-600 shadow-lg shadow-violet-500/20">
            <BrainCircuit size={20} className="text-white" />
          </span>
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-white">Tendências IA</h1>
            <p className="text-xs text-white/35">Mesa de seleção comercial baseada no snapshot pronto da Oracle.</p>
          </div>
        </div>
        <DailyRadarRefreshButton />
      </header>

      <TrendsCommercialSelectionDesk snapshot={latestSnapshot} />
    </div>
  );
}
