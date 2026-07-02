'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
require('dotenv').config({ path: '.env.local' });

const crypto = require('crypto');
const axios = require('axios');
const ws = require('ws');
const { createClient } = require('@supabase/supabase-js');
const { validateProduct } = require('./scraper-adapter.cjs');
const {
  upsertOffer,
  generateOfferAnalysis,
  fetchShopeeProductsFromOfficialApi,
  buildAffiliateUrl,
} = require('./oracle-scraper.cjs');

const ADMIN_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
const SHOPEE_APP_ID = process.env.SHOPEE_APP_ID || '';
const SHOPEE_APP_SECRET = process.env.SHOPEE_APP_SECRET || '';
const SHOPEE_OFFICIAL_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';
const DEFAULT_SHOPEE_QUERIES = [
  'fone bluetooth',
  'creatina',
  'vestido midi',
  'tenis corrida',
  'mochila'
];
const NETSHOES_TEST_QUERIES = [
  'tênis masculino promoção',
  'tênis feminino promoção',
  'camiseta esportiva promoção',
  'creatina promoção',
  'mochila esportiva promoção'
];
const CHANNELS = ['telegram', 'instagram', 'whatsapp'];

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  }
);

function parseMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function buildShopeePayload(query, limit, page = 1) {
  return JSON.stringify({
    operationName: 'ShopeeProductOfferSearch',
    query: 'query ShopeeProductOfferSearch($keyword: String, $page: Int, $limit: Int, $sortType: Int, $isAMSOffer: Boolean) { productOfferV2(keyword: $keyword, page: $page, limit: $limit, sortType: $sortType, isAMSOffer: $isAMSOffer) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink sales commissionRate sellerCommissionRate shopeeCommissionRate ratingStar priceDiscountRate shopId shopName } pageInfo { page limit hasNextPage } } }',
    variables: {
      keyword: query,
      page,
      limit,
      sortType: 2,
      isAMSOffer: true,
    },
  });
}

async function fetchShopeeBatch(query, limit = 20, page = 1) {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    return {
      query,
      page,
      status: 0,
      errors: ['CREDENCIAIS_SHOPEE_AUSENTES'],
      returned: 0,
      converted: [],
    };
  }

  const payload = buildShopeePayload(query, limit, page);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha256')
    .update(`${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_APP_SECRET}`)
    .digest('hex');

  const response = await axios.post(SHOPEE_OFFICIAL_API_URL, payload, {
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
    },
    timeout: 60000,
    validateStatus: () => true,
  });

  const errors = Array.isArray(response.data?.errors)
    ? response.data.errors.map((item) => item?.message).filter(Boolean)
    : [];
  const nodes = Array.isArray(response.data?.data?.productOfferV2?.nodes)
    ? response.data.data.productOfferV2.nodes
    : [];
  const converted = nodes
    .map((node) => {
      const currentPrice = parseMoney(node?.priceMin) ?? parseMoney(node?.priceMax);
      const oldPriceCandidate = parseMoney(node?.priceMax);
      const oldPrice = oldPriceCandidate && currentPrice && oldPriceCandidate > currentPrice ? oldPriceCandidate : null;
      if (!node?.productName || !currentPrice || !node?.productLink) return null;
      return {
        product_name: String(node.productName).trim(),
        current_price: currentPrice,
        old_price: oldPrice,
        image_url: node.imageUrl || null,
        original_url: node.productLink,
        affiliate_url: node.offerLink || node.productLink,
        rating: node.ratingStar ? parseFloat(String(node.ratingStar)) : null,
        category: 'Geral',
        platform: 'Shopee',
        marketplace: 'Shopee',
        sales: node.sales ?? null,
        shopee_item_id: node.itemId ?? null,
        shopee_shop_id: node.shopId ?? null,
      };
    })
    .filter(Boolean);

  return {
    query,
    page,
    status: response.status,
    errors,
    returned: nodes.length,
    converted,
  };
}

