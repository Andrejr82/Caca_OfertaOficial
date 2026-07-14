import { beforeEach, describe, expect, it, vi } from "vitest";

const { generateOfficialAI, createOfficialAIServiceDependencies, getUser, supabase } = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    generateOfficialAI: vi.fn(),
    createOfficialAIServiceDependencies: vi.fn().mockReturnValue({ dependency: true }),
    getUser,
    supabase: { auth: { getUser } }
  };
});

vi.mock("@/core/ai", () => ({ generateOfficialAI }));
vi.mock("@/lib/ai/official/create-official-ai-service", () => ({ createOfficialAIServiceDependencies }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue(supabase) }));

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
      idempotencyKey: "ai:offer-1:v1",
      offerId: "offer-1",
      tenantId: "tenant-1",
      expectedState: "selected",
      expectedVersion: 1,
      providerPreference: "cerebras",
      channels: ["telegram", "instagram", "whatsapp"]
    }), { dependency: true });
  });
});
