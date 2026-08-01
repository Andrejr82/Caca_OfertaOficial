"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, Clock3, Download, Film, Loader2, Play, RefreshCw, Send, Sparkles, XCircle, Link2, ShieldCheck } from "lucide-react";
import { useRouter } from "next/navigation";
import { buildGeminiVideoPrompt } from "@/lib/videos/gemini-prompt";

type Offer = { id: string; product_name: string; image_url: string | null; current_price: number; old_price: number | null; platform: string; category?: string | null; shipping_free?: boolean | null; coupon?: string | null; original_url?: string | null };
type Job = { id: string; status: string; stage?: string; attempt_count?: number; script: string; video_url: string | null; audio_url?: string | null; created_at: string; error_message: string | null; template_id?: string; metadata?: { importedVideo?: { assets?: Record<string, string | null>; drafts?: Array<{ channel: string; content: string; trackedUrl: string; postId?: string | null }> } }; offers?: Offer };

const statusCopy: Record<string, { label: string; tone: string }> = {
  queued: { label: "Na fila", tone: "text-amber-300 bg-amber-400/10" },
  processing: { label: "Processando", tone: "text-sky-300 bg-sky-400/10" },
  ready: { label: "Pronto para aprovar", tone: "text-emerald-300 bg-emerald-400/10" },
  approved: { label: "Aprovado", tone: "text-violet-300 bg-violet-400/10" },
  failed: { label: "Erro", tone: "text-red-300 bg-red-400/10" }
  ,cancelled: { label: "Cancelado", tone: "text-white/50 bg-white/10" }
  ,published: { label: "Publicado", tone: "text-emerald-300 bg-emerald-400/10" }
};

const stageCopy: Record<string, string> = {
  queued: "Aguardando worker", claimed: "Worker reservado", downloading_product: "Baixando produto",
  resolving_source: "Validando origem", downloading: "Baixando vídeo", validating: "Analisando qualidade",
  processing: "Adaptando vídeo", generating_assets: "Gerando capas e imagens", generating_copies: "Preparando copys",
  building_card: "Montando card", generating_audio: "Gerando narração", building_avatar_source: "Preparando avatar",
  preparing_lipsync: "Preparando sincronização", lip_sync: "Sincronizando lábios", composing_video: "Compondo vídeo",
  uploading_media: "Enviando mídia", ready_for_review: "Pronto para revisão", failed: "Falhou", cancelled: "Cancelado"
};

function productImageFilename(productName: string, contentType: string) {
  const slug = productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "produto";
  const extension = contentType.includes("png") ? "png" : contentType.includes("webp") ? "webp" : "jpg";
  return `${slug}.${extension}`;
}

