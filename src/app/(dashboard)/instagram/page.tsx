import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { getPostHistory } from "@/lib/offers/queries";
import { BatchApprovalList } from "@/components/dashboard/batch-approval-list";
import { Instagram } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InstagramDashboardPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
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
        <BatchApprovalList posts={draftPosts as any} channel="instagram" />
      </section>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="instagram" />
      </section>
    </div>
  );
}
