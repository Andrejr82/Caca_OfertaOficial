"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DailyRadarRefreshButton() {
  const router = useRouter();
  const [refreshing, setRefreshing] = useState(false);

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 500);
  }

  return <button type="button" onClick={refresh} disabled={refreshing} className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50">{refreshing ? "Atualizando…" : "Atualizar Radar do Dia"}</button>;
}
