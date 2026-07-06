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
const cheerio      = require('cheerio');
require('dotenv').config({ path: '.env.local' });
const { validateHtml, validateProduct, getScrapingPrompt, sanitizeScrapedData } = require('./scraper-adapter.cjs');


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
const ADMIN_USER_ID   = '7a9ca7b7-f464-46e0-a9de-9b322c73628a'; // ID do André
const OFFERS_PER_STORE = 6; // Teto por query aumentado para ampliar a descoberta
const CLEANUP_DAYS     = 7;
const CRON_SCHEDULE    = '0 */4 * * *';
const VIP_SLOTS        = Number.MAX_SAFE_INTEGER; 
const APPROVAL_SCORE   = 3.5;

const ML_AFFILIATE_ID      = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG           = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID    = process.env.MAGALU_PARTNER_ID || '';
const SHOPEE_APP_ID        = process.env.SHOPEE_APP_ID || '';
const SHOPEE_APP_SECRET    = process.env.SHOPEE_APP_SECRET || '';
const SKIP_STORES          = new Set((process.env.SKIP_STORES || '').split(',').map(s => s.trim()).filter(Boolean));

const AMAZON_CONTEXT_OPTIONS = {
  locale: 'pt-BR',
  timezoneId: 'America/Sao_Paulo',
  userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  viewport: { width: 1366, height: 900 },
  extraHTTPHeaders: {
    'accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8',
    'accept-language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
    'cache-control': 'no-cache',
    'pragma': 'no-cache',
    'sec-ch-ua': '"Chromium";v="138", "Not=A?Brand";v="24", "Google Chrome";v="138"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': '"Windows"',
    'sec-fetch-dest': 'document',
    'sec-fetch-mode': 'navigate',
    'sec-fetch-site': 'none',
    'sec-fetch-user': '?1',
    'upgrade-insecure-requests': '1'
  }
};

const SHOPEE_OFFICIAL_API_URL = 'https://open-api.affiliate.shopee.com.br/graphql';

// ─── Scrape.do / Mercado Livre Signals Setup ──────────────────
function getMercadoLivreProvider() { return process.env.ML_PROVIDER || 'legacy'; }
function getMercadoLivreDiscoveryMode() { return process.env.ML_DISCOVERY_MODE || 'legacy'; }
function getMercadoLivreSignalUrls() { return process.env.ML_SIGNAL_URLS || ''; }
function getMercadoLivreMaxScrapedoRequests() { return parseInt(process.env.ML_MAX_SCRAPEDO_REQUESTS || '20', 10); }
function isMercadoLivreSignalsScrapedoEnabled() {
  return getMercadoLivreProvider() === 'scrapedo' &&
         getMercadoLivreDiscoveryMode() === 'signals' &&
         !!process.env.SCRAPEDO_API_KEY;
}

async function fetchMercadoLivreViaScrapedo(url) {
  const apiKey = process.env.SCRAPEDO_API_KEY;
  if (!apiKey) throw new Error("SCRAPEDO_API_KEY não configurada.");
  
  const targetUrl = encodeURIComponent(url);
  const scrapeDoUrl = `https://api.scrape.do?token=${apiKey}&url=${targetUrl}&super=true`;
  
  console.log(`  [Scrape.do] Buscando HTML via proxy residencial...`);
  try {
    const response = await axios.get(scrapeDoUrl, { timeout: 60000 });
    return response.data;
  } catch (error) {
    console.error(`  [Scrape.do] Erro: ${error.message}`);
    throw error;
  }
}

// ─── LLM Provider Setup ────────────────────────────────────────
const LLM_PROVIDER = process.env.LLM_PROVIDER || 'cerebras';
const LLM_FALLBACK = process.env.LLM_FALLBACK || 'groq';

// Configurações dos providers
const PROVIDER_CONFIG = {
  cerebras: {
    apiKey: process.env.CEREBRAS_API_KEY,
    apiKey2: process.env.CEREBRAS_API_KEY_2,
    baseURL: process.env.CEREBRAS_BASE_URL || 'https://api.cerebras.ai/v1',
    model: process.env.CEREBRAS_MODEL || 'gpt-oss-120b',
    maxTokens: 8000, // Maior limite para Cerebras
    productsToProcess: 10 // Menos produtos para não cortar a resposta
  },
  groq: {
    apiKey: process.env.GROQ_API_KEY,
    baseURL: 'https://api.groq.com/openai/v1',
    model: process.env.GROQ_MODEL || 'llama-3.1-8b-instant',
    apiKey2: process.env.GROQ_API_KEY_2,
    maxTokens: 4000,
    productsToProcess: 15
  }
};

/**
 * Função genérica para chamar LLM em formato OpenAI-compatible
 */
async function callLLM(messages, providerType = LLM_PROVIDER, config = {}) {
  const providerConfig = PROVIDER_CONFIG[providerType];
  
  if (!providerConfig || !providerConfig.apiKey) {
    throw new Error(`Provider ${providerType} não configurado corretamente`);
  }
  
  const url = (providerConfig.baseURL).replace(/\/$/, '') + '/chat/completions';
  const promptStats = getPromptStats(messages);
  const diagnosticMeta = config.diagnostic || {};
  
  const body = {
    model: providerConfig.model,
    messages: messages,
    temperature: config.temperature ?? 0.1,
    max_tokens: config.maxTokens ?? providerConfig.maxTokens ?? 4000,
    response_format: config.responseFormat
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${providerConfig.apiKey}`
  };

  logLLMDiagnostic('request', {
    provider: providerType,
    model: providerConfig.model,
    url,
    timeoutMs: config.timeoutMs ?? null,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    responseFormat: body.response_format?.type || null,
    productsInBatch: diagnosticMeta.productsInBatch ?? null,
    pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
    phase: diagnosticMeta.phase || null,
    store: diagnosticMeta.store || null,
    query: diagnosticMeta.query || null,
    offerId: diagnosticMeta.offerId || null,
    promptType: diagnosticMeta.promptType || null,
    rawLength: diagnosticMeta.rawLength ?? null,
    ...promptStats
  });

  let response;
  try {
    response = await axios.post(url, body, { headers, timeout: config.timeoutMs ?? 0 });
  } catch (error) {
    logLLMDiagnostic('error', {
      provider: providerType,
      model: providerConfig.model,
      timeoutMs: config.timeoutMs ?? null,
      productsInBatch: diagnosticMeta.productsInBatch ?? null,
      pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
      phase: diagnosticMeta.phase || null,
      store: diagnosticMeta.store || null,
      query: diagnosticMeta.query || null,
      offerId: diagnosticMeta.offerId || null,
      promptType: diagnosticMeta.promptType || null,
      ...promptStats,
      httpStatus: error?.response?.status ?? null,
      errorMessage: error?.message || 'Unknown error',
      responseSnippet: safeDiagnosticSnippet(error?.response?.data),
      responseHeaders: {
        retryAfter: error?.response?.headers?.['retry-after'] ?? null,
        contentType: error?.response?.headers?.['content-type'] ?? null
      }
    });
    throw error;
  }
  
  // Cerebras puts content in message.reasoning, others in message.content
  if (response.data.choices && response.data.choices[0]) {
    const msg = response.data.choices[0].message;
    if (msg.reasoning && !msg.content) {
      response.data.choices[0].message.content = msg.reasoning;
    }
  }
  
  if (response.data.usage) {
    cycleMetrics.totalTokens += response.data.usage.total_tokens;
  }

  logLLMDiagnostic('success', {
    provider: providerType,
    model: providerConfig.model,
    timeoutMs: config.timeoutMs ?? null,
    productsInBatch: diagnosticMeta.productsInBatch ?? null,
    pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
    phase: diagnosticMeta.phase || null,
    store: diagnosticMeta.store || null,
    query: diagnosticMeta.query || null,
    offerId: diagnosticMeta.offerId || null,
    promptType: diagnosticMeta.promptType || null,
    ...promptStats,
    finishReason: response.data.choices?.[0]?.finish_reason ?? null,
    usage: response.data.usage || null,
    responseSnippet: safeDiagnosticSnippet(response.data.choices?.[0]?.message?.content || response.data.choices?.[0]?.message?.reasoning)
  });
  
  return response.data;
}

async function callLLMWithKey(messages, providerType, apiKey, config = {}) {
  const providerConfig = PROVIDER_CONFIG[providerType];
  
  if (!providerConfig || !apiKey) {
    throw new Error(`Provider ${providerType} não configurado corretamente`);
  }
  
  const url = (providerConfig.baseURL).replace(/\/$/, '') + '/chat/completions';
  const promptStats = getPromptStats(messages);
  const diagnosticMeta = config.diagnostic || {};
  
  const body = {
    model: providerConfig.model,
    messages: messages,
    temperature: config.temperature ?? 0.1,
    max_tokens: config.maxTokens ?? providerConfig.maxTokens ?? 4000,
    response_format: config.responseFormat
  };
  
  const headers = {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${apiKey}`
  };

  logLLMDiagnostic('request', {
    provider: providerType,
    model: providerConfig.model,
    url,
    timeoutMs: config.timeoutMs ?? null,
    maxTokens: body.max_tokens,
    temperature: body.temperature,
    responseFormat: body.response_format?.type || null,
    phase: diagnosticMeta.phase || null,
    store: diagnosticMeta.store || null,
    query: diagnosticMeta.query || null,
    offerId: diagnosticMeta.offerId || null,
    productsInBatch: diagnosticMeta.productsInBatch ?? null,
    pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
    promptType: diagnosticMeta.promptType || null,
    ...promptStats
  });
  
  const response = await axios.post(url, body, {
    headers,
    timeout: config.timeoutMs ?? 180000,
    validateStatus: () => true
  });
  
  if (response.status >= 400) {
    const err = new Error(`Request failed with status code ${response.status}`);
    err.response = response;
    throw err;
  }

  if (response.data.choices && response.data.choices[0]) {
    const msg = response.data.choices[0].message;
    if (msg.reasoning && !msg.content) {
      response.data.choices[0].message.content = msg.reasoning;
    }
  }
  
  if (response.data.usage) {
    cycleMetrics.totalTokens += response.data.usage.total_tokens;
  }

  logLLMDiagnostic('success', {
    provider: providerType,
    model: providerConfig.model,
    timeoutMs: config.timeoutMs ?? null,
    productsInBatch: diagnosticMeta.productsInBatch ?? null,
    pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
    phase: diagnosticMeta.phase || null,
    store: diagnosticMeta.store || null,
    query: diagnosticMeta.query || null,
    offerId: diagnosticMeta.offerId || null,
    promptType: diagnosticMeta.promptType || null,
    ...promptStats,
    finishReason: response.data.choices?.[0]?.finish_reason ?? null,
    usage: response.data.usage || null,
    responseSnippet: safeDiagnosticSnippet(response.data.choices?.[0]?.message?.content || response.data.choices?.[0]?.message?.reasoning)
  });
  
  return response.data;
}

/**
 * Tenta o provider principal, se falhar tenta o fallback
 */
async function callLLMWithFallback(messages, config = {}) {
  let lastError = null;
  const diagnosticMeta = config.diagnostic || {};

  const providerAttempts = [
    { provider: 'cerebras', keyLabel: 'chave 1', key: PROVIDER_CONFIG.cerebras.apiKey },
    { provider: 'cerebras', keyLabel: 'chave 2', key: PROVIDER_CONFIG.cerebras.apiKey2 },
    { provider: 'groq', keyLabel: 'chave 1', key: PROVIDER_CONFIG.groq.apiKey },
    { provider: 'groq', keyLabel: 'chave 2', key: PROVIDER_CONFIG.groq.apiKey2 },
  ].filter(attempt => attempt.key);

  if (providerAttempts.length === 0) {
    throw new Error('Nenhuma chave de LLM configurada');
  }

  for (let i = 0; i < providerAttempts.length; i++) {
    const attempt = providerAttempts[i];
    const nextAttempt = providerAttempts[i + 1] || null;

    try {
      console.log(`  [${attempt.provider === 'cerebras' ? 'Cerebras' : 'Groq'}] Tentando ${attempt.keyLabel}...`);
      const result = await callLLMWithKey(messages, attempt.provider, attempt.key, config);
      const finishReason = result.choices?.[0]?.finish_reason;

      if (finishReason === 'length') {
        lastError = new Error('Response cut off');
        console.warn(`  [LLM] ${attempt.provider} ${attempt.keyLabel} retornou finish_reason=length.`);
        logLLMDiagnostic('fallback', {
          provider: attempt.provider,
          providerKeyLabel: attempt.keyLabel,
          fallback: nextAttempt ? `${nextAttempt.provider}:${nextAttempt.keyLabel}` : null,
          reason: 'finish_reason_length',
          finishReason,
          phase: diagnosticMeta.phase || null,
          store: diagnosticMeta.store || null,
          query: diagnosticMeta.query || null,
          offerId: diagnosticMeta.offerId || null,
          productsInBatch: diagnosticMeta.productsInBatch ?? null,
          pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
          ...getPromptStats(messages)
        });
        continue;
      }

      return result;
    } catch (error) {
      lastError = error;
      console.warn(`  [LLM] ${attempt.provider} ${attempt.keyLabel} falhou: ${error.message}`);
      logLLMDiagnostic('fallback', {
        provider: attempt.provider,
        providerKeyLabel: attempt.keyLabel,
        fallback: nextAttempt ? `${nextAttempt.provider}:${nextAttempt.keyLabel}` : null,
        reason: 'attempt_error',
        phase: diagnosticMeta.phase || null,
        store: diagnosticMeta.store || null,
        query: diagnosticMeta.query || null,
        offerId: diagnosticMeta.offerId || null,
        productsInBatch: diagnosticMeta.productsInBatch ?? null,
        pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
        ...getPromptStats(messages),
        httpStatus: error?.response?.status ?? null,
        errorMessage: error?.message || 'Unknown error',
        responseSnippet: safeDiagnosticSnippet(error?.response?.data)
      });
    }
  }

  console.error(`  [LLM] Todas as tentativas falharam.`);
  throw lastError;
}
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_ACCESS_TOKEN = process.env.RAKUTEN_ACCESS_TOKEN || '';
const RAKUTEN_CLIENT_ID = process.env.RAKUTEN_CLIENT_ID || '';
const RAKUTEN_CLIENT_SECRET = process.env.RAKUTEN_CLIENT_SECRET || '';
const RAKUTEN_SID = process.env.RAKUTEN_SID || '';
const RAKUTEN_NETSHOES_MID = process.env.RAKUTEN_NETSHOES_MID || '43984';
const ENABLE_NETSHOES_RAKUTEN = process.env.ENABLE_NETSHOES_RAKUTEN === '1';

// #region debug-point A:golden-queries-audit-bootstrap
const SCRAPER_AUDIT_ENV_FILE = '.dbg/golden-queries-audit.env';
const SCRAPER_AUDIT_LOG_FILE = '.dbg/trae-debug-log-golden-queries-audit.ndjson';
const SCRAPER_AUDIT_RUN_ID = process.env.SCRAPER_AUDIT_RUN_ID || 'pre-fix';
const LLM_DIAGNOSTIC_ENABLED = process.env.LLM_DIAGNOSTIC === '1';
const LLM_DIAGNOSTIC_LOG_FILE = process.env.LLM_DIAGNOSTIC_LOG_FILE || '.dbg/cerebras-fallback-diagnostic.ndjson';
const SCRAPER_AUDIT_STATE = {
  currentStore: null,
  currentQuery: null,
  currentCategory: null,
  currentVariant: null,
  queryStartedAt: 0,
  cycleStartedAt: 0
};

