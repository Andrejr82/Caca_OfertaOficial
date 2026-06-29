/**
 * ═══════════════════════════════════════════════════════════════
 *  LOCAL-SCRAPER.CJS — Extração Desacoplada (Windows Notebook)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Script isolado responsável APENAS por orquestrar a extração.
 * Delega o bypass de WAF para a API do Scrape.do.
 * Salva tudo como DRAFT no Supabase.
 */

'use strict';

global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
const axios = require('axios');
const cheerio = require('cheerio');
require('dotenv').config({ path: '.env.local' });

// ─── Supabase Admin Client ────────────────────────────────────
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  }
);

const ADMIN_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';

const ML_AFFILIATE_ID = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID = process.env.MAGALU_PARTNER_ID || '';

// ─── Golden Queries (Categorias) ──────────────────────────────
const GOLDEN_QUERIES = {
  'Mercado Livre': {
    'Supermercado': ['Sabão em pó Omo', 'Amaciante Downy'],
    'Eletrônicos': ['Smartphone Samsung Galaxy', 'Fritadeira Air Fryer']
  },
  'Amazon': {
    'Tecnologia': ['iPhone', 'Fone de Ouvido Bluetooth'],
    'Casa': ['Cafeteira Nespresso', 'Aspirador de Pó Vertical']
  }
};

function getRandomQueries(store) {
  const categories = GOLDEN_QUERIES[store] || {};
  const selected = [];
  for (const cat in categories) {
    const list = categories[cat];
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    selected.push(...shuffled.slice(0, 1));
  }
  return selected;
}

// ─── Utilidades ───────────────────────────────────────────────
function cleanProductUrl(url) {
  if (!url) return null;
  try {
    const obj = new URL(url);
    obj.search = '';
    obj.hash = '';
    return obj.toString();
  } catch (e) {
    return url;
  }
}

function buildAffiliateUrl(originalUrl, store) {
  try {
    const obj = new URL(originalUrl);
    if (store === 'Mercado Livre' && ML_AFFILIATE_ID) { obj.searchParams.set('dealerRef', ML_AFFILIATE_ID); return obj.toString(); }
    if (store === 'Amazon' && AMAZON_TAG) { obj.searchParams.set('tag', AMAZON_TAG); return obj.toString(); }
    if (store === 'Magalu' && MAGALU_PARTNER_ID) { obj.hostname = 'www.magazinevoce.com.br'; obj.pathname = `/${MAGALU_PARTNER_ID}${obj.pathname}`; return obj.toString(); }
  } catch (_) { }
  return originalUrl;
}

// ─── Salvar como Draft ────────────────────────────────────────
async function upsertDraftOffer(product, store, affiliateUrl) {
  const { data: existing } = await supabase.from('offers')
    .select('id, current_price')
    .eq('original_url', affiliateUrl)
    .eq('user_id', ADMIN_USER_ID)
    .maybeSingle();

  if (existing) {
    if (Number(existing.current_price) !== product.current_price) {
      await supabase.from('offers').update({
        current_price: product.current_price,
        old_price: product.old_price,
        image_url: product.image_url,
        status: 'draft',
        updated_at: new Date().toISOString()
      }).eq('id', existing.id);
    }
    return { id: existing.id, isNew: false };
  }

  const { data, error } = await supabase.from('offers').insert({
    user_id: ADMIN_USER_ID,
    platform: store,
    product_name: product.product_name,
    original_url: affiliateUrl,
    image_url: product.image_url,
    current_price: product.current_price,
    old_price: product.old_price,
    rating: product.rating,
    category: product.category,
    score: 0,
    status: 'draft',
    notes: `[Scrape.do] Importado às ${new Date().toLocaleString('pt-BR')}`,
  }).select('id').single();

  if (error) {
    console.error(`  ✗ Erro insert: ${error.message}`);
    return null;
  }
  return { id: data.id, isNew: true };
}

