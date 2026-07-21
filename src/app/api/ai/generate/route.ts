import { NextResponse } from "next/server";
import { generateOfficialAI, type OfficialAICommand } from "@/core/ai";
import { createOfficialAIServiceDependencies } from "@/lib/ai/official/create-official-ai-service";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createOfficialAICyclePages } from "@/core/ai/official-ai-cycle";
import { advanceCycleCheckpoint, loadCycleCheckpoint } from "@/lib/ai/official/official-ai-cycle-checkpoint";

interface GenerateAIRequest {
  command?: "PROCESS_OFFERS";
  offerIds?: string[];
  offerId?: string;
  commandId?: string;
  correlationId?: string;
  causationId?: string | null;
  providerPreference?: "groq" | "cerebras";
  requestedAt?: string;
  tenantId?: string;
  copyV2?: boolean;
}

const DEFAULT_REQUESTED_AT = "2000-01-01T00:00:00.000Z";

/**
 * POST /api/ai/generate
 *
 * Única rota oficial da Official AI (ADR-014).
 * O modo de operação (Draft Generation ou Approval) é determinado internamente
 * pela IA com base no estado oficial da oferta. Nenhum parâmetro externo seleciona o modo.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json() as GenerateAIRequest;
    const isCycleCommand = body.command === "PROCESS_OFFERS";
    if (!body.offerId && !isCycleCommand) {
      return NextResponse.json({ ok: false, code: "INVALID_REQUEST", message: "offerId é obrigatório para chamada individual." }, { status: 400 });
    }

    const authHeader = request.headers.get("authorization")?.replace("Bearer ", "").trim();
    const isServiceWorker = authHeader && process.env.SUPABASE_SERVICE_ROLE_KEY && authHeader === process.env.SUPABASE_SERVICE_ROLE_KEY;

    let supabase: any = null;
    let userId: string | null = null;

    if (isServiceWorker) {
      supabase = createSupabaseAdminClient();
      userId = body.tenantId || "7a9ca7b7-f464-46e0-a9de-9b322c73628a";
    } else {
      supabase = await createServerSupabaseClient();
      if (supabase) {
        const { data: { user } } = await supabase.auth.getUser();
        if (user) userId = user.id;
      }
    }

    if (!supabase) {
      return NextResponse.json({ ok: false, code: "DEPENDENCY_UNAVAILABLE", message: "Supabase não configurado." }, { status: 503 });
    }
    if (!userId) {
      return NextResponse.json({ ok: false, code: "UNAUTHENTICATED", message: "Não autenticado." }, { status: 401 });
    }

    if (isCycleCommand) {
      if (!isServiceWorker) {
        return NextResponse.json({ ok: false, code: "FORBIDDEN", message: "PROCESS_OFFERS é exclusivo do Oracle Worker." }, { status: 403 });
      }
      const correlationId = body.correlationId || request.headers.get("x-correlation-id");
      const offerIds = [...new Set((body.offerIds || []).filter((id) => typeof id === "string" && id.trim().length > 0))];
      if (!correlationId || offerIds.length === 0) {
        return NextResponse.json({ ok: false, code: "INVALID_REQUEST", message: "correlationId e offerIds são obrigatórios." }, { status: 400 });
      }
      const pages = createOfficialAICyclePages(correlationId, offerIds);
      const checkpoint = await loadCycleCheckpoint(supabase, userId, correlationId, offerIds, pages.length);
      if (checkpoint.status === "completed") {
        return NextResponse.json({
          ok: true, status: "completed", correlationId, offerIdsReceived: offerIds.length,
          pageNumber: null, totalPages: pages.length, nextPage: null,
          batchCompleted: true, metrics: checkpoint.metrics, pageStatuses: checkpoint.pageStatuses
        });
      }
      const page = pages[checkpoint.nextPage - 1];
      if (!page) throw new Error(`Official AI cycle checkpoint points to invalid page ${checkpoint.nextPage}`);
      const command: OfficialAICommand = {
        contractVersion: "pmav5.ai/v1", commandId: page.idempotencyKey, idempotencyKey: page.idempotencyKey,
        correlationId, causationId: `oracle:${correlationId}`, offerId: `CYCLE_PAGE_${page.pageNumber}`,
        tenantId: userId, providerPreference: body.providerPreference,
        channels: ["telegram", "instagram", "whatsapp"], requestedAt: body.requestedAt || new Date().toISOString(),
        actor: { type: "service", id: "oracle-worker", service: "oracle-worker" }, origin: "oracle.discovery",
        reason: { code: "GENERATE_OFFICIAL_CONTENT" },
        batch: { operation: "PROCESS_OFFERS", offerIds: page.offerIds, pageNumber: page.pageNumber, totalPages: page.totalPages }
      };
      const dependencies = createOfficialAIServiceDependencies(supabase, userId);
      const result = await generateOfficialAI(command, dependencies);
      const advanced = await advanceCycleCheckpoint(supabase, userId, checkpoint, result);
      const batchCompleted = advanced.status === "completed";
      if (batchCompleted) {
        const { error: auditError } = await supabase.from("integration_logs").insert({
          user_id: userId, integration: "official-ai-service", action: "ai_cycle_completed", status: "success",
          message: `${correlationId}:cycle_completed`,
          metadata: { correlationId, offerIds, offerIdsReceived: offerIds.length, ...advanced.metrics,
            pageStatuses: advanced.pageStatuses, batchCompleted: true }
        });
        if (auditError) throw new Error(`Official AI cycle completion audit failed: ${auditError.message}`);
        try {
          await dependencies.telemetry?.emit({
            eventType: "official_ai.cycle.completed", correlationId, stage: "cycle_summary",
            details: { offerIdsReceived: offerIds.length, ...advanced.metrics, batchCompleted: true }
          });
        } catch { /* telemetry cannot alter the completed cycle */ }
      }
      return NextResponse.json({
        ok: result.status !== "rejected", status: advanced.status, correlationId,
        offerIdsReceived: offerIds.length, pageNumber: page.pageNumber, totalPages: pages.length,
        nextPage: batchCompleted ? null : advanced.nextPage, batchCompleted,
        metrics: advanced.metrics, pageStatuses: advanced.pageStatuses, result
      });
    }

    const offerId = body.offerId!;
    const commandId = body.commandId || request.headers.get("x-command-id") || `ai:${offerId}:v1`;

    // O comando não inclui expectedState nem mode — a IA determina internamente (ADR-014).
    const command: OfficialAICommand = {
      contractVersion: "pmav5.ai/v1",
      commandId,
      idempotencyKey: offerId === "ALL_PENDING"
        ? `ai:batch:${body.correlationId || commandId}:v1`
        : body.copyV2 ? `ai:copy-v2:${offerId}:v1` : `ai:draft:${offerId}:v2`,
      correlationId: body.correlationId || request.headers.get("x-correlation-id") || commandId,
      causationId: body.causationId ?? request.headers.get("x-causation-id"),
      offerId,
      tenantId: userId,
      providerPreference: body.providerPreference,
      channels: ["telegram", "instagram", "whatsapp"],
      requestedAt: body.requestedAt || request.headers.get("x-requested-at") || DEFAULT_REQUESTED_AT,
      actor: { type: isServiceWorker ? "service" : "user", id: userId, service: "nextjs-ai-route" },
      origin: "api.ai.generate",
      reason: { code: "GENERATE_OFFICIAL_CONTENT" },
      metadata: body.copyV2 ? { copyV2: true } : undefined
    };

    const result = await generateOfficialAI(
      command,
      createOfficialAIServiceDependencies(supabase, userId)
    );

    // drafted = Modo 1 (Draft Generation): sucesso sem mudança de estado
    // approved = Modo 2 (Approval): sucesso com promoção de estado
    const ok = result.status === "approved" || result.status === "drafted";
    return NextResponse.json(
      { ok, ...result },
      { status: ok ? 200 : 409 }
    );
  } catch (error) {
    return NextResponse.json({
      ok: false,
      code: "OFFICIAL_AI_FAILURE",
      message: error instanceof Error ? error.message : "Erro desconhecido"
    }, { status: 500 });
  }
}
