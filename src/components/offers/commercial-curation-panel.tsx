"use client";

import { useMemo, useState, useTransition } from "react";
import type { CommercialQueueCandidate } from "@/lib/offers/commercial-curation-queue";
import { createCommercialCurationDraft } from "@/lib/offers/create-commercial-curation-draft";
import type { CommercialDraftChannel } from "@/lib/offers/commercial-draft-validation";

export function CommercialCurationPanel({ candidates }: { candidates: CommercialQueueCandidate[] }) {
  const [marketplace, setMarketplace] = useState("");
  const [intent, setIntent] = useState("");
  const [mode, setMode] = useState<"" | "automatic" | "manual-first" | "rejected">("");
  const [risk, setRisk] = useState("");
  const [minScore, setMinScore] = useState("");
  const [selectedChannels, setSelectedChannels] = useState<Record<string, CommercialDraftChannel>>({});
  const [draftFeedback, setDraftFeedback] = useState<Record<string, string>>({});
  const [isCreatingDraft, startCreatingDraft] = useTransition();

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

  function createDraft(candidate: CommercialQueueCandidate) {
    const selectedChannel = selectedChannels[candidate.id] || "telegram";
    const critical = candidate.commercialRiskFlags.some((flag) => ["regulated_or_sensitive", "security_camera_manual", "electronics_high_ticket_manual", "large_or_freight_sensitive_manual"].includes(flag));
    if (!window.confirm(critical ? "Este candidato tem risco crítico. Criar draft para revisão manual mesmo assim?" : `Criar draft em ${selectedChannel}? A ação não publica.`)) return;
    startCreatingDraft(async () => {
      const result = await createCommercialCurationDraft({ offerId: candidate.id, selectedChannel, confirmCriticalRisk: critical });
      setDraftFeedback((current) => ({ ...current, [candidate.id]: result.message }));
    });
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
    <div className="grid gap-3 md:grid-cols-3">{[{ title: `Top automático (${automatic.length})`, items: automatic }, { title: `Manual-first (${manual.length})`, items: manual }, { title: `Rejeitados/riscos (${rejected.length})`, items: rejected }].map(({ title, items }) => <QueueColumn key={title} title={title} items={items.slice(0, 8)} selectedChannels={selectedChannels} onChannelChange={(id, channel) => setSelectedChannels((current) => ({ ...current, [id]: channel }))} onCreateDraft={createDraft} draftFeedback={draftFeedback} isCreatingDraft={isCreatingDraft} />)}</div>
  </section>;
}

function QueueColumn({ title, items, selectedChannels, onChannelChange, onCreateDraft, draftFeedback, isCreatingDraft }: { title: string; items: CommercialQueueCandidate[]; selectedChannels: Record<string, CommercialDraftChannel>; onChannelChange: (id: string, channel: CommercialDraftChannel) => void; onCreateDraft: (candidate: CommercialQueueCandidate) => void; draftFeedback: Record<string, string>; isCreatingDraft: boolean }) {
  return <div className="space-y-2"><h3 className="text-sm font-semibold text-white/80">{title}</h3>{items.length === 0 && <p className="rounded border border-white/5 p-3 text-xs text-white/35">Sem candidatos.</p>}{items.map((candidate) => <article key={candidate.id} className="rounded border border-white/10 bg-black/20 p-3 space-y-2"><div className="flex gap-2"><div className="h-12 w-12 shrink-0 overflow-hidden rounded bg-white/5">{candidate.image_url && <img src={`/api/images/proxy?url=${encodeURIComponent(candidate.image_url)}`} referrerPolicy="no-referrer" alt="" className="h-full w-full object-cover" />}</div><div className="min-w-0 flex-1"><p className="truncate text-xs font-semibold text-white">{candidate.product_name}</p><p className="text-[11px] text-white/50">{candidate.platform} · R$ {Number(candidate.current_price || 0).toFixed(2)} · {candidate.achadinhoScore.toFixed(1)}</p><p className="text-[10px] text-violet-200">{candidate.commercialIntent} · {candidate.automaticEligible ? "automático" : "manual-first"}</p></div></div><p className="text-[10px] text-white/50">{candidate.commercialReasons.slice(0, 2).join(" · ") || "Sem motivo adicional"}</p>{candidate.commercialRiskFlags.length > 0 && <p className="text-[10px] text-amber-300">Riscos: {candidate.commercialRiskFlags.join(", ")}</p>}<div className="grid gap-2"><select aria-label={`Canal do draft ${candidate.product_name}`} className="rounded bg-black/30 p-1 text-[10px] text-white" value={selectedChannels[candidate.id] || "telegram"} onChange={(event) => onChannelChange(candidate.id, event.target.value as CommercialDraftChannel)}><option value="telegram">Telegram · preparar draft</option><option value="manual_whatsapp">WhatsApp · preparar draft</option><option value="reels_manual">Reels · usar Vídeos de Ofertas</option></select><div className="flex items-center gap-2"><a className="text-[10px] text-blue-300 underline" href={candidate.original_url} target="_blank" rel="noreferrer">Ver oferta</a><button type="button" disabled={isCreatingDraft} onClick={() => onCreateDraft(candidate)} className="ml-auto rounded border border-emerald-300/30 px-2 py-1 text-[10px] text-emerald-200 disabled:opacity-40">Preparar aprovação</button></div>{draftFeedback[candidate.id] && <p className="text-[10px] text-emerald-300">{draftFeedback[candidate.id]}</p>}</div></article>)}</div>;
}
