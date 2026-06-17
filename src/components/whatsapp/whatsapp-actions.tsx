"use client";

import { useState } from "react";
import { MessageCircle, Send, CheckCircle2, AlertTriangle, Image as ImageIcon, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

interface PostWithOffer {
  id: string;
  content: string;
  status: string;
  created_at: string;
  offers: {
    id: string;
    product_name: string;
    platform: string;
    current_price: number;
    old_price: number | null;
    image_url: string | null;
  };
}

export function WhatsappPostApprovalCard({ post }: { post: PostWithOffer }) {
  const [caption, setCaption] = useState(post.content);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  async function handleApproveAndPublish() {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/whatsapp/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          content: caption
        })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        setStatus({
          success: true,
          message: "Mensagem enviada com sucesso no WhatsApp!"
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setStatus({
          success: false,
          message: data.message || "Erro desconhecido ao tentar enviar."
        });
      }
    } catch {
      setStatus({
        success: false,
        message: "Ocorreu um erro de conexão."
      });
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!confirm("Tem certeza que deseja excluir esta sugestão? Ela será removida de todas as redes sociais.")) return;
    
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/offers/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ offerId: post.offers.id })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        setStatus({
          success: true,
          message: data.message
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setStatus({
          success: false,
          message: data.message || "Erro desconhecido ao tentar excluir."
        });
        setLoading(false);
      }
    } catch {
      setStatus({
        success: false,
        message: "Ocorreu um erro de conexão."
      });
      setLoading(false);
    }
  }

  const formattedPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.current_price);
  const formattedOldPrice = post.offers.old_price 
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.old_price) 
    : null;

  return (
    <article className="rounded-lg border border-emerald-500/10 bg-white p-5 shadow-panel grid gap-4 lg:grid-cols-[200px_1fr] items-start">
      <div className="relative aspect-square w-full rounded-md border border-emerald-500/10 bg-paper overflow-hidden flex items-center justify-center">
        {post.offers.image_url ? (
          <img 
            src={`/api/img?url=${encodeURIComponent(post.offers.image_url)}`} 
            alt={post.offers.product_name} 
            className="object-contain w-full h-full p-2"
          />
        ) : (
          <div className="text-ink/40 flex flex-col items-center gap-1">
            <ImageIcon size={32} />
            <span className="text-xs">Sem Imagem</span>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <header className="flex flex-wrap justify-between items-start gap-2 border-b border-emerald-500/10 pb-2">
          <div>
            <h3 className="font-bold text-lg text-ink">{post.offers.product_name}</h3>
            <p className="text-xs text-ink/60">
              Plataforma: <span className="font-semibold">{post.offers.platform}</span> | Preço: <span className="font-semibold text-emerald-600">{formattedPrice}</span>
              {formattedOldPrice && ` (Anterior: ${formattedOldPrice})`}
            </p>
          </div>
          <span className="text-xs rounded-full bg-emerald-100 text-emerald-800 px-2.5 py-0.5 font-semibold uppercase">
            Aguardando Envio
          </span>
        </header>

        <div>
          <label className="block text-xs font-bold text-ink/70 mb-1">
            Mensagem de WhatsApp (Editar se necessário):
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full min-h-[220px] rounded-md border border-emerald-500/20 p-3 text-sm focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 bg-paper text-ink resize-y leading-relaxed font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button
              disabled={loading}
              onClick={handleApproveAndPublish}
              type="button"
              className="bg-emerald-500 hover:bg-emerald-600 text-white"
            >
              {loading ? "Enviando..." : "Aprovar e Enviar no WhatsApp"}
              <Send size={14} />
            </Button>
            
            <Button
              disabled={loading}
              onClick={handleReject}
              type="button"
              variant="ghost"
              className="border-red-200 text-red-600 hover:bg-red-50"
            >
              Excluir Sugestão
              <Trash2 size={14} className="ml-1" />
            </Button>
          </div>
        </div>

        {status && (
          <div className={`rounded-md p-3 text-sm flex items-center gap-2 mt-2 ${status.success ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {status.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {status.message}
          </div>
        )}
      </div>
    </article>
  );
}
