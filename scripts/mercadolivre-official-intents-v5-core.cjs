'use strict';

const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const { SCENARIOS } = require('./amazon-scenario-config.cjs');
const { coverageGate } = require('./coverage-policy.cjs');

const API_ROOT = 'https://api.mercadolibre.com';
const API_TIMEOUT_MS = 45000;
const REPORT_PATH = 'reports/mercadolivre-official-intents-v5-dry-run.json';
const DEFAULT_TENANT_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
// O worker coleta até 20 por intenção; 10 válidos deixam margem para
// duplicatas/rejeições sem permitir cobertura frágil na seleção automática.
const MIN_PRODUCTS_PER_INTENT = 10;
// Categorias de catálogo com poucos anúncios ativos. A exceção é explícita
// e auditável; não reduz o gate das demais intenções nem mistura categorias.
const MIN_PRODUCTS_BY_INTENT = {
  projetor: 5,
  'tomada inteligente': 5,
  'mordedor silicone': 5,
  'travesseiro antissufocante bebê': 5,
  'body bebê manga longa': 5,
  'canguru ergonômico bebê': 5,
  'roupinha pet inverno': 5,
  'toalha banho pet super absorvente': 5,
  'tapete cachorro': 5,
  'lixeira inox pedal': 5,
  'cesto roupa suja flexível': 5,
  'cobre leito matelassê': 5,
  'cinto de couro social': 5,
  'bermuda masculina': 5,
  'mala de bordo 10kg': 5,
  'capa chuva impermeável': 5,
  'mala média viagem': 5
};
const SEARCH_ALIASES = {
  'televisão 4K': ['televisão 4K', 'smart TV 4K'],
  projetor: ['projetor', 'projetor multimídia'],
  soundbar: ['soundbar', 'barra de som'],
  'home theater': ['home theater', 'home cinema', 'sistema de som 5.1'],
  'câmera digital': ['câmera digital', 'camera fotografica'],
  Alexa: ['Alexa', 'Echo Dot', 'smart speaker'],
  teclado: ['teclado', 'teclado gamer'],
  mouse: ['mouse', 'mouse gamer'],
  'mamadeira anti cólica': ['mamadeira anti cólica', 'mamadeira anticólica', 'mamadeira bebê'],
  'ninho redutor de berço': ['ninho redutor de berço', 'ninho bebê', 'redutor de berço'],
  'extrator de leite': ['extrator de leite', 'bomba tira leite', 'bomba de leite materno'],
  'mordedor silicone': ['mordedor silicone', 'mordedor bebê', 'mordedor infantil'],
  'roupinhas de bebê kit': ['roupinhas de bebê kit', 'roupa bebê kit', 'kit roupa bebê'],
  'travesseiro antissufocante bebê': ['travesseiro antissufocante bebê', 'travesseiro bebê antissufocante'],
  'cueiro bebê flanelado': ['cueiro bebê flanelado', 'cueiro bebê', 'manta cueiro bebê'],
  'body bebê manga longa': ['body bebê manga longa', 'body bebê', 'body infantil manga longa'],
  'canguru ergonômico bebê': ['canguru ergonômico bebê', 'canguru bebê', 'carregador bebê ergonômico'],
  'sling tecido recém nascido': ['sling tecido recém nascido', 'sling bebê', 'carregador sling'],
  'tapete higiênico cachorro': ['tapete higiênico cachorro', 'tapete higiênico pet', 'tapete absorvente cachorro'],
  'roupinha pet inverno': ['roupinha pet inverno', 'roupa pet inverno', 'roupinha cachorro'],
  'toalha banho pet super absorvente': ['toalha banho pet super absorvente', 'toalha pet', 'toalha cachorro'],
  'tapete cachorro': ['tapete cachorro', 'tapete higiênico pet'],
  'lixeira inox pedal': ['lixeira inox pedal', 'lixeira cozinha inox', 'lixeira com pedal'],
  'cesto roupa suja flexível': ['cesto roupa suja flexível', 'cesto roupa suja', 'cesto de roupas'],
  'jogo de lençol algodão': ['jogo de lençol algodão', 'jogo de cama algodão', 'lençol algodão'],
  'kit utensílios silicone': ['kit utensílios silicone', 'utensílios cozinha silicone', 'kit cozinha silicone'],
  'espatula silicone': ['espatula silicone', 'espátula cozinha', 'espátula silicone'],
  'jogo americano bambu': ['jogo americano bambu', 'jogo americano mesa', 'jogo americano'],
  'cobre leito matelassê': ['cobre leito matelassê', 'cobre leito casal', 'cobreleito'],
  'kit cozinha': ['kit cozinha', 'utensílios cozinha', 'kit utensílios'],
  'jaqueta de couro masculina': ['jaqueta de couro masculina', 'jaqueta masculina couro', 'jaqueta masculina', 'jaqueta couro'],
  'cinto de couro social': ['cinto de couro social', 'cinto masculino social', 'cinto masculino', 'cinto social'],
  'camisa polo masculina': ['camisa polo masculina', 'camisa polo homem', 'polo masculina', 'camisa polo'],
  'calça jeans masculina': ['calça jeans masculina', 'calça jeans homem', 'calça masculina jeans', 'calça jeans'],
  'camiseta masculina': ['camiseta masculina', 'camiseta homem', 'camiseta básica masculina'],
  'bermuda masculina': ['bermuda masculina', 'bermuda homem', 'bermuda casual masculina', 'bermuda'],
  'moletom masculino': ['moletom masculino', 'moletom homem', 'blusa moletom masculina', 'moletom'],
  'mouse gamer rgb': ['mouse gamer rgb', 'mouse gamer', 'mouse para jogos'],
  'suporte notebook alumínio': ['suporte notebook alumínio', 'suporte notebook', 'base notebook'],
  'mouse sem fio': ['mouse sem fio', 'mouse wireless', 'mouse bluetooth'],
  'roupa de academia fitness': ['roupa de academia fitness', 'roupa fitness', 'conjunto academia', 'roupa academia'],
  'legging fitness': ['legging fitness', 'legging academia', 'calça legging esportiva', 'legging'],
  'camiseta dry fit': ['camiseta dry fit', 'camiseta academia', 'camiseta esportiva', 'dry fit'],
  'anel de compromisso': ['anel de compromisso', 'anel noivado', 'aliança compromisso'],
  'corrente masculina': ['corrente masculina', 'corrente homem', 'corrente aço masculina'],
  'mala de bordo 10kg': ['mala de bordo 10kg', 'mala cabine', 'mala bordo'],
  'lanterna tática recarregável': ['lanterna tática recarregável', 'lanterna recarregável', 'lanterna led tática'],
  'mochila trilha': ['mochila trilha', 'mochila trekking', 'mochila camping'],
  'capa chuva impermeável': ['capa chuva impermeável', 'capa de chuva', 'capa chuva adulto'],
  'mala média viagem': ['mala média viagem', 'mala média', 'mala viagem'],
  'capa mala': ['capa mala', 'capa protetora mala', 'capa para mala'],
  'samsung galaxy smartphone': ['samsung galaxy smartphone', 'smartphone samsung galaxy', 'celular samsung galaxy'],
  'xiaomi redmi smartphone': ['xiaomi redmi smartphone', 'smartphone xiaomi redmi', 'celular xiaomi redmi'],
  'poco smartphone': ['poco smartphone', 'smartphone poco', 'celular poco'],
  'celular motorola': ['celular motorola', 'smartphone motorola', 'motorola smartphone'],
  'realme smartphone': ['realme smartphone', 'smartphone realme', 'celular realme']
};
const PREFERRED_DOMAINS = {
  mouse: ['MLB-COMPUTER_MICE'],
  'câmera digital': ['MLB-DIGITAL_CAMERAS'],
  'home theater': ['MLB-HOME_THEATERS'],
  'jaqueta de couro masculina': ['MLB-JACKETS_AND_COATS'],
  'camisa polo masculina': ['MLB-SPORT_T_SHIRTS'],
  'calça jeans masculina': ['MLB-PANTS'],
  'moletom masculino': ['MLB-SWEATSHIRTS_AND_HOODIES'],
  'camiseta masculina': ['MLB-T_SHIRTS'],
  'bermuda masculina': ['MLB-SHORTS'],
  'roupa de academia fitness': ['MLB-SPORTSWEAR_SETS'],
  'legging fitness': ['MLB-LEGGINGS'],
  'camiseta dry fit': ['MLB-SPORT_T_SHIRTS']
};
const PREFERRED_DOMAIN_META = {
  'MLB-COMPUTER_MICE': { domain_id: 'MLB-COMPUTER_MICE', category_id: 'MLB1714', category_name: 'Mouses' },
  'MLB-DIGITAL_CAMERAS': { domain_id: 'MLB-DIGITAL_CAMERAS', category_id: 'MLB1042', category_name: 'Câmeras Digitais' },
  'MLB-HOME_THEATERS': { domain_id: 'MLB-HOME_THEATERS', category_id: 'MLB3839', category_name: 'Home Theaters' }
  , 'MLB-JACKETS_AND_COATS': { domain_id: 'MLB-JACKETS_AND_COATS', category_id: 'MLB108803', category_name: 'Casacos e Jaquetas' }
  , 'MLB-SPORT_T_SHIRTS': { domain_id: 'MLB-SPORT_T_SHIRTS', category_id: 'MLB439286', category_name: 'Polos' }
  , 'MLB-PANTS': { domain_id: 'MLB-PANTS', category_id: 'MLB188065', category_name: 'Calças' }
  , 'MLB-SWEATSHIRTS_AND_HOODIES': { domain_id: 'MLB-SWEATSHIRTS_AND_HOODIES', category_id: 'MLB108807', category_name: 'Moletons' }
  , 'MLB-T_SHIRTS': { domain_id: 'MLB-T_SHIRTS', category_id: 'MLB31447', category_name: 'Camisetas e Regatas' }
  , 'MLB-SHORTS': { domain_id: 'MLB-SHORTS', category_id: 'MLB188064', category_name: 'Bermudas e Shorts' }
  , 'MLB-SPORTSWEAR_SETS': { domain_id: 'MLB-SPORTSWEAR_SETS', category_id: 'MLB270220', category_name: 'Conjuntos' }
  , 'MLB-LEGGINGS': { domain_id: 'MLB-LEGGINGS', category_id: 'MLB278018', category_name: 'Leggings' }
};
const SAFE_CLOTHING_DOMAINS = /(?:CLOTHING|CLOTHES|SPORTSWEAR|JACKETS|PANTS|SHIRTS|SHORTS|LEGGINGS|BODY_SHAPERS|FASHION)/i;
const BLOCKED_CLOTHING_DOMAINS = /(?:BOOK|PET|MUGS|PERFUMES|WALLETS|ZIPPERS|HANDBAGS|SUNGLASSES|KETTLEBELLS|BASEBALL|SOFTBALL)/i;

