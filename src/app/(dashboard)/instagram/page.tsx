import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { Instagram } from "lucide-react";
import { isInstagramReelsDraft, isInstagramStoriesV4Handoff } from "@/lib/social/meta-publication-guard";

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
      marketplace?: string | null;
      category?: string | null;
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
      .select("*, offers(*)")
      .eq("channel", "instagram")
      .eq("status", "draft")
      .order("created_at", { ascending: false });
    draftPosts = (drafts ?? []) as PostWithOffer[];
  }

  const manualFeedDrafts = draftPosts.filter((post) =>
    !isInstagramStoriesV4Handoff(post.content) && !isInstagramReelsDraft(post.content)
  );
  const historyData = await getPostHistory("instagram");

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/20">
          <Instagram size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Instagram</h1>
          <p className="text-xs text-white/35">Posts manuais e histórico. Stories e Reels ficam em páginas próprias.</p>
        </div>
      </header>

      <SocialChannelPostsView
        channel="instagram"
        accentClassName="bg-pink-500/15 text-pink-300"
        draftPosts={manualFeedDrafts}
        historyData={historyData as any}
      />
    </div>
  );
}
