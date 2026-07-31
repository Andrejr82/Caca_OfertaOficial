"use client";

import { useCallback, useEffect, useState } from "react";

type ReelJob = { id: string; status: string; stage?: string | null; video_url?: string | null; error_message?: string | null; offers?: { product_name?: string; current_price?: number; image_url?: string | null } | null };
type Draft = { channel: string; content: string };

const statusLabel: Record<string, string> = { queued: "Na fila", processing: "Processando", ready: "Pronto para revisão", approved: "Aprovado", failed: "Falhou", cancelled: "Cancelado", published: "Publicado" };

export default function VideosReelsClient() {
  const [sourceUrl, setSourceUrl] = useState("");
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const [channels, setChannels] = useState<string[]>(["instagram", "facebook"]);
  const [jobs, setJobs] = useState<ReelJob[]>([]);
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  const loadJobs = useCallback(async () => {
    const response = await fetch("/api/videos/jobs", { cache: "no-store" });
    if (!response.ok) return;
    const payload = await response.json();
    setJobs((payload.jobs || []).filter((job: ReelJob & { template_id?: string }) => job.template_id === "imported-reel-v1"));
  }, []);

  useEffect(() => { void loadJobs(); }, [loadJobs]);

  async function submit() {
    setBusy(true); setMessage(""); setDrafts([]);
    try {
      const response = await fetch("/api/videos-reels/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ sourceUrl, channels, rightsConfirmed }) });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Não foi possível preparar o Reel.");
      setMessage(`Produto identificado: ${payload.productName} — R$ ${Number(payload.price).toFixed(2).replace(".", ",")}. Job criado para o worker.`);
      setDrafts(payload.drafts || []); setSourceUrl(""); setRightsConfirmed(false); await loadJobs();
    } catch (error) { setMessage(error instanceof Error ? error.message : "Falha ao preparar Reel."); }
    finally { setBusy(false); }
  }

  async function approve(jobId: string) {
    const response = await fetch(`/api/videos/jobs/${jobId}/approve`, { method: "POST" });
    const payload = await response.json();
    setMessage(response.ok ? "Reel aprovado para publicação." : (payload.error || "Não foi possível aprovar o Reel."));
    await loadJobs();
  }

  function toggleChannel(channel: string) { setChannels((current) => current.includes(channel) ? current.filter((value) => value !== channel) : [...current, channel]); }

  return <main className="mx-auto max-w-6xl space-y-6 p-6">
    <header><p className="text-sm text-cyan-300">Estúdio separado do gerador de vídeos de ofertas</p><h1 className="text-3xl font-bold text-white">Vídeos Reels</h1><p className="mt-2 text-slate-400">Cole um link de Shopee Video. O produto será localizado automaticamente pelo menor preço e a copy será preparada para Instagram e Facebook.</p></header>
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6">
      <label className="block text-sm font-medium text-slate-300">URL do vídeo</label>
      <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://br.shp.ee/..." className="mt-2 w-full rounded-xl border border-slate-700 bg-slate-950 px-4 py-3 text-white outline-none focus:border-cyan-400" />
      <div className="mt-4 flex flex-wrap gap-5 text-sm text-slate-200">{["instagram", "facebook"].map((channel) => <label key={channel} className="flex items-center gap-2"><input type="checkbox" checked={channels.includes(channel)} onChange={() => toggleChannel(channel)} />{channel === "instagram" ? "Instagram Reels" : "Facebook Reels"}</label>)}</div>
      <label className="mt-4 flex items-start gap-3 rounded-xl border border-slate-700 p-4 text-sm text-slate-300"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" /><span>Confirmo que este vídeo foi disponibilizado por uma fonte autorizada para divulgação comercial ou que possuo autorização para utilizá-lo.</span></label>
      <button disabled={busy || !sourceUrl || !rightsConfirmed || channels.length === 0} onClick={() => void submit()} className="mt-5 rounded-xl bg-cyan-500 px-5 py-3 font-semibold text-slate-950 disabled:cursor-not-allowed disabled:opacity-50">{busy ? "Preparando..." : "Extrair vídeo e gerar copy"}</button>
      {message && <p className="mt-4 rounded-xl bg-slate-800 p-4 text-sm text-cyan-200">{message}</p>}
    </section>
    {drafts.length > 0 && <section className="grid gap-4 md:grid-cols-2">{drafts.map((draft) => <article key={draft.channel} className="rounded-2xl border border-emerald-700/60 bg-slate-900 p-5"><h2 className="font-semibold text-white">Copy — {draft.channel}</h2><pre className="mt-3 whitespace-pre-wrap text-sm text-slate-300">{draft.content}</pre></article>)}</section>}
    <section className="rounded-2xl border border-slate-700 bg-slate-900/70 p-6"><div className="flex items-center justify-between"><div><h2 className="text-xl font-semibold text-white">Fila de Reels</h2><p className="text-sm text-slate-400">Somente jobs `imported-reel-v1`; sem capa, thumbnail ou frame.</p></div><button onClick={() => void loadJobs()} className="text-sm text-cyan-300">Atualizar</button></div><div className="mt-4 space-y-3">{jobs.length === 0 ? <p className="text-sm text-slate-500">Nenhum Reel na fila.</p> : jobs.map((job) => <div key={job.id} className="rounded-xl border border-slate-700 p-4"><div className="flex items-center justify-between gap-4"><strong className="text-white">{job.offers?.product_name || "Produto"}</strong><span className="text-sm text-cyan-300">{statusLabel[job.status] || job.status}</span></div>{job.error_message && <p className="mt-2 text-sm text-red-300">{job.error_message}</p>}{job.video_url && <video controls className="mt-3 max-h-[480px] w-full rounded-lg" src={job.video_url} />}{job.status === "ready" && <button onClick={() => void approve(job.id)} className="mt-3 rounded-lg bg-emerald-500 px-4 py-2 text-sm font-semibold text-slate-950">Aprovar Reel para publicação</button>}</div>)}</div></section>
  </main>;
}
