"use client";

import { useMemo, useState } from "react";
import type { CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";

export function CommercialCurationPanel({ candidates }: { candidates: CommercialQueueCandidate[] }) {
  const [marketplace, setMarketplace] = useState("");
  const [intent, setIntent] = useState("");
  const [mode, setMode] = useState<"" | "automatic" | "manual-first" | "rejected">("");
  const [risk, setRisk] = useState("");
  const [minScore, setMinScore] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const filtered = useMemo(() => candidates.filter((candidate) => {
    if (marketplace && candidate.platform !== marketplace) return false;
    if (intent && candidate.commercialIntent !== intent) return false;
    if (mode === "automatic" && !candidate.automaticEligible) return false;
    if (mode === "manual-first" && !candidate.manualReviewRequired) return false;
    if (mode === "rejected" && !candidate.rejected) return false;
    if (risk && !candidate.commercialRiskFlags.includes(risk)) return false;
    return !minScore || candidate.achadinhoScore >= Number(minScore);
  }), [candidates, marketplace, intent, mode, risk, minScore]);
  const automatic = filtered.filter((candidate) => candidate.automaticEligible);
  const manual = filtered.filter((candidate) => candidate.manualReviewRequired);
  const rejected = filtered.filter((candidate) => candidate.rejected);
  const intents = [...new Set(candidates.map((candidate) => candidate.commercialIntent))].sort();
  const risks = [...new Set(candidates.flatMap((candidate) => candidate.commercialRiskFlags))].sort();

  async function copy(candidate: CommercialQueueCandidate) {
    await navigator.clipboard?.writeText(candidate.suggestedCopy || "");
    setCopiedId(candidate.id);
    window.setTimeout(() => setCopiedId(null), 1200);
  }

  return <section className="glass-card p-5 space-y-4" aria-label="Curadoria Comercial">
    <div className="flex items-center justify-between gap-3"><div><h2 className="text-lg font-bold text-white">Curadoria Comercial</h2><p className="text-xs text-white/45">Fila shadow de aprovação — nenhuma ação publica ou envia mensagens.</p></div><span className="text-xs text-white/45">{filtered.length} candidatos</span></div>
    <div className="grid gap-2 md:grid-cols-5">
      <select className="rounded bg-black/20 p-2 text-xs text-white" value={marketplace} onChange={(event) => setMarketplace(event.target.value)}><option value="">Todos marketplaces</option><option value="Shopee">Shopee</option><option value="Mercado Livre">Mercado Livre</option></select>
      <select className="rounded bg-black/20 p-2 text-xs text-white" value={intent} onChange={(event) => setIntent(event.target.value)}><option value="">Todas intenções</option>{intents.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <select className="rounded bg-black/20 p-2 text-xs text-white" value={mode} onChange={(event) => setMode(event.target.value as typeof mode)}><option value="">Todos os modos</option><option value="automatic">Top automático</option><option value="manual-first">Manual-first</option><option value="rejected">Rejeitados/riscos</option></select>
      <select className="rounded bg-black/20 p-2 text-xs text-white" value={risk} onChange={(event) => setRisk(event.target.value)}><option value="">Todos os riscos</option>{risks.map((value) => <option key={value} value={value}>{value}</option>)}</select>
      <input className="rounded bg-black/20 p-2 text-xs text-white" type="number" min="0" max="100" placeholder="Score mínimo" value={minScore} onChange={(event) => setMinScore(event.target.value)} />
    </div>
    <div className="grid gap-3 md:grid-cols-3"><QueueColumn title={`Top automático (${automatic.length})`} items={automatic.slice(0, 8)} onCopy={copy} copiedId={copiedId} /><QueueColumn title={`Manual-first (${manual.length})`} items={manual.slice(0, 8)} onCopy={copy} copiedId={copiedId} /><QueueColumn title={`Rejeitados/riscos (${rejected.length})`} items={rejected.slice(0, 8)} onCopy={copy} copiedId={copiedId} /></div>
  </section>;
}

function QueueColumn({ title, items, onCopy, copiedId }: { title: string; items: CommercialQueueCandidate[]; onCopy: (candidate: CommercialQueueCandidate) => void; copiedId: string | null }) {
  return <div className="space-y-2"><h3 className="text-sm font-semibold text-white/80">{title}</h3>{items.length === 0 && <p className="rounded border border-white/5 p-3 text-xs text-white/35">Sem candidatos.</p>}{items.map((candidate) => <article key={candidate.id} className="rounded border border-white/10 bg-black/20 p-3 space-y-2"><div className="flex gap-2"><div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-white/5">{candidate.image_url && <img src={candidate.image_url} alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{candidate.product_name}</p><p className="text-[11px] text-white/50">{candidate.platform} · R$ {Number(candidate.current_price || 0).toFixed(2)} · {candidate.achadinhoScore.toFixed(1)}</p><p className="text-[10px] text-violet-200">{candidate.commercialIntent} · {candidate.automaticEligible ? "automático" : "manual-first"}</p></div></div><p className="text-[10px] text-white/50">{candidate.commercialReasons.slice(0, 2).join(" · ") || "Sem motivo adicional"}</p>{candidate.commercialRiskFlags.length > 0 && <p className="text-[10px] text-amber-300">Riscos: {candidate.commercialRiskFlags.join(", ")}</p>}<div className="flex items-center gap-2"><button type="button" className="rounded border border-violet-300/30 px-2 py-1 text-[10px] text-violet-200" onClick={() => onCopy(candidate)}>{copiedId === candidate.id ? "Copiada" : "Copiar copy"}</button><a className="text-[10px] text-blue-300 underline" href={candidate.original_url} target="_blank" rel="noreferrer">Ver oferta</a><button type="button" disabled title="Aprovação de draft será integrada em tarefa futura" className="ml-auto rounded border border-white/10 px-2 py-1 text-[10px] text-white/30">Aprovar draft</button></div></article>)}</div>;
}
