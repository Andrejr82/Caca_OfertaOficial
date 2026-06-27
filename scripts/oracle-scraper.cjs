/**
 * ═══════════════════════════════════════════════════════════════
 *  ORACLE-SCRAPER.CJS — Robô Caçador de Ofertas V2 (In-House)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Processo permanente gerenciado pelo PM2.
 * Roda a cada 4 horas: raspa as lojas (Crawlee), formata (Groq),
 * gera links de afiliado e posta rascunhos.
 */

'use strict';

global.WebSocket = require('ws');

const os = require('os');
os.freemem = () => 4 * 1024 * 1024 * 1024; // 4 GB
os.totalmem = () => 4 * 1024 * 1024 * 1024; // 4 GB
const fs           = require('fs');
const cron         = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const ws           = require('ws');
const { PlaywrightCrawler, Dataset } = require('crawlee');
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

process.env.CRAWLEE_AVAILABLE_MEMORY_RATIO = '10.0';
process.env.CRAWLEE_MEMORY_MBYTES = '4096';
const axios        = require('axios');
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
process.env.CRAWLEE_MEMORY_MBYTES = '3072';
const GROQ_API_KEY    = process.env.GROQ_API_KEY;
const ADMIN_USER_ID   = '7a9ca7b7-f464-46e0-a9de-9b322c73628a'; // ID do André
const OFFERS_PER_STORE = 20;
const CLEANUP_DAYS     = 7;
const CRON_SCHEDULE    = '0 */4 * * *';
const VIP_SLOTS        = 20; 
const APPROVAL_SCORE   = 6.0; 

const ML_AFFILIATE_ID      = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG           = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID    = process.env.MAGALU_PARTNER_ID || '';
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_NETSHOES_MID = process.env.RAKUTEN_NETSHOES_MID || '43984';

// ─── Sistema de Baldinhos (Golden Queries) ────────────────────
const GOLDEN_QUERIES = {
  'Mercado Livre': {
    'Supermercado': ['Sabão em pó Omo', 'Amaciante Downy', 'Papel Higiênico Neve', 'Leite Ninho', 'Cápsulas de Café', 'Cerveja Heineken', 'Azeite Gallo', 'Café Pilão', 'Leite Condensado Moça', 'Desodorante Rexona', 'Pasta de Amendoim'],
    'Bebês': ['Fralda Pampers', 'Lenço Umedecido', 'Pomada Assadura', 'Fralda Huggies', 'Mamadeira Avent', 'Leite Aptamil', 'Cadeira para Auto'],
    'Beleza': ['Kit Skincare', 'Protetor Solar', 'Kit Shampoo', 'Perfume Importado', 'Creme Cerave', 'Sérum Principia', 'Máscara de Cílios', 'Óleo Braé'],
    'Ferramentas': ['Furadeira', 'Jogo de Ferramentas', 'Kit Chaves', 'Parafusadeira Bosch', 'Serra Tico-Tico', 'Caixa de Ferramentas'],
    'Casa': ['Jogo de Panelas', 'Mop Giratório', 'Fritadeira Air Fryer', 'Ventilador Arno', 'Travesseiro Emma', 'Kit Toalhas Banhão']
  },
  'Amazon': {
    'Tecnologia': ['iPhone', 'Notebook', 'Fone de Ouvido Bluetooth', 'SSD', 'Monitor', 'Kindle', 'Alexa Echo Dot', 'Teclado Mecânico', 'Mouse Logitech', 'iPad', 'Apple Watch'],
    'Beleza': ['Perfume Importado', 'Wella Profissional', 'Cerave', 'La Roche-Posay', 'Loreal Elseve', 'Protetor Solar Vichy', 'Secador Taiff'],
    'Suplementos': ['Whey Protein', 'Creatina', 'Pré-Treino', 'Barra de Proteína', 'Ômega 3', 'Colágeno', 'Multivitamínico'],
    'Bebês': ['Fraldas', 'Cadeirinha para Auto', 'Carrinho de Bebê', 'Babá Eletrônica', 'Copo de Transição Munchkin'],
    'Casa': ['Cafeteira Nespresso', 'Aspirador de Pó Vertical', 'Robô Aspirador', 'Pipoqueira Elétrica', 'Filtro de Água Consul'],
    'Livros': ['Livro Hábitos Atômicos', 'Livro É Assim Que Acaba', 'Livro Psicologia Financeira', 'Box Harry Potter']
  },
  'Netshoes': {
    'Calçados': ['Tênis Nike', 'Tênis Adidas', 'Tênis Mizuno', 'Chuteira', 'Tênis Asics', 'Tênis Puma', 'Tênis Vans', 'Bota Oakley'],
    'Roupas': ['Legging Academia', 'Top Fitness', 'Moletom', 'Jaqueta Corta Vento', 'Camisa de Time', 'Bermuda Tactel', 'Calça Jogger', 'Meia Nike'],
    'Suplementos': ['Whey Protein', 'Pré-treino', 'Creatina Max Titanium', 'BCAA', 'Hipercalórico'],
    'Acessórios': ['Mochila Nike', 'Bolsa Academia', 'Squeeze Térmico', 'Bola de Futebol', 'Caneleira']
  },
  'Magalu': {
    'Eletrodomésticos': ['Air Fryer', 'Robô Aspirador', 'Cafeteira', 'Micro-ondas', 'Geladeira', 'Máquina de Lavar', 'Fogão 4 Bocas', 'Purificador de Água'],
    'Móveis': ['Guarda-Roupa', 'Cadeira Gamer', 'Sofá', 'Cama Box Casal', 'Painel para TV', 'Mesa de Jantar'],
    'Auto': ['Pneu', 'Som Automotivo', 'Central Multimídia', 'Bateria Moura'],
    'Celulares': ['Samsung Galaxy', 'iPhone', 'Motorola Edge', 'Xiaomi Redmi'],
    'TV e Vídeo': ['Smart TV 50', 'Smart TV LG', 'Soundbar JBL', 'TV Samsung']
  }
};

