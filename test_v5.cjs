const shopeeScraper = require('./scripts/oracle-scraper.cjs');

async function test() {
  console.log("Iniciando Oracle V5 - Modo Dry Run...");
  const result = await shopeeScraper.executeShopeeNativeDiscoveryV5({ dryRun: true });
  console.log("\n================ RESULTADO FINAL ================\n");
  
  result.categories.forEach(cat => {
    console.log(`CENÁRIO ATIVO: ${cat.name}`);
    console.log(`Candidatos Extraídos: ${cat.products.length}\n`);
    
    cat.products.forEach(p => {
      console.log(`- Produto: ${p.productName}`);
      console.log(`  Preço: R$ ${p.price}`);
      console.log(`  Comissão: ${p.commissionRate}%`);
      console.log(`  Link: ${p.offerLink}`);
      console.log(`  Score Interno V5: ${p.score}\n`);
    });
  });
}

test().catch(console.error);
