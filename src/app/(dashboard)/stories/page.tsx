import { Images } from "lucide-react";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildStoryCommercialPlan } from "@/lib/social/story-commercial-plan";
import { getBrazilVideoOfferCutoff } from "@/lib/videos/offer-window";
import { StoriesClient } from "./StoriesClient";

export const dynamic = "force-dynamic";

type OfferRow = {
  id: string;
  product_name: string;
  platform: string;
  category: string | null;
  current_price: number;
  old_price: number | null;
  image_url: string | null;
  shipping_free?: boolean | null;
  explainability?: Record<string, unknown> | null;
  marketplace_metrics?: Record<string, unknown> | null;
};

type AffiliateRow = {
  offer_id: string;
  tracked_url: string | null;
};

export default async function StoriesPage() {
  const supabase = await createServerSupabaseClient();
  const cutoff = getBrazilVideoOfferCutoff();
  const options: Array<{
    offerId: string;
    productName: string;
    platform: string;
    currentPrice: number;
    frameCount: 1 | 2;
    trackedUrl: string | null;
  }> = [];

  if (supabase) {
    const { data: { user } } = await supabase.auth.getUser();
    if (user) {
      const { data: offerData } = await supabase
        .from("offers")
        .select("id,product_name,platform,category,current_price,old_price,image_url,shipping_free,explainability,marketplace_metrics")
        .eq("user_id", user.id)
        .gte("updated_at", cutoff.toISOString())
        .order("updated_at", { ascending: false })
        .limit(500);
      const offers = (offerData ?? []) as OfferRow[];

      if (offers.length) {
        const { data: linkData } = await supabase
          .from("affiliate_links")
          .select("offer_id,tracked_url")
          .eq("user_id", user.id)
          .in("offer_id", offers.map((offer) => offer.id))
          .order("created_at", { ascending: false });
        const latestLinkByOffer = new Map<string, string | null>();
        for (const link of (linkData ?? []) as AffiliateRow[]) {
          if (!latestLinkByOffer.has(link.offer_id)) latestLinkByOffer.set(link.offer_id, link.tracked_url ?? null);
        }

        for (const offer of offers) {
          if (!offer.image_url || !/^https:\/\//iu.test(offer.image_url)) continue;
          const explainabilityMetrics = offer.explainability?.marketplace_metrics;
          const plan = buildStoryCommercialPlan({
            productName: offer.product_name,
            marketplace: offer.platform,
            category: offer.category,
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
          options.push({
            offerId: offer.id,
            productName: offer.product_name,
            platform: offer.platform,
            currentPrice: Number(offer.current_price),
            frameCount: plan.frameCount,
            trackedUrl: latestLinkByOffer.get(offer.id) ?? null,
          });
        }
      }
    }
  }

  return <div className="grid gap-6 animate-fadeIn">
    <header className="flex items-center gap-3">
      <span className="grid h-10 w-10 place-items-center rounded-xl bg-gradient-to-br from-fuchsia-500 to-rose-600 shadow-lg shadow-fuchsia-500/20"><Images size={20} className="text-white" /></span>
      <div>
        <h1 className="text-2xl font-extrabold tracking-tight text-white">Stories</h1>
        <p className="text-xs text-white/35">Selecione a oferta do ciclo atual, revise a arte e publique manualmente no Instagram ou Facebook. A publicação em uma rede não remove a oferta da outra.</p>
      </div>
    </header>
    <StoriesClient options={options} />
  </div>;
}