export function VideosClient({ offers, initialJobs }: { offers: Offer[]; initialJobs: Job[] }) {
  const router = useRouter();
  const [selectedOfferId, setSelectedOfferId] = useState(offers[0]?.id ?? "");
  const [geminiPrompt, setGeminiPrompt] = useState(() => offers[0] ? buildGeminiVideoPrompt(offers[0]) : "");
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [offerSearch, setOfferSearch] = useState("");
  const [importChannels, setImportChannels] = useState<Array<"instagram" | "facebook">>(["instagram", "facebook"]);
  const [rightsConfirmed, setRightsConfirmed] = useState(false);
  const selectedOffer = useMemo(() => offers.find((offer) => offer.id === selectedOfferId), [offers, selectedOfferId]);
  const filteredOffers = useMemo(() => offers.filter((offer) => offer.product_name.toLowerCase().includes(offerSearch.toLowerCase())), [offers, offerSearch]);

  useEffect(() => {
    const interval = window.setInterval(async () => {
      if (!jobs.some((job) => job.status === "queued" || job.status === "processing")) return;
      const response = await fetch("/api/videos/jobs", { cache: "no-store" });
      if (response.ok) setJobs((await response.json()).jobs ?? []);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [jobs]);

  async function importVideo() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/videos/import", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: selectedOfferId, sourceUrl, channels: importChannels, rightsConfirmed }) });
    const payload = await response.json();
    if (!response.ok) setMessage({ text: payload.error ?? "Não foi possível importar o vídeo.", error: true });
    else { setMessage({ text: "Link recebido. Vídeo colocado na fila de tratamento." }); setSourceUrl(""); setRightsConfirmed(false); router.refresh(); }
    setBusy(false);
  }

  async function approve(id: string) {
    const response = await fetch(`/api/videos/jobs/${id}/approve`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setMessage({ text: payload.error ?? "Não foi possível aprovar o vídeo.", error: true });
    setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "approved" } : job));
    router.refresh();
  }

  async function publishReel(id: string) {
    if (!window.confirm("Publicar este vídeo como Reel no Instagram? O cooldown e os limites serão aplicados.")) return;
    setBusy(true); setMessage(null);
    const response = await fetch("/api/instagram/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoJobId: id, requestSource: "videos-dashboard" }) });
    const payload = await response.json();
    if (!response.ok) setMessage({ text: payload.message ?? "Não foi possível publicar o Reel.", error: true });
    else { setMessage({ text: "Reel publicado com sucesso no Instagram." }); setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "published" } : job)); }
    setBusy(false);
  }

  async function generateDrafts(id: string) {
    setBusy(true); setMessage(null);
    const response = await fetch(`/api/videos/import/${id}/drafts`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) setMessage({ text: payload.error ?? "Não foi possível gerar as copys.", error: true });
    else { setMessage({ text: "Copys geradas. Revise antes de aprovar." }); router.refresh(); }
    setBusy(false);
  }

  async function publishFacebook(job: Job) {
    const postId = job.metadata?.importedVideo?.drafts?.find((draft) => draft.channel === "facebook")?.postId;
    if (!postId || !job.offers?.id) return setMessage({ text: "Draft do Facebook não encontrado.", error: true });
    if (!window.confirm("Publicar este vídeo no Facebook?")) return;
    setBusy(true); setMessage(null);
    const response = await fetch("/api/facebook/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, offerId: job.offers.id, requestSource: "videos-dashboard" }) });
    const payload = await response.json();
    setMessage(response.ok ? { text: "Vídeo publicado no Facebook." } : { text: payload.message ?? "Não foi possível publicar no Facebook.", error: true });
    setBusy(false);
  }

  async function retry(id: string) {
    const response = await fetch(`/api/videos/jobs/${id}/retry`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setMessage({ text: payload.error ?? "Não foi possível recolocar o vídeo na fila.", error: true });
    setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "queued", video_url: null, audio_url: null, error_message: null } : job));
    setMessage({ text: "Vídeo recolocado na fila." });
  }

  async function cancel(id: string) {
    if (!window.confirm("Cancelar este vídeo antes de ele usar a GPU?")) return;
    const response = await fetch(`/api/videos/jobs/${id}/cancel`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setMessage({ text: payload.error ?? "Não foi possível cancelar o vídeo.", error: true });
    setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "cancelled", stage: "cancelled" } : job));
    setMessage({ text: "Vídeo cancelado antes do processamento." });
  }

  async function regenerate(id: string) {
    if (!window.confirm("Gerar outra versão consome uma vaga do limite diário. Deseja continuar?")) return;
    const response = await fetch(`/api/videos/jobs/${id}/regenerate`, { method: "POST" });
    const payload = await response.json();
    if (!response.ok) return setMessage({ text: payload.error ?? "Não foi possível criar a nova versão.", error: true });
    setJobs((current) => [payload.job, ...current]);
    setMessage({ text: "Nova versão colocada na fila." });
  }

  function selectOffer(id: string) {
    setSelectedOfferId(id);
    const offer = offers.find((item) => item.id === id);
    setGeminiPrompt(offer ? buildGeminiVideoPrompt(offer) : "");
  }

  async function copyGeminiPrompt() {
    if (!geminiPrompt) return;
    await navigator.clipboard.writeText(geminiPrompt);
    setMessage({ text: "Prompt copiado. No Gemini, anexe Avatar_Anuncio.png e a imagem do produto selecionado." });
  }

  async function downloadSelectedOfferImage() {
    if (!selectedOffer?.image_url) {
      setMessage({ text: "Esta oferta não possui imagem disponível.", error: true });
      return;
    }
    setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}`, { cache: "no-store" });
      if (!response.ok) throw new Error("image-download-failed");
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = objectUrl;
      anchor.download = productImageFilename(selectedOffer.product_name, response.headers.get("content-type") || blob.type);
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(objectUrl);
      setMessage({ text: "Imagem do produto baixada. Anexe-a no Gemini junto com o prompt." });
    } catch {
      setMessage({ text: "Não foi possível baixar a imagem desta oferta.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-8">
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Fábrica de conteúdo</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Vídeos de ofertas</h1><p className="mt-2 max-w-2xl text-sm text-white/45">Crie vídeos, revise a prévia e aprove antes de publicar.</p></div>
        <div className="flex items-center gap-2 rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 text-xs text-white/55"><Film size={16} className="text-emerald-400" /> Fluxo manual de aprovação</div>
      </div>

      <section className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5 shadow-2xl shadow-black/10">
        <div className="mb-5 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-sky-500/10 text-sky-300"><Link2 size={18} /></span><div><h2 className="font-bold text-white">Importar vídeo autorizado</h2><p className="text-xs text-white/40">Cole um link Shopee Video para tratar e revisar antes da publicação.</p></div></div>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Buscar oferta</label>
            <input value={offerSearch} onChange={(event) => setOfferSearch(event.target.value)} placeholder="Nome do produto" className="mb-2 w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white outline-none focus:border-sky-400/60" />
            <select value={selectedOfferId} onChange={(event) => selectOffer(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white outline-none focus:border-sky-400/60"><option value="">Selecione uma oferta existente</option>{filteredOffers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name} · {offer.platform}</option>)}</select>
          </div>
          <div>
            <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">URL do vídeo</label>
            <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://br.shp.ee/..." inputMode="url" className="w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white outline-none focus:border-sky-400/60" />
            <div className="mt-3 flex flex-wrap gap-3 text-xs text-white/65"><label className="inline-flex items-center gap-2"><input type="checkbox" checked={importChannels.includes("instagram")} onChange={(event) => setImportChannels((current) => event.target.checked ? Array.from(new Set([...current, "instagram"])) : current.filter((channel) => channel !== "instagram"))} /> Instagram</label><label className="inline-flex items-center gap-2"><input type="checkbox" checked={importChannels.includes("facebook")} onChange={(event) => setImportChannels((current) => event.target.checked ? Array.from(new Set([...current, "facebook"])) : current.filter((channel) => channel !== "facebook"))} /> Facebook</label></div>
          </div>
        </div>
        <label className="mt-4 flex items-start gap-3 rounded-xl border border-white/[0.08] bg-black/20 p-3 text-xs leading-5 text-white/65"><input type="checkbox" checked={rightsConfirmed} onChange={(event) => setRightsConfirmed(event.target.checked)} className="mt-1" /><span><ShieldCheck size={14} className="mr-1 inline text-emerald-300" />Confirmo que este vídeo foi disponibilizado por uma fonte autorizada para divulgação comercial ou que possuo autorização para utilizá-lo.</span></label>
        <div className="mt-4 flex items-center justify-between gap-4"><span className="text-xs text-white/35">A oferta será vinculada manualmente; o vídeo não será associado por semelhança textual.</span><button onClick={importVideo} disabled={busy || !selectedOfferId || !sourceUrl.trim() || !rightsConfirmed || importChannels.length === 0} className="inline-flex items-center gap-2 rounded-xl bg-sky-400 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-sky-300 disabled:cursor-not-allowed disabled:opacity-40">{busy ? <Loader2 size={16} className="animate-spin" /> : <Link2 size={16} />} Importar e tratar vídeo</button></div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)]">
        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5 shadow-2xl shadow-black/10">
          <div className="mb-5 flex items-center gap-3"><span className="grid h-9 w-9 place-items-center rounded-xl bg-emerald-500/10 text-emerald-400"><Sparkles size={18} /></span><div><h2 className="font-bold text-white">Prompt para Gemini</h2><p className="text-xs text-white/35">Selecione uma oferta e gere um roteiro estruturado para criar o vídeo no Gemini.</p></div></div>
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Oferta</label>
          <select value={selectedOfferId} onChange={(event) => selectOffer(event.target.value)} className="mb-5 w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white outline-none focus:border-emerald-400/60">
            <option value="">Selecione uma oferta</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name} — R$ {Number(offer.current_price).toFixed(2).replace(".", ",")}</option>)}
          </select>
          {selectedOffer && <div className="mb-5 flex items-center gap-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="h-14 w-14 overflow-hidden rounded-lg bg-white/5">{selectedOffer.image_url && <img src={selectedOffer.image_url} alt="" className="h-full w-full object-contain" />}</div><div><p className="text-sm font-semibold text-white">{selectedOffer.product_name}</p><p className="text-xs text-emerald-300">R$ {Number(selectedOffer.current_price).toFixed(2).replace(".", ",")}</p></div></div>}
          <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Prompt estruturado</label>
          <textarea value={geminiPrompt} readOnly rows={15} placeholder="Selecione uma oferta para gerar o prompt." className="w-full resize-none rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm leading-6 text-white outline-none focus:border-emerald-400/60" />
          <div className="mt-4 flex items-center justify-between gap-4"><span className="text-xs text-white/35">Inclui avatar padrão, produto, ação e copy verificada.</span><div className="flex flex-wrap justify-end gap-2"><button onClick={copyGeminiPrompt} disabled={!geminiPrompt || busy} className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-3 text-sm font-bold text-slate-950 transition hover:bg-emerald-400 disabled:cursor-not-allowed disabled:opacity-40">Copiar prompt</button><button onClick={downloadSelectedOfferImage} disabled={!selectedOffer?.image_url || busy} className="inline-flex items-center gap-2 rounded-xl border border-emerald-400/40 bg-emerald-500/10 px-4 py-3 text-sm font-bold text-emerald-200 transition hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-40"><Download size={16} /> Baixar imagem</button></div></div>
          {message && <p className={`mt-4 rounded-lg border px-3 py-2 text-xs ${message.error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{message.text}</p>}
        </section>
        {jobs.some((job) => job.status === "approved" && job.video_url) && <section className="rounded-2xl border border-pink-400/20 bg-pink-500/[0.04] p-5"><h2 className="font-bold text-pink-100">Reels prontos para publicação</h2><p className="mt-1 text-xs text-white/45">A publicação passa pelo fluxo oficial, cooldown, limite diário e deduplicação.</p><div className="mt-4 flex flex-wrap gap-2">{jobs.filter((job) => job.status === "approved" && job.video_url).map((job) => <button key={job.id} onClick={() => publishReel(job.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-pink-500/15 px-3 py-2 text-xs font-bold text-pink-100 hover:bg-pink-500/25 disabled:opacity-50"><Send size={14} /> Publicar: {job.offers?.product_name ?? "oferta"}</button>)}</div></section>}

        <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="mb-5 flex items-center justify-between"><div><h2 className="font-bold text-white">Fila e prévias</h2><p className="mt-1 text-xs text-white/35">Os jobs ficam prontos para o worker GPU.</p></div><button onClick={() => router.refresh()} className="rounded-lg p-2 text-white/40 hover:bg-white/5 hover:text-white"><RefreshCw size={16} /></button></div>
          {jobs.filter((job) => job.template_id === "imported-video-v1" && (job.status === "ready" || job.status === "approved")).map((job) => <div key={`${job.id}-review`} className="mb-4 rounded-xl border border-sky-400/15 bg-sky-500/[0.04] p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-sm font-bold text-white">Revisão de vídeo importado</p><p className="text-xs text-white/45">{job.offers?.product_name ?? "Oferta"}</p></div>{job.status === "ready" && <button onClick={() => generateDrafts(job.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-sky-500/15 px-3 py-2 text-xs font-bold text-sky-200"><Sparkles size={14} /> Gerar copys</button>}{job.status === "approved" && <><button onClick={() => publishReel(job.id)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-pink-500/15 px-3 py-2 text-xs font-bold text-pink-100"><Send size={14} /> Instagram</button><button onClick={() => publishFacebook(job)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-100"><Send size={14} /> Facebook</button></>}</div>{job.metadata?.importedVideo?.drafts?.map((draft) => <div key={draft.channel} className="mt-3 rounded-lg border border-white/[0.06] bg-black/20 p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">Copy {draft.channel}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/75">{draft.content}</p><p className="mt-2 break-all text-[11px] text-emerald-300">{draft.trackedUrl}</p></div>)}</div>)}
          {jobs.length === 0 ? <div className="grid min-h-64 place-items-center rounded-xl border border-dashed border-white/10 text-center text-sm text-white/35"><div><Clock3 className="mx-auto mb-3 text-white/20" size={28} /><p>Nenhum vídeo na fila.</p><p className="mt-1 text-xs">Crie o primeiro a partir de uma oferta.</p></div></div> : <div className="space-y-3">{jobs.map((job) => { const status = statusCopy[job.status] ?? statusCopy.queued; return <article key={job.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4"><div className="flex items-start justify-between gap-4"><div><p className="font-semibold text-white">{job.offers?.product_name ?? "Oferta"}</p><p className="mt-1 line-clamp-2 text-xs leading-5 text-white/40">{job.script}</p></div><span className={`shrink-0 rounded-full px-2.5 py-1 text-[10px] font-bold ${status.tone}`}>{status.label}</span></div>{job.stage && <p className="mt-3 text-xs text-white/55">Etapa: <span className="font-semibold text-sky-200">{stageCopy[job.stage] ?? job.stage}</span>{job.attempt_count ? ` · tentativa ${job.attempt_count}/2` : ""}</p>}{job.video_url && <><div className="mt-4 overflow-hidden rounded-xl bg-black"><video controls playsInline src={job.video_url} className="max-h-[420px] w-full" /></div><a href={job.video_url} download target="_blank" rel="noreferrer" className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950 transition hover:bg-emerald-400"><Download size={15} /> Baixar MP4</a></>}{job.error_message && <p className="mt-3 text-xs text-red-300">{job.error_message}</p>}{job.status === "ready" && <><button onClick={() => approve(job.id)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200 hover:bg-violet-500/25"><CheckCircle2 size={15} /> Aprovar vídeo</button><button onClick={() => regenerate(job.id)} className="ml-2 mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25"><RefreshCw size={15} /> Gerar outra versão</button></>}{job.status === "approved" && <><p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-emerald-300"><CheckCircle2 size={15} /> Aprovado para publicação</p><button onClick={() => regenerate(job.id)} className="ml-2 inline-flex items-center gap-2 text-xs font-bold text-amber-200 hover:text-amber-100"><RefreshCw size={15} /> Nova versão</button></>}{job.status === "failed" && <><button onClick={() => retry(job.id)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-amber-500/15 px-3 py-2 text-xs font-bold text-amber-200 hover:bg-amber-500/25"><RefreshCw size={15} /> Tentar novamente</button><button onClick={() => regenerate(job.id)} className="ml-2 mt-4 inline-flex items-center gap-2 text-xs font-bold text-white/55 hover:text-white"><RefreshCw size={15} /> Nova versão</button></>}{job.status === "queued" && <button onClick={() => cancel(job.id)} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-red-500/10 px-3 py-2 text-xs font-bold text-red-200 hover:bg-red-500/20"><XCircle size={15} /> Cancelar antes da GPU</button>}{job.status === "processing" && <p className="mt-4 inline-flex items-center gap-2 text-xs font-semibold text-sky-300"><Loader2 size={15} className="animate-spin" /> {stageCopy[job.stage ?? ""] ?? "Renderizando"}</p>}{job.status === "ready" && !job.video_url && <p className="mt-3 inline-flex items-center gap-2 text-xs text-amber-200"><Play size={14} /> Aguardando URL da prévia do worker</p>}</article> })}</div>}
        </section>
      </div>
    </div>
  );
}
