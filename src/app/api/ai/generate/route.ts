import { NextResponse } from "next/server";
import { generateOfficialAI, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface GenerateAIRequest {
  offerId?: string;
  commandId?: string;
  correlationId?: string;
  causationId?: string | null;
  providerPreference?: "groq" | "cerebras";
  requestedAt?: string;
}

const DEFAULT_REQUESTED_AT = "2000-01-01T00:00:00.000Z";

export async function POST(request: Request) {
  try {
    const body = await request.json() as GenerateAIRequest;
    if (!body.offerId) {
      return NextResponse.json({ ok: false, code: "INVALID_REQUEST", message: "offerId é obrigatório." }, { status: 400 });
    }

    const supabase = await createServerSupabaseClient();
    if (!supabase) {
      return NextResponse.json({ ok: false, code: "DEPENDENCY_UNAVAILABLE", message: "Supabase não configurado." }, { status: 503 });
    }
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Não autenticado." }, { status: 401 });
    }

    const commandId = body.commandId || request.headers.get("x-command-id") || `ai:${body.offerId}:v1`;
    const command: OfficialAICommand = {
      contractVersion: "pmav5.ai/v1",
      commandId,
      idempotencyKey: `ai:${body.offerId}:v1`,
      correlationId: body.correlationId || request.headers.get("x-correlation-id") || commandId,
      causationId: body.causationId ?? request.headers.get("x-causation-id"),
      offerId: body.offerId,
      tenantId: user.id,
      expectedState: "selected",
      expectedVersion: 1,
      providerPreference: body.providerPreference,
      channels: ["telegram", "instagram", "whatsapp"],
      requestedAt: body.requestedAt || request.headers.get("x-requested-at") || DEFAULT_REQUESTED_AT,
      actor: { type: "user", id: user.id, service: "nextjs-ai-route" },
      origin: "api.ai.generate",
      reason: { code: "GENERATE_OFFICIAL_CONTENT" }
    };

    const result = await generateOfficialAI(
      command,
      createOfficialAIServiceDependencies(supabase, user.id)
    );
    return NextResponse.json(
      { ok: result.status === "approved", ...result },
      { status: result.status === "approved" ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json({
      ok: false,
      code: "OFFICIAL_AI_FAILURE",
      message: error instanceof Error ? error.message : "Erro desconhecido"
    }, { status: 500 });
  }
}
