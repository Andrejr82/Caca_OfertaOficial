const { createHash } = require('node:crypto');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const APP_ID = process.env.SHOPEE_APP_ID || "";
const APP_SECRET = process.env.SHOPEE_APP_SECRET || "";

function getSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Missing Supabase configuration');
  return createClient(url, key, { auth: { persistSession: false } });
}

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
    body: requestBody,
    signal: AbortSignal.timeout(30000)
  });

  if (!response.ok) {
    throw new Error(`Shopee API error: ${response.status} ${response.statusText}`);
  }

  return response.json();
}

async function syncShopeeFeed() {
  console.log("Iniciando Sincronização do Data Feed da Shopee (DELTA)...");
  
  if (!APP_ID || !APP_SECRET) {
    console.error("ERRO: Credenciais da Shopee não configuradas.");
    return;
  }

  const supabase = getSupabase();

  try {
    // 1. Obter o ID do Feed DELTA do dia
    const feedQuery = `
      query GetListItemFeeds {
        listItemFeeds(feedMode: DELTA) {
          feeds {
            datafeedId
            datafeedName
            totalCount
          }
        }
      }
    `;

    const feedRes = await shopeeRequest("GetListItemFeeds", feedQuery, {});
    const feeds = feedRes?.data?.listItemFeeds?.feeds || [];
    
    if (feeds.length === 0) {
      console.log("Nenhum feed DELTA disponível hoje.");
      return;
    }

    const todayFeed = feeds[0]; // Geralmente o primeiro é o mais relevante
    console.log(`Feed encontrado: ${todayFeed.datafeedId} - ${todayFeed.totalCount} itens.`);

    // 2. Criar uma Run de Descoberta (Discovery Run)
    const tenantId = process.env.ADMIN_TENANT_ID || "00000000-0000-0000-0000-000000000000";
    const { data: run, error: runError } = await supabase.from('discovery_runs').insert({
      user_id: tenantId,
      marketplace: 'Shopee',
      keyword: `FEED_DELTA_${todayFeed.datafeedId}`,
      run_status: 'running',
      results_count: 0
    }).select('id').single();

    if (runError) throw runError;
    const runId = run.id;

    let offset = 0;
    const limit = 500;
    let hasMore = true;
    let totalProcessed = 0;
    let totalSaved = 0;

    const dataQuery = `
      query GetItemFeedData($datafeedId: String!, $offset: Int, $limit: Int) {
        getItemFeedData(datafeedId: $datafeedId, offset: $offset, limit: $limit) {
          rows {
            columns
            updateType
          }
        }
      }
    `;

    while (hasMore) {
      console.log(`Buscando itens offset ${offset}...`);
      const dataRes = await shopeeRequest("GetItemFeedData", dataQuery, { datafeedId: todayFeed.datafeedId, offset, limit });
      const rows = dataRes?.data?.getItemFeedData?.rows || [];

      if (rows.length === 0) {
        hasMore = false;
        break;
      }

      const itemsToSave = [];

      for (const row of rows) {
        if (row.updateType === 'DELETE') continue; // Ignorar itens removidos do catálogo
        
        let itemData;
        try {
          itemData = JSON.parse(row.columns);
        } catch (e) {
          continue;
        }

        const rating = parseFloat(itemData.ratingStar || 0);
        const sales = parseInt(itemData.sales || 0, 10);
        const discount = parseFloat(itemData.priceDiscountRate || 0);
        const commBase = parseFloat(itemData.commissionRate || 0);
        const commXtra = parseFloat(itemData.sellerCommissionRate || 0);
        const totalComm = commBase + commXtra;
        const shopType = Array.isArray(itemData.shopType) ? itemData.shopType : [];

        // Quality Gate VIP
        const isOfficialOrPreferred = shopType.includes(1) || shopType.includes(2) || shopType.includes(4);
        
        if (rating >= 4.5 && sales >= 10 && isOfficialOrPreferred && totalComm >= 3.0) {
          itemsToSave.push({
            run_id: runId,
            user_id: tenantId,
            external_id: `SHP-${itemData.itemId}`,
            title: itemData.productName,
            price: itemData.priceMin,
            original_price: itemData.priceMax,
            image_url: itemData.imageUrl,
            product_url: itemData.productLink || `https://shopee.com.br/product/${itemData.shopId}/${itemData.itemId}`,
            marketplace: 'Shopee',
            attributes: {
              source: 'api_feed_delta',
              sales,
              ratingStar: rating,
              priceDiscountRate: discount,
              commissionRate: commBase,
              sellerCommissionRate: commXtra,
              shopId: itemData.shopId,
              shopType: shopType
            }
          });
        }
      }

      totalProcessed += rows.length;

      if (itemsToSave.length > 0) {
        const { error: insertError } = await supabase.from('discovery_items').insert(itemsToSave);
        if (insertError) {
          console.error("Erro ao salvar lote no banco:", insertError.message);
        } else {
          totalSaved += itemsToSave.length;
        }
      }

      offset += limit;
      // Parada de segurança caso o volume seja monstruoso (10.000)
      if (totalProcessed > 10000) hasMore = false; 
    }

    // Finalizar a Run
    await supabase.from('discovery_runs').update({
      run_status: 'completed',
      results_count: totalSaved
    }).eq('id', runId);

    console.log(`Sincronização concluída! Processados: ${totalProcessed} | Salvos VIP: ${totalSaved}`);

  } catch (err) {
    console.error("Erro fatal na sincronização:", err);
  }
}

syncShopeeFeed();