function rankDomains(domains, intent) {
  const query = intent.toLocaleLowerCase('pt-BR');
  const preferred = PREFERRED_DOMAINS[intent] || [];
  const score = (domain) => {
    const text = `${domain.domain_id} ${domain.domain_name} ${domain.category_name}`.toLocaleLowerCase('pt-BR');
    let value = preferred.includes(domain.domain_id) ? 100 : query.split(/\s+/).filter((token) => token.length > 3).reduce((sum, token) => sum + (text.includes(token) ? 3 : 0), 0);
    if (query.includes('mouse') && text.includes('mouse pad')) value -= 10;
    if (query.includes('câmera') && text.includes('analóg')) value -= 10;
    if (query.includes('câmera') && text.includes('digit')) value += 10;
    if (query.includes('projetor') && text.includes('capa')) value -= 10;
    if (query.includes('projetor') && text.includes('projetor')) value += 5;
    return value;
  };
  return [...domains].sort((left, right) => score(right) - score(left));
}

function catalogFallbackProducts(items, searchTerm) {
  const tokens = searchTerm.toLocaleLowerCase('pt-BR').split(/\s+/).filter((token) => token.length >= 4);
  return (items || []).filter((item) => {
    const domain = String(item.domain_id || '');
    const name = String(item.name || '').toLocaleLowerCase('pt-BR');
    return SAFE_CLOTHING_DOMAINS.test(domain) && !BLOCKED_CLOTHING_DOMAINS.test(domain)
      && tokens.some((token) => name.includes(token));
  }).map((item) => item.id).filter(Boolean).slice(0, 20);
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function persistRefreshedCredentials(data, { env = process.env, supabaseClient } = {}) {
  const url = env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
  const userId = env.CACA_OFERTA_USER_ID || env.SUPABASE_USER_ID || DEFAULT_TENANT_USER_ID;
  if (!url || !serviceKey || !userId) throw new Error('Supabase ou usuário Mercado Livre ausente para persistir OAuth');
  const client = supabaseClient || createClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const { error } = await client.from('app_settings').upsert({
    user_id: userId,
    key: 'ml_credentials',
    value: { access_token: data.access_token, refresh_token: data.refresh_token, expires_at: new Date(Date.now() + Number(data.expires_in || 21600) * 1000).toISOString(), ml_user_id: data.user_id || userId },
    updated_at: new Date().toISOString()
  }, { onConflict: 'user_id,key' });
  if (error) throw new Error(`Falha ao persistir credenciais ML: ${error.message}`);
}

async function refreshAccessToken({ fetchImpl = global.fetch, env = process.env, persist = true, supabaseClient } = {}) {
  const clientId = env.MERCADO_LIVRE_APP_ID || env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = env.MERCADO_LIVRE_CLIENT_SECRET;
  const refreshToken = env.MERCADO_LIVRE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) throw new Error('Credenciais OAuth do Mercado Livre ausentes');
  const response = await fetchImpl(`${API_ROOT}/oauth/token`, {
    method: 'POST',
    headers: { Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'refresh_token', client_id: clientId, client_secret: clientSecret, refresh_token: refreshToken }).toString()
  });
  const data = await response.json();
  if (!response.ok || !data.access_token) throw new Error(`OAuth Mercado Livre inválido: HTTP ${response.status}`);
  if (!data.refresh_token) throw new Error('OAuth Mercado Livre não retornou novo refresh_token');
  if (persist) await persistRefreshedCredentials(data, { env, supabaseClient });
  return data.access_token;
}

