"use client";

import { useMemo, useState } from "react";
import { Download, Facebook, Instagram, Loader2, Send } from "lucide-react";

type Channel = "instagram" | "facebook";
type StoryOption = {
  offerId: string;
  productName: string;
  platform: string;
  currentPrice: number;
  frameCount: 1 | 2;
  drafts: Partial<Record<Channel, { postId: string; trackedUrl: string | null }>>;
};

export function StoriesClient({ options }: { options: StoryOption[] }) {
  const [selectedOfferId, setSelectedOfferId] = useState(options[0]?.offerId ?? "");
  const [channel, setChannel] = useState<Channel>("instagram");
  const [frame, setFrame] = useState<1 | 2>(1);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; error?: boolean } | null>(null);
  const selected = useMemo(() => options.find((option) => option.offerId === selectedOfferId) ?? null, [options, selectedOfferId]);
  const draft = selected?.drafts[channel] ?? null;
  const previewUrl = draft ? `/api/images/story-creative?postId=${encodeURIComponent(draft.postId)}&frame=${frame}` : null;

  function selectOffer(id: string) {
    setSelectedOfferId(id);
    setFrame(1);
    setMessage(null);
  }

  function selectChannel(next: Channel) {
    setChannel(next);
    setFrame(1);
    setMessage(null);
  }

  async function publish() {
    if (!draft) return;
    setBusy(true);
    setMessage(null);
    try {
      const response = await fetch("/api/stories/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: draft.postId, channel, frame }),
      });
      const data = await response.json();
      setMessage(response.ok
        ? { text: channel === "instagram"
          ? "Story publicado no Instagram. A oferta já fica disponível automaticamente na vitrine do link da bio."
          : "Story publicado no Facebook." }
        : { text: data.message ?? "Não foi possível publicar o Story.", error: true });
    } catch {
      setMessage({ text: "Falha de rede ao publicar o Story.", error: true });
    } finally {
      setBusy(false);
    }
  }

  if (!options.length) {
    return <div className="glass-card p-8 text-center text-sm text-white/50">Nenhuma oferta do ciclo atual possui draft de Story.</div>;
  }

  return <div className="grid gap-6 xl:grid-cols-[0.8fr_1.2fr]">
    <section className="glass-card grid gap-5 p-5">
      <div>
        <label className="mb-2 block text-xs font-bold uppercase tracking-wider text-white/35">Produto do dia</label>
        <select value={selectedOfferId} onChange={(event) => selectOffer(event.target.value)} className="w-full rounded-xl border border-white/10 bg-[#0b111d] px-3 py-3 text-sm text-white">
          {options.map((option) => <option key={option.offerId} value={option.offerId}>{option.productName} — R$ {option.currentPrice.toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</option>)}
        </select>
      </div>

      <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/35">Publicar em</p>
        <div className="grid grid-cols-2 gap-2">
          <button type="button" onClick={() => selectChannel("instagram")} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${channel === "instagram" ? "border-pink-400/40 bg-pink-500/15 text-pink-200" : "border-white/10 bg-white/[0.03] text-white/55"}`}><Instagram size={16}/> Instagram</button>
          <button type="button" onClick={() => selectChannel("facebook")} className={`inline-flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold ${channel === "facebook" ? "border-blue-400/40 bg-blue-500/15 text-blue-200" : "border-white/10 bg-white/[0.03] text-white/55"}`}><Facebook size={16}/> Facebook</button>
        </div>
      </div>

      {selected?.frameCount === 2 && <div>
        <p className="mb-2 text-xs font-bold uppercase tracking-wider text-white/35">Arte</p>
        <div className="grid grid-cols-2 gap-2">
          {[1, 2].map((item) => <button key={item} type="button" onClick={() => setFrame(item as 1 | 2)} className={`rounded-xl border px-3 py-2 text-xs font-bold ${frame === item ? "border-fuchsia-400/40 bg-fuchsia-500/15 text-fuchsia-200" : "border-white/10 text-white/45"}`}>Arte {item}</button>)}
        </div>
      </div>}

      <div className="rounded-xl border border-white/10 bg-black/15 p-4 text-sm">
        <p className="font-bold text-white">{selected?.productName}</p>
        <p className="mt-1 text-xs text-white/40">{selected?.platform}</p>
        {!draft ? <p className="mt-3 text-amber-300">Esta oferta não possui draft de {channel === "instagram" ? "Instagram" : "Facebook"}.</p> : !draft.trackedUrl ? <p className="mt-3 text-amber-300">Sem link rastreado: publicação bloqueada.</p> : <p className="mt-3 text-emerald-300">Draft e link rastreado prontos. No Instagram, a oferta entra na vitrine automaticamente após a publicação.</p>}
      </div>

      <button type="button" onClick={publish} disabled={busy || !draft?.trackedUrl} className="inline-flex items-center justify-center gap-2 rounded-xl bg-fuchsia-600 px-4 py-3 text-sm font-extrabold text-white hover:bg-fuchsia-500 disabled:cursor-not-allowed disabled:opacity-40">
        {busy ? <Loader2 size={16} className="animate-spin"/> : <Send size={16}/>} {busy ? "Publicando…" : `Publicar no ${channel === "instagram" ? "Instagram" : "Facebook"}`}
      </button>
      {previewUrl && <a href={`${previewUrl}&download=1`} className="inline-flex items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-3 text-sm font-bold text-white/65 hover:text-white"><Download size={16}/> Baixar arte</a>}
      {message && <p className={`rounded-xl p-3 text-sm ${message.error ? "bg-red-500/10 text-red-300" : "bg-emerald-500/10 text-emerald-300"}`}>{message.text}</p>}
    </section>

    <section className="glass-card p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-xs font-bold uppercase tracking-wider text-fuchsia-300">Preview</p><h2 className="mt-1 font-bold text-white">Story 1080 × 1920</h2></div>
        {selected?.frameCount === 2 && <span className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10px] font-extrabold text-white/45">ARTE {frame}/2</span>}
      </div>
      {previewUrl ? <div className="mx-auto max-w-[360px] overflow-hidden rounded-2xl border border-white/10 bg-black"><img src={previewUrl} alt="Preview do Story selecionado" className="aspect-[9/16] w-full object-cover"/></div> : <div className="grid min-h-[520px] place-items-center rounded-2xl border border-dashed border-white/10 text-center text-sm text-white/35">Selecione uma rede com draft disponível para visualizar a arte.</div>}
    </section>
  </div>;
}
