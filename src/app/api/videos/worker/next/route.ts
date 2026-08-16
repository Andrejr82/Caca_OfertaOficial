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
  if (!claimed?.id) return NextResponse.json({ job: null });

  const { data: job, error: readError } = await supabase
    .from("video_jobs")
    .select("*, offers(id, product_name, image_url, current_price, old_price, original_url, platform)")
    .eq("id", claimed.id)
    .maybeSingle();
  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });

  if (job) {
    const appDomain = process.env.NEXT_PUBLIC_APP_URL || "https://caca-oferta-oficial.vercel.app";
    
    // Proxy the main offer image if available
    if (job.offers?.image_url && !job.offers.image_url.includes("/api/images/proxy")) {
      job.offers.image_url = `${appDomain}/api/images/proxy?url=${encodeURIComponent(job.offers.image_url)}`;
    }

    // Proxy the snapshot image inside metadata (used by Auto-Reel V1 templates)
    if (job.metadata && typeof job.metadata === "object") {
      const metadata = job.metadata as Record<string, any>;
      if (metadata.factualSnapshot?.imageUrl && !metadata.factualSnapshot.imageUrl.includes("/api/images/proxy")) {
        metadata.factualSnapshot.imageUrl = `${appDomain}/api/images/proxy?url=${encodeURIComponent(metadata.factualSnapshot.imageUrl)}`;
      }
    }
  }

  return NextResponse.json({ job: job ?? null });
}
