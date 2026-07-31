import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { hasFacebookEnv } from "@/lib/env";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { Facebook } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function FacebookPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  let draftPosts: any[] = [];
  if (supabase) {
    const { data } = await supabase
      .from("posts")
      .select("*, offers(*), affiliate_links(tracked_url)")
      .eq("channel", "facebook")
      .eq("status", "draft")
      .order("created_at", { ascending: false });
    const offerIds = (data || []).map((post) => post.offer_id).filter(Boolean);
    const { data: reelJobs } = offerIds.length > 0
      ? await supabase.from("video_jobs").select("id,offer_id,video_url,template_id,status").in("offer_id", offerIds).eq("template_id", "imported-reel-v1").in("status", ["ready", "approved"])
      : { data: [] };
    draftPosts = (data || []).map((post) => ({ ...post, video_job: (reelJobs || []).find((job) => job.offer_id === post.offer_id) || null }));
  }
  const historyData = await getPostHistory("facebook");

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-indigo-600 shadow-lg shadow-blue-500/20"><Facebook size={20} className="text-white" /></span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Facebook</h1>
          <p className="text-xs text-white/35">Aprovação de publicações para a Página e histórico de conversões.</p>
        </div>
      </header>
      {!hasFacebookEnv() && <div className="rounded-lg border border-amber-400/30 bg-amber-400/10 p-4 text-sm text-amber-100">Configure FACEBOOK_PAGE_ID e FACEBOOK_ACCESS_TOKEN para publicar na Página.</div>}
      <SocialChannelPostsView channel="facebook" accentClassName="bg-blue-500/15 text-blue-300" draftPosts={draftPosts} historyData={historyData as any} />
    </div>
  );
}
