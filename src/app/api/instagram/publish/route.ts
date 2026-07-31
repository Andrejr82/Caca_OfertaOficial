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
import { validateInstagramReelMetadata } from "@/lib/instagram/safety";
import { loadInstagramPublicationContext, resolveInstagramVideoJobInput } from "@/lib/instagram/publication-input";

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
    if ((!postId || !offerId) && body.videoJobId) {
      const client = await createServerSupabaseClient();
      if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
      const { data: { user } } = await client.auth.getUser();
      if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });
      const resolved = await resolveInstagramVideoJobInput(client, user.id, body.videoJobId);
      if (!resolved.ok) return NextResponse.json({ ok: false, message: resolved.message }, { status: resolved.status });
      postId = resolved.postId;
      offerId = resolved.offerId;
      mediaType = "REELS";
      videoUrl = resolved.videoUrl;
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

    const publicationContext = await loadInstagramPublicationContext(client, user.id, postId, mediaType, videoUrl);
    if (!publicationContext.ok) return NextResponse.json({ ok: false, code: publicationContext.code, message: publicationContext.message }, { status: publicationContext.status });

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
