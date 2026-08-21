"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Copy, Download, ExternalLink, ShieldCheck, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";
import { MAX_AUTHORIZED_REEL_BYTES } from "@/lib/videos/authorized-reel";
import type { CreativeRightsStatus } from "@/lib/videos/creative-candidate";
import { buildReelsGeminiPrompt } from "@/lib/videos/reels-gemini-prompt";

type Offer = {
  id: string;
  product_name: string;
  platform: string;
  current_price: number;
  image_url?: string | null;
};
type VideoMeta = { width: number; height: number; durationSeconds: number };

const RIGHTS: Array<{ value: Exclude<CreativeRightsStatus, "unverified">; label: string }> = [
  { value: "owned", label: "Vídeo próprio" },
  { value: "seller_authorized", label: "Autorizado pelo vendedor" },
  { value: "creator_authorized", label: "Autorizado pelo criador" },
  { value: "official_reusable", label: "Material oficial reutilizável" },
];

function inspectVideo(file: File) {
  return new Promise<VideoMeta>((resolve, reject) => {
    const video = document.createElement("video");
    const url = URL.createObjectURL(file);
    video.preload = "metadata";
    video.onloadedmetadata = () => {
      const result = { width: video.videoWidth, height: video.videoHeight, durationSeconds: video.duration };
      URL.revokeObjectURL(url);
      if (!result.width || !result.height || !Number.isFinite(result.durationSeconds)) reject(new Error("Metadados do vídeo inválidos."));
      else resolve(result);
    };
    video.onerror = () => { URL.revokeObjectURL(url); reject(new Error("Não foi possível ler o vídeo.")); };
    video.src = url;
  });
}