function getRandomQueries(store) {
  const categories = GOLDEN_QUERIES[store] || {};
  const selected = [];
  for (const cat in categories) {
    const list = categories[cat];
    const shuffled = [...list].sort(() => 0.5 - Math.random());
    selected.push(...shuffled.slice(0, 2)); // Pega 2 de cada categoria
  }
  return selected;
}

// ─── Extração via Crawlee + Groq ──────────────────────────────
async function crawleeExtract(url, limit, storeName) {
  let rawExtractedData = '';

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 60,
    navigationTimeoutSecs: 45,
    autoscaledPoolOptions: {
      systemStatusOptions: {
        maxMemoryOverloadedRatio: 999,
        maxEventLoopOverloadedRatio: 999,
        maxCpuOverloadedRatio: 999,
        maxClientOverloadedRatio: 999
      }
    },
    launchContext: {
      launcher: chromium,
      launchOptions: {
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-gpu',
          '--single-process',
          '--disable-blink-features=AutomationControlled',
          '--js-flags="--max-old-space-size=128"',
          '--disable-extensions',
          '--disable-default-apps',
          '--no-first-run',
          '--mute-audio'
        ]
      }
    },
    async requestHandler({ request, page, log }) {
      log.info(`[Crawlee] Raspando: ${request.url}`);
      
      // Bloqueia imagens, fontes e mídia para economizar RAM/CPU na VPS
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'media'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      // Engana proteções bot comuns injetando webdriver false
      await page.addInitScript(() => {
        Object.defineProperty(navigator, 'webdriver', { get: () => undefined });
      });

      await page.waitForTimeout(6000); 

      rawExtractedData = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('a, div.ui-search-result, div[data-component-type="s-search-result"]'));
        let results = [];
        for (let el of items) {
          const text = el.innerText || '';
          if (text.includes('R$')) {
            const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
            const imgTag = el.querySelector('img');
            const url = linkTag ? linkTag.href : '';
            let img = '';
            if (imgTag) {
              img = imgTag.getAttribute('data-src') || imgTag.getAttribute('src') || imgTag.src || '';
            }
            if (url) {
              results.push(`[TEXTO]: ${text.replace(/\n/g, ' ')} | [LINK]: ${url} | [IMG]: ${img}`);
            }
          }
        }
        const unique = [];
        const seen = new Set();
        for(let r of results) {
          const u = r.match(/\[LINK\]: (.*?)(?: \||$)/)?.[1];
          if(u && !seen.has(u)){ seen.add(u); unique.push(r); }
        }
        return unique.slice(0, 20).join('\n');
      });
    }
  });

  try {
    await crawler.run([url]);
  } catch (err) {
    console.error(`  [Crawlee] Erro ao raspar ${storeName}: ${err.message}`);
    return [];
  }

  if (!rawExtractedData) return [];

  // Chama a Groq para formatar os dados
  console.log(`  [Groq] Analisando dados brutos da ${storeName}...`);
  const prompt = `Você é um extrator de dados. Analise esta lista de produtos encontrados na loja ${storeName}.
Identifique as melhores ofertas e monte um JSON APENAS com os produtos válidos (que tenham nome e preço).
Se houver preço cortado (ex: de R$ 100 por R$ 50), coloque 100 em old_price e 50 em price.

Schema JSON Obrigatório:
{
  "products": [
    {
      "title": "Nome limpo do produto",
      "url": "O link absoluto exato da extração",
      "image": "O link da imagem se houver, ou null",
      "price": 199.90,
      "old_price": 299.90,
      "category": "${storeName}",
      "rating": 4.5
    }
  ]
}`;

  let retries = 3;
  let delay = 2000;
  while (retries > 0) {
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        response_format: { type: "json_object" },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: rawExtractedData.substring(0, 6000) }
        ],
        temperature: 0.1,
        max_tokens: 2000
      }, {
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
      });

      const content = res.data.choices[0].message.content;
      try {
        const cleanContent = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
        const data = JSON.parse(cleanContent);
        return (data.products || []).slice(0, limit);
      } catch (parseErr) {
        console.error(`  [Groq] Erro de parse JSON no scraper: ${parseErr.message}`);
        return [];
      }
    } catch (err) {
      if (err.response && err.response.status === 429) {
        console.log(`  [Groq Rate Limit] Aguardando ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
        delay *= 2;
        retries--;
      } else {
        console.error(`  [Groq] Falha na formatação: ${err.message}`);
        return [];
      }
    }
  }
  return [];
}

// ─── Normalização e Links de Afiliado ─────────────────────────
function cleanProductUrl(url) {
  if (!url) return null;
  try {
    const obj = new URL(url);
    obj.search = ''; 
    obj.hash = '';
    return obj.toString();
  } catch(e) {
    return url;
  }
}

function normalizeImageUrl(url) {
  if (!url || url === 'null') return null;
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

  return Number(((discountScore * 0.40) + (priceScore * 0.25) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

// ─── Lógica IA: Copywriting via Groq ──────────────────────────
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
  let delay = 2000;
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
          console.log(`  [Groq Rate Limit - Copy] Aguardando ${delay}ms...`);
          await new Promise(r => setTimeout(r, delay));
          delay *= 2;
          retries--; continue;
        }
        throw new Error(`Groq HTTP ${response.status}`);
      }

      const data = await response.json();
      let raw;
      try {
        raw = JSON.parse(cleanJsonString(data.choices[0].message.content));
      } catch (parseErr) {
        console.log(`  [Groq] JSON malformado. Retentando...`);
        throw new Error("JSON malformado");
      }
      const strategy = (raw.strategies && raw.strategies[0]) ? raw.strategies[0] : null;
      if (!strategy) throw new Error("Sem estrategia valida");

      const hashtags = (raw.hashtags || ["#promocao"]).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

      const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
      const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
      
      const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
      const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;
      const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

      return {
        score: strategy.score || 8.0,
        telegram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}\n\n${hashtags}`,
        instagram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${instagramBottomBlock}\n\n${hashtags}`,
        whatsapp: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}`
      };
    } catch (err) {
      if (err.message && (err.message.includes("JSON malformado") || err.message.includes("Sem estrategia valida"))) {
         retries--;
         continue;
      }
      await new Promise(r => setTimeout(r, delay));
      delay *= 2;
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
  const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

  return {
    score: 5.0,
    telegram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}\n\n#oferta`,
    instagram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${instagramBottomBlock}\n\n#oferta`,
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
    notes: `[Oracle In-House] Importado às ${new Date().toLocaleString('pt-BR')}`,
  }).select('id').single();

  if (error) {
    console.error(`  ✗ Erro insert: ${error.message}`);
    return null;
  }
  return { id: data.id, isNew: true, score };
}

