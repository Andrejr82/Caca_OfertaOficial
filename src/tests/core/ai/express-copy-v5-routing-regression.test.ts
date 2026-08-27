import { describe, expect, it } from "vitest";
import { neutralizeLegacyCopyRouting } from "@/core/ai/official-ai-service";
import type { OfficialAICommand } from "@/core/ai/types";

function baseCommand(): OfficialAICommand {
  return {
    contractVersion: "pmav5.ai/v1",
    commandId: "express-regression",
    idempotencyKey: "ai:offer-1:v1",
    correlationId: "corr-1",
    causationId: "manual",
    offerId: "offer-1",
    tenantId: "tenant-1",
    channels: ["telegram"],
    requestedAt: "2026-08-27T12:00:00.000Z",
    actor: { type: "user", id: "user-1", service: "quick-publication" },
    origin: "publish.quick-publication",
    reason: { code: "GENERATE_OFFICIAL_CONTENT" },
  };
}

describe("Publicação Expressa x neutralização Copy V5", () => {
  it("preserva o contrato V3 Express até o engine", () => {
    const command: OfficialAICommand = {
      ...baseCommand(),
      idempotencyKey: "ai:copy-v3:offer-1:1",
      metadata: { copyV3Express: true, copyV3Regenerate: true },
    };

    const normalized = neutralizeLegacyCopyRouting(command);

    expect(normalized).toBe(command);
    expect(normalized.metadata).toEqual({ copyV3Express: true, copyV3Regenerate: true });
    expect(normalized.idempotencyKey).toBe("ai:copy-v3:offer-1:1");
  });

  it("preserva o contrato V2 Express até o engine", () => {
    const command: OfficialAICommand = {
      ...baseCommand(),
      idempotencyKey: "ai:copy-v2:offer-1:2",
      metadata: { copyV2: true, copyV2Express: true, copyV2Regenerate: true },
    };

    const normalized = neutralizeLegacyCopyRouting(command);

    expect(normalized).toBe(command);
    expect(normalized.metadata).toEqual({ copyV2: true, copyV2Express: true, copyV2Regenerate: true });
    expect(normalized.idempotencyKey).toBe("ai:copy-v2:offer-1:2");
  });

  it("mantém a neutralização do ciclo automático inalterada", () => {
    const command: OfficialAICommand = {
      ...baseCommand(),
      idempotencyKey: "ai:draft:offer-1:v2",
      actor: { type: "service", id: "oracle-worker", service: "oracle.discovery" },
      origin: "oracle.discovery",
      metadata: { copyV2: true, copyV2Auto: true },
    };

    const normalized = neutralizeLegacyCopyRouting(command);

    expect(normalized).not.toBe(command);
    expect(normalized.metadata?.copyV2).toBeUndefined();
    expect(normalized.metadata?.copyV2Auto).toBeUndefined();
  });
});