// ─── Motor Principal de Extração (Scrape.do API) ──────────────
async function scrapeDoExtract(url, storeName) {
  const keys = (process.env.SCRAPFLY_API_KEYS || "").split(",").map(k => k.trim()).filter(k => k);
  if (keys.length === 0) {
    console.error("❌ SCRAPEDO_API_KEY não encontrada no .env.local!");
    return [];
  }

  let html = null;

  // Tenta as chaves em ordem (Fallback rotativo)
  for (let i = 0; i < keys.length; i++) {
    const apiKey = keys[i];
    try {
      const response = await axios.get('https://scrapfly.io', {
        params: {
          token: apiKey,
          url: url,
          geoCode: 'br',
          super: 'true', // Proxy Residencial Premium OBRIGATÓRIO
          render: 'false' // Burlar WAF que detecta Chrome
        }
      });

      if (response.data && response.data.length > 500) {
        html = response.data;
        break; // Sucesso, sai do loop de chaves
      }
    } catch (err) {
      console.error(`  [Scrape.do] Chave ${i + 1} falhou. Tentando próxima...`);
    }
  }

  if (!html) {
    console.error(`  [Scrape.do] Todas as chaves falharam ou WAF bloqueou a nuvem para ${storeName}.`);
    return [];
  }

  const products = [];
  const $ = cheerio.load(html);
  const items = $('.poly-card, .ui-search-layout__item, div.ui-search-result');

  items.each((i, el) => {
    const title = $(el).find('h2.poly-box, h2.ui-search-item__title, .poly-component__title, h2').first().text().trim();
    if (!title) return;

    // Link
    const linkTag = $(el).is('a') ? $(el) : $(el).find('a').first();
    const link = linkTag.attr('href') || '';
    if (!link) return;

    // Preço
    let priceText = $(el).find('.poly-price__current .andes-money-amount__fraction, .ui-search-price--size-medium .andes-money-amount__fraction').first().text().trim();
    if (!priceText) priceText = $(el).find('.andes-money-amount__fraction').first().text().trim();
    if (!priceText) return;

    const current_price = parseFloat(priceText.replace(/\./g, '').replace(',', '.'));
    if (isNaN(current_price)) return;

    // Preço Antigo (Cortado)
    let old_price = null;
    let oldPriceText = $(el).find('.s-price-strike, .andes-money-amount--previous .andes-money-amount__fraction').first().text().trim();
    if (oldPriceText) {
      const op = parseFloat(oldPriceText.replace(/\./g, '').replace(',', '.'));
      if (!isNaN(op) && op > current_price) old_price = op;
    }

    // Imagem
    const imgTag = $(el).find('img.s-image, img.ui-search-result-image__element, img.poly-component__picture, img[data-testid="image"]').first();
    let image_url = imgTag.attr('data-src') || imgTag.attr('src') || '';
    if (!image_url && imgTag.attr('data-a-dynamic-image')) {
      try { image_url = Object.keys(JSON.parse(imgTag.attr('data-a-dynamic-image')))[0]; } catch (e) { }
    }

    products.push({
      product_name: title.substring(0, 150),
      current_price,
      old_price,
      image_url,
      link,
      category: 'Geral',
      rating: null
    });
  });

  // Dedup por link limpo
  const unique = [];
  const seen = new Set();
  for (const p of products) {
    const cleanL = cleanProductUrl(p.link);
    if (!seen.has(cleanL)) {
      seen.add(cleanL);
      unique.push(p);
    }
  }

  console.log(`  [Scrape.do] Parse local concluiu: ${unique.length} ofertas únicas.`);
  return unique;
}

// ─── Fluxo Principal ──────────────────────────────────────────
async function runLocalScrapingCycle() {
  const stores = ['Mercado Livre'];

  for (const store of stores) {
    console.log(`\n===========================================`);
    console.log(`🤖 Iniciando Local Scraper via Nuvem na loja: ${store}`);
    console.log(`===========================================`);

    const queries = getRandomQueries(store);
    let totalDrafts = 0;

    for (const term of queries) {
      console.log(`\n➔ Buscando por: "${term}"`);
      const searchUrl = `https://lista.mercadolivre.com.br/${encodeURIComponent(term)}`;

      const extractedProducts = await scrapeDoExtract(searchUrl, store);

      let saved = 0;
      for (const product of extractedProducts) {
        const cleanUrl = cleanProductUrl(product.link);
        if (!cleanUrl) continue;

        const affiliateUrl = buildAffiliateUrl(cleanUrl, store);
        const res = await upsertDraftOffer(product, store, affiliateUrl);
        if (res) saved++;
      }

      console.log(`  ✓ ${saved} produtos processados e enviados para o Banco (Supabase).`);
      totalDrafts += saved;

      // Delay de segurança entre requests na mesma chave
      await new Promise(r => setTimeout(r, 2000));
    }
    console.log(`\n✅ Resumo ${store}: ${totalDrafts} ofertas raspadas com Scrape.do.`);
  }
}

// ─── CLI Entrypoint ───────────────────────────────────────────
if (require.main === module) {
  runLocalScrapingCycle().then(() => {
    console.log("\n🚀 Execução Local Finalizada com Nuvem Scrape.do.");
    process.exit(0);
  }).catch(err => {
    console.error("\n❌ Erro Crítico:", err);
    process.exit(1);
  });
}
