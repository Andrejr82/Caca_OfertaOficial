import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateOfficialAI, createOfficialAIServiceDependencies, getUser, supabase, auditInsert, adminSupabase, loadCycleCheckpoint, advanceCycleCheckpoint } = vi.hoisted(() => {
  const getUser = vi.fn();
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  return {
    generateOfficialAI: vi.fn(),
    createOfficialAIServiceDependencies: vi.fn().mockReturnValue({ dependency: true }),
    getUser,
    supabase: { auth: { getUser } },
    adminSupabase: { auth: { getUser }, from: vi.fn(() => ({ insert: auditInsert })) },
    auditInsert,
    loadCycleCheckpoint: vi.fn(),
    advanceCycleCheckpoint: vi.fn()
  };
});

vi.mock("@/core/ai", () => ({ generateOfficialAI }));
vi.mock("@/lib/ai/official/create-official-ai-service", () => ({ createOfficialAIServiceDependencies }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue(supabase) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => adminSupabase) }));
vi.mock("@/lib/ai/official/official-ai-cycle-checkpoint", () => ({ loadCycleCheckpoint, advanceCycleCheckpoint }));

import { POST } from "@/app/api/ai/generate/route";

describe("POST /api/ai/generate", () => {
  const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "tenant-1" } } });
    generateOfficialAI.mockResolvedValue({
      status: "approved", commandId: "command-1", offerId: "offer-1", offerState: "approved"
    });
    loadCycleCheckpoint.mockResolvedValue({ nextPage: 1, status: "pending", metrics: { pagesProcessed: 0 } });
    advanceCycleCheckpoint.mockImplementation(async (_client, _tenant, checkpoint, result) => ({
      ...checkpoint,
      nextPage: checkpoint.nextPage + 1,
      status: checkpoint.nextPage === 3 ? "completed" : "pending",
      metrics: { pagesProcessed: checkpoint.nextPage, offersVisited: result.batch?.offersVisited ?? 0 }
    }));
  });

  it("emits complete Notify lifecycle for successful response", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-request-id": "request-1", "x-correlation-id": "correlation-1" },
      body: JSON.stringify({ offerId: "offer-1" })
    }));

    expect(response.status).toBe(200);
    const events = logSpy.mock.calls.map(([line]) => JSON.parse(String(line)));
    expect(events.map((event) => event.event)).toEqual([
      "Notify.request.received", "Notify.processing.started", "Notify.processing.finished", "Notify.response.sent"
    ]);
    expect(events.every((event) => event.requestId === "request-1" && event.correlationId === "correlation-1" && typeof event.timestamp === "string" && typeof event.durationMs === "number" && "status" in event)).toBe(true);
  });

  it("emits response event for early validation failure", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST", headers: { "x-request-id": "request-invalid" }, body: JSON.stringify({})
    }));

    expect(response.status).toBe(400);
    expect(logSpy.mock.calls.map(([line]) => JSON.parse(String(line)).event)).toEqual([
      "Notify.request.received", "Notify.processing.started", "Notify.response.sent"
    ]);
  });

  it("emits failed and response events when service throws", async () => {
    generateOfficialAI.mockRejectedValueOnce(new Error("provider failure"));
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST", headers: { "x-request-id": "request-error" }, body: JSON.stringify({ offerId: "offer-1" })
    }));

    expect(response.status).toBe(500);
    expect(logSpy.mock.calls.map(([line]) => JSON.parse(String(line)).event)).toEqual([
      "Notify.request.received", "Notify.processing.started", "Notify.failed", "Notify.response.sent"
    ]);
    expect(logSpy.mock.calls.join(" ")).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
  });

  it("rejeita entrada sem offerId antes de compor o serviço", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST", body: JSON.stringify({})
    }));
    expect(response.status).toBe(400);
    expect(generateOfficialAI).not.toHaveBeenCalled();
  });

  it("autentica, constrói o comando determinístico e chama somente o serviço oficial", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-command-id": "command-1" },
      body: JSON.stringify({ offerId: "offer-1", providerPreference: "cerebras" })
    }));

    expect(response.status).toBe(200);
    expect(createOfficialAIServiceDependencies).toHaveBeenCalledWith(supabase, "tenant-1");
    expect(generateOfficialAI).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "pmav5.ai/v1",
      commandId: "command-1",
      idempotencyKey: "ai:draft:offer-1:v2",
      offerId: "offer-1",
      tenantId: "tenant-1",
      providerPreference: "cerebras",
      channels: ["telegram", "instagram", "whatsapp"]
    }), { dependency: true });
  });

  it("processa somente uma página e devolve checkpoint para a próxima invocação", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const offerIds = Array.from({ length: 120 }, (_, index) => `offer-${index}`);
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer service-key" },
      body: JSON.stringify({
        command: "PROCESS_OFFERS", correlationId: "cycle-120", tenantId: "tenant-1", offerIds
      })
    }));
    generateOfficialAI.mockResolvedValue({ status: "drafted", batch: { offersVisited: 50, draftedOffers: 50, draftsPersisted: 150 } });
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      offerIdsReceived: 120, pageNumber: 1, totalPages: 3, nextPage: 2, batchCompleted: false
    });
    expect(generateOfficialAI).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "ai:cycle:cycle-120:page:1:v1",
      batch: expect.objectContaining({ offerIds: offerIds.slice(0, 50), pageNumber: 1, totalPages: 3 })
    }), { dependency: true });
    expect(advanceCycleCheckpoint).toHaveBeenCalledTimes(1);
    vi.unstubAllEnvs();
  });

  it("não reprocessa ciclo cujo checkpoint já está completed", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    loadCycleCheckpoint.mockResolvedValue({
      nextPage: 4, status: "completed", metrics: { pagesProcessed: 3, offersVisited: 120 }
    });
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer service-key" },
      body: JSON.stringify({ command: "PROCESS_OFFERS", correlationId: "cycle-done", tenantId: "tenant-1", offerIds: ["offer-1"] })
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ batchCompleted: true, nextPage: null });
    expect(generateOfficialAI).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
