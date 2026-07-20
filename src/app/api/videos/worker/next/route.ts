import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });

  const { data: queued, error: readError } = await supabase
    .from("video_jobs")
    .select("*, offers(id, product_name, image_url, current_price, old_price, original_url, platform)")
    .eq("status", "queued")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!queued) return NextResponse.json({ job: null });

  const { data: claimed, error: claimError } = await supabase
    .from("video_jobs")
    .update({ status: "processing", started_at: new Date().toISOString() })
    .eq("id", queued.id)
    .eq("status", "queued")
    .select("*, offers(id, product_name, image_url, current_price, old_price, original_url, platform)")
    .maybeSingle();

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  return NextResponse.json({ job: claimed ?? null });
}
