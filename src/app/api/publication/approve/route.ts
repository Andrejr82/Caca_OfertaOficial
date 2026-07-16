import { NextResponse } from "next/server";
import {
  approveOfficialOfferForPublication,
  type OfficialPublicationApprovalCommand,
  type OfficialPublicationChannel
} from "@/core/publication";
import { createOfficialPublicationApprovalDependencies } from "@/lib/publication/official/create-official-publication-approval";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const channels = new Set<OfficialPublicationChannel>(["whatsapp", "telegram", "instagram"]);

interface ApprovalBody {
  postId?: string;
  offerId?: string;
  channel?: OfficialPublicationChannel;
  commandId?: string;
  correlationId?: string;
  causationId?: string | null;
  requestedAt?: string;
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ApprovalBody;
    if (!body.postId || !body.offerId || !body.channel || !channels.has(body.channel)) {
      return NextResponse.json({ ok: false, message: "postId, offerId e channel válidos são obrigatórios." }, { status: 400 });
    }
    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, message: "Supabase não configurado." }, { status: 503 });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, message: "Não autenticado." }, { status: 401 });

    const commandId = body.commandId ?? crypto.randomUUID();
    const command: OfficialPublicationApprovalCommand = {
      commandId,
      correlationId: body.correlationId ?? commandId,
      causationId: body.causationId ?? null,
      tenantId: user.id,
      offerId: body.offerId,
      postId: body.postId,
      channel: body.channel,
      requestedAt: body.requestedAt ?? new Date().toISOString()
    };
    const result = await approveOfficialOfferForPublication(
      command,
      createOfficialPublicationApprovalDependencies(client, user.id)
    );
    return result.status === "approved"
      ? NextResponse.json({ ok: true, ...result })
      : NextResponse.json({ ok: false, ...result }, { status: 409 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      message: error instanceof Error ? error.message : "Falha na aprovação oficial."
    }, { status: 500 });
  }
}
