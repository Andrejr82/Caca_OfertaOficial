import dotenv from "dotenv";
import path from "path";

// Carrega as variáveis do arquivo .env.local
dotenv.config({ path: path.resolve(process.cwd(), ".env.local") });

import {
  fetchTrendingProductsFromLanding,
  fetchShopeeTrendingProducts,
  fetchSheinTrendingProducts,
  fetchMagaluTrendingProducts,
  fetchAmazonTrendingProducts
} from "../src/lib/affiliates/scraper";

async function runTest() {
  console.log("=== INICIANDO TESTE DOS MARKETPLACES ===");
  console.log(`FIRECRAWL_API_KEY: ${process.env.FIRECRAWL_API_KEY ? "Configurada" : "Ausente"}`);
  console.log("-----------------------------------------");

  const results: Record<string, any> = {};

  // 1. Mercado Livre
  try {
    console.log("\n[1/5] Testando Mercado Livre...");
    const start = Date.now();
    const mlProducts = await fetchTrendingProductsFromLanding(5);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Mercado Livre concluído em ${duration}s. Retornou ${mlProducts.length} produtos.`);
    results["Mercado Livre"] = { ok: true, products: mlProducts, duration };
  } catch (err: any) {
    console.error("❌ Erro no Mercado Livre:", err.message || err);
    results["Mercado Livre"] = { ok: false, error: err.message || String(err) };
  }

  // 2. Amazon
  try {
    console.log("\n[2/5] Testando Amazon...");
    const start = Date.now();
    const amzProducts = await fetchAmazonTrendingProducts(5);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Amazon concluída em ${duration}s. Retornou ${amzProducts.length} produtos.`);
    results["Amazon"] = { ok: true, products: amzProducts, duration };
  } catch (err: any) {
    console.error("❌ Erro na Amazon:", err.message || err);
    results["Amazon"] = { ok: false, error: err.message || String(err) };
  }

  // 3. Shopee
  try {
    console.log("\n[3/5] Testando Shopee...");
    const start = Date.now();
    const shopeeProducts = await fetchShopeeTrendingProducts(5);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Shopee concluída em ${duration}s. Retornou ${shopeeProducts.length} produtos.`);
    results["Shopee"] = { ok: true, products: shopeeProducts, duration };
  } catch (err: any) {
    console.error("❌ Erro na Shopee:", err.message || err);
    results["Shopee"] = { ok: false, error: err.message || String(err) };
  }

  // 4. Magalu
  try {
    console.log("\n[4/5] Testando Magalu...");
    const start = Date.now();
    const magaluProducts = await fetchMagaluTrendingProducts(5);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Magalu concluída em ${duration}s. Retornou ${magaluProducts.length} produtos.`);
    results["Magalu"] = { ok: true, products: magaluProducts, duration };
  } catch (err: any) {
    console.error("❌ Erro na Magalu:", err.message || err);
    results["Magalu"] = { ok: false, error: err.message || String(err) };
  }

  // 5. Shein
  try {
    console.log("\n[5/5] Testando Shein...");
    const start = Date.now();
    const sheinProducts = await fetchSheinTrendingProducts(5);
    const duration = ((Date.now() - start) / 1000).toFixed(2);
    console.log(`✅ Shein concluída em ${duration}s. Retornou ${sheinProducts.length} produtos.`);
    results["Shein"] = { ok: true, products: sheinProducts, duration };
  } catch (err: any) {
    console.error("❌ Erro na Shein:", err.message || err);
    results["Shein"] = { ok: false, error: err.message || String(err) };
  }

  console.log("\n=========================================");
  console.log("=== RESUMO DOS RESULTADOS DO TESTE ===");
  console.log("=========================================");
  for (const [mp, data] of Object.entries(results)) {
    if (data.ok) {
      console.log(`\n🔹 ${mp} (Sucesso em ${data.duration}s, encontrados ${data.products.length} de 5):`);
      data.products.forEach((p: any, i: number) => {
        console.log(`  ${i+1}. [R$ ${p.current_price}] ${p.product_name.slice(0, 60)}...`);
        console.log(`     Link: ${p.original_url.slice(0, 90)}`);
        console.log(`     Imagem: ${p.image_url ? "Sim (" + p.image_url.slice(0, 50) + "...)" : "Não"}`);
      });
    } else {
      console.log(`\n❌ ${mp} (Falhou):`);
      console.log(`  Erro: ${data.error}`);
    }
  }
}

runTest();
