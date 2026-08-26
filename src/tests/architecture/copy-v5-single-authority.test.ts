import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FINAL_COPY_PATHS = [
  "src/core/ai/official-ai-service.ts",
  "src/core/ai/official-ai-regeneration-service.ts",
  "src/lib/trends/selection-social-drafts.ts",
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
    expect(service).toContain("const plan = await planCommercialCopyV5(facts, provider");
    expect(service).toContain("buildCanonicalCopyV5Content(input.content, input.offer, input.channels, plan)");
    expect(service).toContain("COPY_V5_SINGLE_BRAIN_ENFORCED");
    expect(service).not.toContain("if (input.command.metadata?.copyV2 === true)");
  });

  it("faz a regeneração usar o mesmo planCommercialCopyV5 sem provider.generate paralelo", () => {
    const regeneration = read("src/core/ai/official-ai-regeneration-service.ts");
    expect(regeneration).toContain('import { planCommercialCopyV5 } from "./copy-v5-planner"');
    expect(regeneration).toContain("await planCommercialCopyV5(facts, provider");
    expect(regeneration).not.toContain("provider.generate(");
    expect(regeneration).not.toContain("buildCopyV5PlannerPrompt");
    expect(regeneration).toContain("buildCanonicalCopyV5ChannelDraft");
  });

  it("mantém Expressa e ciclos como clientes da mesma Official AI", () => {
    const express = read("src/lib/publish/actions.ts");
    const cycle = read("src/app/api/ai/generate/route.ts");
    expect(express).toContain("generateOfficialAI(command");
    expect(cycle).toContain("generateOfficialAI(command");
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
