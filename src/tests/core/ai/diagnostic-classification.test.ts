import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  generateOfficialAI,
  type OfficialAICommand,
  type OfficialAIContent,
  type OfficialAIOffer,
  type OfficialAIServiceDependencies
} from "@/core/ai";
import { GroqOfficialAIProvider } from "@/core/ai/providers/groq-provider";
import { validateOfficialAIContent, validateOfficialAIContentWithDiagnostics } from "@/core/ai/content-schema";

const legacySchema = z.object({
  title: z.string().trim().min(1), description: z.string().trim().min(1), shortCopy: z.string().trim().min(1), longCopy: z.string().trim().min(1),
  hashtags: z.array(z.string().trim().min(1)).min(1), callToAction: z.string().trim().min(1), highlights: z.array(z.string().trim().min(1)).min(1),
  explanation: z.string().trim().min(1), channelCopies: z.object({ telegram: z.string().trim().min(1).optional(), instagram: z.string().trim().min(1).optional(), whatsapp: z.string().trim().min(1).optional() }).strict()
}).strict();

function legacyAccepts(value: unknown) {
  const parsed = legacySchema.safeParse(value);
  return parsed.success && !channels.some((channel) => !parsed.data.channelCopies[channel]);
}

const channels = ["telegram", "instagram", "whatsapp"] as const;
const content: OfficialAIContent = {
  title: "Título", description: "Descrição", shortCopy: "Curta", longCopy: "Longa",
  hashtags: ["#oferta"], callToAction: "Compre", highlights: ["Destaque"], explanation: "Explicação",
  channelCopies: { telegram: "Telegram", instagram: "Instagram", whatsapp: "WhatsApp" }
};

const command: OfficialAICommand = {
  contractVersion: "pmav5.ai/v1", commandId: "command-1", idempotencyKey: "ai:offer-1:v1",
  correlationId: "correlation-1", causationId: null, offerId: "offer-1", tenantId: "tenant-1",
  channels, requestedAt: "2026-07-17T00:00:00.000Z", actor: { type: "service", id: "service-1", service: "test" },
  origin: "test", reason: { code: "TEST" }
};

const offer: OfficialAIOffer = {
  id: "offer-1", tenantId: "tenant-1", state: "pending_manual_review", version: 0,
  marketplace: "Shop", productName: "Produto", originalUrl: "https://example.com/p", imageUrl: "https://example.com/i",
  currentPrice: 10, originalPrice: null, category: "Cat", createdAt: "2026-07-17T00:00:00.000Z",
  explainability: { contract_version: "pmav5.candidate/v1", candidate_id: "candidate", ingestion_id: "ingestion", correlation_id: "correlation", discovery_evidence: {}, marketplace_metrics: {} }
};

function dependencies(providers: OfficialAIServiceDependencies["providers"]): OfficialAIServiceDependencies {
  return {
    providers, offers: { findById: vi.fn().mockResolvedValue(offer) },
    content: { persistDrafts: vi.fn().mockResolvedValue([]) },
    approval: { approveSelected: vi.fn() },
    idempotency: { begin: vi.fn().mockResolvedValue({ status: "started" }), complete: vi.fn().mockResolvedValue(undefined) },
    audit: { register: vi.fn().mockResolvedValue(undefined) }, clock: { now: () => "2026-07-17T00:00:01.000Z" }
  };
}

