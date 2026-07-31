import { NextResponse } from "next/server";
import { z } from "zod";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { importedStoragePrefix } from "@/lib/videos/import/storage";

const completionSchema = z.object({
  videoUrl: z.string().url(),
  audioUrl: z.string().url().optional(),
  instagramUrl: z.string().url().optional(),
  facebookUrl: z.string().url().optional(),
  instagramCoverUrl: z.string().url().optional(),
  facebookCoverUrl: z.string().url().optional(),
  thumbnailUrl: z.string().url().optional(),
  referenceFrameUrl: z.string().url().optional(),
  workerId: z.string().trim().min(1).max(120)
});

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
  const { data: claimedJob, error: claimedJobError } = await supabase.from("video_jobs").select("id,status,worker_id,template_id,user_id,offer_id,metadata").eq("id", id).maybeSingle();
  if (claimedJobError || !claimedJob) return NextResponse.json({ error: "Job não encontrado." }, { status: 404 });
  const isImportedReel = ["imported-video-v1", "imported-reel-v1"].includes(claimedJob.template_id);
  const expectedPrefix = isImportedReel
    ? `/storage/v1/object/public/${bucket}/${importedStoragePrefix(claimedJob)}/`
    : `/storage/v1/object/public/${bucket}/jobs/${id}/`;
  const urls = [parsed.data.videoUrl, parsed.data.audioUrl, parsed.data.instagramUrl, parsed.data.facebookUrl, parsed.data.instagramCoverUrl, parsed.data.facebookCoverUrl, parsed.data.thumbnailUrl, parsed.data.referenceFrameUrl].filter(Boolean) as string[];
  if (urls.some((url) => !url.startsWith("https://") || !url.includes(expectedPrefix))) return NextResponse.json({ error: "As URLs enviadas não pertencem ao storage deste job." }, { status: 400 });
  const importedMetadata = isImportedReel ? {
    importedVideo: {
      ...((claimedJob.metadata as Record<string, unknown> | null)?.importedVideo as Record<string, unknown> | undefined),
      assets: {
        processed: parsed.data.videoUrl,
        ...(claimedJob.template_id === "imported-reel-v1" ? {} : {
        instagram: parsed.data.instagramUrl ?? parsed.data.videoUrl,
        facebook: parsed.data.facebookUrl ?? parsed.data.videoUrl,
        instagramCover: parsed.data.instagramCoverUrl ?? null,
        facebookCover: parsed.data.facebookCoverUrl ?? null,
        thumbnail: parsed.data.thumbnailUrl ?? null,
        referenceFrame: parsed.data.referenceFrameUrl ?? null
        }),
      }
    }
  } : null;

  const { data, error } = await supabase
    .from("video_jobs")
    .update({ status: "ready", stage: claimedJob.template_id === "imported-video-v1" ? "generating_copies" : "ready_for_review", video_url: parsed.data.videoUrl, audio_url: parsed.data.audioUrl ?? null, metadata: importedMetadata ? { ...(claimedJob.metadata || {}), ...importedMetadata } : claimedJob.metadata, completed_at: new Date().toISOString(), heartbeat_at: new Date().toISOString(), error_message: null })
    .eq("id", id)
    .eq("status", "processing")
    .eq("worker_id", parsed.data.workerId)
    .select("*")
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!data) return NextResponse.json({ error: "Job não encontrado ou não está em processamento." }, { status: 409 });
  return NextResponse.json({ job: data });
}
