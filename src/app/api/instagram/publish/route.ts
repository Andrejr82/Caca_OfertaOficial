import { NextResponse } from "next/server";
import { publishOfficialPost, type OfficialPublicationCommand } from "@/core/publication";
import { approveOfficialOfferForPublication, type OfficialPublicationApprovalCommand } from "@/core/publication";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createOfficialPublicationServiceDependencies,
  publicationIdempotencyKey,
  publicationPayloadReference
} from "@/lib/publication/official/create-official-publication-service";
import { createOfficialPublicationApprovalDependencies } from "@/lib/publication/official/create-official-publication-approval";
import { evaluateInstagramPolicy } from "@/lib/instagram/policy-guard";
import { evaluateInstagramSafety, instagramVideoFingerprint, validateInstagramReelMetadata } from "@/lib/instagram/safety";
import { fetchInstagramContentPublishingLimit } from "@/lib/instagram/content-publishing-limit";
import { discoverInstagramBusinessId } from "@/lib/instagram/client";

type PublicationBody = {
  postId?: string; offerId?: string; videoJobId?: string; commandId?: string; idempotencyKey?: string;
  correlationId?: string; causationId?: string | null; requestedAt?: string; requestSource?: string;
  mediaType?: "FEED" | "REELS";
  videoUrl?: string;
  videoDurationSeconds?: number;
  videoWidth?: number;
  videoHeight?: number;
  videoSizeBytes?: number;
  videoMimeType?: string;
};

