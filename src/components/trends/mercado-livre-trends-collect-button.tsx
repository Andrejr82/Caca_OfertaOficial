"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function MercadoLivreTrendsCollectButton() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function collect() {
    setLoading(true);
    setMessage(null);
    try {
      const response = await fetch("/api/trends/mercadolivre", { method: "POST" });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.message || "Falha ao coletar tendências do Mercado Livre.");
      setMessage(`${result.persisted} sinal(is) Mercado Livre atualizado(s).`);
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Falha ao coletar tendências do Mercado Livre.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <button type="button" onClick={collect} disabled={loading} className="rounded-lg border border-amber-400/30 bg-amber-500/10 px-4 py-2 text-xs font-bold text-amber-200 transition hover:bg-amber-500/20 disabled:cursor-wait disabled:opacity-50">
        {loading ? "Coletando…" : "Coletar Mercado Livre"}
      </button>
      {message ? <span className="text-xs text-white/40">{message}</span> : null}
    </div>
  );
}
