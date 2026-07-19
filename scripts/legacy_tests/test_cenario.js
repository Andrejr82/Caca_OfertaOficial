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

async function fetchTopItemForKeyword(keyword) {
  const variables = { keyword: keyword, page: 1, limit: 1, listType: 1, sortType: 2, isAMSOffer: true };
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
    return nodes.length > 0 ? { ...nodes[0], searchKeyword: keyword } : null;
  } catch(e) {
    return null;
  }
}

async function runScenario(scenarioName, keywordsList) {
  console.log(`\n======================================================`);
  console.log(`🎯 CENÁRIO: "${scenarioName}"`);
  console.log(`======================================================`);
  
  let results = [];
  
  for (const keyword of keywordsList) {
    const item = await fetchTopItemForKeyword(keyword);
    if (item) {
      results.push(item);
    }
  }

  results.forEach((item) => {
    console.log(`\n📌 Buscamos por: "${item.searchKeyword.toUpperCase()}"`);
    console.log(`   Produto: ${item.productName.slice(0, 70)}...`);
    console.log(`   Loja: ${item.shopName} (Oficial) | 🛒 Vendas: ${item.sales} | 💰 R$ ${item.priceMin}`);
  });
}

async function main() {
  const casamento = [
    "jogo de panelas antiaderente",
    "jogo de lençol algodão",
    "faqueiro aço inox",
    "aparelho de jantar porcelana",
    "jogo de taças",
    "toalha de banho fio penteado"
  ];
  
  const morandoSozinho = [
    "air fryer",
    "mop giratório",
    "jogo de potes herméticos",
    "sanduicheira elétrica",
    "chaleira elétrica"
  ];

  const maePrimeiraViagem = [
    "fralda descartável atacado",
    "lenço umedecido atacado",
    "pomada assadura",
    "mamadeira",
    "babá eletrônica"
  ];

  const donoDePet = [
    "tapete higiênico cachorro",
    "ração premium",
    "tira pelos pet",
    "bebedouro fonte gato"
  ];

  await runScenario("💍 ENXOVAL DE CASAMENTO (O Essencial e Elegante)", casamento);
  await new Promise(r => setTimeout(r, 2000));
  
  await runScenario("📦 KIT MORANDO SOZINHO (Praticidade Máxima)", morandoSozinho);
  await new Promise(r => setTimeout(r, 2000));
  
  await runScenario("👶 MÃE DE PRIMEIRA VIAGEM (O Básico do Bebê)", maePrimeiraViagem);
  await new Promise(r => setTimeout(r, 2000));
  
  await runScenario("🐾 DONO DE PET (Necessidades Diárias)", donoDePet);
}

main();
