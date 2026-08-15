import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function GET(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });

  const workerId = request.headers.get("x-video-worker-id");
  if (!workerId || workerId.length > 120) {
    return NextResponse.json({ error: "Identificador do worker ausente." }, { status: 400 });
  }

  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });

  const { data: candidate, error: readError } = await supabase
    .from("video_jobs")
    .select("id,user_id,offer_id,status,stage,video_url,metadata,created_at,offers(id,product_name,platform,current_price)")
    .eq("template_id", "authorized-reel-v1")
    .eq("status", "processing")
    .eq("stage", "awaiting_oracle_verification")
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!candidate) return NextResponse.json({ job: null });

  const now = new Date().toISOString();
  const { data: claimed, error: claimError } = await supabase
    .from("video_jobs")
    .update({
      stage: "verifying_media",
      worker_id: workerId,
      heartbeat_at: now,
      started_at: now,
      error_message: null,
    })
    .eq("id", candidate.id)
    .eq("status", "processing")
    .eq("stage", "awaiting_oracle_verification")
    .select("id,user_id,offer_id,status,stage,video_url,metadata,created_at,offers(id,product_name,platform,current_price)")
    .maybeSingle();

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  return NextResponse.json({ job: claimed ?? null });
}
