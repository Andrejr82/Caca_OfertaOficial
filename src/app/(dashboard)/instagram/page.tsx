import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getPostHistory } from "@/lib/offers/queries";
import { SocialChannelPostsView } from "@/components/dashboard/social-channel-posts-view";
import { Instagram } from "lucide-react";
import { isInstagramReelsV4Enabled } from "@/lib/social/meta-delivery-policy";
import { buildStoryV5Plan } from "@/lib/social/instagram-story-v5";

export const dynamic = "force-dynamic";

export default async function InstagramDashboardPage() {
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  const reelsEnabled = isInstagramReelsV4Enabled();

  interface PostWithOffer {
    id: string;
    videoJobId?: string | null;
    videoUrl?: string | null;
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
      reelsEnabled
        ? supabase.from("video_jobs").select("id,status,video_url,offer_id,metadata").in("status", ["ready", "approved"])
        : Promise.resolve({ data: [] as any[] }),
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
      .map(({ _videoJob, ...post }) => ({
        ...post,
        videoJobId: reelsEnabled ? (_videoJob?.id ?? null) : null,
        videoUrl: reelsEnabled ? (_videoJob?.video_url ?? null) : null,
      }));
  }

  const storyDrafts = draftPosts.filter((post) => post.content.startsWith("STORIES V4 · HANDOFF MANUAL"));
  const publishableDrafts = draftPosts.filter((post) => !post.content.startsWith("STORIES V4 · HANDOFF MANUAL"));
  const historyData = await getPostHistory("instagram");

  const storyPlan = (post: PostWithOffer) => buildStoryV5Plan({
    productName: post.offers?.product_name || "Oferta selecionada",
    marketplace: post.offers?.platform || "Marketplace",
    category: post.offers?.category ?? null,
    currentPrice: Number(post.offers?.current_price ?? 0),
    originalPrice: post.offers?.old_price ?? null,
    evidence: {},
    freeShipping: false,
  });

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-pink-500 to-rose-600 shadow-lg shadow-pink-500/20">
          <Instagram size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Instagram</h1>
          <p className="text-xs text-white/35">Story Engine V5: 1–3 artes conforme a força comercial real da oferta. Reels permanece desativado.</p>
        </div>
      </header>

      {storyDrafts.length > 0 && (
        <section className="grid gap-4">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-bold text-pink-300 uppercase tracking-[0.08em]">Stories — postagem manual</h2>
            <span className="grid h-5 min-w-5 place-items-center rounded-md bg-pink-500/15 px-1.5 text-[10px] font-extrabold text-pink-300">
              {storyDrafts.length}
            </span>
          </div>
          <div className="grid gap-4 lg:grid-cols-2">
            {storyDrafts.map((post) => {
              const plan = storyPlan(post);
              const frames = Array.from({ length: plan.frameCount }, (_, index) => index + 1);
              return (
                <article key={post.id} className="glass-card grid gap-4 p-5">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-pink-300">{post.offers?.platform || "Instagram"}</p>
                    <h3 className="mt-1 font-bold text-white">{post.offers?.product_name}</h3>
                    <p className="mt-2 text-xs font-semibold text-white/45">{plan.template} · {plan.frameCount} tela(s)</p>
                  </div>
                  <div className={`grid gap-2 ${plan.frameCount === 1 ? "grid-cols-1" : plan.frameCount === 2 ? "grid-cols-2" : "grid-cols-3"}`}>
                    {frames.map((frame) => (
                      <a
                        key={frame}
                        href={`/api/images/instagram-story?postId=${encodeURIComponent(post.id)}&frame=${frame}`}
                        target="_blank"
                        rel="noreferrer"
                        className="rounded-xl border border-pink-400/25 bg-pink-500/10 px-3 py-3 text-center text-xs font-bold text-pink-200 transition hover:bg-pink-500/20"
                      >
                        Abrir Tela {frame}
                      </a>
                    ))}
                  </div>
                  <details className="rounded-xl border border-white/10 bg-black/20 p-4 text-sm text-white/75">
                    <summary className="cursor-pointer font-semibold text-white/80">Ver roteiro textual</summary>
                    <pre className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-white/70">{post.content}</pre>
                  </details>
                  <div className="rounded-xl border border-pink-400/20 bg-pink-500/10 p-4 text-sm text-white/75">
                    <p className="font-semibold text-pink-200">Como postar</p>
                    <p className="mt-1">Abra {plan.frameCount === 1 ? "a arte" : `as ${plan.frameCount} artes`} e publique na ordem. No último Story, adicione o sticker <strong>Link</strong> do Instagram usando exatamente o endereço rastreado abaixo.</p>
                    {post.affiliate_links?.tracked_url ? (
                      <a
                        href={post.affiliate_links.tracked_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-3 block break-all rounded-lg bg-black/20 p-3 font-mono text-xs text-pink-200 underline decoration-pink-300/40 underline-offset-4"
                      >
                        {post.affiliate_links.tracked_url}
                      </a>
                    ) : (
                      <p className="mt-3 font-semibold text-amber-300">Link rastreado indisponível — não publicar este Story.</p>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      <SocialChannelPostsView
        channel="instagram"
        accentClassName="bg-pink-500/15 text-pink-300"
        draftPosts={publishableDrafts}
        historyData={historyData as any}
      />
    </div>
  );
}
