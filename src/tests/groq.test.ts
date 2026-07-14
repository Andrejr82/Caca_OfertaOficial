import { describe, expect, it, vi } from "vitest";
import { generateOfferAnalysis } from "@/lib/ai/groq";

describe("gateway Groq legado", () => {
  it("falha fechado e não chama rede", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    await expect(generateOfferAnalysis({} as never, {
      telegram: "https://example.com/t",
      instagram: "https://example.com/i",
      whatsapp: "https://example.com/w"
    })).rejects.toThrow("LEGACY_AI_DISABLED: use generateOfficialAI");
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });
});
