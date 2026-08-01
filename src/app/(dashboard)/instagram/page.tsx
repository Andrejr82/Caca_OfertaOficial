import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { Instagram } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function InstagramDashboardPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
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
    const [{ data: drafts }, { data: videoJobs }] = await Promise.all([
      supabase.from("posts").select("*, offers(*), affiliate_links(tracked_url)").eq("channel", "instagram").eq("status", "draft").order("created_at", { ascending: false }),
      supabase.from("video_jobs").select("id,status,video_url,offer_id,metadata").in("status", ["ready", "approved"])
    ]);
    const jobsByDraftId = new Map<string, { id: string; status: string; video_url: string | null }>();
    const jobsByOfferId = new Map<string, { id: string; status: string; video_url: string | null }>();
    for (const job of videoJobs ?? []) {
      const normalizedJob = { id: job.id, status: job.status, video_url: (job as { video_url?: string | null }).video_url ?? null };
      const draftId = (job.metadata as { draftIds?: { instagram?: string } } | null)?.draftIds?.instagram;
      if (draftId) jobsByDraftId.set(draftId, normalizedJob);
      if (job.offer_id) jobsByOfferId.set(job.offer_id, normalizedJob);
    }
    draftPosts = (drafts ?? []).map((post) => ({ ...post, _videoJob: jobsByDraftId.get(post.id) ?? jobsByOfferId.get(post.offer_id) }))
      .filter((post) => !post._videoJob || post._videoJob.status === "approved")
      .map(({ _videoJob, ...post }) => ({ ...post, videoJobId: _videoJob?.id ?? null, videoUrl: _videoJob?.video_url ?? null }));
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

      <SocialChannelPostsView
        channel="instagram"
        accentClassName="bg-pink-500/15 text-pink-300"
        draftPosts={draftPosts}
        historyData={historyData as any}
      />
    </div>
  );
}