function emitAuditEvent(hypothesisId, location, msg, data = {}) {
  const payload = {
    sessionId: 'golden-queries-audit',
    runId: SCRAPER_AUDIT_RUN_ID,
    hypothesisId,
    location,
    msg: `[DEBUG] ${msg}`,
    data,
    ts: Date.now()
  };

  try {
    fs.appendFileSync(SCRAPER_AUDIT_LOG_FILE, `${JSON.stringify(payload)}\n`);
  } catch (_) {}

  if (typeof fetch !== 'function') return;
  let serverUrl = 'http://127.0.0.1:7777/event';
  let sessionId = 'golden-queries-audit';
  try {
    const envRaw = fs.readFileSync(SCRAPER_AUDIT_ENV_FILE, 'utf8');
    serverUrl = envRaw.match(/DEBUG_SERVER_URL=(.+)/)?.[1]?.trim() || serverUrl;
    sessionId = envRaw.match(/DEBUG_SESSION_ID=(.+)/)?.[1]?.trim() || sessionId;
  } catch (_) {}

  payload.sessionId = sessionId;

  fetch(serverUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  }).catch(() => {});
}

function safeDiagnosticSnippet(value, maxLen = 280) {
  if (value === null || value === undefined) return null;
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.replace(/\s+/g, ' ').trim().slice(0, maxLen);
}

function getPromptStats(messages = []) {
  const normalized = Array.isArray(messages) ? messages : [];
  const contentLengths = normalized.map((message) => String(message?.content || '').length);
  return {
    promptLength: contentLengths.reduce((sum, size) => sum + size, 0),
    messageCount: normalized.length,
    systemLength: contentLengths[0] || 0,
    userLength: contentLengths[1] || 0
  };
}

function logLLMDiagnostic(event, payload = {}) {
  if (!LLM_DIAGNOSTIC_ENABLED) return;
  const entry = {
    ts: new Date().toISOString(),
    runId: process.env.LLM_DIAGNOSTIC_RUN_ID || 'default',
    event,
    ...payload
  };
  console.log(`[LLM_DIAG] ${JSON.stringify(entry)}`);
  try {
    fs.appendFileSync(LLM_DIAGNOSTIC_LOG_FILE, `${JSON.stringify(entry)}\n`);
  } catch (_) {}
}

function averageNumbers(values = []) {
  if (!values.length) return 0;
  return Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2));
}

function incrementCounter(target, key) {
  target[key] = (target[key] || 0) + 1;
}

function bucketConfidence(confidence) {
  if (confidence < 40) return '0-39';
  if (confidence < 60) return '40-59';
  if (confidence < 80) return '60-79';
  return '80-100';
}

function buildValidationPreview(products, storeName) {
  const preview = {
    found: products.length,
    approved: 0,
    rejected: 0,
    avgConfidence: 0,
    rejectStats: {},
    confidenceBuckets: {},
    missingStats: {
      title: 0,
      price: 0,
      image: 0,
      url: 0,
      category: 0,
      marketplace: storeName ? 0 : products.length
    }
  };
  const confidences = [];

  products.forEach((product) => {
    const title = String(product?.title || product?.product_name || '').trim();
    const image = String(product?.image || product?.image_url || '').trim();
    const url = String(product?.url || product?.original_url || '').trim();
    const rawPrice = product?.price ?? product?.current_price ?? 0;
    const price = typeof rawPrice === 'number'
      ? rawPrice
      : parseFloat(String(rawPrice).replace(/[R$\s.]/g, '').replace(',', '.')) || 0;

    if (!title) preview.missingStats.title += 1;
    if (!price) preview.missingStats.price += 1;
    if (!image || image === 'null') preview.missingStats.image += 1;
    if (!url) preview.missingStats.url += 1;
    if (!product?.category) preview.missingStats.category += 1;

    const validation = validateProduct(product, storeName);
    confidences.push(validation.confidence);
    incrementCounter(preview.confidenceBuckets, bucketConfidence(validation.confidence));

    if (validation.valid) {
      preview.approved += 1;
    } else {
      preview.rejected += 1;
      incrementCounter(preview.rejectStats, validation.rejectReason || 'UNKNOWN');
    }
  });

  preview.avgConfidence = averageNumbers(confidences);
  return preview;
}
// #endregion

// ─── Sistema de Descoberta ─────────────────────────────────────
const QUERY_VARIANT_ORDER = ['ofertas', 'mais_vendidos', 'tendencias', 'categoria', 'viral', 'lancamentos'];
const STORE_QUERY_SETTINGS = {
  'Mercado Livre': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Amazon': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Magalu': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Shopee': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Shein': { categoriesPerRun: 12, queriesPerCategory: 2 },
  'Netshoes': { categoriesPerRun: 12, queriesPerCategory: 2 }
};

const MARKETPLACE_ORDER = ['Mercado Livre', 'Amazon', 'Magalu', 'Netshoes', 'Shopee', 'Shein'];

const ELETRONICOS = [
  'Echo Pop',
  'Echo Show 8',
  'Kindle Paperwhite 16GB',
  'Fire TV Stick 4K Max',
  'Galaxy SmartTag2',
  'Instax Mini 12',
  'Carregador GaN Baseus 65W',
  'Power bank I2GO 20000mAh',
  'Mini projetor HY320',
  'Dock station USB-C Ugreen'
];

const GAMES = [
  'PlayStation 5 Slim',
  'PlayStation 5 Digital',
  'Nintendo Switch OLED',
  'Xbox Series S Carbon Black',
  'Controle DualSense Midnight Black',
  'Controle Xbox Robot White',
  'Mario Kart 8 Deluxe',
  'Zelda Tears of the Kingdom',
  'EA Sports FC 26',
  'Gift card PlayStation Store'
];

const HARDWARE = [
  'RTX 4060 8GB',
  'RTX 4070 Super',
  'Radeon RX 7800 XT',
  'Ryzen 7 8700G',
  'Ryzen 5 5600',
  'Intel Core i7 14700K',
  'SSD Kingston NV3 1TB',
  'SSD WD Black SN770 1TB',
  'Memoria DDR5 Kingston Fury 32GB',
  'Fonte Corsair RM750e'
];

const INFORMATICA = [
  'Notebook Lenovo LOQ',
  'Notebook ASUS Vivobook 15',
  'Notebook Dell Inspiron 15',
  'Notebook Samsung Galaxy Book4',
  'Monitor LG Ultrawide 29',
  'Mouse Logitech G502 Hero',
  'Teclado mecanico Redragon Kumara',
  'Webcam Logitech C920s',
  'Cadeira gamer ThunderX3 TGC12',
  'Impressora Epson EcoTank L3250'
];

const CASA_INTELIGENTE = [
  'Lampada smart Positivo Casa Inteligente',
  'Smart plug Intelbras EWS 301',
  'Fechadura digital Intelbras FR 101',
  'Camera TP-Link Tapo C200',
  'Robo aspirador Xiaomi S10',
  'Sensor de presenca smart Zemismart',
  'Interruptor smart NovaDigital Wi-Fi',
  'Video porteiro Intelbras Allo W3',
  'Controle universal smart Positivo',
  'Fita LED smart RGBIC Tuya'
];

const COZINHA = [
  'Air fryer Philips Walita 6.2L',
  'Air fryer oven Mondial 12L',
  'Cafeteira Nespresso Essenza Mini',
  'Cafeteira Tres Coracoes Lov',
  'Panela de pressao eletrica Electrolux PCC20',
  'Kit churrasco Tramontina 15 pecas',
  'Jogo de facas Tramontina Plenus',
  'Processador Oster 3 em 1',
  'Mixer Philips Walita Daily',
  'Conjunto de panelas Tramontina Solar'
];

const ELETRODOMESTICOS = [
  'Geladeira Brastemp Inverse 447L',
  'Lava e seca Samsung 11kg',
  'Maquina de lavar Electrolux 12kg',
  'Lava-loucas Brastemp 14 servicos',
  'Cooktop Electrolux 5 bocas',
  'Forno eletrico Fischer Fit Line',
  'Micro-ondas LG 30L NeoChef',
  'Freezer vertical Consul 231L',
  'Ar-condicionado LG Dual Inverter 12000',
  'Cervejeira Midea Flex 96L'
];

const ELETROPORTATEIS = [
  'Aspirador vertical WAP Power Speed',
  'Escova secadora Mondial Golden Rose',
  'Secador Taiff Style 2000W',
  'Vaporizador portatil Black+Decker',
  'Sanduicheira Cadence Click',
  'Grill George Foreman Family',
  'Chaleira eletrica Electrolux EEK10',
  'Liquidificador Oster 1400 Full',
  'Multiprocessador Philco PMP1600',
  'Passadeira a vapor Arno Steam Power'
];

const FERRAMENTAS = [
  'Furadeira Bosch GSB 13 RE',
  'Parafusadeira Makita DF333D',
  'Kit ferramentas Bosch 103 pecas',
  'Lavadora WAP Ousada Plus 2200',
  'Serra marmore Makita 4100NH3Z',
  'Jogo de chaves Gedore Red',
  'Trena laser Bosch GLM 40',
  'Soprador termico Vonder STV 1500',
  'Martelete DeWalt D25133K',
  'Serra tico-tico Bosch GST 700'
];

const AUTOMOTIVO = [
  'Central multimidia Pioneer DMH-A5450BT',
  'Aspirador automotivo Black+Decker ADV1200',
  'Carregador veicular Baseus SuperCharge',
  'Camera veicular 70mai Dash Cam A500S',
  'Calibrador portatil Xiaomi 2',
  'Lampada Philips CrystalVision H4',
  'Suporte celular veicular I2GO MagSafe',
  'Bateria Moura 60Ah',
  'Compressor de ar portatil Multilaser',
  'Sensor de estacionamento Tech One'
];

const PET = [
  'Fonte para gato Catit Flower',
  'Caixa de areia fechada Furacao Pet',
  'Racao Premier Formula Caes Adultos',
  'Racao Royal Canin Mini Indoor',
  'Caminha pet impermeavel Baw Waw',
  'Arranhador gato 3 andares',
  'Bebedouro automatico pet 2 litros',
  'Tapete higienico SuperSecao 30 unidades',
  'Brinquedo Kong Classic medio',
  'Escova removedora de pelos pet'
];

const SAUDE = [
  'Aparelho de pressao Omron HEM-7122',
  'Massageador pistola Relaxmedic',
  'Oximetro G-Tech OLED',
  'Inalador nebulizador Omron NE-C803',
  'Balanca bioimpedancia Xiaomi Mi Body',
  'Escova eletrica Oral-B Vitality',
  'Irrigador oral Waterpik Cordless',
  'Travesseiro ortopedico Nasa',
  'Monitor de glicemia Accu-Chek Guide',
  'Termometro infravermelho G-Tech'
];

const FITNESS = [
  'Bicicleta ergometrica Dream MAX V',
  'Esteira eletrica Polimet EP-1600',
  'Halteres ajustaveis 20kg',
  'Corda speed rope de cross training',
  'Caneleira 5kg par',
  'Kettlebell 12kg emborrachado',
  'Bike spinning Gallant Elite',
  'Banco de supino dobravel',
  'Kit mini bands tecido',
  'Roda abdominal com apoio'
];

const SUPLEMENTOS = [
  'Creatina Max Titanium 300g',
  'Creatina Soldiers Nutrition 500g',
  'Whey Growth concentrado 1kg',
  'Whey Max Titanium 100% whey',
  'Pre-treino Horus 300g',
  'Albumina Naturovos 500g',
  'Multivitaminico Growth',
  'Omega 3 Growth',
  'Colageno hidrolisado Sanavita',
  'Barra de proteina Bold'
];

const MODA_MASCULINA = [
  'Camiseta Insider Tech T-Shirt',
  'Jaqueta corta vento Nike Club',
  'Kit cueca Lupo boxer',
  'Camisa polo Reserva piquet',
  'Bermuda Nike Dri-FIT Challenger',
  'Moletom Adidas Essentials',
  'Camisa social slim masculina',
  'Carteira couro masculina Fasolo',
  'Jaqueta puffer masculina',
  'Kit camisetas basicas Hering'
];

const MODA_FEMININA = [
  'Vestido midi canelado',
  'Conjunto academia feminino seamless',
  'Pijama americano feminino',
  'Bolsa tote feminina estruturada',
  'Jaqueta puffer feminina',
  'Calca wide leg jeans feminina',
  'Modelador cintura alta feminino',
  'Kit lingerie microfibra',
  'Camisa oversized feminina',
  'Vestido festa midi acetinado'
];

const TENIS = [
  'Nike Air Max Excee',
  'Nike Revolution 7',
  'Adidas Ultraboost Light',
  'Olympikus Corre 3',
  'Olympikus Corre Max',
  'Mizuno Wave Creation 26',
  'Puma Carina BDP',
  'Under Armour Charged Slight 3',
  'New Balance 530',
  'Vans Old Skool preto'
];

const RELOGIOS = [
  'Apple Watch SE GPS',
  'Galaxy Watch7 BT',
  'Huawei Watch GT 5',
  'Redmi Watch 5 Lite',
  'Casio G-Shock GA-2100',
  'Amazfit Balance',
  'Smartwatch QCY Watch GS',
  'Garmin Forerunner 55',
  'Relogio Technos Racer',
  'Relogio Orient automatico masculino'
];

const PERFUMES = [
  'La Vie Est Belle Lancome',
  '212 VIP Black Carolina Herrera',
  'Dior Sauvage Eau de Toilette',
  'Invictus Paco Rabanne',
  'Good Girl Carolina Herrera',
  'Yara Lattafa',
  'Club de Nuit Intense Man',
  'Egeo Bomb Black',
  'Libre Yves Saint Laurent',
  'My Way Giorgio Armani'
];

const BELEZA = [
  'Kit skincare Cerave hidratacao',
  'Protetor solar ISDIN Fusion Water',
  'Serum Principia niacinamida',
  'Serum Creamy retinol',
  'Chapinha Taiff Style',
  'Maquina de cortar Philips Multigroom',
  'Escova secadora Philco Soft Brush',
  'Base Maybelline Super Stay',
  'Secador Dyson Supersonic',
  'Mascara Elseve Glycolic Gloss'
];

const INFANTIL = [
  'Patinete infantil 3 rodas',
  'Bicicleta infantil aro 16',
  'Mochila escolar infantil rodinhas',
  'Lancheira termica infantil',
  'LEGO Classic caixa criativa',
  'Piscina inflavel Mor 1000 litros',
  'Fantasia infantil Stitch',
  'Mesa didatica infantil',
  'Cama montessoriana infantil',
  'Boneca Barbie Dreamtopia'
];

const BEBE = [
  'Fralda Pampers Premium Care',
  'Fralda Huggies Supreme Care',
  'Lenco umedecido Pampers 576 unidades',
  'Carrinho de bebe travel system',
  'Cadeirinha carro 0 a 36kg',
  'Baba eletronica com camera',
  'Bomba tira leite eletrica',
  'Esterilizador de mamadeiras a vapor',
  'Tapete de atividades bebe',
  'Cadeira de alimentacao bebe'
];

const PAPELARIA = [
  'Caneta Stabilo Boss kit pastel',
  'Marca texto CIS Lumini',
  'Lapis Faber-Castell 72 cores',
  'Caderno Tilibra espiral 10 materias',
  'Caneta gel Pentel EnerGel',
  'Planner permanente sem data',
  'Apontador eletrico com deposito',
  'Estojo escolar grande 100 pens',
  'Kit brush pen tons pastel',
  'Bloco adesivo Post-it gigante'
];

const ESCRITORIO = [
  'Cadeira escritorio ergonomica mesh',
  'Monitor portatil Arzopa 15.6',
  'Suporte notebook aluminio regulavel',
  'Mesa digitalizadora Wacom One',
  'Hub USB-C 8 em 1 Ugreen',
  'Impressora Brother laser HL-L2360DW',
  'Roteador mesh TP-Link Deco M4',
  'Nobreak SMS 1200VA',
  'Mesa regulavel de altura',
  'Teclado Logitech K380'
];

const DECORACAO = [
  'Lustre pendente moderno',
  'Fita LED RGBIC Govee',
  'Espelho decorativo redondo 80cm',
  'Painel ripado decorativo',
  'Luminaria de mesa LED',
  'Quadro decorativo minimalista',
  'Tapete sala felpudo 2x3',
  'Cortina blackout 2 folhas',
  'Puff bau decorativo',
  'Difusor de aromas ultrassonico'
];

