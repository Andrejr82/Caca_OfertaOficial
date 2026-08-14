import { describe, expect, it, vi } from "vitest";
import { generateOfficialAI, type OfficialAICommand, type OfficialAIResult, type OfficialAIServiceDependencies } from "@/core/ai";

function stableSerialize(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableSerialize).join(",")}]`;
  if (value !== null && typeof value === "object") {
    const record = value as Record<string, unknown>;
    return `{${Object.keys(record).sort().map((key) => `${JSON.stringify(key)}:${stableSerialize(record[key])}`).join(",")}}`;
  }
  return JSON.stringify(value);
}

describe("Official AI idempotency contract version", () => {
  it("does not replay a deterministic legacy result, while preserving current replays", async () => {
    const command: OfficialAICommand = {
      contractVersion: "pmav5.ai/v1",
      commandId: "new-command",
      idempotencyKey: "ai:draft:legacy-offer:v2",
      correlationId: "new-correlation",
      causationId: null,
      offerId: "legacy-offer",
      tenantId: "tenant-1",
      providerPreference: "groq",
      channels: ["telegram", "instagram", "whatsapp", "facebook"],
      requestedAt: "2026-08-14T12:00:00.000Z",
      actor: { type: "user", id: "user-1", service: "nextjs-ai-route" },
      origin: "api.ai.generate",
      reason: { code: "GENERATE_OFFICIAL_CONTENT" }
    };
    const offer = {
      id: command.offerId,
      tenantId: command.tenantId,
      state: "pending_manual_review" as const,
      version: 1,
      marketplace: "Amazon",
      productName: "Capacete Pro Tork Sport Moto 788",
      originalUrl: "https://amazon.example/offer",
      imageUrl: "https://cdn.example/offer.jpg",
      currentPrice: 82,
      originalPrice: 93.51,
      category: "Esportes",
      explainability: {
        contract_version: "pmav5.candidate/v1",
        manual_source: true,
        candidate_id: "candidate-1",
        ingestion_id: "ingestion-1",
        marketplace_metrics: { sourceItemId: "item-1" }
      },
      createdAt: "2026-08-14T11:00:00.000Z",
      affiliateLinks: [
        { channel: "telegram" as const, trackedUrl: "https://app.example/tg" },
        { channel: "instagram" as const, trackedUrl: "https://app.example/ig" },
        { channel: "whatsapp" as const, trackedUrl: "https://app.example/wa" },
        { channel: "facebook" as const, trackedUrl: "https://app.example/fb" }
      ]
    };
    const legacyFingerprint = stableSerialize({
      contractVersion: command.contractVersion,
      idempotencyKey: command.idempotencyKey,
      offerId: command.offerId,
      tenantId: command.tenantId,
      channels: [...command.channels].sort(),
      providerPreference: command.providerPreference,
      reason: command.reason,
      batch: null
    });
    const legacyResult = {
      status: "drafted",
      commandId: "legacy-command",
      offerId: command.offerId,
      offerState: "pending_manual_review",
      providerEvidence: { provider: "deterministic-engine", model: "generate.ts", latencyMs: 0 },
      completedAt: "2026-08-11T18:01:34.753Z",
      content: { channelCopies: { telegram: "Oferta catalogal antiga", whatsapp: "Oferta catalogal antiga" } }
    } as unknown as OfficialAIResult;
    let stored = { fingerprint: legacyFingerprint, result: legacyResult };
    const providerGenerate = vi.fn();
    const provider = { name: "groq", model: "openai/gpt-oss-120b", generate: providerGenerate };
    const dependencies: OfficialAIServiceDependencies = {
      offers: { updateShortName: vi.fn(), findById: vi.fn().mockResolvedValue(offer) },
      providers: { resolve: vi.fn().mockReturnValue(provider) },
      content: { persistDrafts: vi.fn().mockImplementation(async ({ channels }) => channels.map((channel: string) => ({ postId: `post-${channel}`, affiliateLinkId: `link-${channel}`, channel, state: "draft" }))) },
      approval: { approveSelected: vi.fn() },
      idempotency: {
        begin: vi.fn(async (key, fingerprint) => stored && stored.fingerprint === fingerprint
          ? { status: "replay" as const, result: stored.result }
          : (stored = { fingerprint, result: undefined as unknown as OfficialAIResult }, { status: "started" as const })),
        complete: vi.fn(async (_key, fingerprint, result) => { stored = { fingerprint, result }; })
      },
      audit: { register: vi.fn().mockResolvedValue(undefined) },
      clock: { now: vi.fn().mockReturnValue("2026-08-14T12:00:08.000Z") }
    };

    const first = await generateOfficialAI(command, dependencies);

    expect(first.replay).not.toBe(true);
    expect(first.status).toBe("drafted");
    if (first.status !== "drafted") throw new Error(`Unexpected result: ${first.status}`);
    expect(dependencies.providers.resolve).toHaveBeenCalledWith("groq");
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
    expect(Object.keys(first.content?.channelCopies ?? {})).toEqual(expect.arrayContaining(["instagram", "whatsapp", "telegram", "facebook"]));
    for (const text of Object.values(first.content?.channelCopies ?? {})) {
      expect(text).not.toMatch(/preço conferido|em destaque|se você procura|acesse a publicação/iu);
    }

    const second = await generateOfficialAI({ ...command, commandId: "equivalent-command", correlationId: "equivalent-correlation" }, dependencies);
    expect(second.replay).toBe(true);
    expect(dependencies.content.persistDrafts).toHaveBeenCalledTimes(1);
    expect(providerGenerate).not.toHaveBeenCalled();
  });
});
