import Link from "next/link";
import { Images, Instagram, Facebook } from "lucide-react";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoryCommercialPlan } from "@/lib/social/story-commercial-plan";

export const dynamic = "force-dynamic";

type StoryChannel = "instagram" | "facebook";

type StoryDraft = {
  id: string;
  channel: StoryChannel;
  affiliate_links?: { tracked_url: string } | null;
  offers: {
    id: string;
    product_name: string;
    platform: string;
    category?: string | null;
    current_price: number;
    old_price: number | null;
    image_url: string | null;
    shipping_free?: boolean | null;
    explainability?: Record<string, unknown> | null;
    marketplace_metrics?: Record<string, unknown> | null;
  };
};

function channelLabel(channel: StoryChannel) {
  return channel === "instagram" ? "Instagram" : "Facebook";
}

export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ channel?: string }>;
}) {
  const params = await searchParams;
  const activeChannel: StoryChannel = params.channel === "facebook" ? "facebook" : "instagram";
  const supabase = createSupabaseAdminClient() || (await createServerSupabaseClient());
  let drafts: StoryDraft[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("posts")
      .select("id,channel,affiliate_links(tracked_url),offers(id,product_name,platform,category,current_price,old_price,image_url,shipping_free,explainability,marketplace_metrics)")
      .eq("channel", activeChannel)
      .eq("status", "draft")
      .order("created_at", { ascending: false });

    drafts = (data ?? []) as unknown as StoryDraft[];
  }

  return (
    <div className="grid gap-6 animate-fadeIn">
      <header className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-rose-600 shadow-lg shadow-fuchsia-500/20">
          <Images size={20} className="text-white" />
        </span>
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-white">Stories</h1>
          <p className="text-xs text-white/35">Artes comerciais para Instagram e Facebook. Uma arte forte por padrão; segunda somente quando houver reforço factual real.</p>
        </div>
      </header>

      <div className="flex gap-2">
        <Link
          href="/stories?channel=instagram"
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${activeChannel === "instagram" ? "border-pink-400/40 bg-pink-500/15 text-pink-200" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"}`}
        >
          <Instagram size={16} /> Instagram
        </Link>
        <Link
          href="/stories?channel=facebook"
          className={`inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-bold transition ${activeChannel === "facebook" ? "border-blue-400/40 bg-blue-500/15 text-blue-200" : "border-white/10 bg-white/[0.03] text-white/55 hover:text-white"}`}
        >
          <Facebook size={16} /> Facebook
        </Link>
      </div>

      {drafts.length === 0 ? (
        <div className="glass-card p-8 text-center text-sm text-white/50">
          Nenhum draft de {channelLabel(activeChannel)} disponível para gerar Story.
        </div>
      ) : (
        <section className="grid gap-4 lg:grid-cols-2">
          {drafts.map((post) => {
            const offer = Array.isArray(post.offers) ? post.offers[0] : post.offers;
            if (!offer) return null;
            const explainabilityMetrics = offer.explainability?.marketplace_metrics;
            const plan = buildStoryCommercialPlan({
              productName: offer.product_name,
              marketplace: offer.platform,
              category: offer.category ?? null,
              currentPrice: Number(offer.current_price),
              originalPrice: offer.old_price == null ? null : Number(offer.old_price),
              freeShipping: offer.shipping_free ?? null,
              evidence: {
                ...(offer.explainability ?? {}),
                marketplace_metrics: {
                  ...(explainabilityMetrics && typeof explainabilityMetrics === "object" ? explainabilityMetrics as Record<string, unknown> : {}),
                  ...(offer.marketplace_metrics ?? {}),
                },
              },
            });

            return (
              <article key={post.id} className="glass-card grid gap-4 p-5">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wider text-fuchsia-300">{offer.platform}</p>
                    <h2 className="mt-1 font-bold text-white">{offer.product_name}</h2>
                  </div>
                  <span className="rounded-lg bg-white/[0.05] px-2 py-1 text-[10px] font-extrabold text-white/45">{plan.template}</span>
                </div>

                <div className={`grid gap-2 ${plan.frameCount === 2 ? "grid-cols-2" : "grid-cols-1"}`}>
                  {Array.from({ length: plan.frameCount }, (_, index) => index + 1).map((frame) => (
                    <a
                      key={frame}
                      href={`/api/images/story-creative?postId=${encodeURIComponent(post.id)}&frame=${frame}`}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-xl border border-fuchsia-400/25 bg-fuchsia-500/10 px-3 py-3 text-center text-xs font-bold text-fuchsia-200 transition hover:bg-fuchsia-500/20"
                    >
                      Abrir arte {frame}
                    </a>
                  ))}
                </div>

                <div className="grid grid-cols-2 gap-2 text-xs text-white/55">
                  <div className="rounded-lg bg-black/15 p-3">
                    <span className="block text-white/35">Preço atual</span>
                    <strong className="text-white">R$ {Number(offer.current_price).toLocaleString("pt-BR", { minimumFractionDigits: 2 })}</strong>
                  </div>
                  <div className="rounded-lg bg-black/15 p-3">
                    <span className="block text-white/35">Artes</span>
                    <strong className="text-white">{plan.frameCount}</strong>
                  </div>
                </div>

                {post.affiliate_links?.tracked_url ? (
                  <div className="rounded-xl border border-white/10 bg-black/15 p-3">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-white/35">Link rastreado</p>
                    <a href={post.affiliate_links.tracked_url} target="_blank" rel="noreferrer" className="mt-1 block break-all font-mono text-xs text-fuchsia-200 underline decoration-fuchsia-300/30 underline-offset-4">
                      {post.affiliate_links.tracked_url}
                    </a>
                  </div>
                ) : (
                  <p className="text-xs font-semibold text-amber-300">Sem link rastreado: não publicar este Story.</p>
                )}
              </article>
            );
          })}
        </section>
      )}
    </div>
  );
}