const MOVEIS = [
  'Sofa retratil 4 lugares',
  'Guarda-roupa casal 6 portas',
  'Painel para TV ate 65',
  'Mesa de jantar 6 cadeiras',
  'Escrivaninha industrial 120cm',
  'Rack com painel suspenso',
  'Cama box bau casal',
  'Poltrona decorativa linho',
  'Sapateira banco estofada',
  'Closet modulado aberto'
];

const UTILIDADES = [
  'Copo termico Stanley Quencher',
  'Garrafa termica Zojirushi 1L',
  'Organizador multiuso transparente',
  'Escorredor de louca inox',
  'Mop spray FlashLimp',
  'Varal de chao dobravel',
  'Caixa organizadora com tampa',
  'Kit potes hermeticos 12 pecas',
  'Balanca de cozinha digital',
  'Porta temperos giratorio 16 potes'
];

const CELULARES = [
  'Moto G54 5G',
  'Moto G34 5G',
  'Galaxy A55 5G',
  'Galaxy M55 5G',
  'Redmi Note 13 5G',
  'POCO C75',
  'Realme 12x 5G',
  'Infinix Hot 40i',
  'iPhone 15 128GB',
  'POCO X6 Pro'
];

const TABLETS = [
  'iPad 10 geracao Wi-Fi',
  'iPad Air M2 11',
  'Galaxy Tab S9 FE',
  'Galaxy Tab A9+',
  'Redmi Pad SE 11',
  'Lenovo Tab P12',
  'Vaio TL10 tablet',
  'Galaxy Tab S6 Lite',
  'Xiaomi Pad 6',
  'Tablet Positivo Vision Tab 10'
];

const SMARTPHONES_PREMIUM = [
  'iPhone 16 128GB',
  'iPhone 16 Pro 256GB',
  'iPhone 16 Pro Max 256GB',
  'Galaxy S25 256GB',
  'Galaxy S25 Ultra 512GB',
  'Galaxy Z Flip6 256GB',
  'Galaxy Z Fold6 512GB',
  'Xiaomi 15 Ultra',
  'Motorola Razr 50 Ultra',
  'Asus ROG Phone 9'
];

const SMARTPHONES_INTERMEDIARIOS = [
  'Galaxy A36 5G',
  'Galaxy A56 5G',
  'Redmi Note 14 Pro 5G',
  'Redmi Note 14 Pro Plus',
  'POCO X7 Pro',
  'Moto Edge 50 Neo',
  'Moto Edge 50 Fusion',
  'Realme 12 Pro Plus',
  'Infinix Note 40 5G',
  'Nothing Phone 2a'
];

const AUDIO = [
  'JBL Go 4',
  'JBL PartyBox 110',
  'JBL Flip 6',
  'QCY HT07 ArcBuds',
  'Anker Soundcore Q30',
  'Edifier W820NB Plus',
  'Soundbar Samsung HW-B550',
  'Microfone Fifine A6V',
  'Sony WH-1000XM5',
  'AirPods 4'
];

const VIDEO = [
  'TV Samsung Crystal 50 4K',
  'TV LG OLED C4 55',
  'TV TCL 55 C655',
  'Smart monitor Samsung M8',
  'Projetor Wanbo Mozart 1',
  'Webcam Logitech Brio 4K',
  'Camera GoPro HERO13 Black',
  'TV Philips Ambilight 55',
  'Mini projetor HY300 Pro',
  'Camera de seguranca Imou Cruiser'
];

const STREAMING = [
  'Fire TV Cube',
  'Google TV Streamer 4K',
  'Roku Express 4K',
  'Xiaomi TV Box S 2nd Gen',
  'Elgato HD60 X',
  'Stream Deck Neo',
  'Cam Link 4K Elgato',
  'Ring light 18 polegadas',
  'Microfone Fifine K658',
  'Controle remoto air mouse'
];

const LIVROS = [
  'Habitos Atomicos',
  'A Psicologia Financeira',
  'Box Harry Potter',
  'Box ACOTAR',
  'Cafe com Deus Pai 2026',
  'O Homem Mais Rico da Babilonia',
  'A Sutil Arte de Ligar o Foda-se',
  'As Armas da Persuasao',
  'Box Percy Jackson',
  'Livro de colorir Bobbie Goods'
];

const BRINQUEDOS = [
  'LEGO Technic McLaren',
  'Hot Wheels ataque da cobra',
  'Boneca Barbie DreamHouse Adventures',
  'Nerf Elite 2.0 Commander',
  'Carrinho controle remoto 4x4',
  'Pista Hot Wheels City',
  'Jogo Uno minimalista',
  'Play-Doh sorveteria',
  'Fisher-Price Cachorrinho Aprender',
  'Quebra-cabeca 1000 pecas'
];

const CAMPING = [
  'Barraca Azteq Minipack',
  'Colchao inflavel casal Intex',
  'Lanterna tatica recarregavel',
  'Cadeira camping dobravel',
  'Caixa termica Coleman 28QT',
  'Fogareiro Nautika Frontier',
  'Mochila cargueira 50L',
  'Canivete Victorinox Huntsman',
  'Saco de dormir Coleman',
  'Garrafa Stanley Adventure 1.5L'
];

const PESCA = [
  'Carretilha Marine Sports Brisa',
  'Molinete Shimano Sienna 2500',
  'Vara de pesca carbono 1.80',
  'Linha multifilamento 8X 300m',
  'Caixa de pesca organizadora',
  'Kit iscas artificiais tucuna',
  'Alicate de pesca boga grip',
  'Sonar portatil Fish Finder',
  'Cadeira de pesca dobravel',
  'Viveiro para pesca esportiva'
];

const ESPORTE = [
  'Bola futsal Penalty Max 1000',
  'Camisa oficial Adidas futebol',
  'Chuteira Nike Phantom GX',
  'Bicicleta aro 29 Caloi Explorer',
  'Patins inline Oxer',
  'Raquete beach tennis Shark',
  'Prancha stand up inflavel',
  'Kimono jiu-jitsu trancado',
  'Luva boxe Everlast Pro Style',
  'Kit beach tennis carbono'
];

const JARDINAGEM = [
  'Aparador de grama Tramontina AP1500T',
  'Mangueira flex para jardim 30m',
  'Tesoura de poda Tramontina profissional',
  'Soprador de folhas a bateria',
  'Cortador de grama eletrico 1300W',
  'Vaso autoirrigavel grande',
  'Kit ferramentas jardinagem 3 pecas',
  'Mangueira expansivel 15m',
  'Serra de poda eletrica',
  'Pulverizador manual 5L'
];

const DISCOVERY_QUERY_BLOCKS = {
  'Mercado Livre': [
    'ofertas do dia',
    'mais vendidos',
    'tendências',
    'eletrônicos em oferta',
    'celulares promoção',
    'casa móveis decoração',
    'utilidades domésticas',
    'cozinha promoção',
    'beleza cuidado pessoal',
    'bebê promoção',
    'pet shop promoção',
    'games promoção',
    'ferramentas construção',
    'esporte fitness',
    'automotivo promoção',
    'informática promoção',
    'moda feminina promoção',
    'moda masculina promoção',
    'organização casa',
    'produto viral'
  ],
  'Amazon': [
    'mais vendidos',
    'ofertas do dia',
    'eletrônicos promoção',
    'casa promoção',
    'cozinha promoção',
    'utilidades domésticas',
    'beleza promoção',
    'livros mais vendidos',
    'kindle promoção',
    'fire tv promoção',
    'alexa promoção',
    'brinquedos promoção',
    'bebê promoção',
    'pet promoção',
    'games promoção',
    'informática promoção',
    'escritório promoção',
    'produto viral',
    'achadinhos amazon',
    'lançamentos amazon'
  ],
  'Shopee': [
    'ofertas oficiais',
    'mais vendidos',
    'achadinhos',
    'moda promoção',
    'beleza promoção',
    'eletrônicos promoção',
    'casa decoração',
    'cama mesa banho',
    'smartphones promoção',
    'fritadeira elétrica',
    'projetor promoção',
    'saúde promoção',
    'pet promoção',
    'bebê promoção'
  ]
};

const MARKETPLACE_DISCOVERY_SOURCES = {
  'Mercado Livre': [
    { type: 'url', source: 'https://www.mercadolivre.com.br/mais-vendidos', fallbackKeyword: 'mais vendidos' },
    { type: 'url', source: 'https://www.mercadolivre.com.br/l/promocoes', fallbackKeyword: 'ofertas do dia' },
    { type: 'url', source: 'https://tendencias.mercadolivre.com.br/', fallbackKeyword: 'tendências' },
    { type: 'url', source: 'https://www.mercadolivre.com.br/categorias', fallbackKeyword: 'eletrônicos em oferta' },
    { type: 'url', source: 'https://www.mercadolivre.com.br/lojas-oficiais', fallbackKeyword: 'ofertas oficiais' }
  ],
  'Amazon': [
    { type: 'url', source: 'https://www.amazon.com.br/gp/bestsellers', fallbackKeyword: 'mais vendidos' },
    { type: 'url', source: 'https://www.amazon.com.br/deals', fallbackKeyword: 'ofertas do dia' },
    { type: 'url', source: 'https://www.amazon.com.br/gp/new-releases', fallbackKeyword: 'lançamentos amazon' },
    { type: 'url', source: 'https://www.amazon.com.br/gp/movers-and-shakers', fallbackKeyword: 'produto viral' }
  ],
  'Shopee': DISCOVERY_QUERY_BLOCKS.Shopee.map((source) => ({ type: 'keyword', source }))
};

const SPECIFIC_QUERY_FALLBACK_BLOCKS = {
  'Mercado Livre': [
    ...ELETRONICOS,
    ...GAMES,
    ...HARDWARE,
    ...INFORMATICA,
    ...CASA_INTELIGENTE,
    ...COZINHA,
    ...FERRAMENTAS,
    ...AUTOMOTIVO,
    ...CELULARES
  ],
  'Amazon': [
    ...ELETRONICOS,
    ...CASA_INTELIGENTE,
    ...COZINHA,
    ...LIVROS,
    ...BRINQUEDOS,
    ...BEBE,
    ...PET,
    ...ESCRITORIO
  ],
  'Shopee': [
    ...MODA_FEMININA,
    ...MODA_MASCULINA,
    ...BELEZA,
    ...UTILIDADES,
    ...DECORACAO,
    ...INFANTIL,
    ...BEBE,
    ...PET
  ]
};

function normalizeGoldenQuery(query) {
  return String(query || '').trim().replace(/\s+/g, ' ');
}

function normalizeDiscoverySource(source) {
  if (source && typeof source === 'object') {
    const type = source.type === 'url' ? 'url' : 'keyword';
    const value = normalizeGoldenQuery(source.source || source.query || source.url || source.value);
    return {
      type,
      source: value,
      query: value,
      fallbackKeyword: normalizeGoldenQuery(source.fallbackKeyword || '')
    };
  }

  const value = normalizeGoldenQuery(source);
  return { type: 'keyword', source: value, query: value, fallbackKeyword: '' };
}

function getDiscoverySourceValue(source) {
  return normalizeDiscoverySource(source).source;
}

function getDiscoverySourceKey(source) {
  const normalized = normalizeDiscoverySource(source);
  return `${normalized.type}:${normalized.source.toLowerCase()}`;
}

function dedupeQueryList(queries) {
  const seen = new Set();
  return queries.reduce((acc, rawQuery) => {
    const query = normalizeGoldenQuery(rawQuery);
    const key = query.toLowerCase();
    if (!query || seen.has(key)) return acc;
    seen.add(key);
    acc.push(query);
    return acc;
  }, []);
}

function classifyDiscoveryQuery(query) {
  const normalized = normalizeGoldenQuery(query).toLowerCase();
  if (/oferta|promo|achadinho/.test(normalized)) return 'ofertas';
  if (/mais vendido/.test(normalized)) return 'mais_vendidos';
  if (/tend[eê]ncia/.test(normalized)) return 'tendencias';
  if (/viral/.test(normalized)) return 'viral';
  if (/lan[cç]amento/.test(normalized)) return 'lancamentos';
  return 'categoria';
}

function buildDiscoveryQueryBank(queries) {
  const buckets = QUERY_VARIANT_ORDER.reduce((acc, variant) => {
    acc[variant] = [];
    return acc;
  }, {});

  dedupeQueryList(queries).forEach((query) => {
    buckets[classifyDiscoveryQuery(query)].push(query);
  });

  return buckets;
}

function buildDiscoveryQueries() {
  return Object.entries(DISCOVERY_QUERY_BLOCKS).reduce((acc, [store, queries]) => {
    acc[store] = { discovery: buildDiscoveryQueryBank(queries) };
    return acc;
  }, {});
}

const DISCOVERY_QUERIES = buildDiscoveryQueries();
const GOLDEN_QUERIES = DISCOVERY_QUERIES;

const QUERY_ROTATION_STATE = {};

function rotateList(items, offset = 0) {
  if (!items.length) return [];
  const shift = Math.abs(offset) % items.length;
  return items.slice(shift).concat(items.slice(0, shift));
}

function seededShuffle(items, seed = 0) {
  const shuffled = [...items];
  let state = (seed + 1) * 2654435761;

  for (let index = shuffled.length - 1; index > 0; index--) {
    state = (state * 1664525 + 1013904223) >>> 0;
    const swapIndex = state % (index + 1);
    [shuffled[index], shuffled[swapIndex]] = [shuffled[swapIndex], shuffled[index]];
  }

  return shuffled;
}

// #region debug-point A:query-meta
function resolveQueryAuditMeta(store, query) {
  const source = normalizeDiscoverySource(query);
  const normalizedQuery = source.source;
  if (source.type === 'url') {
    return {
      category: 'Discovery',
      variant: 'marketplace_url',
      sourceType: 'url',
      fallbackKeyword: source.fallbackKeyword || null
    };
  }
  const storeBank = GOLDEN_QUERIES[store]?.discovery || {};

  for (const [variantName, queries] of Object.entries(storeBank)) {
    if ((queries || []).some((candidate) => normalizeGoldenQuery(candidate) === normalizedQuery)) {
      return { category: 'Discovery', variant: variantName, sourceType: 'keyword' };
    }
  }

  const fallbackQueries = SPECIFIC_QUERY_FALLBACK_BLOCKS[store] || [];
  if (fallbackQueries.some((candidate) => normalizeGoldenQuery(candidate) === normalizedQuery)) {
    return { category: 'Fallback específico', variant: 'fallback', sourceType: 'keyword' };
  }

  return { category: 'Desconhecida', variant: 'unknown', sourceType: source.type };
}
// #endregion

function pickQueryFromCategory(categoryBank, variantOrder, usedQueries) {
  if (!categoryBank) return null;

  for (const variant of variantOrder) {
    const pool = categoryBank[variant] || [];
    for (const rawQuery of pool) {
      const query = normalizeGoldenQuery(rawQuery);
      if (query && !usedQueries.has(query)) {
        return query;
      }
    }
  }

  return null;
}

