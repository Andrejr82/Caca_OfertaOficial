"use client";

import { useState } from "react";
import { Bot, Send, CheckCircle2, AlertTriangle, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

export function InstagramTestButton({ hasToken }: { hasToken: boolean }) {
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<string>("");
  const [success, setSuccess] = useState<boolean | null>(null);

  async function testConnection() {
    setLoading(true);
    setResult("Testando conexão...");
    setSuccess(null);

    try {
      const response = await fetch("/api/instagram/test", { method: "POST" });
      const payload = (await response.json()) as { ok: boolean; message: string };
      setSuccess(payload.ok);
      setResult(payload.message);
    } catch {
      setSuccess(false);
      setResult("Erro ao se conectar com o servidor.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid gap-2">
      <Button 
        disabled={loading || !hasToken} 
        onClick={testConnection} 
        type="button"
        variant="secondary"
        className="w-fit"
      >
        <Bot size={16} />
        {loading ? "Testando..." : "Testar Conexão Instagram"}
      </Button>
      {result ? (
        <div className={`flex items-center gap-2 text-sm mt-1 font-semibold ${success ? "text-moss" : "text-red-500"}`}>
          {success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          {result}
        </div>
      ) : null}
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

export function InstagramPostApprovalCard({ post }: { post: PostWithOffer }) {
  const [caption, setCaption] = useState(post.content);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  async function handleApproveAndPublish() {
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/instagram/publish", {
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
          message: "Post publicado com sucesso no Instagram!"
        });
        // Recarrega a página para atualizar o status do post após 1.5s
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

  // Preços formatados
  const formattedPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.current_price);
  const formattedOldPrice = post.offers.old_price 
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.old_price) 
    : null;

  return (
    <article className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel grid gap-4 lg:grid-cols-[200px_1fr] items-start">
      {/* Coluna da Imagem */}
      <div className="relative aspect-square w-full rounded-md border border-moss/10 bg-paper overflow-hidden flex items-center justify-center">
        {post.offers.image_url ? (
          <img 
            src={post.offers.image_url} 
            alt={post.offers.product_name} 
            className="object-contain h-full w-full"
            onError={(e) => {
              // Fallback se a imagem quebrar
              (e.target as HTMLElement).style.display = "none";
            }}
          />
        ) : (
          <div className="text-ink/40 flex flex-col items-center gap-1">
            <ImageIcon size={32} />
            <span className="text-xs">Sem Imagem</span>
          </div>
        )}
      </div>

      {/* Coluna do Conteúdo / Legenda */}
      <div className="grid gap-3">
        <header className="flex flex-wrap justify-between items-start gap-2 border-b border-moss/10 pb-2">
          <div>
            <h3 className="font-bold text-lg text-ink">{post.offers.product_name}</h3>
            <p className="text-xs text-ink/60">
              Plataforma: <span className="font-semibold">{post.offers.platform}</span> | Preço: <span className="font-semibold text-moss">{formattedPrice}</span>
              {formattedOldPrice && ` (Anterior: ${formattedOldPrice})`}
            </p>
          </div>
          <span className="text-xs rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-0.5 font-semibold uppercase">
            Aguardando Aprovação
          </span>
        </header>

        <div>
          <label className="block text-xs font-bold text-ink/70 mb-1">
            Legenda do Feed e Criativos (Editar se necessário):
          </label>
          <textarea
            value={caption}
            onChange={(e) => setCaption(e.target.value)}
            className="w-full min-h-[220px] rounded-md border border-moss/20 p-3 text-sm focus:border-moss focus:ring-1 focus:ring-moss bg-paper text-ink resize-y leading-relaxed font-sans"
          />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <Button
            disabled={loading || !post.offers.image_url}
            onClick={handleApproveAndPublish}
            type="button"
            className="bg-moss hover:bg-ink text-white"
          >
            {loading ? "Publicando..." : "Aprovar e Publicar no Instagram"}
            <Send size={14} />
          </Button>

          {!post.offers.image_url && (
            <p className="text-xs text-red-500 font-semibold flex items-center gap-1">
              <AlertTriangle size={14} />
              Requer imagem cadastrada no produto para poder postar.
            </p>
          )}
        </div>

        {status && (
          <div className={`rounded-md p-3 text-sm flex items-center gap-2 mt-2 ${status.success ? "bg-moss/10 text-moss border border-moss/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {status.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
            {status.message}
          </div>
        )}
      </div>
    </article>
  );
}
