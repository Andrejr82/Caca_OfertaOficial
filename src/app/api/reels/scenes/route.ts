import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { canResumeAutoReelScenes, generateFluxScene, processAutoReelScenes, type AutoReelScene, type AutoReelScenesSnapshot } from "@/lib/videos/auto-reel-scenes";

export const runtime = "nodejs";

type PersistedScene = AutoReelScene & { storagePath: string; mediaUrl?: string };

function mergeVisualScenes(current: unknown, incoming: unknown) {
  const merged = new Map<number, PersistedScene>();
  for (const value of [current, incoming]) {
    if (!Array.isArray(value)) continue;
    for (const scene of value as PersistedScene[]) {
      if (Number.isInteger(scene?.number) && scene.number >= 1 && scene.number <= 4) merged.set(scene.number, scene);
    }
  }
  return [...merged.values()].sort((left, right) => left.number - right.number);
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });
  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const body = await request.json().catch(() => null) as { jobId?: string } | null;
  if (!body?.jobId) return NextResponse.json({ error: "jobId ausente." }, { status: 400 });
  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Persistência de vídeo indisponível." }, { status: 503 });

  const { data: job, error } = await admin
    .from("video_jobs")
    .select("id,user_id,offer_id,status,stage,metadata")
    .eq("id", body.jobId)
    .eq("user_id", userData.user.id)
    .eq("template_id", "auto-reel-v1")
    .maybeSingle();
  if (error) return NextResponse.json({ error: "Não foi possível carregar o job." }, { status: 502 });
  if (!job) return NextResponse.json({ error: "Reel não encontrado." }, { status: 404 });
  if (!canResumeAutoReelScenes(job.stage)) return NextResponse.json({ job });

  const metadata = (job.metadata && typeof job.metadata === "object" ? job.metadata : {}) as Record<string, unknown>;
  const existingScenes = Array.isArray(metadata.visualScenes) ? metadata.visualScenes as PersistedScene[] : [];
  const factualSnapshot = metadata.factualSnapshot as AutoReelScenesSnapshot | undefined;
  if (!factualSnapshot?.imageUrl || !factualSnapshot.productName) return NextResponse.json({ error: "Snapshot factual incompleto." }, { status: 422 });

  const markFailed = async (message: string) => {
    const { error: failError } = await admin.from("video_jobs").update({
      status: "failed",
      stage: "failed",
      error_message: message.slice(0, 240),
    }).eq("id", job.id).eq("user_id", userData.user.id);
    if (failError) return { failedJob: null, failError };
    const { data: failedJob } = await admin.from("video_jobs")
      .select("id,status,stage,video_url,metadata,created_at")
      .eq("id", job.id)
      .maybeSingle();
    return { failedJob, failError: null };
  };

  let image: Blob;
  try {
    const imageResponse = await fetch(factualSnapshot.imageUrl);
    if (!imageResponse.ok) throw new Error(`Imagem factual HTTP ${imageResponse.status}.`);
    const bytes = await imageResponse.arrayBuffer();
    if (!bytes.byteLength) throw new Error("Imagem factual vazia.");
    image = new Blob([bytes], { type: imageResponse.headers.get("content-type") ?? "image/jpeg" });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Imagem factual indisponível.";
    const { failedJob, failError } = await markFailed(message);
    return NextResponse.json({
      job: failedJob,
      error: message,
      failureUpdateError: failError ? { code: failError.code, message: failError.message, details: failError.details, hint: failError.hint } : null,
    }, { status: 502 });
  }

  const result = await processAutoReelScenes({
    jobId: job.id,
    factualSnapshot,
    sourceImage: image,
    existingScenes,
    generate: (scene, sourceImage) => generateFluxScene({
      image: sourceImage,
      prompt: scene.prompt,
      seed: scene.seed,
      accountId: process.env.CLOUDFLARE_ACCOUNT_ID ?? "",
      apiToken: process.env.CLOUDFLARE_API_TOKEN ?? "",
    }),
    persistScene: async (scene, generated) => {
      const storagePath = `auto-reels/${job.id}/scene-${scene.number}.jpg`;
      const storage = admin.storage.from("videos");
      const existing = await storage.download(storagePath);
      if (!existing.error && existing.data) {
        return { storagePath, mediaUrl: storage.getPublicUrl(storagePath).data.publicUrl };
      }
      const upload = await storage.upload(storagePath, Buffer.from(generated.bytes), {
        contentType: generated.contentType,
        upsert: false,
      });
      if (upload.error) {
        const uploadError = upload.error as typeof upload.error & { code?: string; details?: string };
        for (let attempt = 0; attempt < 3; attempt += 1) {
          const raced = await storage.download(storagePath);
          if (!raced.error && raced.data) {
            return { storagePath, mediaUrl: storage.getPublicUrl(storagePath).data.publicUrl };
          }
          if (attempt < 2) await new Promise((resolve) => setTimeout(resolve, 200));
        }
        throw new Error(JSON.stringify({
          code: uploadError.code,
          message: uploadError.message,
          details: uploadError.details,
        }));
      }
      return { storagePath, mediaUrl: storage.getPublicUrl(storagePath).data.publicUrl };
    },
    updateJob: async (jobId, stage, stageMetadata) => {
      const { data: currentJob, error: currentError } = await admin.from("video_jobs")
        .select("metadata")
        .eq("id", jobId)
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (currentError) throw new Error(JSON.stringify({
        code: currentError.code,
        message: currentError.message,
        details: currentError.details,
        hint: currentError.hint,
      }));
      const currentMetadata = (currentJob?.metadata && typeof currentJob.metadata === "object" ? currentJob.metadata : metadata) as Record<string, unknown>;
      const incomingScenes = stageMetadata?.scenes ?? stageMetadata?.visualScenes;
      const nextMetadata = incomingScenes
        ? { ...currentMetadata, visualScenes: mergeVisualScenes(currentMetadata.visualScenes, incomingScenes) }
        : currentMetadata;
      const { error: updateError } = await admin.from("video_jobs").update({
        status: stage === "failed" ? "failed" : "processing",
        stage,
        error_message: stage === "failed" ? String(stageMetadata?.error ?? "Falha na geração visual.") : null,
        metadata: nextMetadata,
      }).eq("id", jobId).eq("user_id", userData.user.id);
      if (updateError) throw new Error(JSON.stringify({
        code: updateError.code,
        message: updateError.message,
        details: updateError.details,
        hint: updateError.hint,
      }));
    },
  });

  const { data: updated } = await admin.from("video_jobs").select("id,status,stage,video_url,metadata,created_at").eq("id", job.id).maybeSingle();
  if (result.status === "failed") {
    return NextResponse.json({ job: updated, result, error: result.error }, { status: 502 });
  }
  return NextResponse.json({ job: updated, result }, { status: 200 });
}