function selectDiscoveryQueries(storeName) {
  const store = storeName;
  if (store === 'Mercado Livre' && isMercadoLivreSignalsScrapedoEnabled()) {
    console.log(`[ML] provider=scrapedo mode=signals legacyBlocked=true`);
    const signalUrls = getMercadoLivreSignalUrls().split(',').map(s => s.trim()).filter(Boolean);
    const selectedSignals = [];
    for (const url of signalUrls) {
      console.log(`[ML] URL=${url}`);
      selectedSignals.push({
        source: url,
        type: 'url',
        fallbackKeyword: null
      });
    }
    return selectedSignals;
  }

  const discoveryBank = GOLDEN_QUERIES[store]?.discovery || null;
  const settings = STORE_QUERY_SETTINGS[store] || { categoriesPerRun: 12, queriesPerCategory: 2 };
  const configuredQueryLimit = Math.max(1, settings.categoriesPerRun * settings.queriesPerCategory);
  const state = QUERY_ROTATION_STATE[store] || { cycleCursor: 0, variantCursor: 0, firstQueryKeys: [] };
  QUERY_ROTATION_STATE[store] = state;

  if (store === 'Shopee') {
    const shopeeSources = MARKETPLACE_DISCOVERY_SOURCES.Shopee || [];
    const selectedShopeeSources = rotateList(shopeeSources, state.cycleCursor)
      .slice(0, Math.min(configuredQueryLimit, shopeeSources.length))
      .map(normalizeDiscoverySource);
    state.cycleCursor = (state.cycleCursor + 1) % 100000;
    return selectedShopeeSources;
  }

  if (!discoveryBank) {
    return [normalizeDiscoverySource('oferta')];
  }

  const variantOrder = rotateList(QUERY_VARIANT_ORDER, state.variantCursor);
  const usedQueries = new Set();
  const selected = [];
  const firstQueryHistory = new Set(state.firstQueryKeys || []);
  const marketplaceSources = (MARKETPLACE_DISCOVERY_SOURCES[store] || []).map(normalizeDiscoverySource);
  const urlSources = marketplaceSources.filter((source) => source.type === 'url');
  const queryLimit = urlSources.length > 0
    ? Math.min(configuredQueryLimit, Math.max(urlSources.length, Math.ceil(urlSources.length / 0.7)))
    : configuredQueryLimit;
  const fallbackLimit = Math.floor(queryLimit * 0.2);
  const discoveryQueryCount = Math.max(1, queryLimit - fallbackLimit);
  const realUrlLimit = store === 'Mercado Livre'
    ? Math.min(urlSources.length, Math.ceil(queryLimit * 0.7))
    : (store === 'Amazon' ? Math.min(urlSources.length, queryLimit - fallbackLimit) : 0);
  const keywordDiscoveryLimit = Math.max(1, queryLimit - Math.min(realUrlLimit, queryLimit) - fallbackLimit);

  if (urlSources.length > 0) {
    const rotatedUrls = rotateList(urlSources, state.cycleCursor);
    for (let index = 0; selected.length < Math.min(realUrlLimit, queryLimit) && index < rotatedUrls.length; index++) {
      const source = rotatedUrls[index];
      const key = getDiscoverySourceKey(source);
      if (usedQueries.has(key)) continue;
      usedQueries.add(key);
      selected.push(source);
    }
  }

  const keywordTarget = Math.min(queryLimit - fallbackLimit, selected.length + keywordDiscoveryLimit, discoveryQueryCount);
  while (selected.length < keywordTarget) {
    let addedThisRound = false;

    for (const variant of variantOrder) {
      const shuffledPool = seededShuffle(discoveryBank[variant] || [], state.cycleCursor + selected.length + variantOrder.indexOf(variant));

      for (const rawQuery of shuffledPool) {
        const query = normalizeGoldenQuery(rawQuery);
        const key = `keyword:${query.toLowerCase()}`;
        if (!query || usedQueries.has(key)) continue;
        if (selected.length === 0 && firstQueryHistory.has(key)) continue;

        usedQueries.add(key);
        selected.push(normalizeDiscoverySource(query));
        addedThisRound = true;
        break;
      }

      if (selected.length >= discoveryQueryCount) break;
    }

    if (!addedThisRound) break;
  }

  const fallbackQueries = seededShuffle(
    dedupeQueryList(SPECIFIC_QUERY_FALLBACK_BLOCKS[store] || []),
    state.cycleCursor + 97
  );

  for (const rawQuery of fallbackQueries) {
    if (selected.length >= queryLimit) break;
    const query = normalizeGoldenQuery(rawQuery);
    const key = `keyword:${query.toLowerCase()}`;
    if (!query || usedQueries.has(key)) continue;
    usedQueries.add(key);
    selected.push(normalizeDiscoverySource(query));
  }

  const firstQueryKey = selected[0] ? getDiscoverySourceKey(selected[0]) : null;
  if (firstQueryKey) {
    state.firstQueryKeys = [firstQueryKey, ...(state.firstQueryKeys || [])].slice(0, Math.min(6, DISCOVERY_QUERY_BLOCKS[store].length + urlSources.length));
  }

  state.cycleCursor = (state.cycleCursor + 1) % 100000;
  state.variantCursor = (state.variantCursor + 1) % QUERY_VARIANT_ORDER.length;

  // #region debug-point A:selected-queries
  emitAuditEvent('A', 'oracle-scraper.cjs:getRandomQueries', 'query-batch-selected', {
    store,
    totalCategoriesAvailable: DISCOVERY_QUERY_BLOCKS[store].length,
    selectedCategories: variantOrder,
    dormantCategories: [],
    queriesSelected: selected.map((query) => ({ query: getDiscoverySourceValue(query), type: normalizeDiscoverySource(query).type, ...resolveQueryAuditMeta(store, query) })),
    settings,
    rotationState: { cycleCursor: state.cycleCursor, variantCursor: state.variantCursor }
  });
  // #endregion

  return selected;
}

function getRandomQueries(store) {
  return selectDiscoveryQueries(store);
}

// ─── Telemetria Global do Ciclo ─────────────────────────────────
const cycleMetrics = {
  startTime: Date.now(),
  produtos_encontrados: 0,
  produtos_enviados_llm: 0,
  produtos_retornados: 0,
  produtos_aprovados: 0,
  produtos_rejeitados: 0,
  totalTokens: 0,
  reject_reasons: {},
  por_marketplace: {},
  rejeicoes: { antiLixo: 0, priceFloor: 0, loja: 0, marca: 0, qualidade: 0 },
  produtosAprovadosLista: [],
  produtosDescartadosLista: [],
  produtosPremium: 0,
  erros: 0,
  retries: 0
};

// ─── Extração via Crawlee + Groq ──────────────────────────────
async function crawleeExtract(url, limit, storeName) {
  let rawExtractedData = '';
  let evalResult = { text: '', found: 0, sent: 0 };
  const extractStartedAt = Date.now();
  const queryContext = {
    store: SCRAPER_AUDIT_STATE.currentStore || storeName,
    query: SCRAPER_AUDIT_STATE.currentQuery,
    category: SCRAPER_AUDIT_STATE.currentCategory,
    variant: SCRAPER_AUDIT_STATE.currentVariant
  };

  // Calcula maxProducts aqui (fora do page.evaluate, pois lá não tem acesso às variáveis Node.js)
  const providerConfig = PROVIDER_CONFIG[LLM_PROVIDER];
  const maxProducts = providerConfig?.productsToProcess || 15;
  
  const SCRAPFLY_KEYS = (process.env.SCRAPFLY_API_KEYS || "").split(",").map(k => k.trim()).filter(k => k);
  let proxyConfiguration;
  let targetUrl = url;
  
  const isLocal = process.platform === 'win32';

  // Usamos Scrapfly apenas se não for execução local (para evitar proxy de datacenter no IP residencial)
  if (!isLocal && storeName === 'Mercado Livre' && SCRAPFLY_KEYS.length > 0) {
    const key = SCRAPFLY_KEYS[Math.floor(Math.random() * SCRAPFLY_KEYS.length)];
    // Proxy Scrapfly: username = API_KEY, password = asp=true&country=br
    proxyConfiguration = new ProxyConfiguration({
      proxyUrls: [`http://${key}:asp=true&country=br@proxy.scrapfly.io:8080`]
    });
    console.log(`  [Scrapfly] Utilizando proxy na loja Mercado Livre`);
  }

  const crawler = new PlaywrightCrawler({
    proxyConfiguration,
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 150,
    navigationTimeoutSecs: 120,
    maxRequestRetries: 3, // Retry failed requests up to 3 times
    autoscaledPoolOptions: {
      systemStatusOptions: {
        maxMemoryOverloadedRatio: 999,
        maxEventLoopOverloadedRatio: 999,
        maxCpuOverloadedRatio: 999,
        maxClientOverloadedRatio: 999
      }
    },
    browserPoolOptions: {
      useFingerprints: false, // Desativado para não conflitar com o stealthPlugin
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
          '--no-first-run',
          '--mute-audio'
        ],
        ...(storeName === 'Amazon' ? AMAZON_CONTEXT_OPTIONS : {})
      }
    },
    preNavigationHooks: [
      async ({ page, request }) => {
        if (storeName === 'Mercado Livre' && isMercadoLivreSignalsScrapedoEnabled()) {
           const html = await fetchMercadoLivreViaScrapedo(request.url);
           await page.route(request.url, route => {
              route.fulfill({
                 status: 200,
                 contentType: 'text/html',
                 body: html
              });
           });
        }
        page.setDefaultNavigationTimeout(150000);
        page.setDefaultTimeout(150000);
      }
    ],
    async requestHandler({ request, page, log }) {
      log.info(`[Crawlee] Raspando: ${request.url}`);
      
      // Bloqueia imagens, fontes e mídia para economizar RAM/CPU na VPS e evitar timeouts
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

      if (!crawler.__imageDebugListenerAttached) {
        page.on('console', (msg) => {
          try {
            const text = msg.text();
            if (typeof text === 'string' && text.startsWith('IMAGE_DEBUG')) {
              console.log(text);
            }
          } catch {}
        });
        crawler.__imageDebugListenerAttached = true;
      }

      evalResult = await page.evaluate(({ maxProd, imageDebugCtx }) => {
        const candidates = Array.from(document.querySelectorAll('div[data-asin], .a-carousel-card, div[data-component-type="s-search-result"], [data-testid="product-card"], .ui-search-layout__item, .poly-card, .andes-card'));
        const items = candidates.filter(el => {
          return !candidates.some(child => child !== el && el.contains(child));
        });
        
        let results = [];
        const IMAGE_DEBUG_LIMIT = 5;
        let imageDebugLogged = 0;

        const parseSrcsetUrls = (srcsetValue) => {
          if (!srcsetValue || typeof srcsetValue !== 'string') return [];
          return srcsetValue
            .split(',')
            .map((part) => part.trim())
            .filter(Boolean)
            .map((part) => part.split(/\s+/)[0])
            .filter(Boolean);
        };

        const collectCardImages = (cardEl) => {
          const imgs = Array.from(cardEl.querySelectorAll('img'));
          const out = [];
          const seen = new Set();

          const pushUrl = (url, origin, attrName) => {
            if (!url || typeof url !== 'string') return;
            const normalized = url.trim();
            if (!normalized) return;
            const key = `${origin}::${normalized}`;
            if (seen.has(key)) return;
            seen.add(key);
            if (origin === 'outro' && attrName) {
              out.push({ url: normalized, origin, attr: attrName });
            } else {
              out.push({ url: normalized, origin });
            }
          };

          for (const imgEl of imgs) {
            const src = imgEl.getAttribute('src');
            if (src) pushUrl(src, 'src');

            const srcset = imgEl.getAttribute('srcset');
            if (srcset) {
              for (const u of parseSrcsetUrls(srcset)) pushUrl(u, 'srcset');
            }

            const dataSrc = imgEl.getAttribute('data-src');
            if (dataSrc) pushUrl(dataSrc, 'data-src');

            const dataOriginal = imgEl.getAttribute('data-original');
            if (dataOriginal) pushUrl(dataOriginal, 'data-original');

            const dataLazy = imgEl.getAttribute('data-lazy') || imgEl.getAttribute('data-lazy-src');
            if (dataLazy) pushUrl(dataLazy, 'data-lazy');

            const dyn = imgEl.getAttribute('data-a-dynamic-image');
            if (dyn) {
              try {
                const parsed = JSON.parse(dyn);
                for (const k of Object.keys(parsed || {})) {
                  pushUrl(k, 'outro', 'data-a-dynamic-image');
                }
              } catch {}
            }
          }

          return out;
        };

        const extractCardTitle = (cardEl) => {
          const t =
            (cardEl.querySelector('h2 span') && cardEl.querySelector('h2 span').textContent) ||
            (cardEl.querySelector('.a-size-base-plus') && cardEl.querySelector('.a-size-base-plus').textContent) ||
            (cardEl.querySelector('.a-size-medium') && cardEl.querySelector('.a-size-medium').textContent) ||
            '';
          const cleaned = (t || '').trim();
          if (cleaned) return cleaned;
          const imgAlt = cardEl.querySelector('img') ? cardEl.querySelector('img').getAttribute('alt') : '';
          return (imgAlt || '').trim();
        };

        const pickBestLink = (cardEl) => {
          const anchors = Array.from(cardEl.querySelectorAll('a[href]'));
          const hrefs = anchors
            .map((a) => (a.href || '').trim())
            .filter(Boolean);

          let rawLink = '';
          const directAmazon = hrefs.find((href) => /amazon\.com\.br\/(?:dp|gp\/aw\/d|gp\/product)\//i.test(href));
          if (directAmazon) rawLink = directAmazon;
          else {
            const embeddedAmazon = hrefs.find((href) => href.includes('https://www.amazon.com.br/'));
            if (embeddedAmazon) rawLink = embeddedAmazon;
            else {
              const headingAnchor = cardEl.querySelector('h2 a[href]');
              if (headingAnchor && headingAnchor.href) rawLink = headingAnchor.href;
              else rawLink = hrefs[0] || '';
            }
          }

          const match = rawLink.match(/https:\/\/(?:www\.)?amazon\.com\.br\/[^\s"'<>]+/i);
          return match ? match[0] : rawLink;
        };

        for (let el of items) {
          const text = el.innerText || '';
          if (text.includes('R$')) {
            const imgTag = el.querySelector('img.s-image') || el.querySelector('img.ui-search-result-image__element') || el.querySelector('img[data-testid="image"]') || el.querySelector('img');
            const url = pickBestLink(el);
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
              const title = extractCardTitle(el);
              if (imageDebugLogged < IMAGE_DEBUG_LIMIT) {
                const imagesInCard = collectCardImages(el);
                console.log('IMAGE_DEBUG ' + JSON.stringify({
                  Marketplace: (imageDebugCtx && imageDebugCtx.marketplace) || '',
                  "Golden Query": (imageDebugCtx && imageDebugCtx.goldenQuery) || '',
                  "Título": title,
                  "Quantidade de imagens encontradas dentro do card": imagesInCard.length,
                  "Imagem atualmente escolhida pelo scraper": img || '',
                  "Lista completa das URLs de imagens encontradas no card": imagesInCard
                }));
                imageDebugLogged++;
              }
              
              let old_price = '';
              let discount = '';
              let rating = '';
              const rawTextReplaced = text.replace(/\n/g, ' ');
              
              const dePorMatch = rawTextReplaced.match(/De:\s*R\$?\s*([\d.,]+)/i);
              if (dePorMatch) old_price = dePorMatch[1];
              
              const offMatch = rawTextReplaced.match(/(\d+%)\s*off/i);
              if (offMatch) discount = offMatch[1];
              
              const ratingMatch = rawTextReplaced.match(/([\d.,]+)\s*de\s*5\s*estrelas/i) || rawTextReplaced.match(/(\d+\.\d+)\s*\/\s*5/);
              if (ratingMatch) rating = ratingMatch[1];
              
              const officialStore = rawTextReplaced.toLowerCase().includes('loja oficial') ? true : null;

              results.push({
                title,
                price: '', // Let LLM extract exact price
                old_price,
                discount,
                image_url: img,
                product_url: url,
                rating,
                official_store: officialStore,
                raw_text: rawTextReplaced
              });
            }
          }
        }
        const unique = [];
        const seen = new Set();
        for(let r of results) {
          if(r.product_url && !seen.has(r.product_url)){ seen.add(r.product_url); unique.push(r); }
        }
        const finalProducts = unique.slice(0, maxProd);
        return { 
          products: finalProducts, 
          found: items.length,
          valid: results.length,
          sent: finalProducts.length
        };
      }, { maxProd: maxProducts, imageDebugCtx: { marketplace: storeName, goldenQuery: queryContext.query || '' } });
      console.log(`\n  [DIAGNÓSTICO ${storeName}] Seletores encontrados: ${evalResult.found} | Cards com preço: ${evalResult.valid} | Enviados: ${evalResult.sent}`);
      console.log(`[${storeName}] Itens raspados (únicos): ${evalResult.sent}`);
    }
  });

  try {
    await crawler.run([targetUrl]);
  } catch (err) {
    // #region debug-point B:crawlee-error
    emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'crawler-error', {
      ...queryContext,
      url: targetUrl,
      error: err.message,
      durationMs: Date.now() - extractStartedAt
    });
    // #endregion
    console.error(`  [Crawlee] Erro ao raspar ${storeName}: ${err.message}`);
    await logErrorToSupabase('Oracle-Scraper', 'Crawlee Extract', err, { storeName, url: targetUrl });
    return [];
  }

