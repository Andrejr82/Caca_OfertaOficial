import { beforeEach, describe, expect, it, vi } from "vitest";

const { client, publishOfficialPost, approveOfficialOfferForPublication } = vi.hoisted(() => ({
  client: { from: vi.fn() },
  publishOfficialPost: vi.fn(),
  approveOfficialOfferForPublication: vi.fn(),
}));

vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: () => client }));
vi.mock("@/core/ai", () => ({ generateOfficialAI: vi.fn() }));
vi.mock("@/lib/ai/official/create-official-ai-service", () => ({ createOfficialAIServiceDependencies: vi.fn() }));
vi.mock("@/core/publication", () => ({ approveOfficialOfferForPublication, publishOfficialPost }));
vi.mock("@/lib/publication/official/create-official-publication-approval", () => ({ createOfficialPublicationApprovalDependencies: vi.fn() }));
vi.mock("@/lib/publication/official/create-official-publication-service", () => ({
  createOfficialPublicationServiceDependencies: vi.fn(),
  publicationIdempotencyKey: vi.fn(() => "telegram:post-1:editorial-top30"),
  publicationPayloadReference: vi.fn(() => "post:post-1"),
}));
vi.mock("@/lib/telegram/client", () => ({ sendTelegramMessage: vi.fn() }));

import { publishTelegramEditorialTop30 } from "@/lib/inngest/functions";

describe("Telegram editorial function path", () => {
  beforeEach(() => {
    process.env.TELEGRAM_AUTO_PUBLISH = "1";
    delete process.env.NO_POSTS;
    delete process.env.NO_PUBLISH;
    approveOfficialOfferForPublication.mockResolvedValue({ status: "approved", auditId: "approval-1" });
    publishOfficialPost.mockResolvedValue({ status: "published", receiptId: "receipt-1" });
    const offer = {
      id: "offer-1", user_id: "tenant-1", platform: "Shopee", product_name: "Jogo De Talheres inox Faqueiro",
      category: "casa_cozinha_editorial", original_url: "https://s.shopee.com.br/offer-1", image_url: "https://cf.shopee.com.br/offer-1.jpg",
      current_price: 19.9, old_price: null, coupon: null, rating: null, estimated_commission: null, commission_rate: null,
      score: 6.1, status: "approved", notes: null, seasonality: null, created_at: "2026-08-13T20:59:19.213434+00:00",
      updated_at: "2026-08-13T21:11:07.585+00:00", marketplace_metrics: { sales: 27, rating: 4.8 },
      explainability: { correlation_id: "38743d23-96df-41d6-863c-667ec9567ad4", scenarioId: "casa_cozinha_editorial", discovery_evidence: { discoveredAt: "2026-08-13T20:59:06.357Z" } },
    };
    client.from.mockImplementation((table: string) => {
      const query: any = {
        fields: "",
        select: (fields: string) => { query.fields = fields; return query; },
        eq: () => query,
        in: () => query,
        order: () => query,
        range: () => query,
        then: (resolve: (value: unknown) => unknown) => Promise.resolve(table === "app_settings"
          ? { data: [{ user_id: "tenant-1", value: { telegram_automation_enabled: true } }], error: null }
          : query.fields.includes("offers(*)")
            ? { data: [{ id: "post-1", offer_id: "offer-1", user_id: "tenant-1", channel: "telegram", status: "draft", content: "real", created_at: "2026-08-13T21:00:00.022767+00:00", posted_at: null, external_id: null, offers: offer }], error: null }
            : query.fields.includes("posted_at")
              ? { data: [], error: null }
              : { data: [{ id: "post-1", offer_id: "offer-1", user_id: "tenant-1", status: "draft", created_at: "2026-08-13T21:00:00.022767+00:00" }], error: null }).then(resolve),
      };
      return query;
    });
  });

  it("reaches publishOfficialPost with a mocked transport path", async () => {
    const result = await (publishTelegramEditorialTop30 as any).fn({
      step: { run: (_name: string, work: () => unknown) => work() },
    });

    expect(result).toMatchObject({ result: "completed", planSize: 1 });
    expect(approveOfficialOfferForPublication).toHaveBeenCalledOnce();
    expect(publishOfficialPost).toHaveBeenCalledOnce();
  });
});
