# discover-shopee-openapi.ps1
# Executar na raiz do projeto:
# pwsh -ExecutionPolicy Bypass -File .\discover-shopee-openapi.ps1

$ErrorActionPreference = "Continue"

Write-Host "`n=== SHOPEE OPEN API DISCOVERY ==="

if (!(Test-Path ".env.local")) {
    Write-Host "❌ .env.local não encontrado."
    exit 1
}

if (!(Test-Path ".\reports")) {
    New-Item -ItemType Directory -Path ".\reports" | Out-Null
}

$script = @'
require("dotenv").config({ path: ".env.local" });

const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");

const APP_ID = process.env.SHOPEE_APP_ID || "";
const APP_SECRET = process.env.SHOPEE_APP_SECRET || "";
const API_URL = "https://open-api.affiliate.shopee.com.br/graphql";

if (!APP_ID || !APP_SECRET) {
  console.error("❌ Faltam SHOPEE_APP_ID ou SHOPEE_APP_SECRET no .env.local");
  process.exit(1);
}

function sign(payload) {
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHmac("sha256", APP_SECRET)
    .update(`${APP_ID}${timestamp}${payload}${APP_SECRET}`)
    .digest("hex");

  return {
    timestamp,
    authorization: `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
  };
}

async function callShopee(operationName, query, variables) {
  const payload = JSON.stringify({ operationName, query, variables });
  const auth = sign(payload);

  try {
    const res = await axios.post(API_URL, payload, {
      headers: {
        "Content-Type": "application/json",
        "Authorization": auth.authorization
      },
      timeout: 30000
    });

    return {
      ok: true,
      status: res.status,
      data: res.data
    };
  } catch (err) {
    return {
      ok: false,
      status: err.response?.status || null,
      error: err.message,
      data: err.response?.data || null
    };
  }
}

async function testProductOffer(sortType, keyword = "fone bluetooth", limit = 20, page = 1) {
  return callShopee(
    "ShopeeProductOfferSearch",
    `query ShopeeProductOfferSearch($keyword: String, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) {
      productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) {
        nodes {
          itemId
          shopId
          productName
          productLink
          imageUrl
          priceMin
          priceMax
          priceDiscountRate
          commissionRate
          sellerCommissionRate
          shopeeCommissionRate
          ratingStar
          sales
          shopName
        }
      }
    }`,
    { keyword, page, limit, sortType, isAMSOffer: false }
  );
}

async function testShopOffer(limit = 20, page = 1) {
  return callShopee(
    "ShopeeShopOfferSearch",
    `query ShopeeShopOfferSearch($page: Int, $limit: Int) {
      shopOfferV2(page: $page, limit: $limit) {
        nodes {
          shopId
          shopName
          shopLink
          imageUrl
          commissionRate
          sellerCommissionRate
        }
      }
    }`,
    { page, limit }
  );
}

async function testCampaignOffer(limit = 20, page = 1) {
  return callShopee(
    "ShopeeCampaignOfferSearch",
    `query ShopeeCampaignOfferSearch($page: Int, $limit: Int) {
      campaignOfferV2(page: $page, limit: $limit) {
        nodes {
          offerName
          offerLink
          imageUrl
          commissionRate
          periodStartTime
          periodEndTime
        }
      }
    }`,
    { page, limit }
  );
}

async function testFeed() {
  return callShopee(
    "ShopeeItemFeeds",
    `query ShopeeItemFeeds($feedType: String) {
      listItemFeeds(feedType: $feedType) {
        nodes {
          feedType
          downloadUrl
          updateTime
        }
      }
    }`,
    { feedType: "FULL" }
  );
}

function countNodes(result, path) {
  try {
    return path.split(".").reduce((acc, key) => acc?.[key], result.data)?.nodes?.length ?? 0;
  } catch {
    return 0;
  }
}

(async () => {
  const report = {
    generatedAt: new Date().toISOString(),
    apiUrl: API_URL,
    credentials: {
      SHOPEE_APP_ID: "CONFIGURADO",
      SHOPEE_APP_SECRET: "CONFIGURADO"
    },
    productOfferV2: [],
    shopOfferV2: null,
    campaignOfferV2: null,
    listItemFeeds: null,
    conclusion: {}
  };

  console.log("\n=== TESTANDO productOfferV2 sortTypes ===");

  for (const sortType of [1,2,3,4,5,6,7,8,9,10]) {
    const result = await testProductOffer(sortType);
    const nodes = countNodes(result, "data.productOfferV2");
    report.productOfferV2.push({ sortType, ok: result.ok, status: result.status, nodes, error: result.error || null, sample: result.data?.data?.productOfferV2?.nodes?.[0] || null });
    console.log(`sortType=${sortType} | ok=${result.ok} | status=${result.status} | produtos=${nodes}`);
  }

  console.log("\n=== TESTANDO paginação productOfferV2 ===");

  for (const page of [1,2,3]) {
    const result = await testProductOffer(2, "fone bluetooth", 20, page);
    const nodes = countNodes(result, "data.productOfferV2");
    console.log(`page=${page} | ok=${result.ok} | produtos=${nodes}`);
  }

  console.log("\n=== TESTANDO limites productOfferV2 ===");

  for (const limit of [10,20,50,100]) {
    const result = await testProductOffer(2, "fone bluetooth", limit, 1);
    const nodes = countNodes(result, "data.productOfferV2");
    console.log(`limit=${limit} | ok=${result.ok} | produtos=${nodes}`);
  }

  console.log("\n=== TESTANDO shopOfferV2 ===");
  const shop = await testShopOffer();
  report.shopOfferV2 = {
    ok: shop.ok,
    status: shop.status,
    nodes: countNodes(shop, "data.shopOfferV2"),
    error: shop.error || null,
    sample: shop.data?.data?.shopOfferV2?.nodes?.[0] || null,
    rawError: shop.ok ? null : shop.data
  };
  console.log(`shopOfferV2 | ok=${shop.ok} | status=${shop.status} | lojas=${report.shopOfferV2.nodes}`);

  console.log("\n=== TESTANDO campaignOfferV2 ===");
  const campaign = await testCampaignOffer();
  report.campaignOfferV2 = {
    ok: campaign.ok,
    status: campaign.status,
    nodes: countNodes(campaign, "data.campaignOfferV2"),
    error: campaign.error || null,
    sample: campaign.data?.data?.campaignOfferV2?.nodes?.[0] || null,
    rawError: campaign.ok ? null : campaign.data
  };
  console.log(`campaignOfferV2 | ok=${campaign.ok} | status=${campaign.status} | campanhas=${report.campaignOfferV2.nodes}`);

  console.log("\n=== TESTANDO listItemFeeds ===");
  const feed = await testFeed();
  report.listItemFeeds = {
    ok: feed.ok,
    status: feed.status,
    nodes: countNodes(feed, "data.listItemFeeds"),
    error: feed.error || null,
    sample: feed.data?.data?.listItemFeeds?.nodes?.[0] || null,
    rawError: feed.ok ? null : feed.data
  };
  console.log(`listItemFeeds | ok=${feed.ok} | status=${feed.status} | feeds=${report.listItemFeeds.nodes}`);

  report.conclusion = {
    productOfferV2Available: report.productOfferV2.some(x => x.ok && x.nodes > 0),
    workingSortTypes: report.productOfferV2.filter(x => x.ok && x.nodes > 0).map(x => x.sortType),
    shopOfferV2Available: report.shopOfferV2.ok && report.shopOfferV2.nodes > 0,
    campaignOfferV2Available: report.campaignOfferV2.ok && report.campaignOfferV2.nodes > 0,
    listItemFeedsAvailable: report.listItemFeeds.ok && report.listItemFeeds.nodes > 0
  };

  fs.writeFileSync("reports/shopee_openapi_capabilities.json", JSON.stringify(report, null, 2), "utf8");

  console.log("\n=== CONCLUSÃO ===");
  console.log(report.conclusion);
  console.log("\nArquivo gerado:");
  console.log("reports/shopee_openapi_capabilities.json");
})();
'@

Set-Content -Path ".\tmp-discover-shopee-openapi.cjs" -Value $script -Encoding UTF8

node .\tmp-discover-shopee-openapi.cjs

Remove-Item .\tmp-discover-shopee-openapi.cjs -Force

Write-Host "`n=== FINALIZADO ==="
Write-Host "Envie o conteúdo/resumo de:"
Write-Host "reports/shopee_openapi_capabilities.json"