import { beforeEach, describe, expect, it, vi } from "vitest";

const { regenerateOfficialDrafts, createDependencies, getUser, supabase } = vi.hoisted(() => {
  const getUser = vi.fn();
  return {
    regenerateOfficialDrafts: vi.fn(),
    createDependencies: vi.fn().mockReturnValue({ regeneration: true }),
    getUser,
    supabase: { auth: { getUser } }
  };
});

vi.mock("@/core/ai", () => ({
  OFFICIAL_AI_CHANNELS: ["telegram", "instagram", "whatsapp"],
  isOfficialAIRegenerationCursor: (value: unknown) => {
    const cursor = value as { createdAt?: string; postId?: string };
    return cursor?.createdAt === "2026-07-15T10:00:00.000Z" && cursor?.postId === "00000000-0000-4000-8000-000000000001";
  },
  regenerateOfficialDrafts
}));
vi.mock("@/lib/ai/official/create-official-ai-service", () => ({
  createOfficialAIRegenerationDependencies: createDependencies
}));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabaseClient: vi.fn().mockResolvedValue(supabase) }));
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));

import { POST } from "@/app/api/ai/regenerate/route";

describe("POST /api/ai/regenerate", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getUser.mockResolvedValue({ data: { user: { id: "tenant-1" } } });
    regenerateOfficialDrafts.mockResolvedValue({ commandId: "regen-1", matched: 1, updated: 1, failed: 0, items: [] });
  });

  it("encaminha filtros sem chamar geração inicial", async () => {
    const response = await POST(new Request("http://localhost/api/ai/regenerate", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-command-id": "regen-1" },
      body: JSON.stringify({ marketplace: "Shopee", channel: "whatsapp", postIds: ["post-1", "post-1"] })
    }));

    expect(response.status).toBe(200);
    expect(regenerateOfficialDrafts).toHaveBeenCalledWith(expect.objectContaining({
      contractVersion: "pmav5.ai-regeneration/v1",
      commandId: "regen-1",
      tenantId: "tenant-1",
      filters: { marketplace: "Shopee", channel: "whatsapp", postIds: ["post-1"] }
    }), { regeneration: true });
  });

  it("rejeita canal inválido antes de acessar banco/provider", async () => {
    const response = await POST(new Request("http://localhost/api/ai/regenerate", {
      method: "POST", body: JSON.stringify({ channel: "facebook" })
    }));
    expect(response.status).toBe(400);
    expect(regenerateOfficialDrafts).not.toHaveBeenCalled();
  });

  it("rejeita cursor não canônico antes de acessar banco/provider", async () => {
    const response = await POST(new Request("http://localhost/api/ai/regenerate", {
      method: "POST", body: JSON.stringify({ cursor: { createdAt: "2026-07-15", postId: "id),status.eq.published" } })
    }));
    expect(response.status).toBe(400);
    expect(regenerateOfficialDrafts).not.toHaveBeenCalled();
  });
});