function createSubId(channel, offerId) {
  const shortId = offerId.replace(/-/g, '').slice(0, 8);
  const prefixes = { telegram: 'tg', instagram: 'ig', whatsapp: 'wp' };
  return `${prefixes[channel] || 'x'}_${shortId}`;
}

function createTrackedUrl(subId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://cacaoferta.com.br';
  return `${baseUrl}/go/${subId}`;
}

function isLikelyFallbackAnalysis(analysis, productName) {
  if (!analysis || typeof analysis !== 'object') return false;
  const telegram = String(analysis.telegram || '');
  return telegram.includes(`Oferta: ${productName}`) && telegram.includes('Preço especial detectado.');
}

async function processCandidatesControlled(candidates) {
  const metrics = {
    processed: 0,
    iaErrors: [],
    iaFallbacks: 0,
    linkErrors: [],
    postErrors: [],
    offerUpdateErrors: [],
    postsByChannel: { telegram: 0, instagram: 0, whatsapp: 0 },
  };

  for (const item of candidates) {
    let analysis;
    try {
      analysis = await generateOfferAnalysis(item.product, item.store, {
        offerId: item.id,
        pipelineBatchSize: candidates.length,
        query: item.query || null,
      });
      if (isLikelyFallbackAnalysis(analysis, item.product.product_name)) {
        metrics.iaFallbacks += 1;
      }
    } catch (error) {
      metrics.iaErrors.push({ offerId: item.id, error: error.message });
      continue;
    }

    const finalScore = Number(((item.score * 0.7) + (analysis.score * 0.3)).toFixed(2));
    await supabase.from('posts').delete().eq('offer_id', item.id).eq('status', 'draft');

    const linksMap = {};
    let linkFailed = false;

    for (const channel of CHANNELS) {
      const subId = createSubId(channel, item.id);
      const trackedUrl = createTrackedUrl(subId);
      const { data: linkData, error: linkError } = await supabase
        .from('affiliate_links')
        .upsert({
          user_id: ADMIN_USER_ID,
          offer_id: item.id,
          channel,
          original_url: item.affiliateUrl,
          tracked_url: trackedUrl,
          sub_id: subId
        }, { onConflict: 'offer_id,channel' })
        .select('id')
        .single();

      if (linkError || !linkData?.id) {
        metrics.linkErrors.push({
          offerId: item.id,
          channel,
          error: linkError?.message || 'LINKDATA_AUSENTE'
        });
        linkFailed = true;
        break;
      }

      linksMap[channel] = { id: linkData.id, url: trackedUrl };
    }

    if (linkFailed) continue;

    const postsToInsert = [
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.telegram.id, channel: 'telegram', content: analysis.telegram.replace('{LINK}', linksMap.telegram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.instagram.id, channel: 'instagram', content: analysis.instagram.replace('{LINK}', linksMap.instagram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.whatsapp.id, channel: 'whatsapp', content: analysis.whatsapp.replace('{LINK}', linksMap.whatsapp.url), status: 'draft' }
    ];

    const { error: postsError } = await supabase.from('posts').insert(postsToInsert);
    if (postsError) {
      metrics.postErrors.push({ offerId: item.id, error: postsError.message });
      continue;
    }

    const { error: offerUpdateError } = await supabase
      .from('offers')
      .update({ status: 'approved', score: finalScore })
      .eq('id', item.id);

    if (offerUpdateError) {
      metrics.offerUpdateErrors.push({ offerId: item.id, error: offerUpdateError.message });
      continue;
    }

    metrics.processed += 1;
    for (const channel of CHANNELS) {
      metrics.postsByChannel[channel] += 1;
    }
  }

  return metrics;
}

function summarizeRejectReasons(rejections) {
  const counts = {};
  for (const item of rejections) {
    const key = item.reason || 'DESCONHECIDO';
    counts[key] = (counts[key] || 0) + 1;
  }
  return counts;
}

function isValidHttpUrl(value) {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch (_) {
    return false;
  }
}

function evaluateNetshoesCandidate(product) {
  const reasons = [];
  const title = String(product.product_name || '').trim();
  const image = String(product.image_url || '').trim();
  const url = String(product.original_url || '').trim();
  const current = Number(product.current_price || 0);
  const old = product.old_price == null ? null : Number(product.old_price);
  const finalUrl = buildAffiliateUrl(url, 'Netshoes');

  if (current <= 0) reasons.push('PRECO_INVALIDO');
  if (!image) reasons.push('SEM_IMAGEM');
  if (!url || !isValidHttpUrl(url)) reasons.push('URL_INVALIDA');
  if (old == null || old <= current) reasons.push('SEM_DESCONTO_REAL');
  if (title.length < 12 || !title.includes(' ')) reasons.push('TITULO_GENERICO');
  if (!finalUrl || !isValidHttpUrl(finalUrl)) reasons.push('DOMINIO_FINAL_INVALIDO');

  return {
    valid: reasons.length === 0,
    reasons,
    finalUrl,
  };
}

async function collectShopeeProducts(maxProducts = 100) {
  const queries = DEFAULT_SHOPEE_QUERIES;
  const batches = [];
  const unique = new Map();
  const apiErrors = [];

  for (const query of queries) {
    if (unique.size >= maxProducts) break;
    const batch = await fetchShopeeBatch(query, 20, 1);
    batches.push({
      query: batch.query,
      status: batch.status,
      returned: batch.returned,
      converted: batch.converted.length,
      errors: batch.errors,
    });

    if (batch.status !== 200 || batch.errors.length > 0) {
      apiErrors.push({
        query,
        status: batch.status,
        errors: batch.errors,
      });
      continue;
    }

    for (const product of batch.converted) {
      const key = product.original_url || product.affiliate_url || product.product_name;
      if (!unique.has(key)) {
        unique.set(key, { ...product, query });
      }
      if (unique.size >= maxProducts) break;
    }
  }

  return {
    batches,
    apiErrors,
    products: Array.from(unique.values()).slice(0, maxProducts),
  };
}

async function runShopeeHomologation() {
  const collection = await collectShopeeProducts(100);
  const converted = collection.products;
  const approved = [];
  const rejected = [];

  for (const product of converted) {
    const validation = validateProduct(product, 'Shopee');
    if (validation.valid) {
      approved.push({ product, validation });
    } else {
      rejected.push({
        product_name: product.product_name,
        url: product.original_url,
        reason: validation.rejectReason || 'DESCONHECIDO'
      });
    }
  }

  const upserted = [];
  const insertErrors = [];
  let duplicates = 0;

  for (const entry of approved) {
    const affiliateUrl = entry.product.affiliate_url || entry.product.original_url;
    const result = await upsertOffer(entry.product, 'Shopee', affiliateUrl);
    if (!result) {
      insertErrors.push({
        product_name: entry.product.product_name,
        url: affiliateUrl
      });
      continue;
    }
    if (!result.isNew) duplicates += 1;
    upserted.push({
      id: result.id,
      isNew: result.isNew,
      score: result.score,
      store: 'Shopee',
      product: entry.product,
      affiliateUrl,
      query: entry.product.query || null,
    });
  }

  const processingMetrics = await processCandidatesControlled(upserted);
  const offerIds = upserted.map((item) => item.id);
  const { data: postsData, error: postsQueryError } = offerIds.length === 0
    ? { data: [], error: null }
    : await supabase
      .from('posts')
      .select('offer_id,channel,status')
      .in('offer_id', offerIds)
      .eq('status', 'draft');

  const draftCounts = { telegram: 0, instagram: 0, whatsapp: 0 };
  const panelValidated = !postsQueryError && CHANNELS.every((channel) => {
    const count = (postsData || []).filter((row) => row.channel === channel).length;
    draftCounts[channel] = count;
    return count > 0;
  });

  return {
    apiBatches: collection.batches,
    apiErrors: collection.apiErrors,
    totalReturned: collection.batches.reduce((sum, item) => sum + item.returned, 0),
    totalConverted: converted.length,
    totalApproved: approved.length,
    totalRejected: rejected.length,
    rejectReasons: summarizeRejectReasons(rejected),
    offersCreated: upserted.length,
    duplicates,
    insertErrors,
    postsByChannel: draftCounts,
    postsQueryError: postsQueryError?.message || null,
    panelValidated,
    processingMetrics,
    sampleProducts: converted.slice(0, 3).map((item) => ({
      product_name: item.product_name,
      current_price: item.current_price,
      old_price: item.old_price,
      original_url: item.original_url,
    })),
  };
}

async function runNetshoesReadonlyTest() {
  const rakutenIntegrationFound = true;
  const rakutenAffiliateCredsFound = !!process.env.RAKUTEN_AFFILIATE_ID && !!process.env.RAKUTEN_NETSHOES_MID;
  const rakutenApiCredsFound = !!process.env.RAKUTEN_APP_ID || !!process.env.RAKUTEN_CLIENT_ID || !!process.env.RAKUTEN_API_TOKEN || !!process.env.RAKUTEN_TOKEN;
  const mainCycleActive = false;

  const result = {
    integrationFound: rakutenIntegrationFound,
    affiliateCredsFound: rakutenAffiliateCredsFound,
    apiCredsFound: rakutenApiCredsFound,
    activeState: mainCycleActive ? 'ativa' : 'desativada',
    apiStatus: rakutenApiCredsFound ? 'NAO_TESTADO' : 'BLOQUEADO_SEM_CREDENCIAIS_API_RAKUTEN',
    totalReturned: 0,
    totalApproved: 0,
    totalRejected: 0,
    rejectReasons: {},
    approvedExamples: [],
    rejectedExamples: [],
    queries: NETSHOES_TEST_QUERIES,
    command: 'node scripts/homologate-shopee-netshoes.cjs',
  };

  if (!rakutenApiCredsFound) {
    result.rejectReasons = { SEM_CREDENCIAIS_API_RAKUTEN: NETSHOES_TEST_QUERIES.length };
    return result;
  }

  const readonlyProducts = [];
  for (const query of NETSHOES_TEST_QUERIES) {
    const syntheticProduct = {
      product_name: query,
      current_price: 0,
      old_price: null,
      image_url: null,
      original_url: '',
    };
    readonlyProducts.push(syntheticProduct);
  }

  const approved = [];
  const rejected = [];
  for (const product of readonlyProducts) {
    const evaluation = evaluateNetshoesCandidate(product);
    if (evaluation.valid) {
      approved.push({ product, finalUrl: evaluation.finalUrl });
    } else {
      rejected.push({
        product_name: product.product_name,
        reasons: evaluation.reasons,
        finalUrl: evaluation.finalUrl
      });
    }
  }

  result.totalReturned = readonlyProducts.length;
  result.totalApproved = approved.length;
  result.totalRejected = rejected.length;
  result.rejectReasons = rejected.reduce((acc, item) => {
    for (const reason of item.reasons) {
      acc[reason] = (acc[reason] || 0) + 1;
    }
    return acc;
  }, {});
  result.approvedExamples = approved.slice(0, 5);
  result.rejectedExamples = rejected.slice(0, 5);
  return result;
}

async function main() {
  const shopeeSmoke = await fetchShopeeProductsFromOfficialApi('fone bluetooth', 3);
  const shopee = await runShopeeHomologation();
  const netshoes = await runNetshoesReadonlyTest();

  const report = {
    generatedAt: new Date().toISOString(),
    shopeeSmokeCount: shopeeSmoke.length,
    shopee,
    netshoes,
  };

  console.log(JSON.stringify(report, null, 2));
}

main().catch((error) => {
  console.error(JSON.stringify({
    fatal: true,
    message: error.message,
    stack: error.stack,
  }, null, 2));
  process.exit(1);
});