async function apiGet(path, { fetchImpl = global.fetch, accessToken } = {}) {
  const response = await fetchImpl(`${API_ROOT}${path}`, {
    headers: { Accept: 'application/json', Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(API_TIMEOUT_MS),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`ML API HTTP ${response.status}: ${body.message || path}`);
  return body;
}

function isDomainRelevant(domain, intent, searchTerm) {
  const query = `${intent} ${searchTerm || ''}`.toLocaleLowerCase('pt-BR');
  const dId = String(domain.domain_id || '').toUpperCase();
  const dName = String(domain.domain_name || '').toLocaleLowerCase('pt-BR');
  const catName = String(domain.category_name || '').toLocaleLowerCase('pt-BR');
  const dText = `${dId} ${dName} ${catName}`.toLocaleLowerCase('pt-BR');

  if (/TOY|BRINQUEDO|PRETEND_PLAY/i.test(dId) || dText.includes('brinquedo')) {
    if (!/brinquedo|infantil|mini|jogo|fantasia|kids/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (toy_domain_rejected)' };
    }
  }

  if (/ANTIQUE/i.test(dId) || dText.includes('antig') || dText.includes('antigo')) {
    if (!/antig|retr|vintage|coleç/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (antique_domain_rejected)' };
    }
  }

  if (/COMPRESSOR|MOTOR/i.test(dId) || dText.includes('compressor') || dText.includes('motor de')) {
    if (!/compressor|motor|peça|conserto/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (compressor_domain_rejected)' };
    }
  }

  if (/VEHICLE/i.test(dId) || dText.includes('veicular') || dText.includes('para carro')) {
    if (!/veicular|carro|automotiv|caminh|12v|24v/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (vehicle_domain_rejected)' };
    }
  }

  if (/MINERAL_WATER|BEVERAGE|DRINK/i.test(dId) || dText.includes('águas minerais') || dText.includes('bebidas')) {
    if (!/água|mineral|bebida|refrigerante|suco|garrafa/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (water_domain_rejected)' };
    }
  }

  if (/BLENDER_JAR|JAR|PITCHER/i.test(dId) || dText.includes('copo para') || dText.includes('jarra')) {
    if (!/copo|jarra|tampa|lâmina|acessório/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (accessory_jar_domain_rejected)' };
    }
  }

  if (/BAG|COVER|CASE/i.test(dId) && /geladeira|fogão|microondas|televisão|tv|liquidificador|air fryer/i.test(query)) {
    if (!/bolsa|capa|sacola|térmica|case/i.test(query)) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (bag_cover_domain_rejected)' };
    }
  }

  if (/televis|smart\s*tv|tv\s*4k/i.test(query)) {
    if (!/TELEVISION|TV|SMART_TV|ELECTRONICS/i.test(dId) && !dText.includes('televis') && !dText.includes('tv')) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_tv_domain_rejected)' };
    }
  }

  if (/air\s*fryer|fritadeira/i.test(query)) {
    if (!/AIR_FRYER|FRYER|FRITADEIRA|ELECTRICAL_APPLIANCES/i.test(dId) && !dText.includes('fritadeira') && !dText.includes('air fryer') && !dText.includes('eletroport')) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_fryer_domain_rejected)' };
    }
  }

  if (/geladeira|refrigerador/i.test(query)) {
    if (!/REFRIGERATOR|GELADEIRA|FREEZER|APPLIANCES/i.test(dId) && !dText.includes('geladeira') && !dText.includes('refrigerad')) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_refrigerator_domain_rejected)' };
    }
  }

  if (/liquidificador/i.test(query)) {
    if (!/BLENDER|LIQUIDIFICADOR|FOOD_PROCESSORS|APPLIANCES/i.test(dId) && !dText.includes('liquidificador')) {
      return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_blender_domain_rejected)' };
    }
  }

  return { relevant: true };
}

