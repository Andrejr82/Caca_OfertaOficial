"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldCheck, Upload } from "lucide-react";

import { createClient } from "@/lib/supabase/browser";
import { MAX_AUTHORIZED_REEL_BYTES } from "@/lib/videos/authorized-reel";
import type { CreativeRightsStatus } from "@/lib/videos/creative-candidate";

type Offer = { id: string; product_name: string; platform: string; current_price: number };
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
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);

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
      setMessage({ text: "Criativo importado. Agora certifique os sinais visuais antes da aprovação." });
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
          <h2 className="font-bold text-white">Importar criativo autorizado</h2>
          <p className="mt-1 text-xs text-white/50">Envie somente conteúdo próprio ou com autorização válida. O arquivo vai direto ao storage, sem passar pelo corpo da requisição da Vercel.</p>
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
          <input value={sourceUrl} onChange={(event) => setSourceUrl(event.target.value)} placeholder="https://instagram.com/reel/..." className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white" />
        </label>
        <label className="text-xs text-white/60">Observação da autorização (opcional)
          <input value={sourceNote} onChange={(event) => setSourceNote(event.target.value)} maxLength={500} className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white" />
        </label>
      </div>

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
