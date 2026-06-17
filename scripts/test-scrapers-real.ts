import dotenv from "dotenv";
dotenv.config({ path: ".env.local" });

import { 
  fetchTrendingProductsFromLanding, 
  fetchAmazonTrendingProducts,
  fetchShopeeTrendingProducts,
  fetchSheinTrendingProducts,
  fetchMagaluTrendingProducts,
  scrapeProductDetails,
  scraperMetrics
} from "../src/lib/affiliates/scraper";

async function runTests() {
  console.log("=== INICIANDO TESTE FUNCIONAL DE PRODUÇÃO DOS SCRAPERS E TRENDS ===");
  console.log("FIRECRAWL_API_KEY:", process.env.FIRECRAWL_API_KEY ? "CONFIGURADA" : "NÃO CONFIGURADA\n");

  const results: Record<string, { trends: string; product: string }> = {
    "Mercado Livre": { trends: "Não executado", product: "Não executado" },
    "Amazon": { trends: "Não executado", product: "Não executado" },
    "Shopee": { trends: "Não executado", product: "Não testado/Mock" },
    "Shein": { trends: "Não executado", product: "Não executado" },
    "Magalu": { trends: "Não executado", product: "Não executado" }
  };

  // --- 1. MERCADO LIVRE ---
  console.log("\n--- TESTANDO MERCADO LIVRE ---");
  try {
    console.log("Buscando trends...");
    const mlTrends = await fetchTrendingProductsFromLanding(2);
    console.log(`Trends encontradas: ${mlTrends.length}`);
    if (mlTrends.length > 0) {
      console.log("- Primeiro item:", mlTrends[0].product_name, `| Preço: R$ ${mlTrends[0].current_price}`);
      results["Mercado Livre"].trends = "OK";
    } else {
      results["Mercado Livre"].trends = "Sem resultados";
    }
  } catch (error) {
    console.error("Erro no trends Mercado Livre:", error);
    results["Mercado Livre"].trends = "Erro";
  }

  try {
    const mlUrl = "https://www.mercadolivre.com.br/sony-playstation-store-gift-card-r-60-digital/p/MLB50292194";
    console.log(`Raspando produto individual (${mlUrl})...`);
    const mlProd = await scrapeProductDetails(mlUrl);
    if (mlProd) {
      console.log("- Produto raspado:", mlProd.product_name, `| Preço: R$ ${mlProd.current_price}`);
      results["Mercado Livre"].product = "OK";
    } else {
      results["Mercado Livre"].product = "Falha";
    }
  } catch (error) {
    console.error("Erro no scraper Mercado Livre:", error);
    results["Mercado Livre"].product = "Erro";
  }

  // --- 2. AMAZON ---
  console.log("\n--- TESTANDO AMAZON ---");
  try {
    console.log("Buscando trends...");
    const amazonTrends = await fetchAmazonTrendingProducts(2);
    console.log(`Trends encontradas: ${amazonTrends.length}`);
    if (amazonTrends.length > 0) {
      console.log("- Primeiro item:", amazonTrends[0].product_name, `| Preço: R$ ${amazonTrends[0].current_price}`);
      results["Amazon"].trends = "OK";
    } else {
      results["Amazon"].trends = "Sem resultados";
    }
  } catch (error) {
    console.error("Erro no trends Amazon:", error);
    results["Amazon"].trends = "Erro";
  }

  try {
    const amazonUrl = "https://www.amazon.com.br/dp/B07Y2G7VX5";
    console.log(`Raspando produto individual (${amazonUrl})...`);
    const amazonProd = await scrapeProductDetails(amazonUrl);
    if (amazonProd) {
      console.log("- Produto raspado:", amazonProd.product_name, `| Preço: R$ ${amazonProd.current_price}`);
      results["Amazon"].product = "OK";
    } else {
      results["Amazon"].product = "Falha";
    }
  } catch (error) {
    console.error("Erro no scraper Amazon:", error);
    results["Amazon"].product = "Erro";
  }

  // --- 3. SHOPEE ---
  console.log("\n--- TESTANDO SHOPEE ---");
  try {
    console.log("Buscando trends...");
    const shopeeTrends = await fetchShopeeTrendingProducts(2);
    console.log(`Trends encontradas: ${shopeeTrends.length}`);
    if (shopeeTrends.length > 0) {
      console.log("- Primeiro item:", shopeeTrends[0].product_name, `| Preço: R$ ${shopeeTrends[0].current_price}`);
      results["Shopee"].trends = "OK";
    } else {
      results["Shopee"].trends = "Sem resultados";
    }
  } catch (error) {
    console.error("Erro no trends Shopee:", error);
    results["Shopee"].trends = "Erro";
  }

  // --- 4. SHEIN ---
  console.log("\n--- TESTANDO SHEIN ---");
  try {
    console.log("Buscando trends...");
    const sheinTrends = await fetchSheinTrendingProducts(2);
    console.log(`Trends encontradas: ${sheinTrends.length}`);
    if (sheinTrends.length > 0) {
      console.log("- Primeiro item:", sheinTrends[0].product_name, `| Preço: R$ ${sheinTrends[0].current_price}`);
      results["Shein"].trends = "OK";
    } else {
      results["Shein"].trends = "Sem resultados";
    }
  } catch (error) {
    console.error("Erro no trends Shein:", error);
    results["Shein"].trends = "Erro";
  }

  try {
    // Usando uma URL de mochila escolar infantil na Shein
    const sheinUrl = "https://br.shein.com/Dazy-Minimalist-Solid-Flap-Detail-Backpack-p-11101901.html";
    console.log(`Raspando produto individual (${sheinUrl})...`);
    const sheinProd = await scrapeProductDetails(sheinUrl);
    if (sheinProd) {
      console.log("- Produto raspado:", sheinProd.product_name, `| Preço: R$ ${sheinProd.current_price}`);
      results["Shein"].product = "OK";
    } else {
      results["Shein"].product = "Falha";
    }
  } catch (error) {
    console.error("Erro no scraper Shein:", error);
    results["Shein"].product = "Erro";
  }

  // --- 5. MAGALU ---
  console.log("\n--- TESTANDO MAGALU ---");
  try {
    console.log("Buscando trends...");
    const magaluTrends = await fetchMagaluTrendingProducts(2);
    console.log(`Trends encontradas: ${magaluTrends.length}`);
    if (magaluTrends.length > 0) {
      console.log("- Primeiro item:", magaluTrends[0].product_name, `| Preço: R$ ${magaluTrends[0].current_price}`);
      results["Magalu"].trends = "OK";
    } else {
      results["Magalu"].trends = "Sem resultados";
    }
  } catch (error) {
    console.error("Erro no trends Magalu:", error);
    results["Magalu"].trends = "Erro";
  }

  try {
    const magaluUrl = "https://www.magazineluiza.com.br/smartphone-samsung-galaxy-a15-4g-128gb-azul-escuro-4gb-ram-65-cam-tripla-50mp-selfie-13mp-bateria-5000mah/p/237930800/te/ga15/";
    console.log(`Raspando produto individual (${magaluUrl})...`);
    const magaluProd = await scrapeProductDetails(magaluUrl);
    if (magaluProd) {
      console.log("- Produto raspado:", magaluProd.product_name, `| Preço: R$ ${magaluProd.current_price}`);
      results["Magalu"].product = "OK";
    } else {
      results["Magalu"].product = "Falha";
    }
  } catch (error) {
    console.error("Erro no scraper Magalu:", error);
    results["Magalu"].product = "Erro";
  }

  console.log("\n=== RESULTADO FINAL DOS TESTES ===");
  console.table(results);

  console.log("\n=== MÉTRICAS DOS SCRAPERS EM MEMÓRIA ===");
  console.table(scraperMetrics);
}

runTests();
