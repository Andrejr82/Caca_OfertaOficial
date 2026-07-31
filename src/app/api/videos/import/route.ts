import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { getVideoJobPolicy, quotaMessage } from "@/lib/videos/job-policy";
import { buildImportIdempotencyKey, normalizeSourceUrl, validateImportRequest, type ImportChannel } from "@/lib/videos/import/import-job";

function errorStatus(code: string) {
  if (code === "RIGHTS_CONFIRMATION_REQUIRED" || code === "CHANNEL_REQUIRED" || code === "CHANNEL_NOT_ALLOWED") return 400;
  if (code === "SOURCE_HOST_NOT_ALLOWED" || code === "HTTPS_REQUIRED" || code === "EMBEDDED_CREDENTIALS") return 400;
  return 400;
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ ok: false, error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  const user = userData.user;
  if (!user) return NextResponse.json({ ok: false, error: "Não autenticado." }, { status: 401 });

  let input: Record<string, unknown>;
  try {
    input = await request.json();
  } catch {
    return NextResponse.json({ ok: false, error: "Payload inválido." }, { status: 400 });
  }

  const validation = validateImportRequest(input);
  if (!validation.ok) return NextResponse.json({ ok: false, code: validation.code, error: "Dados de importação inválidos." }, { status: errorStatus(validation.code) });

  const offerId = input.offerId as string;
  const sourceUrl = input.sourceUrl as string;
  const channels = input.channels as ImportChannel[];
  const idempotencyKey = buildImportIdempotencyKey(user.id, offerId, sourceUrl);

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id")
    .eq("id", offerId)
    .maybeSingle();
  if (offerError || !offer) return NextResponse.json({ ok: false, error: "Oferta não encontrada." }, { status: 404 });

  const { data: duplicate, error: duplicateError } = await supabase
    .from("video_jobs")
    .select("id,status")
    .eq("user_id", user.id)
    .eq("offer_id", offerId)
    .filter("metadata->>importIdempotencyKey", "eq", idempotencyKey)
    .in("status", ["queued", "processing", "ready", "approved", "published"])
    .maybeSingle();
  if (duplicateError) return NextResponse.json({ ok: false, error: "Não foi possível verificar duplicidade." }, { status: 503 });
  if (duplicate) return NextResponse.json({ ok: false, code: "DUPLICATE_IMPORT", error: "Vídeo já importado ou em processamento.", jobId: duplicate.id }, { status: 409 });

  const policy = getVideoJobPolicy();
  const { data: job, error: enqueueError } = await (supabase as any).rpc("enqueue_video_job", {
    _user_id: user.id,
    _offer_id: offerId,
    _script: "imported-video-v1",
    _template_id: "imported-video-v1",
    _daily_limit: null,
    _queue_limit: policy.queueLimit
  });
  if (enqueueError) {
    if (enqueueError.message.includes("VIDEO_QUEUE_LIMIT")) return NextResponse.json({ ok: false, error: quotaMessage("queue_limit", policy) }, { status: 429 });
    return NextResponse.json({ ok: false, error: enqueueError.message }, { status: 500 });
  }

  const metadata = {
    importedVideo: {
      sourceUrl,
      normalizedSourceUrl: normalizeSourceUrl(sourceUrl),
      channels,
      rightsConfirmed: true,
      rightsConfirmedAt: new Date().toISOString(),
      rightsConfirmedBy: user.id,
      importIdempotencyKey: idempotencyKey,
      importType: "authorized-source"
    }
  };
  const { error: metadataError } = await supabase.from("video_jobs").update({ metadata, stage: "queued" }).eq("id", job.id).eq("user_id", user.id);
  if (metadataError) return NextResponse.json({ ok: false, error: "Job criado, mas não foi possível registrar a procedência." }, { status: 503 });

  return NextResponse.json({ ok: true, jobId: job.id, status: job.status }, { status: 201 });
}
