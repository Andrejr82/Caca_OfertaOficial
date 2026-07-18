const fs = require('fs');
const crypto = require('crypto');
const dotenv = require('dotenv');

const envConfig = dotenv.parse(fs.readFileSync('.env.local'));
const appId = envConfig.SHOPEE_APP_ID || process.env.SHOPEE_APP_ID;
const appSecret = envConfig.SHOPEE_APP_SECRET || process.env.SHOPEE_APP_SECRET;

const query = `
query ShopeePromotionOffers($keyword: String, $page: Int, $limit: Int, $listType: Int, $sortType: Int, $isAMSOffer: Boolean) {
  productOfferV2(
    keyword: $keyword,
    page: $page,
    limit: $limit,
    listType: $listType,
    sortType: $sortType,
    isAMSOffer: $isAMSOffer
  ) {
    nodes {
      productName
      productLink
      priceMin
      sales
      shopName
    }
  }
}`;

// Função auxiliar para embaralhar o array (shuffle)
function shuffleArray(array) {
  for (let i = array.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [array[i], array[j]] = [array[j], array[i]];
  }
  return array;
}

async function fetchCategory(categoryKeyword, pageNum) {
  const variables = { keyword: categoryKeyword, page: pageNum, limit: 3, listType: 1, sortType: 2, isAMSOffer: true };
  const requestBody = JSON.stringify({ query, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto.createHash("sha256").update(`${appId}${timestamp}${requestBody}${appSecret}`).digest("hex");

  try {
    const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST",
      headers: { "Content-Type": "application/json", "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}` },
      body: requestBody
    });
    const data = await response.json();
    return (data.data?.productOfferV2?.nodes || []).map(item => ({ ...item, category: categoryKeyword }));
  } catch(e) {
    return [];
  }
}

async function runVitrine(roundNumber) {
  console.log(`\n=== GERANDO VITRINE MISTA (RODADA ${roundNumber}) ===`);
  
  // Categorias "Silo" para garantir a mistura
  const categories = ["eletrônicos", "beleza", "cozinha", "mercado"];
  
  // Sorteia uma página baseada na rodada para garantir ofertas diferentes (ex: página 1 na rodada 1, página 2 na rodada 2)
  const pageToFetch = roundNumber; 
  console.log(`Buscando Página ${pageToFetch} de cada categoria...\n`);

  let vitrine = [];
  
  for (const cat of categories) {
    const items = await fetchCategory(cat, pageToFetch);
    vitrine = vitrine.concat(items);
  }

  // Mistura os produtos para não ficar um bloco só de eletrônicos, depois só de beleza...
  vitrine = shuffleArray(vitrine);

  // Mostra a vitrine final
  vitrine.forEach((item, index) => {
    console.log(`[${index + 1}] [${item.category.toUpperCase()}] ${item.productName.slice(0,50)}...`);
    console.log(`    Loja: ${item.shopName} | Vendas: ${item.sales} | R$ ${item.priceMin}\n`);
  });
}

async function main() {
  await runVitrine(1); // Rodada 1
  await new Promise(r => setTimeout(r, 2000));
  await runVitrine(2); // Rodada 2 (Página seguinte)
}

main();
