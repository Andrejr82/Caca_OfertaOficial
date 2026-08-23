import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";

export const dynamic = "force-dynamic";

type ReelDraft = {
  id: string;
  videoJobId: string;
  videoUrl: string;
  content: string;
  status: string;
  created_at: string;
  affiliate_links?: {
    tracked_url: string;
  } | null;
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
};

export default async function ReelsPage() {
  const supabase = await createServerSupabaseClient();
  let reelDrafts: ReelDraft[] = [];

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (user) {
      const [{ data: drafts }, { data: videoJobs }] = await Promise.all([
        supabase
          .from("posts")
          .select("*, offers(*), affiliate_links(tracked_url)")
          .eq("user_id", user.id)
          .eq("channel", "instagram")
          .eq("status", "draft")
          .order("created_at", { ascending: false }),
        supabase
          .from("video_jobs")
          .select("id,status,video_url,offer_id,metadata,created_at")
          .eq("user_id", user.id)
          .eq("status", "approved")
          .not("video_url", "is", null)
          .order("created_at", { ascending: false }),
      ]);

      const jobsByDraftId = new Map<string, { id: string; video_url: string }>();
      const jobsByOfferId = new Map<string, { id: string; video_url: string }>();

      for (const job of videoJobs ?? []) {
        if (!job.video_url) continue;

        const normalizedJob = { id: job.id, video_url: job.video_url };
        const draftId = (job.metadata as { draftIds?: { instagram?: string } } | null)?.draftIds?.instagram;

        if (draftId && !jobsByDraftId.has(draftId)) jobsByDraftId.set(draftId, normalizedJob);
        if (job.offer_id && !jobsByOfferId.has(job.offer_id)) jobsByOfferId.set(job.offer_id, normalizedJob);
      }

      reelDrafts = (drafts ?? [])
        .map((post: any) => {
          const videoJob = jobsByDraftId.get(post.id) ?? jobsByOfferId.get(post.offer_id);
          if (!videoJob) return null;

          return {
            ...post,
            videoJobId: videoJob.id,
            videoUrl: videoJob.video_url,
          } as ReelDraft;
        })
        .filter((post): post is ReelDraft => Boolean(post));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink-400">Instagram</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Reels</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          Vídeos aprovados em Vídeos de Ofertas, prontos para revisão da legenda e publicação no Instagram Reels.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Aguardando publicação</h2>
            <p className="mt-1 text-xs text-white/45">O mesmo vídeo continua disponível no Facebook; aqui ele é apenas o destino Instagram Reels.</p>
          </div>
          <span className="rounded-full bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-200">
            {reelDrafts.length}
          </span>
        </div>

        {reelDrafts.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-sm text-white/45">
            Nenhum vídeo aprovado aguardando publicação no Instagram Reels.
          </div>
        ) : (
          <div className="grid gap-4">
            {reelDrafts.map((post) => (
              <InstagramPostApprovalCard key={post.id} post={post} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
