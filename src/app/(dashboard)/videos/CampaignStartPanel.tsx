"use client";

import { Megaphone, RefreshCw } from "lucide-react";
import { useState } from "react";

type ApprovedJob = {
  id: string;
  offers?: {
    id?: string;
    product_name?: string;
    platform?: string;
  } | null;
};

export function CampaignStartPanel({ jobs }: { jobs: ApprovedJob[] }) {
  const [busyJobId, setBusyJobId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

  async function startCampaign(job: ApprovedJob) {
    setBusyJobId(job.id);
    setMessage(null);
    try {
      const response = await fetch("/api/campaigns/start", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ videoJobId: job.id }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage({ text: data.error ?? "Não foi possível iniciar a campanha.", error: true });
        return;
      }
      setMessage({
        text: data.created
          ? "Campanha iniciada. Janela inicial de 48h ativa."
          : "Esta oferta já possui uma campanha aberta; a campanha existente foi reutilizada.",
      });
    } catch {
      setMessage({ text: "Não foi possível iniciar a campanha.", error: true });
    } finally {
      setBusyJobId(null);
    }
  }

  if (jobs.length === 0) return null;

  return (
    <section className="mt-6 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5">
      <div className="mb-4 flex items-center gap-3">
        <Megaphone className="text-emerald-300" size={20} />
        <div>
          <h2 className="font-bold text-white">Iniciar campanha</h2>
          <p className="mt-1 text-xs text-white/45">Disponível apenas para vídeos já aprovados.</p>
        </div>
      </div>

      <div className="space-y-3">
        {jobs.map((job) => (
          <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3">
            <div>
              <p className="text-sm font-semibold text-white">{job.offers?.product_name ?? "Oferta aprovada"}</p>
              <p className="mt-1 text-xs text-white/40">{job.offers?.platform ?? "Marketplace"}</p>
            </div>
            <button
              type="button"
              onClick={() => startCampaign(job)}
              disabled={busyJobId !== null}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40"
            >
              {busyJobId === job.id ? <RefreshCw size={14} className="animate-spin" /> : <Megaphone size={14} />}
              {busyJobId === job.id ? "Iniciando…" : "Iniciar campanha desta oferta"}
            </button>
          </div>
        ))}
      </div>

      {message && (
        <p className={`mt-4 rounded-xl border px-4 py-3 text-sm ${message.error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>
          {message.text}
        </p>
      )}
    </section>
  );
}
