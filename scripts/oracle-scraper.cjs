/**
 * ═══════════════════════════════════════════════════════════════
 *  ORACLE-SCRAPER.CJS — Robô Caçador de Ofertas V2 (Oracle Cloud)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Processo permanente gerenciado pelo PM2.
 * Roda a cada 4 horas: raspa as lojas, filtra matematicamente,
 * envia as 3 melhores para a Groq (Llama-3), gera links e posta rascunhos.
 */

'use strict';

global.WebSocket = require('ws');

const cron    = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const ws      = require('ws');
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

// ─── Configurações ────────────────────────────────────────────
const FIRECRAWL_KEY   = process.env.FIRECRAWL_API_KEY;
const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const ADMIN_USER_ID   = '7a9ca7b7-f464-46e0-a9de-9b322c73628a'; // ID do André
const OFFERS_PER_STORE = 8;
const CLEANUP_DAYS     = 7;
const CRON_SCHEDULE    = '0 */4 * * *';
const VIP_SLOTS        = 3; // Limite rigoroso de chamadas à API da IA por ciclo (Proteção Free Tier)
const APPROVAL_SCORE   = 7.3; // Nota mínima para ser considerado "Top Offer"

const ML_AFFILIATE_ID      = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG           = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID    = process.env.MAGALU_PARTNER_ID || '';
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_NETSHOES_MID = process.env.RAKUTEN_NETSHOES_MID || '43984';

// ─── Listas Virais ────────────────────────────────────────────
const VIRAL_QUERIES = {
  'Mercado Livre': ['airfryer oferta', 'celular oferta', 'fone bluetooth', 'aspirador robô', 'monitor gamer'],
  'Shopee':        ['kit cozinha', 'suporte celular', 'relógio smartwatch', 'luminária led', 'bolsa feminina'],
  'Amazon':        ['kindle oferta', 'echo dot', 'impressora', 'headphone', 'câmera de segurança'],
  'Shein':         ['vestido promoção', 'conjunto feminino', 'bolsa tendência', 'calçado feminino', 'acessórios moda'],
  'Magalu':        ['tv oferta', 'geladeira promoção', 'micro-ondas', 'máquina de lavar', 'notebook'],
  'Netshoes':      ['tênis corrida', 'chuteira', 'bola futebol', 'suplemento proteína', 'camiseta esporte'],
};

const queryIndex = {};
Object.keys(VIRAL_QUERIES).forEach(s => { queryIndex[s] = 0; });

function getNextQuery(store) {
  const queries = VIRAL_QUERIES[store];
  const q = queries[queryIndex[store] % queries.length];
  queryIndex[store]++;
  return q;
}

// ─── Extração via Firecrawl ───────────────────────────────────
async function firecrawlExtract(url, limit, storeName, attempt = 1) {
  if (!FIRECRAWL_KEY) return [];
  const MAX_RETRIES = 2;
  const prompt = `Você é um robô caçador de achadinhos. Extraia TODOS os produtos da página que sejam CLARAMENTE uma promoção. ` +
    `Inclua: 1) preço antigo riscado; 2) selos de desconto; 3) tags de oferta. ` +
    `Retorne: title, url (completa com https://), image, price (número), old_price (número/null), discount_badge, rating, category.`;

  try {
    console.log(`  [Firecrawl] ${storeName} — tentativa ${attempt}/${MAX_RETRIES}...`);
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${FIRECRAWL_KEY}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        url, formats: ['extract'], waitFor: 8000, timeout: 60000, mobile: true, proxy: 'stealth', blockAds: true,
        extract: {
          prompt,
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title: { type: 'string' }, url: { type: 'string' }, image: { type: 'string' },
                    price: { type: 'number' }, old_price: { type: 'number', nullable: true },
                    discount_badge: { type: 'string', nullable: true }, rating: { type: 'number', nullable: true },
                    category: { type: 'string' },
                  },
                  required: ['title', 'url', 'price'],
                },
              },
            },
            required: ['products'],
          },
        },
      }),
    });

    if (res.status === 408 || res.status === 429) {
      if (attempt < MAX_RETRIES) {
        await new Promise(r => setTimeout(r, attempt * 15000));
        return firecrawlExtract(url, limit, storeName, attempt + 1);
      }
      return [];
    }
    if (!res.ok) return [];

    const data = await res.json();
    const products = data?.data?.extract?.products || [];
    return products.filter(p => p.title && p.price > 0 && ((p.old_price && p.old_price > p.price) || (p.discount_badge && p.discount_badge.trim().length > 0))).slice(0, limit);
  } catch (err) {
    console.error(`  [Firecrawl] Erro: ${err.message}`);
    return [];
  }
}

