"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

type Props = {
  latestRunId?: string | null;
  latestGeneratedAt?: string | null;
};

type RadarStatus = "requested" | "running" | "completed" | "failed";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 50;

function formatGeneratedAt(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("pt-BR", {
    timeZone: "America/Sao_Paulo",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).format(date);
}

export function DailyRadarRefreshButton({ latestRunId = null, latestGeneratedAt = null }: Props) {
  const router = useRouter();
  const [executing, setExecuting] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function waitForCompletion(runId: string) {
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const statusResponse = await fetch(`/api/trends/execute?runId=${encodeURIComponent(runId)}`, {
        method: "GET",
        cache: "no-store",
      });
      const statusResult = await statusResponse.json();
      if (!statusResponse.ok || !statusResult.ok) {
        throw new Error(statusResult.message || "Falha ao acompanhar o Radar.");
      }

      const status = statusResult.status as RadarStatus;
      if (status === "completed") {
        setMessage("Radar concluído. Carregando o novo snapshot…");
        router.refresh();
        return;
      }
      if (status === "failed") {
        throw new Error(`Radar falhou${statusResult.failureCode ? ` (${statusResult.failureCode})` : ""}.`);
      }

      setMessage(status === "running"
        ? "Radar em processamento na Oracle…"
        : "Radar solicitado; aguardando a Oracle iniciar…");
      await new Promise((resolve) => window.setTimeout(resolve, POLL_INTERVAL_MS));
    }

    setMessage("O Radar continua em processamento. Atualize a tela mais tarde; nenhuma nova solicitação foi criada.");
  }

  async function execute() {
    if (executing) return;
    setExecuting(true);
    setMessage("Registrando solicitação do Radar…");
    try {
      const response = await fetch("/api/trends/execute?refresh=1", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Falha ao solicitar Radar.");

      if (result.status === "completed") {
        setMessage("Radar desta janela já está concluído. Carregando snapshot…");
        router.refresh();
        return;
      }

      const runId = String(result.runId || result.executionId || "").trim();
      if (!runId) throw new Error("A solicitação foi registrada sem identificador de execução.");
      await waitForCompletion(runId);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao solicitar Radar.");
    } finally {
      setExecuting(false);
    }
  }

  function refresh() {
    setRefreshing(true);
    router.refresh();
    window.setTimeout(() => setRefreshing(false), 700);
  }

  const latestTime = formatGeneratedAt(latestGeneratedAt);

  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <button
          type="button"
          onClick={execute}
          disabled={executing}
          className="rounded-lg bg-cyan-500 px-4 py-2 text-xs font-bold text-slate-950 transition hover:bg-cyan-400 disabled:cursor-wait disabled:opacity-50"
        >
          {executing ? "Processando Radar…" : "Solicitar Radar"}
        </button>
        <button
          type="button"
          onClick={refresh}
          disabled={refreshing || executing}
          className="rounded-lg border border-cyan-400/30 bg-cyan-500/10 px-4 py-2 text-xs font-bold text-cyan-200 transition hover:bg-cyan-500/20 disabled:cursor-wait disabled:opacity-50"
        >
          {refreshing ? "Atualizando…" : "Atualizar tela"}
        </button>
      </div>
      {message ? <span className="max-w-xl text-right text-xs text-white/55">{message}</span> : null}
      {latestRunId ? (
        <span className="max-w-xl text-right text-[11px] text-white/30">
          Último snapshot: {latestTime ?? "horário indisponível"} · {latestRunId.slice(0, 8)}
        </span>
      ) : null}
    </div>
  );
}
