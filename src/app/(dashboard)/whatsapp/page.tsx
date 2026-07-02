import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { officialBrand } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { PostHistoryTable } from "@/components/dashboard/post-history-table";
import { BatchApprovalList } from "@/components/dashboard/batch-approval-list";
import { MessageCircle } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function WhatsappDashboardPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  
  interface PostWithOffer {
    id: string;
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

  let draftPosts: PostWithOffer[] = [];

  if (supabase) {
    const { data: drafts } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("channel", "whatsapp")
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    draftPosts = drafts || [];
  }

  const historyData = await getPostHistory("whatsapp");

  return (
    <div className="grid gap-6 animate-fadeIn">
      {/* Header */}
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-emerald-400 to-green-600 shadow-lg shadow-emerald-500/20">
          <MessageCircle size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">WhatsApp</h1>
          <p className="text-xs text-white/35">{officialBrand.whatsappName} - Aprovação de envios e histórico de grupos/canais.</p>
        </div>
      </header>

      {/* Draft Posts */}
      <section className="grid gap-4">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-bold text-white/50 uppercase tracking-[0.08em]">
            Aguardando Aprovação
          </h2>
          <span className="grid h-5 min-w-5 place-items-center rounded-md bg-emerald-500/15 px-1.5 text-[10px] font-extrabold text-emerald-400">
            {draftPosts.length}
          </span>
        </div>
        
        <BatchApprovalList posts={draftPosts as any} channel="whatsapp" />
      </section>

      {/* Post History */}
      <section className="grid gap-4">
        <PostHistoryTable initialData={historyData} channelName="whatsapp" />
      </section>
    </div>
  );
}
