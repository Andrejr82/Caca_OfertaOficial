import { config } from "dotenv";
config({ path: ".env.local" });

const WebSocket = require("ws");
(global as any).WebSocket = WebSocket;

import { discoverAndIngestTrendingOffers } from "./src/lib/affiliates/scraper";
import { rankOffersBatch } from "./src/lib/offers/curation-engine";

async function run() {
  console.log("=== INICIANDO AUDITORIA DE PRODUÇÃO ===");
  const sources = ["Mercado Livre", "Amazon", "Shopee", "Shein", "Netshoes"];
  const limit = 10;
  
  try {
    console.log(`[1] Executando scraping nas fontes: ${sources.join(", ")}`);
    const offers = await discoverAndIngestTrendingOffers(limit, sources as any, undefined, "Geral");
    
    console.log(`\n[2] Total de produtos encontrados bruto: ${offers.length}`);
    
    console.log(`\n[3] Rodando Motor de Curadoria V2...`);
    // Passamos minColdScore como 5.0 (padrão)
    const rankedOffers = await rankOffersBatch(offers);
    
    // Filtro simulado de aprovação (threshold = 7.3) como no inngest/functions.ts
    const approved = rankedOffers.filter(o => o.score >= 7.3);
    const rejected = rankedOffers.filter(o => o.score < 7.3);
    
    console.log(`\n=== RELATÓRIO OPERACIONAL ===`);
    console.log(`Produtos Encontrados: ${offers.length}`);
    console.log(`Produtos Aprovados (Score >= 7.3): ${approved.length}`);
    console.log(`Produtos Rejeitados: ${rejected.length}`);
    
    console.log(`\n--- MOTIVOS DAS REJEIÇÕES (Amostra) ---`);
    const reasons = rejected.slice(0, 5).map(o => {
      const penalty = o.explainability?.viral_penalty || 1;
      const brand = o.explainability?.brand_score || 0;
      let reason = "Score baixo generalizado";
      if (penalty < 1) reason = `Penalidade Viral ativada (Multiplicador ${penalty})`;
      else if (brand < 5) reason = `Brand Score baixo (${brand})`;
      else if (o.score < 5) reason = `Corte Frio (Score Base < 5)`;
      return `- ${o.product_name?.substring(0, 40)}... -> Score: ${o.score.toFixed(1)} | Motivo: ${reason}`;
    });
    console.log(reasons.join("\n"));
    
    console.log(`\n--- TOP PRODUTOS APROVADOS ---`);
    approved.slice(0, 5).forEach((o, i) => {
      console.log(`${i+1}. ${o.product_name?.substring(0, 50)}...`);
      console.log(`   Score Final: ${o.score.toFixed(2)} | Preço: R$ ${o.current_price}`);
      console.log(`   Desconto Real: ${(((o.old_price! - o.current_price!) / o.old_price!) * 100).toFixed(1)}%`);
    });
    
    console.log("\n=== FIM DO TESTE DE PRODUÇÃO ===");
    process.exit(0);
  } catch (err) {
    console.error("ERRO CRÍTICO DURANTE EXECUÇÃO:");
    console.error(err);
    process.exit(1);
  }
}

run();
