import "dotenv/config";
import { config as loadEnv } from "dotenv";
import { planCommercialCopyV5 } from "../src/core/ai/copy-v5-planner";
import { renderCopyV5ChannelCopy } from "../src/core/ai/copy-v5-renderer";
import type { CopyV5Facts } from "../src/core/ai/copy-v5-types";
import type { AIProviderPort, AIProviderRequest, AIProviderResponse } from "../src/core/ai/ports";
import { OfficialAIProviderRegistry } from "../src/lib/ai/official/create-official-ai-service";

loadEnv({ path: ".env.local", override: false });

type Sample = { niche: string; facts: CopyV5Facts };
type ProviderDiagnostic = {
  name: string;
  message: string;
  code?: unknown;
  status?: unknown;
  provider?: unknown;
  model?: unknown;
  timeout?: unknown;
  network?: unknown;
  retryAfterMs?: unknown;
  attempts?: unknown;
};

function sanitizeProviderError(error: unknown): ProviderDiagnostic {
  if (!(error instanceof Error)) return { name: "UnknownError", message: String(error) };
  const record = error as Error & Record<string, unknown>;
  return {
    name: error.name,
    message: error.message,
    code: record.code,
    status: record.status,
    provider: record.provider,
    model: record.model,
    timeout: record.timeout,
    network: record.network,
    retryAfterMs: record.retryAfterMs,
    attempts: record.attempts,
  };
}

function diagnosticProvider(provider: AIProviderPort, onError: (diagnostic: ProviderDiagnostic) => void): AIProviderPort {
  return {
    name: provider.name,
    model: provider.model,
    async generate(request: AIProviderRequest): Promise<AIProviderResponse> {
      try {
        return await provider.generate(request);
      } catch (error) {
        onError(sanitizeProviderError(error));
        throw error;
      }
    },
  };
}

const samples: Sample[] = [
  {
    niche: "Casa/Cozinha/Organização",
    facts: {
      productName: "2/4/8 Pcs Prendedor De Cortina Magnética Organizador Enfeite A Pronta Entrega",
      marketplace: "Shopee",
      category: "casa_cozinha_editorial",
      currentPrice: 16.99,
      originalPrice: null,
      evidence: { sales: 100, rating: 4.8, attributes: ["2/4/8 peças", "magnético"] },
    },
  },
  {
    niche: "Beleza",
    facts: {
      productName: "Kit Shampoo 300ml + Condicionador 200ml Meu Liso Restauração Intensa",
      marketplace: "Shopee",
      category: "beleza_editorial",
      currentPrice: 17.9,
      originalPrice: null,
      evidence: { sales: 1986, rating: 4.9, attributes: ["Shampoo 300ml", "Condicionador 200ml"] },
    },
  },
  {
    niche: "Informática",
    facts: {
      productName: "Teclado magnético BETTDOW para iPad 2025 A16 Gen10 Air11 (M3) Air4/5 10.9 Air6 11 M2 Pro11 2018-2022 Gen10",
      marketplace: "Shopee",
      category: "informatica_editorial",
      currentPrice: 379,
      originalPrice: null,
      evidence: { sales: 62, rating: 5, attributes: ["iPad A16/Gen10", "Air 11", "Pro 11"] },
    },
  },
  {
    niche: "Moda",
    facts: {
      productName: "Tênis Masculino Polo Vili Madri Branco Casual",
      marketplace: "Shopee",
      category: "moda_editorial",
      currentPrice: 98.55,
      originalPrice: null,
      evidence: { sales: 202, rating: 4.9, attributes: ["masculino", "branco", "casual"] },
    },
  },
  {
    niche: "Ferramentas",
    facts: {
      productName: "Parafusadeira Furadeira Sem Fio 12V Com Maleta Bateria Brocas e 13 Acessórios FP12X NKF",
      marketplace: "Shopee",
      category: "ferramentas_editorial",
      currentPrice: 94.59,
      originalPrice: null,
      evidence: { sales: 422, rating: 4.9, attributes: ["12V", "Sem fio", "Maleta", "13 acessórios"] },
    },
  },
  {
    niche: "Pet",
    facts: {
      productName: "Caixa de Areia Gatos Grande 62x50x20 Furba Jumbox Pet Injet",
      marketplace: "Shopee",
      category: "pet_editorial",
      currentPrice: 50.4,
      originalPrice: null,
      evidence: { sales: 559, rating: 4.9, attributes: ["62x50x20 cm", "Furba Jumbox"] },
    },
  },
  {
    niche: "Eletrodomésticos",
    facts: {
      productName: "Ar Condicionado Split Hi Wall Midea Airvolution Connect Inverter 12.000 Btus Frio 220V R-32",
      marketplace: "Shopee",
      category: "eletrodomesticos_editorial",
      currentPrice: 2065,
      originalPrice: null,
      evidence: { sales: 72, rating: 4.8, attributes: ["Inverter", "12.000 BTUs", "Frio", "220V", "R-32"] },
    },
  },
];

async function main() {
  const registry = new OfficialAIProviderRegistry();
  const baseProvider = registry.resolve();

  console.log(`COPY_V5_RUNTIME_VALIDATION provider=${baseProvider.name} model=${baseProvider.model}`);
  console.log("READ_ONLY=true PUBLISH=false PERSIST=false");
  console.log(`ENV LLM_PROVIDER=${process.env.LLM_PROVIDER ?? "(inferred)"} LLM_FALLBACK=${process.env.LLM_FALLBACK ?? "(none)"}`);
  console.log(`KEYS GROQ=${Boolean(process.env.GROQ_API_KEY)} GROQ_2=${Boolean(process.env.GROQ_API_KEY_2)} CEREBRAS=${Boolean(process.env.CEREBRAS_API_KEY)} CEREBRAS_2=${Boolean(process.env.CEREBRAS_API_KEY_2)}\n`);

  for (const sample of samples) {
    let outcome: Record<string, unknown> = {};
    let diagnostic: ProviderDiagnostic | null = null;
    const provider = diagnosticProvider(baseProvider, (value) => {
      diagnostic = value;
    });

    const plan = await planCommercialCopyV5(sample.facts, provider, {
      correlationId: `copy-v5-seven-niches-${sample.niche.toLowerCase().replace(/[^a-z0-9]+/g, "-")}`,
      timeoutMs: 30_000,
      metadata: { operation: "seven_niche_runtime_validation", niche: sample.niche },
      onOutcome(value) {
        outcome = { ...value };
      },
    });

    const facebook = renderCopyV5ChannelCopy(plan, sample.facts, "facebook");

    console.log(`=== ${sample.niche} ===`);
    console.log(`SOURCE=${String(outcome.source ?? "unknown")} PROVIDER=${String(outcome.provider ?? "unknown")} MODEL=${String(outcome.model ?? "unknown")} REASON=${String(outcome.reason ?? "none")}`);
    if (diagnostic) console.log(`PROVIDER_DIAGNOSTIC=${JSON.stringify(diagnostic)}`);
    console.log(JSON.stringify(plan, null, 2));
    console.log("--- FACEBOOK ---");
    console.log(facebook.feed);
    console.log();
  }
}

main().catch((error) => {
  console.error("COPY_V5_RUNTIME_VALIDATION_FAILED", JSON.stringify(sanitizeProviderError(error)));
  process.exitCode = 1;
});
