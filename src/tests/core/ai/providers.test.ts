import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";
import type { AIProviderPort, AIProviderRequest, OfficialAIContent } from "@/core/ai";
import { GroqOfficialAIProvider } from "@/core/ai/providers/groq-provider";
import { CerebrasOfficialAIProvider } from "@/core/ai/providers/cerebras-provider";

const content: OfficialAIContent = {
  title: "Título",
  description: "Descrição",
  shortCopy: "Copy curta",
  longCopy: "Copy longa",
  hashtags: ["#oferta"],
  callToAction: "Compre agora",
  highlights: ["Destaque"],
  explanation: "Explicação",
  channelCopies: { telegram: "Telegram", instagram: "Instagram", whatsapp: "WhatsApp" }
};

const request: AIProviderRequest = {
  prompt: { system: "system", user: "user" },
  correlationId: "correlation-1",
  timeoutMs: 5000,
  temperature: 0.4,
  maxTokens: 2000,
  metadata: { commandId: "command-1" }
};

function response(provider: "groq" | "cerebras") {
  return new Response(JSON.stringify({
    choices: [{ message: { content: JSON.stringify(content) }, finish_reason: "stop" }],
    usage: { prompt_tokens: 11, completion_tokens: 22, total_tokens: 33 },
    model: provider === "groq" ? "llama" : "gpt-oss"
  }), { status: 200, headers: { "Content-Type": "application/json" } });
}

describe.each([
  ["groq", GroqOfficialAIProvider, "https://api.groq.com/openai/v1/chat/completions"],
  ["cerebras", CerebrasOfficialAIProvider, "https://api.cerebras.ai/v1/chat/completions"]
] as const)("provider oficial %s", (name, Provider, expectedUrl) => {
  it("implementa AIProviderPort e devolve somente evidência de inferência", async () => {
    const fetcher = vi.fn().mockResolvedValue(response(name));
    const provider: AIProviderPort = new Provider({
      apiKey: "test-key",
      model: name === "groq" ? "llama" : "gpt-oss",
      fetcher
    });

    const result = await provider.generate(request);

    expect(result).toMatchObject({
      provider: name,
      content,
      latencyMs: expect.any(Number),
      finishReason: "stop",
      usage: { promptTokens: 11, completionTokens: 22, totalTokens: 33 }
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, init] = fetcher.mock.calls[0];
    expect(url).toBe(expectedUrl);
    expect(init.headers.Authorization).toBe("Bearer test-key");
    expect(JSON.parse(init.body)).toMatchObject({
      messages: [
        { role: "system", content: "system" },
        { role: "user", content: "user" }
      ],
      response_format: { type: "json_object" }
    });
  });

  it("retorna erro tipado sem fallback ou segunda chamada", async () => {
    const fetcher = vi.fn().mockResolvedValue(new Response("rate limited", { status: 429 }));
    const provider = new Provider({ apiKey: "test-key", model: "model", fetcher });

    await expect(provider.generate(request)).rejects.toThrow(`${name.toUpperCase()}_PROVIDER_ERROR:429`);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});

it("providers não importam banco, estados, posts, publicação, Oracle ou Inngest", () => {
  for (const path of [
    "src/core/ai/providers/groq-provider.ts",
    "src/core/ai/providers/cerebras-provider.ts"
  ]) {
    const source = readFileSync(path, "utf8").toLowerCase();
    for (const forbidden of ["supabase", "core/state", "posts", "publish", "oracle", "inngest", "affiliate_links"]) {
      expect(source).not.toContain(forbidden);
    }
  }
});