function rejectionStatus(code: string) {
  if (code.endsWith("NOT_FOUND")) return 404;
  if (code === "TRANSPORT_FAILED") return 502;
  if (code.startsWith("INVALID_")) return 400;
  return 409;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as PublicationBody;
    let postId = body.postId;
    let offerId = body.offerId;
    let mediaType = body.mediaType ?? "FEED";
    let videoUrl = body.videoUrl;
    if (body.videoJobId) {
      const client = await createServerSupabaseClient();
      if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
      const { data: { user } } = await client.auth.getUser();
      if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
      const { data: job } = await client.from("video_jobs").select("id,offer_id,status,video_url,metadata").eq("id", body.videoJobId).eq("user_id", user.id).maybeSingle();
      if (!job || job.status !== "approved" || !job.video_url) return NextResponse.json({ ok: false, message: "O vídeo precisa estar aprovado e pronto para publicação." }, { status: 409 });
      const { data: draft } = await client.from("posts").select("id,offer_id").eq("offer_id", job.offer_id).eq("user_id", user.id).eq("channel", "instagram").eq("status", "draft").maybeSingle();
      if (!draft) {
        const { data: published } = await client.from("posts").select("id").eq("offer_id", job.offer_id).eq("user_id", user.id).eq("channel", "instagram").eq("status", "published").limit(1).maybeSingle();
        return NextResponse.json({ ok: false, code: published ? "INSTAGRAM_ALREADY_PUBLISHED" : "INSTAGRAM_DRAFT_NOT_FOUND", message: published ? "Este vídeo já foi publicado no Instagram para esta oferta." : "Nenhum draft do Instagram foi encontrado para esta oferta." }, { status: published ? 409 : 404 });
      }
      postId = draft.id;
      offerId = job.offer_id;
      mediaType = "REELS";
      videoUrl = job.video_url;
      const validation = (job.metadata as { validation?: { durationSeconds?: number; width?: number; height?: number; sizeBytes?: number; mimeType?: string } } | null)?.validation;
      if (validation) {
        body.videoDurationSeconds = validation.durationSeconds;
        body.videoWidth = validation.width;
        body.videoHeight = validation.height;
        body.videoSizeBytes = validation.sizeBytes;
        body.videoMimeType = validation.mimeType;
      }
    }
    if (!postId || !offerId) return NextResponse.json({ ok: false, message: "postId e offerId são obrigatórios." }, { status: 400 });
    if (mediaType === "REELS") {
      if (!videoUrl || !/^https:\/\//i.test(videoUrl)) {
        return NextResponse.json({ ok: false, code: "INVALID_REEL_VIDEO_URL", message: "Reels exige uma URL HTTPS pública do vídeo." }, { status: 400 });
      }
      const reelError = validateInstagramReelMetadata({
        durationSeconds: body.videoDurationSeconds,
        width: body.videoWidth,
        height: body.videoHeight,
        sizeBytes: body.videoSizeBytes,
        mimeType: body.videoMimeType
      });
      if (reelError) return NextResponse.json({ ok: false, code: "INVALID_REEL_MEDIA", message: reelError }, { status: 400 });
    }
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { data: recentPosts, error: recentPostsError } = await client.from("posts")
      .select("content,posted_at")
      .eq("user_id", user.id)
      .eq("channel", "instagram")
      .eq("status", "published")
      .gte("posted_at", since)
      .order("posted_at", { ascending: false })
      .limit(100);
    if (recentPostsError) return NextResponse.json({ ok: false, message: "Não foi possível validar a janela de segurança do Instagram." }, { status: 503 });

    if (mediaType === "REELS") {
      const { data: reelReceipts, error: reelReceiptsError } = await client.from("app_settings")
        .select("value")
        .eq("user_id", user.id)
        .like("key", "pmav5.publication.receipt.%")
        .limit(100);
      if (reelReceiptsError) return NextResponse.json({ ok: false, message: "Não foi possível validar duplicidade do Reel." }, { status: 503 });
      const fingerprint = instagramVideoFingerprint(videoUrl as string);
      const duplicate = (reelReceipts ?? []).some((row) => {
        const metadata = (row.value as { metadata?: Record<string, unknown> } | null)?.metadata;
        return metadata?.instagramVideoFingerprint === fingerprint;
      });
      if (duplicate) return NextResponse.json({ ok: false, code: "INSTAGRAM_DUPLICATE_VIDEO", message: "Este vídeo já foi publicado no Instagram." }, { status: 409 });
    }

    const [{ data: draftPost, error: draftPostError }, { data: policyOffer, error: policyOfferError }] = await Promise.all([
      client.from("posts")
        .select("content")
        .eq("id", postId)
        .eq("user_id", user.id)
        .eq("channel", "instagram")
        .eq("status", "draft")
        .maybeSingle(),
      client.from("offers")
        .select("id,product_name,category,notes,platform")
        .eq("id", offerId)
        .eq("user_id", user.id)
        .maybeSingle()
    ]);
    if (draftPostError || !draftPost) return NextResponse.json({ ok: false, message: "Draft do Instagram não encontrado." }, { status: 404 });

    if (policyOfferError || !policyOffer) {
      const code = "INSTAGRAM_POLICY_INPUT_INVALID";
      const rule = "policy_context_unavailable";
      const message = "Publicação bloqueada: não foi possível validar o produto contra a política do Instagram.";
      console.warn(JSON.stringify({ event: "instagram.policy.blocked", offerId, postId, tenantId: user.id, rule, code, reason: message }));
      return NextResponse.json({ ok: false, code, message, rule }, { status: 409 });
    }

    const policy = evaluateInstagramPolicy({
      productName: policyOffer.product_name,
      category: policyOffer.category,
      notes: policyOffer.notes,
      caption: draftPost.content,
      platform: policyOffer.platform
    });
    if (!policy.ok) {
      console.warn(JSON.stringify({
        event: "instagram.policy.blocked",
        offerId,
        postId,
        tenantId: user.id,
        rule: policy.rule,
        code: policy.code,
        reason: policy.message
      }));
      return NextResponse.json({ ok: false, code: policy.code, message: policy.message, rule: policy.rule }, { status: 409 });
    }

    let metaLimit: { quotaUsage: number; quotaTotal: number } | undefined;
    if (process.env.INSTAGRAM_ACCESS_TOKEN) {
      try {
        const instagramUserId = await discoverInstagramBusinessId();
        const limit = await fetchInstagramContentPublishingLimit(instagramUserId, process.env.INSTAGRAM_ACCESS_TOKEN);
        if (limit.available) metaLimit = { quotaUsage: limit.quotaUsage, quotaTotal: limit.quotaTotal };
      } catch {
        // The local fallback below counts the same rolling 24-hour window using the official quota.
      }
    }
    const safety = evaluateInstagramSafety({
      caption: draftPost.content || "",
      publishedAt: (recentPosts ?? []).map((post) => post.posted_at).filter(Boolean),
      recentCaptions: (recentPosts ?? []).map((post) => post.content).filter(Boolean),
      metaLimit
    });
    if (!safety.ok) return NextResponse.json({ ok: false, code: safety.code, message: safety.message }, { status: 429 });

    const commandId = body.commandId ?? crypto.randomUUID();
    const idempotencyKey = body.idempotencyKey ?? publicationIdempotencyKey(postId, "instagram", commandId);
    const approvalCommand: OfficialPublicationApprovalCommand = {
      commandId,
      correlationId: body.correlationId ?? commandId,
      causationId: body.causationId ?? null,
      tenantId: user.id,
      offerId,
      postId,
      channel: "instagram",
      requestedAt: body.requestedAt ?? new Date().toISOString()
    };
    const approval = await approveOfficialOfferForPublication(
      approvalCommand,
      createOfficialPublicationApprovalDependencies(client, user.id)
    );
    if (approval.status !== "approved") {
      return NextResponse.json({ ok: false, code: approval.code, message: approval.message, result: approval }, { status: rejectionStatus(approval.code) });
    }
    const command: OfficialPublicationCommand = {
      contractVersion: "pmav5.publication/v1", commandId, idempotencyKey,
      correlationId: body.correlationId ?? commandId, causationId: body.causationId ?? null,
      offerId, postId, tenantId: user.id, channel: "instagram",
      expectedOfferState: "approved", expectedOfferVersion: 2,
      expectedPostState: "draft", expectedPostVersion: 0,
      payloadReference: publicationPayloadReference(postId),
      requestedAt: body.requestedAt ?? new Date().toISOString(),
      actor: { type: "user", id: user.id, service: "nextjs-publication-route" },
      origin: "publication.instagram.route", reason: { code: "USER_REQUESTED_PUBLICATION" },
      metadata: {
        requestSource: body.requestSource ?? "instagram-dashboard",
        instagramMediaType: mediaType,
        ...(mediaType === "REELS" ? {
          instagramVideoUrl: videoUrl as string,
          ...(body.videoDurationSeconds !== undefined ? { instagramVideoDurationSeconds: body.videoDurationSeconds } : {}),
          ...(body.videoWidth !== undefined ? { instagramVideoWidth: body.videoWidth } : {}),
          ...(body.videoHeight !== undefined ? { instagramVideoHeight: body.videoHeight } : {}),
          ...(body.videoSizeBytes !== undefined ? { instagramVideoSizeBytes: body.videoSizeBytes } : {}),
          ...(body.videoMimeType !== undefined ? { instagramVideoMimeType: body.videoMimeType } : {})
        } : {})
      }
    };
    const result = await publishOfficialPost(command, createOfficialPublicationServiceDependencies(client, user.id));
    return result.status === "published"
      ? NextResponse.json({ ok: true, result })
      : NextResponse.json({ ok: false, code: result.code, message: result.message, result }, { status: rejectionStatus(result.code) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha na publicação oficial." }, { status: 500 });
  }
}
