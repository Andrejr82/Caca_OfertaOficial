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
      commissionRate
      sales
      shopName
    }
  }
}`;

async function runTest(sortDesc, sortVal) {
  // KEYWORD VAZIA: Queremos ver o que a API julga como o MELHOR do MELHOR geral
  const variables = { keyword: "", page: 1, limit: 10, listType: 1, sortType: sortVal, isAMSOffer: true };
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
    const nodes = data.data?.productOfferV2?.nodes || [];
    console.log(`\n--- BUSCA ABERTA (SEM PALAVRA-CHAVE) | Ordenação: ${sortDesc} ---`);
    nodes.forEach(item => console.log(`  -> ${item.productName.slice(0,50)}... | Vendas: ${item.sales} | R$ ${item.priceMin}`));
  } catch(e) {}
}

async function runAll() {
  console.log("Buscando as melhores ofertas gerais da Shopee Mall (Sem filtro de produto específico)...");
  await runTest("Comissão / Conversão", 2);
}
runAll();
