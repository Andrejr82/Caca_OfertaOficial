import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getVideoJobPolicy, quotaMessage } from "@/lib/videos/job-policy";
import { downloadDriveVideo, listDriveVideos, validateDriveVideo } from "@/lib/videos/google-drive";
import { buildCopyV2ChannelCopy } from "@/core/ai/prompt";
import { createSubId, createTrackedUrl } from "@/lib/tracking/sub-id";

const createJobSchema = z.object({
  offerId: z.string().uuid(),
  driveFileId: z.string().trim().min(5),
  driveFileName: z.string().trim().min(1).max(240),
  prompt: z.string().trim().min(20).max(10000)
});

export async function GET() {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const { data, error } = await supabase
    .from("video_jobs")
    .select("*, offers(id, product_name, image_url, current_price, old_price, platform)")
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const policy = getVideoJobPolicy();
  const todayStart = new Date();
  todayStart.setUTCHours(0, 0, 0, 0);
  const [{ count: todayCount }, { count: activeCount }] = await Promise.all([
    supabase.from("video_jobs").select("id", { count: "exact", head: true }).gte("created_at", todayStart.toISOString()),
    supabase.from("video_jobs").select("id", { count: "exact", head: true }).in("status", ["queued", "processing"])
  ]).then((results) => results.map((result) => ({ count: result.count ?? 0 })));
  return NextResponse.json({ jobs: data ?? [], usage: { todayCount, activeCount, ...policy } });
}