// ─── Processamento Vip (IA, Links e Posts) ────────────────────
async function processTopOffers(candidates) {
  candidates.sort((a, b) => b.score - a.score);
  
  const uniqueStores = [...new Set(candidates.map(c => c.store))];
  const maxPerStore = uniqueStores.length > 0 ? Math.ceil(VIP_SLOTS / uniqueStores.length) : VIP_SLOTS;
  
  const storeCounts = {};
  let vipOffers = [];
  const leftovers = [];
  
  for (const c of candidates) {
    if (c.score < APPROVAL_SCORE) continue;
    
    storeCounts[c.store] = (storeCounts[c.store] || 0) + 1;
    if (storeCounts[c.store] <= maxPerStore) {
      vipOffers.push(c);
    } else {
      leftovers.push(c);
    }
  }
  
  while (vipOffers.length < VIP_SLOTS && leftovers.length > 0) {
    vipOffers.push(leftovers.shift());
  }
  vipOffers = vipOffers.slice(0, VIP_SLOTS);

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
    await new Promise(r => setTimeout(r, 6000)); 
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
  const queries = getRandomQueries(store); // Pega 1 keyword de CADA categoria da loja
  let storeCandidates = [];

  for (const query of queries) {
    console.log(`\n🔍 [${store}] Buscando: "${query}"...`);
    
    const urls = {
      'Mercado Livre': `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(query)}`,
      'Shopee': `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
      'Amazon': `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&rh=p_n_availability%3A2661601011`,
      'Shein': `https://br.shein.com/pdsearch/${encodeURIComponent(query)}/`,
      'Magalu': `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`,
      'Netshoes': `https://www.netshoes.com.br/busca?nsCat=natural&q=${encodeURIComponent(query)}`
    };

    const rawProducts = await crawleeExtract(urls[store], OFFERS_PER_STORE, store);

    for (const p of rawProducts) {
      if (!p.title || !p.price) continue;
      
      const rawUrl = p.url?.startsWith('http') ? p.url : urls[store];
      const affiliateUrl = buildAffiliateUrl(cleanProductUrl(rawUrl), store);
      
      const prodData = {
        product_name: p.title, image_url: normalizeImageUrl(p.image || null),
        current_price: p.price, old_price: p.old_price && p.old_price > p.price ? p.old_price : null,
        rating: p.rating ? parseFloat(String(p.rating)) : null, category: p.category || 'Geral'
      };

      const res = await upsertOffer(prodData, store, affiliateUrl);
      if (res && res.isNew) storeCandidates.push({ id: res.id, product: prodData, store, affiliateUrl, score: res.score });
    }
    
    // O exponential backoff cuida do rate limit agora
    await new Promise(r => setTimeout(r, 1000));
  }
  
  console.log(`  ✅ [${store}] ${storeCandidates.length} ofertas coletadas das diversas categorias.`);
  return storeCandidates;
}

