import { NextResponse } from "next/server";
import { isOfficialAIRegenerationCursor, OFFICIAL_AI_CHANNELS, regenerateOfficialDrafts, type OfficialAIChannel, type OfficialAIRegenerationCommand } from "@/core/ai";
import { createOfficialAIRegenerationDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createServerSupabaseClient } from "@/lib/supabase/server";

interface RegenerateRequest {
  commandId?: string;
  correlationId?: string;
  tenantId?: string;
  providerPreference?: "groq" | "cerebras";
  marketplace?: string;
  channel?: OfficialAIChannel;
  postIds?: string[];
  limit?: number;
  cursor?: { createdAt?: string; postId?: string };
}

export const maxDuration = 300;

export async function POST(request: Request) {
  try {
    const body = await request.json() as RegenerateRequest;
    if (body.channel && !OFFICIAL_AI_CHANNELS.includes(body.channel)) {
      return NextResponse.json({ ok: false, code: "INVALID_CHANNEL" }, { status: 400 });
    }
    if (body.postIds && (!Array.isArray(body.postIds) || body.postIds.some((id) => typeof id !== "string" || !id.trim()))) {
      return NextResponse.json({ ok: false, code: "INVALID_POST_IDS" }, { status: 400 });
    }
    if (body.cursor && !isOfficialAIRegenerationCursor(body.cursor)) {
      return NextResponse.json({ ok: false, code: "INVALID_CURSOR" }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "").trim();
    const isService = Boolean(authHeader && process.env.SUPABASE_SERVICE_ROLE_KEY && authHeader === process.env.SUPABASE_SERVICE_ROLE_KEY);
    const supabase = isService ? createSupabaseAdminClient() : await createServerSupabaseClient();
    if (!supabase) return NextResponse.json({ ok: false, code: "DEPENDENCY_UNAVAILABLE" }, { status: 503 });

    let tenantId = body.tenantId ?? null;
    if (!isService) {
      const { data: { user } } = await supabase.auth.getUser();
      tenantId = user?.id ?? null;
    }
    if (!tenantId) return NextResponse.json({ ok: false, code: "UNAUTHENTICATED" }, { status: 401 });

    const commandId = body.commandId || request.headers.get("x-command-id") || `ai:regenerate:${crypto.randomUUID()}`;
    const command: OfficialAIRegenerationCommand = {
      contractVersion: "pmav5.ai-regeneration/v1",
      commandId,
      correlationId: body.correlationId || request.headers.get("x-correlation-id") || commandId,
      tenantId,
      providerPreference: body.providerPreference,
      filters: {
        marketplace: body.marketplace?.trim() || undefined,
        channel: body.channel,
        postIds: body.postIds ? [...new Set(body.postIds.map((id) => id.trim()))] : undefined,
        limit: body.limit,
        after: body.cursor?.createdAt && body.cursor.postId
          ? { createdAt: body.cursor.createdAt, postId: body.cursor.postId }
          : undefined
      }
    };
    const result = await regenerateOfficialDrafts(command, createOfficialAIRegenerationDependencies(supabase, tenantId));
    return NextResponse.json({ ok: result.failed === 0, ...result }, { status: result.failed === 0 ? 200 : 207 });
  } catch (error) {
    return NextResponse.json({
      ok: false,
      code: "OFFICIAL_AI_REGENERATION_FAILURE",
      message: error instanceof Error ? error.message : "Erro desconhecido"
    }, { status: 500 });
  }
}
