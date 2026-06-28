import * as dotenv from 'dotenv';
import { resolve } from 'path';
dotenv.config({ path: resolve(process.cwd(), '.env.local') });

// Setup paths to use Next.js aliases if possible or just use relative paths
import { discoverAndIngestTrendingOffers } from './src/lib/affiliates/scraper';

// Polyfill para Supabase em Node 20
if (typeof globalThis.WebSocket === 'undefined') {
  globalThis.WebSocket = require('ws');
}

async function run() {
  console.log("=========================================");
  console.log("🧪 INICIANDO TESTE - MERCADO LIVRE TRENDS");
  console.log("=========================================");
  try {
    const mlOffers = await discoverAndIngestTrendingOffers(5, ["Mercado Livre"]);
    console.log(`\n✅ RESULTADO ML: ${mlOffers.length} ofertas salvas/processadas.`);
    if (mlOffers.length > 0) {
      console.log(`Exemplo (ML): ${mlOffers[0].product_name} - Preço: R$ ${mlOffers[0].current_price}`);
    }
  } catch (error) {
    console.error("Erro no ML:", error);
  }

  console.log("\n=========================================");
  console.log("🧪 INICIANDO TESTE - AMAZON TRENDS");
  console.log("=========================================");
  try {
    const amzOffers = await discoverAndIngestTrendingOffers(5, ["Amazon"]);
    console.log(`\n✅ RESULTADO AMAZON: ${amzOffers.length} ofertas salvas/processadas.`);
    if (amzOffers.length > 0) {
      console.log(`Exemplo (AMZ): ${amzOffers[0].product_name} - Preço: R$ ${amzOffers[0].current_price}`);
    }
  } catch (error) {
    console.error("Erro na Amazon:", error);
  }

  console.log("\n🚀 TESTES FINALIZADOS!");
  process.exit(0);
}

run();