function isProductRelevant(productMeta, intent, searchTerm) {
  const query = `${intent} ${searchTerm || ''}`.toLocaleLowerCase('pt-BR');
  const title = String(productMeta.name || productMeta.title || '').toLocaleLowerCase('pt-BR');
  if (!title) return { relevant: true };

  if (/purificador|filtro\s+de\s+água|água\s+mineral/i.test(title)) {
    if (!/água|purificador|filtro|bebedouro/i.test(query)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (water_product_in_appliance_intent)' };
    }
  }

  if (/brinquedo|mini\s+geladeira|casinha|mini\s+brands/i.test(title)) {
    if (!/brinquedo|infantil|mini|jogo|fantasia|kids/i.test(query)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (toy_product_rejected)' };
    }
  }

  if (/liquidificador/i.test(query)) {
    if (!/liquidificador|blender|processador/i.test(title) && /purificador|bebedouro|cafeteira|fritadeira/i.test(title)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_blender_product)' };
    }
  }

  if (/air\s*fryer|fritadeira/i.test(query)) {
    if (!/air\s*fryer|fritadeira|fryer/i.test(title) && /água|purificador|liquidificador|cafeteira/i.test(title)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_air_fryer_product)' };
    }
  }

  if (/cafeteira|máquina\s+de\s+café/i.test(query)) {
    if (!/cafeteira|café|espresso|cappuccino|nespresso|dolce\s*gusto/i.test(title) && /água|purificador|liquidificador|fritadeira/i.test(title)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_coffee_maker_product)' };
    }
  }

  if (/televis|smart\s*tv|tv\s*4k/i.test(query)) {
    if (!/tv|televis|smart|monitor|oled|qled|led|4k|uhd/i.test(title) && /água|purificador|receptor|antena/i.test(title)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_tv_product)' };
    }
  }

  if (/geladeira|refrigerador/i.test(query)) {
    if (!/geladeira|refrigerador|freezer|frigobar/i.test(title) && /água|purificador|liquidificador|brinquedo/i.test(title)) {
      return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_refrigerator_product)' };
    }
  }

  return { relevant: true };
}

