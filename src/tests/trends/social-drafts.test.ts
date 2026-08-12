import { describe, expect, it } from "vitest";
import { buildTrendAffiliateLinkInput, buildTrendSocialDraftRow, channelKey, createTrendSocialDraft } from "@/lib/trends/social-drafts";

const offer = { id: "offer-1", platform: "Mercado Livre" as const, product_name: "Air Fryer 4L", current_price: 299, original_url: "https://mercadolivre.com.br/MLB-1", image_url: null, category: "Casa" };
const recommendation = { channel: "Instagram" as const, format: "carrossel" as const, rationale: "Atributos visuais observáveis.", hypothesis: "Uma apresentação visual pode explicar o uso.", confidence: 82, strategyVersion: "trend-channel-format-v1" };

describe("trend social drafts", () => {
  it("maps the recommended channel and builds a tracked affiliate link", () => {
    expect(channelKey("Instagram")).toBe("instagram");
    const link = buildTrendAffiliateLinkInput("user-1", offer, "Instagram", offer.original_url);
    expect(link).toMatchObject({ user_id: "user-1", offer_id: "offer-1", channel: "instagram", original_url: offer.original_url });
    expect(link.sub_id).toContain("ig_offer-1");
  });

  it("creates only draft content and never a published status", () => {
    const row = buildTrendSocialDraftRow({ userId: "user-1", offer, recommendation, trackedUrl: "https://tracked.example/1", affiliateLinkId: "link-1" });
    expect(row).toMatchObject({ channel: "instagram", status: "draft", offer_id: "offer-1" });
    expect(row.content).not.toMatch(/ctr|conversão|vendas|roas/i);
  });

  it("is idempotent for an existing offer/channel draft", async () => {
    let inserts = 0;
    const client = { from: () => ({
      select: () => ({ eq: function () { return this; }, maybeSingle: async () => ({ data: { id: "post-1" }, error: null }) }),
      insert: () => { inserts += 1; return { select: () => ({ single: async () => ({ data: { id: "post-2", status: "draft" }, error: null }) }) }; }
    }) };
    const result = await createTrendSocialDraft(client, { userId: "user-1", offer, recommendation, trackedUrl: "https://tracked.example/1", affiliateLinkId: "link-1" });
    expect(result).toEqual({ id: "post-1", created: false, status: "draft" });
    expect(inserts).toBe(0);
  });
});