// ─── Normalização e Links ─────────────────────────────────────
function normalizeImageUrl(url) {
  if (!url) return null;
  let u = url;
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.includes('mlcdn.com.br')) u = u.replace(/\/\d+x\d+\//, '/orig/');
  return u;
}

function buildAffiliateUrl(originalUrl, store) {
  try {
    const obj = new URL(originalUrl);
    if (store === 'Mercado Livre' && ML_AFFILIATE_ID) { obj.searchParams.set('dealerRef', ML_AFFILIATE_ID); return obj.toString(); }
    if (store === 'Amazon' && AMAZON_TAG) { obj.searchParams.set('tag', AMAZON_TAG); return obj.toString(); }
    if (store === 'Magalu' && MAGALU_PARTNER_ID) { obj.hostname = 'www.magazinevoce.com.br'; obj.pathname = `/${MAGALU_PARTNER_ID}${obj.pathname}`; return obj.toString(); }
    if (store === 'Netshoes' && RAKUTEN_AFFILIATE_ID) return `https://click.linksynergy.com/deeplink?id=${RAKUTEN_AFFILIATE_ID}&mid=${RAKUTEN_NETSHOES_MID}&murl=${encodeURIComponent(originalUrl)}`;
  } catch (_) {}
  return originalUrl;
}

// ─── Sub-ID e Tracked URL ─────────────────────────────────────
function createSubId(channel, offerId) {
  const shortId = offerId.replace(/-/g, "").slice(0, 8);
  const prefixes = { telegram: "tg", instagram: "ig", whatsapp: "wp" };
  return `${prefixes[channel] || "x"}_${shortId}`;
}

function createTrackedUrl(subId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://cacaoferta.com.br";
  return `${baseUrl}/go/${subId}`;
}

