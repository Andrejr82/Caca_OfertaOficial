import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVideoJobPolicy, quotaMessage } from "@/lib/videos/job-policy";

const createJobSchema = z.object({
  offerId: z.string().uuid(),
  script: z.string().trim().min(20).max(500)
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data, error } = await supabase
    .from("video_jobs")
    .select("*, offers(id, product_name, image_url, current_price, old_price, platform)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const policy = getVideoJobPolicy();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [{ count: todayCount }, { count: activeCount }] = await Promise.all([
    supabase.from("video_jobs").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    supabase.from("video_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"])
  ]).then((results) => results.map((result) => ({ count: result.count ?? 0 })));
  return NextResponse.json({ jobs: data ?? [], usage: { todayCount, activeCount, ...policy } });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = createJobSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe uma oferta e um roteiro válido." }, { status: 400 });

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id")
    .eq("id", parsed.data.offerId)
    .maybeSingle();

  if (offerError || !offer) return NextResponse.json({ error: "Oferta não encontrada." }, { status: 404 });

  const policy = getVideoJobPolicy();
  const { data, error } = await (supabase as any)
    .rpc("enqueue_video_job", {
      _user_id: userData.user.id,
      _offer_id: parsed.data.offerId,
      _script: parsed.data.script,
      _template_id: "motion-v1",
      _daily_limit: null,
      _queue_limit: policy.queueLimit
    })
    .single();

  if (error) {
    if (error.message.includes("VIDEO_QUEUE_LIMIT")) return NextResponse.json({ error: quotaMessage("queue_limit", policy) }, { status: 429 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ job: data }, { status: 201 });
}