function buildSafeProductPayload(products, options = {}) {
  const maxChars = options.maxChars || 20000; // Limite seguro para Groq/Cerebras
  let currentLength = 0;
  const included = [];
  const excluded = [];
  
  for (const prod of products) {
    const prodJson = JSON.stringify(prod);
    if (currentLength + prodJson.length > maxChars && included.length > 0) {
      excluded.push(prod);
    } else {
      included.push(prod);
      currentLength += prodJson.length;
    }
  }
  
  return {
    payload: JSON.stringify(included, null, 2),
    includedCount: included.length,
    excludedCount: excluded.length,
    reason: excluded.length > 0 ? 'Limit Reached' : 'All Fit'
  };
}

  const safePayloadResult = buildSafeProductPayload(evalResult.products || [], { maxChars: 20000 });
  rawExtractedData = safePayloadResult.payload;

  console.log(`  [PAYLOAD DYNAMICS] Incluídos: ${safePayloadResult.includedCount} | Excluídos: ${safePayloadResult.excludedCount} | Motivo: ${safePayloadResult.reason}`);

  cycleMetrics.produtos_encontrados += evalResult.found;
  cycleMetrics.produtos_enviados_llm += safePayloadResult.includedCount;
  if (!cycleMetrics.por_marketplace[storeName]) cycleMetrics.por_marketplace[storeName] = 0;

  // #region debug-point B:extract-summary
  emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'extract-summary', {
    ...queryContext,
    url: targetUrl,
    selectorsFound: evalResult.found,
    cardsWithPrice: evalResult.valid,
    productsSentToLlm: safePayloadResult.includedCount,
    rawPayloadLength: rawExtractedData.length,
    durationMs: Date.now() - extractStartedAt
  });
  // #endregion

  if (!rawExtractedData || safePayloadResult.includedCount === 0) {
    // #region debug-point B:empty-extract
    emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'extract-empty', {
      ...queryContext,
      url: targetUrl
    });
    // #endregion
    return [];
  }
  
  // validateHtml bypass for JSON payload: if it starts with '[', consider valid.
  const isHtmlValid = rawExtractedData.trim().startsWith('[') ? true : validateHtml(rawExtractedData, storeName);
  if (!isHtmlValid) {
    // #region debug-point B:html-rejected
    emitAuditEvent('B', 'oracle-scraper.cjs:crawleeExtract', 'html-validator-rejected', {
      ...queryContext,
      url: targetUrl,
      rawPayloadLength: rawExtractedData.length
    });
    // #endregion
    return [];
  }

  // Chama o LLM para formatar os dados
  console.log(`  [LLM] Analisando dados brutos da ${storeName}...`);
  if (storeName === "Amazon") console.log("RAW AMZ (Start):", rawExtractedData.substring(0, 300));
  const prompt = getScrapingPrompt(storeName);

  // Validate that JSON payload is at least valid before sending to LLM
  try { JSON.parse(rawExtractedData); } catch (e) {
    console.error("  [LLM] Payload JSON gerado não é válido!", e.message);
    return [];
  }

  const messages = [
    { role: 'system', content: prompt },
    { role: 'user', content: rawExtractedData }
  ];

  try {
    const res = await callLLMWithFallback(messages, {
      temperature: 0.1,
      responseFormat: { type: "json_object" },
      diagnostic: {
        phase: 'extraction',
        promptType: 'scraping',
        store: storeName,
        query: queryContext.query,
        productsInBatch: safePayloadResult.includedCount,
        rawLength: rawExtractedData.length
      }
    });

    const content = res.choices[0].message.content;
    try {
      const cleanContent = content.trim().replace(/^```json\s*/i, "").replace(/^```\s*/, "").replace(/\s*```$/, "").trim();
      const data = JSON.parse(cleanContent);
      const returnedProducts = data.products || [];
      if (global.PIPELINE_FORENSICS) {
         returnedProducts.forEach(p => {
            global.PIPELINE_FORENSICS.push({
               id: p.id || Math.random().toString(36).substr(2, 9),
               marketplace: storeName,
               url: p.url || p.original_url || '',
               produto: p.title || p.product_name || 'Desconhecido',
               preco: p.price || p.current_price || 0,
               preco_antigo: p.old_price || 0,
               desconto: p.discount || 0,
               categoria: queryContext.category || '',
               marca: p.brand || '',
               loja: p.seller || storeName,
               imagem: p.image_url || p.image || '',
               status_atual: 'PARSED',
               etapa_final: 'Parser',
               motivo: '',
               score: 0,
               tempo_execucao: Date.now(),
               publicado: false,
               atributos_originais: { ...p }
            });
         });
      }
      cycleMetrics.produtos_retornados += returnedProducts.length;
      const validationPreview = buildValidationPreview(returnedProducts, storeName);
      
      if (storeName === "Amazon") {
        console.log(`[Amazon] Output:`, JSON.stringify(returnedProducts, null, 2));
      }

      // #region debug-point C:validator-preview
      emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'validator-preview', {
        ...queryContext,
        returnedProducts: returnedProducts.length,
        previewApproved: validationPreview.approved,
        previewRejected: validationPreview.rejected,
        avgConfidence: validationPreview.avgConfidence,
        rejectStats: validationPreview.rejectStats,
        confidenceBuckets: validationPreview.confidenceBuckets,
        missingStats: validationPreview.missingStats
      });
      // #endregion
      
      const approvedProducts = sanitizeScrapedData(returnedProducts, storeName);
      // Sprint 06.1: Nenhum produto é descartado aqui prematuramente.
      
      console.log(`\n  [DIAGNÓSTICO ${storeName}] Retornados: ${returnedProducts.length} | Aprovados: ${approvedProducts.length} | Rejeitados: ${returnedProducts.length - approvedProducts.length}`);

      // #region debug-point C:validator-result
      emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'validator-result', {
        ...queryContext,
        returnedProducts: returnedProducts.length,
        approvedProducts: approvedProducts.length,
        rejectedProducts: returnedProducts.length - approvedProducts.length,
        limitApplied: limit
      });
      // #endregion
      const approvedNames = approvedProducts.map(p => p.product_name);
      returnedProducts.forEach(p => {
        if (!approvedNames.includes(p.product_name)) {
          cycleMetrics.produtosDescartadosLista.push({
            name: p.product_name,
            store: storeName,
            category: queryContext.category,
            brand: 'Desconhecida',
            reason: 'Rejeitado por Sanitização / LLM',
            rule: 'Quality'
          });
        }
      });

      cycleMetrics.produtos_aprovados += approvedProducts.length;
      cycleMetrics.produtos_rejeitados += (returnedProducts.length - approvedProducts.length);
      cycleMetrics.por_marketplace[storeName] = (cycleMetrics.por_marketplace[storeName] || 0) + approvedProducts.length;
      
      return approvedProducts;
    } catch (parseErr) {
      // #region debug-point C:parse-error
      emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'llm-parse-error', {
        ...queryContext,
        error: parseErr.message
      });
      // #endregion
      console.error(`  [LLM] Erro de parse JSON no scraper: ${parseErr.message}`);
      return [];
    }
  } catch (err) {
    // #region debug-point C:llm-error
    emitAuditEvent('C', 'oracle-scraper.cjs:crawleeExtract', 'llm-formatting-error', {
      ...queryContext,
      error: err.message
    });
    // #endregion
    console.error(`  [LLM] Falha na formatação: ${err.message}`);
    return [];
  }
}

// ─── Normalização e Links de Afiliado ─────────────────────────
function cleanProductUrl(url) {
  if (!url) return null;
  try {
    let candidate = url;

    const embeddedAmazonMatch = candidate.match(/https:\/\/www\.amazon\.com\.br\/[^\s"'<>]+/gi);
    if (embeddedAmazonMatch && embeddedAmazonMatch.length > 0) {
      candidate = embeddedAmazonMatch[embeddedAmazonMatch.length - 1];
    }

    const asinMatch = candidate.match(/\/(?:dp|gp\/aw\/d|gp\/product)\/([A-Z0-9]{10})/i);
    if (asinMatch) {
      return `https://www.amazon.com.br/dp/${asinMatch[1].toUpperCase()}`;
    }

    const obj = new URL(candidate);
    obj.search = '';
    obj.hash = '';
    return obj.toString();
  } catch(e) {
    return url;
  }
}