// ─── Score Matemático Frio ────────────────────────────────────
function calculateScore(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    if (pct >= 0.05 && pct <= 0.80) discountScore = Math.min((pct / 0.5) * 10, 10);
    else if (pct > 0.80) discountScore = 2;
  }

  let priceScore = price <= 100 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
  let impulseScore = price <= 80 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;

  // Formula: Desconto(40%) + Preço(25%) + Impulso(20%) + Rating(15%)
  return Number(((discountScore * 0.40) + (priceScore * 0.25) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

// ─── Lógica IA: Llama-3 via Groq ──────────────────────────────
function cleanJsonString(str) {
  return str.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
}
async function generateOfferAnalysis(product, store) {
  if (!GROQ_API_KEY) return generateFallback(product, store);
  const baseSystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão. Respond in JSON.
Sua persona: Administrador eufórico de grupos de ofertas. Foco em escassez extrema e descontos.
Regras:
1. Ignore criação de links, injetaremos depois.
2. Coloque hashtags no array 'hashtags'.
3. Ignore preços monetários, injetaremos depois.
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

  const userPrompt = `Gerar copy para:
Nome: ${product.product_name}
Loja: ${store}

RETORNE EXATAMENTE NESTE FORMATO JSON:
{
  "strategies": [
    { "headline": "...", "hook": "...", "body": "...", "cta": "...", "score": 9.5 }
  ],
  "hashtags": ["#oferta"]
}`;

  let retries = 3;
  while (retries > 0) {
    try {
      const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: "llama-3.1-8b-instant",
          messages: [{ role: "system", content: baseSystemPrompt }, { role: "user", content: userPrompt }],
          response_format: { type: "json_object" },
          temperature: 0.7, max_tokens: 1000
        }),
      });

      if (!response.ok) {
        if (response.status === 429) {
          await new Promise(r => setTimeout(r, 10000));
          retries--; continue;
        }
        throw new Error(`Groq HTTP ${response.status}`);
      }

      const data = await response.json();
      const raw = JSON.parse(cleanJsonString(data.choices[0].message.content));
      const strategy = (raw.strategies && raw.strategies[0]) ? raw.strategies[0] : null;
      if (!strategy) throw new Error("JSON malformado");

      const hashtags = (raw.hashtags || ["#promocao"]).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

      const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
      const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
      
      const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
      const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;

      return {
        score: strategy.score || 8.0,
        telegram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}\n\n${hashtags}`,
        instagram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}\n\n${hashtags}`,
        whatsapp: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}`
      };
    } catch (err) {
      await new Promise(r => setTimeout(r, 5000));
      retries--;
    }
  }
  return generateFallback(product, store);
}

function generateFallback(product, store) {
  const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  
  const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
  const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;

  return {
    score: 5.0,
    telegram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}\n\n#oferta`,
    instagram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}\n\n#oferta`,
    whatsapp: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}`
  };
}

// ─── Salva Oferta Básica (Rascunho) ───────────────────────────
async function upsertOffer(product, store, affiliateUrl) {
  const score = calculateScore(product);

  const { data: existing } = await supabase.from('offers').select('id, current_price').eq('original_url', affiliateUrl).eq('user_id', ADMIN_USER_ID).maybeSingle();

  if (existing) {
    if (Number(existing.current_price) !== product.current_price) {
      await supabase.from('offers').update({ current_price: product.current_price, old_price: product.old_price, image_url: product.image_url, score, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('offers').update({ updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return { id: existing.id, isNew: false, score };
  }

  const { data, error } = await supabase.from('offers').insert({
    user_id: ADMIN_USER_ID, platform: store, product_name: product.product_name, original_url: affiliateUrl,
    image_url: product.image_url, current_price: product.current_price, old_price: product.old_price,
    rating: product.rating, category: product.category || 'Geral', score, status: 'draft',
    notes: `[Oracle] Importado às ${new Date().toLocaleString('pt-BR')}`,
  }).select('id').single();

  if (error) {
    console.error(`  ✗ Erro insert: ${error.message}`);
    return null;
  }
  return { id: data.id, isNew: true, score };
}

// ─── Processamento Vip (IA, Links e Posts) ────────────────────
async function processTopOffers(candidates) {
  // Ordena por maior nota matemática
  candidates.sort((a, b) => b.score - a.score);
  const vipOffers = candidates.filter(c => c.score >= APPROVAL_SCORE).slice(0, VIP_SLOTS);

  if (vipOffers.length === 0) {
    console.log(`\n🤖 Nenhuma oferta atingiu o score mínimo (${APPROVAL_SCORE}) para IA nesta rodada.`);
    return 0;
  }

  console.log(`\n🤖 Iniciando processamento IA para as ${vipOffers.length} melhores ofertas...`);
  let processed = 0;

  for (const item of vipOffers) {
    console.log(`  [IA] Gerando copy para: ${item.product.product_name.substring(0, 40)}...`);
    const analysis = await generateOfferAnalysis(item.product, item.store);
    
    const finalScore = Number(((item.score * 0.7) + (analysis.score * 0.3)).toFixed(2));
    
    // Deleta posts de rascunhos velhos para esta oferta
    await supabase.from('posts').delete().eq('offer_id', item.id).eq('status', 'draft');

    const channels = ['telegram', 'instagram', 'whatsapp'];
    const linksMap = {};

    for (const channel of channels) {
      const subId = createSubId(channel, item.id);
      const trackedUrl = createTrackedUrl(subId);
      
      const { data: linkData } = await supabase.from('affiliate_links').upsert({
        user_id: ADMIN_USER_ID, offer_id: item.id, channel, original_url: item.affiliateUrl, tracked_url: trackedUrl, sub_id: subId
      }, { onConflict: 'offer_id,channel' }).select('id').single();

      linksMap[channel] = { id: linkData.id, url: trackedUrl };
    }

    const postsToInsert = [
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.telegram.id, channel: 'telegram', content: analysis.telegram.replace('{LINK}', linksMap.telegram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.instagram.id, channel: 'instagram', content: analysis.instagram.replace('{LINK}', linksMap.instagram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.whatsapp.id, channel: 'whatsapp', content: analysis.whatsapp.replace('{LINK}', linksMap.whatsapp.url), status: 'draft' }
    ];

    await supabase.from('posts').insert(postsToInsert);
    await supabase.from('offers').update({ status: 'approved', score: finalScore }).eq('id', item.id);

    processed++;
    await new Promise(r => setTimeout(r, 5000)); // Respiro API Groq
  }
  return processed;
}

// ─── Faxina ───────────────────────────────────────────────────
async function cleanupOldDrafts() {
  const cutoff = new Date(); cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);
  const { data } = await supabase.from('offers').delete().eq('status', 'draft').lt('updated_at', cutoff.toISOString()).select('id');
  console.log(`[FAXINA] ${data?.length || 0} drafts antigos removidos.`);
}

// ─── Raspa Loja ───────────────────────────────────────────────
async function scrapeStore(store) {
  const query = getNextQuery(store);
  console.log(`\n🔍 [${store}] Buscando: "${query}"...`);
  
  const urls = {
    'Mercado Livre': `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(query)}`,
    'Shopee': `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
    'Amazon': `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&rh=p_n_availability%3A2661601011`,
    'Shein': `https://br.shein.com/pdsearch/${encodeURIComponent(query)}/`,
    'Magalu': `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`,
    'Netshoes': `https://www.netshoes.com.br/busca?nsCat=natural&q=${encodeURIComponent(query)}`
  };

  const rawProducts = await firecrawlExtract(urls[store], OFFERS_PER_STORE, store);
  let storeCandidates = [];

  for (const p of rawProducts) {
    const affiliateUrl = buildAffiliateUrl(p.url?.startsWith('http') ? p.url : urls[store], store);
    const prodData = {
      product_name: p.title, image_url: normalizeImageUrl(p.image || null),
      current_price: p.price, old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
      rating: p.rating ? parseFloat(String(p.rating)) : null, category: p.category || 'Geral'
    };

    const res = await upsertOffer(prodData, store, affiliateUrl);
    if (res && res.isNew) storeCandidates.push({ id: res.id, product: prodData, store, affiliateUrl, score: res.score });
  }
  console.log(`  ✅ [${store}] ${storeCandidates.length} ofertas novas coletadas.`);
  return storeCandidates;
}

