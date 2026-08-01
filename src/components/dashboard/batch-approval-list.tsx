"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Trash2 } from "lucide-react";
import { TelegramPostApprovalCard } from "@/components/telegram/telegram-actions";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";
import { WhatsappPostApprovalCard } from "@/components/whatsapp/whatsapp-actions";
import { FacebookPostApprovalCard } from "@/components/facebook/facebook-actions";

// Tipagem base que cobre os campos comuns que os Cards precisam
interface PostWithOffer {
  id: string;
  videoJobId?: string | null;
  content: string;
  status: string;
  external_id: string | null;
  posted_at: string | null;
  created_at: string;
  affiliate_links?: {
    tracked_url: string;
  } | null;
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

export function BatchApprovalList({ 
  posts, 
  channel 
}: { 
  posts: PostWithOffer[], 
  channel: "telegram" | "instagram" | "whatsapp" | "facebook" 
}) {
  const router = useRouter();
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  function toggleSelection(postId: string) {
    const newSet = new Set(selectedIds);
    if (newSet.has(postId)) {
      newSet.delete(postId);
    } else {
      newSet.add(postId);
    }
    setSelectedIds(newSet);
  }

  function toggleAll() {
    if (selectedIds.size === posts.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(posts.map(p => p.id)));
    }
  }

  async function handleBulkDelete() {
    if (selectedIds.size === 0) return;
    if (!confirm(`Tem certeza que deseja excluir ${selectedIds.size} publicações de uma vez? Apenas as publicações destes canais serão removidas.`)) return;

    setLoading(true);

    try {
      const response = await fetch("/api/posts/bulk-reject", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ postIds: Array.from(selectedIds), channel })
      });
      const data = await response.json();

      if (response.ok && typeof data.successCount === "number" && typeof data.failureCount === "number") {
        alert(data.message);
        setSelectedIds(new Set());
        router.refresh();
      } else {
        alert(data.message || "Erro desconhecido ao tentar excluir em lote.");
      }
    } catch {
      alert("Ocorreu um erro de conexão.");
    } finally {
      setLoading(false);
    }
  }

  if (posts.length === 0) {
    return (
      <div className="glass-card p-6 text-center">
        <p className="text-sm text-white/30">
          Nenhuma mensagem aguardando aprovação. Use o Robô de Tendências no Dashboard ou cadastre uma nova oferta.
        </p>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      {/* Barra de Ações em Lote */}
      {posts.length > 0 && (
        <div className="flex items-center justify-between bg-white/5 border border-white/10 rounded-lg p-3">
          <div className="flex items-center gap-3">
            <input 
              type="checkbox" 
              checked={selectedIds.size === posts.length && posts.length > 0}
              onChange={toggleAll}
              className="w-5 h-5 rounded border-white/20 bg-black/20 text-red-500 cursor-pointer accent-red-500"
              title="Selecionar todos"
            />
            <span className="text-sm font-medium text-white/70">
              {selectedIds.size} selecionados
            </span>
          </div>

          {selectedIds.size > 0 && (
            <Button 
              variant="glass" 
              onClick={handleBulkDelete}
              disabled={loading}
              className="gap-2 text-red-500 border-red-500/50 hover:bg-red-500/10"
            >
              <Trash2 size={16} />
              {loading ? "Excluindo..." : "Excluir Selecionados"}
            </Button>
          )}
        </div>
      )}

      {/* Lista de Posts */}
      <div className="grid gap-4">
        {posts.map((post) => {
          const isSelected = selectedIds.has(post.id);
          
          return (
            <div key={post.id} className="relative group">
              {/* Checkbox Sobreposto na Imagem do Card */}
              <div className="absolute top-4 left-4 z-20">
                <input 
                  type="checkbox"
                  checked={isSelected}
                  onChange={() => toggleSelection(post.id)}
                  className="w-6 h-6 rounded border-2 border-white/40 bg-black/40 text-red-500 cursor-pointer accent-red-500 shadow-md backdrop-blur-sm transition-all hover:scale-110"
                />
              </div>

              {/* Card Específico do Canal */}
              <div className={`transition-all ${isSelected ? "ring-2 ring-red-500/50 rounded-lg opacity-60" : ""}`}>
                {channel === "telegram" && <TelegramPostApprovalCard post={post} />}
                {channel === "instagram" && <InstagramPostApprovalCard post={post} />}
                {channel === "whatsapp" && <WhatsappPostApprovalCard post={post} />}
                {channel === "facebook" && <FacebookPostApprovalCard post={post} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
