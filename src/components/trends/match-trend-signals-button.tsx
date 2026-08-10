"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MatchTrendSignalsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function match() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/trends/match", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Falha no matching.");
      setMessage(`${result.opportunitiesCreated} oportunidade(s): ${result.matchedSignals} sinal(is) com match, ${result.noMatchSignals} sem match.`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha no matching.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={match} disabled={loading} className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-wait disabled:opacity-50">
        {loading ? "Validando ofertas…" : "Buscar ofertas compatíveis"}
      </button>
      {message ? <span className="text-xs text-white/40">{message}</span> : null}
    </div>
  );
}
