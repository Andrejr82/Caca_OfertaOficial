import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const FINAL_COPY_PATHS = [
  "src/core/ai/official-ai-service.ts",
  "src/lib/trends/selection-social-drafts.ts",
  "src/app/api/videos/jobs/route.ts",
  "src/app/api/videos/jobs/[id]/approve/route.ts",
  "src/lib/social/whatsapp-conversion.ts",
  "src/lib/social/telegram-conversion.ts",
  "src/lib/social/facebook-conversion.ts",
] as const;

describe("Copy V5 single final-copy authority", () => {
  it("routes every active feed-copy surface through the V5 authority", () => {
    for (const path of FINAL_COPY_PATHS) {
      const source = read(path);
      expect(source, path).not.toContain("buildCopyV2ChannelCopy");
      if (path !== "src/core/ai/official-ai-service.ts") {
        expect(source, path).not.toContain("buildCanonicalCopyV4ChannelDraft");
        expect(source, path).not.toContain("buildConversionCopyV4Contract");
      }
    }
  });

  it("does not bypass V5 persistence for legacy copyV2 metadata", () => {
    const service = read("src/core/ai/official-ai-service.ts");
    expect(service).not.toContain("if (input.command.metadata?.copyV2 === true)");
    expect(service).toContain("buildCanonicalCopyV5Content(input.content, input.offer, input.channels)");
  });

  it("keeps videos, Trends and channel conversion adapters on V5", () => {
    for (const path of FINAL_COPY_PATHS.slice(1)) {
      expect(read(path), path).toContain("CopyV5");
    }
  });
});