function normalizeImageUrl(url) {
  if (!url || url === 'null') return null;
  // Rejeita imagens de anúncios patrocinados da Amazon (logo de marca, não produto)
  if (url.includes('/S/al-na') || url.includes('sponsored-ads.amazon') || url.includes('aax-us-east-retail')) return null;
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

function extractOriginalRakutenUrl(linkUrl) {
  if (!linkUrl) return null;
  try {
    const parsed = new URL(linkUrl);
    const directUrl = parsed.searchParams.get('murl');
    return directUrl ? decodeURIComponent(directUrl) : linkUrl;
  } catch (_) {
    return linkUrl;
  }
}

async function fetchNetshoesProductsFromRakuten(query, limit = OFFERS_PER_STORE, page = 1) {
  if (!ENABLE_NETSHOES_RAKUTEN) {
    console.log('  [Rakuten Netshoes] Flag desabilitada. Retornando 0 produtos.');
    return [];
  }

  if (!RAKUTEN_ACCESS_TOKEN || !RAKUTEN_CLIENT_ID || !RAKUTEN_CLIENT_SECRET || !RAKUTEN_SID || !RAKUTEN_NETSHOES_MID) {
    console.warn('  [Rakuten Netshoes] Credenciais incompletas. Retornando 0 produtos.');
    return [];
  }

  try {
    const resp = await axios.get('https://api.linksynergy.com/productsearch/1.0', {
      headers: {
        Authorization: `Bearer ${RAKUTEN_ACCESS_TOKEN}`,
        Accept: 'application/xml'
      },
      params: {
        mid: RAKUTEN_NETSHOES_MID,
        keyword: query,
        max: limit,
        pagenumber: page,
        language: 'pt_BR'
      },
      timeout: 60000,
      responseType: 'text',
      validateStatus: () => true
    });

    if (resp.status !== 200) {
      console.warn(`  [Rakuten Netshoes] HTTP ${resp.status}. Retornando 0 produtos.`);
      return [];
    }

    const xml = typeof resp.data === 'string' ? resp.data : String(resp.data || '');
    if (!xml) {
      console.warn('  [Rakuten Netshoes] XML vazio. Retornando 0 produtos.');
      return [];
    }

    const $ = cheerio.load(xml, { xmlMode: true });
    const errorText = $('Errors > ErrorText').first().text().trim();
    if (errorText) {
      console.warn(`  [Rakuten Netshoes] Falha na API: ${errorText}. Retornando 0 produtos.`);
      return [];
    }

    const converted = $('result > item').map((_, node) => {
      const item = $(node);
      const productName = item.find('productname').first().text().trim();
      const merchantName = item.find('merchantname').first().text().trim();
      const imageUrl = item.find('imageurl').first().text().trim() || null;
      const affiliateUrl = item.find('linkurl').first().text().trim() || null;
      const originalUrl = extractOriginalRakutenUrl(affiliateUrl);
      const retailPrice = Number.parseFloat(item.find('price').first().text().trim());
      const salePriceRaw = Number.parseFloat(item.find('saleprice').first().text().trim());
      const hasSalePrice = Number.isFinite(salePriceRaw) && salePriceRaw > 0 && salePriceRaw < retailPrice;
      const currentPrice = hasSalePrice ? salePriceRaw : retailPrice;
      const oldPrice = hasSalePrice ? retailPrice : null;
      const categoryPrimary = item.find('category > primary').first().text().trim() || 'Geral';

      if (!productName || !Number.isFinite(currentPrice) || !originalUrl) return null;

      return {
        product_name: productName,
        current_price: currentPrice,
        old_price: oldPrice,
        image_url: imageUrl,
        original_url: originalUrl,
        affiliate_url: affiliateUrl,
        category: categoryPrimary,
        marketplace: 'Netshoes',
        platform: 'Netshoes',
        merchant_name: merchantName || null
      };
    }).get().filter(Boolean);

    console.log(`  [Rakuten Netshoes] HTTP ${resp.status} | Retornados: ${$('result > item').length} | Convertidos: ${converted.length}`);
    return converted;
  } catch (err) {
    console.warn(`  [Rakuten Netshoes] Erro de requisição: ${err.message}. Retornando 0 produtos.`);
    return [];
  }
}

// ─── Shopee Quality Layer ─────────────────────────────────────
// Auditoria de campos da API oficial (open-api.affiliate.shopee.com.br/graphql):
//
// DISPONÍVEIS na resposta productOfferV2.nodes:
//   itemId, productName, priceMin, priceMax, imageUrl, productLink,
//   offerLink, sales, commissionRate, sellerCommissionRate,
//   shopeeCommissionRate, ratingStar, priceDiscountRate, shopId, shopName
//
// NÃO DISPONÍVEIS (CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL):
//   is_shopee_mall        → sem campo direto; heurística via shopName
//   is_official_store     → sem campo direto; heurística via shopName
//   is_key_seller         → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   has_free_shipping     → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   has_national_shipping → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   has_cashback          → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   coupon                → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   store_location        → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   store_country         → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   estimated_delivery    → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   rating_count          → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   brand                 → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   variants              → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   stock                 → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
//   campaigns             → CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL (inferível via keyword)

/**
 * enrichShopeeOffer — captura todos os campos disponíveis na API oficial afiliada.
 * Não faz chamadas HTTP. Usa apenas o node retornado pela API.
 * Campos ausentes são registrados explicitamente como null.
 */
function enrichShopeeOffer(node) {
  const shopName    = String(node.shopName    || '').trim();
  const productName = String(node.productName || '').trim();

  const commissionRate       = parseShopeeMoney(node.commissionRate);
  const sellerCommissionRate = parseShopeeMoney(node.sellerCommissionRate);
  const shopeeCommissionRate = parseShopeeMoney(node.shopeeCommissionRate);
  const priceDiscountRate    = parseShopeeMoney(node.priceDiscountRate);
  const ratingStar  = node.ratingStar != null ? parseFloat(String(node.ratingStar)) : null;
  const salesCount  = node.sales      != null ? Number(node.sales) : null;

  // Shopee Mall: sem campo direto. Heurística via shopName.
  const isShopeeMall    = shopName.length > 0 && /shopee\s*mall/i.test(shopName);
  // Loja Oficial: sem campo direto. Heurística via shopName.
  const isOfficialStore = shopName.length > 0 &&
    (/loja\s*oficial/i.test(shopName) || /official\s*store/i.test(shopName));

  // Comissão Extra: commissionRate > 5% é evidência de campanha extra afiliados.
  const totalCommission    = commissionRate != null ? commissionRate : (sellerCommissionRate ?? null);
  const hasExtraCommission = totalCommission != null && totalCommission > 5;

  // Campanhas: inferidas via keyword no productName — única fonte disponível.
  // Não representa dado oficial de campanha da Shopee.
  const campaignPatterns = [
    { re: /\b7[\s._]?7\b/,    name: '7.7'         },
    { re: /\b8[\s._]?8\b/,    name: '8.8'         },
    { re: /\b9[\s._]?9\b/,    name: '9.9'         },
    { re: /\b10[\s._]?10\b/,  name: '10.10'       },
    { re: /\b11[\s._]?11\b/,  name: '11.11'       },
    { re: /\b12[\s._]?12\b/,  name: '12.12'       },
    { re: /black\s*friday/i,    name: 'Black Friday'},
  ];
  const detectedCampaigns = campaignPatterns
    .filter(({ re }) => re.test(productName))
    .map(({ name }) => name);

  return {
    // ── Campos disponíveis na API ────────────────────────────
    shop_name:              shopName || null,
    shop_id:                node.shopId  ?? null,
    item_id:                node.itemId  ?? null,
    commission_rate:        commissionRate,
    seller_commission_rate: sellerCommissionRate,
    shopee_commission_rate: shopeeCommissionRate,
    price_discount_rate:    priceDiscountRate,
    sales_count:            Number.isFinite(salesCount) ? salesCount : null,
    rating_star:            Number.isFinite(ratingStar) ? ratingStar : null,
    // ── Detectados via heurística no shopName ────────────────
    is_shopee_mall:         isShopeeMall,
    is_official_store:      isOfficialStore,
    has_extra_commission:   hasExtraCommission,
    total_commission_rate:  totalCommission,
    detected_campaigns:     detectedCampaigns,
    // ── CAMPOS NÃO DISPONÍVEIS NA INTEGRAÇÃO ATUAL ───────────
    is_key_seller:          null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    has_free_shipping:      null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    has_national_shipping:  null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    has_cashback:           null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    coupon:                 null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    store_location:         null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    store_country:          null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    estimated_delivery:     null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    rating_count:           null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
    brand:                  null, // CAMPO NÃO DISPONÍVEL NA INTEGRAÇÃO ATUAL
  };
}

/**
 * validateShopeeOrigin — valida origem Brasil com múltiplas evidências.
 *
 * A API open-api.affiliate.shopee.com.br é segmentada por país (BR).
 * Não existe campo 'country' porque o endpoint já é BR. Mas lojas chinesas
 * podem estar cadastradas na Shopee BR — detectamos via sinais negativos.
 *
 * Confiança:
 *   HIGH_CONFIDENCE_BR   → URL .com.br + API BR + sem sinais negativos
 *   MEDIUM_CONFIDENCE_BR → domínio BR confirmado, shopName neutro/ausente
 *   LOW_CONFIDENCE       → dados insuficientes para classificar
 *   INTERNATIONAL        → sinais explícitos de origem internacional
 *
 * Quality Gate:
 *   HIGH/MEDIUM  → ACCEPTED     (segue para upsertOffer)
 *   LOW          → NEEDS_REVIEW (logar, não bloquear automaticamente)
 *   INTERNATIONAL → REJECTED    (descartar sem persistir)
 */
function validateShopeeOrigin(productUrl, productName, enriched) {
  const urlStr  = String(productUrl  || '').toLowerCase();
  const nameStr = String(productName || '').toLowerCase();
  const shopStr = String(enriched.shop_name || '').toLowerCase();

  const reasons = [];
  let score = 0;

  // ── Sinais positivos ────────────────────────────────────
  if (urlStr.includes('shopee.com.br')) {
    reasons.push('URL domínio shopee.com.br confirmado');
    score += 3;
  }
  reasons.push('Produto retornado pela API afiliada open-api.affiliate.shopee.com.br (BR)');
  score += 2;

  if (enriched.is_shopee_mall) {
    reasons.push('Shopee Mall detectado via shopName');
    score += 2;
  }
  if (enriched.is_official_store) {
    reasons.push('Loja Oficial detectada via shopName');
    score += 2;
  }
  if (enriched.commission_rate != null) {
    reasons.push('Comissão afiliada BR presente (commissionRate disponível)');
    score += 1;
  }

  // ── Sinais negativos (indicadores internacionais) ────────
  const intlKeywords = [
    'china', ' cn ', 'overseas', 'importado', 'import ',
    'cross border', 'cross-border', 'chinês', 'frete internacional'
  ];
  const nameHasIntl = intlKeywords.some(kw => nameStr.includes(kw));
  const shopHasIntl = shopStr.length > 0 && intlKeywords.some(kw => shopStr.includes(kw));

  let rejectionReason = null;
  if (nameHasIntl) {
    reasons.push('ALERTA: nome do produto contém indicador internacional');
    score -= 4;
    rejectionReason = rejectionReason || 'INDICADOR_INTERNACIONAL_NO_NOME';
  }
  if (shopHasIntl) {
    reasons.push('ALERTA: nome da loja contém indicador internacional');
    score -= 5;
    rejectionReason = 'INDICADOR_INTERNACIONAL_NA_LOJA';
  }

  // ── Classificação ────────────────────────────────────────
  let confidence, isBrazilian, qualityGate;
  if (rejectionReason) {
    confidence = 'INTERNATIONAL'; isBrazilian = false; qualityGate = 'REJECTED';
  } else if (score >= 5) {
    confidence = 'HIGH_CONFIDENCE_BR';   isBrazilian = true;  qualityGate = 'ACCEPTED';
  } else if (score >= 3) {
    confidence = 'MEDIUM_CONFIDENCE_BR'; isBrazilian = true;  qualityGate = 'ACCEPTED';
  } else {
    confidence = 'LOW_CONFIDENCE';       isBrazilian = null;  qualityGate = 'NEEDS_REVIEW';
  }

  return { isBrazilian, confidence, qualityGate, reasons, rejectionReason };
}

/**
 * calcShopeeScoreBoost — bônus de score usando exclusivamente campos reais da API.
 * Delta máximo +2.5 — não inverte ranking base do scoreV1.
 *
 * ★★★★★  Shopee Mall:     +1.0  (detectado via shopName)
 * ★★★★★  Loja Oficial:    +0.8  (detectado via shopName)
 * ★★★★★  Comissão Extra:  +0.5  (commissionRate > 5%)
 * ★★★☆☆  ≥100 vendidos:   +0.3  (sales)
 * ★★★☆☆  ≥4.5 avaliação:  +0.2  (ratingStar)
 * ★★★☆☆  Campanha detect: +0.2  (via keyword no productName)
 */
function calcShopeeScoreBoost(enriched) {
  let boost = 0;
  if (enriched.is_shopee_mall)       boost += 1.0;
  if (enriched.is_official_store)    boost += 0.8;
  if (enriched.has_extra_commission) boost += 0.5;
  if (enriched.sales_count != null && enriched.sales_count >= 100)  boost += 0.3;
  if (enriched.rating_star  != null && enriched.rating_star  >= 4.5) boost += 0.2;
  if (enriched.detected_campaigns && enriched.detected_campaigns.length > 0) boost += 0.2;
  return Math.min(boost, 2.5);
}

// ─── Shopee Affiliate Link (API Oficial) ─────────────────────
const crypto = require('crypto');
async function generateShopeeAffiliateUrl(originalUrl) {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) return originalUrl;
  try {
    const timestamp = Math.floor(Date.now() / 1000);
    const path = '/api/v2/affiliate/links/generate';
    const baseString = `${SHOPEE_APP_ID}${timestamp}${path}`;
    const sign = crypto.createHmac('sha256', SHOPEE_APP_SECRET).update(baseString).digest('hex');

    const resp = await axios.post(
      `https://open-api.affiliate.shopee.com.br${path}`,
      { origin_url: originalUrl },
      {
        headers: { 'Content-Type': 'application/json' },
        params: { app_id: SHOPEE_APP_ID, timestamp, sign }
      }
    );
    const link = resp.data?.data?.affiliate_link;
    return link || originalUrl;
  } catch (err) {
    console.warn(`  [Shopee] Falha ao gerar link afiliado: ${err.message}. Usando URL original.`);
    return originalUrl;
  }
}

function parseShopeeMoney(value) {
  if (value === null || value === undefined || value === '') return null;
  const num = Number.parseFloat(String(value).replace(',', '.'));
  return Number.isFinite(num) ? num : null;
}

