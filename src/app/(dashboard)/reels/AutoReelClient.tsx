"use client";

import { useEffect, useState } from "react";
import { Film } from "lucide-react";

import { autoReelStatusLabel, isAutoReelTerminal, type AutoReelStatus } from "@/lib/videos/auto-reel";

type Offer = {
  id: string;
  product_name: string;
  current_price: number;
  platform: string;
  image_url: string | null;
};

type Job = { id: string; status: AutoReelStatus; stage: AutoReelStatus };

export function AutoReelClient({ offers, pollingMs = 3000 }: { offers: Offer[]; pollingMs?: number }) {
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [job, setJob] = useState<Job | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedOffer = offers.find((offer) => offer.id === offerId) ?? null;

  useEffect(() => {
    if (!job || isAutoReelTerminal(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/reels/generate?jobId=${encodeURIComponent(job.id)}`);
        if (!response.ok) return;
        const payload = await response.json() as { job?: Job };
        if (payload.job) setJob(payload.job);
      } catch {
        // A próxima janela de polling tenta novamente sem quebrar a tela.
      }
    }, pollingMs);
    return () => window.clearInterval(timer);
  }, [job, pollingMs]);

  async function generate() {
    if (!offerId || busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reels/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId, style: "demonstrative-reel" }),
      });
      const payload = await response.json() as { job?: Job; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Não foi possível gerar o Reel.");
      setJob(payload.job);
      const scenesResponse = await fetch("/api/reels/scenes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: payload.job.id }),
      });
      const scenesPayload = await scenesResponse.json() as { job?: Job; error?: string };
      if (scenesPayload.job) setJob(scenesPayload.job);
      if (!scenesResponse.ok) throw new Error(scenesPayload.error ?? "Não foi possível gerar as cenas.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o Reel.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-5">
      <div className="mb-5 flex items-start gap-3">
        <Film className="mt-0.5 text-fuchsia-300" size={20} />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-300">Reels Studio Automático</p>
          <h2 className="mt-1 font-bold text-white">Gerar Reel demonstrativo</h2>
          <p className="mt-1 text-xs text-white/50">O job é criado com os dados reais da oferta. A geração visual entra no próximo estágio.</p>
        </div>
      </div>

      <label className="block text-xs text-white/60">Oferta
        <select value={offerId} onChange={(event) => setOfferId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white">
          <option value="">Selecione uma oferta</option>
          {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name} — {offer.platform}</option>)}
        </select>
      </label>

      {selectedOffer && (
        <div className="mt-4 grid gap-4 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[120px_1fr]">
          {selectedOffer.image_url ? <img src={selectedOffer.image_url} alt={selectedOffer.product_name} className="h-28 w-full rounded-lg object-cover" /> : <div className="h-28 rounded-lg bg-white/5" />}
          <div>
            <p className="font-semibold text-white">{selectedOffer.product_name}</p>
            <p className="mt-2 text-sm font-bold text-emerald-300">{selectedOffer.current_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
            <p className="mt-1 text-xs text-white/45">{selectedOffer.platform}</p>
            <p className="mt-2 text-xs text-fuchsia-200">Estilo: Reel demonstrativo</p>
          </div>
        </div>
      )}

      <button onClick={() => void generate()} disabled={busy || !selectedOffer} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-fuchsia-500/20 px-4 py-2 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/30 disabled:opacity-40">
        <Film size={14} /> {busy ? "Criando job…" : "Gerar Reel"}
      </button>
      {job && <p className="mt-3 text-sm text-fuchsia-100">Status: {autoReelStatusLabel(job.stage ?? job.status)}</p>}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}
