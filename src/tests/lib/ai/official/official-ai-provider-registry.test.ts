import { describe, expect, it, vi } from "vitest";
import { OfficialAIProviderRegistry } from "@/lib/ai/official/create-official-ai-service";
import { StructuredOfficialAITelemetry } from "@/lib/ai/official/official-ai-telemetry";
import type { AIProviderRequest, OfficialAIContent } from "@/core/ai";

const content: OfficialAIContent = {
  title: "Título",
  description: "Descrição",
  shortCopy: "Curta",
  longCopy: "Longa",
  hashtags: ["#oferta"],
  callToAction: "Compre",
  highlights: ["Destaque"],
  explanation: "Explicação",
  channelCopies: { whatsapp: "WhatsApp" }
};

const request: AIProviderRequest = {
  prompt: { system: "system", user: "user" },
  correlationId: "correlation-1",
  timeoutMs: 100,
  temperature: 0.4,
  maxTokens: 100,
  metadata: {}
};

const success = () => new Response(JSON.stringify({
  choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }]
}), { status: 200, headers: { "Content-Type": "application/json" } });

const httpError = (status: number, retryAfter?: string) => new Response("failed", {
  status,
  headers: retryAfter ? { "Retry-After": retryAfter } : undefined
});

const canonicalEnv = (overrides: Record<string, string | undefined> = {}): Record<string, string | undefined> => ({
  LLM_PROVIDER: "cerebras",
  LLM_FALLBACK: "groq",
  CEREBRAS_API_KEY: "cerebras-primary-secret",
  CEREBRAS_API_KEY_2: "cerebras-secondary-secret",
  CEREBRAS_MODEL: "cerebras-model",
  CEREBRAS_BASE_URL: "https://cerebras.example/v1",
  GROQ_API_KEY: "groq-primary-secret",
  GROQ_API_KEY_2: "groq-secondary-secret",
  GROQ_MODEL: "groq-model",
  ...overrides
});

function registry(env = canonicalEnv(), fetcher = vi.fn().mockResolvedValue(success()), options: {
  now?: () => number;
  cooldowns?: Map<string, number>;
  telemetry?: { emit(event: any): void };
} = {}) {
  return {
    registry: new OfficialAIProviderRegistry({ env, fetcher, cooldowns: new Map(), ...options }),
    fetcher
  };
}

function calledKeys(fetcher: ReturnType<typeof vi.fn>) {
  return fetcher.mock.calls.map(([, init]) => init.headers.Authorization.replace("Bearer ", ""));
}

