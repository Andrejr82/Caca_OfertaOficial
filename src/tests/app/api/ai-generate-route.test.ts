import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateOfficialAI, createOfficialAIServiceDependencies, getUser, supabase, inngestSend, auditInsert, adminSupabase } = vi.hoisted(() => {
  const getUser = vi.fn();
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  return {
    generateOfficialAI: vi.fn(),
    createOfficialAIServiceDependencies: vi.fn().mockReturnValue({ dependency: true }),
    getUser,
    supabase: { auth: { getUser } },
    adminSupabase: { auth: { getUser }, from: vi.fn(() => ({ insert: auditInsert })) },
    auditInsert,
    inngestSend: vi.fn().mockResolvedValue({ ids: ["event-1"] })
  };
});

vi.mock("@/core/ai", () => ({ generateOfficialAI }));
vi.mock("@/lib/ai/official/create-official-ai-service", () => ({ createOfficialAIServiceDependencies }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue(supabase) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => adminSupabase) }));
vi.mock("@/lib/inngest/client", () => ({ inngest: { send: inngestSend } }));

import { POST } from "@/app/api/ai/generate/route";

describe("POST /api/ai/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "tenant-1" } } });
    generateOfficialAI.mockResolvedValue({
      status: "approved", commandId: "command-1", offerId: "offer-1", offerState: "approved"
    });
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

  it("enfileira exclusivamente os IDs do ciclo em páginas determinísticas", async () => {
    vi.stubEnv("SUPABASE_SERVICE_ROLE_KEY", "service-key");
    const offerIds = Array.from({ length: 120 }, (_, index) => `offer-${index}`);
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer service-key" },
      body: JSON.stringify({
        command: "PROCESS_OFFERS", correlationId: "cycle-120", tenantId: "tenant-1", offerIds
      })
    }));
    expect(response.status).toBe(202);
    await expect(response.json()).resolves.toMatchObject({
      status: "accepted", offerIdsReceived: 120, pagesQueued: 3, batchCompleted: false
    });
    expect(inngestSend).toHaveBeenCalledWith(expect.objectContaining({
      id: "official-ai-cycle-cycle-120",
      name: "offer/cycle.process",
      data: expect.objectContaining({ offerIds })
    }));
    expect(auditInsert).toHaveBeenCalledWith(expect.objectContaining({
      integration: "official-ai-service",
      action: "ai_cycle_queued",
      metadata: expect.objectContaining({ correlationId: "cycle-120", offerIds, pagesQueued: 3 })
    }));
    expect(generateOfficialAI).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });
});
