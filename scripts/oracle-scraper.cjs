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
const { PlaywrightCrawler, Dataset, ProxyConfiguration } = require('crawlee');
const { chromium } = require('playwright-extra');
const stealthPlugin = require('puppeteer-extra-plugin-stealth');
chromium.use(stealthPlugin());

process.env.CRAWLEE_AVAILABLE_MEMORY_RATIO = '10.0';
process.env.CRAWLEE_MEMORY_MBYTES = '4096';
const axios        = require('axios');
require('dotenv').config({ path: '.env.local' });
const { validateHtml, getScrapingPrompt, sanitizeScrapedData } = require('./scraper-adapter.cjs');


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
const OFFERS_PER_STORE = 5; // Reduzido para caber no limite de tokens do JSON
const CLEANUP_DAYS     = 7;
const CRON_SCHEDULE    = '0 */4 * * *';
const VIP_SLOTS        = 20; 
const APPROVAL_SCORE   = 5.0; 

const ML_AFFILIATE_ID      = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG           = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID    = process.env.MAGALU_PARTNER_ID || '';
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_NETSHOES_MID = process.env.RAKUTEN_NETSHOES_MID || '43984';

// ─── Sistema de Baldinhos (Golden Queries) ────────────────────
const GOLDEN_QUERIES = {
  // 'Mercado Livre': {
  //   'Supermercado': ['Sabão em pó Omo', 'Amaciante Downy', 'Papel Higiênico Neve', 'Leite Ninho', 'Cápsulas de Café', 'Cerveja Heineken', 'Azeite Gallo', 'Café Pilão', 'Leite Condensado Moça', 'Desodorante Rexona', 'Pasta de Amendoim'],
  //   'Bebês': ['Fralda Pampers', 'Lenço Umedecido', 'Pomada Assadura', 'Fralda Huggies', 'Mamadeira Avent', 'Leite Aptamil', 'Cadeira para Auto'],
  //   'Beleza': ['Kit Skincare', 'Protetor Solar', 'Kit Shampoo', 'Perfume Importado', 'Creme Cerave', 'Sérum Principia', 'Máscara de Cílios', 'Óleo Braé'],
  //   'Ferramentas': ['Furadeira', 'Jogo de Ferramentas', 'Kit Chaves', 'Parafusadeira Bosch', 'Serra Tico-Tico', 'Caixa de Ferramentas'],
  //   'Casa': ['Jogo de Panelas', 'Mop Giratório', 'Fritadeira Air Fryer', 'Ventilador Arno', 'Travesseiro Emma', 'Kit Toalhas Banhão'],
  //   'Esportes': ['Tênis Nike', 'Tênis Adidas', 'Tênis Mizuno', 'Chuteira', 'Tênis Puma', 'Camisa de Time', 'Bola de Futebol', 'Bolsa Academia', 'Calça Jogger']
  // },
  'Amazon': {
    'Tecnologia': ['iPhone', 'Notebook', 'Fone de Ouvido Bluetooth', 'SSD', 'Monitor', 'Kindle', 'Alexa Echo Dot', 'Teclado Mecânico', 'Mouse Logitech', 'iPad', 'Apple Watch'],
    'Beleza': ['Perfume Importado', 'Wella Profissional', 'Cerave', 'La Roche-Posay', 'Loreal Elseve', 'Protetor Solar Vichy', 'Secador Taiff'],
    'Suplementos': ['Whey Protein', 'Creatina Max Titanium', 'Pré-Treino', 'Barra de Proteína', 'Ômega 3', 'Colágeno', 'BCAA', 'Hipercalórico'],
    'Bebês': ['Fraldas', 'Cadeirinha para Auto', 'Carrinho de Bebê', 'Babá Eletrônica', 'Copo de Transição Munchkin'],
    'Casa': ['Cafeteira Nespresso', 'Aspirador de Pó Vertical', 'Robô Aspirador', 'Pipoqueira Elétrica', 'Filtro de Água Consul'],
    'Livros': ['Livro Hábitos Atômicos', 'Livro É Assim Que Acaba', 'Livro Psicologia Financeira', 'Box Harry Potter'],
    'Moda': ['Mochila Nike', 'Tênis Asics', 'Tênis Vans', 'Jaqueta Corta Vento', 'Squeeze Térmico']
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

// ─── Telemetria Global do Ciclo ─────────────────────────────────
const cycleMetrics = {
  produtos_encontrados: 0,
  produtos_enviados_llm: 0,
  produtos_retornados: 0,
  produtos_aprovados: 0,
  produtos_rejeitados: 0,
  total_tokens: 0,
  reject_reasons: {},
  por_marketplace: {}
};

// ─── Extração via Crawlee + Groq ──────────────────────────────
async function crawleeExtract(url, limit, storeName) {
  let rawExtractedData = '';
  let evalResult = { text: '', found: 0, sent: 0 };

  const proxyConfiguration = undefined;

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
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
    browserPoolOptions: {
      useFingerprints: false, // DESATIVADO para não conflitar com o stealthPlugin
    },
    launchContext: {
      useIncognitoPages: false, // Necessário para o stealthPlugin aplicar no contexto global
      launcher: chromium,
      launchOptions: {
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-gpu',
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

      // Simulação de Comportamento Humano (Scroll e pausas randômicas)
      const scrollSteps = Math.floor(Math.random() * 5) + 3; // 3 a 7 scrolls
      for (let i = 0; i < scrollSteps; i++) {
        await page.mouse.wheel(0, Math.floor(Math.random() * 600) + 200);
        await page.waitForTimeout(Math.floor(Math.random() * 800) + 500);
      }
      await page.waitForTimeout(2000);

      evalResult = await page.evaluate(() => {
        const items = Array.from(document.querySelectorAll('div[data-asin], div[data-component-type="s-search-result"], [data-testid="product-card"], .ui-search-layout__item'));
        let results = [];
        for (let el of items) {
          const text = el.innerText || '';
          if (text.includes('R$')) {
            const linkTag = el.tagName === 'A' ? el : el.querySelector('a');
            const imgTag = el.querySelector('img.s-image') || el.querySelector('img.ui-search-result-image__element') || el.querySelector('img[data-testid="image"]') || el.querySelector('img');
            const url = linkTag ? linkTag.href : '';
            let img = '';
            if (imgTag) {
              const dyn = imgTag.getAttribute('data-a-dynamic-image');
              if (dyn) {
                try { img = Object.keys(JSON.parse(dyn))[0]; } catch(e){}
              }
              if (!img) img = imgTag.getAttribute('data-src');
              if (!img) {
                const srcset = imgTag.getAttribute('srcset');
                if (srcset) img = srcset.split(' ')[0];
              }
              if (!img) img = imgTag.getAttribute('src');
              if (!img) img = imgTag.src || '';
              
              if (img.startsWith('data:image') || img.includes('base64') || img.includes('svg') || img.includes('placeholder')) {
                img = '';
              }
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
        return { text: unique.slice(0, 15).join('\n'), found: unique.length, sent: Math.min(unique.length, 15) };
      });
      console.log(`[${storeName}] Itens raspados (únicos): ${evalResult.found} | RAW size: ${evalResult.text.length}`);
    }
  });

  try {
    await crawler.run([url]);
  } catch (err) {
    console.error(`  [Crawlee] Erro ao raspar ${storeName}: ${err.message}`);
    return [];
  }

  rawExtractedData = evalResult.text;
  cycleMetrics.produtos_encontrados += evalResult.found;
  cycleMetrics.produtos_enviados_llm += evalResult.sent;
  if (!cycleMetrics.por_marketplace[storeName]) cycleMetrics.por_marketplace[storeName] = 0;

  if (!rawExtractedData) return [];
  if (!validateHtml(rawExtractedData, storeName)) return [];

  // Chama a Groq para formatar os dados
  console.log(`  [Groq] Analisando dados brutos da ${storeName}...`);
  if (storeName === "Amazon") console.log("RAW AMZ:", rawExtractedData.substring(0, 1000));
  const prompt = getScrapingPrompt(storeName);

  let retries = 3;
  let delay = 2000;
  while (retries > 0) {
    try {
      const res = await axios.post('https://api.groq.com/openai/v1/chat/completions', {
        model: 'llama-3.1-8b-instant',
        response_format: { type: "json_object" },
        messages: [
          { role: 'system', content: prompt },
          { role: 'user', content: rawExtractedData.substring(0, 4000) }
        ],
        temperature: 0.1,
        max_tokens: 1500
      }, {
        headers: { 'Authorization': `Bearer ${GROQ_API_KEY}`, 'Content-Type': 'application/json' }
      });

      if (res.data.usage) {
        cycleMetrics.total_tokens += res.data.usage.total_tokens;
      }
      const content = res.data.choices[0].message.content;
      try {
        const cleanContent = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
        const data = JSON.parse(cleanContent);
        const returnedProducts = data.products || [];
        cycleMetrics.produtos_retornados += returnedProducts.length;
        
        if (storeName === "Amazon") {
          console.log(`[Amazon] Groq Output:`, JSON.stringify(returnedProducts, null, 2));
        }
        
        const approvedProducts = sanitizeScrapedData(returnedProducts, storeName).slice(0, limit);
        cycleMetrics.produtos_aprovados += approvedProducts.length;
        cycleMetrics.produtos_rejeitados += (returnedProducts.length - approvedProducts.length);
        cycleMetrics.por_marketplace[storeName] += approvedProducts.length;
        
        return approvedProducts;
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
        console.error(`  [Groq] Falha na formatação: ${err.message} ${err.response ? JSON.stringify(err.response.data) : ""}`);
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
function calculateScoreV1(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    
    // Bônus High-Ticket: Descontos em produtos caros valem MUITO mais
    if (price >= 1500 && pct >= 0.10) {
      discountScore = 10; // iPhone com 10% off é nota 10 em desconto
    } else if (pct >= 0.05 && pct <= 0.80) {
      discountScore = Math.min((pct / 0.5) * 10, 10);
    } else if (pct > 0.80) {
      discountScore = 2; // Penalidade de falso desconto (Black Fraude)
    }
  }

  // Preço Absoluto: Produtos abaixo de R$ 90 ganham nota máxima, independentemente de desconto
  let priceScore = price <= 90 ? 10 : (price <= 300 ? 8 : (price <= 700 ? 5 : 2));
  let impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 2));
  
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;

  return Number(((discountScore * 0.35) + (priceScore * 0.30) + (impulseScore * 0.20) + (ratingScore * 0.15)).toFixed(2));
}

function calculateScoreV2(product) {
  const price = product.current_price || 0;
  const oldPrice = product.old_price || 0;
  
  let discountPct = 0;
  let absoluteSavings = 0;

  if (oldPrice > price) {
    discountPct = (oldPrice - price) / oldPrice;
    absoluteSavings = oldPrice - price;
  }
  
  let discountScore = 0;
  if (discountPct > 0) {
    if (discountPct > 0.8) discountScore = 2; // Black Fraude
    else discountScore = Math.min((discountPct / 0.5) * 10, 10);
  }
  
  // Economia Absoluta
  let savingsScore = absoluteSavings >= 1000 ? 10 : (absoluteSavings >= 500 ? 8 : (absoluteSavings >= 100 ? 5 : 0));
  
  // Compra por Impulso
  let impulseScore = price <= 90 ? 10 : (price <= 150 ? 8 : (price <= 300 ? 5 : 0));
  
  // Premium Score (compensa a falta de impulseScore para produtos caros)
  let premiumScore = price >= 1500 ? 8 : (price >= 700 ? 5 : 0);
  
  let ratingScore = product.rating ? (product.rating / 5) * 10 : 5;
  
  // A V2 pega o maior multiplicador comercial secundário
  const bestCommercialScore = Math.max(savingsScore, impulseScore, premiumScore);

  return Number(((discountScore * 0.40) + (bestCommercialScore * 0.45) + (ratingScore * 0.15)).toFixed(2));
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
  const scoreV1 = calculateScoreV1(product);
  const scoreV2 = calculateScoreV2(product);
  
  // A V1 continua mandando no sistema principal
  const score = scoreV1;

  // A/B Test Telemetry
  if (process.env.SCORING_V2_ENABLED === 'true') {
    if (!cycleMetrics.ab_test_offers) cycleMetrics.ab_test_offers = [];
    cycleMetrics.ab_test_offers.push({
      product_name: product.product_name,
      store: store,
      score_v1: scoreV1,
      score_v2: scoreV2,
      diff: Number((scoreV2 - scoreV1).toFixed(2)),
      timestamp: new Date().toISOString()
    });
  }

  const { data: existing } = await supabase.from('offers').select('id, current_price, metadata').eq('original_url', affiliateUrl).eq('user_id', ADMIN_USER_ID).maybeSingle();

  if (existing) {
    let newMetadata = existing.metadata || {};
    if (process.env.SCORING_V2_ENABLED === 'true') {
      newMetadata.score_v2 = scoreV2;
      newMetadata.score_v1 = scoreV1;
    }

    if (Number(existing.current_price) !== product.current_price) {
      await supabase.from('offers').update({ current_price: product.current_price, old_price: product.old_price, image_url: product.image_url, score, metadata: newMetadata, updated_at: new Date().toISOString() }).eq('id', existing.id);
    } else {
      await supabase.from('offers').update({ score, metadata: newMetadata, updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return { id: existing.id, isNew: false, score };
  }

  let metadata = {};
  if (process.env.SCORING_V2_ENABLED === 'true') {
    metadata.score_v2 = scoreV2;
    metadata.score_v1 = scoreV1;
  }

  const { data, error } = await supabase.from('offers').insert({
    user_id: ADMIN_USER_ID, platform: store, product_name: product.product_name, original_url: affiliateUrl,
    image_url: product.image_url, current_price: product.current_price, old_price: product.old_price,
    rating: product.rating, category: product.category || 'Geral', score, status: 'draft',
    metadata,
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
      'Mercado Livre': `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`,
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

  const stores = ['Mercado Livre', 'Amazon', 'Magalu'];
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
  
  const recoveryRate = cycleMetrics.produtos_encontrados > 0 ? (cycleMetrics.produtos_aprovados / cycleMetrics.produtos_encontrados).toFixed(2) : 0;
  const approvalRate = cycleMetrics.produtos_retornados > 0 ? (cycleMetrics.produtos_aprovados / cycleMetrics.produtos_retornados).toFixed(2) : 0;

  let abTestReport = null;
  if (process.env.SCORING_V2_ENABLED === 'true' && cycleMetrics.ab_test_offers) {
    const sortedByV1 = [...cycleMetrics.ab_test_offers].sort((a, b) => b.score_v1 - a.score_v1);
    const sortedByV2 = [...cycleMetrics.ab_test_offers].sort((a, b) => b.score_v2 - a.score_v2);
    
    // Calcula rank
    sortedByV1.forEach((o, i) => o.ranking_v1 = i + 1);
    const v2RankMap = new Map();
    sortedByV2.forEach((o, i) => v2RankMap.set(o.product_name, i + 1));
    
    abTestReport = sortedByV1.map(o => ({
      ...o,
      ranking_v2: v2RankMap.get(o.product_name)
    }));
  }

  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID, integration: 'Oracle-Scraper', action: 'Ciclo In-House Completo', status: 'success',
      message: `${allCandidates.length} raspes, ${aiProcessed} via IA em ${duration}s.`,
      metadata: { 
        total_scraped: allCandidates.length, 
        ai_processed: aiProcessed, 
        duration_seconds: duration,
        produtos_encontrados: cycleMetrics.produtos_encontrados,
        produtos_enviados_llm: cycleMetrics.produtos_enviados_llm,
        produtos_retornados: cycleMetrics.produtos_retornados,
        produtos_aprovados: cycleMetrics.produtos_aprovados,
        produtos_rejeitados: cycleMetrics.produtos_rejeitados,
        recovery_rate: recoveryRate,
        approval_rate: approvalRate,
        consumo_tokens: cycleMetrics.total_tokens,
        por_marketplace: cycleMetrics.por_marketplace,
        ab_test_report: abTestReport
      }
    });
  } catch(e){}

  // Reset metrics for next cycle
  cycleMetrics.produtos_encontrados = 0;
  cycleMetrics.produtos_enviados_llm = 0;
  cycleMetrics.produtos_retornados = 0;
  cycleMetrics.produtos_aprovados = 0;
  cycleMetrics.produtos_rejeitados = 0;
  cycleMetrics.total_tokens = 0;
  cycleMetrics.por_marketplace = {};
  cycleMetrics.ab_test_offers = [];

  console.log(`\n🏁 Ciclo concluído em ${duration}s! IA gerou ${aiProcessed} posts. Próximo ciclo em 4h.\n`);
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
