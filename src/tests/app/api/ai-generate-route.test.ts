import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateOfficialAI, publishOfficialPost, createOfficialAIServiceDependencies, createOfficialPublicationServiceDependencies, getUser, supabase, auditInsert, adminSupabase, loadCycleCheckpoint, advanceCycleCheckpoint } = vi.hoisted(() => {
  const getUser = vi.fn();
  const auditInsert = vi.fn().mockResolvedValue({ error: null });
  return {
    generateOfficialAI: vi.fn(),
    publishOfficialPost: vi.fn(),
    createOfficialAIServiceDependencies: vi.fn().mockReturnValue({ dependency: true }),
    createOfficialPublicationServiceDependencies: vi.fn().mockReturnValue({ publicationDependency: true }),
    getUser,
    supabase: { auth: { getUser } },
    adminSupabase: { auth: { getUser }, from: vi.fn(() => ({ insert: auditInsert })) },
    auditInsert,
    loadCycleCheckpoint: vi.fn(),
    advanceCycleCheckpoint: vi.fn()
  };
});

vi.mock("@/core/ai", () => ({ generateOfficialAI }));
vi.mock("@/core/publication", () => ({ publishOfficialPost }));
vi.mock("@/lib/ai/official/create-official-ai-service", () => ({ createOfficialAIServiceDependencies }));
vi.mock("@/lib/publication/official/create-official-publication-service", () => ({ createOfficialPublicationServiceDependencies }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue(supabase) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn(() => adminSupabase) }));
vi.mock("@/lib/ai/official/official-ai-cycle-checkpoint", () => ({ loadCycleCheckpoint, advanceCycleCheckpoint }));

import { POST } from "@/app/api/ai/generate/route";

describe("POST /api/ai/generate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "tenant-1" } } });
    generateOfficialAI.mockResolvedValue({
      status: "approved", commandId: "command-1", offerId: "offer-1", offerState: "approved"
    });
    publishOfficialPost.mockResolvedValue({ status: "published", receiptId: "receipt-1" });
    loadCycleCheckpoint.mockResolvedValue({ nextPage: 1, status: "pending", metrics: { pagesProcessed: 0 } });
    advanceCycleCheckpoint.mockImplementation(async (_client, _tenant, checkpoint, result) => ({
      ...checkpoint,
      nextPage: checkpoint.nextPage + 1,
      status: checkpoint.nextPage === 3 ? "completed" : "pending",
      metrics: { pagesProcessed: checkpoint.nextPage, offersVisited: result.batch?.offersVisited ?? 0 }
    }));
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

  it("inclui Facebook somente quando o contrato de transporte está configurado", async () => {
    vi.stubEnv("FACEBOOK_PAGE_ID", "page-1");
    vi.stubEnv("FACEBOOK_ACCESS_TOKEN", "token-1");

    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: "offer-1" })
    }));

    expect(response.status).toBe(200);
    expect(generateOfficialAI).toHaveBeenCalledWith(expect.objectContaining({
      channels: ["telegram", "instagram", "whatsapp", "facebook"]
    }), { dependency: true });
    vi.unstubAllEnvs();
  });

  it("promove os três drafts sociais pelo serviço oficial após a aprovação", async () => {
    vi.stubEnv("FACEBOOK_PAGE_ID", "page-1");
    vi.stubEnv("FACEBOOK_ACCESS_TOKEN", "token-1");
    generateOfficialAI.mockResolvedValue({
      status: "approved", commandId: "command-social", offerId: "offer-1", offerState: "approved",
      drafts: ["instagram", "whatsapp", "facebook"].map((channel) => ({
        postId: `post-${channel}`, offerId: "offer-1", channel, offerStatus: "approved", state: "draft"
      }))
    });

    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: "offer-1" })
    }));

    expect(response.status).toBe(200);
    expect(publishOfficialPost).toHaveBeenCalledTimes(3);
    expect(publishOfficialPost.mock.calls.map(([command]) => command.channel)).toEqual([
      "instagram", "whatsapp", "facebook"
    ]);
    expect(publishOfficialPost.mock.calls.every(([command]) => (
      command.expectedOfferState === "approved" && command.expectedPostState === "draft"
    ))).toBe(true);
    expect(createOfficialPublicationServiceDependencies).toHaveBeenCalledWith(supabase, "tenant-1");
    vi.unstubAllEnvs();
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

  it("envia Copy V2 explicitamente e sem selecionar modo legado", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-command-id": "copy-v2-command" },
      body: JSON.stringify({ offerId: "offer-selected", copyV2: true })
    }));
    expect(response.status).toBe(200);
    expect(generateOfficialAI).toHaveBeenCalledWith(expect.objectContaining({
      idempotencyKey: "ai:copy-v2:offer-selected:v1",
      metadata: { copyV2: true }
    }), { dependency: true });
  });

  it("bloqueia Copy V2 automática quando chamada por usuário", async () => {
    const response = await POST(new Request("http://localhost/api/ai/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ offerId: "offer-1", copyV2: true, autoCurated: true })
    }));
    expect(response.status).toBe(403);
    expect(generateOfficialAI).not.toHaveBeenCalled();
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
