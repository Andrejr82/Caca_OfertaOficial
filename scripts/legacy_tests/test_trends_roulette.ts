import * as dotenv from 'dotenv';
import path from 'path';
dotenv.config({ path: path.resolve(__dirname, '../../.env.local') });

import { MAIN_CATEGORY_NAMES } from "../../src/lib/offers/category-taxonomy";
import { fetchTrendingProductsFromLanding, fetchAmazonTrendingProducts } from "../../src/lib/affiliates/scraper";

async function runTest() {
  console.log("=== TESTE DE ROLETA DE CATEGORIAS ===\n");

  const randomIndex = Math.floor(Math.random() * MAIN_CATEGORY_NAMES.length);
  const activeCategorySearch = MAIN_CATEGORY_NAMES[randomIndex];
  
  console.log(`🎲 Categoria sorteada para a busca: [ ${activeCategorySearch} ]\n`);

  console.log("⏳ Buscando no Mercado Livre...");
  const mlProducts = await fetchTrendingProductsFromLanding(2, activeCategorySearch);
  console.log(`✅ Retornou ${mlProducts.length} produtos do ML:`);
  mlProducts.forEach(p => console.log(`  - ${p.product_name} (Categoria: ${p.category})`));

  console.log("\n⏳ Buscando na Amazon...");
  const amzProducts = await fetchAmazonTrendingProducts(2, activeCategorySearch);
  console.log(`✅ Retornou ${amzProducts.length} produtos da Amazon:`);
  amzProducts.forEach(p => console.log(`  - ${p.product_name} (Categoria: ${p.category})`));
}

runTest().catch(console.error);
