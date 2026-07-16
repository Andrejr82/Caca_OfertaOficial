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

type PublicationBody = {
  postId?: string;
  offerId?: string;
  commandId?: string;
  idempotencyKey?: string;
  correlationId?: string;
  causationId?: string | null;
  requestedAt?: string;
  requestSource?: string;
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
    if (!body.postId || !body.offerId) {
      return NextResponse.json({ ok: false, message: "postId e offerId são obrigatórios." }, { status: 400 });
    }
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const commandId = body.commandId ?? crypto.randomUUID();
    const idempotencyKey = body.idempotencyKey ?? publicationIdempotencyKey(body.postId, "telegram", commandId);
    const approvalCommand: OfficialPublicationApprovalCommand = {
      commandId,
      correlationId: body.correlationId ?? commandId,
      causationId: body.causationId ?? null,
      tenantId: user.id,
      offerId: body.offerId,
      postId: body.postId,
      channel: "telegram",
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
      offerId: body.offerId, postId: body.postId, tenantId: user.id, channel: "telegram",
      expectedOfferState: "approved", expectedOfferVersion: 2,
      expectedPostState: "draft", expectedPostVersion: 0,
      payloadReference: publicationPayloadReference(body.postId),
      requestedAt: body.requestedAt ?? new Date().toISOString(),
      actor: { type: "user", id: user.id, service: "nextjs-publication-route" },
      origin: "publication.telegram.route", reason: { code: "USER_REQUESTED_PUBLICATION" },
      metadata: { requestSource: body.requestSource ?? "telegram-dashboard" }
    };
    const result = await publishOfficialPost(command, createOfficialPublicationServiceDependencies(client, user.id));
    return result.status === "published"
      ? NextResponse.json({ ok: true, result })
      : NextResponse.json({ ok: false, code: result.code, message: result.message, result }, { status: rejectionStatus(result.code) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha na publicação oficial." }, { status: 500 });
  }
}
