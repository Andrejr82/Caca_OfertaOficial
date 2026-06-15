"use client";

import { useState } from "react";
import { Bot, Send, CheckCircle2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import Image from "next/image";

export function TelegramTestButton({ disabled }: { disabled: boolean }) {
  const [result, setResult] = useState<string>("");

  async function testConnection() {
    setResult("Testando...");
    const response = await fetch("/api/telegram/test", { method: "POST" });
    const payload = (await response.json()) as { message: string };
    setResult(payload.message);
  }

  return (
    <div className="grid gap-2">
      <Button disabled={disabled} onClick={testConnection} type="button">
        <Bot size={16} />
        Testar conexão
      </Button>
      {result ? <p className="text-sm text-ink/70">{result}</p> : null}
    </div>
  );
}

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

export function TelegramPostApprovalCard({ post }: { post: PostWithOffer }) {
  const [caption, setCaption] = useState(post.content);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  async function handleApproveAndPublish() {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/telegram/publish", {
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
          message: "Post publicado com sucesso no Telegram!"
        });
        setTimeout(() => {
          window.location.reload();
        }, 1500);
      } else {
        setStatus({
          success: false,
          message: data.message || "Erro desconhecido ao tentar publicar."
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

  const formattedPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.current_price);
  const formattedOldPrice = post.offers.old_price 
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.old_price) 
    : null;

  return (
    <article className="rounded-lg border border-sky-500/10 bg-white p-5 shadow-panel grid gap-4 lg:grid-cols-[200px_1fr] items-start">
      <div className="relative aspect-square w-full rounded-md border border-sky-500/10 bg-paper overflow-hidden flex items-center justify-center">
        {post.offers.image_url ? (
          <Image 
            src={post.offers.image_url} 
            alt={post.offers.product_name} 
            fill
            className="object-contain"
            sizes="(max-width: 768px) 100vw, 200px"
          />
        ) : (
          <div className="text-ink/40 flex flex-col items-center gap-1">
            <ImageIcon size={32} />
            <span className="text-xs">Sem Imagem</span>
          </div>
        )}
      </div>

      <div className="grid gap-3">
        <header className="flex flex-wrap justify-between items-start gap-2 border-b border-sky-500/10 pb-2">
          <div>
            <h3 className="font-bold text-lg text-ink">{post.offers.product_name}</h3>
            <p className="text-xs text-ink/60">
              Plataforma: <span className="font-semibold">{post.offers.platform}</span> | Preço: <span className="font-semibold text-sky-600">{formattedPrice}</span>
              {formattedOldPrice && ` (Anterior: ${formattedOldPrice})`}
            </p>
          </div>
          <span className="text-xs rounded-full bg-sky-100 text-sky-800 px-2.5 py-0.5 font-semibold uppercase">
            Aguardando Aprovação
          </span>
        </header>

        <div>
          <label className="block text-xs font-bold text-ink/70 mb-1">
            Texto da Mensagem (Editar se necessário):
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full min-h-[220px] rounded-md border border-sky-500/20 p-3 text-sm focus:border-sky-500 focus:ring-1 focus:ring-sky-500 bg-paper text-ink resize-y leading-relaxed font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            disabled={loading}
            onClick={handleApproveAndPublish}
            type="button"
            className="bg-sky-500 hover:bg-sky-600 text-white"
          >
            {loading ? "Publicando..." : "Aprovar e Publicar no Telegram"}
            <Send size={14} />
          </Button>
        </div>

        {status && (
          <div className={`rounded-md p-3 text-sm flex items-center gap-2 mt-2 ${status.success ? "bg-sky-50 text-sky-700 border border-sky-200" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {status.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {status.message}
          </div>
        )}
      </div>
    </article>
  );
}
