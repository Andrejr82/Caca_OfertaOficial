import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { generateOfferAnalysis, mapGeneratedCopyToLegacyResult } from "@/lib/ai/groq";
import type { GeneratedCopyInput } from "@/lib/ai/schemas/generated-copy.schema";
import { GeneratedCopySchema } from "@/lib/ai/schemas/generated-copy.schema";
import type { Offer } from "@/types/domain";

describe("Groq Contract Validation", () => {
  const mockCopy: GeneratedCopyInput = {
    strategies: [
      {
        type: "urgency",
        headline: "Super Oferta de Fone de Ouvido",
        hook: "Cansado de fios? Olha essa novidade!",
        body: "Bateria 24h, cancelamento de ruído e muito barato.",
        cta: "Aproveite antes que acabe!",
        score: 8.5
      }
    ],
    winner_type: "urgency",
    justification: "Urgência é a melhor estratégia aqui.",
    hashtags: ["#tecnologia", "#audio", "#promo"],
    marketplace: "Amazon",
    category: "Eletrônicos",
    audience: "Jovens e Profissionais"
  };

  const links = {
    telegram: "https://t.me/fake",
    instagram: "https://ig.fake",
    whatsapp: "https://wa.me/fake"
  };

  const dummyOffer = {
    id: "1",
    product_name: "Produto Teste",
    current_price: 100,
    old_price: 200,
    platform: "Amazon"
  } as unknown as Offer;

  let originalEnv: string | undefined;

  beforeEach(() => {
    originalEnv = process.env.GROQ_API_KEY;
    process.env.GROQ_API_KEY = "fake-key";
    global.fetch = vi.fn();
  });

  afterEach(() => {
    process.env.GROQ_API_KEY = originalEnv;
    vi.restoreAllMocks();
  });

  const mockGroqResponse = (content: any) => {
    (global.fetch as any).mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        choices: [{ message: { content: typeof content === 'string' ? content : JSON.stringify(content) } }]
      })
    });
  };

  it("should enforce the GeneratedCopy contract structure (legacy adapter test)", () => {
    const legacyResult = mapGeneratedCopyToLegacyResult(mockCopy, links, dummyOffer);
    expect(legacyResult).toBeDefined();
    expect(legacyResult.score).toBe(8.5);
    expect(legacyResult.telegram).toContain(mockCopy.strategies[0].headline);
    expect(legacyResult.telegram).toContain(links.telegram);
    expect(legacyResult.instagram_feed).toContain(mockCopy.strategies[0].headline);
    expect(legacyResult.instagram_feed).toContain(links.instagram);
    expect(legacyResult.whatsapp).toContain(mockCopy.strategies[0].headline);
    expect(legacyResult.whatsapp).toContain(links.whatsapp);
  });

  it("should pass schema validation for valid JSON", () => {
    const raw = JSON.parse(JSON.stringify(mockCopy));
    const result = GeneratedCopySchema.safeParse(raw);
    expect(result.success).toBe(true);
  });

  describe("Resilience and Fallback Integration", () => {
    it("Caso 1: JSON válido -> PASS", async () => {
      const offer = { ...dummyOffer, id: "valid" } as unknown as Offer;
      mockGroqResponse(mockCopy);
      const result = await generateOfferAnalysis(offer, links);
      expect(result).toBeDefined();
      expect(result.score).toBe(8.5);
      expect(result.telegram).toContain("Super Oferta de Fone de Ouvido");
    });

    it("Caso 2: Campo obrigatório ausente -> Fallback acionado", async () => {
      const offer = { ...dummyOffer, id: "invalid-missing" } as unknown as Offer;
      const invalidCopy = { strategies: [] };
      mockGroqResponse(invalidCopy);
      const result = await generateOfferAnalysis(offer, links);
      expect(result.score).toBe(10);
      expect(result.telegram).toContain("Produto Teste");
      expect(result.telegram).not.toContain("Fone Sem Fio Bluetooth");
    });

    it("Caso 3: strategies inválido -> Fallback acionado", async () => {
      const offer = { ...dummyOffer, id: "invalid-strats" } as unknown as Offer;
      const invalidCopy = { ...mockCopy, strategies: "teste" }; 
      mockGroqResponse(invalidCopy);
      const result = await generateOfferAnalysis(offer, links);
      expect(result.score).toBe(10);
      expect(result.telegram).toContain("Produto Teste");
    });

    it("Caso 4: null -> Fallback acionado", async () => {
      const offer = { ...dummyOffer, id: "invalid-null" } as unknown as Offer;
      mockGroqResponse("null");
      const result = await generateOfferAnalysis(offer, links);
      expect(result.score).toBe(10);
      expect(result.telegram).toContain("Produto Teste");
    });

    it("Caso 5: objeto vazio -> Fallback acionado", async () => {
      const offer = { ...dummyOffer, id: "invalid-empty" } as unknown as Offer;
      mockGroqResponse({});
      const result = await generateOfferAnalysis(offer, links);
      expect(result.score).toBe(10);
      expect(result.telegram).toContain("Produto Teste");
    });
    
    it("should trigger fallback when invalid JSON string is returned", async () => {
      const offer = { ...dummyOffer, id: "invalid-string" } as unknown as Offer;
      mockGroqResponse("{ invalid json ");
      const result = await generateOfferAnalysis(offer, links);
      expect(result.score).toBe(10);
      expect(result.telegram).toContain("Produto Teste");
    });
  });
});

