import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVideoJobPolicy, quotaMessage } from "@/lib/videos/job-policy";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });
  const { id } = await params;
  const { data: source, error: sourceError } = await supabase
    .from("video_jobs")
    .select("offer_id, script, template_id, status")
    .eq("id", id)
    .eq("user_id", userData.user.id)
    .in("status", ["ready", "approved", "failed", "cancelled"])
    .maybeSingle();
  if (sourceError) return NextResponse.json({ error: sourceError.message }, { status: 500 });
  if (!source) return NextResponse.json({ error: "Este vídeo não pode ser regenerado." }, { status: 409 });

  const policy = getVideoJobPolicy();
  const { data, error } = await (supabase as any).rpc("enqueue_video_job", {
    _user_id: userData.user.id,
    _offer_id: source.offer_id,
    _script: source.script,
    _template_id: source.template_id ?? "motion-v1",
    _daily_limit: null,
    _queue_limit: policy.queueLimit
  }).single();
  if (error) {
    if (error.message.includes("VIDEO_QUEUE_LIMIT")) return NextResponse.json({ error: quotaMessage("queue_limit", policy) }, { status: 429 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  return NextResponse.json({ job: data }, { status: 201 });
}