function deduplicateCanonicalProducts(products) {
  const byCanonical = new Map();
  for (const p of products) {
    const key = p.product_id || p.item_id;
    if (!key) continue;
    if (!byCanonical.has(key)) byCanonical.set(key, []);
    byCanonical.get(key).push(p);
  }

  const canonicalList = [];
  for (const [key, group] of byCanonical.entries()) {
    const sorted = [...group].sort((a, b) => {
      const priceA = Number.isFinite(a.current_price) && a.current_price > 0 ? a.current_price : Infinity;
      const priceB = Number.isFinite(b.current_price) && b.current_price > 0 ? b.current_price : Infinity;
      if (priceA !== priceB) return priceA - priceB;
      if (a.shipping_free !== b.shipping_free) return a.shipping_free ? -1 : 1;
      const discA = a.discount_percent || 0;
      const discB = b.discount_percent || 0;
      return discB - discA;
    });

    const best = sorted[0];
    const validPrices = group.map((g) => g.current_price).filter((pr) => Number.isFinite(pr) && pr > 0);
    const minPrice = validPrices.length ? Math.min(...validPrices) : best.current_price;
    const maxPrice = validPrices.length ? Math.max(...validPrices) : best.current_price;
    const sellerCount = new Set(group.map((g) => g.seller_id).filter(Boolean)).size;

    canonicalList.push({
      ...best,
      selected_item_id: best.item_id,
      active_offers_count: group.length,
      min_price: minPrice,
      max_price: maxPrice,
      seller_count: sellerCount || 1,
    });
  }
  return canonicalList;
}

