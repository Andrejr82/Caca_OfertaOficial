import { fetchTrendingProductsFromLanding, fetchAmazonTrendingProducts } from "../../src/lib/affiliates/scraper";
import { mlClient } from "../../src/lib/integrations/mercadolivre/client";
import * as dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

async function runTest() {
  console.log("=========================================");
  console.log("TESTE: MERCADO LIVRE (Bypass + Afiliado)");
  console.log("=========================================\n");
  
  const mlProducts = await fetchTrendingProductsFromLanding(5);
  console.log(`✅ ${mlProducts.length} produtos retornados do Mercado Livre.`);
  
  const mockUserId = "usuario_teste_123";
  mlProducts.forEach((p, i) => {
    const affiliateUrl = mlClient.generateAffiliateLink(p.original_url, mockUserId);
    console.log(`[${i+1}] ${p.product_name}`);
    console.log(`    URL Afiliado: ${affiliateUrl}\n`);
  });

  console.log("=========================================");
  console.log("TESTE: AMAZON (Afiliado .env.local)");
  console.log("=========================================\n");

  const amzProducts = await fetchAmazonTrendingProducts(5);
  console.log(`✅ ${amzProducts.length} produtos retornados da Amazon.`);
  
  const amazonTag = process.env.AMAZON_PARTNER_TAG || "TAG_NAO_ENCONTRADA";
  console.log(`TAG Carregada do .env.local: ${amazonTag}\n`);

  amzProducts.forEach((p, i) => {
    let finalUrl = p.original_url;
    if (amazonTag !== "TAG_NAO_ENCONTRADA") {
      try {
        const urlObj = new URL(p.original_url);
        urlObj.searchParams.set("tag", amazonTag);
        finalUrl = urlObj.toString();
      } catch (e) {}
    }
    console.log(`[${i+1}] ${p.product_name}`);
    console.log(`    URL Afiliado: ${finalUrl}\n`);
  });
}

runTest().catch(console.error);
