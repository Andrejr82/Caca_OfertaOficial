"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { readApiJson } from "@/lib/http/read-api-json";

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
      const radar = await readApiJson<{ ok?: boolean; runId?: string; message?: string }>(radarResponse);
      if (!radarResponse.ok || !radar.ok) throw new Error(radar.message || "Falha ao executar Radar.");

      const queueResponse = await fetch("/api/trends/approval-queue/execute", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ runId: radar.runId }),
      });
      const queue = await readApiJson<{
        ok?: boolean;
        message?: string;
        errors?: number;
        counters?: Record<string, { found?: number }>;
        candidateCounts?: Record<string, { raw?: number; accepted?: number }>;
        persisted?: Record<string, { readyOfferIds?: string[] }>;
      }>(queueResponse);
      if (!queueResponse.ok || !queue.ok) {
        throw new Error(`Radar concluído, mas a fila multimarketplace falhou: ${queue.message || "erro desconhecido"}`);
      }

      const shopee = queue.candidateCounts?.Shopee ?? { raw: 0 };
      const mercadoLivre = queue.candidateCounts?.["Mercado Livre"] ?? { raw: 0 };
      const readyShopee = queue.persisted?.Shopee?.readyOfferIds?.length ?? 0;
      const readyMercadoLivre = queue.persisted?.["Mercado Livre"]?.readyOfferIds?.length ?? 0;
      const partial = Number(queue.errors ?? 0) > 0 ? " · resultado parcial" : "";
      setMessage(`Radar concluído · Shopee: ${shopee.raw ?? 0} encontrados / ${readyShopee} prontos · Mercado Livre: ${mercadoLivre.raw ?? 0} encontrados / ${readyMercadoLivre} prontos${partial}.`);
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
      {message ? <span aria-live="polite" className="text-xs text-white/40">{message}</span> : null}
    </div>
  );
}
