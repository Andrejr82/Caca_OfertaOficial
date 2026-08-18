"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Bot, Send, CheckCircle2, AlertTriangle, Image as ImageIcon, Trash2, Ticket } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  cleanCouponTitle,
  getCouponCardImageSources,
  isCouponOffer,
  parseCouponDetails
} from "@/lib/coupons/presentation";

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
      <Button disabled={loading || !hasToken} onClick={testConnection} type="button" variant="secondary" className="w-fit">
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
    status?: string | null;
    current_price: number;
    old_price: number | null;
    image_url: string | null;
    original_url: string;
    coupon: string | null;
    notes: string | null;
  };
}

export function InstagramPostApprovalCard({ post, onApproved }: { post: PostWithOffer; onApproved?: (postId: string) => void }) {
  const router = useRouter();
  const [caption, setCaption] = useState(post.content);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string } | null>(null);

  const couponOffer = isCouponOffer(post.offers);
  const couponDetails = couponOffer ? parseCouponDetails(post.offers.notes) : null;
  const couponImage = couponOffer ? getCouponCardImageSources(post.offers) : null;
  const [couponImageSrc, setCouponImageSrc] = useState(couponImage?.initialSrc || "");
  const couponLink = post.affiliate_links?.tracked_url || post.offers.original_url;
  const rejectedOffer = post.offers.status === "rejected";

  useEffect(() => {
    setCouponImageSrc(couponImage?.initialSrc || "");
  }, [couponImage?.initialSrc]);

  async function handleApproveAndPublish() {
    if (rejectedOffer) {
      setStatus({ success: false, message: "Esta oferta foi rejeitada e não pode ser publicada." });
      return;
    }
    setLoading(true);
    setStatus(null);

    try {
      const saveResponse = await fetch("/api/posts/update-content", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, channel: "instagram", content: caption })
      });
      if (!saveResponse.ok) {
        const saveData = await saveResponse.json().catch(() => ({}));
        throw new Error(saveData.message || "Não foi possível salvar a legenda editada.");
      }
      const response = await fetch("/api/instagram/publish", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          postId: post.id,
          offerId: post.offers.id,
          ...(post.videoJobId ? { videoJobId: post.videoJobId } : {}),
          requestSource: "instagram-dashboard"
        })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        onApproved?.(post.id);
        setStatus({ success: true, message: "Post publicado com sucesso no Instagram!" });
        router.refresh();
      } else {
        setStatus({ success: false, message: data.message || "Erro desconhecido ao tentar publicar." });
      }
    } catch {
      setStatus({ success: false, message: "Ocorreu um erro de conexão." });
    } finally {
      setLoading(false);
    }
  }

  async function handleReject() {
    if (!confirm("Tem certeza que deseja excluir esta publicação do Instagram? A oferta original será mantida.")) return;
    setLoading(true);
    setStatus(null);

    try {
      const response = await fetch("/api/posts/reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postId: post.id, channel: "instagram" })
      });
      const data = await response.json();

      if (response.ok && data.ok) {
        setStatus({ success: true, message: data.message });
        setTimeout(() => window.location.reload(), 1500);
      } else {
        setStatus({ success: false, message: data.message || "Erro desconhecido ao tentar excluir." });
      }
    } catch {
      setStatus({ success: false, message: "Ocorreu um erro de conexão." });
    } finally {
      setLoading(false);
    }
  }

  const formattedPrice = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.current_price);
  const formattedOldPrice = post.offers.old_price
    ? new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" }).format(post.offers.old_price)
    : null;

  return (
    <article className="rounded-lg border border-moss/10 bg-white p-5 shadow-panel grid gap-4 lg:grid-cols-[200px_1fr] items-start">
      <div className="relative aspect-square w-full rounded-md border border-moss/10 bg-paper overflow-hidden flex items-center justify-center">
        {couponOffer ? (
          <img src={couponImageSrc} alt={cleanCouponTitle(post.offers.product_name)} className="object-contain w-full h-full p-2" onError={() => setCouponImageSrc(couponImage?.fallbackSrc || "/coupon-assets/default-coupon.png")} />
        ) : post.videoUrl ? (
          <video controls playsInline src={post.videoUrl} className="object-contain w-full h-full bg-black" />
        ) : post.offers.image_url ? (
          <img src={`/api/images/proxy?url=${encodeURIComponent(post.offers.image_url)}`} referrerPolicy="no-referrer" alt={post.offers.product_name} className="object-contain w-full h-full p-2" />
        ) : (
          <div className="text-ink/40 flex flex-col items-center gap-1"><ImageIcon size={32} /><span className="text-xs">Sem Imagem</span></div>
        )}
      </div>

      <div className="grid gap-3">
        <header className="flex flex-wrap justify-between items-start gap-2 border-b border-moss/10 pb-2">
          <div>
            {couponOffer ? (
              <>
                <div className="flex flex-wrap items-center gap-2 mb-2">
                  <span className="text-xs rounded-full bg-pink-100 text-pink-800 px-2.5 py-0.5 font-semibold uppercase inline-flex items-center gap-1"><Ticket size={12} /> Cupom</span>
                  <span className="text-xs text-ink/60">Marketplace: <span className="font-semibold">{post.offers.platform}</span></span>
                </div>
                {post.offers.coupon ? <p className="text-sm font-semibold text-pink-700">Código: {post.offers.coupon}</p> : null}
                <p className="text-xs text-ink/70 mt-1">{couponDetails?.description}</p>
                {couponDetails?.validity ? <p className="text-xs text-ink/55 mt-1">Validade: {couponDetails.validity}</p> : null}
                <p className="text-xs text-ink/55 mt-1 break-all">Link afiliado: <a href={couponLink} target="_blank" rel="noreferrer" className="font-semibold text-moss underline underline-offset-2">{couponLink}</a></p>
              </>
            ) : (
              <p className="text-xs text-ink/60">Plataforma: <span className="font-semibold">{post.offers.platform}</span> | Preço: <span className="font-semibold text-moss">{formattedPrice}</span>{formattedOldPrice && ` (Anterior: ${formattedOldPrice})`}</p>
            )}
          </div>
          <span className="text-xs rounded-full bg-yellow-100 text-yellow-800 px-2.5 py-0.5 font-semibold uppercase">Aguardando Aprovação</span>
        </header>

        {rejectedOffer && (
          <p className="flex items-center gap-2 rounded-md border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-600">
            <AlertTriangle size={16} /> Esta oferta foi rejeitada e não pode ser publicada.
          </p>
        )}

        <div>
          <label className="block text-xs font-bold text-ink/70 mb-1">Legenda do Feed e Criativos (Editar se necessário):</label>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} className="w-full min-h-[220px] rounded-md border border-moss/20 p-3 text-sm focus:border-moss focus:ring-1 focus:ring-moss bg-paper text-ink resize-y leading-relaxed font-sans" />
        </div>

        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Button disabled={loading || rejectedOffer || (!couponOffer && !post.offers.image_url)} onClick={handleApproveAndPublish} type="button" className="bg-moss hover:bg-ink text-white">
              {loading ? "Processando..." : "Aprovar e Publicar no Instagram"}<Send size={14} />
            </Button>
            <Button disabled={loading} onClick={handleReject} type="button" variant="ghost" className="border-red-200 text-red-600 hover:bg-red-50">Excluir Sugestão<Trash2 size={14} className="ml-1" /></Button>
          </div>

          {!rejectedOffer && !couponOffer && !post.offers.image_url && (
            <p className="text-xs text-red-500 font-semibold flex items-center gap-1"><AlertTriangle size={14} /> Requer imagem cadastrada no produto para poder postar.</p>
          )}
        </div>

        {status && (
          <div className={`rounded-md p-3 text-sm flex items-center gap-2 mt-2 ${status.success ? "bg-moss/10 text-moss border border-moss/20" : "bg-red-50 text-red-600 border border-red-200"}`}>
            {status.success ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}{status.message}
          </div>
        )}
      </div>
    </article>
  );
}
