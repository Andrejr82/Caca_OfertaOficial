import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { authorizedReelVerificationSchema } from "@/lib/videos/authorized-reel";

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });

  const parsed = authorizedReelVerificationSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Resultado de verificação inválido." }, { status: 400 });

  const { id } = await params;
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });

  const { data: job, error: readError } = await supabase
    .from("video_jobs")
    .select("id,status,stage,worker_id,metadata")
    .eq("id", id)
    .eq("template_id", "authorized-reel-v1")
    .maybeSingle();

  if (readError) return NextResponse.json({ error: readError.message }, { status: 500 });
  if (!job) return NextResponse.json({ error: "Criativo não encontrado." }, { status: 404 });
  if (job.worker_id !== parsed.data.workerId || job.status !== "processing" || job.stage !== "verifying_media") {
    return NextResponse.json({ error: "Job não pertence a este worker ou está em estado inválido." }, { status: 409 });
  }

  const now = new Date().toISOString();
  const metadata = (job.metadata && typeof job.metadata === "object" ? job.metadata : {}) as Record<string, unknown>;

  if (!parsed.data.ok) {
    const { error } = await supabase
      .from("video_jobs")
      .update({
        status: "failed",
        stage: "failed",
        error_message: parsed.data.error,
        heartbeat_at: now,
        completed_at: now,
        metadata: {
          ...metadata,
          validation: {
            ...((metadata.validation && typeof metadata.validation === "object") ? metadata.validation : {}),
            mediaVerified: false,
            measurementSource: "oracle-ffprobe",
            verifiedAt: now,
          },
        },
      })
      .eq("id", id)
      .eq("worker_id", parsed.data.workerId);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, status: "failed" });
  }

  const { error } = await supabase
    .from("video_jobs")
    .update({
      status: "ready",
      stage: "ready_for_review",
      error_message: null,
      heartbeat_at: now,
      completed_at: now,
      metadata: {
        ...metadata,
        validation: {
          ...((metadata.validation && typeof metadata.validation === "object") ? metadata.validation : {}),
          width: parsed.data.width,
          height: parsed.data.height,
          durationSeconds: parsed.data.durationSeconds,
          formatName: parsed.data.formatName,
          videoCodec: parsed.data.videoCodec,
          hasAudio: parsed.data.hasAudio,
          mediaVerified: true,
          measurementSource: "oracle-ffprobe",
          verifiedAt: now,
        },
      },
    })
    .eq("id", id)
    .eq("worker_id", parsed.data.workerId);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, status: "ready" });
}
