"use client";

import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Copy, Download, FileVideo, Loader2, RefreshCw, Send, ShieldCheck } from "lucide-react";
import { buildGeminiVideoPrompt } from "@/lib/videos/gemini-prompt";

type Offer = { id: string; product_name: string; image_url: string | null; current_price: number; old_price: number | null; platform: string; category?: string | null; shipping_free?: boolean | null; coupon?: string | null; original_url?: string };
type DriveFile = { id: string; name: string; mimeType: string; size?: string; webViewLink?: string; videoMediaMetadata?: { width?: number; height?: number; durationMillis?: string } };
type Job = { id: string; status: string; stage?: string; script: string; video_url: string | null; created_at: string; error_message: string | null; metadata?: Record<string, any>; offers?: Offer };

function formatBytes(value?: string) { const bytes = Number(value ?? 0); if (!bytes) return "tamanho indisponível"; return `${(bytes / 1024 / 1024).toFixed(1)} MB`; }
function formatDuration(value?: string) { const seconds = Math.round(Number(value ?? 0) / 1000); return seconds ? `${seconds}s` : "duração pendente"; }

export function VideosClient({ offers, initialJobs }: { offers: Offer[]; initialJobs: Job[] }) {
  const [selectedOfferId, setSelectedOfferId] = useState(offers[0]?.id ?? "");
  const selectedOffer = useMemo(() => offers.find((offer) => offer.id === selectedOfferId), [offers, selectedOfferId]);
  const [prompt, setPrompt] = useState(() => selectedOffer ? buildGeminiVideoPrompt(selectedOffer) : "");
  const [files, setFiles] = useState<DriveFile[]>([]);
  const [jobs, setJobs] = useState(initialJobs);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const [copied, setCopied] = useState(false);

  async function loadDrive() {
    setBusy(true); setMessage(null);
    const response = await fetch("/api/videos/drive", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) setMessage({ text: data.error ?? "Não foi possível acessar o Google Drive.", error: true });
    else setFiles(data.files ?? []);
    setBusy(false);
  }

  useEffect(() => { if (selectedOffer) setPrompt(buildGeminiVideoPrompt(selectedOffer)); }, [selectedOffer]);
  useEffect(() => { void loadDrive(); }, []);

  async function copyPrompt() {
    await navigator.clipboard.writeText(prompt); setCopied(true); window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadImage() {
    if (!selectedOffer?.image_url) return;
    const url = `/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}`;
    const anchor = document.createElement("a"); anchor.href = url; anchor.download = `${selectedOffer.product_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`; anchor.click();
  }

  async function importVideo(file: DriveFile) {
    if (!selectedOffer) return;
    setBusy(true); setMessage(null);
    const response = await fetch("/api/videos/jobs", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ offerId: selectedOffer.id, driveFileId: file.id, driveFileName: file.name, prompt }) });
    const data = await response.json();
    if (!response.ok) setMessage({ text: data.error ?? "Não foi possível importar o vídeo.", error: true });
    else { setJobs((current) => [data.job, ...current]); setMessage({ text: "Vídeo validado, importado e drafts V2 criados para Facebook e Instagram." }); }
    setBusy(false);
  }

  async function approve(id: string) {
    const response = await fetch(`/api/videos/jobs/${id}/approve`, { method: "POST" }); const data = await response.json();
    if (!response.ok) return setMessage({ text: data.error ?? "Não foi possível aprovar.", error: true });
    setJobs((current) => current.map((job) => job.id === id ? { ...job, status: "approved" } : job));
    setMessage({ text: "Vídeo aprovado. A publicação continua manual e oficial." });
  }

  async function publishInstagram(job: Job) {
    setBusy(true); const response = await fetch("/api/instagram/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ videoJobId: job.id, requestSource: "videos-gemini-drive" }) }); const data = await response.json();
    setMessage({ text: response.ok ? "Reel enviado ao Instagram." : (data.message ?? "Falha ao publicar no Instagram."), error: !response.ok }); setBusy(false);
  }

  async function publishFacebook(job: Job) {
    const postId = job.metadata?.draftIds?.facebook; if (!postId || !job.offers) return setMessage({ text: "Draft do Facebook não encontrado.", error: true });
    setBusy(true); const response = await fetch("/api/facebook/publish", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ postId, offerId: job.offers.id, requestSource: "videos-gemini-drive" }) }); const data = await response.json();
    setMessage({ text: response.ok ? "Publicação enviada ao Facebook." : (data.message ?? "Falha ao publicar no Facebook."), error: !response.ok }); setBusy(false);
  }

  return <div className="mx-auto max-w-7xl space-y-8">
    <header><p className="text-xs font-bold uppercase tracking-[0.18em] text-emerald-400">Gemini · Google Drive</p><h1 className="mt-2 text-3xl font-black tracking-tight text-white">Vídeos de ofertas</h1><p className="mt-2 max-w-3xl text-sm text-white/45">Selecione uma oferta, copie o prompt para o Gemini, gere o vídeo, salve-o na pasta configurada e importe-o para revisão social.</p></header>
    <section className="grid gap-6 xl:grid-cols-[0.85fr_1.15fr]">
      <div className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5">
        <label className="mb-2 block text-xs font-semibold uppercase tracking-wider text-white/35">Oferta existente</label>
        <select value={selectedOfferId} onChange={(event) => setSelectedOfferId(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white"><option value="">Selecione uma oferta</option>{offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name} — R$ {Number(offer.current_price).toFixed(2).replace(".", ",")}</option>)}</select>
        {selectedOffer && <div className="mt-4 rounded-xl border border-white/[0.06] bg-black/20 p-3"><div className="flex items-center gap-3"><img src={selectedOffer.image_url ? `/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}` : ""} alt="" className="h-20 w-20 rounded-lg object-contain" /><div><p className="text-sm font-semibold text-white">{selectedOffer.product_name}</p><p className="text-xs text-emerald-300">{selectedOffer.platform} · R$ {Number(selectedOffer.current_price).toFixed(2).replace(".", ",")}</p></div></div><button onClick={downloadImage} disabled={!selectedOffer.image_url} className="mt-3 inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"><Download size={14} /> Baixar imagem do produto</button></div>}
      </div>
      <div className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5"><div className="flex items-center justify-between"><div><h2 className="font-bold text-white">Prompt estruturado para Gemini</h2><p className="mt-1 text-xs text-white/45">Inclui ação do produto, continuidade, fala segura e requisitos de Reel.</p></div><button onClick={copyPrompt} disabled={!prompt} className="inline-flex items-center gap-2 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-slate-950">{copied ? <Check size={14} /> : <Copy size={14} />} {copied ? "Copiado" : "Copiar prompt"}</button></div><textarea readOnly value={prompt} className="mt-4 h-80 w-full resize-none rounded-xl border border-white/10 bg-[#07101a] px-3 py-3 text-xs leading-5 text-white/80" /></div>
    </section>
    <section className="rounded-2xl border border-sky-400/20 bg-sky-500/[0.04] p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><h2 className="font-bold text-white">Importar vídeo do Google Drive</h2><p className="mt-1 text-xs text-white/45">Somente MP4 vertical 9:16, 3–90s e até 100 MB. O arquivo é copiado para o armazenamento do sistema.</p></div><button onClick={loadDrive} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white"><RefreshCw size={14} className={busy ? "animate-spin" : ""} /> Atualizar pasta</button></div><div className="mt-4 grid gap-3 md:grid-cols-2">{files.length === 0 ? <p className="text-sm text-white/35">Nenhum vídeo encontrado na pasta configurada.</p> : files.map((file) => <div key={file.id} className="flex items-center justify-between gap-3 rounded-xl border border-white/[0.07] bg-black/20 p-3"><div className="flex min-w-0 items-center gap-3"><FileVideo className="shrink-0 text-sky-300" size={20} /><div className="min-w-0"><p className="truncate text-sm font-semibold text-white">{file.name}</p><p className="text-xs text-white/40">{formatBytes(file.size)} · {file.videoMediaMetadata?.width ?? "?"}×{file.videoMediaMetadata?.height ?? "?"} · {formatDuration(file.videoMediaMetadata?.durationMillis)}</p></div></div><button onClick={() => importVideo(file)} disabled={busy || !selectedOfferId} className="shrink-0 rounded-lg bg-sky-400 px-3 py-2 text-xs font-bold text-slate-950 disabled:opacity-40">Importar</button></div>)}</div></section>
    {message && <p className={`rounded-xl border px-4 py-3 text-sm ${message.error ? "border-red-400/20 bg-red-400/10 text-red-200" : "border-emerald-400/20 bg-emerald-400/10 text-emerald-200"}`}>{message.text}</p>}
    <section className="rounded-2xl border border-white/[0.07] bg-white/[0.025] p-5"><div className="mb-5 flex items-center gap-3"><ShieldCheck className="text-emerald-400" size={20} /><div><h2 className="font-bold text-white">Revisão e publicação</h2><p className="mt-1 text-xs text-white/35">Cada importação cria drafts V2 separados. A aprovação e o envio continuam manuais.</p></div></div>{jobs.length === 0 ? <p className="text-sm text-white/35">Nenhum vídeo importado.</p> : <div className="space-y-4">{jobs.map((job) => <article key={job.id} className="rounded-xl border border-white/[0.06] bg-black/20 p-4"><div className="flex items-start justify-between gap-3"><div><p className="font-semibold text-white">{job.offers?.product_name ?? "Oferta"}</p><p className="mt-1 text-xs text-white/40">{job.metadata?.templateId ?? "gemini-drive-v1"} · {job.metadata?.validation?.width ?? "?"}×{job.metadata?.validation?.height ?? "?"} · status: {job.status}</p></div><span className="rounded-full bg-emerald-400/10 px-2 py-1 text-[10px] font-bold text-emerald-300">{job.status === "ready" ? "REVISAR" : job.status.toUpperCase()}</span></div>{job.video_url && <video controls playsInline src={job.video_url} className="mt-4 max-h-[420px] w-full rounded-xl bg-black" />}{job.metadata?.channelCopies && <div className="mt-4 grid gap-3 md:grid-cols-2">{Object.entries(job.metadata.channelCopies).map(([channel, copy]) => <div key={channel} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3"><p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Copy {channel}</p><p className="mt-2 whitespace-pre-wrap text-xs leading-5 text-white/70">{String(copy)}</p></div>)}</div>}{job.error_message && <p className="mt-3 text-xs text-red-300">{job.error_message}</p>}{job.status === "ready" && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => approve(job.id)} className="inline-flex items-center gap-2 rounded-lg bg-violet-500/15 px-3 py-2 text-xs font-bold text-violet-200"><CheckCircle2 size={14} /> Aprovar vídeo</button></div>}{job.status === "approved" && <div className="mt-4 flex flex-wrap gap-2"><button onClick={() => publishFacebook(job)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-blue-500/15 px-3 py-2 text-xs font-bold text-blue-200"><Send size={14} /> Publicar Facebook</button><button onClick={() => publishInstagram(job)} disabled={busy} className="inline-flex items-center gap-2 rounded-lg bg-pink-500/15 px-3 py-2 text-xs font-bold text-pink-200"><Send size={14} /> Publicar Instagram</button></div>}</article>)}</div>}</section>
  </div>;
}
