import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildAutoReelRenderPayload } from "@/lib/videos/auto-reel-completion";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!body?.jobId) return NextResponse.json({ error: "jobId ausente." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Persistência indisponível." }, { status: 503 });
  const { data: job, error } = await admin.from("video_jobs").select("id,user_id,offer_id,status,stage,metadata,attempt_count").eq("id", body.jobId).eq("user_id", userData.user.id).eq("template_id", "auto-reel-v1").maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Reel não encontrado." }, { status: 404 });
  if (job.stage !== "scenes_ready") return NextResponse.json({ job }, { status: 200 });
  const manifest = buildAutoReelRenderPayload({ ...job, attempt: Number(job.metadata?.attempt ?? 1), metadata: job.metadata ?? {} }, { audioUrl: "", durationSeconds: 0 });
  const metadata = { ...(job.metadata ?? {}), completionRequested: true, renderManifest: manifest };
  const { data: updated, error: updateError } = await admin.from("video_jobs").update({ status: "queued", stage: "queued", metadata, error_message: null }).eq("id", job.id).eq("user_id", userData.user.id).select("id,status,stage,video_url,audio_url,metadata,created_at").single();
  if (updateError) return NextResponse.json({ error: "Não foi possível enfileirar a conclusão." }, { status: 500 });
  return NextResponse.json({ job: updated }, { status: 200 });
}
