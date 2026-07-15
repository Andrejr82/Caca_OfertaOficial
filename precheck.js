require('dotenv').config({ path: '.env.local' });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

async function query(table, select, filterStr) {
  const res = await fetch(`${url}/rest/v1/${table}?select=${encodeURIComponent(select)}&${filterStr}`, {
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`
    }
  });
  if (!res.ok) {
    const text = await res.text();
    console.error('Error fetching', table, res.status, text);
    return [];
  }
  return res.json();
}

async function runCheck() {
  console.log('--- PRECHECK: DUPLICATAS ---');

  // Shopee
  let shopee = await query('offers', 'user_id,platform,shopee_item_id', 'platform=eq.Shopee&shopee_item_id=not.is.null');
  let shopeeGroups = findDuplicates(shopee, (o) => `${o.user_id}_${o.shopee_item_id}`);
  console.log(`Shopee com shopee_item_id: ${shopee?.length || 0}. Duplicados: ${Object.keys(shopeeGroups).length}`);

  // Mercado Livre - item_id
  let mlItem = await query('offers', 'user_id,platform,item_id', 'platform=eq.Mercado%20Livre&item_id=not.is.null');
  let mlItemGroups = findDuplicates(mlItem, (o) => `${o.user_id}_${o.item_id}`);
  console.log(`ML com item_id: ${mlItem?.length || 0}. Duplicados: ${Object.keys(mlItemGroups).length}`);

  // Mercado Livre - product_id
  let mlProduct = await query('offers', 'user_id,platform,product_id', 'platform=eq.Mercado%20Livre&product_id=not.is.null');
  let mlProductGroups = findDuplicates(mlProduct, (o) => `${o.user_id}_${o.product_id}`);
  console.log(`ML com product_id: ${mlProduct?.length || 0}. Duplicados: ${Object.keys(mlProductGroups).length}`);

  // Amazon - product_id
  let amzProduct = await query('offers', 'user_id,platform,product_id', 'platform=eq.Amazon&product_id=not.is.null');
  let amzProductGroups = findDuplicates(amzProduct, (o) => `${o.user_id}_${o.product_id}`);
  console.log(`Amazon com product_id (ASIN): ${amzProduct?.length || 0}. Duplicados: ${Object.keys(amzProductGroups).length}`);

  // Amazon - legacy (product_id is null)
  let amzLegacy = await query('offers', 'user_id,platform,original_url', 'platform=eq.Amazon&product_id=is.null&original_url=not.is.null');
  let amzLegacyGroups = findDuplicates(amzLegacy, (o) => `${o.user_id}_${o.original_url}`);
  console.log(`Amazon sem product_id: ${amzLegacy?.length || 0}. Duplicados: ${Object.keys(amzLegacyGroups).length}`);
}

function findDuplicates(data, keyFn) {
  if (!data) return {};
  const counts = {};
  for (const item of data) {
    const k = keyFn(item);
    counts[k] = (counts[k] || 0) + 1;
  }
  const duplicates = {};
  for (const k in counts) {
    if (counts[k] > 1) {
      duplicates[k] = counts[k];
    }
  }
  return duplicates;
}

runCheck();
