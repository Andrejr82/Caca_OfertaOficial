import { describe, expect, it } from "vitest";
import { buildExpressAffiliateLinks, isAmazonAffiliateInput } from "@/lib/publish/express-affiliate-links";

describe("buildExpressAffiliateLinks", () => {
  it("gera exatamente um link persistível por canal com UUID completo", () => {
    const offerId = "45e2fca7-6100-4fb5-8f1a-021e6b84a86e";
    const rows = buildExpressAffiliateLinks({
      offerId,
      userId: "user-1",
      originalUrl: "https://www.amazon.com.br/dp/B000000000",
      appUrl: "https://caca-oferta-oficial.vercel.app/",
    });

    expect(rows).toHaveLength(4);
    expect(rows.map((row) => row.channel)).toEqual(["telegram", "whatsapp", "facebook", "instagram"]);
    expect(rows.map((row) => row.tracked_url)).toEqual([
      `https://caca-oferta-oficial.vercel.app/go/tg_${offerId}`,
      `https://caca-oferta-oficial.vercel.app/go/wp_${offerId}`,
      `https://caca-oferta-oficial.vercel.app/go/fb_${offerId}`,
      `https://caca-oferta-oficial.vercel.app/go/ig_${offerId}`,
    ]);
    expect(new Set(rows.map((row) => row.sub_id)).size).toBe(4);
  });
});

describe("isAmazonAffiliateInput", () => {
  it("preserva shortlinks Amazon afiliados e rejeita URL comum sem assinatura", () => {
    expect(isAmazonAffiliateInput("https://link.amazon/B0ABC12345")).toBe(true);
    expect(isAmazonAffiliateInput("https://amzn.to/abc123")).toBe(true);
    expect(isAmazonAffiliateInput("https://www.amazon.com.br/dp/B0ABC12345?tag=loja-20")).toBe(true);
    expect(isAmazonAffiliateInput("https://www.amazon.com.br/dp/B0ABC12345")).toBe(false);
  });
});

