import { scrapeProductDetails } from "../src/lib/affiliates/scraper";
import { config } from "dotenv";
import { resolve } from "path";

config({ path: resolve(process.cwd(), ".env.local") });

async function runTest() {
  console.log("=== INICIANDO TESTE INDIVIDUAL DA NOVA ARQUITETURA DE SCRAPING (ORACLE API) ===");
  
  try {
    console.log("\n1. Testando produto individual da Netshoes...");
    const netshoesProduct = await scrapeProductDetails("https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-6343-026");
    console.log("Produto Individual Netshoes:", JSON.stringify(netshoesProduct, null, 2));

    console.log("\n2. Testando produto individual do Mercado Livre...");
    const mlProduct = await scrapeProductDetails("https://www.mercadolivre.com.br/apple-iphone-15-128-gb-preto/p/MLB27926102"); 
    console.log("Produto Individual ML:", JSON.stringify(mlProduct, null, 2));

    console.log("\n3. Testando produto individual da Amazon...");
    const amazonProduct = await scrapeProductDetails("https://www.amazon.com.br/Apple-iPhone-13-128-GB/dp/B09V4B6KHT"); 
    console.log("Produto Individual Amazon:", JSON.stringify(amazonProduct, null, 2));

  } catch (error) {
    console.error("Erro no teste:", error);
  }
}

runTest();
