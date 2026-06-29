import * as dotenv from 'dotenv';
import * as path from 'path';
import { fileURLToPath } from 'url';
import { CerebrasProvider } from '../../src/core/llm/cerebras.js';
import { getScrapingPrompt } from '../../src/core/scraper/prompt.js';

// Setup env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

const CONCURRENT_WORKERS = 5;
const TOTAL_CALLS = 100;

const copySystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão. Respond in JSON.
Sua persona: Administrador eufórico de grupos de ofertas. Foco em escassez extrema e descontos.
Regras:
1. Ignore criação de links, injetaremos depois.
2. Coloque hashtags no array 'hashtags'.
3. Ignore preços monetários, injetaremos depois.
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

const mockProductForCopy = `Gerar copy para: Nome: Smartphone Samsung Galaxy S23 Ultra 256GB 5G Loja: Magalu
RETORNE EXATAMENTE NESTE FORMATO JSON: { "strategies": [ { "headline": "...", "hook": "...", "body": "...", "cta": "...", "score": 9.5 } ], "hashtags": ["#oferta"] }`;

async function delay(ms: number) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function runStressTest() {
  console.log(`🚀 Iniciando Stress Test CEREBRAS (Model: gpt-oss-120b)`);
  console.log(`📊 Meta: ${TOTAL_CALLS} chamadas | 🔄 Concorrência: ${CONCURRENT_WORKERS}\n`);

  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const cerebrasBase = process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';
  const modelName = process.env.CEREBRAS_MODEL || 'gpt-oss-120b';

  if (!cerebrasKey) {
    console.error("❌ Erro: Chave CEREBRAS_API_KEY ausente.");
    process.exit(1);
  }

  const provider = new CerebrasProvider({
    apiKey: cerebrasKey,
    baseURL: cerebrasBase,
    model: modelName,
    temperature: 0.7
  });

  const stats = {
    total: 0,
    success: 0,
    jsonValid: 0,
    errors429: 0,
    errors5xx: 0,
    otherErrors: 0,
    totalLatencyMs: 0
  };

  let currentIndex = 0;

  async function worker(workerId: number) {
    while (true) {
      const callIndex = currentIndex++;
      if (callIndex >= TOTAL_CALLS) break;

      const startTime = Date.now();
      try {
        const res = await provider.generateJSON([
          { role: 'system', content: copySystemPrompt },
          { role: 'user', content: mockProductForCopy }
        ]);
        
        const latency = Date.now() - startTime;
        stats.success++;
        stats.totalLatencyMs += latency;

        try {
          const parsed = JSON.parse(res.content);
          if (parsed.strategies) stats.jsonValid++;
        } catch (e) {}

        process.stdout.write('✅ ');
      } catch (err: any) {
        process.stdout.write('❌ ');
        if (err.message.includes('429')) {
          stats.errors429++;
          // Pause slightly on rate limit
          await delay(2000);
        } else if (err.message.includes('50') || err.message.includes('52')) {
          stats.errors5xx++;
        } else {
          stats.otherErrors++;
        }
      }
      stats.total++;
    }
  }

  const workers = Array.from({ length: CONCURRENT_WORKERS }).map((_, i) => worker(i));
  await Promise.all(workers);

  console.log(`\n\n🏁 STRESS TEST CONCLUÍDO`);
  console.log(`===========================================`);
  console.log(`Total de Chamadas : ${stats.total}`);
  console.log(`Sucesso (200 OK)  : ${stats.success}`);
  console.log(`JSON Consistente  : ${stats.jsonValid} (${((stats.jsonValid / Math.max(stats.success, 1)) * 100).toFixed(1)}% do sucesso)`);
  console.log(`Tempo Médio       : ${stats.success > 0 ? (stats.totalLatencyMs / stats.success).toFixed(0) : 0} ms`);
  console.log(`Erros Rate Limit (429): ${stats.errors429}`);
  console.log(`Erros Servidor (5xx)  : ${stats.errors5xx}`);
  console.log(`Outros Erros          : ${stats.otherErrors}`);
  console.log(`===========================================`);
}

runStressTest();
