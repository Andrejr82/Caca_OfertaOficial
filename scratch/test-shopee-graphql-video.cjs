const { createHash } = require('node:crypto');
const fetch = require('node-fetch');
require('dotenv').config({ path: '.env.local' });

const APP_ID = process.env.SHOPEE_APP_ID || "";
const APP_SECRET = process.env.SHOPEE_APP_SECRET || "";

async function shopeeRequest(operationName, query, variables) {
  const requestBody = JSON.stringify({ operationName, query, variables });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = createHash("sha256")
    .update(`${APP_ID}${timestamp}${requestBody}${APP_SECRET}`)
    .digest("hex");

  const response = await fetch("https://open-api.affiliate.shopee.com.br/graphql", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `SHA256 Credential=${APP_ID}, Timestamp=${timestamp}, Signature=${signature}`
    },
    body: requestBody
  });

  return response.json();
}

async function run() {
  const query = `
    query ShopeePromotionOffers($itemId: Float) {
      productOfferV2(itemId: $itemId, page: 1, limit: 1) {
        nodes {
          itemId
          productName
          imageUrl
          # Let's test possible video fields
          # videoUrl
          # video
        }
      }
    }
  `;
  
  // Actually, let's just do an introspection query to see what fields exist on productOfferV2 node!
  const introspectionQuery = `
    query IntrospectionQuery {
      __type(name: "ProductOfferV2Node") {
        name
        fields {
          name
          type {
            name
            kind
          }
        }
      }
    }
  `;

  try {
    console.log("Checking Introspection...");
    const res = await shopeeRequest("IntrospectionQuery", introspectionQuery, {});
    console.log(JSON.stringify(res, null, 2));
  } catch (err) {
    console.error(err);
  }
}

run();
