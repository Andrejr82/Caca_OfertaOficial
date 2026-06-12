import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { getPostHistory } from "@/lib/offers/queries";
import { Instagram } from "lucide-react";

export default async function InstagramDashboardPage() {
  const supabase = await createServerSupabaseClient();
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
      .eq("channel", "instagram")
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    draftPosts = drafts || [];
  }

  const historyData = await getPostHistory("instagram");

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/20">
          <Instagram size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Instagram</h1>
          <p className="text-xs text-white/35">Aprovação de posts e histórico detalhado de postagens.</p>
        </div>
      </header>

      {/* Draft Posts */}
      <section className="grid gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">
            Aguardando Aprovação
          </h2>
          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-pink-500/15 px-1.5 text-[10px] font-extrabold text-pink-400">
            {draftPosts.length}
          </span>
        </div>
        {draftPosts.length > 0 ? (
          <div className="grid gap-4">
            {draftPosts.map((post) => (
              <InstagramPostApprovalCard key={post.id} post={post} />
            ))}
          </div>
        ) : (
          <div className="glass-card p-6 text-center">
            <p className="text-sm text-white/30">
              Nenhum post no Instagram aguardando aprovação. Use o Robô de Tendências no Dashboard ou cadastre uma nova oferta.
            </p>
          </div>
        )}
      </section>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="instagram" />
      </section>
    </div>
  );
}
