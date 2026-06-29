import * as dotenv from 'dotenv';
import * as path from 'path';
import * as fs from 'fs';
import { fileURLToPath } from 'url';
import { GroqProvider } from '../../src/core/llm/groq.js';
import { CerebrasProvider } from '../../src/core/llm/cerebras.js';
import { getScrapingPrompt } from '../../src/core/scraper/prompt.js';

// Setup env
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

// Prompts
const extractionPrompt = getScrapingPrompt("Mercado Livre");
const copySystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão. Respond in JSON.
Sua persona: Administrador eufórico de grupos de ofertas. Foco em escassez extrema e descontos.
Regras:
1. Ignore criação de links, injetaremos depois.
2. Coloque hashtags no array 'hashtags'.
3. Ignore preços monetários, injetaremos depois.
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

const mockHTML = `
  <div class="ui-search-layout__item">
    <a href="https://produto.mercadolivre.com.br/MLB-1234-notebook-gamer">
      <img class="ui-search-result-image__element" src="https://http2.mlstatic.com/D_NQ_NP_1234.webp" />
    </a>
    <h2>Notebook Gamer Acer Nitro 5 Rtx 3050 8gb 512gb Ssd W11 15.6</h2>
    <span class="price-tag-fraction">4399</span><span class="price-tag-cents">99</span>
  </div>
  <div class="ui-search-layout__item">
    <a href="https://produto.mercadolivre.com.br/MLB-5678-mouse-gamer">
      <img class="ui-search-result-image__element" src="https://http2.mlstatic.com/D_NQ_NP_5678.webp" />
    </a>
    <h2>Mouse Gamer Razer Deathadder Essential Preto</h2>
    <span class="price-tag-fraction">159</span><span class="price-tag-cents">90</span>
  </div>
`;

const mockProductForCopy = `Gerar copy para:
Nome: Smartphone Samsung Galaxy S23 Ultra 256GB 5G
Loja: Magalu

RETORNE EXATAMENTE NESTE FORMATO JSON:
{
  "strategies": [
    { "headline": "...", "hook": "...", "body": "...", "cta": "...", "score": 9.5 }
  ],
  "hashtags": ["#oferta"]
}`;

async function runBenchmark() {
  console.log("🚀 Iniciando Benchmark: Cerebras vs Groq\n");

  const groqKey = process.env.GROQ_API_KEY;
  const cerebrasKey = process.env.CEREBRAS_API_KEY;
  const cerebrasBase = process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1';

  if (!groqKey || !cerebrasKey) {
    console.error("❌ Erro: Chaves de API ausentes no .env.local.");
    console.log("GROQ_API_KEY:", groqKey ? "OK" : "MISSING");
    console.log("CEREBRAS_API_KEY:", cerebrasKey ? "OK" : "MISSING");
    process.exit(1);
  }

  const modelsToTest = [
    { provider: 'Groq', class: GroqProvider, key: groqKey, models: ['llama-3.1-8b-instant', 'llama-3.3-70b-versatile'] },
    { provider: 'Cerebras', class: CerebrasProvider, key: cerebrasKey, baseUrl: cerebrasBase, models: ['llama3.1-8b', 'llama3.1-70b', process.env.CEREBRAS_MODEL || 'gpt-oss-120b'] } // Adjust Cerebras model names if necessary
  ];

  const results: any[] = [];

  for (const providerDef of modelsToTest) {
    for (const model of providerDef.models) {
      console.log(`\n========================================`);
      console.log(`🧪 Testando Provedor: ${providerDef.provider} | Modelo: ${model}`);
      console.log(`========================================`);

      const providerInst = new providerDef.class({
        apiKey: providerDef.key,
        baseURL: providerDef.baseUrl,
        model: model,
        temperature: 0.1
      });

      try {
        // --- TEST 1: EXTRACTION ---
        console.log(`\n[Teste 1] Extração JSON (HTML -> Products)`);
        const extractStart = Date.now();
        const extractRes = await providerInst.generateJSON([
          { role: 'system', content: extractionPrompt },
          { role: 'user', content: mockHTML }
        ]);
        const extractLatency = Date.now() - extractStart;
        
        // Validate JSON
        let parsedExtraction = null;
        let extractionValid = false;
        try {
          parsedExtraction = JSON.parse(extractRes.content);
          if (parsedExtraction.products && Array.isArray(parsedExtraction.products) && parsedExtraction.products.length > 0) {
            extractionValid = true;
          }
        } catch (e) {}

        console.log(`  ⏱️ Tempo: ${extractLatency}ms | Tokens In: ${extractRes.usage?.promptTokens} | Tokens Out: ${extractRes.usage?.completionTokens}`);
        console.log(`  ✅ Válido: ${extractionValid ? "SIM" : "NÃO"}`);

        // --- TEST 2: COPYWRITING ---
        console.log(`\n[Teste 2] Geração de Copy JSON (Product -> Marketing Copy)`);
        
        const copyStart = Date.now();
        const copyRes = await providerInst.generateJSON([
          { role: 'system', content: copySystemPrompt },
          { role: 'user', content: mockProductForCopy }
        ], { temperature: 0.7 });
        const copyLatency = Date.now() - copyStart;
        
        let parsedCopy = null;
        let copyValid = false;
        try {
          parsedCopy = JSON.parse(copyRes.content);
          if (parsedCopy.strategies && Array.isArray(parsedCopy.strategies) && parsedCopy.strategies.length > 0) {
            copyValid = true;
          }
        } catch (e) {}

        console.log(`  ⏱️ Tempo: ${copyLatency}ms | Tokens In: ${copyRes.usage?.promptTokens} | Tokens Out: ${copyRes.usage?.completionTokens}`);
        console.log(`  ✅ Válido: ${copyValid ? "SIM" : "NÃO"}`);

        results.push({
          provider: providerDef.provider,
          model: model,
          extraction_latency_ms: extractLatency,
          extraction_valid: extractionValid,
          copy_latency_ms: copyLatency,
          copy_valid: copyValid,
          total_latency_ms: extractLatency + copyLatency
        });

      } catch (err: any) {
        console.error(`❌ Erro no teste (${providerDef.provider} - ${model}): ${err.message}`);
        results.push({
          provider: providerDef.provider,
          model: model,
          error: err.message
        });
      }
    }
  }

  console.log(`\n\n📊 RESUMO DO BENCHMARK 📊`);
  console.table(results);
}

runBenchmark();