export async function POST(request: Request) {
  const supabase = await createServerSupabaseClient();
  if (!supabase) return NextResponse.json({ error: "Supabase não configurado." }, { status: 503 });

  const { data: userData } = await supabase.auth.getUser();
  if (!userData.user) return NextResponse.json({ error: "Não autenticado." }, { status: 401 });

  const parsed = createJobSchema.safeParse(await request.json());
  if (!parsed.success) return NextResponse.json({ error: "Informe uma oferta e um roteiro válido." }, { status: 400 });

  const { data: offer, error: offerError } = await supabase
    .from("offers")
    .select("id,user_id,product_name,platform,category,current_price,old_price,image_url,original_url,shipping_free,explainability,marketplace_metrics")
    .eq("id", parsed.data.offerId)
    .maybeSingle();

  if (offerError || !offer) return NextResponse.json({ error: "Oferta não encontrada." }, { status: 404 });

  let files;
  try {
    files = await listDriveVideos();
  } catch (driveError) {
    return NextResponse.json({ error: driveError instanceof Error ? driveError.message : "Google Drive indisponível." }, { status: 503 });
  }
  const file = files.find((candidate) => candidate.id === parsed.data.driveFileId && candidate.name === parsed.data.driveFileName);
  if (!file) return NextResponse.json({ error: "Arquivo do Google Drive não encontrado na pasta configurada." }, { status: 404 });
  const validationError = validateDriveVideo(file);
  if (validationError) return NextResponse.json({ error: validationError }, { status: 400 });

  const policy = getVideoJobPolicy();
  const { data, error } = await (supabase as any)
    .rpc("enqueue_video_job", {
      _user_id: userData.user.id,
      _offer_id: parsed.data.offerId,
      _script: parsed.data.prompt,
      _template_id: "gemini-drive-v1",
      _daily_limit: null,
      _queue_limit: policy.queueLimit
    })
    .single();

  if (error) {
    if (error.message.includes("VIDEO_QUEUE_LIMIT")) return NextResponse.json({ error: quotaMessage("queue_limit", policy) }, { status: 429 });
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  try {
    const media = await downloadDriveVideo(file.id);
    const admin = createSupabaseAdminClient();
    if (!admin) throw new Error("Supabase service role não configurada para importar o vídeo.");
    const path = `${userData.user.id}/${data.id}.mp4`;
    const upload = await admin.storage.from("videos").upload(path, media.bytes, { contentType: "video/mp4", upsert: true });
    if (upload.error) throw new Error(`Falha ao salvar vídeo: ${upload.error.message}`);
    const { data: publicData } = admin.storage.from("videos").getPublicUrl(path);
    const durationSeconds = Number(file.videoMediaMetadata?.durationMillis ?? 0) / 1000;
    const metadata = {
      templateId: "gemini-drive-v1", source: "google-drive", driveFileId: file.id, driveFileName: file.name,
      validation: { mimeType: file.mimeType, sizeBytes: Number(file.size), width: file.videoMediaMetadata?.width ?? null, height: file.videoMediaMetadata?.height ?? null, durationSeconds, audio: "not_verified_server_side" },
      prompt: parsed.data.prompt
    };
    const { error: updateError } = await admin.from("video_jobs").update({
      status: "ready", stage: "ready_for_review", video_url: publicData.publicUrl, metadata, completed_at: new Date().toISOString()
    }).eq("id", data.id).eq("user_id", userData.user.id);
    if (updateError) throw new Error(`Falha ao finalizar importação: ${updateError.message}`);

    const facts = { productName: offer.product_name, marketplace: offer.platform, category: offer.category ?? null, currentPrice: Number(offer.current_price), originalPrice: offer.old_price == null ? null : Number(offer.old_price), freeShipping: offer.shipping_free ?? null, evidence: { ...(offer.explainability ?? {}), ...(offer.marketplace_metrics ?? {}) } };
    const channels = ["facebook", "instagram"] as const;
    const draftIds: Record<string, string> = {};
    const channelCopies: Record<string, string> = {};
    for (const channel of channels) {
      const subId = createSubId(channel, offer.product_name, offer.id);
      const trackedUrl = createTrackedUrl(offer.original_url, subId);
      const { data: link, error: linkError } = await admin.from("affiliate_links").upsert({ user_id: userData.user.id, offer_id: offer.id, channel, original_url: offer.original_url, tracked_url: trackedUrl, sub_id: subId }, { onConflict: "offer_id,channel" }).select("id").single();
      if (linkError || !link) throw new Error(`Falha no link ${channel}: ${linkError?.message ?? "linha ausente"}`);
      const rawCopy = buildCopyV2ChannelCopy(facts, channel);
      const content = channel === "facebook" ? `${rawCopy}${trackedUrl}` : rawCopy;
      channelCopies[channel] = content;
      const { data: existing } = await admin.from("posts").select("id").eq("user_id", userData.user.id).eq("offer_id", offer.id).eq("channel", channel).eq("status", "draft").maybeSingle();
      if (existing) {
        await admin.from("posts").update({ content, affiliate_link_id: link.id }).eq("id", existing.id).eq("status", "draft");
        draftIds[channel] = existing.id;
      } else {
        const { data: post, error: postError } = await admin.from("posts").insert({ user_id: userData.user.id, offer_id: offer.id, affiliate_link_id: link.id, channel, content, status: "draft" }).select("id").single();
        if (postError || !post) throw new Error(`Falha no draft ${channel}: ${postError?.message ?? "linha ausente"}`);
        draftIds[channel] = post.id;
      }
    }
    await admin.from("video_jobs").update({ metadata: { ...metadata, draftIds, channelCopies } }).eq("id", data.id).eq("user_id", userData.user.id);
    const { data: job } = await supabase.from("video_jobs").select("*, offers(id, product_name, image_url, current_price, old_price, platform)").eq("id", data.id).single();
    return NextResponse.json({ job, drafts: draftIds }, { status: 201 });
  } catch (importError) {
    await supabase.from("video_jobs").update({ status: "failed", stage: "failed", error_message: importError instanceof Error ? importError.message : "Falha ao importar vídeo." }).eq("id", data.id).eq("user_id", userData.user.id);
    return NextResponse.json({ error: importError instanceof Error ? importError.message : "Falha ao importar vídeo." }, { status: 502 });
  }
}
