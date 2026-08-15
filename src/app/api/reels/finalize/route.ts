import { NextResponse } from "next/server";

import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  MAX_AUTHORIZED_REEL_BYTES,
  authorizedReelFinalizeSchema,
  buildAuthorizedReelJobId,
  buildAuthorizedReelStoragePath,
} from "@/lib/videos/authorized-reel";

const jobSelect = "id,status,stage,video_url,metadata,created_at";

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = authorizedReelFinalizeSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Dados do criativo inválidos." }, { status: 400 });

  const { data: offer } = await supabase
    .from("offers")
    .select("id")
    .eq("id", parsed.data.offerId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (!offer) return NextResponse.json({ error: "Oferta não encontrada para este usuário." }, { status: 404 });

  const admin = createSupabaseAdminClient();
  if (!admin) return NextResponse.json({ error: "Upload de vídeos indisponível." }, { status: 503 });

  const jobId = buildAuthorizedReelJobId(parsed.data.uploadId);
  const path = buildAuthorizedReelStoragePath(user.id, parsed.data.uploadId);

  const { data: existingJob } = await admin
    .from("video_jobs")
    .select(jobSelect)
    .eq("id", jobId)
    .eq("user_id", user.id)
    .maybeSingle();
  if (existingJob) return NextResponse.json({ job: existingJob }, { status: 200 });

  const fileName = `${parsed.data.uploadId}.mp4`;
  const { data: files, error: listError } = await admin.storage
    .from("videos")
    .list(`${user.id}/reels`, { search: fileName, limit: 10 });
  if (listError) return NextResponse.json({ error: "Não foi possível validar o arquivo enviado." }, { status: 502 });

  const stored = files?.find((file) => file.name === fileName);
  const storedSize = Number(stored?.metadata?.size ?? 0);
  const storedMimeType = String(stored?.metadata?.mimetype ?? stored?.metadata?.contentType ?? "").toLowerCase();
  if (!stored || !Number.isFinite(storedSize) || storedSize <= 0 || storedSize > MAX_AUTHORIZED_REEL_BYTES) {
    return NextResponse.json({ error: "Arquivo de vídeo ausente ou fora do limite permitido." }, { status: 400 });
  }
  if (storedSize !== parsed.data.fileSize || storedMimeType !== "video/mp4") {
    await admin.storage.from("videos").remove([path]);
    return NextResponse.json({ error: "O arquivo armazenado não corresponde ao MP4 informado no upload." }, { status: 400 });
  }

  const { data: publicData } = admin.storage.from("videos").getPublicUrl(path);
  const metadata = {
    templateId: "authorized-reel-v1",
    source: "authorized-reel",
    rightsDeclaration: {
      status: parsed.data.rightsStatus,
      sourceUrl: parsed.data.sourceUrl || null,
      note: parsed.data.sourceNote || null,
      declaredAt: new Date().toISOString(),
    },
    browserClaim: {
      mimeType: parsed.data.mimeType,
      sizeBytes: parsed.data.fileSize,
      width: parsed.data.width,
      height: parsed.data.height,
      durationSeconds: parsed.data.durationSeconds,
    },
    validation: {
      mimeType: storedMimeType,
      sizeBytes: storedSize,
      mediaVerified: false,
      measurementSource: "storage-object",
    },
    storagePath: path,
  };

  const { data: job, error: insertError } = await admin
    .from("video_jobs")
    .insert({
      id: jobId,
      user_id: user.id,
      offer_id: parsed.data.offerId,
      status: "processing",
      stage: "awaiting_oracle_verification",
      script: "Criativo externo autorizado",
      video_url: publicData.publicUrl,
      template_id: "authorized-reel-v1",
      metadata,
    })
    .select(jobSelect)
    .single();

  if (insertError || !job) {
    if (insertError?.code === "23505") {
      const { data: concurrentJob } = await admin
        .from("video_jobs")
        .select(jobSelect)
        .eq("id", jobId)
        .eq("user_id", user.id)
        .maybeSingle();
      if (concurrentJob) return NextResponse.json({ job: concurrentJob }, { status: 200 });
    }

    await admin.storage.from("videos").remove([path]);
    return NextResponse.json({ error: insertError?.message ?? "Não foi possível registrar o criativo." }, { status: 500 });
  }

  return NextResponse.json({ job }, { status: 201 });
}