function buildShopeeOfficialPayload(query, limit, page = 1) {
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

async function fetchShopeeProductsFromOfficialApi(query, limit = OFFERS_PER_STORE) {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) {
    console.warn('  [Shopee API] Credenciais ausentes. Retornando 0 produtos.');
    return [];
  }

  const payload = buildShopeeOfficialPayload(query, limit, 1);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = crypto
    .createHash('sha256')
    .update(`${SHOPEE_APP_ID}${timestamp}${payload}${SHOPEE_APP_SECRET}`)
    .digest('hex');

  try {
    const resp = await axios.post(SHOPEE_OFFICIAL_API_URL, payload, {
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `SHA256 Credential=${SHOPEE_APP_ID}, Timestamp=${timestamp}, Signature=${signature}`,
      },
      timeout: 60000,
      validateStatus: () => true,
    });

    const errors = Array.isArray(resp.data?.errors) ? resp.data.errors : [];
    if (resp.status !== 200 || errors.length > 0) {
      const errMsg = errors.map((e) => e?.message).filter(Boolean).join(' | ') || `HTTP ${resp.status}`;
      console.warn(`  [Shopee API] Falha na busca oficial: ${errMsg}. Retornando 0 produtos.`);
      return [];
    }

    const nodes = Array.isArray(resp.data?.data?.productOfferV2?.nodes)
      ? resp.data.data.productOfferV2.nodes
      : [];

    const converted = nodes
      .map((node) => {
        const currentPrice = parseShopeeMoney(node?.priceMin) ?? parseShopeeMoney(node?.priceMax);
        const oldPriceCandidate = parseShopeeMoney(node?.priceMax);
        const oldPrice = oldPriceCandidate && currentPrice && oldPriceCandidate > currentPrice ? oldPriceCandidate : null;
        if (!node?.productName || !currentPrice || !node?.productLink) return null;

        const nameLower = String(node.productName).toLowerCase();
        
        // 1. Anti-Lixo
        const lixoKeywords = ['capinha', 'película', 'cabo', 'carregador', 'fone de fio', 'suporte', 'adaptador', 'pulseira'];
        if (lixoKeywords.some(kw => nameLower.includes(kw))) {
          cycleMetrics.rejeicoes.antiLixo++;
          cycleMetrics.produtosDescartadosLista.push({ name: String(node.productName), store: 'Shopee', category: 'Geral', brand: 'Genérica', reason: 'Filtro Anti-Lixo Comercial', rule: 'Anti-Lixo' });
          return null;
        }

        // 2. Price Floor
        if (currentPrice < 30) {
          cycleMetrics.rejeicoes.priceFloor++;
          cycleMetrics.produtosDescartadosLista.push({ name: String(node.productName), store: 'Shopee', category: 'Geral', brand: 'Genérica', reason: 'Preço abaixo do mínimo comercial', rule: 'Price Floor' });
          return null;
        }

        const mapped = {
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

        // Enriquecimento e validação de origem Brasil (campos reais da API)
        const enriched = enrichShopeeOffer(node);
        const origin   = validateShopeeOrigin(mapped.original_url, mapped.product_name, enriched);
        
        if (origin.status === 'REJECTED') {
          cycleMetrics.rejeicoes.loja++;
          cycleMetrics.produtosDescartadosLista.push({ name: mapped.product_name, store: 'Shopee', category: 'Geral', brand: 'Genérica', reason: origin.reasons.join(' | '), rule: 'Loja/Origem Internacional' });
          return null;
        }

        mapped.shopee_enrichment = enriched;
        mapped.shopee_origin     = origin;

        return mapped;
      })
      .filter(Boolean);

    console.log(`  [Shopee API] HTTP ${resp.status} | Retornados: ${nodes.length} | Convertidos: ${converted.length}`);
    return converted;
  } catch (err) {
    console.warn(`  [Shopee API] Erro de requisição: ${err.message}. Retornando 0 produtos.`);
    return [];
  }
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
async function generateOfferAnalysis(product, store, diagnosticMeta = {}) {
  // Verifica se temos pelo menos um provider configurado
  const hasCerebras = !!PROVIDER_CONFIG.cerebras.apiKey;
  const hasGroq = !!PROVIDER_CONFIG.groq.apiKey;
  
  if (!hasCerebras && !hasGroq) {
    console.warn(`  [LLM] Nenhum provider configurado. Usando fallback.`);
    return generateFallback(product, store);
  }
  
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

  const messages = [
    { role: "system", content: baseSystemPrompt },
    { role: "user", content: userPrompt }
  ];

  try {
    const data = await callLLMWithFallback(messages, {
      temperature: 0.7,
      maxTokens: 1000,
      responseFormat: { type: "json_object" },
      diagnostic: {
        phase: 'copy',
        promptType: 'offer_analysis',
        store,
        offerId: diagnosticMeta.offerId || product.id || null,
        productsInBatch: 1,
        pipelineBatchSize: diagnosticMeta.pipelineBatchSize ?? null,
        query: diagnosticMeta.query || null
      }
    });

    let raw;
    try {
      raw = JSON.parse(cleanJsonString(data.choices[0].message.content));
    } catch (parseErr) {
      console.log(`  [LLM] JSON malformado. Usando fallback.`);
      return generateFallback(product, store);
    }
    const strategy = (raw.strategies && raw.strategies[0]) ? raw.strategies[0] : null;
    if (!strategy) {
      console.log(`  [LLM] Sem estratégia válida. Usando fallback.`);
      return generateFallback(product, store);
    }

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
    console.error(`  [LLM] Falha na geração de copy: ${err.message}. Usando fallback.`);
    return generateFallback(product, store);
  }
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
  
  // ── Score boost Shopee (campos reais da API oficial) ───────────
  // Aplicado APENAS para store=Shopee usando enrichment já calculado.
  // Não altera calculateScoreV1/V2. Preserva todos os outros marketplaces.
  let scoreBoost = 0;
  if (store === 'Shopee' && product.shopee_enrichment) {
    scoreBoost = calcShopeeScoreBoost(product.shopee_enrichment);
  }
  const scoreFinal = store === 'Shopee'
    ? Number(Math.min(10, scoreV1 + scoreBoost).toFixed(2))
    : scoreV1;

  // A V1 continua base; Shopee recebe boost quando há dados afiliados
  const score = scoreFinal;

  // Prepara explainability com os scores para armazenar
  const explainability = {
    score_v1: scoreV1,
    score_v2: scoreV2,
    timestamp: new Date().toISOString(),
    oracle_version: "2.0",
    ...(store === 'Shopee' && product.shopee_enrichment ? {
      shopee_enrichment: product.shopee_enrichment,
      shopee_origin: product.shopee_origin ? {
        confidence:      product.shopee_origin.confidence,
        qualityGate:     product.shopee_origin.qualityGate,
        isBrazilian:     product.shopee_origin.isBrazilian,
        rejectionReason: product.shopee_origin.rejectionReason,
        reasons:         product.shopee_origin.reasons,
      } : null,
      shopee_score_boost: scoreBoost,
    } : {}),
  };

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

  // #region debug-point D:score-calculated
  emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-scored', {
    store,
    query: SCRAPER_AUDIT_STATE.currentQuery,
    queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
    queryVariant: SCRAPER_AUDIT_STATE.currentVariant,
    productName: product.product_name,
    productCategory: product.category || 'Geral',
    currentPrice: product.current_price,
    oldPrice: product.old_price,
    rating: product.rating,
    hasImage: !!product.image_url,
    scoreV1,
    scoreV2,
    scoreChosen: score
  });
  // #endregion

  const { data: existing } = await supabase.from('offers').select('id, current_price, explainability').eq('original_url', affiliateUrl).eq('user_id', ADMIN_USER_ID).maybeSingle();

  if (existing) {
    // Merge explainability existente com os novos scores
    const newExplainability = { ...(existing.explainability || {}), ...explainability };

    if (Number(existing.current_price) !== product.current_price) {
      await supabase.from('offers').update({ 
        current_price: product.current_price, 
        old_price: product.old_price, 
        image_url: product.image_url, 
        score, 
        explainability: newExplainability,
        updated_at: new Date().toISOString() 
      }).eq('id', existing.id);
    } else {
      await supabase.from('offers').update({ 
        score, 
        explainability: newExplainability,
        updated_at: new Date().toISOString() 
      }).eq('id', existing.id);
    }

    // #region debug-point D:db-update
    emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-upserted-existing', {
      store,
      query: SCRAPER_AUDIT_STATE.currentQuery,
      queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
      productName: product.product_name,
      offerId: existing.id,
      score
    });
    // #endregion
    return { id: existing.id, isNew: false, score };
  }

  if (global.PIPELINE_FORENSICS) { const tf = global.PIPELINE_FORENSICS.find(f => f.url === affiliateUrl); if (tf) { tf.status_atual = 'PUBLISHED'; tf.etapa_final = 'Publicação'; tf.score = finalScore; tf.publicado = true; } }
    const { data, error } = await supabase.from('offers').insert({
    user_id: ADMIN_USER_ID, platform: store, product_name: product.product_name, original_url: affiliateUrl,
    image_url: product.image_url, current_price: product.current_price, old_price: product.old_price,
    rating: product.rating, category: product.category || 'Geral', score, status: 'draft',
    explainability: explainability,
    notes: `[Oracle In-House] Importado às ${new Date().toLocaleString('pt-BR')}`,
  }).select('id').single();

  if (error) {
    // #region debug-point D:db-error
    emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-insert-error', {
      store,
      query: SCRAPER_AUDIT_STATE.currentQuery,
      queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
      productName: product.product_name,
      error: error.message
    });
    // #endregion
    console.error(`  ✗ Erro insert: ${error.message}`);
    await logErrorToSupabase('Oracle-Scraper', 'Upsert Offer', error, { product, store, affiliateUrl });
    return null;
  }

  // #region debug-point D:db-insert
  emitAuditEvent('D', 'oracle-scraper.cjs:upsertOffer', 'offer-inserted-new', {
    store,
    query: SCRAPER_AUDIT_STATE.currentQuery,
    queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
    productName: product.product_name,
    offerId: data.id,
    score
  });
  // #endregion
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
  let belowThresholdCount = 0;
  
  for (const c of candidates) {
    if (c.score < APPROVAL_SCORE) {
      belowThresholdCount++;
      continue;
    }
    
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

  // #region debug-point E:approval-pipeline
  emitAuditEvent('E', 'oracle-scraper.cjs:processTopOffers', 'approval-pipeline-summary', {
    totalCandidates: candidates.length,
    belowThresholdCount,
    selectedForAi: vipOffers.length,
    leftoverCount: leftovers.length,
    maxPerStore,
    uniqueStores
  });
  // #endregion

  if (vipOffers.length === 0) {
    console.log(`\n🤖 Nenhuma oferta atingiu o score mínimo (${APPROVAL_SCORE}) para IA nesta rodada.`);
    return 0;
  }

  console.log(`\n🤖 Iniciando processamento IA para as ${vipOffers.length} melhores ofertas...`);
  let processed = 0;

  for (const item of vipOffers) {
    console.log(`  [IA] Gerando copy para: ${item.product.product_name.substring(0, 40)}...`);
    const analysis = await generateOfferAnalysis(item.product, item.store, {
      offerId: item.id,
      pipelineBatchSize: vipOffers.length,
      query: item.audit?.query || null
    });
    
    console.log(`\n  [RANKING]`);
    console.log(`  Score Comercial: ${item.score}`);
    console.log(`  Quality Gate: APROVADO`);
    console.log(`  Produto enviado para IA.`);
    console.log(`  --------------------------------`);

    const finalScore = item.score; // Desacoplado da IA
    
    console.log(`  [IA]`);
    console.log(`  Copy gerada.`);
    console.log(`  Score IA: ${analysis.score}`);
    console.log(`  Observação: Score IA não influencia aprovação.\n`);

    await supabase.from('posts').delete().eq('offer_id', item.id).eq('status', 'draft');

    const channels = ['telegram', 'instagram', 'whatsapp'];
    const linksMap = {};
    let linkErrorFound = false;

    for (const channel of channels) {
      const subId = createSubId(channel, item.id);
      const trackedUrl = createTrackedUrl(subId);
      
      const { data: linkData, error: linkError } = await supabase.from('affiliate_links').upsert({
        user_id: ADMIN_USER_ID, offer_id: item.id, channel, original_url: item.affiliateUrl, tracked_url: trackedUrl, sub_id: subId
      }, { onConflict: 'offer_id,channel' }).select('id').single();

      if (linkError || !linkData?.id) {
        console.error(`  [Erro] Falha ao criar link ${channel}: ${linkError?.message || 'linkData ausente'}`);
        linkErrorFound = true;
        break;
      }

      linksMap[channel] = { id: linkData.id, url: trackedUrl };
    }

    if (linkErrorFound) {
      continue;
    }

    const postsToInsert = [
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.telegram.id, channel: 'telegram', content: analysis.telegram.replace('{LINK}', linksMap.telegram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.instagram.id, channel: 'instagram', content: analysis.instagram.replace('{LINK}', linksMap.instagram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.whatsapp.id, channel: 'whatsapp', content: analysis.whatsapp.replace('{LINK}', linksMap.whatsapp.url), status: 'draft' }
    ];

    const { error: postsError } = await supabase.from('posts').insert(postsToInsert);
    if (postsError) {
      console.error(`  [Erro] Falha ao inserir posts: ${postsError.message}`);
      continue;
    }

    const { error: offerUpdateError } = await supabase.from('offers').update({ status: 'approved', score: finalScore }).eq('id', item.id);
    if (offerUpdateError) {
      console.error(`  [Erro] Falha ao aprovar oferta: ${offerUpdateError.message}`);
      continue;
    }

    // #region debug-point E:approved-offer
    emitAuditEvent('E', 'oracle-scraper.cjs:processTopOffers', 'offer-approved', {
      offerId: item.id,
      store: item.store,
      query: item.audit?.query || null,
      queryCategory: item.audit?.queryCategory || null,
      productName: item.product.product_name,
      originalScore: item.score,
      aiScore: analysis.score,
      finalScore
    });
    // #endregion
    
    cycleMetrics.produtosAprovadosLista.push({
      name: item.product.product_name,
      store: item.store,
      price: item.product.current_price,
      category: item.product.category,
      brand: item.product.brand || 'Genérica',
      discount: item.product.old_price ? Math.round((1 - (item.product.current_price / item.product.old_price)) * 100) : 0,
      score: finalScore,
      quality: analysis.commercial_quality,
      decision: analysis.commercial_decision
    });
    if (item.product.current_price > 1000) cycleMetrics.produtosPremium++;

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
function buildDiscoveryUrl(store, keyword) {
  const query = normalizeGoldenQuery(keyword);
  const urls = {
    'Mercado Livre': `https://lista.mercadolivre.com.br/${encodeURIComponent(query)}`,
    'Shopee': `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
    'Amazon': `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&rh=p_n_availability%3A2661601011`,
    'Shein': `https://br.shein.com/pdsearch/${encodeURIComponent(query)}/`,
    'Magalu': `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`,
    'Netshoes': `https://www.netshoes.com.br/busca?nsCat=natural&q=${encodeURIComponent(query)}`
  };
  return urls[store] || query;
}

async function fetchProductsForDiscoverySource(store, discoverySource, limit = OFFERS_PER_STORE) {
  const source = normalizeDiscoverySource(discoverySource);
  const finalUrl = source.type === 'url' ? source.source : buildDiscoveryUrl(store, source.source);

  if (store === 'Shopee') {
    return {
      products: await fetchShopeeProductsFromOfficialApi(source.source, limit),
      finalUrl: `Shopee Official API keyword="${source.source}"`,
      source
    };
  }

  if (store === 'Netshoes' && ENABLE_NETSHOES_RAKUTEN) {
    return {
      products: await fetchNetshoesProductsFromRakuten(source.source, limit),
      finalUrl,
      source
    };
  }

  let products = await crawleeExtract(finalUrl, limit, store);
  let usedUrl = finalUrl;

  if (source.type === 'url' && products.length === 0 && source.fallbackKeyword) {
    const fallbackUrl = buildDiscoveryUrl(store, source.fallbackKeyword);
    console.log(`  [Discovery] URL sem produtos aprovados. Fallback keyword: "${source.fallbackKeyword}" -> ${fallbackUrl}`);
    products = await crawleeExtract(fallbackUrl, limit, store);
    usedUrl = fallbackUrl;
  }

  return { products, finalUrl: usedUrl, source };
}

async function inspectMarketplaceCardsWithCrawlee(url, storeName, limit = OFFERS_PER_STORE) {
  const result = {
    cardsFound: 0,
    cardsWithPrice: 0,
    products: [],
    finalUrl: url
  };

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 120,
    navigationTimeoutSecs: 90,
    launchContext: {
      useIncognitoPages: false,
      launcher: chromium,
      launchOptions: {
        headless: true,
        args: [
          '--disable-dev-shm-usage',
          '--no-sandbox',
          '--disable-gpu',
          '--disable-blink-features=AutomationControlled',
          '--no-first-run',
          '--mute-audio'
        ],
        ...(storeName === 'Amazon' ? AMAZON_CONTEXT_OPTIONS : {})
      }
    },
    preNavigationHooks: [
      async ({ page, request }) => {
        if (storeName === 'Mercado Livre' && isMercadoLivreSignalsScrapedoEnabled()) {
           const html = await fetchMercadoLivreViaScrapedo(request.url);
           await page.route(request.url, route => {
              route.fulfill({
                 status: 200,
                 contentType: 'text/html',
                 body: html
              });
           });
        }
        page.setDefaultNavigationTimeout(120000);
        page.setDefaultTimeout(120000);
      }
    ],
    async requestHandler({ page }) {
      await page.route('**/*', (route) => {
        const type = route.request().resourceType();
        if (['image', 'font', 'media'].includes(type)) {
          route.abort();
        } else {
          route.continue();
        }
      });

      await page.waitForTimeout(2500);
      for (let i = 0; i < 4; i++) {
        await page.mouse.wheel(0, 700);
        await page.waitForTimeout(700);
      }

      const evaluated = await page.evaluate(({ maxProducts }) => {
        const selectors = [
          'div[data-asin]',
          'div[data-component-type="s-search-result"]',
          '[data-testid="product-card"]',
          '.ui-search-layout__item',
          '.poly-card',
          '.zg-grid-general-faceout',
          '.p13n-sc-uncoverable-faceout'
        ];
        const cards = Array.from(document.querySelectorAll(selectors.join(',')));
        const parsePrice = (text) => {
          const normalized = String(text || '').replace(/\s+/g, ' ');
          const match = normalized.match(/R\$\s*([\d.]+(?:,\d{2})?)/) || normalized.match(/\$\s*([\d.]+(?:,\d{2})?)/);
          if (!match) return null;
          const parsed = Number.parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
          return Number.isFinite(parsed) ? parsed : null;
        };
        const titleFrom = (card) => {
          const candidates = [
            card.querySelector('h2 span')?.textContent,
            card.querySelector('h2')?.textContent,
            card.querySelector('.a-size-base-plus')?.textContent,
            card.querySelector('.a-size-medium')?.textContent,
            card.querySelector('.p13n-sc-truncated')?.textContent,
            card.querySelector('[class*="line-clamp"]')?.textContent,
            card.querySelector('.poly-component__title')?.textContent,
            card.querySelector('.ui-search-item__title')?.textContent,
            card.querySelector('[class*="poly-component__title"]')?.textContent,
            card.querySelector('[class*="ui-search-item__title"]')?.textContent,
            card.querySelector('a[href] span')?.textContent,
            card.querySelector('img')?.getAttribute('alt')
          ];
          return (candidates.find(Boolean) || '').trim();
        };
        const linkFrom = (card) => {
          const anchors = Array.from(card.querySelectorAll('a[href]'));
          const hrefs = anchors.map((a) => a.href).filter(Boolean);
          return hrefs.find((href) => /\/(?:dp|gp\/product|MLB-)/i.test(href)) || hrefs[0] || location.href;
        };
        const imageFrom = (card) => {
          const img = card.querySelector('img.s-image') || card.querySelector('img.ui-search-result-image__element') || card.querySelector('img[data-testid="image"]') || card.querySelector('img');
          if (!img) return '';
          const dyn = img.getAttribute('data-a-dynamic-image');
          if (dyn) {
            try {
              const first = Object.keys(JSON.parse(dyn))[0];
              if (first) return first;
            } catch {}
          }
          return img.getAttribute('data-src') || img.getAttribute('src') || img.src || '';
        };

        const products = [];
        let cardsWithPrice = 0;
        for (const card of cards) {
          const text = card.innerText || '';
          const price = parsePrice(text);
          if (price) cardsWithPrice++;
          const title = titleFrom(card);
          const url = linkFrom(card);
          if (title && price && url && products.length < maxProducts) {
            products.push({
              product_name: title,
              current_price: price,
              old_price: null,
              image_url: imageFrom(card),
              url,
              category: 'Geral'
            });
          }
        }

        return { cardsFound: cards.length, cardsWithPrice, products };
      }, { maxProducts: limit });

      result.cardsFound = evaluated.cardsFound;
      result.cardsWithPrice = evaluated.cardsWithPrice;
      result.products = evaluated.products;
    }
  });

  await crawler.run([url]);
  return result;
}

async function inspectDiscoverySourceDryRun(store, discoverySource, limit = OFFERS_PER_STORE) {
  const source = normalizeDiscoverySource(discoverySource);

  if (store === 'Shopee') {
    const products = await fetchShopeeProductsFromOfficialApi(source.source, limit);
    return {
      store,
      source: source.source,
      type: 'keyword',
      finalUrl: `Shopee Official API keyword="${source.source}"`,
      cardsFound: products.length,
      cardsWithPrice: products.filter((product) => product.current_price).length,
      productsExtracted: products.length,
      productsApproved: products.filter((product) => product.product_name && product.current_price && (product.original_url || product.url)).length,
      dbWrites: 0
    };
  }

  let finalUrl = source.type === 'url' ? source.source : buildDiscoveryUrl(store, source.source);
  let inspected = await inspectMarketplaceCardsWithCrawlee(finalUrl, store, limit);

  if (source.type === 'url' && inspected.cardsWithPrice === 0 && source.fallbackKeyword) {
    finalUrl = buildDiscoveryUrl(store, source.fallbackKeyword);
    inspected = await inspectMarketplaceCardsWithCrawlee(finalUrl, store, limit);
  }

  const approved = inspected.products.filter((product) => product.product_name && product.current_price && product.url).length;
  return {
    store,
    source: source.source,
    type: source.type,
    finalUrl,
    cardsFound: inspected.cardsFound,
    cardsWithPrice: inspected.cardsWithPrice,
    productsExtracted: inspected.products.length,
    productsApproved: approved,
    dbWrites: 0
  };
}

async function scrapeStore(store) {
  const queries = getRandomQueries(store); // Pega 1 keyword de CADA categoria da loja
  let storeCandidates = [];
  const storeStartedAt = Date.now();

  for (const query of queries) {
    try {
      const discoverySource = normalizeDiscoverySource(query);
      const queryLabel = discoverySource.source;
      const queryMeta = resolveQueryAuditMeta(store, discoverySource);
      SCRAPER_AUDIT_STATE.currentStore = store;
      SCRAPER_AUDIT_STATE.currentQuery = queryLabel;
      SCRAPER_AUDIT_STATE.currentCategory = queryMeta.category;
      SCRAPER_AUDIT_STATE.currentVariant = queryMeta.variant;
      SCRAPER_AUDIT_STATE.queryStartedAt = Date.now();
      let scoredProducts = 0;
      let newOffers = 0;
      let existingOffers = 0;
      let skippedMissingCore = 0;
      const queryScores = [];

      // #region debug-point B:query-start
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'query-start', {
        store,
        query: queryLabel,
        sourceType: discoverySource.type,
        queryCategory: queryMeta.category,
        queryVariant: queryMeta.variant
      });
      // #endregion

      console.log(`\n🔍 [${store}] Buscando (${discoverySource.type}): "${queryLabel}"...`);
      const { products: rawProducts, finalUrl } = await fetchProductsForDiscoverySource(store, discoverySource, OFFERS_PER_STORE);

      for (const p of rawProducts) {
        // A Groq retorna product_name e image_url, mas também suporta title/image para compatibilidade
        const productName = p.product_name || p.title;
        const productImage = p.image_url || p.image;
        const productPrice = p.current_price || p.price;
        const productOldPrice = p.old_price;
        
        if (!productName || !productPrice) {
          skippedMissingCore++;
          continue;
        }
        
        const rawUrl = store === 'Shopee'
          ? (p.original_url?.startsWith('http') ? p.original_url : (p.url?.startsWith('http') ? p.url : finalUrl))
          : (p.url?.startsWith('http') ? p.url : finalUrl);
        const cleanUrl = cleanProductUrl(rawUrl);
        const affiliateUrl = store === 'Shopee'
          ? (p.affiliate_url?.startsWith('http') ? p.affiliate_url : await generateShopeeAffiliateUrl(cleanUrl))
          : buildAffiliateUrl(cleanUrl, store);
        
        // ── Quality Gate Shopee Brasil ──────────────────────────────
        if (store === 'Shopee' && p.shopee_origin) {
          const gate = p.shopee_origin.qualityGate;
          if (gate === 'REJECTED') {
            console.log(`  [SHOPEE][QUALITY] REJECTED | ${p.shopee_origin.rejectionReason} | "${productName.slice(0, 60)}"`);
            skippedMissingCore++;
            continue;
          }
          if (gate === 'NEEDS_REVIEW') {
            // Registra mas não bloqueia: a API BR já é filtragem primária.
            console.log(`  [SHOPEE][QUALITY] NEEDS_REVIEW | "${productName.slice(0, 60)}"`);
          }
        }

        const prodData = {
          product_name: productName, image_url: normalizeImageUrl(productImage || null),
          current_price: productPrice, old_price: productOldPrice && productOldPrice > productPrice ? productOldPrice : null,
          rating: p.rating ? parseFloat(String(p.rating)) : null, category: p.category || 'Geral',
          shopee_enrichment: p.shopee_enrichment || null,
          shopee_origin:     p.shopee_origin     || null,
        };

        const res = await upsertOffer(prodData, store, affiliateUrl);
        if (res) {
          scoredProducts++;
          queryScores.push(res.score);
          if (res.isNew) {
            newOffers++;
            storeCandidates.push({
              id: res.id,
              product: prodData,
              store,
              affiliateUrl,
              score: res.score,
              audit: {
                query: queryLabel,
                sourceType: discoverySource.type,
                queryCategory: queryMeta.category,
                queryVariant: queryMeta.variant
              }
            });
          } else {
            existingOffers++;
          }
        }
      }

      // #region debug-point B:query-end
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'query-end', {
        store,
        query: queryLabel,
        sourceType: discoverySource.type,
        finalUrl,
        queryCategory: queryMeta.category,
        queryVariant: queryMeta.variant,
        approvedProductsFromValidator: rawProducts.length,
        scoredProducts,
        newOffers,
        existingOffers,
        skippedMissingCore,
        avgScore: averageNumbers(queryScores),
        durationMs: Date.now() - SCRAPER_AUDIT_STATE.queryStartedAt
      });
      // #endregion
      
      // Espera 5 segundos entre as buscas de categorias para aliviar o Groq TPM
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      // #region debug-point B:query-error
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'query-error', {
        store,
        query: normalizeDiscoverySource(query).source,
        queryCategory: SCRAPER_AUDIT_STATE.currentCategory,
        queryVariant: SCRAPER_AUDIT_STATE.currentVariant,
        error: err.message,
        durationMs: SCRAPER_AUDIT_STATE.queryStartedAt ? Date.now() - SCRAPER_AUDIT_STATE.queryStartedAt : 0
      });
      // #endregion
      console.error(`  [${store}] Erro na fonte "${normalizeDiscoverySource(query).source}": ${err.message}`);
      await logErrorToSupabase('Oracle-Scraper', 'Scrape Query', err, { store, query: normalizeDiscoverySource(query).source });
    }
  }
  
  // #region debug-point B:store-summary
  emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'store-summary', {
    store,
    queriesExecuted: queries.length,
    candidatesCollected: storeCandidates.length,
    durationMs: Date.now() - storeStartedAt
  });
  // #endregion

  console.log(`  ✅ [${store}] ${storeCandidates.length} ofertas coletadas das diversas categorias.`);
  return storeCandidates;
}

