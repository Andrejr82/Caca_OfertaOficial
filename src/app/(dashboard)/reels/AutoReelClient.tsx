"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Film } from "lucide-react";

import { autoReelStatusLabel, isAutoReelTerminal, type AutoReelStatus } from "@/lib/videos/auto-reel";

type Offer = {
  id: string;
  product_name: string;
  current_price: number;
  platform: string;
  image_url: string | null;
};

type Job = { id: string; status: AutoReelStatus; stage: AutoReelStatus; video_url?: string | null; metadata?: Record<string, unknown>; offers?: { product_name?: string; current_price?: number; platform?: string } };

export function AutoReelClient({ offers, initialJobs = [], pollingMs = 3000 }: { offers: Offer[]; initialJobs?: Job[]; pollingMs?: number }) {
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [jobs, setJobs] = useState<Job[]>(initialJobs);
  const [job, setJob] = useState<Job | null>(initialJobs[0] ?? null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const activeOperation = useRef<string | null>(null);
  const selectedOffer = offers.find((offer) => offer.id === offerId) ?? null;

  const applyJob = useCallback((nextJob: Job) => {
    setJob(nextJob);
    setJobs((current) => [nextJob, ...current.filter((item) => item.id !== nextJob.id)]);
  }, []);

  useEffect(() => {
    if (!job || isAutoReelTerminal(job.status)) return;
    if (["planning", "generating_visual", "scenes_ready"].includes(job.stage)) {
      const operation = `${job.id}:${job.stage}`;
      if (activeOperation.current === operation) return;
      activeOperation.current = operation;
      const endpoint = job.stage === "scenes_ready" ? "/api/reels/complete" : "/api/reels/scenes";
      void fetch(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: job.id }) })
        .then(async (response) => {
          const payload = await response.json() as { job?: Job; error?: string };
          if (payload.job) applyJob(payload.job);
          if (!response.ok || !payload.job) throw new Error(payload.error ?? "Não foi possível avançar o Reel.");
          setError(null);
        })
        .catch((cause) => setError(cause instanceof Error ? cause.message : "Não foi possível avançar o Reel."))
        .finally(() => { activeOperation.current = null; });
      return;
    }
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`/api/reels/generate?jobId=${encodeURIComponent(job.id)}`);
        if (!response.ok) return;
        const payload = await response.json() as { job?: Job };
        if (payload.job) { setJob(payload.job); setJobs((current) => current.map((item) => item.id === payload.job?.id ? payload.job as Job : item)); }
      } catch {
        // A próxima janela de polling tenta novamente sem quebrar a tela.
      }
    }, pollingMs);
    return () => window.clearInterval(timer);
  }, [applyJob, job, pollingMs]);

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
      applyJob(payload.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível gerar o Reel.");
    } finally {
      setBusy(false);
    }
  }

  async function review(target: Job, action: "approve" | "reject" | "regenerate") {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/reels/review", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ jobId: target.id, action }) });
      const payload = await response.json() as { job?: Job; error?: string };
      if (!response.ok || !payload.job) throw new Error(payload.error ?? "Não foi possível atualizar o Reel.");
      applyJob(payload.job);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Não foi possível atualizar o Reel.");
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
          <p className="mt-1 text-xs text-white/50">O job usa os dados reais da oferta, cenas visuais e Dubbing V2 factual.</p>
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
      {jobs.length > 0 && <div className="mt-4 space-y-3">{jobs.map((item) => <article key={item.id} className="rounded-xl border border-white/10 bg-black/20 p-3"><div className="flex items-center justify-between gap-3"><p className="text-sm font-semibold text-white">{item.offers?.product_name ?? "Reel automático"}</p><span className="text-xs text-fuchsia-200">{autoReelStatusLabel(item.stage ?? item.status)}</span></div>{item.video_url && <video src={item.video_url} controls playsInline preload="metadata" className="mt-3 max-h-[520px] w-full rounded-xl bg-black" />} {["ready_for_review", "approved", "rejected", "failed"].includes(item.stage) && <div className="mt-3 flex flex-wrap gap-2"><button onClick={() => void review(item, "approve")} disabled={item.stage !== "ready_for_review"} className="rounded-lg bg-emerald-500/20 px-3 py-2 text-xs font-bold text-emerald-100 disabled:opacity-40">Aprovar</button><button onClick={() => void review(item, "reject")} disabled={item.stage !== "ready_for_review"} className="rounded-lg bg-red-500/20 px-3 py-2 text-xs font-bold text-red-100 disabled:opacity-40">Rejeitar</button><button onClick={() => void review(item, "regenerate")} className="rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white">Gerar novamente</button></div>}</article>)}</div>}
      {error && <p className="mt-3 text-xs text-red-300">{error}</p>}
    </section>
  );
}
