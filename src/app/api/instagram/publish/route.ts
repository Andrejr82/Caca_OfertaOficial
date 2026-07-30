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
import { evaluateInstagramSafety } from "@/lib/instagram/safety";

type PublicationBody = {
  postId?: string; offerId?: string; commandId?: string; idempotencyKey?: string;
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
    if (!body.postId || !body.offerId) return NextResponse.json({ ok: false, message: "postId e offerId são obrigatórios." }, { status: 400 });
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
      .limit(20);
    if (recentPostsError) return NextResponse.json({ ok: false, message: "Não foi possível validar a janela de segurança do Instagram." }, { status: 503 });

    const { data: draftPost, error: draftPostError } = await client.from("posts")
      .select("content")
      .eq("id", body.postId)
      .eq("user_id", user.id)
      .eq("channel", "instagram")
      .eq("status", "draft")
      .maybeSingle();
    if (draftPostError || !draftPost) return NextResponse.json({ ok: false, message: "Draft do Instagram não encontrado." }, { status: 404 });

    const safety = evaluateInstagramSafety({
      caption: draftPost.content || "",
      publishedAt: (recentPosts ?? []).map((post) => post.posted_at).filter(Boolean),
      recentCaptions: (recentPosts ?? []).map((post) => post.content).filter(Boolean)
    });
    if (!safety.ok) return NextResponse.json({ ok: false, code: safety.code, message: safety.message }, { status: 429 });

    const commandId = body.commandId ?? crypto.randomUUID();
    const idempotencyKey = body.idempotencyKey ?? publicationIdempotencyKey(body.postId, "instagram", commandId);
    const approvalCommand: OfficialPublicationApprovalCommand = {
      commandId,
      correlationId: body.correlationId ?? commandId,
      causationId: body.causationId ?? null,
      tenantId: user.id,
      offerId: body.offerId,
      postId: body.postId,
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
      offerId: body.offerId, postId: body.postId, tenantId: user.id, channel: "instagram",
      expectedOfferState: "approved", expectedOfferVersion: 2,
      expectedPostState: "draft", expectedPostVersion: 0,
      payloadReference: publicationPayloadReference(body.postId),
      requestedAt: body.requestedAt ?? new Date().toISOString(),
      actor: { type: "user", id: user.id, service: "nextjs-publication-route" },
      origin: "publication.instagram.route", reason: { code: "USER_REQUESTED_PUBLICATION" },
      metadata: { requestSource: body.requestSource ?? "instagram-dashboard" }
    };
    const result = await publishOfficialPost(command, createOfficialPublicationServiceDependencies(client, user.id));
    return result.status === "published"
      ? NextResponse.json({ ok: true, result })
      : NextResponse.json({ ok: false, code: result.code, message: result.message, result }, { status: rejectionStatus(result.code) });
  } catch (error) {
    return NextResponse.json({ ok: false, message: error instanceof Error ? error.message : "Falha na publicação oficial." }, { status: 500 });
  }
}
