"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, Film, Loader2, Play, RefreshCw, Sparkles, XCircle } from "lucide-react";
import { useRouter } from "next/navigation";

type Offer = { id: string; product_name: string; image_url: string | null; current_price: number; old_price: number | null; platform: string };
type Job = { id: string; status: string; script: string; video_url: string | null; created_at: string; error_message: string | null; offers?: Offer };

const statusCopy: Record<string, { label: string; tone: string }> = {
  queued: { label: "Na fila", tone: "text-amber-300 bg-amber-400/10" },
  processing: { label: "Processando", tone: "text-sky-300 bg-sky-400/10" },
  ready: { label: "Pronto para aprovar", tone: "text-emerald-300 bg-emerald-400/10" },
  approved: { label: "Aprovado", tone: "text-violet-300 bg-violet-400/10" },
  failed: { label: "Erro", tone: "text-red-300 bg-red-400/10" }
};

function defaultScript(offer?: Offer) {
  if (!offer) return "Olha essa oferta verificada agora! Corre porque o preço pode mudar e essa oportunidade pode acabar rápido.";
  return `Olha essa oferta verificada agora! ${offer.product_name} está por apenas R$ ${Number(offer.current_price).toFixed(2).replace(".", ",")}. Corre porque esse preço pode mudar e a oferta pode acabar rápido!`;
}

export function VideosClient({ offers, initialJobs }: { offers: Offer[]; initialJobs: Job[] }) {
  const router = useRouter();
  const [selectedOfferId, setSelectedOfferId] = useState(offers[0]?.id ?? "");
  const [script, setScript] = useState(defaultScript(offers[0]));
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const selectedOffer = useMemo(() => offers.find((offer) => offer.id === selectedOfferId), [offers, selectedOfferId]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!jobs.some((job) => job.status === "queued" || job.status === "processing")) return;
      const response = await fetch("/api/videos/jobs", { cache: "no-store" });
      if (response.ok) setJobs((await response.json()).jobs ?? []);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [jobs]);

  async function createJob() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/videos/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: selectedOfferId, script }) });
    const payload = await response.json();
    if (!response.ok) setMessage(payload.error ?? "Não foi possível criar o vídeo.");
    else { setMessage("Vídeo colocado na fila. O worker GPU poderá processá-lo."); setJobs((current) => [payload.job, ...current]); }
    setBusy(false);
  }

  async function approve(id: string) {
    const response = await fetch(`/api/videos/jobs/${id}/approve`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error ?? "Não foi possível aprovar o vídeo.");
    setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "approved" } : job));
    router.refresh();
  }

  async function retry(id: string) {
    const response = await fetch(`/api/videos/jobs/${id}/retry`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setMessage(payload.error ?? "Não foi possível recolocar o vídeo na fila.");
    setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "queued", error_message: null } : job));
    setMessage("Vídeo recolocado na fila.");
  }

  function selectOffer(id: string) {
    setSelectedOfferId(id);
    setScript(defaultScript(offers.find((offer) => offer.id === id)));
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Fábrica de conteúdo</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Vídeos de ofertas</h1><p className="mt-2 max-w-2xl text-sm text-white/45">Crie até três vídeos por dia, revise a prévia e aprove antes de publicar.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs text-white/55"><Film size={16} className="text-emerald-400" /> Fluxo manual de aprovação</div>
      </div>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-2xl shadow-black/10">
          <div className="mb-5 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400"><Sparkles size={18} /></span><div><h2 className="font-bold text-white">Novo vídeo</h2><p className="text-xs text-white/35">Escolha uma oferta e edite a fala.</p></div></div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Oferta</label>
          <select value={selectedOfferId} onChange={(event) => selectOffer(event.target.value)} className="mb-5 w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/60">
            <option value="">Selecione uma oferta</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name} — R$ {Number(offer.current_price).toFixed(2).replace(".", ",")}</option>)}
          </select>
          {selectedOffer && <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="h-14 w-14 overflow-hidden rounded-lg bg-white/5">{selectedOffer.image_url && <img src={selectedOffer.image_url} alt="" className="h-full w-full object-contain" />}</div><div><p className="text-sm font-semibold text-white">{selectedOffer.product_name}</p><p className="text-xs text-emerald-300">R$ {Number(selectedOffer.current_price).toFixed(2).replace(".", ",")}</p></div></div>}
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Roteiro da fala</label>
          <textarea value={script} onChange={(event) => setScript(event.target.value)} rows={6} className="w-full resize-none rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400/60" />
          <div className="mt-4 flex items-center justify-between gap-4"><span className="text-xs text-white/30">{script.length}/500 caracteres</span><button onClick={createJob} disabled={busy || !selectedOfferId || script.length < 20} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : <Film size={16} />} Colocar na fila</button></div>
          {message && <p className="mt-4 rounded-lg border border-emerald-400/20 bg-emerald-400/10 px-3 py-2 text-xs text-emerald-200">{message}</p>}
        </section>

        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold text-white">Fila e prévias</h2><p className="mt-1 text-xs text-white/35">Os jobs ficam prontos para o worker GPU.</p></div><button onClick={() => router.refresh()} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"><RefreshCw size={16} /></button></div>
          {jobs.length === 0 ? <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-white/10 text-center text-sm text-white/35"><div><Clock3 className="mx-auto mb-3 text-white/20" size={28} /><p>Nenhum vídeo na fila.</p><p className="mt-1 text-xs">Crie o primeiro a partir de uma oferta.</p></div></div> : <div className="space-y-3">{jobs.map((job) => { const status = statusCopy[job.status] ?? statusCopy.queued; return <article key={job.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-white">{job.offers?.product_name ?? "Oferta"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-white/40">{job.script}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.tone}`}>{status.label}</span></div>{job.video_url && <><div className="mt-4 overflow-hidden rounded-xl bg-black"><video controls playsInline src={job.video_url} className="max-h-[420px] w-full" /></div><a href={job.video_url} download target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"><Download size={15} /> Baixar MP4</a></>}{job.error_message && <p className="mt-3 text-xs text-red-300">{job.error_message}</p>}{job.status === "ready" && <button onClick={() => approve(job.id)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/25"><CheckCircle2 size={15} /> Aprovar vídeo</button>}{job.status === "approved" && <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-300"><CheckCircle2 size={15} /> Aprovado para publicação</p>}{job.status === "failed" && <button onClick={() => retry(job.id)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25"><RefreshCw size={15} /> Tentar novamente</button>}{job.status === "processing" && <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-sky-300"><Loader2 size={15} className="animate-spin" /> Renderizando</p>}{job.status === "ready" && !job.video_url && <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-200"><Play size={14} /> Aguardando URL da prévia do worker</p>}</article> })}</div>}
        </section>
      </div>
    </div>
  );
}
