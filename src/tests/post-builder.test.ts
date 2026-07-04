import { describe, it, expect } from "vitest";
import { PostBuilder } from "@/lib/post-builder";
import { SOCIALS } from "@/config/socials";
import type { CopyStrategy, GeneratedCopyInput } from "@/lib/ai/schemas/generated-copy.schema";
import type { Offer } from "@/types/domain";

describe("PostBuilder and Multi-Marketplace Tests", () => {
  const baseCopy: CopyStrategy = {
    type: "default",
    headline: "Produto Teste",
    hook: "Teste o produto!",
    body: "Excelente beneficio",
    cta: "Compre agora",
    score: 9.0
  };

  const baseCopyContext: GeneratedCopyInput = {
    strategies: [baseCopy],
    winner_type: "default",
    justification: "N/A",
    hashtags: ["#teste"],
    marketplace: "",
    category: "Geral",
    audience: "Geral"
  };

  const fakeLink = "https://link.fake";
  
  const dummyOffer = {
    current_price: 100,
    old_price: 200,
    platform: "Default"
  } as unknown as Offer;

  it("should generate standard post when marketplace is unknown/empty", () => {
    const post = PostBuilder.buildInstagramPost({ 
      copy: baseCopy, 
      copyContext: baseCopyContext, 
      offer: dummyOffer, 
      affiliateLink: fakeLink 
    });
    
    expect(post).toContain("Produto Teste");
    expect(post).toContain("Compre agora");
    expect(post).not.toContain(fakeLink); // Instagram não tem link na legenda
  });

  it("should format multi-marketplace properly for Amazon", () => {
    const amazonContext = { ...baseCopyContext, marketplace: "Amazon" };
    const post = PostBuilder.buildTelegramPost({
      copy: baseCopy,
      copyContext: amazonContext,
      offer: dummyOffer,
      affiliateLink: fakeLink
    });
    
    expect(post).toContain("Produto Teste");
    expect(post).toContain("🛒 Achado Amazon 👇🏼");
    expect(post).toContain(fakeLink);
  });

  it("should format multi-marketplace properly for Shopee", () => {
    const shopeeContext = { ...baseCopyContext, marketplace: "Shopee" };
    const post = PostBuilder.buildWhatsappPost({
      copy: baseCopy,
      copyContext: shopeeContext,
      offer: dummyOffer,
      affiliateLink: fakeLink
    });
    
    expect(post).toContain("Produto Teste");
    expect(post).toContain("💰 De: R$ 200,00");
    expect(post).toContain("🔥 Por: R$ 100,00");
    expect(post).toContain("🛒 Shopee");
    expect(post).toContain("🔗 " + fakeLink);
  });
});