function providerResponse(body: unknown, status = 200) {
  return new Response(typeof body === "string" ? body : JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
}

describe("diagnóstico seguro de provider", () => {
  it.each([401, 429, 500, 503])("classifica HTTP %i sem conteúdo", async (status) => {
    const fetcher = vi.fn().mockResolvedValue(providerResponse("provider body", status));
    const provider = new GroqOfficialAIProvider({ apiKey: "api-key-fixture", model: "model", fetcher });
    await expect(provider.generate({ prompt: { system: "system", user: "user" }, correlationId: "corr", timeoutMs: 30_000, temperature: .4, maxTokens: 2_000, metadata: {} }))
      .rejects.toMatchObject({ diagnostic: { errorCategory: "HTTP_ERROR", httpStatus: status, attempt: 1, responseSize: expect.any(Number), responseHash: expect.stringMatching(/^[a-f0-9]{64}$/), durationMs: expect.any(Number) } });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([
    ["timeout", new DOMException("timed out", "TimeoutError"), "TIMEOUT"],
    ["rede", new TypeError("fetch failed"), "NETWORK_ERROR"]
  ])("classifica %s sem metadados de resposta", async (_name, error, errorCategory) => {
    const provider = new GroqOfficialAIProvider({ apiKey: "api-key-fixture", model: "model", fetcher: vi.fn().mockRejectedValue(error) });
    await expect(provider.generate({ prompt: { system: "system", user: "user" }, correlationId: "corr", timeoutMs: 30_000, temperature: .4, maxTokens: 2_000, metadata: {} }))
      .rejects.toMatchObject({ diagnostic: { errorCategory, attempt: 1, durationMs: expect.any(Number) } });
  });

  it("classifica exceção fora do provider HTTP como desconhecida", async () => {
    const deps = dependencies({ resolve: () => ({ name: "groq", model: "model", generate: vi.fn().mockRejectedValue(new Error("provider-internal-error")) }) });
    const result = await generateOfficialAI(command, deps);
    expect(result).toMatchObject({ status: "rejected", code: "PROVIDER_FAILURE", message: "Provider failed" });
    expect(JSON.stringify(result)).not.toContain("provider-internal-error");
    expect(deps.audit.register).toHaveBeenCalledWith(expect.objectContaining({
      errorCategory: "UNKNOWN_PROVIDER_EXCEPTION", attempt: 1, channels
    }));
  });

  it.each([
    ["resposta JSON inválida", "{", "RESPONSE_PARSE_ERROR"],
    ["choices ausente", {}, "EMPTY_RESPONSE"],
    ["content vazio", { choices: [{ message: { content: "" } }] }, "EMPTY_RESPONSE"],
    ["JSON de conteúdo inválido", { choices: [{ message: { content: "{" } }] }, "INVALID_JSON"]
  ])("classifica %s", async (_name, body, errorCategory) => {
    const provider = new GroqOfficialAIProvider({ apiKey: "api-key-fixture", model: "model", fetcher: vi.fn().mockResolvedValue(providerResponse(body)) });
    await expect(provider.generate({ prompt: { system: "system", user: "user" }, correlationId: "corr", timeoutMs: 30_000, temperature: .4, maxTokens: 2_000, metadata: {} }))
      .rejects.toMatchObject({ diagnostic: { errorCategory, attempt: 1, durationMs: expect.any(Number), responseSize: expect.any(Number), responseHash: expect.stringMatching(/^[a-f0-9]{64}$/) } });
  });

  it("propaga somente diagnóstico seguro para auditoria", async () => {
    const provider = new GroqOfficialAIProvider({ apiKey: "api-key-fixture", model: "model", fetcher: vi.fn().mockResolvedValue(providerResponse("provider-body-fixture", 429)) });
    const deps = dependencies({ resolve: () => provider });
    const result = await generateOfficialAI(command, deps);
    expect(result).toMatchObject({ status: "rejected", code: "PROVIDER_FAILURE", failureStage: "provider" });
    expect(deps.audit.register).toHaveBeenCalledWith(expect.objectContaining({
      provider: "groq", model: "model", errorCategory: "HTTP_ERROR", httpStatus: 429,
      attempt: 1, channels, responseSize: expect.any(Number), responseHash: expect.stringMatching(/^[a-f0-9]{64}$/), durationMs: expect.any(Number)
    }));
    expect(JSON.stringify(vi.mocked(deps.audit.register).mock.calls)).not.toContain("provider-body-fixture");
    expect(JSON.stringify(vi.mocked(deps.audit.register).mock.calls)).not.toContain("api-key-fixture");
  });
});

describe("regras seguras de schema", () => {
  it.each([
    ["title", undefined, "MISSING_TITLE"], ["description", undefined, "MISSING_DESCRIPTION"],
    ["shortCopy", undefined, "MISSING_SHORT_COPY"], ["longCopy", undefined, "MISSING_LONG_COPY"],
    ["callToAction", undefined, "MISSING_CALL_TO_ACTION"], ["explanation", undefined, "MISSING_EXPLANATION"],
    ["hashtags", [], "EMPTY_HASHTAGS"], ["hashtags", "wrong", "INVALID_HASHTAGS"],
    ["highlights", [], "EMPTY_HIGHLIGHTS"], ["highlights", "wrong", "INVALID_HIGHLIGHTS"]
  ])("identifica %s", (field, value, validationRule) => {
    const result = validateOfficialAIContentWithDiagnostics({ ...content, [field]: value }, channels);
    expect(result).toMatchObject({ content: null, validationRule });
  });

  it.each([
    [{ ...content, title: 1 }, "INVALID_FIELD_TYPE"],
    [{ ...content, channelCopies: "wrong" }, "INVALID_CHANNEL_COPIES"],
    [{ ...content, channelCopies: { ...content.channelCopies, extra: "x" } }, "UNRECOGNIZED_CHANNEL_FIELD"],
    [{ ...content, channelCopies: { instagram: "Instagram" } }, "REQUESTED_CHANNEL_COPY_MISSING"],
    [{ ...content, channelCopies: { ...content.channelCopies, telegram: " " } }, "REQUESTED_CHANNEL_COPY_EMPTY"],
    [{ ...content, extra: true }, "UNKNOWN_SCHEMA_ERROR"]
  ])("mantém rejeição e informa %s", (value, validationRule) => {
    const result = validateOfficialAIContentWithDiagnostics(value, channels);
    expect(result).toMatchObject({ content: null, validationRule });
  });

  it("mantém aceite de fixture válida", () => {
    expect(validateOfficialAIContentWithDiagnostics(content, channels)).toEqual({ content });
  });

  it("mantém decisão booleana das fixtures antes e depois do diagnóstico", () => {
    const fixtures: unknown[] = [
      content,
      { ...content, title: " " },
      { ...content, hashtags: [""] },
      { ...content, channelCopies: { ...content.channelCopies, telegram: 1 } },
      { ...content, extra: true }
    ];
    for (const fixture of fixtures) {
      expect(validateOfficialAIContentWithDiagnostics(fixture, channels).content !== null).toBe(legacyAccepts(fixture));
      expect(validateOfficialAIContent(fixture, channels) !== null).toBe(legacyAccepts(fixture));
    }
  });
});
