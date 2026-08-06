const { createHash } = require('node:crypto');
require('dotenv').config({ path: '.env.local' });

async function testQualityGate() {
  const appId = process.env.SHOPEE_APP_ID || "";
  const appSecret = process.env.SHOPEE_APP_SECRET || "";
  if (!appId || !appSecret) {
    console.error("Missing SHOPEE_APP_ID or SHOPEE_APP_SECRET");
    return;
  }

  const query = `
    query ShopeePromotionOffers($keyword: String, $productCatId: Int, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) {
      productOfferV2(keyword: $keyword, productCatId: $productCatId, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) {
        nodes {
          itemId
          productName
          priceMin
          ratingStar
          sales
          commissionRate
          sellerCommissionRate
          priceDiscountRate
        }
      }
    }
  `;

  const variables = { keyword: "roupa", productCatId: null, page: 1, limit: 50, sortType: 1, isAMSOffer: true };
  const requestBody = JSON.stringify({ operationName: "ShopeePromotionOffers", query, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256")
    .update(`${appId}${timestamp}${requestBody}${appSecret}`)
    .digest("hex");

  try {
    const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `SHA256 Credential=${appId}, Timestamp=${timestamp}, Signature=${signature}`
      },
      body: requestBody,
      signal: AbortSignal.timeout(15000)
    });

    const data = await response.json();
    const nodes = data?.data?.productOfferV2?.nodes || [];

    let total = nodes.length;
    let passedRating = 0;
    let passedSales50 = 0;
    let passedSales10 = 0;
    let passedBoth50 = 0;
    let passedBoth10 = 0;
    let falseNegatives50 = [];
    let falseNegatives10 = [];

    console.log(`\n--- ANÁLISE DE ${total} OFERTAS ENCONTRADAS ---`);
    for (const item of nodes) {
      const rating = parseFloat(item.ratingStar || 0);
      const sales = parseInt(item.sales || 0, 10);
      
      const passR = rating >= 4.5;
      const passS50 = sales >= 50;
      const passS10 = sales >= 10;

      if (passR) passedRating++;
      if (passS50) passedSales50++;
      if (passS10) passedSales10++;

      if (passR && passS50) passedBoth50++;
      if (passR && passS10) passedBoth10++;

      if (!passR || !passS50) {
         falseNegatives50.push(`Nota: ${rating.toFixed(1)} | Vendas: ${sales.toString().padStart(4)} | Preço: R$${item.priceMin} | Produto: ${item.productName.slice(0, 45)}...`);
      }
      if (!passR || !passS10) {
         falseNegatives10.push(`Nota: ${rating.toFixed(1)} | Vendas: ${sales.toString().padStart(4)} | Preço: R$${item.priceMin} | Produto: ${item.productName.slice(0, 45)}...`);
      }
    }

    console.log(`\nRESULTADOS DO TESTE:`);
    console.log(`Total Analisado: ${total}`);
    console.log(`Passaram no Rating (>= 4.5): ${passedRating} (${Math.round((passedRating/total)*100)}%)`);
    
    console.log(`\n--- FILTRO OURO (>= 50 VENDAS) ---`);
    console.log(`Passaram nas Vendas (>= 50): ${passedSales50} (${Math.round((passedSales50/total)*100)}%)`);
    console.log(`Passaram em AMBOS (Rating + 50 Vendas): ${passedBoth50} (${Math.round((passedBoth50/total)*100)}%)`);
    console.log(`Foram DESCARTADOS: ${total - passedBoth50} (${Math.round(((total - passedBoth50)/total)*100)}%)`);

    console.log(`\n--- FILTRO FLEXÍVEL (>= 10 VENDAS) ---`);
    console.log(`Passaram nas Vendas (>= 10): ${passedSales10} (${Math.round((passedSales10/total)*100)}%)`);
    console.log(`Passaram em AMBOS (Rating + 10 Vendas): ${passedBoth10} (${Math.round((passedBoth10/total)*100)}%)`);
    console.log(`Foram DESCARTADOS: ${total - passedBoth10} (${Math.round(((total - passedBoth10)/total)*100)}%)`);

    console.log(`\nProdutos que passaram na Flexível (10), mas foram reprovados no Ouro (50):`);
    for (const item of nodes) {
      const rating = parseFloat(item.ratingStar || 0);
      const sales = parseInt(item.sales || 0, 10);
      if (rating >= 4.5 && sales >= 10 && sales < 50) {
        console.log(`> Nota: ${rating.toFixed(1)} | Vendas: ${sales.toString().padStart(4)} | Produto: ${item.productName.slice(0, 45)}...`);
      }
    }

  } catch (err) {
    console.error("Erro no teste:", err);
  }
}

testQualityGate();
