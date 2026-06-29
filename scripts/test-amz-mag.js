const { crawleeExtract } = require('./oracle-scraper.cjs');
(async () => {
  console.log("=== TESTANDO AMAZON ===");
  const amz = await crawleeExtract('https://www.amazon.com.br/s?k=Sab%C3%A3o+em+p%C3%B3+Omo', 5, 'Amazon');
  console.log(amz);
  console.log("\n=== TESTANDO MAGALU ===");
  const mag = await crawleeExtract('https://www.magazineluiza.com.br/busca/Sab%C3%A3o+em+p%C3%B3+Omo/', 5, 'Magalu');
  console.log(mag);
  
  console.log("\n=== TESTANDO MERCADO LIVRE ===");
  const ml = await crawleeExtract('https://lista.mercadolivre.com.br/Sab%C3%A3o-em-p%C3%B3-Omo', 5, 'Mercado Livre');
  console.log(ml);

  process.exit(0);
})();
