import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

const requestSchema = z.object({
  jobId: z.string().uuid(),
  kind: z.enum(["video", "audio"])
});

function authorized(request: Request) {
  const token = process.env.VIDEO_WORKER_TOKEN;
  return Boolean(token && request.headers.get("authorization") === `Bearer ${token}`);
}

export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "Worker não autorizado." }, { status: 401 });
  const supabase = createSupabaseAdminClient();
  if (!supabase) return NextResponse.json({ error: "Supabase admin não configurado." }, { status: 503 });

  const parsed = requestSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe um jobId e tipo de arquivo válidos." }, { status: 400 });

  const bucket = process.env.VIDEO_STORAGE_BUCKET || "videos";
  const extension = parsed.data.kind === "video" ? "mp4" : "mp3";
  const path = `jobs/${parsed.data.jobId}/${parsed.data.kind}.${extension}`;

  const { data: job, error: jobError } = await supabase
    .from("video_jobs")
    .select("id, status")
    .eq("id", parsed.data.jobId)
    .maybeSingle();

  if (jobError) return NextResponse.json({ error: jobError.message }, { status: 500 });
  if (!job || job.status !== "processing") return NextResponse.json({ error: "Job não está em processamento." }, { status: 409 });

  const { data, error } = await supabase.storage.from(bucket).createSignedUploadUrl(path, { upsert: true });
  if (error || !data) return NextResponse.json({ error: error?.message ?? "Não foi possível criar URL de upload." }, { status: 503 });

  const { data: publicData } = supabase.storage.from(bucket).getPublicUrl(path);
  return NextResponse.json({ bucket, path, token: data.token, signedUrl: data.signedUrl, publicUrl: publicData.publicUrl });
}
