import 'dotenv/config';
import { resolveMarketplaceUrl } from './src/lib/publish/express-url-resolver.js';
import { extractMLId, generateMLAffiliateLinkWithId, validateAffiliateMonetization, fetchMLProductDetails } from './src/lib/platforms/mercadolivre.js';
import * as cheerio from 'cheerio';

const testLinks = [
  "https://produto.mercadolivre.com.br/MLB-4512903734-iphone-15-pro-max-256-gb-titnio-natural-_JM",
  "https://s.shopee.com.br/7AcDy9IMDA",
  "https://meli.la/1uQ6YYf"
];

const ML_AFFILIATE_ID = process.env.MERCADO_LIVRE_AFFILIATE_ID || "cacaofertaoficial";
const userId = "test-user-id";

function extractShopeeIds(url: string) {
  const match1 = url.match(/shopee\.com\.br\/.*?i\.(\d+)\.(\d+)/);
  if (match1) return { shopId: match1[1], itemId: match1[2] };
  const match2 = url.match(/shopee\.com\.br\/product\/(\d+)\/(\d+)/);
  if (match2) return { shopId: match2[1], itemId: match2[2] };
  return { shopId: undefined, itemId: undefined };
}

async function run() {
  console.log("| Link | Erro | ID Sel. | Orig ID | Identity Source |");
  console.log("|---|---|---|---|---|");

  for (const link of testLinks) {
    try {
      const res = await resolveMarketplaceUrl(link);
      console.log(`| ${link.split('/').pop()} | ${res.errorCode || "OK"} | ${res.selectedItemId || "NONE"} | ${res.originalItemId || "NONE"} | ${res.identitySource || "NONE"} |`);
    } catch (e: any) {
      console.log(`| ${link.split('/').pop()} | ERROR | NONE | NONE | NONE |`);
    }
  }
}

run();
