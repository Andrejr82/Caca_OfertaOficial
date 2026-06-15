import { createServerSupabaseClient } from "@/lib/supabase/server";
import { TelegramPostApprovalCard } from "@/components/telegram/telegram-actions";
import { officialBrand, hasTelegramEnv } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { Bot, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function TelegramDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const configured = hasTelegramEnv();
  
  interface PostWithOffer {
    id: string;
    content: string;
    status: string;
    external_id: string | null;
    posted_at: string | null;
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

  let draftPosts: PostWithOffer[] = [];

  if (supabase) {
    const { data: drafts } = await supabase
      .from("posts")
      .select("*, offers(*)")
      .eq("channel", "telegram")
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    draftPosts = drafts || [];
  }

  const historyData = await getPostHistory("telegram");

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-sky-400 to-blue-600 shadow-lg shadow-sky-500/20">
          <Bot size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Telegram</h1>
          <p className="text-xs text-white/35">{officialBrand.telegramName} - Aprovação de mensagens e histórico de envios.</p>
        </div>
      </header>

      {!configured && (
        <div className="rounded-md bg-yellow-500/10 border border-yellow-500/20 p-4 flex items-center gap-3 text-yellow-500">
          <AlertTriangle size={20} />
          <p className="text-sm">O bot do Telegram não está configurado. Cadastre os tokens nas configurações para permitir o envio real.</p>
        </div>
      )}

      {/* Draft Posts */}
      <section className="grid gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">
            Aguardando Aprovação
          </h2>
          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-sky-500/15 px-1.5 text-[10px] font-extrabold text-sky-400">
            {draftPosts.length}
          </span>
        </div>
        
        {draftPosts.length > 0 ? (
          <div className="grid gap-4">
            {draftPosts.map((post) => (
              <TelegramPostApprovalCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-white/30">
              Nenhuma mensagem no Telegram aguardando aprovação. Use o Robô de Tendências no Dashboard.
            </p>
          </div>
        )}
      </section>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="telegram" />
      </section>
    </div>
  );
}
