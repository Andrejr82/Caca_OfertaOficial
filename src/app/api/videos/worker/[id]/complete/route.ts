import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const completionSchema = z.object({ videoUrl: z.string().url(), audioUrl: z.string().url().optional(), durationSeconds: z.number().positive().max(60).optional(), workerId: z.string().trim().min(1).max(120) });

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });
  const parsed = completionSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe uma URL de vídeo válida." }, { status: 400 });
  const { id } = await params;
  const bucket = process.env.VIDEO_STORAGE_BUCKET || "videos";
  const expectedVideoPath = `/storage/v1/object/public/${bucket}/jobs/${id}/video.mp4`;
  const expectedAudioPath = `/storage/v1/object/public/${bucket}/jobs/${id}/audio.mp3`;
  if (!parsed.data.videoUrl.includes(expectedVideoPath) || (parsed.data.audioUrl && !parsed.data.audioUrl.includes(expectedAudioPath))) {
    return NextResponse.json({ error: "As URLs enviadas não pertencem ao storage deste job." }, { status: 400 });
  }

  const { data: current } = await supabase.from("video_jobs").select("metadata").eq("id", id).eq("worker_id", parsed.data.workerId).maybeSingle();
  const metadata = current?.metadata && typeof current.metadata === "object" ? current.metadata as Record<string, unknown> : {};
  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "ready", stage: "ready_for_review", video_url: parsed.data.videoUrl, audio_url: parsed.data.audioUrl ?? null, completed_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), error_message: null, metadata: { ...metadata, audioUrl: parsed.data.audioUrl ?? null, durationSeconds: parsed.data.durationSeconds ?? null, rendered: true } })
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job não encontrado ou não está em processamento." }, { status: 409 });
  return NextResponse.json({ job: data });
}
