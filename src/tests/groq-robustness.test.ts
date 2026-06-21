import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { analyzeConversionPotential, generateOfferAnalysis } from "@/lib/ai/groq";
import type { Offer } from "@/types/domain";

describe("Groq AI Integration Robustness Tests", () => {
  const mockOffer: Offer = {
    id: "off-123",
    product_name: "Produto Teste",
    platform: "Amazon",
    current_price: 10.0,
    score: 5.0,
    status: "draft"
  } as any;

  beforeEach(() => {
    vi.stubEnv("GROQ_API_KEY", "mock-key");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("should clean Markdown code blocks and parse JSON correctly", async () => {
    const rawResponse = "```json\n{\n  \"ai_score_boost\": 3,\n  \"conversion_justification\": \"Excelente produto.\",\n  \"strong_points\": [\"Preço\"],\n  \"weak_points\": []\n}\n```";
    
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: rawResponse } }]
      })
    } as any);

    const result = await analyzeConversionPotential(mockOffer, 5.0);
    expect(result.ai_score_boost).toBe(3);
    expect(result.conversion_justification).toBe("Excelente produto.");
  });

  it("should coerce string ai_score_boost into a number", async () => {
    const rawResponse = "{\n  \"ai_score_boost\": \"4.5\",\n  \"conversion_justification\": \"Muito bom.\",\n  \"strong_points\": [],\n  \"weak_points\": []\n}";
    
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: rawResponse } }]
      })
    } as any);

    const result = await analyzeConversionPotential(mockOffer, 5.0);
    expect(result.ai_score_boost).toBe(4.5);
  });

  it("should wrap root arrays into strategies object for copy generation", async () => {
    const rawResponse = "[\n  {\n    \"type\": \"urgency\",\n    \"headline\": \"Preço baixo!\",\n    \"hook\": \"Aproveite\",\n    \"body\": \"Corra\",\n    \"cta\": \"Compre\",\n    \"score\": 9.0\n  }\n]";
    
    vi.spyOn(global, "fetch").mockResolvedValue({
      ok: true,
      json: async () => ({
        choices: [{ message: { content: rawResponse } }]
      })
    } as any);

    const result = await generateOfferAnalysis(mockOffer, { telegram: "", instagram: "", whatsapp: "" });
    expect(result.winner_strategy_type).toBe("urgency");
    expect(result.score).toBe(9.0);
  });
});
