import Link from "next/link";

import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getBrazilVideoOfferCutoff } from "@/lib/videos/offer-window";
import { VideosClient } from "./VideosClient";

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
        .eq("template_id", "gemini-drive-v1")
        .order("created_at", { ascending: false })
        .limit(200)
    ]);
    offers = offerData ?? [];
    jobs = jobData ?? [];
  }

  return (
    <>
      <div className="mb-6 flex justify-end">
        <Link href="/reels" className="rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-2 text-xs font-bold text-emerald-200 hover:bg-emerald-500/20">
          Reels / Criativos autorizados
        </Link>
      </div>
      <VideosClient offers={offers as any[]} initialJobs={jobs as any[]} cutoff={cutoff.toISOString()} />
    </>
  );
}
