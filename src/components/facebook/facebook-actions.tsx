"use client";

import { useState } from "react";
import { Facebook, Image as ImageIcon, Send, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface PostWithOffer {
  id: string;
  videoJobId?: string | null;
  videoUrl?: string | null;
  content: string;
  status: string;
  created_at: string;
  affiliate_links?: { tracked_url: string } | null;
  offers: {
    id: string;
    product_name: string;
    platform: string;
    current_price: number;
    old_price: number | null;
    image_url: string | null;
    original_url: string;
    coupon: string | null;
    notes: string | null;
  };
}

export function FacebookPostApprovalCard({ post }: { post: PostWithOffer }) {
  const [caption, setCaption] = useState(post.content);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);
  const link = post.affiliate_links?.tracked_url || post.offers.original_url;
  const price = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.current_price);

  async function handleApproveAndPublish() {
    setLoading(true);
    setStatus(null);
    try {
      const saveResponse = await fetch("/api/posts/update-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, channel: "facebook", content: caption })
      });
      if (!saveResponse.ok) {
        const saveData = await saveResponse.json().catch(() => ({}));
        throw new Error(saveData.message || "Não foi possível salvar o texto editado.");
      }
      const response = await fetch("/api/facebook/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, offerId: post.offers.id, ...(post.videoJobId ? { videoJobId: post.videoJobId } : {}), requestSource: "facebook-dashboard" })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setStatus({ success: true, message: "Publicação enviada para a Página do Facebook." });
        setTimeout(() => window.location.reload(), 1200);
      } else {
        setStatus({ success: false, message: data.message || "Não foi possível publicar no Facebook." });
      }
    } catch {
      setStatus({ success: false, message: "Ocorreu um erro de conexão." });
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!confirm("Excluir este rascunho do Facebook? A oferta original será mantida.")) return;
    setLoading(true);
    setStatus(null);
    try {
      const response = await fetch("/api/posts/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, channel: "facebook" })
      });
      const data = await response.json();
      if (response.ok && data.ok) {
        setStatus({ success: true, message: "Rascunho excluído." });
        setTimeout(() => window.location.reload(), 800);
      } else {
        setStatus({ success: false, message: data.message || "Não foi possível excluir o rascunho." });
      }
    } catch {
      setStatus({ success: false, message: "Ocorreu um erro de conexão." });
    } finally {
      setLoading(false);
    }
  }

  return (
    <article className="rounded-lg border border-blue-500/15 bg-white p-5 shadow-panel grid gap-4 lg:grid-cols-[200px_1fr] items-start">
      <div className="relative aspect-square w-full rounded-md border border-blue-500/10 bg-paper overflow-hidden flex items-center justify-center">
        {post.videoUrl ? (
          <video controls playsInline src={post.videoUrl} className="h-full w-full rounded-md bg-black object-contain" />
        ) : post.offers.image_url ? (
          <img src={`/api/images/proxy?url=${encodeURIComponent(post.offers.image_url)}`} referrerPolicy="no-referrer" alt={post.offers.product_name} className="object-contain w-full h-full p-2" />
        ) : (
          <div className="text-ink/40 flex flex-col items-center gap-1"><ImageIcon size={32} /><span className="text-xs">Sem imagem</span></div>
        )}
      </div>
      <div className="grid gap-3">
        <header className="flex flex-wrap justify-between items-start gap-2 border-b border-blue-500/10 pb-2">
          <div>
            <p className="text-xs text-ink/60">🏪 Achado na {post.offers.platform} · <span className="font-semibold text-blue-600">{price}</span></p>
            <p className="text-xs text-ink/55 mt-1 break-all">Link: <a href={link} target="_blank" rel="noreferrer" className="text-blue-700 underline">{link}</a></p>
          </div>
          <span className="text-xs rounded-full bg-blue-100 text-blue-800 px-2.5 py-0.5 font-semibold uppercase inline-flex items-center gap-1"><Facebook size={12} /> Aguardando envio</span>
        </header>
        <div>
          <label className="block text-xs font-bold text-ink/70 mb-1">Texto da publicação no Facebook (editar se necessário):</label>
          <textarea value={caption} onChange={(event) => setCaption(event.target.value)} className="w-full min-h-[220px] rounded-md border border-blue-500/20 p-3 text-sm focus:border-blue-500 focus:ring-1 focus:ring-blue-500 bg-paper text-ink resize-y leading-relaxed font-sans" />
        </div>
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Button disabled={loading} onClick={handleApproveAndPublish} type="button" className="bg-blue-600 hover:bg-blue-700 text-white gap-2"><Send size={16} /> {loading ? "Enviando..." : "Aprovar e publicar"}</Button>
            <Button disabled={loading} onClick={handleReject} type="button" variant="glass" className="border-red-300 text-red-600 hover:bg-red-50 gap-2"><Trash2 size={16} /> Excluir rascunho</Button>
          </div>
          {status && <span className={`text-sm ${status.success ? "text-emerald-700" : "text-red-600"}`}>{status.message}</span>}
        </div>
      </div>
    </article>
  );
}
