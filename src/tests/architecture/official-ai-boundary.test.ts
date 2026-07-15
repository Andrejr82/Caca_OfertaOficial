import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

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

  it("regeneração possui rota própria, sem geração inicial nem persistência direta", () => {
    const source = readFileSync("src/app/api/ai/regenerate/route.ts", "utf8");
    expect(source).toContain("regenerateOfficialDrafts");
    expect(source).toContain("createOfficialAIRegenerationDependencies");
    expect(source).not.toContain("generateOfficialAI");
    expect(source).not.toMatch(/\.from\(["'](?:posts|affiliate_links|offers)["']\)/);
  });

  it("somente a composição oficial importa providers concretos", () => {
    const composition = readFileSync("src/lib/ai/official/create-official-ai-service.ts", "utf8");
    expect(composition).toContain("GroqOfficialAIProvider");
    expect(composition).toContain("CerebrasOfficialAIProvider");

    for (const path of [
      "src/app/api/ai/generate/route.ts",
      "src/core/ai/official-ai-service.ts"
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toMatch(/providers\/(groq|cerebras)-provider/);
    }
  });

  it("Oracle e Discovery não importam a composição nem providers oficiais", () => {
    for (const path of [
      "scripts/oracle-scraper.cjs",
      "scripts/oracle-worker-discovery-only.cjs"
    ]) {
      const source = readFileSync(path, "utf8");
      expect(source).not.toContain("createOfficialAIServiceDependencies");
      expect(source).not.toMatch(/core\/ai\/providers\//);
    }
  });

  it("Inngest e Extension são clientes da composição oficial sem importar providers", () => {
    for (const path of ["src/lib/inngest/functions.ts", "src/app/api/publish/extension/route.ts"]) {
      const source = readFileSync(path, "utf8");
      expect(source).toContain("generateOfficialAI");
      expect(source).toContain("createOfficialAIServiceDependencies");
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
