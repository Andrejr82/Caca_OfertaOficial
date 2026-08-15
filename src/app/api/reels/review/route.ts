import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { buildCleanAutoReelAttemptMetadata } from "@/lib/videos/auto-reel-completion";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const body = await request.json().catch(() => null) as { jobId?: string; action?: string } | null;
  if (!body?.jobId || !["approve", "reject", "regenerate"].includes(body.action ?? "")) return NextResponse.json({ error: "Ação inválida." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Persistência indisponível." }, { status: 503 });
  const { data: job, error } = await admin.from("video_jobs").select("*").eq("id", body.jobId).eq("user_id", userData.user.id).eq("template_id", "auto-reel-v1").maybeSingle();
  if (error || !job) return NextResponse.json({ error: "Reel não encontrado." }, { status: 404 });
  if (body.action === "approve" || body.action === "reject") {
    if (job.stage !== "ready_for_review") return NextResponse.json({ error: "Reel ainda não está pronto para revisão." }, { status: 409 });
    const status = body.action === "approve" ? "approved" : "rejected";
    const { data, error: updateError } = await admin.from("video_jobs").update({ status, stage: status, error_message: null }).eq("id", job.id).eq("user_id", userData.user.id).select("*").single();
    if (updateError) return NextResponse.json({ error: "Não foi possível atualizar a revisão." }, { status: 500 });
    return NextResponse.json({ job: data });
  }
  if (!["ready_for_review", "approved", "rejected", "failed"].includes(job.stage)) return NextResponse.json({ error: "Reel não pode ser regenerado neste estado." }, { status: 409 });
  const previousAttempt = Number(job.metadata?.attempt ?? 1);
  let metadata;
  try {
    metadata = buildCleanAutoReelAttemptMetadata({ id: job.id, attempt: previousAttempt, metadata: job.metadata ?? {} });
  } catch {
    return NextResponse.json({ error: "Snapshot factual ausente para regeneração." }, { status: 422 });
  }
  const { data, error: insertError } = await admin.from("video_jobs").insert({ user_id: userData.user.id, offer_id: job.offer_id, status: "queued", stage: "queued", script: "Reel demonstrativo aguardando nova tentativa.", video_url: null, audio_url: null, template_id: "auto-reel-v1", metadata }).select("*").single();
  if (insertError) return NextResponse.json({ error: "Não foi possível criar nova tentativa." }, { status: 500 });
  return NextResponse.json({ job: data }, { status: 201 });
}
