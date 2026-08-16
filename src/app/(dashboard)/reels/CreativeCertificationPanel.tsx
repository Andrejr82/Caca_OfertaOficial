"use client";

import { useMemo, useState } from "react";
import { ShieldCheck } from "lucide-react";

type Job = {
  id: string;
  status: string;
  metadata?: Record<string, any>;
  offers?: { product_name?: string } | Array<{ product_name?: string }>;
};

type RightsStatus = "owned" | "seller_authorized" | "creator_authorized" | "official_reusable";

function productName(job: Job) {
  const offer = Array.isArray(job.offers) ? job.offers[0] : job.offers;
  return offer?.product_name ?? job.id;
}

export function CreativeCertificationPanel({ jobs }: { jobs: Job[] }) {
  const candidates = useMemo(() => jobs.filter((job) => ["ready", "approved"].includes(job.status)), [jobs]);
  const [jobId, setJobId] = useState(candidates[0]?.id ?? "");
  const [rightsStatus, setRightsStatus] = useState<RightsStatus | "">("");
  const [productVisible, setProductVisible] = useState(false);
  const [demonstratesUse, setDemonstratesUse] = useState(false);
  const [strongHook, setStrongHook] = useState(false);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ score: number; grade: string } | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function certify() {
    if (!jobId || !rightsStatus) {
      setMessage("Selecione o vídeo e confirme a origem autorizada.");
      return;
    }
    setBusy(true);
    setMessage(null);
    setResult(null);
    try {
      const response = await fetch(`/api/videos/jobs/${jobId}/creative`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rightsStatus, productVisible, demonstratesUse, strongHook }),
      });
      const data = await response.json();
      if (!response.ok) {
        setMessage(data.error ?? "Não foi possível certificar o criativo.");
        return;
      }
      setResult({ score: data.creativeCandidate.score, grade: data.creativeCandidate.grade });
      setMessage("Criativo certificado. A aprovação do vídeo está liberada.");
    } catch {
      setMessage("Falha inesperada ao certificar o criativo.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mb-8 rounded-2xl border border-cyan-400/20 bg-cyan-500/[0.04] p-5">
      <div className="mb-4 flex items-center gap-2">
        <ShieldCheck size={18} className="text-cyan-300" />
        <div>
          <h2 className="font-bold text-white">Certificação do criativo</h2>
          <p className="text-xs text-white/45">Confirme o direito de uso e os sinais visuais antes da aprovação social.</p>
        </div>
      </div>

      {candidates.length === 0 && (
        <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.03] p-4" role="status">
          <p className="text-sm font-semibold text-white">Nenhum vídeo pronto para certificação no momento.</p>
          <p className="mt-1 text-xs text-white/55">A certificação ficará disponível quando existir um vídeo com status <code>ready</code>.</p>
        </div>
      )}

      <div className={candidates.length === 0 ? "hidden" : "grid gap-3 lg:grid-cols-2"}>
        <label className="text-xs text-white/60">
          Vídeo
          <select value={jobId} onChange={(event) => setJobId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white">
            {candidates.map((job) => <option key={job.id} value={job.id}>{productName(job)}</option>)}
          </select>
        </label>

        <label className="text-xs text-white/60">
          Direito de uso
          <select value={rightsStatus} onChange={(event) => setRightsStatus(event.target.value as RightsStatus | "")} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white">
            <option value="">Selecione</option>
            <option value="owned">Vídeo próprio</option>
            <option value="seller_authorized">Autorizado pelo seller</option>
            <option value="creator_authorized">Autorizado pelo criador</option>
            <option value="official_reusable">Mídia oficial reutilizável</option>
          </select>
        </label>
      </div>

      <div className={candidates.length === 0 ? "hidden" : "mt-4 flex flex-wrap gap-4 text-sm text-white/70"}>
        <label className="flex items-center gap-2"><input type="checkbox" checked={productVisible} onChange={(event) => setProductVisible(event.target.checked)} /> Produto aparece claramente</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={demonstratesUse} onChange={(event) => setDemonstratesUse(event.target.checked)} /> Demonstra uso real</label>
        <label className="flex items-center gap-2"><input type="checkbox" checked={strongHook} onChange={(event) => setStrongHook(event.target.checked)} /> Gancho forte nos primeiros segundos</label>
      </div>

      <div className={candidates.length === 0 ? "hidden" : "mt-4 flex items-center gap-3"}>
        <button onClick={certify} disabled={busy || !rightsStatus} className="rounded-lg bg-cyan-500/20 px-4 py-2 text-xs font-bold text-cyan-100 hover:bg-cyan-500/30 disabled:opacity-40">
          {busy ? "Certificando…" : "Certificar criativo"}
        </button>
        {result && <span className="text-xs font-bold text-emerald-300">Score {result.score}/100 · {result.grade}</span>}
      </div>
      {message && <p className="mt-3 text-xs text-white/60">{message}</p>}
    </section>
  );
}
