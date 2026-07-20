import { createServerSupabaseClient } from "@/lib/supabase/server";
import { listOffers } from "@/lib/offers/queries";
import { VideosClient } from "./VideosClient";

export default async function VideosPage() {
  const supabase = await createServerSupabaseClient();
  const offers = await listOffers();
  let jobs: unknown[] = [];

  if (supabase) {
    const { data } = await supabase
      .from("video_jobs")
      .select("*, offers(id, product_name, image_url, current_price, old_price, platform)")
      .order("created_at", { ascending: false })
      .limit(30);
    jobs = data ?? [];
  }

  return <VideosClient offers={offers as any[]} initialJobs={jobs as any[]} />;
}