function normalizeItems(items, context = {}) {
  const safeContext = context || {};
  return items.map((item) => {
    const rawSold = item.sold_quantity ?? safeContext.sold_quantity;
    const soldQuantity = Number.isFinite(Number(rawSold)) && Number(rawSold) >= 0 ? Number(rawSold) : null;

    const rawAvailable = item.available_quantity ?? safeContext.available_quantity;
    const availableQuantity = Number.isFinite(Number(rawAvailable)) && Number(rawAvailable) >= 0 ? Number(rawAvailable) : null;

    const rawRating = item.rating_average ?? item.rating ?? item.reviews?.rating_average ?? safeContext.rating;
    const rating = Number.isFinite(Number(rawRating)) && Number(rawRating) >= 1 && Number(rawRating) <= 5
      ? Number(Number(rawRating).toFixed(2))
      : null;

    const rawReviewCount = item.review_count ?? item.reviews?.paging?.total ?? safeContext.review_count;
    const reviewCount = Number.isFinite(Number(rawReviewCount)) && Number(rawReviewCount) >= 0 ? Number(rawReviewCount) : null;

    return {
      marketplace: 'Mercado Livre',
      source: 'mercadolivre_official_api',
      intent: context.intent,
      domain_id: context.domain_id,
      category_id: context.category_id,
      category_name: context.category_name,
      item_id: item.id || item.item_id || null,
      product_id: item.catalog_product_id || context.product_id || null,
      title: item.title || context.product_name || null,
      current_price: Number.isFinite(Number(item.price)) ? Number(item.price) : (Number.isFinite(Number(item.current_price)) ? Number(item.current_price) : null),
      old_price: Number.isFinite(Number(item.original_price)) ? Number(item.original_price) : (Number.isFinite(Number(item.old_price)) ? Number(item.old_price) : null),
      discount_percent: Number.isFinite(Number(item.original_price)) && Number(item.original_price) > Number(item.price)
        ? Number((((Number(item.original_price) - Number(item.price)) / Number(item.original_price)) * 100).toFixed(2))
        : (Number.isFinite(Number(item.discount_percent)) ? Number(item.discount_percent) : null),
      sold_quantity: soldQuantity,
      available_quantity: availableQuantity,
      rating: rating,
      review_count: reviewCount,
      seller_id: item.seller_id || null,
      official_store_id: item.official_store_id || null,
      shipping_free: item.shipping?.free_shipping === true || item.shipping_free === true,
      image_url: item.thumbnail || item.pictures?.[0]?.url || context.image_url || null,
      product_url: item.permalink || context.product_url || null,
      source_position: context.position || null,
      selected_item_id: item.selected_item_id || item.id || item.item_id || null,
      active_offers_count: item.active_offers_count || 1,
      min_price: item.min_price || (Number.isFinite(Number(item.price)) ? Number(item.price) : (Number.isFinite(Number(item.current_price)) ? Number(item.current_price) : null)),
      max_price: item.max_price || (Number.isFinite(Number(item.price)) ? Number(item.price) : (Number.isFinite(Number(item.current_price)) ? Number(item.current_price) : null)),
      seller_count: item.seller_count || 1,
    };
  });
}