// ─── Error Logging Helper ─────────────────────────────────────
async function logErrorToSupabase(integration, action, error, metadata = {}) {
  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID,
      integration,
      action,
      status: 'error',
      message: error.message || String(error),
      metadata: {
        ...metadata,
        stack: error.stack,
        timestamp: new Date().toISOString()
      }
    });
  } catch (logErr) {
    console.error('Failed to log error to Supabase:', logErr.message);
  }
}

// ─── Heartbeat System ─────────────────────────────────────────
async function updateHeartbeat() {
  try {
    await supabase.from('integration_logs').insert({
      user_id: ADMIN_USER_ID, integration: 'Notebook-Heartbeat', action: 'Heartbeat Ping', status: 'success',
      message: `Notebook is alive at ${new Date().toISOString()}`,
      metadata: { last_seen: new Date().toISOString() }
    });
  } catch (e) {}
}

async function checkHeartbeat() {
  try {
    const { data } = await supabase.from('integration_logs')
      .select('created_at')
      .eq('integration', 'Notebook-Heartbeat')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (data && data.created_at) {
      const lastSeen = new Date(data.created_at);
      const diffMins = (Date.now() - lastSeen.getTime()) / 1000 / 60;
      if (diffMins < 60) return true; // Online se visto na última 1 hora
    }
  } catch (e) {}
  return false;
}

// ─── Ciclo Principal ──────────────────────────────────────────
async function runScrapingCycle() {
  const startTime = Date.now();
  SCRAPER_AUDIT_STATE.cycleStartedAt = startTime;
  console.log(`\n${'═'.repeat(60)}\n🚀 ORACLE-SCRAPER IN-HOUSE — Início em ${new Date().toLocaleString('pt-BR')}\n${'═'.repeat(60)}`);

  const isWindows = process.platform === 'win32';
  const mode = process.env.SCRAPER_MODE || 'LOCAL';
  let allCandidates = [];
  let aiProcessed = 0;

  if (mode === 'LOCAL') {
    if (isWindows) {
      console.log(`\n[MODE: LOCAL] 💻 NOTEBOOK WINDOWS DETECTADO. Iniciando Scraping Local...`);
      await updateHeartbeat();
      const stores = getEnabledStores(['Mercado Livre', 'Amazon', 'Shopee']); // Magalu desativada: bloqueio 403 consistente. Shopee ativa quando SHOPEE_ADMITAD_CAMPAIGN_ID preenchido
      
      for (const store of stores) {
        try {
          const candidates = await scrapeStore(store);
          allCandidates = allCandidates.concat(candidates);
        } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
      }
      
      console.log(`\n✅ Scraping local concluído. ${allCandidates.length} ofertas raspadas neste ciclo.`);
      console.log(`\n📦 Buscando TODOS os drafts pendentes no Supabase para processar com IA...`);

      const { data: pendingDrafts, error: draftsError } = await supabase
        .from('offers')
        .select('*')
        .eq('status', 'draft')
        .eq('user_id', ADMIN_USER_ID);

      if (draftsError) {
        console.error(`[DRAFTS] Erro ao buscar drafts: ${draftsError.message}`);
      } else if (pendingDrafts && pendingDrafts.length > 0) {
        console.log(`\n🚀 ${pendingDrafts.length} drafts encontrados. Iniciando IA...`);
        const draftCandidates = pendingDrafts.map(d => ({
          id: d.id,
          product: {
            product_name: d.product_name,
            current_price: d.current_price,
            old_price: d.old_price,
            image_url: d.image_url,
            category: d.category || 'Geral',
            rating: d.rating
          },
          store: d.platform,
          affiliateUrl: d.original_url,
          score: d.score || 0
        }));
        aiProcessed = await processTopOffers(draftCandidates);
      } else {
        console.log(`\n📭 Nenhum draft pendente no Supabase.`);
      }
      await cleanupOldDrafts();
      
    } else {
      console.log(`\n[MODE: LOCAL] ☁️ ORACLE VPS DETECTADA. Atuando como Orquestrador / Leitor.`);
      const isOnline = await checkHeartbeat();
      if (!isOnline) {
         console.log(`\n⚠️ Scraping indisponível. Notebook offline há mais de 60 mins. Aguardando próximo ciclo.`);
         return; 
      }
      
      console.log(`\n📡 Notebook está online. Buscando novos DRAFTs no Supabase...`);
      const { data: drafts, error } = await supabase.from('offers')
        .select('*')
        .eq('status', 'draft')
        .eq('user_id', ADMIN_USER_ID);
        
      if (error) {
        console.error("Erro ao buscar drafts:", error.message);
      } else if (drafts && drafts.length > 0) {
         console.log(`\n📦 Encontrados ${drafts.length} drafts! Iniciando IA, Score Comercial e Publicação...`);
         
         // Remapeia para o formato que processTopOffers espera
         allCandidates = drafts.map(d => ({
           id: d.id,
           product: {
             product_name: d.product_name,
             current_price: d.current_price,
             old_price: d.old_price,
             image_url: d.image_url,
             category: d.category || 'Geral',
             rating: d.rating
           },
           store: d.platform,
           affiliateUrl: d.original_url,
           score: d.score || 0
         }));
         
         aiProcessed = await processTopOffers(allCandidates);
      } else {
         console.log(`\n📭 Nenhum draft novo no Supabase. Aguardando o Notebook enviar mais.`);
      }
      await cleanupOldDrafts();
    }
  } else if (mode === 'ORACLE' || mode === 'AUTO') {
    console.log(`\n[MODE: ${mode}] ⚠️ AVISO: Executando Scraping e Orquestração na mesma máquina (Uso para testes).`);
    const stores = getEnabledStores(isWindows ? ['Mercado Livre', 'Amazon', 'Shopee'] : ['Mercado Livre', 'Amazon', 'Shopee']); // Magalu desativada: bloqueio 403 consistente
    
    for (const store of stores) {
      try {
        const candidates = await scrapeStore(store);
        allCandidates = allCandidates.concat(candidates);
      } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
    }

    aiProcessed = await processTopOffers(allCandidates);
    await cleanupOldDrafts();
  }

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
        consumo_tokens: cycleMetrics.totalTokens, // Corrigido
        por_marketplace: cycleMetrics.por_marketplace,
        ab_test_report: abTestReport
      }
    });
  } catch(e){}

  // #region debug-point E:cycle-summary
  emitAuditEvent('E', 'oracle-scraper.cjs:runScrapingCycle', 'cycle-summary', {
    mode,
    totalScrapedCandidates: allCandidates.length,
    aiProcessed,
    durationSeconds: duration,
    produtosEncontrados: cycleMetrics.produtos_encontrados,
    produtosEnviadosLlm: cycleMetrics.produtos_enviados_llm,
    produtosRetornados: cycleMetrics.produtos_retornados,
    produtosAprovados: cycleMetrics.produtos_aprovados,
    produtosRejeitados: cycleMetrics.produtos_rejeitados,
    totalTokens: cycleMetrics.totalTokens,
    porMarketplace: cycleMetrics.por_marketplace
  });
  // #endregion

  try {
    const { generateReport } = require('./discovery-reporter.cjs');
    generateReport(cycleMetrics);
  } catch (err) {
    console.error('Erro ao gerar Discovery Intelligence Report:', err.message);
  }

  // Reset metrics for next cycle
  cycleMetrics.startTime = Date.now();
  cycleMetrics.produtos_encontrados = 0;
  cycleMetrics.produtos_enviados_llm = 0;
  cycleMetrics.produtos_retornados = 0;
  cycleMetrics.produtos_aprovados = 0;
  cycleMetrics.produtos_rejeitados = 0;
  cycleMetrics.totalTokens = 0; // Corrigido
  cycleMetrics.por_marketplace = {};
  cycleMetrics.ab_test_offers = [];

  console.log(`\n🏁 Ciclo concluído em ${duration}s! IA gerou ${aiProcessed} posts. Próximo ciclo em 4h.\n`);
}

async function runDiscoveryDryRun() {
  console.log('\n[DRY-RUN] Discovery Engine: 3 fontes por marketplace, sem IA e sem escrita no banco.\n');

  const stores = ['Mercado Livre', 'Amazon', 'Shopee'];
  const results = [];

  for (const store of stores) {
    const sources = selectDiscoveryQueries(store).slice(0, 3);
    for (const source of sources) {
      const result = await inspectDiscoverySourceDryRun(store, source, OFFERS_PER_STORE);
      results.push(result);
      console.log([
        `[DRY-RUN] ${result.store}`,
        `fonte="${result.source}"`,
        `tipo=${result.type}`,
        `url_final=${result.finalUrl}`,
        `cards=${result.cardsFound}`,
        `cards_com_preco=${result.cardsWithPrice}`,
        `produtos_extraidos=${result.productsExtracted}`,
        `produtos_aprovados=${result.productsApproved}`,
        `db_writes=${result.dbWrites}`
      ].join(' | '));
    }
  }

  const byStore = stores.reduce((acc, store) => {
    const storeResults = results.filter((result) => result.store === store);
    acc[store] = {
      fontesComProduto: storeResults.filter((result) => result.productsApproved > 0).length,
      totalFontes: storeResults.length,
      produtosAprovados: storeResults.reduce((sum, result) => sum + result.productsApproved, 0)
    };
    return acc;
  }, {});

  console.log('\n[DRY-RUN] Resumo:');
  for (const store of stores) {
    const summary = byStore[store];
    console.log(`[DRY-RUN] ${store}: ${summary.fontesComProduto}/${summary.totalFontes} fontes com produto | produtos_aprovados=${summary.produtosAprovados}`);
  }
  console.log('[DRY-RUN] Nenhum insert/update/delete executado.');

  return { results, byStore };
}

// ─── Inicialização ────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE-SCRAPER IN-HOUSE (Crawlee)      ║');
console.log('╚══════════════════════════════════════════╝\n');

// Verifica se temos pelo menos um LLM provider configurado
const hasAtLeastOneLLM = !!PROVIDER_CONFIG.cerebras.apiKey || !!PROVIDER_CONFIG.groq.apiKey;
const isDiscoveryDryRun = process.argv.includes('--discovery-dry-run');

if (!isDiscoveryDryRun && (!hasAtLeastOneLLM || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.log("Missing required API keys (Supabase and at least one LLM provider: Cerebras or Groq)");
  process.exit(1);
}

if (require.main === module && process.env.ORACLE_SCRAPER_DISABLE_AUTORUN !== '1') {
  if (isDiscoveryDryRun) {
    runDiscoveryDryRun().catch(e => {
      console.error('❌ Erro no dry-run discovery:', e.message);
      process.exitCode = 1;
    });
  } else {
    runScrapingCycle().catch(e => console.error('❌ Erro no ciclo:', e.message));

    cron.schedule(CRON_SCHEDULE, () => runScrapingCycle().catch(e => console.error('❌ Erro:', e.message)), {
      name: 'oracle-scraper-v2', timezone: 'America/Sao_Paulo', noOverlap: true
    });
  }
}
module.exports = { 
  callLLM,
  callLLMWithFallback,
  crawleeExtract,
  cleanProductUrl,
  normalizeImageUrl,
  buildAffiliateUrl,
  calculateScoreV1,
  calculateScoreV2,
  generateOfferAnalysis,
  generateFallback,
  selectDiscoveryQueries,
  getRandomQueries,
  scrapeStore,
  upsertOffer,
  processTopOffers,
  fetchShopeeProductsFromOfficialApi,
  fetchNetshoesProductsFromRakuten,
  runScrapingCycle,
  runDiscoveryDryRun,
  MARKETPLACE_DISCOVERY_SOURCES,
  logErrorToSupabase,
  DISCOVERY_QUERY_BLOCKS,
  GOLDEN_QUERIES,
  PROVIDER_CONFIG
};

function getEnabledStores(stores) {
  return stores.filter(store => !SKIP_STORES.has(store));
}
