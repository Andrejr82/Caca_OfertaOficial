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

  const workerId = request.headers.get("x-video-worker-id");
  if (!workerId || workerId.length > 120) return NextResponse.json({ error: "Identificador do worker ausente." }, { status: 400 });
  const staleSeconds = Math.max(600, Number(process.env.VIDEO_JOB_STALE_MINUTES || 30) * 60);
  const { data: claimed, error: claimError } = await (supabase as any)
    .rpc("claim_next_video_job", { _worker_id: workerId, _stale_seconds: staleSeconds })
    .maybeSingle();

  if (claimError) return NextResponse.json({ error: claimError.message }, { status: 500 });
  if (!claimed) return NextResponse.json({ job: null });

  const { data: job, error: readError } = await supabase
    .from("video_jobs")
    .select("*, offers(id, product_name, image_url, current_price, old_price, original_url, platform)")
    .eq("id", claimed.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  return NextResponse.json({ job: job ?? null });
}