async function runMercadoLivreOfficialIntentCoverage({
  keywords = SCENARIOS.informatica_editorial.keywords,
  accessToken,
  fetchImpl = global.fetch,
  maxPerIntent = 20,
  delayMs = 500,
  now = () => new Date().toISOString()
} = {}) {
  if (!accessToken) throw new Error('accessToken obrigatório');
  const products = [];
  const queries = [];
  const categoryCache = new Map();
  const productCache = new Map();
  const productMetaCache = new Map();
  const reviewCache = new Map();
  let calls = 0;
  for (const intent of keywords) {
    if (queries.length && delayMs > 0) await sleep(delayMs);
    try {
      const intentRawProducts = [];
      let selectedDomain = null;
      let lastError = null;
      const searchTerms = SEARCH_ALIASES[intent] || [intent];
      for (const searchTerm of searchTerms) {
        if (intentRawProducts.length >= maxPerIntent) break;
        let domains = categoryCache.get(searchTerm);
        if (!domains) {
          domains = await apiGet(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(searchTerm)}`, { fetchImpl, accessToken }); calls += 1;
          domains = (Array.isArray(domains) ? domains : []).filter((entry) => entry.category_id);
          const preferredDomains = (PREFERRED_DOMAINS[intent] || []).map((id) => PREFERRED_DOMAIN_META[id]).filter(Boolean);
          domains = [...preferredDomains, ...domains.filter((entry) => !preferredDomains.some((preferred) => preferred.domain_id === entry.domain_id))];
          categoryCache.set(searchTerm, domains);
        }
        for (const domain of rankDomains(domains, intent)) {
          if (intentRawProducts.length >= maxPerIntent) break;
          const domainGate = isDomainRelevant(domain, intent, searchTerm);
          if (!domainGate.relevant) {
            continue;
          }
          try {
            let productIds = [];
            if (domain.domain_id) {
              try {
                const catalogSearch = await apiGet(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(searchTerm)}&domain_id=${encodeURIComponent(domain.domain_id)}&limit=20`, { fetchImpl, accessToken }); calls += 1;
                productIds = (catalogSearch.results || []).map((entry) => entry.id).filter(Boolean).slice(0, 20);
              } catch {
                productIds = [];
              }
            }
            if (!productIds.length && domain.category_id) {
              try {
                const highlights = await apiGet(`/highlights/MLB/category/${domain.category_id}`, { fetchImpl, accessToken }); calls += 1;
                productIds = (highlights.content || []).filter((entry) => entry.type === 'PRODUCT').map((entry) => entry.id).slice(0, 20);
              } catch {
                productIds = [];
              }
            }
            if (!productIds.length) continue;

            const domainItems = [];
            for (let index = 0; index < productIds.length && intentRawProducts.length + domainItems.length < maxPerIntent * 3; index += 1) {
              const productId = productIds[index];
              let productMeta = productMetaCache.get(productId);
              if (!productMeta) {
                try {
                  productMeta = await apiGet(`/products/${productId}`, { fetchImpl, accessToken }); calls += 1;
                  productMetaCache.set(productId, productMeta);
                } catch {
                  productMeta = {};
                }
              }

              const productGate = isProductRelevant(productMeta, intent, searchTerm);
              if (!productGate.relevant) {
                continue;
              }

              let catalogItems = productCache.get(productId);
              if (!catalogItems) {
                try {
                  catalogItems = await apiGet(`/products/${productId}/items?limit=20`, { fetchImpl, accessToken }); calls += 1;
                  productCache.set(productId, catalogItems);
                } catch {
                  catalogItems = { results: [] };
                }
              }

              const itemIds = (catalogItems.results || []).map((item) => item.item_id).filter(Boolean).slice(0, 20);
              if (!itemIds.length) continue;
              let details = [];
              try {
                details = await apiGet(`/items?ids=${itemIds.join(',')}`, { fetchImpl, accessToken }); calls += 1;
                details = details.map((entry) => entry.body).filter(Boolean);
              } catch (error) {
                details = [];
              }
              const catalogFallback = (catalogItems.results || []).filter((item) => itemIds.includes(item.item_id)).map((item) => ({
                ...item,
                id: item.item_id,
                title: productMeta.name || null,
                thumbnail: productMeta.pictures?.[0]?.url || null,
                permalink: productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}`
              }));
              const detailById = new Map(details.map((item) => [item.id, item]));
              const enriched = catalogFallback.map((item) => ({ ...item, ...(detailById.get(item.id) || {}) }));

              for (const item of enriched) {
                let reviewData = reviewCache.get(item.id);
                if (!reviewData) {
                  try {
                    const rev = await apiGet(`/reviews/item/${item.id}`, { fetchImpl, accessToken }); calls += 1;
                    reviewData = {
                      rating_average: Number.isFinite(Number(rev.rating_average)) ? Number(Number(rev.rating_average).toFixed(2)) : null,
                      review_count: Number.isFinite(Number(rev.paging?.total)) ? Number(rev.paging.total) : null
                    };
                  } catch {
                    reviewData = { rating_average: null, review_count: null };
                  }
                  reviewCache.set(item.id, reviewData);
                }
                item.rating_average = reviewData.rating_average;
                item.review_count = reviewData.review_count;
              }

              domainItems.push(...normalizeItems(enriched, {
                intent, domain_id: domain.domain_id, category_id: domain.category_id, category_name: domain.category_name,
                product_id: productId,
                product_name: productMeta.name || null,
                image_url: productMeta.pictures?.[0]?.url || null,
                product_url: productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}`,
                position: index + 1
              }));
            }

            if (domainItems.length > 0) {
              intentRawProducts.push(...domainItems);
              if (!selectedDomain) selectedDomain = domain;
            }
          } catch (error) { lastError = error; }
        }
      }
      const canonicalProducts = deduplicateCanonicalProducts(intentRawProducts).slice(0, maxPerIntent);
      if (!selectedDomain && !canonicalProducts.length) {
        queries.push({ intent, status: searchTerms.length > 1 ? 'no_category' : 'error', products: 0, error: lastError?.message });
        continue;
      }
      products.push(...canonicalProducts);
      const productCount = canonicalProducts.length;
      const minimumProducts = MIN_PRODUCTS_BY_INTENT[intent] || MIN_PRODUCTS_PER_INTENT;
      const gate = coverageGate(productCount, { minimum: minimumProducts });
      queries.push({ intent, status: gate.status, minimum_products: gate.minimum, auto_selectable: gate.auto_selectable, search_terms: searchTerms, domain_id: selectedDomain?.domain_id, category_id: selectedDomain?.category_id, category_name: selectedDomain?.category_name, products: productCount, raw_products: intentRawProducts.length });
    } catch (error) {
      queries.push({ intent, status: 'error', products: 0, error: error.message });
    }
  }
  const byCanonicalKey = new Map();
  const unique = products.filter((product) => {
    const key = product.product_id || product.item_id;
    if (!key || byCanonicalKey.has(key)) return false;
    byCanonicalKey.set(key, product); return true;
  });
  return { generated_at: now(), marketplace: 'Mercado Livre', source: 'official_api', dry_run: true, keywords, queries, products: unique, raw_products: products.length, duplicates: products.length - unique.length, calls };
}