describe("OfficialAIProviderRegistry", () => {
  it("ordena Cerebras 1, Cerebras 2, Groq 1 e Groq 2", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(httpError(429))
      .mockResolvedValueOnce(httpError(429))
      .mockResolvedValueOnce(httpError(503))
      .mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual([
      "cerebras-primary-secret", "cerebras-secondary-secret", "groq-primary-secret", "groq-secondary-secret"
    ]);
  });

  it("inverte ordem quando Groq é primário e Cerebras é fallback", async () => {
    const fetcher = vi.fn()
      .mockResolvedValueOnce(httpError(429))
      .mockResolvedValueOnce(httpError(429))
      .mockResolvedValueOnce(httpError(503))
      .mockResolvedValueOnce(success());
    await registry(canonicalEnv({ LLM_PROVIDER: "groq", LLM_FALLBACK: "cerebras" }), fetcher).registry.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual([
      "groq-primary-secret", "groq-secondary-secret", "cerebras-primary-secret", "cerebras-secondary-secret"
    ]);
  });

  it("ignora chave secundária ausente", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429)).mockResolvedValueOnce(success());
    await registry(canonicalEnv({ CEREBRAS_API_KEY_2: "" }), fetcher).registry.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-primary-secret", "groq-primary-secret"]);
  });

  it("ignora fallback ausente", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429)).mockResolvedValueOnce(success());
    await registry(canonicalEnv({ LLM_FALLBACK: "", GROQ_API_KEY: "", GROQ_API_KEY_2: "" }), fetcher).registry.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-primary-secret", "cerebras-secondary-secret"]);
  });

  it("rejeita ausência de qualquer credencial", () => {
    expect(() => registry(canonicalEnv({
      CEREBRAS_API_KEY: "", CEREBRAS_API_KEY_2: "", GROQ_API_KEY: "", GROQ_API_KEY_2: ""
    }))).toThrow("Official AI requires at least one configured credential");
  });

  it.each(["openai", "", "CEREBRAS"])("rejeita LLM_PROVIDER inválido: %s", (value) => {
    expect(() => registry(canonicalEnv({ LLM_PROVIDER: value }))).toThrow("Invalid LLM_PROVIDER");
  });

  it("rejeita LLM_FALLBACK inválido", () => {
    expect(() => registry(canonicalEnv({ LLM_FALLBACK: "openai" }))).toThrow("Invalid LLM_FALLBACK");
  });

  it("rejeita provider e fallback iguais para impedir credencial duplicada", () => {
    expect(() => registry(canonicalEnv({ LLM_FALLBACK: "cerebras" }))).toThrow("LLM_FALLBACK must differ from LLM_PROVIDER");
  });

  it("para após sucesso da primeira credencial", async () => {
    const { registry: target, fetcher } = registry();
    await target.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-primary-secret"]);
  });

  it("avança da primeira para segunda credencial em 429", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429)).mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-primary-secret", "cerebras-secondary-secret"]);
  });

  it("avança para Groq após dois 429 da Cerebras", async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429)).mockResolvedValueOnce(httpError(429)).mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-primary-secret", "cerebras-secondary-secret", "groq-primary-secret"]);
  });

  it("registra troca para fallback com correlação e tentativa", async () => {
    const events: any[] = [];
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(503)).mockResolvedValue(success());
    await registry(canonicalEnv({ CEREBRAS_API_KEY_2: "" }), fetcher, {
      telemetry: { emit: (event) => events.push(event) }
    }).registry.resolve().generate(request);
    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "official_ai.provider.selected", provider: "cerebras", attempt: 1, fallback: false, correlationId: request.correlationId }),
      expect.objectContaining({ eventType: "official_ai.provider.fallback.started", provider: "groq", attempt: 2, fallback: true, correlationId: request.correlationId })
    ]));
  });

  it.each([408, 500, 502, 503, 504])("avança em HTTP %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(status)).mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("avança em timeout", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new DOMException("timed out", "TimeoutError")).mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("avança em falha transitória de rede", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new TypeError("fetch failed")).mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it("não avança em erro interno não classificado como transporte", async () => {
    const fetcher = vi.fn().mockRejectedValueOnce(new Error("internal bug")).mockResolvedValueOnce(success());
    await expect(registry(canonicalEnv(), fetcher).registry.resolve().generate(request)).rejects.toThrow("internal bug");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it.each([401, 403])("avança em HTTP %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(status)).mockResolvedValueOnce(success());
    await registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it.each([400, 404])("não avança em HTTP %s", async (status) => {
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(status)).mockResolvedValueOnce(success());
    await expect(registry(canonicalEnv(), fetcher).registry.resolve().generate(request)).rejects.toMatchObject({ status });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("usa Retry-After em segundos como cooldown em milissegundos", async () => {
    let now = 1_000;
    const cooldowns = new Map<string, number>();
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429, "7")).mockResolvedValue(success());
    await registry(canonicalEnv(), fetcher, { now: () => now, cooldowns }).registry.resolve().generate(request);
    expect(cooldowns.get("cerebras:primary")).toBe(8_000);
  });

  it("usa Retry-After em data HTTP como cooldown", async () => {
    const now = Date.parse("2026-07-15T12:00:00.000Z");
    const retryAt = new Date(now + 9_000).toUTCString();
    const cooldowns = new Map<string, number>();
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429, retryAt)).mockResolvedValue(success());
    await registry(canonicalEnv(), fetcher, { now: () => now, cooldowns }).registry.resolve().generate(request);
    expect(cooldowns.get("cerebras:primary")).toBe(now + 9_000);
  });

  it("usa cooldown padrão configurável sem Retry-After", async () => {
    const cooldowns = new Map<string, number>();
    const fetcher = vi.fn().mockResolvedValueOnce(httpError(429)).mockResolvedValue(success());
    await registry(canonicalEnv({ OFFICIAL_AI_DEFAULT_COOLDOWN_MS: "1234" }), fetcher, {
      now: () => 10_000, cooldowns
    }).registry.resolve().generate(request);
    expect(cooldowns.get("cerebras:primary")).toBe(11_234);
  });

  it("pula credencial durante cooldown", async () => {
    const cooldowns = new Map([["cerebras:primary", 2_000]]);
    const { registry: target, fetcher } = registry(canonicalEnv(), vi.fn().mockResolvedValue(success()), {
      now: () => 1_000, cooldowns
    });
    await target.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-secondary-secret"]);
  });

  it("torna credencial elegível após expiração", async () => {
    const cooldowns = new Map([["cerebras:primary", 2_000]]);
    const { registry: target, fetcher } = registry(canonicalEnv(), vi.fn().mockResolvedValue(success()), {
      now: () => 2_001, cooldowns
    });
    await target.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-primary-secret"]);
  });

  it("cooldown de uma chave não bloqueia outra do mesmo provider", async () => {
    const cooldowns = new Map([["cerebras:primary", 2_000]]);
    const { registry: target, fetcher } = registry(canonicalEnv(), vi.fn().mockResolvedValue(success()), {
      now: () => 1_000, cooldowns
    });
    await target.resolve().generate(request);
    expect(calledKeys(fetcher)).toEqual(["cerebras-secondary-secret"]);
  });

  it("tenta cada credencial no máximo uma vez e termina após quatro falhas", async () => {
    const fetcher = vi.fn().mockResolvedValue(httpError(503));
    await expect(registry(canonicalEnv(), fetcher).registry.resolve().generate(request)).rejects.toThrow("OFFICIAL_AI_PROVIDERS_EXHAUSTED");
    expect(calledKeys(fetcher)).toEqual([
      "cerebras-primary-secret", "cerebras-secondary-secret", "groq-primary-secret", "groq-secondary-secret"
    ]);
  });

  it("retorna resumo final seguro sem chaves", async () => {
    const fetcher = vi.fn().mockResolvedValue(httpError(503));
    const promise = registry(canonicalEnv(), fetcher).registry.resolve().generate(request);
    await expect(promise).rejects.toMatchObject({
      code: "OFFICIAL_AI_PROVIDERS_EXHAUSTED",
      attempts: expect.arrayContaining([expect.objectContaining({ credential: "cerebras:primary", status: 503 })])
    });
    await promise.catch((error) => {
      const serialized = JSON.stringify(error);
      expect(serialized).not.toContain("secret");
    });
  });

  it("não registra chaves em logs", async () => {
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await registry(canonicalEnv(), vi.fn().mockResolvedValue(httpError(503))).registry.resolve().generate(request).catch(() => undefined);
    expect([...log.mock.calls, ...warn.mock.calls, ...error.mock.calls].flat().join(" ")).not.toContain("secret");
    log.mockRestore(); warn.mockRestore(); error.mockRestore();
  });

  it("não avança após resposta com JSON de conteúdo inválido", async () => {
    const invalid = new Response(JSON.stringify({ choices: [{ message: { content: "{" } }] }), { status: 200 });
    const fetcher = vi.fn().mockResolvedValueOnce(invalid).mockResolvedValueOnce(success());
    await expect(registry(canonicalEnv(), fetcher).registry.resolve().generate(request)).rejects.toThrow("INVALID_JSON");
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("registra status HTTP, falha do parser e causa da tentativa", async () => {
    const events: Array<{ eventType: string; details: Record<string, unknown> }> = [];
    const invalid = new Response(JSON.stringify({ choices: [{ message: { content: "{" } }] }), { status: 200 });
    const { registry: target } = registry(canonicalEnv(), vi.fn().mockResolvedValue(invalid), {
      telemetry: { emit: (event) => { events.push(event); } }
    });

    await expect(target.resolve().generate(request)).rejects.toThrow("INVALID_JSON");

    expect(events).toEqual(expect.arrayContaining([
      expect.objectContaining({ eventType: "official_ai.provider.response.received", details: expect.objectContaining({ httpStatus: 200 }) }),
      expect.objectContaining({ eventType: "official_ai.provider.parser.failed", details: expect.objectContaining({ responseChars: 1 }) }),
      expect.objectContaining({ eventType: "official_ai.provider.attempt.failed", details: expect.objectContaining({ failureCode: null, retryEligible: false }) })
    ]));
  });

  it("agrega o resumo do ciclo pelo correlationId", () => {
    const telemetry = new StructuredOfficialAITelemetry();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    telemetry.emit({ eventType: "official_ai.provider.attempt.completed", correlationId: "cycle-1", provider: "cerebras", model: "gpt-oss-120b", stage: "provider_registry" });
    telemetry.emit({ eventType: "official_ai.provider.fallback.started", correlationId: "cycle-1", provider: "groq", model: "llama", fallback: true, stage: "provider_registry" });
    telemetry.emit({ eventType: "official_ai.validation.channel.rejected", correlationId: "cycle-1", stage: "hook_validation", details: { rule: "HOOK_TOO_SHORT" } });
    telemetry.emit({ eventType: "official_ai.provider.attempt.failed", correlationId: "cycle-1", stage: "provider_registry", details: { failureCode: "HTTP_503" } });
    expect(telemetry.snapshot("cycle-1")).toEqual({
      providerModels: { "cerebras:gpt-oss-120b": 1 }, fallbacks: 1,
      invalidProviderOutputByRule: { HOOK_TOO_SHORT: 1 }, providerFailureByCause: { HTTP_503: 1 }
    });
    log.mockRestore();
  });

  it("redige segredos, payloads e dados pessoais antes da serialização", () => {
    const telemetry = new StructuredOfficialAITelemetry();
    const log = vi.spyOn(console, "log").mockImplementation(() => undefined);
    telemetry.emit({
      eventType: "test", correlationId: "cycle-sensitive", stage: "test",
      details: {
        authorization: "Bearer auth-secret",
        apiKey: "api-secret",
        token: "token-secret",
        cookie: "cookie-secret",
        prompt: "prompt completo",
        payload: "payload completo",
        email: "person@example.com",
        phone: "+55 11 99999-9999",
        cpf: "123.456.789-09"
      }
    });
    const output = String(log.mock.calls[0]?.[0]);
    expect(output).toContain("[REDACTED]");
    for (const value of ["Authorization", "Bearer", "auth-secret", "api-secret", "token-secret", "cookie-secret", "prompt completo", "payload completo", "person@example.com", "99999-9999", "123.456.789-09"]) {
      expect(output).not.toContain(value);
    }
    log.mockRestore();
  });

  it("geração inicial e regeneração instanciam a mesma política compartilhada", async () => {
    const source = await import("node:fs").then(({ readFileSync }) => readFileSync(
      "src/lib/ai/official/create-official-ai-service.ts", "utf8"
    ));
    expect(source.match(/providers:\s*new OfficialAIProviderRegistry\(/gu)).toHaveLength(2);
  });
});
