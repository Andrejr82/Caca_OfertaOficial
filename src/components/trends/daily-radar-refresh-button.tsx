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
      const radarResponse = await fetch("/api/trends/execute?refresh=1", { method: "POST" });
      const radar = await radarResponse.json();
      if (!radarResponse.ok || !radar.ok) throw new Error(radar.message || "Falha ao executar Radar.");

      const queueResponse = await fetch("/api/trends/approval-queue/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: radar.runId }),
      });
      const queue = await queueResponse.json();
      if (!queueResponse.ok || !queue.ok) {
        throw new Error(`Radar concluído, mas a fila Shopee falhou: ${queue.message || "erro desconhecido"}`);
      }

      setMessage(`Radar concluído · ${queue.searchedIntents ?? 0} tendência(s) pesquisada(s) · ${queue.readyCount ?? 0} pronto(s) para aprovar.`);
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
        {executing ? "Pesquisando e preparando…" : "Executar Radar de Agora"}
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