async function main() {
  require('dotenv').config({ path: '.env.local' });
  const scenarioArgIndex = process.argv.indexOf('--scenario');
  const scenarioId = scenarioArgIndex >= 0 ? process.argv[scenarioArgIndex + 1] : 'informatica_editorial';
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Cenário Mercado Livre não encontrado: ${scenarioId}`);
  const accessToken = await refreshAccessToken();
  const result = await runMercadoLivreOfficialIntentCoverage({ accessToken, keywords: scenario.keywords });
  fs.writeFileSync(REPORT_PATH, `${JSON.stringify(result, null, 2)}\n`);
  process.stdout.write(`${JSON.stringify({ file: REPORT_PATH, keywords: result.keywords.length, products: result.products.length, raw_products: result.raw_products, duplicates: result.duplicates, calls: result.calls, failed: result.queries.filter((query) => query.status !== 'ok').length })}\n`);
}

if (require.main === module) main().catch((error) => { console.error(error.message); process.exitCode = 1; });

module.exports = {
  refreshAccessToken,
  persistRefreshedCredentials,
  apiGet,
  normalizeItems,
  runMercadoLivreOfficialIntentCoverage,
  catalogFallbackProducts,
  MIN_PRODUCTS_PER_INTENT,
  SEARCH_ALIASES
};
