import { config } from "dotenv";
config({ path: ".env.local" });

import { createClient } from "@supabase/supabase-js";

const WebSocket = require("ws");
(global as any).WebSocket = WebSocket;

async function run() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  
  if (!url || !serviceKey) {
    console.error("Faltam variáveis do Supabase.");
    process.exit(1);
  }
  
  const supabase = createClient(url, serviceKey);
  
  const { data: offers, error } = await supabase.from("offers").select("*");
  if (error) {
    console.error("Erro ao buscar ofertas:", error);
    process.exit(1);
  }
  
  console.log(`Total de ofertas no banco: ${offers?.length || 0}`);
  
  if (!offers || offers.length === 0) {
    console.log("Nenhuma oferta encontrada para auditar.");
    process.exit(0);
  }
  
  let legacyCount = 0;
  let newOffers: any[] = [];
  
  // A implantação ocorreu há poucos dias. A assinatura do novo motor é ter viral_penalty e brand_score na explainability.
  offers.forEach(o => {
    const isNew = o.explainability && typeof o.explainability.viral_penalty !== "undefined";
    if (isNew) {
      newOffers.push(o);
    } else {
      legacyCount++;
    }
  });

  let approved = 0;
  let rejected = 0;
  const scores = { '0-5': 0, '5-6': 0, '6-7': 0, '7-8': 0, '8-9': 0, '9-10': 0 };
  const categories: Record<string, number> = {};
  const brands: Record<string, number> = {};
  const words: Record<string, number> = {};
  const sources: Record<string, number> = {};
  
  newOffers.forEach(o => {
    const score = o.score || 0;
    if (score >= 7.3) approved++;
    else rejected++;
    
    if (score < 5) scores['0-5']++;
    else if (score < 6) scores['5-6']++;
    else if (score < 7) scores['6-7']++;
    else if (score < 8) scores['7-8']++;
    else if (score < 9) scores['8-9']++;
    else scores['9-10']++;
    
    if (score >= 7.3) {
      const cat = o.category || 'Sem Categoria';
      categories[cat] = (categories[cat] || 0) + 1;
      
      const source = o.source || 'Desconhecido';
      sources[source] = (sources[source] || 0) + 1;
      
      let brand = 'Desconhecida';
      if (o.explainability) {
        if (o.explainability.brand_score >= 9) brand = "Tier S (Premium)";
        else if (o.explainability.brand_score >= 7) brand = "Tier A (Famosa)";
        else if (o.explainability.brand_score >= 4) brand = "Tier B (Conhecida)";
      }
      brands[brand] = (brands[brand] || 0) + 1;
      
      if (o.product_name) {
        const titleWords = o.product_name.toLowerCase().split(/\s+/).filter((w: string) => w.length > 3);
        titleWords.forEach((w: string) => words[w] = (words[w] || 0) + 1);
      }
    }
  });
  
  console.log(`\n=== RELATÓRIO QUANTITATIVO (APENAS MOTOR FASES 1 e 2) ===`);
  console.log(`Ofertas Legado (Modelo Antigo): ${legacyCount}`);
  console.log(`Total Raspado/Armazenado (Novo Motor): ${newOffers.length}`);
  
  if (newOffers.length > 0) {
    console.log(`Total Aprovado (>= 7.3): ${approved}`);
    console.log(`Total Rejeitado (< 7.3): ${rejected}`);
    console.log(`Percentual de Aprovação: ${((approved / newOffers.length) * 100).toFixed(1)}%`);
    
    console.log(`\n--- Distribuição de Scores (Novo Motor) ---`);
    console.log(scores);
    
    console.log(`\n--- Top Categorias Aprovadas ---`);
    console.log(Object.entries(categories).sort((a,b) => b[1] - a[1]).slice(0, 5));
    
    console.log(`\n--- Fontes das Aprovadas ---`);
    console.log(Object.entries(sources).sort((a,b) => b[1] - a[1]).slice(0, 5));
    
    console.log(`\n--- Marcas Aprovadas (por Brand Score) ---`);
    console.log(Object.entries(brands).sort((a,b) => b[1] - a[1]).slice(0, 5));
    
    console.log(`\n--- Top Palavras Recorrentes ---`);
    console.log(Object.entries(words).sort((a,b) => b[1] - a[1]).slice(0, 10));
  }
}

run();
