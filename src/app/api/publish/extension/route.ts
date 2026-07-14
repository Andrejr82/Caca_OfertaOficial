import { NextResponse } from "next/server";
import { generateOfficialAI, type OfficialAIChannel, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Command-Id, X-Correlation-Id"
};

interface ExtensionAIRequest {
  offerId?: string;
  channels?: OfficialAIChannel[];
  providerPreference?: "groq" | "cerebras";
}

export async function OPTIONS() {
  return NextResponse.json({}, { headers: corsHeaders });
}

export async function POST(request: Request) {
  try {
    const body = await request.json() as ExtensionAIRequest;
    if (!body.offerId) {
      return NextResponse.json({
        ok: false,
        code: "PARALLEL_COMPONENT_DISABLED",
        message: "A Extension aceita apenas offerId de oferta previamente selecionada no fluxo oficial."
      }, { status: 400, headers: corsHeaders });
    }

    const client = await createServerSupabaseClient();
    if (!client) return NextResponse.json({ ok: false, code: "DEPENDENCY_UNAVAILABLE" }, { status: 503, headers: corsHeaders });
    const { data: { user } } = await client.auth.getUser();
    if (!user) return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401, headers: corsHeaders });

    const commandId = request.headers.get("x-command-id") || `extension-ai:${body.offerId}:v1`;
    const command: OfficialAICommand = {
      contractVersion: "pmav5.ai/v1",
      commandId,
      idempotencyKey: `ai:${body.offerId}:v1`,
      correlationId: request.headers.get("x-correlation-id") || commandId,
      causationId: null,
      offerId: body.offerId,
      tenantId: user.id,
      expectedState: "selected",
      expectedVersion: 1,
      providerPreference: body.providerPreference,
      channels: body.channels || ["telegram", "instagram", "whatsapp"],
      requestedAt: request.headers.get("x-requested-at") || "2000-01-01T00:00:00.000Z",
      actor: { type: "user", id: user.id, service: "chrome-extension" },
      origin: "extension.official-ai-client",
      reason: { code: "GENERATE_OFFICIAL_CONTENT" }
    };

    const result = await generateOfficialAI(command, createOfficialAIServiceDependencies(client, user.id));
    return NextResponse.json({ ok: result.status === "approved", ...result }, {
      status: result.status === "approved" ? 200 : 409,
      headers: corsHeaders
    });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      code: "OFFICIAL_AI_FAILURE",
      message: error instanceof Error ? error.message : "Erro desconhecido"
    }, { status: 500, headers: corsHeaders });
  }
}
