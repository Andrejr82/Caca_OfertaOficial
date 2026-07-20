import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const completionSchema = z.object({ videoUrl: z.string().url(), audioUrl: z.string().url().optional() });

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

  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "ready", video_url: parsed.data.videoUrl, audio_url: parsed.data.audioUrl ?? null, completed_at: new Date().toISOString(), error_message: null })
    .eq("id", id)
    .eq("status", "processing")
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job não encontrado ou não está em processamento." }, { status: 409 });
  return NextResponse.json({ job: data });
}
