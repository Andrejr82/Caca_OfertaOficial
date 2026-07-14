import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import { analyzeConversionPotential, callLLM, generateOfferAnalysis } from "@/lib/ai/groq";

describe("fronteira oficial de IA", () => {
  it("a rota oficial chama somente generateOfficialAI e não persiste domínio diretamente", () => {
    const source = readFileSync("src/app/api/ai/generate/route.ts", "utf8");
    expect(source).toContain("generateOfficialAI");
    expect(source).toContain("createOfficialAIServiceDependencies");
    expect(source).not.toContain("generateOfferAnalysis");
    expect(source).not.toContain("callLLM");
    expect(source).not.toContain("Groq");
    expect(source).not.toContain("Cerebras");
    expect(source).not.toMatch(/\.from\(["'](?:posts|affiliate_links|offers|ai_copy_logs)["']\)/);
    expect(source).not.toContain("transitionOfficialOfferState");
  });

  it("somente a composição oficial importa providers concretos", () => {
    const composition = readFileSync("src/lib/ai/official/create-official-ai-service.ts", "utf8");
    expect(composition).toContain("GroqOfficialAIProvider");
    expect(composition).toContain("CerebrasOfficialAIProvider");

    for (const path of [
      "src/app/api/ai/generate/route.ts",
      "src/lib/ai/groq.ts",
      "src/core/ai/official-ai-service.ts"
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/providers\/(groq|cerebras)-provider/);
    }
  });

  it("gateways legados falham fechados antes de qualquer fetch", async () => {
    const fetchSpy = vi.spyOn(globalThis, "fetch");
    const legacyOffer = {
      id: "offer-1", user_id: "tenant-1", platform: "Shopee", product_name: "Produto",
      original_url: "https://example.com/1", image_url: "https://example.com/1.jpg",
      current_price: 10, old_price: 20, category: "Geral", status: "selected"
    } as never;
    const disabled = "LEGACY_AI_DISABLED: use generateOfficialAI";

    await expect(callLLM("system", "user", {})).rejects.toThrow(disabled);
    await expect(generateOfferAnalysis(legacyOffer, { telegram: "t", instagram: "i", whatsapp: "w" })).rejects.toThrow(disabled);
    await expect(analyzeConversionPotential(legacyOffer, 7)).rejects.toThrow(disabled);
    expect(fetchSpy).not.toHaveBeenCalled();
    fetchSpy.mockRestore();
  });

  it("arquivos proibidos não importam a composição nem providers oficiais", () => {
    for (const path of [
      "scripts/oracle-scraper.cjs",
      "scripts/oracle-worker-discovery-only.cjs",
      "src/lib/inngest/functions.ts",
      "src/app/api/publish/extension/route.ts",
      "src/lib/affiliates/scraper.ts"
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("createOfficialAIServiceDependencies");
      expect(source).not.toMatch(/core\/ai\/providers\//);
    }
  });

  it("posts draft oficiais são inseridos somente pelo adapter oficial dentro do novo fluxo", () => {
    const adapter = readFileSync("src/lib/ai/official/supabase-official-ai-adapter.ts", "utf8");
    expect(adapter).toContain('.from("posts")');
    expect(adapter).toContain('status: "draft"');
    expect(adapter).not.toMatch(/status:\s*["'](?:approved|published|processing|deleted)["']/);
    expect(adapter).not.toMatch(/\.from\(["']offers["']\)\s*\.update/);
  });
});
