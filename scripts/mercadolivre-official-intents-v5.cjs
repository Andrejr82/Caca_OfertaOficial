'use strict';

const fs = require('node:fs');
const { createClient } = require('@supabase/supabase-js');
global.WebSocket = require('ws');
const { SCENARIOS } = require('./amazon-scenario-config.cjs');
const { coverageGate } = require('./coverage-policy.cjs');
const { getMercadoLivreV1Flags } = require('./mercadolivre-v1-flags.cjs');
const {
  MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1,
  getMercadoLivreCertifiedFamilies,
  getMercadoLivreFamilyConfig,
  shouldUseMercadoLivreFamily,
  isMercadoLivreDomainAllowedForFamily,
  getMercadoLivreExtractionRoute,
  getMercadoLivreMapStats
} = require('./mercadolivre-domain-category-map-v1.cjs');
const { COMMERCIAL_NICHES, resolveNicheFromLegacyScenario } = require('./commercial-niche-config.cjs');
const { validateProductTitle } = require('./product-title-quality.cjs');
const { classifyMercadoLivreProduct } = require('./mercadolivre-canonical-classifier.cjs');

const API_ROOT = 'https://api.mercadolibre.com';
const API_TIMEOUT_MS = 45000;
const REPORT_PATH = 'reports/mercadolivre-official-intents-v5-dry-run.json';
const DEFAULT_TENANT_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
const MIN_PRODUCTS_PER_INTENT = 10;
// Quatro páginas oficiais por termo: a política adaptativa existente permite
// profundidade até 4 páginas. O V1 usa esse teto sem criar outra estratégia.
const STRICT_FALLBACK_OFFSETS = Object.freeze([0, 30, 60, 90]);
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
  // Informática: a família continua sendo o identificador canônico; os aliases
  // apenas aprofundam a mesma intenção no endpoint oficial.
  notebook: ['notebook', 'notebook gamer', 'laptop'],
  monitor: ['monitor', 'monitor gamer', 'monitor full hd'],
  ssd: ['ssd', 'ssd nvme', 'ssd sata'],
  impressora: ['impressora', 'impressora multifuncional', 'impressora ecotank'],
  roteador: ['roteador', 'roteador wi-fi 6', 'roteador mesh'],
  'mini pc': ['mini pc', 'mini computador', 'computador mini pc'],
  computador: ['computador', 'computador desktop', 'computador completo'],
  desktop: ['desktop', 'pc desktop', 'computador desktop'],
  teclado: ['teclado', 'teclado mecânico', 'teclado gamer'],
  mouse: ['mouse', 'mouse sem fio', 'mouse gamer'],
  webcam: ['webcam', 'webcam full hd 1080p', 'webcam 4k'],
  'hd externo': ['hd externo', 'disco rígido externo', 'hard drive externo'],
  scanner: ['scanner', 'scanner de documentos', 'scanner código de barras'],
  nobreak: ['nobreak', 'no break', 'ups computador'],
  'switch de rede': ['switch de rede', 'switch ethernet', 'switch gigabit'],
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
  'MLB-HOME_THEATERS': { domain_id: 'MLB-HOME_THEATERS', category_id: 'MLB3839', category_name: 'Home Theaters' },
  'MLB-JACKETS_AND_COATS': { domain_id: 'MLB-JACKETS_AND_COATS', category_id: 'MLB108803', category_name: 'Casacos e Jaquetas' },
  'MLB-SPORT_T_SHIRTS': { domain_id: 'MLB-SPORT_T_SHIRTS', category_id: 'MLB439286', category_name: 'Polos' },
  'MLB-PANTS': { domain_id: 'MLB-PANTS', category_id: 'MLB188065', category_name: 'Calças' },
  'MLB-SWEATSHIRTS_AND_HOODIES': { domain_id: 'MLB-SWEATSHIRTS_AND_HOODIES', category_id: 'MLB108807', category_name: 'Moletons' },
  'MLB-T_SHIRTS': { domain_id: 'MLB-T_SHIRTS', category_id: 'MLB31447', category_name: 'Camisetas e Regatas' },
  'MLB-SHORTS': { domain_id: 'MLB-SHORTS', category_id: 'MLB188064', category_name: 'Bermudas e Shorts' },
  'MLB-SPORTSWEAR_SETS': { domain_id: 'MLB-SPORTSWEAR_SETS', category_id: 'MLB270220', category_name: 'Conjuntos' },
  'MLB-LEGGINGS': { domain_id: 'MLB-LEGGINGS', category_id: 'MLB278018', category_name: 'Leggings' }
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
    if (!/brinquedo|infantil|mini|jogo|fantasia|kids/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (toy_domain_rejected)' };
  }
  if (/ANTIQUE/i.test(dId) || dText.includes('antig') || dText.includes('antigo')) {
    if (!/antig|retr|vintage|coleç/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (antique_domain_rejected)' };
  }
  if (/COMPRESSOR|MOTOR/i.test(dId) || dText.includes('compressor') || dText.includes('motor de')) {
    if (!/compressor|motor|peça|conserto/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (compressor_domain_rejected)' };
  }
  if (/VEHICLE/i.test(dId) || dText.includes('veicular') || dText.includes('para carro')) {
    if (!/veicular|carro|automotiv|caminh|12v|24v/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (vehicle_domain_rejected)' };
  }
  if (/MINERAL_WATER|BEVERAGE|DRINK/i.test(dId) || dText.includes('águas minerais') || dText.includes('bebidas')) {
    if (!/água|mineral|bebida|refrigerante|suco|garrafa/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (water_domain_rejected)' };
  }
  if (/BLENDER_JAR|JAR|PITCHER/i.test(dId) || dText.includes('copo para') || dText.includes('jarra')) {
    if (!/copo|jarra|tampa|lâmina|acessório/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (accessory_jar_domain_rejected)' };
  }
  if (/BAG|COVER|CASE/i.test(dId) && /geladeira|fogão|microondas|televisão|tv|liquidificador|air fryer/i.test(query)) {
    if (!/bolsa|capa|sacola|térmica|case/i.test(query)) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (bag_cover_domain_rejected)' };
  }
  if (/televis|smart\s*tv|tv\s*4k/i.test(query)) {
    if (!/TELEVISION|TV|SMART_TV|ELECTRONICS/i.test(dId) && !dText.includes('televis') && !dText.includes('tv')) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_tv_domain_rejected)' };
  }
  if (/air\s*fryer|fritadeira/i.test(query)) {
    if (!/AIR_FRYER|FRYER|FRITADEIRA|ELECTRICAL_APPLIANCES/i.test(dId) && !dText.includes('fritadeira') && !dText.includes('air fryer') && !dText.includes('eletroport')) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_fryer_domain_rejected)' };
  }
  if (/geladeira|refrigerador/i.test(query)) {
    if (!/REFRIGERATOR|GELADEIRA|FREEZER|APPLIANCES/i.test(dId) && !dText.includes('geladeira') && !dText.includes('refrigerad')) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_refrigerator_domain_rejected)' };
  }
  if (/liquidificador/i.test(query)) {
    if (!/BLENDER|LIQUIDIFICADOR|FOOD_PROCESSORS|APPLIANCES/i.test(dId) && !dText.includes('liquidificador')) return { relevant: false, reason: 'DOMAIN_INTENT_MISMATCH (non_blender_domain_rejected)' };
  }
  return { relevant: true };
}

function isProductRelevant(productMeta, intent, searchTerm) {
  const query = `${intent} ${searchTerm || ''}`.toLocaleLowerCase('pt-BR');
  const title = String(productMeta.name || productMeta.title || '').toLocaleLowerCase('pt-BR');
  if (!title) return { relevant: true };
  if (/purificador|filtro\s+de\s+água|água\s+mineral/i.test(title) && !/água|purificador|filtro|bebedouro/i.test(query)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (water_product_in_appliance_intent)' };
  if (/brinquedo|mini\s+geladeira|casinha|mini\s+brands/i.test(title) && !/brinquedo|infantil|mini|jogo|fantasia|kids/i.test(query)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (toy_product_rejected)' };
  if (/liquidificador/i.test(query) && !/liquidificador|blender|processador/i.test(title) && /purificador|bebedouro|cafeteira|fritadeira/i.test(title)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_blender_product)' };
  if (/air\s*fryer|fritadeira/i.test(query) && !/air\s*fryer|fritadeira|fryer/i.test(title) && /água|purificador|liquidificador|cafeteira/i.test(title)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_air_fryer_product)' };
  if (/cafeteira|máquina\s+de\s+café/i.test(query) && !/cafeteira|café|espresso|cappuccino|nespresso|dolce\s*gusto/i.test(title) && /água|purificador|liquidificador|fritadeira/i.test(title)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_coffee_maker_product)' };
  if (/televis|smart\s*tv|tv\s*4k/i.test(query) && !/tv|televis|smart|monitor|oled|qled|led|4k|uhd/i.test(title) && /água|purificador|receptor|antena/i.test(title)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_tv_product)' };
  if (/geladeira|refrigerador/i.test(query) && !/geladeira|refrigerador|freezer|frigobar/i.test(title) && /água|purificador|liquidificador|brinquedo/i.test(title)) return { relevant: false, reason: 'PRODUCT_INTENT_MISMATCH (non_refrigerator_product)' };
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
  for (const group of byCanonical.values()) {
    const sorted = [...group].sort((a, b) => {
      const priceA = Number.isFinite(a.current_price) && a.current_price > 0 ? a.current_price : Infinity;
      const priceB = Number.isFinite(b.current_price) && b.current_price > 0 ? b.current_price : Infinity;
      if (priceA !== priceB) return priceA - priceB;
      if (a.shipping_free !== b.shipping_free) return a.shipping_free ? -1 : 1;
      return (b.discount_percent || 0) - (a.discount_percent || 0);
    });
    const best = sorted[0];
    const validPrices = group.map((g) => g.current_price).filter((pr) => Number.isFinite(pr) && pr > 0);
    canonicalList.push({
      ...best,
      selected_item_id: best.item_id,
      active_offers_count: group.length,
      min_price: validPrices.length ? Math.min(...validPrices) : best.current_price,
      max_price: validPrices.length ? Math.max(...validPrices) : best.current_price,
      seller_count: new Set(group.map((g) => g.seller_id).filter(Boolean)).size || 1,
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
    const rating = Number.isFinite(Number(rawRating)) && Number(rawRating) >= 1 && Number(rawRating) <= 5 ? Number(Number(rawRating).toFixed(2)) : null;
    const rawReviewCount = item.review_count ?? item.reviews?.paging?.total ?? safeContext.review_count;
    const reviewCount = Number.isFinite(Number(rawReviewCount)) && Number(rawReviewCount) >= 0 ? Number(rawReviewCount) : null;
    const sellerId = item.seller_id || item.seller?.id || null;
    return {
      marketplace: 'Mercado Livre',
      source: context.source || 'mercadolivre_official_api',
      intent: context.intent,
      domain_id: item.domain_id || context.domain_id || null,
      category_id: item.category_id || context.category_id || null,
      category_name: item.category_name || context.category_name || null,
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
      rating,
      review_count: reviewCount,
      seller_id: sellerId,
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

async function collectOfficialSearchFallback({ searchTerm, intent, fetchImpl = global.fetch, accessToken, limit = 30, offset = 0, callsRef, reviewCache } = {}) {
  if (!searchTerm || !accessToken) return [];
  let response;
  try {
    response = await apiGet(`/sites/MLB/search?q=${encodeURIComponent(searchTerm)}&limit=${limit}&offset=${offset}`, { fetchImpl, accessToken });
    if (callsRef) callsRef.count = (callsRef.count || 0) + 1;
  } catch (error) {
    if (callsRef) {
      callsRef.errors = (callsRef.errors || 0) + 1;
      callsRef.lastError = error?.message || String(error);
    }
    return [];
  }
  const rawResults = Array.isArray(response?.results) ? response.results : [];
  if (!rawResults.length) {
    const empty = [];
    Object.defineProperties(empty, {
      rawPageCount: { value: 0 },
      pageExhausted: { value: true },
    });
    return empty;
  }
  const validItems = [];
  let position = offset;
  for (const rawItem of rawResults) {
    position += 1;
    const item = { ...rawItem };
    const title = item.title || item.name || '';
    if (!isProductRelevant({ title, name: title }, intent, searchTerm).relevant) continue;
    if (item.id && reviewCache) {
      let reviewData = reviewCache.get(item.id);
      if (!reviewData && (item.rating_average == null || item.review_count == null)) {
        try {
          const rev = await apiGet(`/reviews/item/${item.id}`, { fetchImpl, accessToken });
          if (callsRef) callsRef.count = (callsRef.count || 0) + 1;
          reviewData = {
            rating_average: Number.isFinite(Number(rev?.rating_average)) ? Number(Number(rev.rating_average).toFixed(2)) : null,
            review_count: Number.isFinite(Number(rev?.paging?.total)) ? Number(rev.paging.total) : null,
          };
        } catch {
          reviewData = { rating_average: null, review_count: null };
        }
        reviewCache.set(item.id, reviewData);
      }
      if (reviewData) {
        if (item.rating_average == null && reviewData.rating_average != null) item.rating_average = reviewData.rating_average;
        if (item.review_count == null && reviewData.review_count != null) item.review_count = reviewData.review_count;
      }
    }
    validItems.push(...normalizeItems([item], {
      source: 'mercadolivre_official_search_fallback', intent,
      domain_id: item.domain_id || null, category_id: item.category_id || null, category_name: item.category_name || null,
      product_name: title, image_url: item.thumbnail || item.pictures?.[0]?.url || null, product_url: item.permalink || null, position,
    }));
  }
  // O tamanho de `validItems` já sofreu filtro semântico e NÃO pode indicar
  // fim da paginação. Guardamos o tamanho bruto para decidir se existe próxima
  // página e evitar o bug que encerrava a busca cedo demais.
  Object.defineProperties(validItems, {
    rawPageCount: { value: rawResults.length },
    pageExhausted: { value: rawResults.length < limit },
  });
  return validItems;
}

function normalizeText(val) {
  return String(val || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function evaluateV1ItemAgainstConfig(item, familyConfig) {
  const domainNorm = String(item.domain_id || item.domainId || '').trim();
  const titleNorm = ` ${normalizeText(item.title || item.name || '')} `;
  const price = Number(item.price ?? item.current_price);
  if (MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1.includes(domainNorm)) return { accepted: false, reason: 'FORBIDDEN_DOMAIN', forbidden: true };
  if (Array.isArray(familyConfig.domainIds) && familyConfig.domainIds.length > 0 && !familyConfig.domainIds.includes(domainNorm)) return { accepted: false, reason: 'DOMAIN_NOT_IN_WHITELIST' };
  if (familyConfig.minPrice && Number.isFinite(price) && price < familyConfig.minPrice * 0.4) return { accepted: false, reason: 'MIN_PRICE_REJECTED', minPrice: true };
  for (const neg of familyConfig.negativeTerms || []) {
    const normNeg = ` ${normalizeText(neg)} `;
    if (normNeg.trim() && titleNorm.includes(normNeg)) return { accepted: false, reason: `NEGATIVE_TERM_MATCH (${neg})` };
  }
  const hasPositive = (familyConfig.positiveTerms || []).some((pos) => {
    const normPos = ` ${normalizeText(pos)} `;
    return normPos.trim() && titleNorm.includes(normPos);
  });
  if (!hasPositive && (!familyConfig.domainIds || !familyConfig.domainIds.includes(domainNorm))) return { accepted: false, reason: 'NO_POSITIVE_TERM_MATCH' };
  return { accepted: true, reason: null };
}

function canUseMercadoLivreV1Fallback(familyConfig) {
  return Boolean(familyConfig && familyConfig.safeForAutomaticSearch === true && Array.isArray(familyConfig.domainIds) && familyConfig.domainIds.length > 0 && ['domain_discovery_highlights', 'domain_discovery_products_search'].includes(familyConfig.bestExtractionRoute));
}

function findCommercialNicheForIntent(scenarioId, intent) {
  const resolved = resolveNicheFromLegacyScenario(scenarioId);
  if (resolved.mode === 'niche_mapped' && resolved.niche) return resolved.niche;
  const target = normalizeText(intent);
  for (const niche of Object.values(COMMERCIAL_NICHES)) {
    const families = [...niche.coreProducts, ...niche.expansionProducts, ...niche.opportunityProducts].map(normalizeText);
    if (families.includes(target)) return niche;
  }
  return null;
}

function intentClassificationType(intent) {
  const classification = classifyMercadoLivreProduct({ title: String(intent || '') });
  return classification.status === 'classified' ? classification.productType : null;
}

function titleMatchesIntent(title, intent) {
  const normalizedTitle = normalizeText(title);
  const candidates = [intent, ...(SEARCH_ALIASES[intent] || [])].map(normalizeText).filter(Boolean);
  if (candidates.some((candidate) => normalizedTitle.includes(candidate))) return true;
  const expectedType = intentClassificationType(intent);
  if (!expectedType) return false;
  const itemType = classifyMercadoLivreProduct({ title }).productType;
  return itemType === expectedType;
}

function evaluateStrictExploratoryItem(item, intent, scenarioId) {
  const title = String(item?.title || item?.name || '').trim();
  const domainId = String(item?.domain_id || item?.domainId || '').trim();
  const categoryId = String(item?.category_id || item?.categoryId || '').trim();
  const price = Number(item?.current_price ?? item?.price);
  if (!title || !Number.isFinite(price) || price <= 0) return { accepted: false, reason: 'INVALID_BASIC_DATA' };
  if (MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1.includes(domainId)) return { accepted: false, reason: 'FORBIDDEN_DOMAIN', forbidden: true };
  const titleQuality = validateProductTitle(title);
  if (!titleQuality.valid) return { accepted: false, reason: titleQuality.reason || 'INVALID_PRODUCT_TITLE' };
  const niche = findCommercialNicheForIntent(scenarioId, intent);
  if (!niche) return { accepted: false, reason: 'INTENT_OUTSIDE_COMMERCIAL_NICHE' };
  const normalizedTitle = ` ${normalizeText(title)} `;
  for (const blocked of niche.guardrails?.blockedProductTerms || []) {
    const normalizedBlocked = ` ${normalizeText(blocked)} `;
    if (normalizedBlocked.trim() && normalizedTitle.includes(normalizedBlocked)) return { accepted: false, reason: `NICHE_BLOCKED_TERM (${blocked})` };
  }
  if (!titleMatchesIntent(title, intent)) return { accepted: false, reason: 'STRICT_INTENT_MISMATCH' };
  const classification = classifyMercadoLivreProduct({ title, domainId, categoryId, intent });
  if (classification.status !== 'classified' || classification.productType === 'unknown') return { accepted: false, reason: 'CLASSIFICATION_NOT_CONFIRMED' };
  return { accepted: true, reason: null, classification };
}

async function runMercadoLivreOfficialIntentCoverageV1({ keywords = SCENARIOS.informatica_editorial.keywords, accessToken, fetchImpl = global.fetch, maxPerIntent = 20, delayMs = 500, now = () => new Date().toISOString(), scenarioId, minConfidence } = {}) {
  if (!accessToken) throw new Error('accessToken obrigatório');
  const mapStats = getMercadoLivreMapStats();
  const discoveryPoolLimit = Math.max(maxPerIntent, Math.min(80, maxPerIntent * 3));
  const telemetry = {
    enabled: true, scenarioId: scenarioId || null, familiesAvailable: mapStats.totalFamilies, familiesUsed: 0,
    highConfidenceFamilies: mapStats.highConfidence, mediumConfidenceFamilies: mapStats.mediumConfidence,
    productsSearchFamilies: mapStats.byRoute.domain_discovery_products_search, highlightsFamilies: mapStats.byRoute.domain_discovery_highlights,
    forbiddenDomainsRejected: 0, semanticAccepted: 0, semanticRejected: 0, minPriceRejected: 0,
    fallbackWhitelistedCalls: 0, fallbackWhitelistedAccepted: 0, fallbackWhitelistedRejected: 0,
    fallbackOpenCalls: 0, dynamicDiscoveryCalls: 0, dynamicDomainsUsed: 0, sourceErrors: 0, exploratoryFamiliesUsed: 0, exploratoryAccepted: 0, exploratoryRejected: 0,
    discoveryPoolLimit, selectedFamilies: [], exploratoryFamilies: [], familyQueries: [], exploratorySamples: Object.create(null)
  };
  const products = [], queries = [];
  const productMetaCache = new Map(), productCache = new Map(), reviewCache = new Map();
  let calls = 0;

  for (const intent of keywords) {
    if (queries.length && delayMs > 0) await sleep(delayMs);
    const isEligible = scenarioId ? shouldUseMercadoLivreFamily(scenarioId, intent, { minConfidence }) : shouldUseMercadoLivreFamily(intent, { minConfidence });
    const familyConfig = scenarioId ? getMercadoLivreFamilyConfig(scenarioId, intent) : getMercadoLivreFamilyConfig(intent);

    if (!isEligible || !familyConfig) {
      const exploratoryRaw = [];
      const searchTerms = SEARCH_ALIASES[intent] || [intent];
      const offsetsAttempted = [];
      let sourceErrors = 0;
      telemetry.exploratoryFamilies.push(intent);
      telemetry.exploratoryFamiliesUsed += 1;

      // Famílias ainda não presentes no mapa certificado também devem usar as
      // rotas oficiais de catálogo. A rota aberta /sites/MLB/search é somente
      // uma compatibilidade de fixtures quando a descoberta dinâmica não
      // retorna domínio algum; nunca é usada depois de uma descoberta válida.
      const discoveredDomains = new Map();
      for (const searchTerm of searchTerms) {
        try {
          const domains = await apiGet(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(searchTerm)}`, { fetchImpl, accessToken });
          calls += 1;
          telemetry.dynamicDiscoveryCalls += 1;
          for (const domain of (Array.isArray(domains) ? domains : [])) {
            const domainId = String(domain?.domain_id || '').trim();
            const categoryId = String(domain?.category_id || '').trim();
            if (!domainId || !categoryId || MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1.includes(domainId)) continue;
            if (!isDomainRelevant(domain, intent, searchTerm).relevant) continue;
            discoveredDomains.set(`${domainId}:${categoryId}`, { ...domain, domain_id: domainId, category_id: categoryId });
          }
        } catch {
          sourceErrors += 1;
          telemetry.sourceErrors += 1;
        }
      }
      telemetry.dynamicDomainsUsed += discoveredDomains.size;
      const dynamicProducts = [];
      for (const domain of rankDomains([...discoveredDomains.values()], intent).slice(0, 3)) {
        let productIds = [];
        try {
          for (const searchTerm of searchTerms) {
            const response = await apiGet(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(searchTerm)}&domain_id=${encodeURIComponent(domain.domain_id)}&limit=20`, { fetchImpl, accessToken });
            calls += 1;
            productIds.push(...(response.results || []).map((entry) => entry.id).filter(Boolean));
          }
        } catch {
          sourceErrors += 1;
          telemetry.sourceErrors += 1;
        }
        if (productIds.length < 5) {
          try {
            const response = await apiGet(`/highlights/MLB/category/${encodeURIComponent(domain.category_id)}`, { fetchImpl, accessToken });
            calls += 1;
            productIds.push(...(response.content || []).filter((entry) => entry.type === 'PRODUCT').map((entry) => entry.id).filter(Boolean));
          } catch {
            sourceErrors += 1;
            telemetry.sourceErrors += 1;
          }
        }
        productIds = [...new Set(productIds)].slice(0, 5);
        for (const productId of productIds) {
          let productMeta = productMetaCache.get(productId);
          if (!productMeta) {
            try { productMeta = await apiGet(`/products/${productId}`, { fetchImpl, accessToken }); calls += 1; productMetaCache.set(productId, productMeta); }
            catch { sourceErrors += 1; telemetry.sourceErrors += 1; continue; }
          }
          let catalogItems = productCache.get(productId);
          if (!catalogItems) {
            try { catalogItems = await apiGet(`/products/${productId}/items?limit=20`, { fetchImpl, accessToken }); calls += 1; productCache.set(productId, catalogItems); }
            catch { sourceErrors += 1; telemetry.sourceErrors += 1; continue; }
          }
          const itemIds = (catalogItems.results || []).map((entry) => entry.item_id).filter(Boolean).slice(0, 20);
          if (!itemIds.length) continue;
          let details = [];
          try {
            const response = await apiGet(`/items?ids=${itemIds.join(',')}`, { fetchImpl, accessToken });
            calls += 1;
            details = Array.isArray(response) ? response.map((entry) => entry.body).filter(Boolean) : [];
          } catch { sourceErrors += 1; telemetry.sourceErrors += 1; continue; }
          const detailById = new Map(details.map((item) => [item.id, item]));
          for (const item of (catalogItems.results || []).filter((entry) => itemIds.includes(entry.item_id))) {
            dynamicProducts.push({
              ...item,
              ...(detailById.get(item.item_id) || {}),
              id: item.item_id,
              catalog_product_id: productId,
              title: productMeta.name || item.title || null,
              thumbnail: productMeta.pictures?.[0]?.url || item.thumbnail || null,
              permalink: detailById.get(item.item_id)?.permalink || productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}`,
              domain_id: domain.domain_id, category_id: domain.category_id,
            });
            if (dynamicProducts.length >= discoveryPoolLimit) break;
          }
          if (dynamicProducts.length >= discoveryPoolLimit) break;
        }
        if (dynamicProducts.length >= discoveryPoolLimit) break;
      }
      for (const item of dynamicProducts) {
        const evaluation = evaluateStrictExploratoryItem(item, intent, scenarioId);
        if (!evaluation.accepted) {
          telemetry.exploratoryRejected += 1;
          if (evaluation.forbidden) telemetry.forbiddenDomainsRejected += 1;
          else telemetry.semanticRejected += 1;
          continue;
        }
        telemetry.exploratoryAccepted += 1;
        telemetry.semanticAccepted += 1;
        const samples = telemetry.exploratorySamples[intent] || [];
        if (samples.length < 3) {
          samples.push({
            title: String(item.title || item.name || '').slice(0, 120),
            domain_id: item.domain_id || null,
            category_id: item.category_id || null,
          });
          telemetry.exploratorySamples[intent] = samples;
        }
        exploratoryRaw.push(...normalizeItems([item], {
          source: 'mercadolivre_v1_dynamic_domain_discovery', intent,
          domain_id: item.domain_id, category_id: item.category_id,
          product_id: item.catalog_product_id, product_name: item.title,
          image_url: item.thumbnail, product_url: item.permalink,
        }));
        if (exploratoryRaw.length >= discoveryPoolLimit) break;
      }

      for (const searchTerm of searchTerms) {
        if (discoveredDomains.size > 0) break;
        for (const offset of STRICT_FALLBACK_OFFSETS) {
          if (exploratoryRaw.length >= discoveryPoolLimit) break;
          const callsRefLocal = { count: 0, errors: 0 };
          telemetry.fallbackOpenCalls += 1;
          offsetsAttempted.push({ searchTerm, offset });
          const fallbackItems = await collectOfficialSearchFallback({ searchTerm, intent, fetchImpl, accessToken, limit: 30, offset, callsRef: callsRefLocal, reviewCache: null });
          calls += callsRefLocal.count;
          sourceErrors += callsRefLocal.errors || 0;
          telemetry.sourceErrors += callsRefLocal.errors || 0;
          for (const item of fallbackItems) {
            const evaluation = evaluateStrictExploratoryItem(item, intent, scenarioId);
            if (!evaluation.accepted) {
              telemetry.exploratoryRejected += 1;
              if (evaluation.forbidden) telemetry.forbiddenDomainsRejected += 1;
              else telemetry.semanticRejected += 1;
              continue;
            }
            telemetry.exploratoryAccepted += 1;
            telemetry.semanticAccepted += 1;
            exploratoryRaw.push({ ...item, source: 'mercadolivre_v1_strict_exploratory' });
            if (exploratoryRaw.length >= discoveryPoolLimit) break;
          }
          if (fallbackItems.pageExhausted === true) break;
        }
        if (exploratoryRaw.length >= discoveryPoolLimit) break;
      }
      const canonicalProducts = deduplicateCanonicalProducts(exploratoryRaw).slice(0, discoveryPoolLimit);
      products.push(...canonicalProducts);
      const gate = coverageGate(canonicalProducts.length, { minimum: 5 });
      const queryRow = {
        intent, status: canonicalProducts.length ? gate.status : 'strict_exploratory_empty', minimum_products: gate.minimum,
        auto_selectable: gate.auto_selectable, products: canonicalProducts.length, raw_products: exploratoryRaw.length,
        search_terms: searchTerms, offsets_attempted: offsetsAttempted, source_errors: sourceErrors,
        source_strategy: discoveredDomains.size > 0 ? 'mercadolivre_v1_dynamic_domain_discovery' : 'mercadolivre_v1_strict_exploratory'
      };
      queries.push(queryRow);
      telemetry.familyQueries.push(queryRow);
      continue;
    }

    telemetry.selectedFamilies.push(familyConfig.family);
    const intentRawProducts = [];
    const domainWhitelist = familyConfig.domainIds || [];
    const categoryWhitelist = familyConfig.categoryIds || [];
    const bestRoute = familyConfig.bestExtractionRoute;
    const routesToTry = bestRoute === 'domain_discovery_products_search' ? ['products_search', 'highlights'] : ['highlights', 'products_search'];
    const offsetsAttempted = [];
    let sourceErrors = 0;

    for (const routeType of routesToTry) {
      if (intentRawProducts.length >= discoveryPoolLimit) break;
      let productIds = [];
      if (routeType === 'products_search') {
        for (const domainId of domainWhitelist) {
          if (productIds.length >= 20) break;
          try {
            for (const st of SEARCH_ALIASES[intent] || [intent]) {
              if (productIds.length >= 20) break;
              const res = await apiGet(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(st)}&domain_id=${encodeURIComponent(domainId)}&limit=20`, { fetchImpl, accessToken });
              calls += 1;
              productIds.push(...(res.results || []).map((e) => e.id).filter(Boolean));
            }
          } catch { sourceErrors += 1; telemetry.sourceErrors += 1; }
        }
      } else {
        for (const catId of categoryWhitelist) {
          if (productIds.length >= 20) break;
          try {
            const res = await apiGet(`/highlights/MLB/category/${catId}`, { fetchImpl, accessToken });
            calls += 1;
            productIds.push(...(res.content || []).filter((e) => e.type === 'PRODUCT').map((e) => e.id).filter(Boolean));
          } catch { sourceErrors += 1; telemetry.sourceErrors += 1; }
        }
      }
      productIds = [...new Set(productIds)].slice(0, 20);
      for (let index = 0; index < productIds.length && intentRawProducts.length < discoveryPoolLimit; index += 1) {
        const productId = productIds[index];
        let productMeta = productMetaCache.get(productId);
        if (!productMeta) {
          try { productMeta = await apiGet(`/products/${productId}`, { fetchImpl, accessToken }); calls += 1; productMetaCache.set(productId, productMeta); } catch { productMeta = {}; sourceErrors += 1; telemetry.sourceErrors += 1; }
        }
        let catalogItems = productCache.get(productId);
        if (!catalogItems) {
          try { catalogItems = await apiGet(`/products/${productId}/items?limit=20`, { fetchImpl, accessToken }); calls += 1; productCache.set(productId, catalogItems); } catch { catalogItems = { results: [] }; sourceErrors += 1; telemetry.sourceErrors += 1; }
        }
        const itemIds = (catalogItems.results || []).map((i) => i.item_id).filter(Boolean).slice(0, 20);
        if (!itemIds.length) continue;
        let details = [];
        try { details = await apiGet(`/items?ids=${itemIds.join(',')}`, { fetchImpl, accessToken }); calls += 1; details = Array.isArray(details) ? details.map((e) => e.body).filter(Boolean) : []; } catch { details = []; sourceErrors += 1; telemetry.sourceErrors += 1; }
        const detailById = new Map(details.map((item) => [item.id, item]));
        const enriched = (catalogItems.results || []).filter((item) => itemIds.includes(item.item_id)).map((item) => ({
          ...item, id: item.item_id, title: productMeta.name || null, thumbnail: productMeta.pictures?.[0]?.url || null,
          permalink: productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}`,
          domain_id: domainWhitelist[0] || null, category_id: categoryWhitelist[0] || null,
          ...(detailById.get(item.item_id) || {})
        }));
        for (const item of enriched) {
          const evalRes = evaluateV1ItemAgainstConfig(item, familyConfig);
          if (!evalRes.accepted) {
            if (evalRes.forbidden) telemetry.forbiddenDomainsRejected += 1;
            else if (evalRes.minPrice) telemetry.minPriceRejected += 1;
            else telemetry.semanticRejected += 1;
            continue;
          }
          telemetry.semanticAccepted += 1;
          intentRawProducts.push(...normalizeItems([item], {
            source: 'mercadolivre_v1_certified', intent, domain_id: item.domain_id || domainWhitelist[0] || null,
            category_id: item.category_id || categoryWhitelist[0] || null, product_id: productId,
            product_name: productMeta.name || null, image_url: productMeta.pictures?.[0]?.url || null,
            product_url: productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}`, position: index + 1
          }));
          if (intentRawProducts.length >= discoveryPoolLimit) break;
        }
      }
    }

    if (intentRawProducts.length < discoveryPoolLimit && canUseMercadoLivreV1Fallback(familyConfig)) {
      for (const st of SEARCH_ALIASES[intent] || [intent]) {
        for (const offset of STRICT_FALLBACK_OFFSETS) {
          if (intentRawProducts.length >= discoveryPoolLimit) break;
          const callsRefLocal = { count: 0, errors: 0 };
          telemetry.fallbackWhitelistedCalls += 1;
          offsetsAttempted.push({ searchTerm: st, offset });
          const fallbackItems = await collectOfficialSearchFallback({ searchTerm: st, intent, fetchImpl, accessToken, limit: 30, offset, callsRef: callsRefLocal, reviewCache });
          calls += callsRefLocal.count;
          sourceErrors += callsRefLocal.errors || 0;
          telemetry.sourceErrors += callsRefLocal.errors || 0;
          for (const fItem of fallbackItems) {
            const evalRes = evaluateV1ItemAgainstConfig(fItem, familyConfig);
            if (!evalRes.accepted) {
              telemetry.fallbackWhitelistedRejected += 1;
              if (evalRes.forbidden) telemetry.forbiddenDomainsRejected += 1;
              else if (evalRes.minPrice) telemetry.minPriceRejected += 1;
              else telemetry.semanticRejected += 1;
              continue;
            }
            telemetry.semanticAccepted += 1;
            telemetry.fallbackWhitelistedAccepted += 1;
            intentRawProducts.push(fItem);
            if (intentRawProducts.length >= discoveryPoolLimit) break;
          }
          if (fallbackItems.pageExhausted === true) break;
        }
        if (intentRawProducts.length >= discoveryPoolLimit) break;
      }
    }

    const canonicalProducts = deduplicateCanonicalProducts(intentRawProducts).slice(0, discoveryPoolLimit);
    products.push(...canonicalProducts);
    const gate = coverageGate(canonicalProducts.length, { minimum: 5 });
    const queryRow = {
      intent, status: gate.status, minimum_products: gate.minimum, auto_selectable: gate.auto_selectable,
      domain_id: domainWhitelist[0] || null, category_id: categoryWhitelist[0] || null,
      products: canonicalProducts.length, raw_products: intentRawProducts.length,
      search_terms: SEARCH_ALIASES[intent] || [intent], offsets_attempted: offsetsAttempted, source_errors: sourceErrors,
      source_strategy: `mercadolivre_v1_${bestRoute}_deep`
    };
    queries.push(queryRow);
    telemetry.familyQueries.push(queryRow);
  }

  telemetry.familiesUsed = telemetry.selectedFamilies.length + telemetry.exploratoryFamiliesUsed;
  const byCanonicalKey = new Map();
  const unique = products.filter((product) => {
    const key = product.product_id || product.item_id;
    if (!key || byCanonicalKey.has(key)) return false;
    byCanonicalKey.set(key, product);
    return true;
  });
  return {
    generated_at: now(), marketplace: 'Mercado Livre', source: 'official_api_v1_certified_plus_strict_exploratory', dry_run: true,
    keywords, queries, products: unique, raw_products: products.length, duplicates: products.length - unique.length, calls,
    mercadolivreDomainCategorySearchV1: telemetry
  };
}

async function runMercadoLivreOfficialIntentCoverage({ keywords = SCENARIOS.informatica_editorial.keywords, accessToken, fetchImpl = global.fetch, maxPerIntent = 20, delayMs = 500, now = () => new Date().toISOString(), env = process.env, scenarioId, minConfidence } = {}) {
  const flags = getMercadoLivreV1Flags(env);
  if (flags.domainCategorySearch) return runMercadoLivreOfficialIntentCoverageV1({ keywords, accessToken, fetchImpl, maxPerIntent, delayMs, now, scenarioId, minConfidence });
  if (!accessToken) throw new Error('accessToken obrigatório');
  const products = [], queries = [];
  const categoryCache = new Map(), productCache = new Map(), productMetaCache = new Map(), reviewCache = new Map();
  let calls = 0;
  for (const intent of keywords) {
    if (queries.length && delayMs > 0) await sleep(delayMs);
    try {
      const intentRawProducts = [];
      let selectedDomain = null, lastError = null;
      const searchTerms = SEARCH_ALIASES[intent] || [intent];
      for (const searchTerm of searchTerms) {
        if (intentRawProducts.length >= maxPerIntent) break;
        let domains = categoryCache.get(searchTerm);
        if (!domains) {
          try {
            domains = await apiGet(`/sites/MLB/domain_discovery/search?q=${encodeURIComponent(searchTerm)}`, { fetchImpl, accessToken }); calls += 1;
            domains = (Array.isArray(domains) ? domains : []).filter((entry) => entry.category_id);
            const preferredDomains = (PREFERRED_DOMAINS[intent] || []).map((id) => PREFERRED_DOMAIN_META[id]).filter(Boolean);
            domains = [...preferredDomains, ...domains.filter((entry) => !preferredDomains.some((preferred) => preferred.domain_id === entry.domain_id))];
            categoryCache.set(searchTerm, domains);
          } catch (err) { domains = []; lastError = err; }
        }
        for (const domain of rankDomains(domains, intent)) {
          if (intentRawProducts.length >= maxPerIntent) break;
          if (!isDomainRelevant(domain, intent, searchTerm).relevant) continue;
          try {
            let productIds = [];
            if (domain.domain_id) {
              try { const catalogSearch = await apiGet(`/products/search?status=active&site_id=MLB&q=${encodeURIComponent(searchTerm)}&domain_id=${encodeURIComponent(domain.domain_id)}&limit=20`, { fetchImpl, accessToken }); calls += 1; productIds = (catalogSearch.results || []).map((entry) => entry.id).filter(Boolean).slice(0, 20); } catch { productIds = []; }
            }
            if (!productIds.length && domain.category_id) {
              try { const highlights = await apiGet(`/highlights/MLB/category/${domain.category_id}`, { fetchImpl, accessToken }); calls += 1; productIds = (highlights.content || []).filter((entry) => entry.type === 'PRODUCT').map((entry) => entry.id).slice(0, 20); } catch { productIds = []; }
            }
            if (!productIds.length) continue;
            const domainItems = [];
            for (let index = 0; index < productIds.length && intentRawProducts.length + domainItems.length < maxPerIntent * 3; index += 1) {
              const productId = productIds[index];
              let productMeta = productMetaCache.get(productId);
              if (!productMeta) { try { productMeta = await apiGet(`/products/${productId}`, { fetchImpl, accessToken }); calls += 1; productMetaCache.set(productId, productMeta); } catch { productMeta = {}; } }
              if (!isProductRelevant(productMeta, intent, searchTerm).relevant) continue;
              let catalogItems = productCache.get(productId);
              if (!catalogItems) { try { catalogItems = await apiGet(`/products/${productId}/items?limit=20`, { fetchImpl, accessToken }); calls += 1; productCache.set(productId, catalogItems); } catch { catalogItems = { results: [] }; } }
              const itemIds = (catalogItems.results || []).map((item) => item.item_id).filter(Boolean).slice(0, 20);
              if (!itemIds.length) continue;
              let details = [];
              try { details = await apiGet(`/items?ids=${itemIds.join(',')}`, { fetchImpl, accessToken }); calls += 1; details = details.map((entry) => entry.body).filter(Boolean); } catch { details = []; }
              const catalogFallback = (catalogItems.results || []).filter((item) => itemIds.includes(item.item_id)).map((item) => ({ ...item, id: item.item_id, title: productMeta.name || null, thumbnail: productMeta.pictures?.[0]?.url || null, permalink: productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}` }));
              const detailById = new Map(details.map((item) => [item.id, item]));
              const enriched = catalogFallback.map((item) => ({ ...item, ...(detailById.get(item.id) || {}) }));
              for (const item of enriched) {
                let reviewData = reviewCache.get(item.id);
                if (!reviewData) {
                  try { const rev = await apiGet(`/reviews/item/${item.id}`, { fetchImpl, accessToken }); calls += 1; reviewData = { rating_average: Number.isFinite(Number(rev.rating_average)) ? Number(Number(rev.rating_average).toFixed(2)) : null, review_count: Number.isFinite(Number(rev.paging?.total)) ? Number(rev.paging.total) : null }; }
                  catch { reviewData = { rating_average: null, review_count: null }; }
                  reviewCache.set(item.id, reviewData);
                }
                item.rating_average = reviewData.rating_average; item.review_count = reviewData.review_count;
              }
              domainItems.push(...normalizeItems(enriched, { intent, domain_id: domain.domain_id, category_id: domain.category_id, category_name: domain.category_name, product_id: productId, product_name: productMeta.name || null, image_url: productMeta.pictures?.[0]?.url || null, product_url: productMeta.permalink || `https://www.mercadolivre.com.br/p/${productId}`, position: index + 1 }));
            }
            if (domainItems.length > 0) { intentRawProducts.push(...domainItems); if (!selectedDomain) selectedDomain = domain; }
          } catch (error) { lastError = error; }
        }
      }
      const minimumProducts = MIN_PRODUCTS_BY_INTENT[intent] || MIN_PRODUCTS_PER_INTENT;
      const targetCount = Math.max(minimumProducts, maxPerIntent);
      let fallbackSearchUsed = false, fallbackSearchProducts = 0, fallbackSearchCalls = 0;
      const fallbackSearchTerms = [];
      if (intentRawProducts.length < minimumProducts) {
        const callsBefore = calls;
        for (const searchTerm of searchTerms) {
          if (intentRawProducts.length >= targetCount) break;
          let termUsed = false;
          for (const offset of STRICT_FALLBACK_OFFSETS) {
            if (intentRawProducts.length >= targetCount) break;
            const callsRefLocal = { count: 0 };
            const fallbackItems = await collectOfficialSearchFallback({ searchTerm, intent, fetchImpl, accessToken, limit: 30, offset, callsRef: callsRefLocal, reviewCache });
            calls += callsRefLocal.count;
            if (fallbackItems.length > 0) {
              fallbackSearchUsed = true; fallbackSearchProducts += fallbackItems.length; intentRawProducts.push(...fallbackItems); termUsed = true;
              if (!selectedDomain && fallbackItems[0]?.domain_id) selectedDomain = { domain_id: fallbackItems[0].domain_id, category_id: fallbackItems[0].category_id, category_name: fallbackItems[0].category_name };
            }
            if (fallbackItems.pageExhausted === true) break;
            if (delayMs > 0) await sleep(delayMs);
          }
          if (termUsed) fallbackSearchTerms.push(searchTerm);
        }
        fallbackSearchCalls = calls - callsBefore;
      }
      const canonicalProducts = deduplicateCanonicalProducts(intentRawProducts).slice(0, maxPerIntent);
      if (!selectedDomain && !canonicalProducts.length) {
        queries.push({ intent, status: searchTerms.length > 1 ? 'no_category' : 'error', products: 0, error: lastError?.message, fallback_search_used: fallbackSearchUsed, fallback_search_products: fallbackSearchProducts, fallback_search_terms: fallbackSearchTerms, fallback_search_calls: fallbackSearchCalls, source_strategy: fallbackSearchUsed ? 'catalog_then_highlights_then_search_fallback' : 'catalog_then_highlights' });
        continue;
      }
      products.push(...canonicalProducts);
      const gate = coverageGate(canonicalProducts.length, { minimum: minimumProducts });
      queries.push({ intent, status: gate.status, minimum_products: gate.minimum, auto_selectable: gate.auto_selectable, search_terms: searchTerms, domain_id: selectedDomain?.domain_id, category_id: selectedDomain?.category_id, category_name: selectedDomain?.category_name, products: canonicalProducts.length, raw_products: intentRawProducts.length, fallback_search_used: fallbackSearchUsed, fallback_search_products: fallbackSearchProducts, fallback_search_terms: fallbackSearchTerms, fallback_search_calls: fallbackSearchCalls, source_strategy: fallbackSearchUsed ? 'catalog_then_highlights_then_search_fallback' : 'catalog_then_highlights' });
    } catch (error) { queries.push({ intent, status: 'error', products: 0, error: error.message }); }
  }
  const byCanonicalKey = new Map();
  const unique = products.filter((product) => { const key = product.product_id || product.item_id; if (!key || byCanonicalKey.has(key)) return false; byCanonicalKey.set(key, product); return true; });
  return { generated_at: now(), marketplace: 'Mercado Livre', source: 'official_api', dry_run: true, keywords, queries, products: unique, raw_products: products.length, duplicates: products.length - unique.length, calls };
}

async function main() {
  require('dotenv').config({ path: '.env.local' });
  const scenarioArgIndex = process.argv.indexOf('--scenario');
  const scenarioId = scenarioArgIndex >= 0 ? process.argv[scenarioArgIndex + 1] : 'informatica_editorial';
  const scenario = SCENARIOS[scenarioId];
  if (!scenario) throw new Error(`Cenário Mercado Livre não encontrado: ${scenarioId}`);
  const accessToken = await refreshAccessToken();
  const result = await runMercadoLivreOfficialIntentCoverage({ accessToken, keywords: scenario.keywords, scenarioId });
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
  runMercadoLivreOfficialIntentCoverageV1,
  canUseMercadoLivreV1Fallback,
  evaluateV1ItemAgainstConfig,
  evaluateStrictExploratoryItem,
  collectOfficialSearchFallback,
  catalogFallbackProducts,
  MIN_PRODUCTS_PER_INTENT,
  MIN_PRODUCTS_BY_INTENT,
  SEARCH_ALIASES,
  STRICT_FALLBACK_OFFSETS
};