export function AuthorizedReelsClient({ offers }: { offers: Offer[] }) {
  const router = useRouter();
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const [rightsStatus, setRightsStatus] = useState<Exclude<CreativeRightsStatus, "unverified"> | "">("");
  const [sourceUrl, setSourceUrl] = useState("");
  const [sourceNote, setSourceNote] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [videoMeta, setVideoMeta] = useState<VideoMeta | null>(null);
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const selectedOffer = offers.find((offer) => offer.id === offerId) ?? null;
  const geminiPrompt = selectedOffer ? buildReelsGeminiPrompt(selectedOffer) : "";

  async function copyPrompt() {
    if (!geminiPrompt) return;
    await navigator.clipboard.writeText(geminiPrompt);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1800);
  }

  function downloadImage() {
    if (!selectedOffer?.image_url) return;
    const url = `/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedOffer.product_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`;
    anchor.click();
  }

  async function chooseFile(nextFile: File | null) {
    setMessage(null);
    setVideoMeta(null);
    setFile(null);
    if (!nextFile) return;
    if (nextFile.type !== "video/mp4" || !nextFile.name.toLowerCase().endsWith(".mp4")) {
      setMessage({ text: "Use um arquivo MP4.", error: true }); return;
    }
    if (nextFile.size <= 0 || nextFile.size > MAX_AUTHORIZED_REEL_BYTES) {
      setMessage({ text: "O vídeo deve ter até 100 MB.", error: true }); return;
    }
    try {
      const metadata = await inspectVideo(nextFile);
      setFile(nextFile);
      setVideoMeta(metadata);
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Vídeo inválido.", error: true });
    }
  }

  async function upload() {
    if (!file || !videoMeta || !offerId || !rightsStatus) return;
    setBusy(true); setMessage(null);
    const payload = {
      offerId,
      fileName: file.name,
      fileSize: file.size,
      mimeType: "video/mp4" as const,
      rightsStatus,
      sourceUrl,
      sourceNote,
      ...videoMeta,
    };

    try {
      const startResponse = await fetch("/api/reels/upload", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const start = await startResponse.json();
      if (!startResponse.ok) throw new Error(start.error ?? "Não foi possível preparar o upload.");

      const supabase = createClient();
      const { error: uploadError } = await supabase.storage.from("videos").uploadToSignedUrl(start.path, start.token, file, {
        contentType: "video/mp4",
      });
      if (uploadError) throw new Error(uploadError.message);

      const finalizeResponse = await fetch("/api/reels/finalize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...payload, uploadId: start.uploadId }),
      });
      const finalized = await finalizeResponse.json();
      if (!finalizeResponse.ok) throw new Error(finalized.error ?? "Não foi possível registrar o criativo.");

      setFile(null); setVideoMeta(null); setRightsStatus(""); setSourceUrl(""); setSourceNote("");
      setMessage({ text: "Criativo importado. Aguardando verificação real do arquivo na Oracle antes de liberar a certificação." });
      router.refresh();
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Falha ao importar o criativo.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.04] p-5">
      <div className="mb-5 flex items-start gap-3">
        <ShieldCheck className="mt-0.5 text-emerald-400" size={20} />
        <div>
          <h2 className="font-bold text-white">Gemini + importar criativo autorizado</h2>
          <p className="mt-1 text-xs text-white/50">Escolha a oferta, gere no Gemini com o prompt curto de movimento e depois importe o MP4 para certificação.</p>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <label className="text-xs text-white/60">Produto / oferta associada
          <select value={offerId} onChange={(event) => setOfferId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white">
            <option value="">Selecione uma oferta</option>
            {offers.map((offer) => <option key={offer.id} value={offer.id}>{offer.product_name} — {offer.platform}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">Direito de uso
          <select value={rightsStatus} onChange={(event) => setRightsStatus(event.target.value as typeof rightsStatus)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white">
            <option value="">Selecione</option>
            {RIGHTS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
          </select>
        </label>
        <label className="text-xs text-white/60">URL de origem (opcional)
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://gemini.google.com/..." className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-white/60">Observação da autorização (opcional)
          <input value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white" />
        </label>
      </div>

      {selectedOffer && (
        <div className="mt-5 rounded-xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-4">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
            {selectedOffer.image_url && (
              <img src={`/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}`} alt={selectedOffer.product_name} className="h-28 w-28 rounded-xl bg-black/30 object-contain" />
            )}
            <div className="min-w-0 flex-1">
              <p className="text-xs font-bold uppercase tracking-[0.16em] text-fuchsia-300">Prompt Gemini — Reel 8s</p>
              <p className="mt-1 text-sm font-semibold text-white">{selectedOffer.product_name}</p>
              <textarea readOnly value={geminiPrompt} rows={12} className="mt-3 w-full rounded-xl border border-white/10 bg-black/25 px-3 py-3 text-xs leading-5 text-white/75" />
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => void copyPrompt()} className="inline-flex items-center gap-2 rounded-lg bg-fuchsia-500/20 px-3 py-2 text-xs font-bold text-fuchsia-100 hover:bg-fuchsia-500/30">
                  <Copy size={14} /> {copied ? "Prompt copiado" : "Copiar prompt"}
                </button>
                <button onClick={downloadImage} disabled={!selectedOffer.image_url} className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40">
                  <Download size={14} /> Baixar imagem
                </button>
                <a href="https://gemini.google.com/app" target="_blank" rel="noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-xs font-bold text-white/80 hover:bg-white/[0.08]">
                  <ExternalLink size={14} /> Abrir Gemini
                </a>
              </div>
              <p className="mt-2 text-[11px] text-white/40">Gere o MP4 no Gemini e volte para esta mesma seção para importar e certificar.</p>
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 rounded-xl border border-dashed border-white/15 p-4">
        <input type="file" accept="video/mp4,.mp4" onChange={(event) => void chooseFile(event.target.files?.[0] ?? null)} className="block w-full text-xs text-white/60 file:mr-3 file:rounded-lg file:border-0 file:bg-white/10 file:px-3 file:py-2 file:text-xs file:font-bold file:text-white" />
        {file && videoMeta && <p className="mt-2 text-xs text-white/45">{file.name} · {(file.size / 1024 / 1024).toFixed(1)} MB · {videoMeta.width}×{videoMeta.height} · {videoMeta.durationSeconds.toFixed(1)}s</p>}
      </div>

      <button onClick={upload} disabled={busy || !file || !videoMeta || !offerId || !rightsStatus} className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-500/20 px-4 py-2 text-xs font-bold text-emerald-100 hover:bg-emerald-500/30 disabled:opacity-40">
        <Upload size={14} /> {busy ? "Importando…" : "Importar criativo"}
      </button>
      {message && <p className={`mt-3 text-xs ${message.error ? "text-red-300" : "text-emerald-300"}`}>{message.text}</p>}
    </section>
  );
}
