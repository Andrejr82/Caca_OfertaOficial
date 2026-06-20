import { config } from "dotenv";
config({ path: ".env.local" });

import { fetchTrendingProductsFromLanding, fetchShopeeTrendingProducts } from "@/lib/affiliates/scraper";

async function runTest() {
  console.log("=== TESTANDO FETCH ML ===");
  try {
    const ml = await fetchTrendingProductsFromLanding(2, "Games");
    console.log(ml.map(p => ({ n: p.product_name, c: p.category, s: p.subcategory })));
    
    console.log("=== TESTANDO FETCH SHOPEE (GERAL) ===");
    // Quando passamos indefinido ou "Geral", ele usa a roleta no scraper principal,
    // mas chamando o fetch individual, sem categoria ele usa a página padrão de deals.
    const shopee = await fetchShopeeTrendingProducts(2);
    console.log(shopee.map(p => ({ n: p.product_name, c: p.category, s: p.subcategory })));
  } catch (error) {
    console.error("ERRO:", error);
  }
}

runTest();
