"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function GoogleTrendsCollectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function collect() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/trends/google", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Falha ao coletar sinais.");
      setMessage(`${result.persisted} sinal(is) Google Trends atualizado(s).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao coletar sinais.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={collect} disabled={loading} className="rounded-lg bg-violet-500 px-4 py-2 text-xs font-bold text-white transition hover:bg-violet-400 disabled:cursor-wait disabled:opacity-50">
        {loading ? "Coletando…" : "Coletar Google Trends"}
      </button>
      {message ? <span className="text-xs text-white/40">{message}</span> : null}
    </div>
  );
}
