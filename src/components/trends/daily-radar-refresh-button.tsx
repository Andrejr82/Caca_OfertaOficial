"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DailyRadarRefreshButton() {
  const router = useRouter();
  const [executing, setExecuting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function execute() {
    setExecuting(true);
    setMessage(null);
    try {
      const response = await fetch("/api/trends/execute", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Falha ao executar Radar.");
      setMessage(result.reused ? "Radar de hoje já concluído." : `Radar concluído com ${result.products ?? 0} produto(s).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao executar Radar.");
    } finally {
      setExecuting(false);
    }
  }

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 500);
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button
        type="button"
        onClick={execute}
        disabled={executing}
        className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-50"
      >
        {executing ? "Executando Radar…" : "Executar Radar de Hoje"}
      </button>
      <button
        type="button"
        onClick={refresh}
        disabled={refreshing}
        className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50"
      >
        {refreshing ? "Atualizando…" : "Atualizar tela"}
      </button>
      {message ? <span className="text-xs text-white/40">{message}</span> : null}
    </div>
  );
}
