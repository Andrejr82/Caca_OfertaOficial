import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBrazilVideoOfferCutoff } from "@/lib/videos/offer-window";
import { VideosClient } from "./VideosClient";
import { buildCommercialQueue } from "@/lib/offers/commercial-curation-queue";
import { routeCommercialCandidates } from "@/lib/offers/commercial-channel-router";
import { CommercialChannelQueue } from "@/components/offers/commercial-channel-queue";

export default async function VideosPage() {
  const supabase = await createServerSupabaseClient();
  const cutoff = getBrazilVideoOfferCutoff();
  let offers: unknown[] = [];
  let jobs: unknown[] = [];

  if (supabase) {
    const [{ data: offerData }, { data: jobData }] = await Promise.all([
      supabase
        .from("offers")
        .select("*")
        .gte("created_at", cutoff.toISOString())
        .order("created_at", { ascending: false })
        .limit(2000),
      supabase
      .from("video_jobs")
      .select("*, offers(id, product_name, image_url, current_price, old_price, platform, short_name)")
      .order("created_at", { ascending: false })
      .limit(200)
    ]);
    offers = offerData ?? [];
    jobs = jobData ?? [];
  }

  const routedCandidates = routeCommercialCandidates(buildCommercialQueue(offers as any[]));
  return <div className="grid gap-6"><CommercialChannelQueue candidates={routedCandidates} targetQueue="reels_manual" title="Fila Comercial · Vídeos/Reels manual" /><VideosClient offers={offers as any[]} initialJobs={jobs as any[]} cutoff={cutoff.toISOString()} /></div>;
}
