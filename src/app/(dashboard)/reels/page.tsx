import { createServerSupabaseClient } from "@/lib/supabase/server";
import { InstagramPostApprovalCard } from "@/components/instagram/instagram-actions";
import { FacebookPostApprovalCard } from "@/components/facebook/facebook-actions";

export const dynamic = "force-dynamic";

type SocialDraft = {
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

type VideoDistributionItem = {
  videoJobId: string;
  videoUrl: string;
  instagramDraft: SocialDraft | null;
  facebookDraft: SocialDraft | null;
};

export default async function ReelsPage() {
  const supabase = await createServerSupabaseClient();
  let distributionItems: VideoDistributionItem[] = [];

  if (supabase) {
    const { data: userData } = await supabase.auth.getUser();
    const user = userData.user;

    if (user) {
      const [{ data: instagramDrafts }, { data: facebookDrafts }, { data: videoJobs }] = await Promise.all([
        supabase
          .from("posts")
          .select("*, offers(*), affiliate_links(tracked_url)")
          .eq("user_id", user.id)
          .eq("channel", "instagram")
          .eq("status", "draft")
          .order("created_at", { ascending: false }),
        supabase
          .from("posts")
          .select("*, offers(*), affiliate_links(tracked_url)")
          .eq("user_id", user.id)
          .eq("channel", "facebook")
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

      const instagramById = new Map((instagramDrafts ?? []).map((post: any) => [post.id, post]));
      const facebookById = new Map((facebookDrafts ?? []).map((post: any) => [post.id, post]));
      const instagramByOffer = new Map((instagramDrafts ?? []).map((post: any) => [post.offer_id, post]));
      const facebookByOffer = new Map((facebookDrafts ?? []).map((post: any) => [post.offer_id, post]));

      distributionItems = (videoJobs ?? [])
        .map((job: any) => {
          if (!job.video_url) return null;

          const draftIds = (job.metadata as { draftIds?: { instagram?: string; facebook?: string } } | null)?.draftIds;
          const instagramPost =
            (draftIds?.instagram ? instagramById.get(draftIds.instagram) : null) ??
            instagramByOffer.get(job.offer_id) ??
            null;
          const facebookPost =
            (draftIds?.facebook ? facebookById.get(draftIds.facebook) : null) ??
            facebookByOffer.get(job.offer_id) ??
            null;

          if (!instagramPost && !facebookPost) return null;

          const attachVideo = (post: any): SocialDraft | null => post ? {
            ...post,
            videoJobId: job.id,
            videoUrl: job.video_url,
          } as SocialDraft : null;

          return {
            videoJobId: job.id,
            videoUrl: job.video_url,
            instagramDraft: attachVideo(instagramPost),
            facebookDraft: attachVideo(facebookPost),
          } as VideoDistributionItem;
        })
        .filter((item): item is VideoDistributionItem => Boolean(item));
    }
  }

  return (
    <div className="mx-auto max-w-7xl space-y-6">
      <header>
        <p className="text-xs font-bold uppercase tracking-[0.18em] text-pink-400">Distribuição social</p>
        <h1 className="mt-2 text-3xl font-black tracking-tight text-white">Reels</h1>
        <p className="mt-2 max-w-3xl text-sm text-white/45">
          Vídeos aprovados em Vídeos de Ofertas, centralizados aqui para publicação no Instagram Reels e Facebook.
        </p>
      </header>

      <section className="space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="font-bold text-white">Aguardando publicação</h2>
            <p className="mt-1 text-xs text-white/45">Um único vídeo aprovado, com destinos sociais independentes e sem duplicar o arquivo.</p>
          </div>
          <span className="rounded-full bg-pink-500/15 px-3 py-1 text-xs font-bold text-pink-200">
            {distributionItems.length}
          </span>
        </div>

        {distributionItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-white/15 bg-white/[0.02] p-5 text-sm text-white/45">
            Nenhum vídeo aprovado aguardando publicação social.
          </div>
        ) : (
          <div className="grid gap-6">
            {distributionItems.map((item) => (
              <article key={item.videoJobId} className="space-y-4 rounded-2xl border border-white/[0.07] bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-bold text-white">Distribuição do vídeo aprovado</p>
                  <div className="flex gap-2 text-[11px] font-bold uppercase tracking-wide">
                    <span className={`rounded-full px-2.5 py-1 ${item.instagramDraft ? "bg-pink-500/15 text-pink-200" : "bg-emerald-500/15 text-emerald-200"}`}>
                      Instagram {item.instagramDraft ? "pendente" : "concluído"}
                    </span>
                    <span className={`rounded-full px-2.5 py-1 ${item.facebookDraft ? "bg-blue-500/15 text-blue-200" : "bg-emerald-500/15 text-emerald-200"}`}>
                      Facebook {item.facebookDraft ? "pendente" : "concluído"}
                    </span>
                  </div>
                </div>

                {item.instagramDraft && <InstagramPostApprovalCard post={item.instagramDraft} />}
                {item.facebookDraft && <FacebookPostApprovalCard post={item.facebookDraft} />}
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
