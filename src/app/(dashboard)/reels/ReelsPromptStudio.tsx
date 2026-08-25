"use client";

import { useMemo, useState } from "react";
import { Check, Copy, Download, Film, ImageIcon } from "lucide-react";

import { buildTwoSceneReelsPlan, type ReelsPromptOffer } from "@/lib/videos/reels-playbook";

function CopyButton({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1200);
  }

  return (
    <button
      type="button"
      onClick={() => void copy()}
      className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 py-1.5 text-[11px] font-bold text-white/70 hover:bg-white/[0.08]"
    >
      {copied ? <Check size={13} /> : <Copy size={13} />}
      {copied ? "Copiado" : label}
    </button>
  );
}

export function ReelsPromptStudio({ offers }: { offers: ReelsPromptOffer[] }) {
  const [offerId, setOfferId] = useState(offers[0]?.id ?? "");
  const selectedOffer = offers.find((offer) => offer.id === offerId) ?? null;
  const plan = useMemo(() => selectedOffer ? buildTwoSceneReelsPlan(selectedOffer) : null, [selectedOffer]);

  function downloadImage() {
    if (!selectedOffer?.image_url) return;
    const url = `/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}`;
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${selectedOffer.product_name.replace(/[^a-z0-9]+/gi, "-").toLowerCase()}.jpg`;
    anchor.click();
  }

  return (
    <section className="rounded-2xl border border-fuchsia-400/20 bg-fuchsia-500/[0.04] p-5">
      <div className="flex items-start gap-3">
        <Film className="mt-0.5 text-fuchsia-300" size={20} />
        <div>
          <p className="text-xs font-bold uppercase tracking-[0.18em] text-fuchsia-300">Google Vids • 20 segundos</p>
          <h2 className="mt-1 font-bold text-white">Roteiro em 2 cenas de 10s</h2>
          <p className="mt-1 text-xs text-white/50">Baixe a imagem, copie cada prompt e gere as duas cenas no Google Vids. O vídeo final continua em Vídeos de Ofertas para importação e recorte.</p>
        </div>
      </div>

      <label className="mt-5 block text-xs text-white/60">Oferta
        <select
          value={offerId}
          onChange={(event) => setOfferId(event.target.value)}
          className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b111d] px-3 py-2 text-sm text-white"
        >
          <option value="">Selecione uma oferta</option>
          {offers.map((offer) => (
            <option key={offer.id} value={offer.id}>{offer.product_name} — {offer.platform}</option>
          ))}
        </select>
      </label>

      {!selectedOffer || !plan ? (
        <div className="mt-4 rounded-xl border border-dashed border-white/10 p-4 text-sm text-white/45">Nenhuma oferta elegível para preparar o roteiro.</div>
      ) : (
        <div className="mt-4 space-y-4">
          <div className="grid gap-4 rounded-xl border border-white/10 bg-black/20 p-3 sm:grid-cols-[120px_1fr]">
            {selectedOffer.image_url ? (
              <img
                src={`/api/images/proxy?url=${encodeURIComponent(selectedOffer.image_url)}`}
                alt={selectedOffer.product_name}
                className="h-28 w-full rounded-lg bg-white object-contain"
              />
            ) : (
              <div className="flex h-28 items-center justify-center rounded-lg bg-white/5 text-white/30"><ImageIcon size={24} /></div>
            )}
            <div>
              <p className="font-semibold text-white">{selectedOffer.product_name}</p>
              <p className="mt-1 text-xs text-white/45">{selectedOffer.platform} • {plan.niche}</p>
              <p className="mt-2 text-sm font-bold text-emerald-300">{selectedOffer.current_price.toLocaleString("pt-BR", { style: "currency", currency: "BRL" })}</p>
              <p className="mt-2 text-xs text-fuchsia-200">Ângulo: {plan.angle}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={downloadImage}
                  disabled={!selectedOffer.image_url}
                  className="inline-flex items-center gap-2 rounded-lg bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-40"
                >
                  <Download size={14} /> Baixar imagem
                </button>
              </div>
              <p className="mt-2 text-[11px] text-white/40">Use a mesma imagem de referência nas duas gerações para reforçar a continuidade.</p>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-2">
            {plan.scenes.map((scene) => (
              <article key={scene.number} className="rounded-xl border border-white/10 bg-black/20 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black uppercase tracking-[0.14em] text-fuchsia-300">Cena {scene.number} • {scene.durationSeconds}s</p>
                    <p className="mt-1 text-sm font-semibold text-white">{scene.purpose}</p>
                  </div>
                  <CopyButton value={scene.prompt} label="Copiar prompt" />
                </div>

                <div className="mt-4 space-y-3 text-xs">
                  <div>
                    <p className="font-bold text-white/55">Prompt completo para Google Vids</p>
                    <p className="mt-1 whitespace-pre-wrap rounded-lg bg-white/[0.035] p-3 leading-5 text-white/70">{scene.prompt}</p>
                  </div>
                  <div>
                    <p className="font-bold text-white/55">Resumo do que o prompt já inclui</p>
                    <p className="mt-1 rounded-lg bg-white/[0.035] p-3 leading-5 text-white/60">Fala do avatar: {scene.avatarSpeech}<br />Texto na tela: {scene.overlayText}</p>
                  </div>
                </div>
              </article>
            ))}
          </div>

          <div className="rounded-xl border border-emerald-400/15 bg-emerald-500/[0.04] p-3 text-xs text-emerald-100/80">
            <span className="font-bold">CTA final:</span> {plan.cta}
          </div>
        </div>
      )}
    </section>
  );
}