// ─── Ciclo Principal ──────────────────────────────────────────
async function runScrapingCycle() {
  const startTime = Date.now();
  console.log(`\n${'═'.repeat(60)}\n🚀 ORACLE-SCRAPER V2 — Início em ${new Date().toLocaleString('pt-BR')}\n${'═'.repeat(60)}`);

  const stores = ['Mercado Livre', 'Shopee', 'Amazon', 'Shein', 'Magalu', 'Netshoes'];
  let allCandidates = [];

  for (const store of stores) {
    try {
      const candidates = await scrapeStore(store);
      allCandidates = allCandidates.concat(candidates);
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
  }

  // Passa os top candidatos do ciclo inteiro para a IA
  const aiProcessed = await processTopOffers(allCandidates);

  await cleanupOldDrafts();

  const duration = Math.round((Date.now() - startTime) / 1000);
  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID, integration: 'Oracle-Scraper', action: 'Ciclo V2 Completo', status: 'success',
      message: `${allCandidates.length} raspes, ${aiProcessed} via IA em ${duration}s.`,
      metadata: { total_scraped: allCandidates.length, ai_processed: aiProcessed, duration_seconds: duration }
    });
  } catch(e){}

  console.log(`\n🏁 Ciclo concluído! IA gerou ${aiProcessed} posts. Próximo ciclo em 4h.\n`);
}

// ─── Inicialização ────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE-SCRAPER V2 (Com Cérebro IA)     ║');
console.log('╚══════════════════════════════════════════╝\n');

if (!FIRECRAWL_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("Missing API keys");
  process.exit(1);
}

runScrapingCycle().catch(e => console.error('❌ Erro no ciclo:', e.message));

cron.schedule(CRON_SCHEDULE, () => runScrapingCycle().catch(e => console.error('❌ Erro:', e.message)), {
  name: 'oracle-scraper-v2', timezone: 'America/Sao_Paulo', noOverlap: true
});
