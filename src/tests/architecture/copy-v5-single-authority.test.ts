import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FINAL_COPY_PATHS = [
  "src/core/ai/official-ai-service.ts",
  "src/core/ai/official-ai-regeneration-service.ts",
  "src/lib/trends/selection-social-drafts.ts",
  "src/app/api/ai/generate/route.ts",
  "src/app/api/publish/extension/route.ts",
  "src/lib/publish/actions.ts",
  "src/app/api/videos/jobs/route.ts",
  "src/app/api/videos/jobs/[id]/approve/route.ts",
  "src/lib/social/whatsapp-conversion.ts",
  "src/lib/social/telegram-conversion.ts",
  "src/lib/social/facebook-conversion.ts",
  "src/lib/social/instagram-conversion.ts",
  "src/app/(dashboard)/messages/page.tsx",
  "src/components/messages/message-actions.tsx",
  "scripts/backfill-opac-drafts.ts",
] as const;

describe("Copy V5 single final-copy authority", () => {
  it("proíbe renderers V2/V3/V4 e gerador clássico nos entrypoints de copy final", () => {
    for (const path of FINAL_COPY_PATHS) {
      const source = read(path);
      expect(source, path).not.toContain("buildCopyV2ChannelCopy");
      expect(source, path).not.toContain("buildCopyV3ChannelCopy");
      expect(source, path).not.toContain("generateAllMessages");
      if (path !== "src/core/ai/official-ai-service.ts") {
        expect(source, path).not.toContain("buildCanonicalCopyV4ChannelDraft");
        expect(source, path).not.toContain("buildConversionCopyV4Contract");
      }
    }
  });

  it("obriga a persistência oficial a obter o plano do único cérebro Copy V5", () => {
    const service = read("src/core/ai/official-ai-service.ts");
    expect(service).toContain('import { planCommercialCopyV5 } from "./copy-v5-planner"');
    expect(service).toContain("const outcome = await planCommercialCopyV5(facts, provider");
    expect(service).toContain("const plan = outcome.plan");
    expect(service).toContain("buildCanonicalCopyV5Content(input.content, input.offer, input.channels, plan)");
    expect(service).toContain("COPY_V5_SINGLE_BRAIN_ENFORCED");
    expect(service).not.toContain("if (input.command.metadata?.copyV2 === true)");
  });

  it("neutraliza o roteamento legado de Expressa e ciclos antes do engine", () => {
    const service = read("src/core/ai/official-ai-service.ts");
    expect(service).toContain("neutralizeLegacyCopyRouting(command)");
    expect(service).toContain('command.origin === "oracle.discovery"');
    expect(service).toContain('command.origin === "publish.quick-publication"');
    expect(service).toContain("copyV2Auto: _copyV2Auto");
    expect(service).toContain("copyV3Express: _copyV3Express");
    expect(service).toContain("generateOfficialAIEngine(canonicalCommand, wrappedDependencies)");
  });

  it("impede qualquer caller produtivo de importar o engine diretamente", () => {
    const service = read("src/core/ai/official-ai-service.ts");
    expect(service).toContain('from "./official-ai-service-engine"');
    for (const path of FINAL_COPY_PATHS.filter((path) => path !== "src/core/ai/official-ai-service.ts")) {
      expect(read(path), path).not.toContain("official-ai-service-engine");
    }
  });

  it("torna o engine legado incapaz de ser autoridade da copy final", () => {
    const service = read("src/core/ai/official-ai-service.ts");
    const engine = read("src/core/ai/official-ai-service-engine.ts");

    // O engine pode manter código de compatibilidade interna, mas nunca recebe
    // um provider real pela fachada pública e nunca persiste a copy final sem
    // passar pelo interceptador V5.
    expect(service).toContain('throw new Error("COPY_V5_SINGLE_BRAIN_ENFORCED")');
    expect(service).toContain("content: {");
    expect(service).toContain("persistDrafts: async (input) => {");
    expect(service).toContain("planCommercialCopyV5(facts, provider");
    expect(service).toContain("dependencies.content.persistDrafts({ ...input, content })");
    expect(engine).not.toContain("export default");
  });

  it("faz a regeneração usar o mesmo planCommercialCopyV5 sem provider.generate paralelo", () => {
    const regeneration = read("src/core/ai/official-ai-regeneration-service.ts");
    expect(regeneration).toContain('import { planCommercialCopyV5 } from "./copy-v5-planner"');
    expect(regeneration).toContain("await planCommercialCopyV5(facts, provider");
    expect(regeneration).not.toContain("provider.generate(");
    expect(regeneration).not.toContain("buildCopyV5PlannerPrompt");
    expect(regeneration).toContain("buildCanonicalCopyV5ChannelDraft");
  });

  it("mantém Expressa, ciclo e extensão como clientes da mesma Official AI", () => {
    const express = read("src/lib/publish/actions.ts");
    const cycle = read("src/app/api/ai/generate/route.ts");
    const extension = read("src/app/api/publish/extension/route.ts");
    expect(express).toContain("generateOfficialAI(command");
    expect(cycle).toContain("generateOfficialAI(command");
    expect(extension).toContain("generateOfficialAI(command");
  });

  it("mantém renderer puro: sem segundo cérebro, classificação social ou ângulo próprio", () => {
    const renderer = read("src/core/ai/copy-v5-renderer.ts");
    expect(renderer).toContain("plan.hook");
    expect(renderer).toContain("plan.benefitLine");
    expect(renderer).toContain("plan.selectedAttributes");
    expect(renderer).toContain("plan.optionalProofAngle");
    expect(renderer).not.toContain("buildChannelNativeNarrative");
    expect(renderer).not.toContain("classifySocialCopyArchetype");
    expect(renderer).not.toContain("calculateDiscountPercent");
    expect(renderer).not.toContain("50 &&");
  });

  it("remove fisicamente o social director que criava narrativa paralela", () => {
    expect(existsSync(resolve(root, "src/core/ai/copy-v5-social-director.ts"))).toBe(false);
    expect(read("src/core/ai/copy-v5-renderer.ts")).not.toContain("copy-v5-social-director");
  });

  it("mantém backfill e superfícies sociais explicitamente na V5", () => {
    expect(read("scripts/backfill-opac-drafts.ts")).toContain("renderCopyV5ChannelCopy");
    expect(read("src/lib/trends/selection-social-drafts.ts")).toContain("CopyV5");
    expect(read("src/app/api/videos/jobs/route.ts")).toContain("CopyV5");
    expect(read("src/app/api/videos/jobs/[id]/approve/route.ts")).toContain("CopyV5");
    expect(read("src/lib/social/whatsapp-conversion.ts")).toContain("CopyV5");
    expect(read("src/lib/social/telegram-conversion.ts")).toContain("CopyV5");
    expect(read("src/lib/social/facebook-conversion.ts")).toContain("CopyV5");
    const instagram = read("src/lib/social/instagram-conversion.ts");
    expect(instagram).toContain("buildInstagramConversionV5Plan");
    expect(instagram).toContain("renderPriceBlock");
  });

  it("Mensagens apenas lê drafts oficiais e solicita geração sem flags legadas", () => {
    const page = read("src/app/(dashboard)/messages/page.tsx");
    const actions = read("src/components/messages/message-actions.tsx");
    expect(page).toContain("getOfferPosts");
    expect(page).not.toContain("@/lib/messages/generate");
    expect(actions).toContain('/api/ai/generate');
    expect(actions).not.toContain("copyV2");
    expect(actions).not.toContain("regenerateCopyV2");
  });

  it("mantém a fachada legada de Messages incapaz de renderizar fora da autoridade canônica V5", () => {
    const legacyFacade = read("src/lib/messages/generate.ts");
    expect(legacyFacade).toContain("buildCanonicalCopyV5ChannelDraft");
    expect(legacyFacade).not.toContain("buildCopyV2ChannelCopy");
    expect(legacyFacade).not.toContain("buildCopyV3ChannelCopy");
    expect(legacyFacade).not.toContain("buildConversionCopyV4Contract");
  });
});