// ─── Ciclo Principal ──────────────────────────────────────────
async function runScrapingCycle() {
  const startTime = Date.now();
  console.log(`\n${'═'.repeat(60)}\n🚀 ORACLE-SCRAPER IN-HOUSE — Início em ${new Date().toLocaleString('pt-BR')}\n${'═'.repeat(60)}`);

  const stores = ['Mercado Livre', 'Amazon', 'Magalu', 'Netshoes'];
  let allCandidates = [];

  for (const store of stores) {
    try {
      const candidates = await scrapeStore(store);
      allCandidates = allCandidates.concat(candidates);
    } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
  }

  const aiProcessed = await processTopOffers(allCandidates);
  await cleanupOldDrafts();

  const duration = Math.round((Date.now() - startTime) / 1000);
  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID, integration: 'Oracle-Scraper', action: 'Ciclo In-House Completo', status: 'success',
      message: `${allCandidates.length} raspes, ${aiProcessed} via IA em ${duration}s.`,
      metadata: { total_scraped: allCandidates.length, ai_processed: aiProcessed, duration_seconds: duration }
    });
  } catch(e){}

  console.log(`\n🏁 Ciclo concluído! IA gerou ${aiProcessed} posts. Próximo ciclo em 4h.\n`);
}

// ─── Inicialização ────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE-SCRAPER IN-HOUSE (Crawlee)      ║');
console.log('╚══════════════════════════════════════════╝\n');

if (!GROQ_API_KEY || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.log("Missing API keys (Groq ou Supabase)");
  process.exit(1);
}

runScrapingCycle().catch(e => console.error('❌ Erro no ciclo:', e.message));

cron.schedule(CRON_SCHEDULE, () => runScrapingCycle().catch(e => console.error('❌ Erro:', e.message)), {
  name: 'oracle-scraper-v2', timezone: 'America/Sao_Paulo', noOverlap: true
});
