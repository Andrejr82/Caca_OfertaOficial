import { NextResponse } from "next/server";
import {
  approveOfficialOfferForPublication,
  publishOfficialPost,
  type OfficialPublicationApprovalCommand,
  type OfficialPublicationCommand
} from "@/core/publication";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  createOfficialPublicationServiceDependencies,
  publicationIdempotencyKey,
  publicationPayloadReference
} from "@/lib/publication/official/create-official-publication-service";
import { createOfficialPublicationApprovalDependencies } from "@/lib/publication/official/create-official-publication-approval";

type PublicationBody = {
  postId?: string; offerId?: string; commandId?: string; idempotencyKey?: string;
  videoJobId?: string;
  correlationId?: string; causationId?: string | null; requestedAt?: string; requestSource?: string;
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
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    let videoUrl: string | undefined;
    if (body.videoJobId) {
      const { data: job } = await client.from("video_jobs").select("id,offer_id,status,video_url").eq("id", body.videoJobId).eq("user_id", user.id).maybeSingle();
      if (!job || job.status !== "approved" || !job.video_url) return NextResponse.json({ ok: false, message: "O vídeo precisa estar aprovado e pronto para publicação." }, { status: 409 });
      const { data: draft } = await client.from("posts").select("id,offer_id").eq("offer_id", job.offer_id).eq("user_id", user.id).eq("channel", "facebook").eq("status", "draft").maybeSingle();
      if (!draft) return NextResponse.json({ ok: false, message: "Nenhum draft do Facebook foi encontrado para esta oferta." }, { status: 404 });
      body.postId = draft.id;
      body.offerId = job.offer_id;
      videoUrl = job.video_url;
    }
    if (!body.postId || !body.offerId) return NextResponse.json({ ok: false, message: "postId e offerId são obrigatórios." }, { status: 400 });
    
    // Fetch tracked url from DB to pass along for commenting
    const { data: affiliateLink } = await client.from("affiliate_links").select("tracked_url").eq("offer_id", body.offerId).eq("channel", "facebook").maybeSingle();

    const commandId = body.commandId ?? crypto.randomUUID();
    // A videoJobId identifies the media, not a publication attempt. Reusing it
    // here replayed stale failures forever instead of retrying with current
    // credentials. Keep idempotency per explicit client command or request.
    const idempotencyKey = body.idempotencyKey ?? publicationIdempotencyKey(body.postId, "facebook", commandId);
    const approvalCommand: OfficialPublicationApprovalCommand = {
      commandId,
      correlationId: body.correlationId ?? commandId,
      causationId: body.causationId ?? null,
      tenantId: user.id,
      offerId: body.offerId,
      postId: body.postId,
      channel: "facebook",
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
      offerId: body.offerId, postId: body.postId, tenantId: user.id, channel: "facebook",
      expectedOfferState: "approved", expectedOfferVersion: 2,
      expectedPostState: "draft", expectedPostVersion: 0,
      payloadReference: publicationPayloadReference(body.postId),
      requestedAt: body.requestedAt ?? new Date().toISOString(),
      actor: { type: "user", id: user.id, service: "nextjs-publication-route" },
      origin: "publication.facebook.route", reason: { code: "USER_REQUESTED_PUBLICATION" },
      metadata: {
        requestSource: body.requestSource ?? "facebook-dashboard",
        ...(videoUrl ? { facebookMediaType: "VIDEO", facebookVideoUrl: videoUrl } : {}),
        ...(affiliateLink ? { affiliateLink: affiliateLink.tracked_url } : {})
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
