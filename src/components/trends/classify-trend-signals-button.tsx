"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function ClassifyTrendSignalsButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function classify() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/trends/classify", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Falha ao classificar sinais.");
      setMessage(`${result.classified} classificado(s): ${result.eligible} elegível(is), ${result.rejected} rejeitado(s).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao classificar sinais.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={classify} disabled={loading} className="rounded-lg border border-indigo-400/30 bg-indigo-500/10 px-4 py-2 text-xs font-bold text-indigo-200 transition hover:bg-indigo-500/20 disabled:cursor-wait disabled:opacity-50">
        {loading ? "Classificando…" : "Classificar sinais"}
      </button>
      {message ? <span className="text-xs text-white/40">{message}</span> : null}
    </div>
  );
}
