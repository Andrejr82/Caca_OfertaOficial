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
const path         = require('path');
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
const cheerio      = require('cheerio');
require('dotenv').config({ path: '.env.local' });
require('tsx/cjs');
const { runMercadoLivreNativeTop20, writeMercadoLivreNativeTop20Reports } = require('./mercadolivre-native-top20-v5.cjs');
const { validateHtml, validateProduct, getScrapingPrompt, sanitizeScrapedData } = require('./scraper-adapter.cjs');
const {
  normalizeProductContentForLLM,
  createLLMInputFromNormalizedContent
} = require('../src/lib/token-optimization.js');


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

// Amazon mantém provider próprio; Mercado Livre usa somente SSR público de ofertas.
async function fetchAmazonHtmlViaScrapedo(url) {
  const apiKey = process.env.SCRAPEDO_API_KEY;
  if (!apiKey) throw new Error("SCRAPEDO_API_KEY não configurada.");

  console.log(`  [Scrape.do] Buscando HTML via proxy residencial...`);
  const response = await axios.get('https://api.scrape.do', {
    params: { token: apiKey, url, super: true },
    timeout: 60000,
    validateStatus: () => true
  });

  if (response.status === 200) return response.data;

  const body = safeDiagnosticSnippet(response.data);
  const cost = response.headers?.['scrape.do-request-cost'] ?? response.headers?.['scrapedo-request-cost'] ?? null;
  console.error(`  [Scrape.do] HTTP ${response.status} url=${url} super=true body=${body || 'empty'} cost=${cost ?? 'unavailable'}`);
  const error = new Error(`Scrape.do HTTP ${response.status}`);
  error.status = response.status;
  error.responseBody = body;
  error.scrapeDoUrl = url;
  if ([400, 401, 403].includes(response.status)) {
    throw error;
  }
  throw error;
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
const ENABLE_NETSHOES_RAKUTEN = process.env.ENABLE_NETSHOES_RAKUTEN !== '0';
const RAKUTEN_TOKEN_URL = 'https://api.linksynergy.com/token';
let rakutenTokenState = {
  accessToken: RAKUTEN_ACCESS_TOKEN || null,
  refreshToken: process.env.RAKUTEN_REFRESH_TOKEN || null,
  expiresAt: 0
};
let rakutenTokenRequest = null;

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
  let text = typeof value === 'string' ? value : JSON.stringify(value);
  for (const secret of [process.env.SCRAPEDO_API_KEY, process.env.SCRAPFLY_API_KEYS, process.env.CEREBRAS_API_KEY, process.env.GROQ_API_KEY].filter(Boolean)) {
    text = text.split(secret).join('[REDACTED]');
  }
  text = text.replace(/("(?:token|apiKey|key|secret)"\s*:\s*")([^"]+)(")/gi, '$1[REDACTED]$3');
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
  'Amazon': [],
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
  'Amazon': [],
  'Shopee': DISCOVERY_QUERY_BLOCKS.Shopee.map((source) => ({ type: 'keyword', source }))
};

const SPECIFIC_QUERY_FALLBACK_BLOCKS = {
  'Amazon': [],
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
    const type = source.type === 'url' ? 'url' : (source.type === 'node' ? 'node' : 'keyword');
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

  if (store === 'Amazon') {
    return (MARKETPLACE_DISCOVERY_SOURCES.Amazon || []).map(normalizeDiscoverySource);
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
  const realUrlLimit = store === 'Amazon' ? Math.min(urlSources.length, queryLimit - fallbackLimit) : 0;
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
  
  const targetUrl = url;

  const crawler = new PlaywrightCrawler({
    maxConcurrency: 1,
    requestHandlerTimeoutSecs: 150,
    navigationTimeoutSecs: 120,
    maxRequestRetries: 3,
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
      async ({ page }) => {
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

  let normalizedProducts = (evalResult.products || []).map((product) => JSON.parse(
    createLLMInputFromNormalizedContent(
      normalizeProductContentForLLM({
        marketplace: storeName,
        product,
        url: product?.product_url || product?.original_url || targetUrl
      })
    )
  ));

  let amazonUrlStats = null;
  if (storeName === 'Amazon') {
    const sanitizedAmazon = sanitizeAmazonProductsBeforeLlm(normalizedProducts);
    normalizedProducts = sanitizedAmazon.products;
    amazonUrlStats = sanitizedAmazon.stats;
  }

  const safePayloadResult = buildSafeProductPayload(normalizedProducts, { maxChars: 20000 });
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
        rawLength: rawExtractedData.length,
        amazonUrlStats
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
    const amazonCanonical = canonicalizeAmazonProductUrl(url);
    if (amazonCanonical.url) {
      return amazonCanonical.url;
    }

    const obj = new URL(url);
    obj.search = '';
    obj.hash = '';
    return obj.toString();
  } catch(e) {
    return url;
  }
}

const SCRAPEDO_AMAZON_BASE_URL = 'https://api.scrape.do/plugin/amazon';
const SCRAPEDO_AMAZON_RAW_HTML_URL = `${SCRAPEDO_AMAZON_BASE_URL}/`;
const AMAZON_DISCOVERY_V3_SOURCES = [
  {
    id: 'new_releases',
    label: 'New Releases',
    url: 'https://www.amazon.com.br/gp/new-releases/electronics',
    category: 'Eletronicos',
    parser: 'ranking'
  },
  {
    id: 'most_wished',
    label: 'Most Wished For',
    url: 'https://www.amazon.com.br/gp/most-wished-for/electronics',
    category: 'Eletronicos',
    parser: 'ranking'
  },
  {
    id: 'gift_ideas',
    label: 'Gift Ideas',
    url: 'https://www.amazon.com.br/gp/most-gifted/electronics',
    category: 'Eletronicos',
    parser: 'ranking'
  },
  {
    id: 'amazon_outlet',
    label: 'Amazon Outlet',
    url: 'https://www.amazon.com.br/b?ie=UTF8&node=20967360011',
    category: 'Outlet',
    parser: 'outlet'
  }
];

function normalizeOfferRating(value) {
  const rating = Number.parseFloat(String(value ?? '').replace(',', '.'));
  return Number.isFinite(rating) && rating >= 0 && rating <= 5 ? rating : null;
}

function applyMarketplaceDataContract(product, store) {
  const normalized = { ...product };
  if (store === 'Netshoes') {
    const category = String(normalized.category ?? '').trim();
    normalized.rating = null;
    normalized.category = category && category !== 'Geral' ? category : null;
  }
  if (store === 'Shopee') normalized.old_price = null;
  return normalized;
}

function parseAmazonReviewCount(value) {
  if (Number.isFinite(Number(value))) return Number(value);
  const normalized = String(value || '').replace(/[()\s]/g, '').toUpperCase();
  const match = normalized.match(/([\d.]+)([KM])?/);
  if (!match) return null;
  const amount = Number.parseFloat(match[2] ? match[1].replace(',', '.') : match[1].replace(/\./g, '').replace(',', '.'));
  if (!Number.isFinite(amount)) return null;
  return Math.round(amount * (match[2] === 'M' ? 1000000 : match[2] === 'K' ? 1000 : 1));
}

function parseAmazonBrazilPrice(value) {
  const text = String(value || '').replace(/\s+/g, ' ');
  const match = text.match(/R\$\s*([\d.]+,\d{2})/);
  if (!match) return null;
  const price = Number.parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(price) ? price : null;
}

function extractAmazonAsin(value) {
  const match = String(value || '').match(/\/(?:dp|gp\/product|gp\/aw\/d)\/([A-Z0-9]{10})(?=[/?#&]|$)/i);
  return match ? match[1].toUpperCase() : null;
}

function isSponsoredAmazonUrl(url) {
  const lower = String(url || '').toLowerCase();
  return lower.includes('sponsored-ads.amazon') || lower.includes('/s/al-na') || lower.includes('aax-us-east-retail');
}

function unwrapAmazonUrlCandidate(value) {
  const text = String(value || '').trim();
  if (!text) return null;

  const embedded = text.match(/https?:\/\/(?:www\.)?amazon\.com\.br\/[^\s"'<>]+/i);
  if (embedded) {
    return embedded[0];
  }

  try {
    const parsed = new URL(text);
    const unwrapParams = ['url', 'u', 'redirect', 'destination', 'dest', 'target', 'to', 'link', 'href', 'murl'];
    for (const param of unwrapParams) {
      const raw = parsed.searchParams.get(param);
      if (!raw) continue;
      const decoded = decodeURIComponent(raw);
      if (/amazon\.com\.br|amzn\.to/i.test(decoded) || /\/(?:dp|gp\/product|gp\/aw\/d)\//i.test(decoded)) {
        return decoded;
      }
    }
  } catch (_) {}

  try {
    const decoded = decodeURIComponent(text);
    if (decoded !== text && /(amazon\.com\.br|amzn\.to)/i.test(decoded)) {
      return decoded;
    }
  } catch (_) {}

  return text;
}

function canonicalizeAmazonProductUrl(url) {
  const original = String(url || '').trim();
  if (!original) {
    return { url: null, asin: null, sponsored: false };
  }

  const sponsored = isSponsoredAmazonUrl(original);
  let candidate = original;

  for (let depth = 0; depth < 4; depth++) {
    const asin = extractAmazonAsin(candidate);
    if (asin) {
      return {
        url: `https://www.amazon.com.br/dp/${asin}`,
        asin,
        sponsored
      };
    }

    const unwrapped = unwrapAmazonUrlCandidate(candidate);
    if (!unwrapped || unwrapped === candidate) break;
    candidate = unwrapped;
  }

  return { url: null, asin: null, sponsored };
}

function sanitizeAmazonProductsBeforeLlm(products) {
  const stats = {
    received: Array.isArray(products) ? products.length : 0,
    canonicalized: 0,
    sponsoredRejected: 0,
    sentToLLM: 0
  };

  const accepted = [];

  for (const product of Array.isArray(products) ? products : []) {
    const rawUrl = product?.product_url || product?.original_url || product?.url || '';
    const canonical = canonicalizeAmazonProductUrl(rawUrl);

    if (!canonical.url) {
      if (canonical.sponsored) {
        stats.sponsoredRejected++;
        console.log('[Amazon] sponsored URL descartada antes da IA');
      }
      continue;
    }

    if (canonical.url !== rawUrl) {
      stats.canonicalized++;
    }

    accepted.push({
      ...product,
      url: canonical.url,
      original_url: canonical.url,
      product_url: canonical.url,
      asin: canonical.asin
    });
  }

  stats.sentToLLM = accepted.length;
  console.log(`[Amazon URL] received=${stats.received} canonicalized=${stats.canonicalized} sponsoredRejected=${stats.sponsoredRejected} sentToLLM=${stats.sentToLLM}`);

  return { products: accepted, stats };
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

function parseRakutenNumber(value) {
  if (value === null || value === undefined) return null;
  const normalized = String(value).trim().replace(',', '.');
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRakutenDate(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function computeRakutenDiscountBadge(retailPrice, salePrice, discountValue, discountType) {
  const discountTypeNormalized = String(discountType || '').trim().toLowerCase();
  const explicitDiscount = parseRakutenNumber(discountValue);
  if (explicitDiscount && discountTypeNormalized === 'percentage') {
    return `${Math.round(explicitDiscount)}%`;
  }
  if (explicitDiscount && discountTypeNormalized === 'amount') {
    return explicitDiscount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
  }
  if (Number.isFinite(retailPrice) && Number.isFinite(salePrice) && retailPrice > salePrice && retailPrice > 0) {
    const pct = Math.round(((retailPrice - salePrice) / retailPrice) * 100);
    if (pct > 0) return `${pct}%`;
  }
  return null;
}

async function requestRakutenAccessToken(refreshToken = null) {
  const tokenKey = Buffer.from(`${RAKUTEN_CLIENT_ID}:${RAKUTEN_CLIENT_SECRET}`, 'utf8').toString('base64');
  const body = new URLSearchParams({ scope: RAKUTEN_SID });
  if (refreshToken) body.set('refresh_token', refreshToken);

  const response = await axios.post(RAKUTEN_TOKEN_URL, body.toString(), {
    headers: {
      Authorization: `Bearer ${tokenKey}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json'
    },
    timeout: 30000,
    validateStatus: () => true
  });

  if (response.status !== 200 || !response.data?.access_token) {
    throw new Error(`Rakuten token HTTP ${response.status}`);
  }

  const expiresIn = Math.max(60, Number(response.data.expires_in) || 3600);
  rakutenTokenState = {
    accessToken: response.data.access_token,
    refreshToken: response.data.refresh_token || refreshToken || rakutenTokenState.refreshToken,
    expiresAt: Date.now() + (expiresIn * 1000)
  };
  return rakutenTokenState.accessToken;
}

async function getRakutenAccessToken(forceRefresh = false) {
  if (!forceRefresh && rakutenTokenState.accessToken && rakutenTokenState.expiresAt > Date.now() + 60000) {
    return rakutenTokenState.accessToken;
  }
  if (rakutenTokenRequest) return rakutenTokenRequest;

  rakutenTokenRequest = (async () => {
    if (rakutenTokenState.refreshToken) {
      try {
        return await requestRakutenAccessToken(rakutenTokenState.refreshToken);
      } catch (_) {
        // O refresh persistido pode ter sido rotacionado; o token-key permanece a fonte oficial.
      }
    }
    return requestRakutenAccessToken();
  })();

  try {
    return await rakutenTokenRequest;
  } finally {
    rakutenTokenRequest = null;
  }
}

async function fetchNetshoesProductsFromRakuten(originalQuery, limit = OFFERS_PER_STORE, page = 1) {
  const query = originalQuery;
  if (!ENABLE_NETSHOES_RAKUTEN) {
    console.log('  [Rakuten Netshoes] Flag desabilitada. Retornando 0 produtos.');
    return [];
  }

  if (!RAKUTEN_CLIENT_ID || !RAKUTEN_CLIENT_SECRET || !RAKUTEN_SID || !RAKUTEN_NETSHOES_MID) {
    console.warn('  [Rakuten Netshoes] Credenciais incompletas. Retornando 0 produtos.');
    return [];
  }

  try {
    const requestProducts = async (accessToken) => axios.get('https://api.linksynergy.com/productsearch/1.0', {
      headers: {
        Authorization: `Bearer ${accessToken}`,
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

    let accessToken = await getRakutenAccessToken();
    let resp = await requestProducts(accessToken);
    if (resp.status === 401) {
      rakutenTokenState.expiresAt = 0;
      accessToken = await getRakutenAccessToken(true);
      resp = await requestProducts(accessToken);
    }

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
      const productId = item.find('productid').first().text().trim() || null;
      const productName = item.find('productname').first().text().trim();
      const sku = item.find('sku').first().text().trim() || item.find('skunumber').first().text().trim() || null;
      const merchantName = item.find('merchantname').first().text().trim();
      const imageUrl = item.find('imageurl').first().text().trim() || null;
      const affiliateUrl = item.find('linkurl').first().text().trim() || null;
      const originalUrl = extractOriginalRakutenUrl(affiliateUrl);
      const retailPrice = parseRakutenNumber(item.find('price').first().text().trim());
      const salePriceRaw = parseRakutenNumber(item.find('saleprice').first().text().trim());
      const discountValue = item.find('discount').first().text().trim() || null;
      const discountType = item.find('discounttype').first().text().trim() || null;
      const beginDate = parseRakutenDate(item.find('begindate').first().text().trim());
      const endDate = parseRakutenDate(item.find('enddate').first().text().trim());
      const availability = item.find('availability').first().text().trim() || null;
      const brand = item.find('brand').first().text().trim() || item.find('manufacturername').first().text().trim() || null;
      const currency = item.find('currency').first().text().trim() || 'BRL';
      const now = Date.now();
      const promoStarted = !beginDate || new Date(beginDate).getTime() <= now;
      const promoNotEnded = !endDate || new Date(endDate).getTime() >= now;
      const hasSalePrice = Number.isFinite(salePriceRaw) && Number.isFinite(retailPrice) && salePriceRaw > 0 && salePriceRaw < retailPrice && promoStarted && promoNotEnded;
      const currentPrice = hasSalePrice ? salePriceRaw : retailPrice;
      const oldPrice = hasSalePrice ? retailPrice : null;
      const categoryPrimary = item.find('category > primary').first().text().trim() || 'Geral';
      const discountBadge = hasSalePrice ? computeRakutenDiscountBadge(retailPrice, salePriceRaw, discountValue, discountType) : null;

      if (!productName || !Number.isFinite(currentPrice) || !originalUrl) return null;

      return {
        source: 'api',
        product_id: productId,
        sku,
        product_name: productName,
        current_price: currentPrice,
        old_price: oldPrice,
        discount_badge: discountBadge,
        discount_type: discountType,
        sale_price: salePriceRaw,
        retail_price: retailPrice,
        image_url: imageUrl,
        original_url: originalUrl,
        affiliate_url: affiliateUrl,
        category: categoryPrimary,
        marketplace: 'Netshoes',
        platform: 'Netshoes',
        merchant_name: merchantName || null,
        availability,
        begin_date: beginDate,
        end_date: endDate,
        brand,
        currency
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

  const commissionRate       = parseShopeeMoney(node.commissionRate);
  const sellerCommissionRate = parseShopeeMoney(node.sellerCommissionRate);
  const shopeeCommissionRate = parseShopeeMoney(node.shopeeCommissionRate);
  const priceDiscountRate    = parseShopeeMoney(node.priceDiscountRate);
  const ratingStar  = node.ratingStar != null ? parseFloat(String(node.ratingStar)) : null;
  const salesCount  = node.sales      != null ? Number(node.sales) : null;

  // Comissão Extra: commissionRate > 5% é evidência de campanha extra afiliados.
  const totalCommission    = commissionRate != null ? commissionRate : (sellerCommissionRate ?? null);
  const hasExtraCommission = totalCommission != null && totalCommission > 5;

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
    has_extra_commission:   hasExtraCommission,
    total_commission_rate:  totalCommission,
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

    if (nodes.length === 0) {
      console.log(`[Shopee Official] query_sem_resultado query=${query}`);
    }

    const converted = nodes
      .map((node) => {
        const currentPrice = parseShopeeMoney(node?.priceMin) ?? parseShopeeMoney(node?.priceMax);
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
          old_price: null,
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
        
        if (origin.qualityGate === 'REJECTED') {
          cycleMetrics.rejeicoes.loja++;
          cycleMetrics.produtosDescartadosLista.push({ name: mapped.product_name, store: 'Shopee', category: 'Geral', brand: 'Genérica', reason: origin.reasons.join(' | '), rule: 'Loja/Origem Internacional' });
          return null;
        }

        mapped.shopee_enrichment = enriched;
        mapped.shopee_origin     = origin;

        return mapped;
      })
      .filter(Boolean);

    if (nodes.length > 0 && converted.length === 0) {
      console.log(`[Shopee Official] fora_do_escopo query=${query}`);
    }

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

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function isUuid(value) {
  return typeof value === 'string' && UUID_RE.test(value);
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
  
  const baseSystemPrompt = `Você gera copy curta, objetiva e informativa no estilo de grandes agregadores de ofertas. Respond in JSON.
Regras:
1. Título deve ser exatamente nome do produto, sem adaptação.
2. Escreva resumo curto em até 2 frases e no máximo 30 palavras, destacando só benefício principal verificável pelo nome do produto.
3. Nunca invente preços, desconto, cupom, características, urgência, escassez ou qualquer detalhe não informado.
4. Nunca use: "Últimas unidades", "Corre antes que acabe", "Estoque acabando", "Oportunidade única", "Segredo das celebridades", "Imperdível", "Não perca", "Promoção histórica".
5. Sem storytelling, sem parágrafos longos, sem gatilhos artificiais.
6. Ignore criação de links, preços monetários e cupom nesta etapa; isso será injetado depois pelo sistema.
7. Retorne 1 strategy. Use:
- headline: nome exato do produto
- hook: resumo curto de até 30 palavras
- body: string vazia
- cta: string vazia
- score: nota numérica
8. Coloque hashtags no array 'hashtags'. Use no máximo ["#oferta"].
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

  const userPrompt = `Gerar copy para:
Nome: ${product.product_name}
Loja: ${store}

Objetivo:
- headline igual ao nome do produto
- hook curto, factual e sem invenção
- body vazio
- cta vazio

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

    const title = sanitizeOfferTitle(strategy.headline, product);
    const description = sanitizeOfferDescription(strategy.hook, product);
    const finalMessage = formatOfferMessage(product, store, title, description);

    return {
      score: strategy.score || 8.0,
      telegram: finalMessage,
      instagram: finalMessage,
      whatsapp: finalMessage
    };
  } catch (err) {
    console.error(`  [LLM] Falha na geração de copy: ${err.message}. Usando fallback.`);
    return generateFallback(product, store);
  }
}

function generateFallback(product, store) {
  return {
    score: 5.0,
    telegram: formatOfferMessage(product, store || 'Especial', sanitizeOfferTitle(product.product_name, product), buildNeutralDescription()),
    instagram: formatOfferMessage(product, store || 'Especial', sanitizeOfferTitle(product.product_name, product), buildNeutralDescription()),
    whatsapp: formatOfferMessage(product, store || 'Especial', sanitizeOfferTitle(product.product_name, product), buildNeutralDescription())
  };
}

function buildNeutralDescription() {
  return 'Produto selecionado com preço em destaque.';
}

function sanitizeOfferTitle(rawTitle, product) {
  const fallbackTitle = String(product?.product_name || 'Produto sem nome').trim();
  const candidate = String(rawTitle || '').replace(/\*/g, '').trim();
  return candidate || fallbackTitle;
}

function sanitizeOfferDescription(rawDescription, product) {
  const fallbackDescription = buildNeutralDescription();
  const candidate = String(rawDescription || '')
    .replace(/\s+/g, ' ')
    .trim();

  if (!candidate) return fallbackDescription;
  if (candidate.length > 220) return fallbackDescription;

  const words = candidate.split(/\s+/).filter(Boolean);
  if (words.length > 30) return fallbackDescription;

  const sentenceCount = (candidate.match(/[.!?]+/g) || []).length || 1;
  if (sentenceCount > 2) return fallbackDescription;

  const suspiciousPatterns = [
    /ultimas unidades/i,
    /corre/i,
    /estoque acabando/i,
    /oportunidade unica/i,
    /segredo/i,
    /imperdivel/i,
    /nao perca/i,
    /promocao historica/i,
    /celebridades/i,
    /exclusivo/i
  ];
  if (suspiciousPatterns.some((pattern) => pattern.test(candidate.normalize('NFD').replace(/[\u0300-\u036f]/g, '')))) {
    return fallbackDescription;
  }

  const normalizedTitle = String(product?.product_name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
  const normalizedCandidate = candidate
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();

  const suspiciousTerms = [
    'rapida', 'rapido', 'amplo', 'profissional', 'superior', 'premium', 'potente',
    'eficiente', 'ideal', 'perfeito', 'revitalizar', 'proteger', 'uniforme',
    'hermetica', 'hermetico', 'bpa', 'silicone', '5g', 'ram', 'armazenamento'
  ];
  if (suspiciousTerms.some((term) => normalizedCandidate.includes(term) && !normalizedTitle.includes(term))) {
    return fallbackDescription;
  }

  const stopWords = new Set([
    'a', 'o', 'e', 'de', 'do', 'da', 'dos', 'das', 'para', 'com', 'sem', 'por',
    'em', 'no', 'na', 'nos', 'nas', 'um', 'uma', 'ou', 'dia', 'noite', 'mais'
  ]);
  const candidateTokens = normalizedCandidate
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter((token) => token && token.length > 2 && !stopWords.has(token));
  const titleTokens = new Set(
    normalizedTitle
      .replace(/[^\p{L}\p{N}\s]/gu, ' ')
      .split(/\s+/)
      .filter(Boolean)
  );
  const tokensOutsideTitle = candidateTokens.filter((token) => !titleTokens.has(token));
  if (tokensOutsideTitle.length > 0) {
    return fallbackDescription;
  }

  return candidate;
}

function formatOfferMessage(product, store, title, description) {
  const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const lines = [
    `🚨 ${title}`,
    '',
    `✨ ${description}`,
    ''
  ];

  if (opStr) {
    lines.push(`💰 De ${opStr}`);
    lines.push(`🔥 Por ${pStr}${buildDiscountSuffix(product.old_price, product.current_price)}`);
  } else {
    lines.push(`🔥 Por ${pStr}`);
  }

  if (product.coupon) {
    lines.push('');
    lines.push(`🎟️ Cupom: ${product.coupon}`);
  }

  lines.push('');
  lines.push(`🛒 Achado ${store}`);
  lines.push('🔗 {LINK}');
  lines.push('');
  lines.push('📲 Mais ofertas no Caça Ofertas Oficial');
  lines.push('https://t.me/caca_ofertaoficial');
  return lines.join('\n');
}

function buildDiscountSuffix(oldPrice, currentPrice) {
  if (!oldPrice || !currentPrice || oldPrice <= currentPrice) return '';
  const discount = Math.round(((oldPrice - currentPrice) / oldPrice) * 100);
  return discount > 0 ? ` (${discount}% OFF)` : '';
}

// ─── Salva Oferta Básica (Rascunho) ───────────────────────────
async function upsertOffer(product, store, affiliateUrl) {
  product = applyMarketplaceDataContract(product, store);
  const scoreV1 = calculateScoreV1(product);
  const scoreV2 = calculateScoreV2(product);
  const safeRating = normalizeOfferRating(product.rating);
  
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
    rating: safeRating,
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
    rating: safeRating, category: product.category ?? null, score, status: 'draft',
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

async function ensureShopeeOfferIdentity(item, deps = {}) {
  if (item.store !== 'Shopee') {
    return { ok: true, offerId: item.id, externalProductId: null };
  }

  const externalProductId = item.externalProductId || item.candidateId || (!isUuid(item.id) ? item.id : null);
  if (externalProductId) {
    item.externalProductId = externalProductId;
    item.candidateId = item.candidateId || externalProductId;
  }

  if (isUuid(item.id)) {
    item.offerId = item.id;
    return { ok: true, offerId: item.id, externalProductId };
  }

  const persistOffer = deps.upsertOffer || upsertOffer;
  const result = await persistOffer(item.product, 'Shopee', item.affiliateUrl);
  if (!result?.id || !isUuid(result.id)) {
    return { ok: false, reason: 'Shopee offer UUID ausente', externalProductId };
  }

  item.id = result.id;
  item.offerId = result.id;
  item.score = result.score ?? item.score;
  return { ok: true, offerId: result.id, externalProductId, isNew: result.isNew };
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
    if (item.store === 'Shopee') {
      const identity = await ensureShopeeOfferIdentity(item);
      if (!identity.ok) {
        console.error(`  [Erro] Shopee sem offers.id UUID: ${identity.reason}`);
        continue;
      }
    }

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
    'Shopee': `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`,
    'Amazon': 'Amazon Discovery V3 dedicado',
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

  if (store === 'Amazon') {
    return {
      products: [],
      finalUrl: 'Amazon Discovery V3 usa somente fontes certificadas dedicadas',
      source,
      disabled: true
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
    maxRequestRetries: 3,
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
      async ({ page }) => {
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
          '.poly-card', '.promotion-item', '.ui-recommendations-card', '.andes-card',
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
            card.querySelector('.promotion-item__title')?.textContent,
            card.querySelector('.poly-component__title')?.textContent,
            card.querySelector('.ui-search-item__title')?.textContent,
            card.querySelector('[class*="poly-component__title"]')?.textContent,
            card.querySelector('[class*="ui-search-item__title"]')?.textContent,
            card.querySelector('h2 span')?.textContent,
            card.querySelector('h2')?.textContent,
            card.querySelector('.a-size-base-plus')?.textContent,
            card.querySelector('.a-size-medium')?.textContent,
            card.querySelector('.p13n-sc-truncated')?.textContent,
            card.querySelector('[class*="line-clamp"]')?.textContent,
            card.querySelector('a[href] span')?.textContent,
            card.querySelector('img')?.getAttribute('alt')
          ];
          const found = candidates.find(t => t && t.trim() && !t.toUpperCase().includes('MAIS VENDIDO'));
          return (found || '').trim();
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

  if (store === 'Amazon') {
    return {
      store,
      source: source.source,
      type: source.type,
      finalUrl: 'Amazon Discovery V3 usa somente dry-run dedicado',
      cardsFound: 0,
      cardsWithPrice: 0,
      productsExtracted: 0,
      productsApproved: 0,
      dbWrites: 0,
      disabled: true
    };
  }

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


function createAmazonV3Stats(cardsDetected) {
  return {
    cardsDetected,
    valid: 0,
    duplicates: 0,
    rejected: 0,
    rejections: {
      missingAsin: 0,
      missingTitle: 0,
      missingPrice: 0,
      missingImage: 0,
      invalidUrl: 0,
      sponsored: 0,
      invalidRating: 0
    }
  };
}

function normalizeAmazonCardTitle(value) {
  return String(value || '')
    .replace(/\s+/g, ' ')
    .replace(/^\s*Patrocinado\s*/i, '')
    .trim();
}

function normalizeAmazonOutletTitle(value) {
  return normalizeAmazonCardTitle(value)
    .replace(/(?:\d+\s*% off|Oferta|Menor preço|R\$|De:).*$/i, '')
    .trim();
}

function findAmazonCardImage($, root) {
  return root.find('img[src*="media-amazon"], img[src]').toArray()
    .map((el) => $(el).attr('src') || '')
    .find((src) => /^https?:\/\/[^ ]+/i.test(src) && !/transparent|sprite|grey-pixel|pixel|sponsored-ads/i.test(src)) || null;
}

function normalizeAmazonRankingRawHtmlV3(html, source, limit = OFFERS_PER_STORE) {
  const $ = cheerio.load(String(html || ''));
  const roots = $('[data-asin], [id^="gridItemRoot"], .zg-grid-general-faceout').toArray();
  const products = [];
  const seenAsins = new Set();
  const stats = createAmazonV3Stats(roots.length);

  for (const rootEl of roots) {
    if (products.length >= Math.max(1, limit)) break;
    const root = $(rootEl);
    const firstProductHref = root.find('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/aw/d/"]').first().attr('href') || '';
    const allHrefs = root.find('a[href]').toArray().map((el) => $(el).attr('href') || '').join(' ');
    if (isSponsoredAmazonUrl(firstProductHref) || isSponsoredAmazonUrl(allHrefs)) {
      stats.rejected++;
      stats.rejections.sponsored++;
      continue;
    }

    const dataAsin = String(root.attr('data-asin') || '').trim().toUpperCase();
    const asin = /^[A-Z0-9]{10}$/.test(dataAsin) ? dataAsin : extractAmazonAsin(firstProductHref);
    if (!asin) {
      stats.rejected++;
      stats.rejections.missingAsin++;
      continue;
    }
    if (seenAsins.has(asin)) {
      stats.duplicates++;
      continue;
    }

    const canonical = canonicalizeAmazonProductUrl(`https://www.amazon.com.br/dp/${asin}`);
    if (!canonical.url || canonical.sponsored) {
      stats.rejected++;
      stats.rejections[canonical.sponsored ? 'sponsored' : 'invalidUrl']++;
      continue;
    }

    const imageUrl = findAmazonCardImage($, root);
    if (!imageUrl) {
      stats.rejected++;
      stats.rejections.missingImage++;
      continue;
    }

    const title = normalizeAmazonCardTitle(
      root.find('img[alt]').first().attr('alt')
      || root.find('[class*="line-clamp"], .p13n-sc-truncate').first().text()
      || root.find('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/aw/d/"]').first().text()
    );
    if (!title) {
      stats.rejected++;
      stats.rejections.missingTitle++;
      continue;
    }

    const price = parseAmazonBrazilPrice(root.find('.a-price .a-offscreen').first().text()) || parseAmazonBrazilPrice(root.text());
    if (!price || price <= 0) {
      stats.rejected++;
      stats.rejections.missingPrice++;
      continue;
    }

    const ratingText = root.find('.a-icon-alt').toArray().map((el) => $(el).text()).find((text) => /\bde\s+5\b/i.test(text)) || '';
    const ratingMatch = ratingText.match(/(\d+(?:[,.]\d+)?)\s+de\s+5/i);
    const rating = ratingMatch ? normalizeOfferRating(ratingMatch[1]) : null;
    if (ratingMatch && rating === null) stats.rejections.invalidRating++;

    const reviewText = root.find('a[href*="customerReviews"], a[href*="#customerReviews"]').first().text();
    const reviews = /avalia|classifica|review/i.test(reviewText) ? parseAmazonReviewCount(reviewText) : null;
    const rankingMatch = root.find('.zg-bdg-text').first().text().match(/#\s*(\d+)/) || root.text().match(/#\s*(\d{1,3})\b/);
    const ranking = rankingMatch ? Number(rankingMatch[1]) : null;

    seenAsins.add(asin);
    products.push({
      marketplace: 'Amazon',
      productId: asin,
      title,
      price,
      oldPrice: null,
      discount: null,
      imageUrl,
      url: canonical.url,
      rating,
      reviews,
      seller: null,
      prime: null,
      ranking,
      category: source.category,
      source: `amazon_v3_${source.id}`,
      tokenOptimized: true
    });
  }

  stats.valid = products.length;
  return { products, stats };
}

function normalizeAmazonOutletRawHtmlV3(html, limit = OFFERS_PER_STORE) {
  const $ = cheerio.load(String(html || ''));
  const roots = $('li.a-carousel-card div.dcl-product-wrapper, div.dcl-product-wrapper').toArray();
  const products = [];
  const seenAsins = new Set();
  const stats = createAmazonV3Stats(roots.length);

  for (const rootEl of roots) {
    if (products.length >= Math.max(1, limit)) break;
    const root = $(rootEl);
    const links = root.find('a[href*="/dp/"], a[href*="/gp/product/"], a[href*="/gp/aw/d/"]').toArray();
    const firstProductHref = links.map((el) => $(el).attr('href') || '').find(Boolean) || '';
    const allHrefs = links.map((el) => $(el).attr('href') || '').join(' ');
    if (isSponsoredAmazonUrl(firstProductHref) || isSponsoredAmazonUrl(allHrefs)) {
      stats.rejected++;
      stats.rejections.sponsored++;
      continue;
    }

    const canonical = canonicalizeAmazonProductUrl(firstProductHref.startsWith('http') ? firstProductHref : `https://www.amazon.com.br${firstProductHref}`);
    if (!canonical.asin) {
      stats.rejected++;
      stats.rejections.missingAsin++;
      continue;
    }
    if (!canonical.url || canonical.sponsored) {
      stats.rejected++;
      stats.rejections[canonical.sponsored ? 'sponsored' : 'invalidUrl']++;
      continue;
    }
    if (seenAsins.has(canonical.asin)) {
      stats.duplicates++;
      continue;
    }

    const title = normalizeAmazonOutletTitle(
      links.map((el) => $(el).text()).map(normalizeAmazonCardTitle).find(Boolean)
      || root.find('img[alt]').first().attr('alt')
    );
    if (!title) {
      stats.rejected++;
      stats.rejections.missingTitle++;
      continue;
    }

    const price = parseAmazonBrazilPrice(root.find('.a-price .a-offscreen').first().text()) || parseAmazonBrazilPrice(root.text());
    if (!price || price <= 0) {
      stats.rejected++;
      stats.rejections.missingPrice++;
      continue;
    }

    const imageUrl = findAmazonCardImage($, root);
    if (!imageUrl) {
      stats.rejected++;
      stats.rejections.missingImage++;
      continue;
    }

    const ratingText = root.find('.a-icon-alt').first().text();
    const ratingMatch = ratingText.match(/(\d+(?:[,.]\d+)?)\s+de\s+5/i);
    const rating = ratingMatch ? normalizeOfferRating(ratingMatch[1]) : null;
    if (ratingMatch && rating === null) stats.rejections.invalidRating++;

    const reviewText = root.find('a[href*="customerReviews"], a[href*="#customerReviews"]').first().text();
    const reviews = /avalia|classifica|review/i.test(reviewText) ? parseAmazonReviewCount(reviewText) : null;

    seenAsins.add(canonical.asin);
    products.push({
      marketplace: 'Amazon',
      productId: canonical.asin,
      title,
      price,
      oldPrice: null,
      discount: null,
      imageUrl,
      url: canonical.url,
      rating,
      reviews,
      seller: null,
      prime: null,
      ranking: null,
      category: 'Outlet',
      source: 'amazon_v3_amazon_outlet',
      tokenOptimized: true
    });
  }

  stats.valid = products.length;
  return { products, stats };
}

async function findAmazonOffersByAsins(asins, client = supabase) {
  const validAsins = [...new Set((asins || []).filter((asin) => /^[A-Z0-9]{10}$/.test(asin)))];
  if (validAsins.length === 0) return [];
  const filters = validAsins.map((asin) => `original_url.ilike.%/dp/${asin}%`).join(',');
  const { data, error } = await client
    .from('offers')
    .select('id, original_url, status')
    .eq('platform', 'Amazon')
    .or(filters);
  if (error) throw new Error(`Amazon Novelty Gate: ${error.message}`);
  return data || [];
}

async function applyAmazonNoveltyGate(products, deps = {}) {
  const uniqueProducts = [];
  const seen = new Set();
  let invalidAsins = 0;
  let duplicates = 0;

  for (const product of Array.isArray(products) ? products : []) {
    const canonical = canonicalizeAmazonProductUrl(product?.url || product?.original_url || '');
    const asin = String(product?.productId || canonical.asin || '').toUpperCase();
    if (!/^[A-Z0-9]{10}$/.test(asin) || canonical.asin !== asin) {
      invalidAsins++;
      continue;
    }
    if (seen.has(asin)) {
      duplicates++;
      continue;
    }
    seen.add(asin);
    uniqueProducts.push({ ...product, productId: asin, url: canonical.url });
  }

  const findOffers = deps.findOffers || findAmazonOffersByAsins;
  const offers = await findOffers([...seen]);
  const statusByAsin = new Map();
  for (const offer of offers || []) {
    const asin = extractAmazonAsin(offer?.original_url);
    if (asin && !statusByAsin.has(asin)) statusByAsin.set(asin, String(offer?.status || '').toLowerCase());
  }

  const telemetry = {
    NEW: 0,
    EXISTING_POSTED: 0,
    EXISTING_DRAFT: 0,
    EXISTING_OTHER_STATUS: 0,
    INVALID_ASIN: invalidAsins,
    duplicates,
    queriedAsins: seen.size,
    dbWrites: 0,
    excluded: []
  };
  const newProducts = [];

  for (const product of uniqueProducts) {
    const status = statusByAsin.get(product.productId);
    if (!status) {
      telemetry.NEW++;
      newProducts.push({ ...product, novelty: 'NEW', previousStatus: null });
      continue;
    }
    const classification = status === 'posted'
      ? 'EXISTING_POSTED'
      : status === 'draft'
        ? 'EXISTING_DRAFT'
        : 'EXISTING_OTHER_STATUS';
    telemetry[classification]++;
    telemetry.excluded.push({ asin: product.productId, classification, status });
  }

  return { newProducts, telemetry };
}

function selectAmazonDiverseFinalists(products, limit = OFFERS_PER_STORE) {
  const sourceOrder = AMAZON_DISCOVERY_V3_SOURCES.map((source) => `amazon_v3_${source.id}`);
  const buckets = new Map(sourceOrder.map((source) => [source, []]));
  for (const product of Array.isArray(products) ? products : []) {
    if (!buckets.has(product.source)) buckets.set(product.source, []);
    buckets.get(product.source).push(product);
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => {
      const scoreDiff = (Number(b.score) || 0) - (Number(a.score) || 0);
      if (scoreDiff) return scoreDiff;
      return (Number(a.ranking) || Number.MAX_SAFE_INTEGER) - (Number(b.ranking) || Number.MAX_SAFE_INTEGER);
    });
  }

  const selected = [];
  const activeSources = [...buckets.keys()].filter((source) => buckets.get(source).length > 0);
  while (selected.length < Math.max(0, limit) && activeSources.length > 0) {
    for (let index = 0; index < activeSources.length && selected.length < limit;) {
      const source = activeSources[index];
      const product = buckets.get(source).shift();
      if (product) selected.push(product);
      if (buckets.get(source).length === 0) activeSources.splice(index, 1);
      else index++;
    }
  }
  return selected;
}

async function fetchAmazonDiscoveryV3(limit = OFFERS_PER_STORE, deps = {}) {
  const apiKey = process.env.SCRAPEDO_API_KEY;
  if (!apiKey) throw new Error('SCRAPEDO_API_KEY não configurada.');
  const httpGet = deps.httpGet || axios.get;
  const uniqueProducts = [];
  const sourceStats = [];
  const globalAsins = new Set();
  let totalDuplicates = 0;
  let totalRejected = 0;
  let httpCalls = 0;
  let credits = 0;

  for (const source of AMAZON_DISCOVERY_V3_SOURCES) {
    const startedAt = Date.now();
    const params = {
      token: apiKey,
      url: source.url,
      geocode: 'br',
      device: 'desktop'
    };
    const sourceTelemetry = {
      id: source.id,
      label: source.label,
      endpoint: SCRAPEDO_AMAZON_RAW_HTML_URL,
      amazonUrl: source.url,
      paramsSent: { ...params, token: '[REDACTED]' },
      httpStatus: null,
      contentType: null,
      htmlSize: 0,
      elapsedMs: 0,
      cardsDetected: 0,
      valid: 0,
      duplicates: 0,
      rejected: 0,
      rejections: createAmazonV3Stats(0).rejections
    };

    httpCalls++;
    const response = await httpGet(SCRAPEDO_AMAZON_RAW_HTML_URL, {
      params,
      timeout: 60000,
      validateStatus: () => true
    });
    const html = typeof response.data === 'string' ? response.data : '';
    const responseCost = Number(response.headers?.['scrape.do-request-cost'] ?? response.headers?.['scrapedo-request-cost']) || 0;
    credits += responseCost;
    sourceTelemetry.httpStatus = response.status;
    sourceTelemetry.contentType = response.headers?.['content-type'] || null;
    sourceTelemetry.htmlSize = html.length;
    sourceTelemetry.elapsedMs = Date.now() - startedAt;
    sourceTelemetry.credits = responseCost;

    if (response.status !== 200) {
      sourceTelemetry.error = {
        httpStatus: response.status,
        body: safeDiagnosticSnippet(response.data)
      };
      sourceStats.push(sourceTelemetry);
      continue;
    }

    const normalized = source.parser === 'outlet'
      ? normalizeAmazonOutletRawHtmlV3(html, limit)
      : normalizeAmazonRankingRawHtmlV3(html, source, limit);
    Object.assign(sourceTelemetry, normalized.stats);
    sourceStats.push(sourceTelemetry);

    for (const product of normalized.products) {
      if (globalAsins.has(product.productId)) {
        totalDuplicates++;
        continue;
      }
      globalAsins.add(product.productId);
      uniqueProducts.push(product);
    }
    totalDuplicates += normalized.stats.duplicates || 0;
    totalRejected += normalized.stats.rejected || 0;
  }

  const novelty = await applyAmazonNoveltyGate(uniqueProducts, { findOffers: deps.findOffers });
  const candidates = selectAmazonDiverseFinalists(novelty.newProducts, Math.max(1, limit));
  const ratings = uniqueProducts.map((product) => product.rating).filter((rating) => Number.isFinite(rating));
  const prices = uniqueProducts.map((product) => product.price).filter((price) => Number.isFinite(price));
  return {
    candidates,
    telemetry: {
      pipeline: 'AmazonV3_official',
      sources: sourceStats,
      httpCalls,
      callsAttempted: httpCalls,
      callsSucceeded: sourceStats.filter((source) => source.httpStatus === 200).length,
      credits,
      totalCollected: sourceStats.reduce((sum, source) => sum + (source.valid || 0), 0),
      total_unique: uniqueProducts.length,
      validProducts: candidates.length,
      duplicates: totalDuplicates,
      rejected: totalRejected,
      categories: [...new Set(uniqueProducts.map((product) => product.category).filter(Boolean))],
      averagePrice: prices.length ? Number((prices.reduce((sum, price) => sum + price, 0) / prices.length).toFixed(2)) : null,
      averageRating: ratings.length ? Number((ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length).toFixed(2)) : null,
      asins: [...globalAsins],
      novelty: novelty.telemetry,
      representedSources: [...new Set(candidates.map((product) => product.source))],
      searchExecuted: false,
      htmlDiscoveryExecuted: true,
      browserDiscoveryExecuted: false,
      renderDiscoveryExecuted: false,
      fallbackLegacyExecuted: false,
      limit
    }
  };
}

async function fetchScrapedoInfo(httpGet = axios.get) {
  const apiKey = process.env.SCRAPEDO_API_KEY;
  if (!apiKey) throw new Error('SCRAPEDO_API_KEY não configurada.');
  const response = await httpGet('https://api.scrape.do/info', {
    params: { token: apiKey },
    timeout: 30000,
    validateStatus: () => true
  });
  return {
    httpStatus: response.status,
    IsActive: response.data?.IsActive,
    RemainingMonthlyRequest: response.data?.RemainingMonthlyRequest
  };
}

async function runAmazonOfficialDryRun(deps = {}) {
  const httpGet = deps.httpGet || axios.get;
  const before = await fetchScrapedoInfo(httpGet);
  const { candidates, telemetry } = await fetchAmazonDiscoveryV3(OFFERS_PER_STORE, { httpGet, findOffers: deps.findOffers });
  const after = await fetchScrapedoInfo(httpGet);
  const asins = new Set(candidates.map((product) => product.productId).filter(Boolean));
  const summary = {
    store: 'Amazon',
    calls: telemetry.callsAttempted || 0,
    products: candidates.length,
    uniqueAsins: asins.size,
    duplicates: telemetry.duplicates || 0,
    validProducts: telemetry.validProducts,
    telemetry,
    infoBefore: before,
    infoAfter: after,
    consumption: Number(before.RemainingMonthlyRequest) - Number(after.RemainingMonthlyRequest)
  };

  console.log('[Amazon Official Dry-Run] Somente Amazon. Supabase somente leitura. Sem IA, publicacao, Browser, Render ou fallback legado.');
  console.log(`[Amazon Official Dry-Run] info_antes active=${before.IsActive} remaining=${before.RemainingMonthlyRequest}`);
  for (const source of telemetry.sources || []) {
    console.log(`[Amazon Official Dry-Run] fonte=${source.label} endpoint=${source.endpoint} url=${source.amazonUrl} http=${source.httpStatus} content_type=${source.contentType} html_size=${source.htmlSize} tempo_ms=${source.elapsedMs}`);
    console.log(`[Amazon Official Dry-Run] fonte=${source.label} cards=${source.cardsDetected || 0} validos=${source.valid || 0} rejeitados=${source.rejected || 0} duplicados=${source.duplicates || 0}`);
    if (source.rejections) {
      console.log(`[Amazon Official Dry-Run] fonte=${source.label} rejeicoes=${JSON.stringify(source.rejections)}`);
    }
  }
  for (const product of candidates.slice(0, 10)) {
    console.log(`[Amazon Official Dry-Run] candidate asin=${product.productId} price=${product.price} rating=${product.rating} reviews=${product.reviews} ranking=${product.ranking} url=${product.url} title="${product.title}"`);
  }
  console.log(`[Amazon Official Dry-Run] info_depois active=${after.IsActive} remaining=${after.RemainingMonthlyRequest}`);
  console.log(`[Amazon Official Dry-Run] chamadas=${summary.calls} produtos=${summary.products} asins_unicos=${summary.uniqueAsins} duplicados=${summary.duplicates} validos=${summary.validProducts} categorias=${(telemetry.categories || []).join('|')} preco_medio=${telemetry.averagePrice} rating_medio=${telemetry.averageRating} creditos=${telemetry.credits}`);
  if (candidates.length < (deps.minCandidates ?? 5)) {
    throw new Error(`Amazon V3 dry-run sem candidates suficientes: ${candidates.length}`);
  }
  return summary;
}

async function executeMercadoLivreNativeTop20() {
  return runMercadoLivreNativeTop20({ fetchImpl: global.fetch });
}

async function persistMercadoLivreNativeTop20(products) {
  const { data: history, error: historyError } = await supabase
    .from('offers')
    .select('id, item_id, product_id, original_url, status')
    .eq('user_id', ADMIN_USER_ID)
    .eq('platform', 'Mercado Livre');
  if (historyError) throw historyError;

  const activeItemIds = new Set();
  const activeUrls = new Set();
  const activeProductIds = new Set();
  for (const row of history || []) {
    if (row.status === 'rejected') continue;
    if (row.item_id) activeItemIds.add(row.item_id);
    if (row.original_url) activeUrls.add(row.original_url);
    if (row.product_id) activeProductIds.add(row.product_id);
  }

  const finalProducts = products.filter((product) => !(
    (product.item_id && activeItemIds.has(product.item_id)) ||
    (product.product_url && activeUrls.has(product.product_url)) ||
    (product.product_id && activeProductIds.has(product.product_id))
  ));
  if (!finalProducts.length) return { inserted: 0, novelty_rejected: products.length };

  const rows = finalProducts.map((product) => {
    const score = calculateScoreV1({
      product_name: product.title,
      current_price: product.current_price,
      old_price: product.old_price,
      category: product.category_name,
      image_url: product.image_url,
      rating: null
    });
    return {
      user_id: ADMIN_USER_ID,
      platform: 'Mercado Livre',
      product_name: product.title,
      category: product.category_name,
      category_id: product.category_id,
      category_name: product.category_name,
      source_position: product.source_position,
      item_id: product.item_id,
      product_id: product.product_id,
      seller_id: product.seller_id,
      seller_name: product.seller_name,
      shipping_free: product.shipping_free,
      source_categories: product.source_categories,
      original_url: product.product_url,
      image_url: product.image_url,
      current_price: product.current_price,
      old_price: product.old_price,
      score,
      status: 'pending_manual_review',
      explainability: {
        source: product.source,
        source_url: product.source_url,
        source_position: product.source_position,
        discount_percent: product.discount_percent,
        discovered_at: product.discovered_at
      },
      notes: '[Mercado Livre Native Top 20] Aguardando seleção manual.'
    };
  });
  const { error } = await supabase.from('offers').insert(rows);
  if (error) throw error;
  return { inserted: rows.length, novelty_rejected: products.length - rows.length };
}

async function scrapeStore(store) {
  let storeCandidates = [];
  const storeStartedAt = Date.now();

  if (store === 'Mercado Livre') {
    console.log(`\n[Mercado Livre Native Top 20] Discovery oficial`);
    try {
      const discovery = await executeMercadoLivreNativeTop20();
      const persisted = await persistMercadoLivreNativeTop20(discovery.products);
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'store-summary', {
        store,
        queriesExecuted: discovery.calls,
        candidatesCollected: discovery.products.length,
        pipeline: 'MercadoLivreNativeTop20',
        durationMs: Date.now() - storeStartedAt,
        calls: discovery.calls,
        productsBySource: { mercadolivre_offers_ssr: discovery.valid_products },
        duplicates: discovery.duplicates
      });
      console.log(`  ✅ [Mercado Livre Native Top 20] ${persisted.inserted} pendentes para seleção manual.`);
      return [];
    } catch (error) {
      console.error(`  [Mercado Livre Native Top 20] Erro fatal: ${error.message}`);
      await logErrorToSupabase('Oracle-Scraper', 'Mercado Livre Native Top 20', error, { store });
      return [];
    }
  }

  if (store === 'Amazon') {
    console.log(`\n[Amazon Official] Fluxo definitivo utilizando Discovery V3`);
    try {
      const { candidates, telemetry } = await fetchAmazonDiscoveryV3(OFFERS_PER_STORE);
      storeCandidates = candidates.map(c => ({
        id: c.productId,
        candidateId: c.productId,
        externalProductId: c.productId,
        product: {
          product_name: c.title,
          current_price: c.price,
          old_price: c.oldPrice,
          image_url: c.imageUrl,
          category: c.category || 'Geral',
          rating: c.rating
        },
        store: 'Amazon',
        affiliateUrl: c.url,
        score: 100 // baseline score
      }));
      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'store-summary', {
        store, queriesExecuted: telemetry.httpCalls || 0, candidatesCollected: storeCandidates.length, pipeline: 'AmazonV3_official', durationMs: Date.now() - storeStartedAt, telemetry
      });
      console.log(`  ✅ [Amazon] ${storeCandidates.length} candidatos via V3.`);
      return storeCandidates;
    } catch (err) {
      console.error(`  [Amazon Official] Erro fatal: ${err.message}`);
      await logErrorToSupabase('Oracle-Scraper', 'Amazon Official Pipeline', err, { store });
      return [];
    }
  }

  if (store === 'Shopee') {
    console.log(`\n[Shopee Official] Fluxo normal utilizando Pipeline EPIC 09`);
    try {
      const { candidates, telemetry } = await runShopeeOfficialPipeline('Todas', 500);
      // Adaptador mínimo: mapeia shape do pipeline para shape esperado por processTopOffers
      storeCandidates = candidates.map(c => ({
        id: c.candidateId,
        candidateId: c.candidateId,
        externalProductId: c.candidateId,
        product: {
          product_name: c.productName,
          current_price: c.currentPrice,
          old_price: c.originalPrice,
          image_url: c.image || null,
          category: c.category || 'Geral',
          rating: c.rating
        },
        store: 'Shopee',
        affiliateUrl: c.affiliateLink,
        score: c.selectionScore
      }));

      emitAuditEvent('B', 'oracle-scraper.cjs:scrapeStore', 'store-summary', {
        store,
        queriesExecuted: 1,
        candidatesCollected: storeCandidates.length,
        pipeline: 'EPIC09_official',
        durationMs: Date.now() - storeStartedAt,
        telemetry
      });

      console.log(`  ✅ [${store}] ${storeCandidates.length} candidatos via Pipeline EPIC 09.`);
      return storeCandidates;

    } catch (err) {
      console.error(`  [Shopee Official] Erro fatal: ${err.message}`);
      await logErrorToSupabase('Oracle-Scraper', 'Shopee Official Pipeline', err, { store });
      return [];
    }
  }

  // Fluxo genérico dos demais marketplaces.
  const queries = getRandomQueries(store); // Pega 1 keyword de CADA categoria da loja
  
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
        const productImage = p.image_url || p.image || p.imageUrl;
        const productPrice = p.current_price || p.price;
        const productOldPrice = p.old_price || p.oldPrice;
        
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
          rating: normalizeOfferRating(p.rating), category: p.category || 'Geral',
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
      const stores = getEnabledStores(['Mercado Livre', 'Amazon', 'Shopee', 'Netshoes']);
      
      for (const store of stores) {
        try {
          const candidates = await scrapeStore(store);
          allCandidates = allCandidates.concat(candidates);
        } catch (err) { console.error(`[SCRAPER][${store}] Erro: ${err.message}`); }
      }
      
      console.log(`\n✅ Scraping local concluído. ${allCandidates.length} ofertas raspadas neste ciclo.`);
      const draftCutoff = new Date(Date.now() - CLEANUP_DAYS * 24 * 60 * 60 * 1000).toISOString();
      console.log(`\n📦 Buscando drafts pendentes no Supabase (últimos ${CLEANUP_DAYS} dias) para processar com IA...`);

      const { data: pendingDrafts, error: draftsError } = await supabase
        .from('offers')
        .select('*')
        .eq('status', 'draft')
        .eq('user_id', ADMIN_USER_ID)
        .gte('updated_at', draftCutoff);

      if (draftsError) {
        console.error(`[DRAFTS] Erro ao buscar drafts: ${draftsError.message}`);
      } else {
        let draftCandidates = [];
        if (pendingDrafts && pendingDrafts.length > 0) {
          console.log(`\n🚀 ${pendingDrafts.length} drafts encontrados.`);
          draftCandidates = pendingDrafts.map(d => ({
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
        }

        // [HOTFIX 10.0-I] Unificar Fluxo de Candidates para todos os Marketplaces
        const storesWithNewCandidates = [...new Set(allCandidates.map(c => c.store))];
        
        storesWithNewCandidates.forEach(store => {
          const count = allCandidates.filter(c => c.store === store).length;
          console.log(`\n[${store}] Utilizando Candidates da execução atual (${count} itens)`);
        });

        // Ignorar pendingDrafts dos marketplaces que produziram novos candidates
        draftCandidates = draftCandidates.filter(c => !storesWithNewCandidates.includes(c.store));
        
        const fallbackStores = [...new Set(draftCandidates.map(c => c.store))];
        fallbackStores.forEach(store => {
          const count = draftCandidates.filter(c => c.store === store).length;
          console.log(`\n[${store}] Fallback para pendingDrafts (${count} itens)`);
        });
        
        const finalCandidates = draftCandidates.concat(allCandidates);

        if (finalCandidates.length > 0) {
          console.log(`\n🚀 Iniciando IA para ${finalCandidates.length} candidates combinados...`);
          aiProcessed = await processTopOffers(finalCandidates);
        } else {
          console.log(`\n📭 Nenhum draft ou candidate pendente no momento.`);
        }
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
    const stores = getEnabledStores(isWindows ? ['Mercado Livre', 'Amazon', 'Shopee', 'Netshoes'] : ['Mercado Livre', 'Amazon', 'Shopee', 'Netshoes']);
    
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

async function runMercadoLivreOfficialDryRun() {
  const result = await executeMercadoLivreNativeTop20();
  writeMercadoLivreNativeTop20Reports(result);
  console.log('[Mercado Livre Native Top 20 Dry-Run] sem banco, IA, publicacao ou Oracle');
  console.log(`[Mercado Livre Native Top 20 Dry-Run] categorias=${result.categories.length} coletados=${result.raw_products} validos=${result.valid_products} descartados=${result.discarded_products} duplicados=${result.duplicates} unicos=${result.products.length} tempo_ms=${result.elapsed_ms} chamadas=${result.calls}`);
  return result;
}

// ─── Inicialização ────────────────────────────────────────────
console.log('\n╔══════════════════════════════════════════╗');
console.log('║   ORACLE-SCRAPER IN-HOUSE (Crawlee)      ║');
console.log('╚══════════════════════════════════════════╝\n');

// Verifica se temos pelo menos um LLM provider configurado
const hasAtLeastOneLLM = !!PROVIDER_CONFIG.cerebras.apiKey || !!PROVIDER_CONFIG.groq.apiKey;
const isDiscoveryDryRun = process.argv.includes('--discovery-dry-run');
const isAmazonOfficialDryRun = process.argv.includes('--amazon-official-dry-run');
const isMercadoLivreOfficialDryRun = process.argv.includes('--mercadolivre-native-top20-dry-run');

const isShopeeV4DryRun = process.argv.includes('--shopee-v4-dry-run');
const isShopeeOfficialDryRun = process.argv.includes('--shopee-official-dry-run');

if (!isAmazonOfficialDryRun && !isMercadoLivreOfficialDryRun && !isDiscoveryDryRun && !isShopeeV4DryRun && !isShopeeOfficialDryRun && (!hasAtLeastOneLLM || !process.env.SUPABASE_SERVICE_ROLE_KEY)) {
  console.log("Missing required API keys (Supabase and at least one LLM provider: Cerebras or Groq)");
  process.exit(1);
}

// ponytail: categorias oficiais hardcoded como fallback seguro — extraídas da página /oficial na Sprint 09.0-A
const SHOPEE_OFFICIAL_CATEGORIES = [
  'Computadores e Acessórios', 'Acessórios de Moda', 'Brinquedos e Hobbies',
  'Sapatos Femininos', 'Jogos e Consoles', 'Moda Infantil', 'Mãe e Bebê',
  'Áudio', 'Bolsas Femininas', 'Roupas Masculinas', 'Beleza', 'Casa e Construção',
  'Eletrodomésticos', 'Roupas Femininas', 'Esportes e Lazer', 'Automóveis',
  'Celulares e Dispositivos', 'Alimentos e Bebidas', 'Sapatos Masculinos',
  'Saúde', 'Bolsas Masculinas', 'Papelaria', 'Animais Domésticos', 'Livros e Revistas'
];

const SHOPEE_DISCOVERY_SCORE_CONFIG = {
  sales: [
    { threshold: 10000, points: 30 },
    { threshold: 5000, points: 22 },
    { threshold: 1000, points: 15 }
  ],
  discount: [
    { threshold: 50, points: 25 },
    { threshold: 40, points: 20 },
    { threshold: 25, points: 15 }
  ],
  price: [
    { threshold: 300, points: 12 },
    { threshold: 100, points: 10 },
    { threshold: 30, points: 8 },
    { threshold: 15, points: 3 }
  ],
  rating: [
    { threshold: 4.9, points: 15 },
    { threshold: 4.7, points: 10 },
    { threshold: 4.5, points: 5 }
  ],
  commission: [
    { threshold: 15, points: 12 },
    { threshold: 10, points: 8 },
    { threshold: 7, points: 5 }
  ],
  signals: {
    official_shop: 15,
    brand: 10
  },
  penalties: {
    price_below_15: -40,
    rating_below_4_3: -20,
    sales_below_100: -15,
    no_discount: -8
  },
  tiers: [
    { min: 90, name: 'PLATINUM', priority: 'HIGH' },
    { min: 75, name: 'GOLD', priority: 'HIGH' },
    { min: 60, name: 'SILVER', priority: 'MEDIUM' },
    { min: 45, name: 'BRONZE', priority: 'LOW' }
  ],
  default_tier: { name: 'REJECT', priority: 'LOW' }
};

/**
 * Calcula o Discovery Score objetivo baseado exclusivamente na Shopee Open API.
 * Nenhuma chamada externa, de IA, de Oracle ou Banco é feita aqui.
 */
function calculateShopeeDiscoveryScore(product) {
  if (product._memoizedDiscoveryScoreResult) return product._memoizedDiscoveryScoreResult;
  let score = 0;
  const breakdown = {};
  const signals = [];
  const penalties = [];
  const c = SHOPEE_DISCOVERY_SCORE_CONFIG;

  const sales = product.sales || 0;
  const salesMatch = c.sales.find(rule => sales >= rule.threshold);
  if (salesMatch) {
    score += salesMatch.points;
    breakdown.sales = salesMatch.points;
    signals.push(`sales>=${salesMatch.threshold}`);
  }
  if (sales < 100) {
    score += c.penalties.sales_below_100;
    breakdown.sales_penalty = c.penalties.sales_below_100;
    penalties.push('sales<100');
  }

  const discount = product.discount_rate || 0;
  const discountMatch = c.discount.find(rule => discount >= rule.threshold);
  if (discountMatch) {
    score += discountMatch.points;
    breakdown.discount = discountMatch.points;
    signals.push(`discount>=${discountMatch.threshold}%`);
  }
  if (!discount || discount === 0) {
    score += c.penalties.no_discount;
    breakdown.discount_penalty = c.penalties.no_discount;
    penalties.push('no_discount');
  }

  const price = product.current_price || 0;
  const priceMatch = c.price.find(rule => price >= rule.threshold);
  if (priceMatch) {
    score += priceMatch.points;
    breakdown.price = priceMatch.points;
    signals.push(`price>=${priceMatch.threshold}`);
  }
  if (price < 15) {
    score += c.penalties.price_below_15;
    breakdown.price_penalty = c.penalties.price_below_15;
    penalties.push('price<15');
  }

  const rating = product.rating || 0;
  if (rating > 0) {
    const ratingMatch = c.rating.find(rule => rating >= rule.threshold);
    if (ratingMatch) {
      score += ratingMatch.points;
      breakdown.rating = ratingMatch.points;
      signals.push(`rating>=${ratingMatch.threshold}`);
    }
    if (rating < 4.3) {
      score += c.penalties.rating_below_4_3;
      breakdown.rating_penalty = c.penalties.rating_below_4_3;
      penalties.push('rating<4.3');
    }
  }

  // A comissão pode vir como percentual (15) ou decimal (0.15)
  let rawComm = product.commission_rate || 0;
  if (!rawComm && product.raw_node?.sellerCommissionRate) rawComm = product.raw_node.sellerCommissionRate;
  if (!rawComm && product.raw_node?.shopeeCommissionRate) rawComm = product.raw_node.shopeeCommissionRate;
  
  // Converte decimal para percentual (0.15 -> 15) para alinhar com o threshold do config
  let commRate = parseFloat(rawComm) || 0;
  if (commRate > 0 && commRate <= 1) {
    commRate = commRate * 100;
  }

  const commMatch = c.commission.find(rule => commRate >= rule.threshold);
  if (commMatch) {
    score += commMatch.points;
    breakdown.commission = commMatch.points;
    signals.push(`commission>=${commMatch.threshold}%`);
  }

  if (product.official_shop_signal) {
    score += c.signals.official_shop;
    breakdown.official_shop = c.signals.official_shop;
    signals.push('official_shop');
  }

  if (product.brand_signal) {
    score += c.signals.brand;
    breakdown.brand = c.signals.brand;
    signals.push('brand');
  }

  const matchedTier = c.tiers.find(t => score >= t.min) || c.default_tier;
  let priority = matchedTier.priority;

  // Garantir a regra do Priority baseada nos pontos específicos que o prompt cita caso difira:
  // "Priority: HIGH >=75, MEDIUM >=55, LOW <55"
  if (score >= 75) priority = 'HIGH';
  else if (score >= 55) priority = 'MEDIUM';
  else priority = 'LOW';

  const result = {
    score,
    tier: matchedTier.name,
    priority,
    signals,
    penalties,
    breakdown
  };
  product._memoizedDiscoveryScoreResult = result;
  return result;
}

// ============================================================================
// SPRINT 09.3: Histórico Inteligente de Produtos
// ============================================================================

const SHOPEE_HISTORY_CONFIG = {
  cooldownDays: 7,
  significantPriceDropPercent: 15,
  significantDiscountIncreasePercent: 15,
  significantCommissionIncreasePercent: 3,
  significantDiscoveryScoreIncrease: 15,
  maxHistoryEntries: 20,
  cleanupAfterDays: 60
};

const HISTORY_REASON = {
  FIRST_SEEN: 'FIRST_SEEN',
  NEW_PRODUCT: 'NEW_PRODUCT',
  COOLDOWN_EXPIRED: 'COOLDOWN_EXPIRED',
  PRICE_DROP: 'PRICE_DROP',
  PRICE_INCREASE: 'PRICE_INCREASE',
  DISCOUNT_INCREASE: 'DISCOUNT_INCREASE',
  COMMISSION_INCREASE: 'COMMISSION_INCREASE',
  DISCOVERY_SCORE_INCREASE: 'DISCOVERY_SCORE_INCREASE',
  NEVER_PROCESSED: 'NEVER_PROCESSED',
  NEVER_POSTED: 'NEVER_POSTED',
  NO_SIGNIFICANT_CHANGE: 'NO_SIGNIFICANT_CHANGE',
  MANUAL_REVIEW_REVISIT: 'MANUAL_REVIEW_REVISIT',
  FORCED_REPROCESS: 'FORCED_REPROCESS'
};

const PROJECT_ROOT = path.resolve(__dirname, '..');
const DEFAULT_SHOPEE_HISTORY_FILE = path.join(PROJECT_ROOT, 'data', 'shopee_seen_products.json');

function ensureDirectoryExists(dirPath) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function safeParseJsonObject(raw, fallback = {}) {
  if (!raw || !String(raw).trim()) return fallback;
  const parsed = JSON.parse(raw);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
}

class FileSeenProductStore {
  constructor(dbPath = process.env.SHOPEE_HISTORY_FILE || DEFAULT_SHOPEE_HISTORY_FILE) {
    this.dbPath = path.resolve(dbPath);
    this.backupPath = `${this.dbPath}.bak`;
    this.isWriteInProgress = false;
    this.dirty = false;
    this.data = this._load();
  }

  _readJsonFile(filePath) {
    try {
      if (!fs.existsSync(filePath)) return null;
      const raw = fs.readFileSync(filePath, 'utf8');
      return safeParseJsonObject(raw, {});
    } catch (_) {
      return null;
    }
  }

  _recoverCorruptedFile(rawError) {
    ensureDirectoryExists(path.dirname(this.dbPath));

    const backupData = this._readJsonFile(this.backupPath);
    const hasCurrentFile = fs.existsSync(this.dbPath);

    if (hasCurrentFile) {
      const stamp = new Date().toISOString().replace(/[:.]/g, '-');
      const corruptPath = `${this.dbPath}.corrupt-${stamp}.bak`;
      try {
        fs.copyFileSync(this.dbPath, corruptPath);
      } catch (_) {}
    }

    if (backupData) {
      this.data = backupData;
      this._save();
      console.warn(`[Shopee History] JSON corrompido recuperado via backup. file=${this.dbPath} error=${rawError.message}`);
      return backupData;
    }

    try {
      this._saveObject({});
    } catch (_) {}
    console.warn(`[Shopee History] JSON corrompido resetado. file=${this.dbPath} error=${rawError.message}`);
    return {};
  }

  _load() {
    try {
      ensureDirectoryExists(path.dirname(this.dbPath));
      if (!fs.existsSync(this.dbPath)) {
        this._saveObject({});
        return {};
      }

      const raw = fs.readFileSync(this.dbPath, 'utf8');
      if (!String(raw).trim()) {
        console.warn(`[Shopee History] Arquivo vazio recuperado. file=${this.dbPath}`);
        this._saveObject({});
        return {};
      }

      return safeParseJsonObject(raw, {});
    } catch (error) {
      if (error instanceof SyntaxError) {
        return this._recoverCorruptedFile(error);
      }

      console.warn(`[Shopee History] Falha ao carregar history. file=${this.dbPath} error=${error.message}`);
      const backupData = this._readJsonFile(this.backupPath);
      if (backupData) return backupData;
      return {};
    }
  }

  _saveObject(data) {
    const dir = path.dirname(this.dbPath);
    ensureDirectoryExists(dir);

    const tempPath = `${this.dbPath}.${process.pid}.${Date.now()}.tmp`;
    const payload = JSON.stringify(data, null, 2);

    fs.writeFileSync(tempPath, payload, 'utf8');

    let lastError = null;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        fs.renameSync(tempPath, this.dbPath);
        lastError = null;
        break;
      } catch (error) {
        lastError = error;
        if (!['EPERM', 'EBUSY'].includes(error.code) || attempt === 2) break;
        Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50 * (attempt + 1));
      }
    }
    if (lastError) {
      try { if (fs.existsSync(tempPath)) fs.unlinkSync(tempPath); } catch (_) {}
      throw lastError;
    }

    try {
      fs.writeFileSync(this.backupPath, payload, 'utf8');
    } catch (_) {}
  }

  _save() {
    if (this.isWriteInProgress) {
      return false;
    }

    this.isWriteInProgress = true;
    try {
      this._saveObject(this.data);
      return true;
    } catch (error) {
      console.warn(`[Shopee History] Falha ao salvar history. file=${this.dbPath} error=${error.message}`);
      return false;
    } finally {
      this.isWriteInProgress = false;
    }
  }
  getProduct(fingerprint) {
    return this.data[fingerprint] || null;
  }
  saveProduct(fingerprint, productData) {
    this.data[fingerprint] = productData;
    this.dirty = true;
  }
  removeProduct(fingerprint) {
    delete this.data[fingerprint];
    this.dirty = true;
  }
  getAll() {
    return Object.entries(this.data);
  }
  flush() {
    if (!this.dirty) return true;
    const saved = this._save();
    if (saved) this.dirty = false;
    return saved;
  }
}

class SeenProductStore {
  constructor(provider = new FileSeenProductStore()) {
    this.provider = provider;
  }
  get(fingerprint) { return this.provider.getProduct(fingerprint); }
  save(fingerprint, data) { return this.provider.saveProduct(fingerprint, data); }
  remove(fingerprint) { return this.provider.removeProduct(fingerprint); }
  getAll() { return this.provider.getAll(); }
  flush() { return typeof this.provider.flush === 'function' ? this.provider.flush() : true; }
}
const seenProductStore = new SeenProductStore();

function getShopeeStableKey(product) {
  const name = product.productName || product.product_name || '';
  const shop = product.raw_node?.shopName || product.shopName || '';
  const cat = product.categoria_original || product.category || '';
  return Buffer.from(`${name}_${shop}_${cat}`).toString('base64');
}

function getShopeeCanonicalUrl(product) {
  const candidates = [
    product.offerLink,
    product.affiliate_url,
    product.productLink,
    product.original_url,
    product.product_url,
    product.url
  ].filter(Boolean);

  for (const candidate of candidates) {
    try {
      const parsed = new URL(String(candidate).trim());
      parsed.search = '';
      parsed.hash = '';
      return parsed.toString().replace(/\/$/, '');
    } catch (_) {}
  }

  return null;
}

function getShopeeDedupKeys(product) {
  const itemId = product.itemId || product.shopee_item_id || product.productId || product.marketplaceProductId || null;
  const shopId = product.shopId || product.shopee_shop_id || product.raw_node?.shopId || null;
  const canonicalUrl = getShopeeCanonicalUrl(product);
  const stableKey = getShopeeStableKey(product);
  const keys = [];

  if (itemId) {
    keys.push(`item:${itemId}`);
    keys.push(String(itemId));
  }
  if (itemId && shopId) {
    keys.push(`shopItem:${shopId}:${itemId}`);
    keys.push(`${itemId}_${shopId}`);
  }
  if (canonicalUrl) {
    keys.push(`url:${canonicalUrl}`);
    keys.push(canonicalUrl);
  }
  keys.push(`stable:${stableKey}`);
  keys.push(stableKey);

  return [...new Set(keys)];
}

function getProductFingerprint(product) {
  return getShopeeDedupKeys(product)[0];
}

function findSeenProductRecord(product, store = seenProductStore) {
  for (const key of getShopeeDedupKeys(product)) {
    const record = store.get(key);
    if (record) {
      return { key, record };
    }
  }
  return { key: getProductFingerprint(product), record: null };
}

function dedupeShopeeProductsDetailed(products) {
  const accepted = [];
  const seen = new Set();
  let duplicatesRejected = 0;

  for (const product of products || []) {
    const keys = getShopeeDedupKeys(product);
    const duplicated = keys.some((key) => seen.has(key));
    if (duplicated) {
      duplicatesRejected++;
      continue;
    }
    keys.forEach((key) => seen.add(key));
    accepted.push(product);
  }

  return { products: accepted, duplicatesRejected };
}

function shouldProcessProduct(product, options = {}, store = seenProductStore) {
  const prevRecord = findSeenProductRecord(product, store);
  const prev = prevRecord.record;

  const currentPrice = product.current_price || 0;
  const currentDiscount = product.discount_rate || 0;
  
  let rawComm = product.commission_rate || product.raw_node?.sellerCommissionRate || product.raw_node?.shopeeCommissionRate || 0;
  let currentComm = parseFloat(rawComm) || 0;
  if (currentComm > 0 && currentComm <= 1) currentComm *= 100;
  
  const scoreResult = calculateShopeeDiscoveryScore(product);
  const currentScore = scoreResult.score;

  if (!prev) {
    return {
      shouldProcess: true,
      historyReason: HISTORY_REASON.FIRST_SEEN,
      previousRecord: null,
      changes: {
        price: { old: null, new: currentPrice },
        discount: { old: null, new: currentDiscount },
        commission: { old: null, new: currentComm },
        score: { old: null, new: currentScore }
      }
    };
  }

  const oldPrice = prev.currentPrice || 0;
  const oldDiscount = prev.priceDiscountRate || 0;
  const oldComm = prev.commissionRate || 0;
  const oldScore = prev.discoveryScore || 0;

  const changes = {
    price: { old: oldPrice, new: currentPrice },
    discount: { old: oldDiscount, new: currentDiscount },
    commission: { old: oldComm, new: currentComm },
    score: { old: oldScore, new: currentScore }
  };

  const now = Date.now();
  const lastProcessed = prev.lastProcessedAt || prev.lastSeenAt || 0;
  const daysSinceProcessed = (now - lastProcessed) / (1000 * 60 * 60 * 24);

  if (daysSinceProcessed >= SHOPEE_HISTORY_CONFIG.cooldownDays) {
    return { shouldProcess: true, historyReason: HISTORY_REASON.COOLDOWN_EXPIRED, previousRecord: prev, changes };
  }

  if (oldPrice > 0 && currentPrice < oldPrice) {
    const dropPercent = ((oldPrice - currentPrice) / oldPrice) * 100;
    if (dropPercent >= SHOPEE_HISTORY_CONFIG.significantPriceDropPercent) {
      return { shouldProcess: true, historyReason: HISTORY_REASON.PRICE_DROP, previousRecord: prev, changes };
    }
  }

  if (currentDiscount > oldDiscount && (currentDiscount - oldDiscount) >= SHOPEE_HISTORY_CONFIG.significantDiscountIncreasePercent) {
    return { shouldProcess: true, historyReason: HISTORY_REASON.DISCOUNT_INCREASE, previousRecord: prev, changes };
  }

  if (currentComm > oldComm && (currentComm - oldComm) >= SHOPEE_HISTORY_CONFIG.significantCommissionIncreasePercent) {
    return { shouldProcess: true, historyReason: HISTORY_REASON.COMMISSION_INCREASE, previousRecord: prev, changes };
  }

  if (currentScore > oldScore && (currentScore - oldScore) >= SHOPEE_HISTORY_CONFIG.significantDiscoveryScoreIncrease) {
    return { shouldProcess: true, historyReason: HISTORY_REASON.DISCOVERY_SCORE_INCREASE, previousRecord: prev, changes };
  }

  if (options.mode === 'manual_review') {
    const isProcessed = prev && (prev.timesProcessed > 0 || prev.lastProcessedAt);
    if (!isProcessed) {
      return { shouldProcess: true, historyReason: HISTORY_REASON.MANUAL_REVIEW_REVISIT, previousRecord: prev, changes };
    }
  }

  return { shouldProcess: false, historyReason: HISTORY_REASON.NO_SIGNIFICANT_CHANGE, previousRecord: prev, changes };
}

function registerSeenProduct(product, historyReason, processed = false) {
  return registerSeenProductWithStore(product, historyReason, processed, seenProductStore);
}

function registerSeenProductWithStore(product, historyReason, processed = false, store = seenProductStore) {
  const prevRecord = findSeenProductRecord(product, store);
  const primaryKey = getProductFingerprint(product);
  const prev = prevRecord.record || {};
  const now = Date.now();

  let rawComm = product.commission_rate || product.raw_node?.sellerCommissionRate || product.raw_node?.shopeeCommissionRate || 0;
  let currentComm = parseFloat(rawComm) || 0;
  if (currentComm > 0 && currentComm <= 1) currentComm *= 100;

  const scoreResult = calculateShopeeDiscoveryScore(product);

  const newRecord = {
    itemId: product.shopee_item_id || product.itemId,
    shopId: product.shopee_shop_id || product.shopId || product.raw_node?.shopId,
    productName: product.product_name || product.productName,
    shopName: product.raw_node?.shopName || product.shopName,
    categoria: product.categoria_original || product.category,
    offerLink: product.affiliate_url || product.offerLink,
    productLink: product.original_url || product.productLink,
    currentPrice: product.current_price,
    priceDiscountRate: product.discount_rate,
    commissionRate: currentComm,
    discoveryScore: scoreResult.score,
    tier: scoreResult.tier,
    priority: scoreResult.priority,
    
    firstSeenAt: prev.firstSeenAt || now,
    lastSeenAt: now,
    lastProcessedAt: processed ? now : (prev.lastProcessedAt || null),
    timesSeen: (prev.timesSeen || 0) + 1,
    timesProcessed: processed ? (prev.timesProcessed || 0) + 1 : (prev.timesProcessed || 0),
    historyReason,
    events: prev.events || []
  };

  const event = {
    timestamp: now,
    eventType: processed ? 'PROCESSED' : 'SEEN',
    historyReason,
    oldPrice: prev.currentPrice || null,
    newPrice: newRecord.currentPrice,
    oldDiscount: prev.priceDiscountRate || null,
    newDiscount: newRecord.priceDiscountRate,
    oldCommission: prev.commissionRate || null,
    newCommission: newRecord.commissionRate,
    oldDiscoveryScore: prev.discoveryScore || null,
    newDiscoveryScore: newRecord.discoveryScore
  };

  newRecord.events.push(event);
  if (newRecord.events.length > SHOPEE_HISTORY_CONFIG.maxHistoryEntries) {
    newRecord.events = newRecord.events.slice(-SHOPEE_HISTORY_CONFIG.maxHistoryEntries);
  }

  store.save(primaryKey, newRecord);
  if (prevRecord.record && prevRecord.key !== primaryKey) {
    store.remove(prevRecord.key);
  }
  return newRecord;
}

function cleanupSeenProducts(store = seenProductStore) {
  const all = store.getAll();
  const now = Date.now();
  const maxAgeMs = SHOPEE_HISTORY_CONFIG.cleanupAfterDays * 24 * 60 * 60 * 1000;
  let removedCount = 0;

  for (const [fp, record] of all) {
    const ageMs = now - (record.lastSeenAt || 0);
    if (ageMs > maxAgeMs) {
      store.remove(fp);
      removedCount++;
    }
  }
  return removedCount;
}

// ============================================================================
// SPRINT 09.4: Marketplace Selection Engine
// ============================================================================

const MARKETPLACE_SELECTION_CONFIG = {
  Shopee: {
    GLOBAL_LIMIT: 500,
    CATEGORY_LIMIT: 25,
    CATEGORY_MIN_TARGET: 5,
    SHOP_LIMIT: 5,
    BRAND_LIMIT: 3,
    PRICE_RANGE_LIMIT: 150,
    MIN_DISCOVERY_SCORE: 45,
    MIN_HISTORY_SCORE: 0,
    MIN_PRIORITY: 'MEDIUM',
    ALLOW_LOW_PRIORITY: false,
    ENABLE_CATEGORY_BALANCE: true,
    ENABLE_SHOP_BALANCE: true,
    ENABLE_BRAND_BALANCE: true,
    ENABLE_PRICE_BALANCE: true,
    PRICE_RANGES: [
      { min: 0, max: 15, label: '0-15' },
      { min: 15, max: 30, label: '15-30' },
      { min: 30, max: 80, label: '30-80' },
      { min: 80, max: 150, label: '80-150' },
      { min: 150, max: 300, label: '150-300' },
      { min: 300, max: 700, label: '300-700' },
      { min: 700, max: Infinity, label: '700+' }
    ],
    BONUS: {
      categoryDiversity: 15,
      brandDiversity: 10,
      shopDiversity: 10,
      priceRangeDiversity: 5
    }
  }
};

const SELECTION_REASON = {
  TOP_DISCOVERY_SCORE: 'TOP_DISCOVERY_SCORE',
  TOP_HISTORY_SCORE: 'TOP_HISTORY_SCORE',
  CATEGORY_BALANCE: 'CATEGORY_BALANCE',
  SHOP_BALANCE: 'SHOP_BALANCE',
  BRAND_BALANCE: 'BRAND_BALANCE',
  PRICE_RANGE_BALANCE: 'PRICE_RANGE_BALANCE',
  TOP_DISCOUNT: 'TOP_DISCOUNT',
  TOP_COMMISSION: 'TOP_COMMISSION',
  TOP_SALES: 'TOP_SALES',
  FILLER_SELECTION: 'FILLER_SELECTION'
};

class MarketplaceSelectionAdapter {
  constructor(marketplaceName) {
    this.marketplace = marketplaceName;
  }
  
  getCategory(product) {
    if (this.marketplace === 'Shopee') return product.categoria_original || product.category || 'Geral';
    return 'Geral';
  }
  getShop(product) {
    if (this.marketplace === 'Shopee') return product.raw_node?.shopName || product.shopName || product.shopee_shop_id || 'UnknownShop';
    return 'UnknownShop';
  }
  getBrand(product) {
    if (this.marketplace === 'Shopee') {
      const name = product.product_name || product.productName || '';
      return name.split(' ')[0] || 'UnknownBrand'; 
    }
    return 'UnknownBrand';
  }
  getPrice(product) {
    return product.current_price || 0;
  }
  getDiscount(product) {
    return product.discount_rate || 0;
  }
  getCommission(product) {
    let raw = product.commission_rate || product.raw_node?.sellerCommissionRate || product.raw_node?.shopeeCommissionRate || 0;
    let c = parseFloat(raw) || 0;
    if (c > 0 && c <= 1) c *= 100;
    return c;
  }
  getSales(product) {
    return product.sales || 0;
  }
  getRating(product) {
    return product.rating || 0;
  }
  getPriority(product) {
    return product.priority || 'LOW';
  }
  getDiscoveryScore(product) {
    return product.discoveryScore || product.score || 0;
  }
  getHistoryScore(product) {
    return product.historyScore || 0;
  }
  getId(product) {
    if (this.marketplace === 'Shopee') return product.shopee_item_id || product.itemId || 'UnknownId';
    return 'UnknownId';
  }
  getPriceRangeLabel(product, ranges) {
    const p = this.getPrice(product);
    for (const r of ranges) {
      if (p >= r.min && p < r.max) return r.label;
    }
    return 'UnknownRange';
  }
}

function calculateSelectionScore(product, adapter, config, inputFreqs) {
  const ds = adapter.getDiscoveryScore(product);
  const hs = adapter.getHistoryScore(product);
  let bonus = 0;
  
  const cat = adapter.getCategory(product);
  if (inputFreqs.category[cat] <= config.CATEGORY_LIMIT) bonus += config.BONUS.categoryDiversity;

  const shop = adapter.getShop(product);
  if (inputFreqs.shop[shop] <= config.SHOP_LIMIT) bonus += config.BONUS.shopDiversity;

  const brand = adapter.getBrand(product);
  if (inputFreqs.brand[brand] <= config.BRAND_LIMIT) bonus += config.BONUS.brandDiversity;
  
  const priceLabel = adapter.getPriceRangeLabel(product, config.PRICE_RANGES);
  if (inputFreqs.priceRange[priceLabel] <= config.PRICE_RANGE_LIMIT) bonus += config.BONUS.priceRangeDiversity;

  return ds + hs + bonus;
}

function runMarketplaceSelectionEngine(products, marketplaceName) {
  const config = MARKETPLACE_SELECTION_CONFIG[marketplaceName];
  if (!config) throw new Error(`Marketplace config not found: ${marketplaceName}`);
  const adapter = new MarketplaceSelectionAdapter(marketplaceName);

  const stats = {
    totalReceived: products.length,
    totalSelected: 0,
    totalDiscarded: 0,
    totalHigh: 0,
    totalMedium: 0,
    totalLow: 0,
    removedByPriority: 0,
    removedByCategoryLimit: 0,
    removedByShopLimit: 0,
    removedByBrandLimit: 0,
    removedByPriceRangeLimit: 0,
    removedByGlobalLimit: 0
  };

  const selectionReasons = {};
  Object.values(SELECTION_REASON).forEach(r => selectionReasons[r] = 0);

  const inputFreqs = { category: {}, shop: {}, brand: {}, priceRange: {} };
  for (const p of products) {
    const c = adapter.getCategory(p);
    const s = adapter.getShop(p);
    const b = adapter.getBrand(p);
    const pr = adapter.getPriceRangeLabel(p, config.PRICE_RANGES);
    
    inputFreqs.category[c] = (inputFreqs.category[c] || 0) + 1;
    inputFreqs.shop[s] = (inputFreqs.shop[s] || 0) + 1;
    inputFreqs.brand[b] = (inputFreqs.brand[b] || 0) + 1;
    inputFreqs.priceRange[pr] = (inputFreqs.priceRange[pr] || 0) + 1;
    
    const prio = adapter.getPriority(p);
    if (prio === 'HIGH') stats.totalHigh++;
    else if (prio === 'MEDIUM') stats.totalMedium++;
    else if (prio === 'LOW') stats.totalLow++;
  }

  let candidates = [];
  let discarded = [];
  for (const p of products) {
    const prio = adapter.getPriority(p);
    if (!config.ALLOW_LOW_PRIORITY && prio === 'LOW') {
      discarded.push({ product: p, reason: 'REJECTED_PRIORITY' });
      stats.removedByPriority++;
    } else {
      p._selectionScore = calculateSelectionScore(p, adapter, config, inputFreqs);
      candidates.push(p);
    }
  }

  candidates.sort((a, b) => {
    if (b._selectionScore !== a._selectionScore) return b._selectionScore - a._selectionScore;
    const dsA = adapter.getDiscoveryScore(a), dsB = adapter.getDiscoveryScore(b);
    if (dsB !== dsA) return dsB - dsA;
    const hsA = adapter.getHistoryScore(a), hsB = adapter.getHistoryScore(b);
    if (hsB !== hsA) return hsB - hsA;
    const sA = adapter.getSales(a), sB = adapter.getSales(b);
    if (sB !== sA) return sB - sA;
    const dscA = adapter.getDiscount(a), dscB = adapter.getDiscount(b);
    if (dscB !== dscA) return dscB - dscA;
    const commA = adapter.getCommission(a), commB = adapter.getCommission(b);
    if (commB !== commA) return commB - commA;
    const rA = adapter.getRating(a), rB = adapter.getRating(b);
    return rB - rA;
  });

  const selCat = {};
  const selShop = {};
  const selBrand = {};
  const selPrice = {};
  const selected = [];
  const selectedSet = new Set();

  // PASSO 1: garantir CATEGORY_MIN_TARGET por categoria (somente HIGH/MEDIUM)
  const catMinTarget = config.CATEGORY_MIN_TARGET || 0;
  if (catMinTarget > 0) {
    const catBuckets = {};
    for (const p of candidates) {
      const cat = adapter.getCategory(p);
      if (!catBuckets[cat]) catBuckets[cat] = [];
      catBuckets[cat].push(p);
    }
    for (const cat of Object.keys(catBuckets)) {
      let filled = 0;
      for (const p of catBuckets[cat]) {
        if (filled >= catMinTarget) break;
        if (selectedSet.has(p)) continue;
        if (selected.length >= config.GLOBAL_LIMIT) break;
        const shop = adapter.getShop(p);
        const brand = adapter.getBrand(p);
        const priceL = adapter.getPriceRangeLabel(p, config.PRICE_RANGES);
        if (config.ENABLE_SHOP_BALANCE && (selShop[shop] || 0) >= config.SHOP_LIMIT) continue;
        if (config.ENABLE_BRAND_BALANCE && (selBrand[brand] || 0) >= config.BRAND_LIMIT) continue;
        if (config.ENABLE_PRICE_BALANCE && (selPrice[priceL] || 0) >= config.PRICE_RANGE_LIMIT) continue;
        selCat[cat] = (selCat[cat] || 0) + 1;
        selShop[shop] = (selShop[shop] || 0) + 1;
        selBrand[brand] = (selBrand[brand] || 0) + 1;
        selPrice[priceL] = (selPrice[priceL] || 0) + 1;
        p._selectionReason = SELECTION_REASON.CATEGORY_BALANCE;
        selectionReasons[SELECTION_REASON.CATEGORY_BALANCE]++;
        selected.push(p);
        selectedSet.add(p);
        filled++;
      }
    }
  }

  // PASSO 2: preencher restante por score normal
  for (const p of candidates) {
    if (selectedSet.has(p)) continue;
    if (selected.length >= config.GLOBAL_LIMIT) {
      discarded.push({ product: p, reason: 'REJECTED_GLOBAL_LIMIT' });
      stats.removedByGlobalLimit++;
      continue;
    }

    const cat = adapter.getCategory(p);
    if (config.ENABLE_CATEGORY_BALANCE && (selCat[cat] || 0) >= config.CATEGORY_LIMIT) {
      discarded.push({ product: p, reason: 'REJECTED_CATEGORY_LIMIT' });
      stats.removedByCategoryLimit++;
      continue;
    }

    const shop = adapter.getShop(p);
    if (config.ENABLE_SHOP_BALANCE && (selShop[shop] || 0) >= config.SHOP_LIMIT) {
      discarded.push({ product: p, reason: 'REJECTED_SHOP_LIMIT' });
      stats.removedByShopLimit++;
      continue;
    }

    const brand = adapter.getBrand(p);
    if (config.ENABLE_BRAND_BALANCE && (selBrand[brand] || 0) >= config.BRAND_LIMIT) {
      discarded.push({ product: p, reason: 'REJECTED_BRAND_LIMIT' });
      stats.removedByBrandLimit++;
      continue;
    }

    const priceL = adapter.getPriceRangeLabel(p, config.PRICE_RANGES);
    if (config.ENABLE_PRICE_BALANCE && (selPrice[priceL] || 0) >= config.PRICE_RANGE_LIMIT) {
      discarded.push({ product: p, reason: 'REJECTED_PRICE_RANGE_LIMIT' });
      stats.removedByPriceRangeLimit++;
      continue;
    }

    selCat[cat] = (selCat[cat] || 0) + 1;
    selShop[shop] = (selShop[shop] || 0) + 1;
    selBrand[brand] = (selBrand[brand] || 0) + 1;
    selPrice[priceL] = (selPrice[priceL] || 0) + 1;

    let reason = SELECTION_REASON.FILLER_SELECTION;
    if (p._selectionScore >= 80) reason = SELECTION_REASON.TOP_DISCOVERY_SCORE;
    else if (adapter.getHistoryScore(p) > 10) reason = SELECTION_REASON.TOP_HISTORY_SCORE;
    else if (selCat[cat] === 1) reason = SELECTION_REASON.CATEGORY_BALANCE;
    else if (selShop[shop] === 1) reason = SELECTION_REASON.SHOP_BALANCE;
    else if (selBrand[brand] === 1) reason = SELECTION_REASON.BRAND_BALANCE;
    else if (selPrice[priceL] === 1) reason = SELECTION_REASON.PRICE_RANGE_BALANCE;
    else if (adapter.getDiscount(p) >= 50) reason = SELECTION_REASON.TOP_DISCOUNT;
    else if (adapter.getCommission(p) >= 15) reason = SELECTION_REASON.TOP_COMMISSION;
    else if (adapter.getSales(p) >= 5000) reason = SELECTION_REASON.TOP_SALES;
    
    p._selectionReason = reason;
    selectionReasons[reason]++;
    selected.push(p);
    selectedSet.add(p);
  }

  stats.totalSelected = selected.length;
  stats.totalDiscarded = discarded.length;

  const mkDist = (map) => {
    const list = [];
    for (const [name, qty] of Object.entries(map)) {
      list.push({
        nome: name,
        quantidade: qty,
        percentual: stats.totalSelected > 0 ? ((qty / stats.totalSelected) * 100).toFixed(2) + '%' : '0%'
      });
    }
    return list.sort((a,b) => b.quantidade - a.quantidade);
  };

  return {
    selectedProducts: selected,
    discardedProducts: discarded,
    statistics: stats,
    selectionReasons,
    categoryDistribution: mkDist(selCat),
    shopDistribution: mkDist(selShop),
    brandDistribution: mkDist(selBrand),
    priceDistribution: mkDist(selPrice)
  };
}

// ============================================================================
// SPRINT 09.5: Marketplace Candidate Queue
// ============================================================================

const MARKETPLACE_CANDIDATE_CONFIG = {
  MAX_QUEUE_SIZE: 500,
  ALLOW_DUPLICATES: false,
  VALIDATE_BEFORE_QUEUE: true,
  AUTO_REMOVE_INVALID: true,
  SORT_STABLE: true
};

const CANDIDATE_STATUS = {
  DISCOVERED: 'DISCOVERED',
  SELECTED: 'SELECTED',
  READY_FOR_RANKING: 'READY_FOR_RANKING',
  READY_FOR_AI: 'READY_FOR_AI',
  READY_FOR_MANUAL_REVIEW: 'READY_FOR_MANUAL_REVIEW',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  POSTED: 'POSTED',
  EXPIRED: 'EXPIRED'
};

class MarketplaceCandidateFactory {
  static createMarketplaceCandidate(product, marketplaceName, adapter) {
    const now = Date.now();
    const itemId = adapter.getId(product);
    const shopId = product.shopee_shop_id || product.shopId || product.raw_node?.shopId || 'UnknownShopId';
    
    const rawId = `${marketplaceName}_${itemId}_${shopId}`;
    const candidateId = Buffer.from(rawId).toString('base64');
    const commission = adapter.getCommission(product);

    return {
      candidateId,
      marketplace: marketplaceName,
      marketplaceProductId: String(itemId),
      shopId: String(shopId),
      productName: String(product.product_name || product.productName || ''),
      shopName: adapter.getShop(product),
      brand: adapter.getBrand(product),
      category: adapter.getCategory(product),
      currentPrice: adapter.getPrice(product),
      originalPrice: marketplaceName === 'Shopee' ? null : (product.original_price || product.price_before_discount || adapter.getPrice(product)),
      discount: adapter.getDiscount(product),
      commission: marketplaceName === 'Shopee' && Number.isFinite(commission) ? Number(commission.toFixed(2)) : commission,
      rating: adapter.getRating(product),
      sales: adapter.getSales(product),
      currency: product.currency || 'BRL',
      image: product.image_url || product.image || product.product_image || product.cover || '',
      affiliateLink: product.affiliate_url || product.offerLink || '',
      productLink: product.original_url || product.productLink || '',
      selectionScore: product._selectionScore || 0,
      discoveryScore: adapter.getDiscoveryScore(product),
      historyScore: adapter.getHistoryScore(product),
      priority: adapter.getPriority(product),
      tier: product.tier || 'UNKNOWN',
      selectionReason: product._selectionReason || 'NONE',
      historyReason: product.historyReason || 'NONE',
      ...(marketplaceName === 'Shopee' ? {
        discoverySources: product.discoverySources || [],
        productCatIds: product.product_cat_ids || [],
        sourceFilter: product.sourceFilter || null,
        isKeySellerFilterApplied: product.isKeySellerFilterApplied === true
      } : {}),
      createdAt: now,
      updatedAt: now,
      status: CANDIDATE_STATUS.SELECTED,
      selectionEngineVersion: '1.0',
      discoveryVersion: '1.0',
      historyVersion: '1.0',
      selectionVersion: '1.0'
    };
  }
}

function validateMarketplaceCandidate(candidate) {
  const errors = [];
  
  if (!candidate.candidateId) errors.push('Missing candidateId');
  if (!candidate.marketplace) errors.push('Missing marketplace');
  if (!candidate.productName) errors.push('Missing productName');
  if (candidate.currentPrice == null || candidate.currentPrice < 0) errors.push('Invalid currentPrice');
  if (!candidate.affiliateLink) errors.push('Missing affiliateLink');
  if (candidate.selectionScore == null) errors.push('Missing selectionScore');
  if (!candidate.status) errors.push('Missing status');

  return {
    isValid: errors.length === 0,
    errors
  };
}

function createMarketplaceCandidateQueue(selectedProducts, marketplaceName) {
  const adapter = new MarketplaceSelectionAdapter(marketplaceName);
  const config = MARKETPLACE_SELECTION_CONFIG[marketplaceName];
  
  let candidates = [];
  const stats = {
    totalCandidates: 0,
    validCandidates: 0,
    invalidCandidates: 0,
    duplicatedCandidates: 0,
    discardedCandidates: 0,
    readyCandidates: 0
  };

  const idMap = new Map();

  for (const p of selectedProducts) {
    stats.totalCandidates++;
    const candidate = MarketplaceCandidateFactory.createMarketplaceCandidate(p, marketplaceName, adapter);
    
    if (MARKETPLACE_CANDIDATE_CONFIG.VALIDATE_BEFORE_QUEUE) {
      const validation = validateMarketplaceCandidate(candidate);
      if (!validation.isValid) {
        stats.invalidCandidates++;
        if (MARKETPLACE_CANDIDATE_CONFIG.AUTO_REMOVE_INVALID) {
          stats.discardedCandidates++;
          continue;
        }
      } else {
        stats.validCandidates++;
      }
    }

    if (!MARKETPLACE_CANDIDATE_CONFIG.ALLOW_DUPLICATES) {
      if (idMap.has(candidate.candidateId)) {
        stats.duplicatedCandidates++;
        idMap.set(candidate.candidateId, candidate);
      } else {
        idMap.set(candidate.candidateId, candidate);
      }
    } else {
      candidates.push(candidate);
    }
  }

  if (!MARKETPLACE_CANDIDATE_CONFIG.ALLOW_DUPLICATES) {
    candidates = Array.from(idMap.values());
  }

  const prioValue = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0 };
  
  if (MARKETPLACE_CANDIDATE_CONFIG.SORT_STABLE) {
    candidates.sort((a, b) => {
      if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
      if (b.discoveryScore !== a.discoveryScore) return b.discoveryScore - a.discoveryScore;
      if (b.historyScore !== a.historyScore) return b.historyScore - a.historyScore;
      
      const pA = prioValue[a.priority] || 0;
      const pB = prioValue[b.priority] || 0;
      if (pB !== pA) return pB - pA;
      
      if (b.sales !== a.sales) return b.sales - a.sales;
      if (b.discount !== a.discount) return b.discount - a.discount;
      if (b.commission !== a.commission) return b.commission - a.commission;
      return b.rating - a.rating;
    });
  }

  if (candidates.length > MARKETPLACE_CANDIDATE_CONFIG.MAX_QUEUE_SIZE) {
    stats.discardedCandidates += (candidates.length - MARKETPLACE_CANDIDATE_CONFIG.MAX_QUEUE_SIZE);
    candidates = candidates.slice(0, MARKETPLACE_CANDIDATE_CONFIG.MAX_QUEUE_SIZE);
  }

  stats.readyCandidates = candidates.length;

  const freqCat = {};
  const freqShop = {};
  const freqBrand = {};
  const freqPrice = {};
  const freqMk = {};

  for (const c of candidates) {
    freqCat[c.category] = (freqCat[c.category] || 0) + 1;
    freqShop[c.shopName] = (freqShop[c.shopName] || 0) + 1;
    freqBrand[c.brand] = (freqBrand[c.brand] || 0) + 1;
    
    let pLabel = 'UnknownRange';
    const ranges = config?.PRICE_RANGES || [];
    for (const r of ranges) {
      if (c.currentPrice >= r.min && c.currentPrice < r.max) { pLabel = r.label; break; }
    }
    freqPrice[pLabel] = (freqPrice[pLabel] || 0) + 1;
    freqMk[c.marketplace] = (freqMk[c.marketplace] || 0) + 1;
  }

  const mkDist = (map) => {
    const list = [];
    for (const [name, qty] of Object.entries(map)) {
      list.push({
        nome: name,
        quantidade: qty,
        percentual: stats.readyCandidates > 0 ? ((qty / stats.readyCandidates) * 100).toFixed(2) + '%' : '0%'
      });
    }
    return list.sort((a,b) => b.quantidade - a.quantidade);
  };

  return {
    candidates,
    statistics: stats,
    distributions: {
      marketplaceDistribution: mkDist(freqMk),
      categoryDistribution: mkDist(freqCat),
      shopDistribution: mkDist(freqShop),
      brandDistribution: mkDist(freqBrand),
      priceDistribution: mkDist(freqPrice)
    }
  };
}

if (require.main === module && process.env.ORACLE_SCRAPER_DISABLE_AUTORUN !== '1') {
  if (isMercadoLivreOfficialDryRun) {
    runMercadoLivreOfficialDryRun().catch(e => {
      console.error('❌ Erro no Mercado Livre Native Top 20 dry-run:', e.message);
      process.exitCode = 1;
    });
  } else if (isAmazonOfficialDryRun) {
    runAmazonOfficialDryRun().catch(e => {
      console.error('❌ Erro no amazon official dry-run:', e.message);
      process.exitCode = 1;
    });
  } else if (isShopeeOfficialDryRun) {
    runShopeeOfficialDryRun().catch(e => {
      console.error('❌ Erro no shopee official dry-run:', e.message);
      process.exitCode = 1;
    });
  } else if (isShopeeV4DryRun) {
    runShopeeV4DryRun().catch(e => {
      console.error('❌ Erro no shopee dry-run:', e.message);
      process.exitCode = 1;
    });
  } else if (isDiscoveryDryRun) {
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

/**
 * Sprint 09.1 — Shopee Official Discovery
 * Fonte adicional à Shopee V4. Não substitui V4. Não chama IA. Não salva no banco.
 * @param {object} options
 * @param {string[]} [options.categories] — usado apenas para filtro externo do pipeline
 * @param {number} [options.limit] — produtos por request (default: 50)
 * @returns {{ products: object[], rawReturns: number, isFallback: boolean, categories: string[] }}
 */
async function fetchShopeeOfficialDiscovery(options = {}) {
  const limit = Math.min(10, Math.max(5, options.limit || 10));
  const limits = { categoryIds: 3, keySeller: 2, ams: 2, highCommission: 1, shopOffers: 1, shops: 1, campaigns: 1 };
  const allRaw = [];
  let rawReturns = 0;
  const categoryStats = {};
  const trailStats = { category_seed: 0, category_sales: 0, key_seller: 0, ams: 0, high_commission: 0, shop_products: 0, shopeeOfferV2: 0 };
  let graphqlCalls = 0;

  const seedRaw = await fetchShopeeProductsOfferV2({ sortType: 2, page: 1, limit, source: 'category_seed' });
  graphqlCalls++;
  trailStats.category_seed = seedRaw.length;

  const nativeCategoryIds = collectShopeeProductCatIds(seedRaw, limits.categoryIds);
  for (const productCatId of nativeCategoryIds) {
    const nodes = await fetchShopeeProductsOfferV2({ productCatId, sortType: 2, page: 1, limit, source: 'category_sales', category: `cat:${productCatId}` });
    graphqlCalls++; rawReturns += nodes.length; trailStats.category_sales += nodes.length; allRaw.push(...nodes);
    categoryStats[String(productCatId)] = { requested: productCatId, received: nodes.length, uniqueAfterFetch: nodes.length, approved: 0 };
    const sales = nodes.map(node => Number(node.sales)).filter(Number.isFinite);
    const commissions = nodes.map(node => Number(node.commissionRate)).filter(Number.isFinite);
    console.log(`[Shopee Official][category_sales] productCatId=${productCatId} returned=${nodes.length} avgSales=${sales.length ? Math.round(sales.reduce((a, b) => a + b, 0) / sales.length) : 0} avgCommission=${formatShopeePercent(commissions.length ? commissions.reduce((a, b) => a + b, 0) / commissions.length : 0)}`);
  }

  for (const productCatId of nativeCategoryIds.slice(0, limits.keySeller)) {
    const nodes = await fetchShopeeProductsOfferV2({ productCatId, sortType: 2, page: 1, limit, isKeySeller: true, source: 'key_seller', sourceFilter: 'isKeySeller=true', category: `cat:${productCatId}` });
    graphqlCalls++; rawReturns += nodes.length; trailStats.key_seller += nodes.length; allRaw.push(...nodes);
  }
  for (const productCatId of nativeCategoryIds.slice(0, limits.ams)) {
    const nodes = await fetchShopeeProductsOfferV2({ productCatId, sortType: 2, page: 1, limit, isAMSOffer: true, source: 'ams', sourceFilter: 'isAMSOffer=true', category: `cat:${productCatId}` });
    graphqlCalls++; rawReturns += nodes.length; trailStats.ams += nodes.length; allRaw.push(...nodes);
  }

  let highCommission = [];
  if (limits.highCommission) {
    highCommission = await fetchShopeeProductsOfferV2({ sortType: 5, page: 1, limit, source: 'high_commission' });
    graphqlCalls++;
    highCommission = highCommission.filter(node => isShopeeHighCommissionEligible(node));
    rawReturns += highCommission.length; trailStats.high_commission += highCommission.length; allRaw.push(...highCommission);
  }

  const shops = limits.shopOffers ? await fetchShopeeShopOffers(limit, 1) : [];
  if (limits.shopOffers) graphqlCalls++;
  const validShops = shops.filter(shop => isShopeePeriodActive(shop) && Number(shop.ratingStar) > 0 && Number(shop.commissionRate) >= 0).slice(0, limits.shops);
  for (const shop of validShops) {
    const nodes = await fetchShopeeProductsOfferV2({ shopId: String(shop.shopId), sortType: 2, page: 1, limit, source: 'shop_products', category: 'Geral' });
    graphqlCalls++; rawReturns += nodes.length; trailStats.shop_products += nodes.length; allRaw.push(...nodes);
  }

  const campaignsRaw = limits.campaigns ? await fetchShopeeCampaignOffers(limit, 1) : [];
  if (limits.campaigns) graphqlCalls++;
  const campaigns = campaignsRaw.filter(campaign => isShopeePeriodActive(campaign));
  trailStats.shopeeOfferV2 = campaigns.length;

  const activeRaw = allRaw.filter(node => isShopeePeriodActive(node));
  const merged = mergeShopeeDiscoveryProducts(activeRaw);
  const uniqueNodes = merged.products;

  const products = uniqueNodes.map(node => {
    const base = normalizeShopeeProduct(node);
    if (!base) return null;
    return {
      ...base,
      categoria_original: node._categoria_original || 'Geral',
      sortType: node._sortType,
      page: node._page,
      brand_signal: 0,
      raw_node: node
    };
  }).filter(product => product && product.current_price > 0 && product.image_url && product.original_url && product.affiliate_url);

  return {
    products,
    rawReturns,
    isFallback: false,
    categories: nativeCategoryIds.map(String),
    duplicatesRejected: merged.duplicatesRejected,
    categoryStats,
    officialShopField: null,
    trailStats,
    graphqlCalls,
    campaigns,
    shops: validShops,
    nativeCategoryIds,
    forbiddenSources: { baseline: 0, legacy: 0, broad: 0, category_keyword: 0, fallback_categories: 0 }
  };
}

async function runShopeeOfficialPipeline(targetCategory, limit = 5, options = {}) {
  const mode = options.mode || 'manual_review';
  const historyStore = options.historyStore || seenProductStore;
  const fetcher = options.fetcher || fetchShopeeOfficialDiscovery;
  const officialOnly = options.officialOnly === true || process.env.SHOPEE_OFFICIAL_ONLY === '1';

  if (process.env.SHOPEE_OFFICIAL_FORCE_ERROR === '1') {
    throw new Error('SHOPEE_OFFICIAL_FORCE_ERROR');
  }

  let catList = SHOPEE_OFFICIAL_CATEGORIES;
  if (targetCategory && targetCategory !== 'Todas' && targetCategory !== 'Geral') {
    catList = [targetCategory];
  }
  
  const discovery = await fetcher({ categories: catList, limit: 50 });
  const incomingProducts = Array.isArray(discovery?.products) ? discovery.products : [];
  const pipelineDedupe = dedupeShopeeProductsDetailed(incomingProducts);
  let products = pipelineDedupe.products;
  let nonOfficialRejected = 0;

  if (officialOnly && discovery?.officialShopField) {
    const officialFiltered = [];
    for (const product of products) {
      if (product.official_shop_value) {
        officialFiltered.push(product);
      } else {
        nonOfficialRejected++;
      }
    }
    products = officialFiltered;
  }

  const diagHistory = { received: products.length, accepted: 0, rejected: 0, reasons: {} };
  const historyFiltered = [];
  for (const p of products) {
    const histDecision = shouldProcessProduct(p, { ...options, mode }, historyStore);
    p.historyReason = histDecision.historyReason;
    registerSeenProductWithStore(p, histDecision.historyReason, false, historyStore);
    if (histDecision.shouldProcess) {
      historyFiltered.push(p);
      diagHistory.accepted++;
    } else {
      diagHistory.rejected++;
    }
    diagHistory.reasons[histDecision.historyReason] = (diagHistory.reasons[histDecision.historyReason] || 0) + 1;
  }
  const historySaved = historyStore.flush();

  const postHistoryDedupe = dedupeShopeeProductsDetailed(historyFiltered);
  const diagScore = {
    high: 0, medium: 0, low: 0,
    min: Infinity, max: -Infinity, total: 0, count: 0,
    ranges: { '< 0': 0, '0-10': 0, '11-30': 0, '31-50': 0, '51-80': 0, '> 80': 0 }
  };
  const scoredProducts = [];
  for (const p of postHistoryDedupe.products) {
    const scoreResult = calculateShopeeDiscoveryScore(p);
    p.discoveryScore = scoreResult.score;
    p.tier = scoreResult.tier;
    p.priority = scoreResult.priority;
    scoredProducts.push(p);

    diagScore.count++;
    diagScore.total += p.discoveryScore;
    if (p.discoveryScore < diagScore.min) diagScore.min = p.discoveryScore;
    if (p.discoveryScore > diagScore.max) diagScore.max = p.discoveryScore;
    
    if (p.priority === 'HIGH') diagScore.high++;
    else if (p.priority === 'MEDIUM') diagScore.medium++;
    else if (p.priority === 'LOW') diagScore.low++;
    
    if (p.discoveryScore < 0) diagScore.ranges['< 0']++;
    else if (p.discoveryScore <= 10) diagScore.ranges['0-10']++;
    else if (p.discoveryScore <= 30) diagScore.ranges['11-30']++;
    else if (p.discoveryScore <= 50) diagScore.ranges['31-50']++;
    else if (p.discoveryScore <= 80) diagScore.ranges['51-80']++;
    else diagScore.ranges['> 80']++;
  }
  if (diagScore.count === 0) { diagScore.min = 0; diagScore.max = 0; }
  diagScore.avg = diagScore.count > 0 ? (diagScore.total / diagScore.count).toFixed(2) : 0;

  const selectionResult = runMarketplaceSelectionEngine(scoredProducts, 'Shopee');
  
  const diagSelection = {
    recebidos: scoredProducts.length,
    aceitos: selectionResult.statistics.totalSelected,
    removidos: selectionResult.statistics.totalDiscarded,
    reasons: {
      priority: selectionResult.statistics.removedByPriority,
      category_limit: selectionResult.statistics.removedByCategoryLimit,
      shop_limit: selectionResult.statistics.removedByShopLimit,
      brand_limit: selectionResult.statistics.removedByBrandLimit,
      price_limit: selectionResult.statistics.removedByPriceRangeLimit,
      global_limit: selectionResult.statistics.removedByGlobalLimit,
      duplicates: 0,
      outros: selectionResult.statistics.totalDiscarded - (
        selectionResult.statistics.removedByPriority +
        selectionResult.statistics.removedByCategoryLimit +
        selectionResult.statistics.removedByShopLimit +
        selectionResult.statistics.removedByBrandLimit +
        selectionResult.statistics.removedByPriceRangeLimit +
        selectionResult.statistics.removedByGlobalLimit
      )
    }
  };

  const diagCategory = {};
  for (const p of products) {
    const cat = p.categoria_original || p.category || 'Sem Categoria';
    if (!diagCategory[cat]) diagCategory[cat] = { recebidos: 0, pontuados: 0, selecionados: 0 };
    diagCategory[cat].recebidos++;
  }
  for (const p of scoredProducts) {
    const cat = p.categoria_original || p.category || 'Sem Categoria';
    if (diagCategory[cat]) diagCategory[cat].pontuados++;
  }
  for (const p of selectionResult.selectedProducts) {
    const cat = p.categoria_original || p.category || 'Sem Categoria';
    if (diagCategory[cat]) diagCategory[cat].selecionados++;
  }

  for (const [cat, stats] of Object.entries(discovery?.categoryStats || {})) {
    if (!diagCategory[cat]) {
      diagCategory[cat] = { recebidos: 0, pontuados: 0, selecionados: 0 };
    }
    stats.approved = diagCategory[cat].selecionados;
  }

  const queueResult = createMarketplaceCandidateQueue(selectionResult.selectedProducts, 'Shopee');

  let finalCandidates = queueResult.candidates;
  if (targetCategory && targetCategory !== 'Todas' && targetCategory !== 'Geral') {
    finalCandidates = finalCandidates.filter(c => c.category === targetCategory || c.categoria_original === targetCategory);
  }
  
  finalCandidates = finalCandidates.slice(0, limit);

  console.log(`[Shopee Official] categoryIds=${(discovery?.nativeCategoryIds || []).length} received=${products.length} historyRejected=${diagHistory.rejected} duplicatesRejected=${(discovery?.duplicatesRejected || 0) + pipelineDedupe.duplicatesRejected + postHistoryDedupe.duplicatesRejected + queueResult.statistics.duplicatedCandidates} nonOfficialRejected=${nonOfficialRejected} candidates=${finalCandidates.length}`);

  console.log('\n[DIAGNOSTICS] =======================================');
  console.log('HISTORY:', JSON.stringify(diagHistory, null, 2));
  console.log('DISCOVERY SCORE:', JSON.stringify(diagScore, null, 2));
  console.log('SELECTION ENGINE:', JSON.stringify(diagSelection, null, 2));
  console.log('CATEGORY:', JSON.stringify(diagCategory, null, 2));
  console.log('=====================================================\n');

  const averageCandidateField = (field) => {
    const values = finalCandidates.map(candidate => Number(candidate[field])).filter(Number.isFinite);
    return values.length ? Number((values.reduce((sum, value) => sum + value, 0) / values.length).toFixed(2)) : null;
  };
  const priceBands = { 'R$15–30': 0, 'R$30–80': 0, 'R$80–150': 0, 'R$150–300': 0, 'R$300–700': 0, 'R$700+': 0 };
  for (const candidate of finalCandidates) {
    const price = Number(candidate.currentPrice);
    if (price < 30) priceBands['R$15–30']++;
    else if (price < 80) priceBands['R$30–80']++;
    else if (price < 150) priceBands['R$80–150']++;
    else if (price < 300) priceBands['R$150–300']++;
    else if (price < 700) priceBands['R$300–700']++;
    else priceBands['R$700+']++;
  }

  return {
    candidates: finalCandidates,
    telemetry: {
      marketplace: 'Shopee',
      category: targetCategory || 'Todas',
      received: products.length,
      rawReturns: discovery?.rawReturns || 0,
      uniqueProducts: incomingProducts.length,
      historyPassed: historyFiltered.length,
      historyFilteredOut: products.length - historyFiltered.length,
      historyReasons: diagHistory.reasons,
      historySaved,
      scored: scoredProducts.length,
      selected: selectionResult.statistics.totalSelected,
      candidatesGenerated: queueResult.statistics.readyCandidates,
      returned: finalCandidates.length,
      duplicatesRejected: (discovery?.duplicatesRejected || 0) + pipelineDedupe.duplicatesRejected + postHistoryDedupe.duplicatesRejected + queueResult.statistics.duplicatedCandidates,
      nonOfficialRejected,
      officialShopField: discovery?.officialShopField || null,
      categoryStats: discovery?.categoryStats || {},
      filteredByCategory: queueResult.candidates.length - finalCandidates.length,
      top10SelectionScore: finalCandidates.slice(0, 10).map(c => c.selectionScore),
      graphqlCalls: discovery?.graphqlCalls || 0,
      productsByTrail: discovery?.trailStats || {},
      activeCampaigns: discovery?.campaigns?.length || 0,
      nativeCategoryIds: discovery?.nativeCategoryIds || [],
      uniqueShops: new Set(finalCandidates.map(candidate => candidate.shopId)).size,
      averageSales: averageCandidateField('sales'),
      averageCommission: averageCandidateField('commission'),
      averageRating: averageCandidateField('rating'),
      averageDiscount: averageCandidateField('discount'),
      averagePrice: averageCandidateField('currentPrice'),
      priceBands,
      top20: finalCandidates.slice(0, 20).map(candidate => ({
        product: candidate.productName,
        trail: candidate.discoverySources,
        sales: candidate.sales,
        commission: candidate.commission,
        price: candidate.currentPrice,
        rating: candidate.rating,
        discount: candidate.discount
      })),
      _selectionStats: selectionResult.statistics
    }
  };
}

async function runShopeeOfficialDryRun() {
  console.log('\n[Shopee Official Pipeline Dry-Run 10.0] Iniciando...\n');
  const reportsDir = path.join(__dirname, '..', 'reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir, { recursive: true });

  console.log('Executando runShopeeOfficialPipeline...');
  // Limite alto no dry-run para processar o máximo possível
  const { candidates, telemetry } = await runShopeeOfficialPipeline('Todas', 500);
  console.log('[Shopee Official][TRAILS]', JSON.stringify({
    ...telemetry.productsByTrail,
    total_bruto: telemetry.rawReturns,
    unicos: telemetry.uniqueProducts,
    campanhas_vigentes: telemetry.activeCampaigns,
    deduplicados: telemetry.duplicatesRejected,
    history: { passed: telemetry.historyPassed, rejected: telemetry.historyFilteredOut },
    selection_engine: telemetry.selected,
    candidates_finais: telemetry.returned,
    graphql_calls: telemetry.graphqlCalls,
    baseline: 0,
    legacy: 0,
    broad: 0,
    category_keyword: 0,
    fallback_categories: 0
  }));

  // Enviar para Manual Review Queue
  console.log('Enviando itens para Manual Review Queue...');
  const manualQueue = new MarketplaceManualReviewQueue();
  let addedToQueue = 0;
  for (const c of candidates) {
    if (manualQueue.enqueueMarketplaceCandidate(c)) {
      addedToQueue++;
    }
  }

  const summary = {
    sprint: '10.0',
    timestamp: new Date().toISOString(),
    telemetry: telemetry,
    manualReviewQueueAdded: addedToQueue,
    ia_chamada: false,
    banco_alterado: false,
    publicacao_ocorreu: false,
    shopee_v4_preservada: true
  };

  const md = [
    '# Sprint 10.0 — Shopee Official Pipeline Validation',
    '',
    '## Relatório de Execução do Pipeline',
    '- Produtos recebidos (Discovery): ' + telemetry.received,
    '- Filtrados pelo History: ' + telemetry.historyFilteredOut,
    '- Pontuados pelo Discovery Score: ' + telemetry.scored,
    '- Selecionados pelo Selection Engine: ' + telemetry.selected,
    '- Candidates gerados (antes do limite final): ' + telemetry.candidatesGenerated,
    '- Removidos pelo MAX_QUEUE_SIZE (500): ' + Math.max(0, telemetry.candidatesGenerated - telemetry.returned),
    '- Candidates retornados no final: ' + telemetry.returned,
    '- Itens enviados para Manual Review Queue: ' + addedToQueue,
    '',
    '## Distribuição por Categoria',
    '',
    '*Nota: O pipeline utiliza a categoria REAL (`categoria_original` ou `category`), caindo para "Sem Categoria" ou "Geral" apenas quando nenhuma das duas está presente.*',
    '',
    '| Categoria | Selecionados |',
    '| --- | --- |'
  ];

  const catCounts = {};
  const shopCounts = {};
  const brandCounts = {};
  const priceRangeCounts = {};

  const adapter = new MarketplaceSelectionAdapter('Shopee');
  const ranges = MARKETPLACE_SELECTION_CONFIG['Shopee'].PRICE_RANGES;

  for (const c of candidates) {
    catCounts[c.category] = (catCounts[c.category] || 0) + 1;
    shopCounts[c.shopName] = (shopCounts[c.shopName] || 0) + 1;
    brandCounts[c.brand] = (brandCounts[c.brand] || 0) + 1;
    
    // Convertendo candidate back to product mock para o adapter, pois o adapter espera um product
    // Mas o candidate já tem currentPrice. O getPrice() no adapter lê current_price, então:
    const mockP = { current_price: c.currentPrice };
    const pLabel = adapter.getPriceRangeLabel(mockP, ranges);
    priceRangeCounts[pLabel] = (priceRangeCounts[pLabel] || 0) + 1;
  }

  for (const [cat, count] of Object.entries(catCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${cat} | ${count} |`);
  }

  md.push('', '## Distribuição por Loja', '| Loja | Selecionados |', '| --- | --- |');
  for (const [shop, count] of Object.entries(shopCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${shop} | ${count} |`);
  }

  md.push('', '## Distribuição por Marca', '| Marca | Selecionados |', '| --- | --- |');
  for (const [brand, count] of Object.entries(brandCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${brand} | ${count} |`);
  }

  md.push('', '## Distribuição por Faixa de Preço', '| Faixa | Selecionados |', '| --- | --- |');
  for (const [pr, count] of Object.entries(priceRangeCounts).sort((a, b) => b[1] - a[1])) {
    md.push(`| ${pr} | ${count} |`);
  }

  md.push('', '## Meta por Categoria', '| Categoria | Selecionados | Meta mínima | Situação |', '| --- | ---: | ---: | --- |');
  
  let totalCategories = Object.keys(catCounts).length;
  let belowTarget = [];
  
  for (const [cat, count] of Object.entries(catCounts)) {
    const isBelow = count < 5;
    const status = isBelow ? 'ABAIXO' : (cat === 'Geral' || cat === 'Sem Categoria' ? 'VERIFICAR' : 'OK');
    if (isBelow) belowTarget.push(cat);
    md.push(`| ${cat} | ${count} | 5 | ${status} |`);
  }

  const allGeral = totalCategories === 1 && (catCounts['Geral'] || catCounts['Sem Categoria']);

  md.push(
    '',
    '## Resumo da Categoria',
    `- Quantas categorias diferentes chegaram à Candidate Queue? ${totalCategories}`,
    `- Quantas categorias ficaram abaixo da meta de 5? ${belowTarget.length}`,
    `- Existe concentração excessiva? ${Object.values(catCounts).some(c => c > 30) ? 'SIM' : 'NÃO'}`,
    `- Existe uso de "Geral"? ${catCounts['Geral'] ? 'SIM' : 'NÃO'}`,
    `- Quais são as categorias abaixo da meta? ${belowTarget.length > 0 ? belowTarget.join(', ') : 'Nenhuma'}`,
    '',
    allGeral 
      ? `Todos os Candidates estão chegando como Geral. Próximo passo: corrigir propagação de categoria antes de aumentar GLOBAL_LIMIT.`
      : `Categorias reais preservadas. Próximo passo: ajustar GLOBAL_LIMIT e mínimo por categoria.`
  );

  // Diagnóstico de removidos pelo Selection Engine
  const selResult = telemetry._selectionStats || {};
  md.push(
    '',
    '## Diagnóstico Selection Engine',
    '| Motivo | Removidos |',
    '| --- | --- |',
    `| priority | ${selResult.removedByPriority || '-'} |`,
    `| category_limit | ${selResult.removedByCategoryLimit || '-'} |`,
    `| shop_limit | ${selResult.removedByShopLimit || '-'} |`,
    `| brand_limit | ${selResult.removedByBrandLimit || '-'} |`,
    `| price_limit | ${selResult.removedByPriceRangeLimit || '-'} |`,
    `| global_limit | ${selResult.removedByGlobalLimit || '-'} |`
  );

  // Lista de produtos selecionados por categoria
  md.push('', '## Produtos Selecionados por Categoria');
  const catGroups = {};
  for (const c of candidates) {
    if (!catGroups[c.category]) catGroups[c.category] = [];
    catGroups[c.category].push(c);
  }
  for (const [cat, items] of Object.entries(catGroups).sort((a, b) => a[0].localeCompare(b[0]))) {
    md.push(``, `### ${cat} (${items.length} produtos)`);
    md.push('| Produto | Loja | Preço | Desc% | Vendas | Nota | Comiss% | DScore | SScore | Tier |');
    md.push('| --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | --- |');
    for (const c of items) {
      const name = (c.productName || '').substring(0, 40).replace(/\|/g, '-');
      const shop = (c.shopName || '').substring(0, 20).replace(/\|/g, '-');
      md.push(`| ${name} | ${shop} | ${c.currentPrice} | ${c.discount} | ${c.sales} | ${c.rating} | ${c.commission} | ${c.discoveryScore} | ${c.selectionScore} | ${c.tier} |`);
    }
  }

  md.push(
    '',
    '## Segurança',
    '- IA chamada: NÃO',
    '- Banco alterado: NÃO',
    '- Publicação ocorreu: NÃO',
    '- Mercado Livre preservado: SIM',
    '- Amazon preservada: SIM',
    '- Cron preservado: SIM'
  );

  const mdText = md.join('\n');

  fs.writeFileSync(path.join(reportsDir, 'sprint_10.0_shopee_official_pipeline_summary.json'), JSON.stringify(summary, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'sprint_10.0_shopee_official_pipeline_validation.md'), mdText);

  console.log(mdText);
  console.log('\n[Shopee Official Pipeline Dry-Run 10.0] Concluído. Relatórios em reports/');
}

const MANUAL_REVIEW_STATUS = {
  PENDING: 'PENDING',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  EXPIRED: 'EXPIRED',
  POSTED: 'POSTED',
  ERROR: 'ERROR'
};

class MarketplaceManualReviewQueue {
  constructor() {
    this.queue = [];
    this.stats = {
      received: 0,
      valid: 0,
      rejected: 0,
      pending: 0,
      processingTimeMs: 0
    };
    this.reportPath = path.join(__dirname, '..', 'reports', 'manual_review_queue.json');
    this._load();
  }

  _load() {
    const fs = require('fs');
    if (fs.existsSync(this.reportPath)) {
      try {
        const data = JSON.parse(fs.readFileSync(this.reportPath, 'utf8'));
        this.queue = data.queue || [];
        this.stats = data.stats || this.stats;
      } catch (e) {
        console.warn('Erro ao carregar manual_review_queue.json', e.message);
      }
    }
  }

  enqueueMarketplaceCandidate(candidate) {
    const start = Date.now();
    this.stats.received++;
    
    // Reutilizar validação
    const validation = validateMarketplaceCandidate(candidate);
    if (!validation.isValid) {
      this.stats.rejected++;
      this.stats.processingTimeMs += (Date.now() - start);
      return false;
    }

    // Não duplicar
    if (!this.queue.find(c => c.candidateId === candidate.candidateId)) {
      candidate.status = MANUAL_REVIEW_STATUS.PENDING;
      if (!candidate.createdAt) candidate.createdAt = new Date().toISOString();
      this.queue.push(candidate);
      
      this.stats.valid++;
      this.stats.pending++;
    }
    
    this.sortQueue();
    this.persistQueue();
    
    this.stats.processingTimeMs += (Date.now() - start);
    return true;
  }

  sortQueue() {
    const prioValue = { 'HIGH': 3, 'MEDIUM': 2, 'LOW': 1, 'UNKNOWN': 0 };
    
    this.queue.sort((a, b) => {
      if (b.selectionScore !== a.selectionScore) return b.selectionScore - a.selectionScore;
      if (b.discoveryScore !== a.discoveryScore) return b.discoveryScore - a.discoveryScore;
      const pA = prioValue[a.priority] || 0;
      const pB = prioValue[b.priority] || 0;
      if (pB !== pA) return pB - pA;
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateA - dateB;
    });
  }

  dequeueMarketplaceCandidate() {
    const start = Date.now();
    
    const pendingIndex = this.queue.findIndex(c => c.status === MANUAL_REVIEW_STATUS.PENDING);
    if (pendingIndex === -1) {
      this.stats.processingTimeMs += (Date.now() - start);
      return null;
    }
    
    const candidate = this.queue[pendingIndex];
    this.stats.processingTimeMs += (Date.now() - start);
    return candidate;
  }

  updateMarketplaceCandidateStatus(candidateId, status) {
    const start = Date.now();
    const candidate = this.queue.find(c => c.candidateId === candidateId);
    
    if (candidate) {
      if (candidate.status === MANUAL_REVIEW_STATUS.PENDING && status !== MANUAL_REVIEW_STATUS.PENDING) {
        this.stats.pending--;
      } else if (candidate.status !== MANUAL_REVIEW_STATUS.PENDING && status === MANUAL_REVIEW_STATUS.PENDING) {
        this.stats.pending++;
      }
      candidate.status = status;
      this.persistQueue();
      this.stats.processingTimeMs += (Date.now() - start);
      return true;
    }
    this.stats.processingTimeMs += (Date.now() - start);
    return false;
  }

  persistQueue() {
    const fs = require('fs');
    fs.writeFileSync(this.reportPath, JSON.stringify({
      stats: this.stats,
      queue: this.queue
    }, null, 2));
  }
}

module.exports = {
  fetchAmazonDiscoveryV3,
  findAmazonOffersByAsins,
  applyAmazonNoveltyGate,
  selectAmazonDiverseFinalists,
  normalizeAmazonRankingRawHtmlV3,
  normalizeAmazonOutletRawHtmlV3,
  runAmazonOfficialDryRun,
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
  inspectMarketplaceCardsWithCrawlee,
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
  PROVIDER_CONFIG,
  runShopeeOfficialPipeline,
  fetchShopeeOfficialDiscovery,
  MarketplaceManualReviewQueue,
  MANUAL_REVIEW_STATUS,
  canonicalizeAmazonProductUrl,
  sanitizeAmazonProductsBeforeLlm,
  applyMarketplaceDataContract,
  normalizeShopeeProduct,
  buildShopeeProductOfferV2Payload,
  collectShopeeProductCatIds,
  isShopeePeriodActive,
  mergeShopeeDiscoveryProducts,
  isShopeeHighCommissionEligible,
  formatShopeePercent,
  enrichShopeeOffer,
  createSubId,
  isUuid,
  ensureShopeeOfferIdentity,
  executeMercadoLivreNativeTop20,
  runMercadoLivreOfficialDryRun,
  fetchAmazonHtmlViaScrapedo,
  createShopeeHistoryStore: (filePath) => new SeenProductStore(new FileSeenProductStore(filePath)),
  dedupeShopeeProductsDetailed,
  getShopeeDedupKeys
};

function getEnabledStores(stores) {
  if (process.argv.includes('--amazon-official-dry-run')) return ['Amazon'];
  if (process.argv.includes('--mercadolivre-native-top20-dry-run')) return ['Mercado Livre'];
  return stores.filter(store => !SKIP_STORES.has(store));
}

// ======================================================================
// SHOPEE DISCOVERY V4
// ======================================================================

function buildShopeeGraphQLPayload(operationName, query, variables) {
  return JSON.stringify({ operationName, query, variables });
}

async function callShopeeAffiliateApi(payload) {
  if (!SHOPEE_APP_ID || !SHOPEE_APP_SECRET) return null;
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
    return resp;
  } catch (err) {
    console.warn(`[Shopee API V4] Falha na request: ${err.message}`);
    return null;
  }
}

function buildShopeeProductOfferV2Payload(options = {}) {
  const variables = {
    page: options.page || 1,
    limit: Math.min(10, Math.max(1, options.limit || 10)),
    sortType: options.sortType || 2
  };
  const definitions = ['$page: Int', '$limit: Int', '$sortType: Int'];
  const args = ['page: $page', 'limit: $limit', 'sortType: $sortType'];
  if (options.productCatId != null) {
    definitions.push('$productCatId: Int'); args.push('productCatId: $productCatId');
    variables.productCatId = Number(options.productCatId);
  }
  if (options.shopId != null) {
    definitions.push('$shopId: Int64'); args.push('shopId: $shopId');
    variables.shopId = String(options.shopId);
  }
  if (options.isKeySeller === true) {
    definitions.push('$isKeySeller: Boolean'); args.push('isKeySeller: $isKeySeller');
    variables.isKeySeller = true;
  }
  if (options.isAMSOffer === true) {
    definitions.push('$isAMSOffer: Boolean'); args.push('isAMSOffer: $isAMSOffer');
    variables.isAMSOffer = true;
  }
  const query = `query ShopeeProductOfferSearch(${definitions.join(', ')}) { productOfferV2(${args.join(', ')}) { nodes { itemId productName priceMin priceMax imageUrl productLink offerLink sales commissionRate sellerCommissionRate shopeeCommissionRate ratingStar priceDiscountRate shopId shopName productCatIds periodStartTime periodEndTime } pageInfo { page limit hasNextPage } } }`;
  return buildShopeeGraphQLPayload('ShopeeProductOfferSearch', query, variables);
}

async function fetchShopeeProductsOfferV2(options = {}) {
  const payload = buildShopeeProductOfferV2Payload(options);
  const resp = await callShopeeAffiliateApi(payload);
  if (!resp || resp.status !== 200 || resp.data?.errors) return [];
  return Array.isArray(resp.data?.data?.productOfferV2?.nodes)
    ? resp.data.data.productOfferV2.nodes.map(node => ({ ...node, _discoverySource: options.source || 'category_seed', _categoria_original: options.category || 'Geral', _sourceFilter: options.sourceFilter || null }))
    : [];
}

async function fetchShopeeProductsByCommission(limit, page) { return fetchShopeeProductsOfferV2({ sortType: 5, limit, page, source: 'high_commission' }); }
async function fetchShopeeProductsBySales(limit, page) { return fetchShopeeProductsOfferV2({ sortType: 2, limit, page, source: 'category_seed' }); }
async function fetchShopeeProductsByDiscount(limit, page) { return fetchShopeeProductsOfferV2({ sortType: 2, limit, page, source: 'category_seed' }); }
async function fetchShopeeProductsByRelevance(limit, page) { return fetchShopeeProductsOfferV2({ sortType: 2, limit, page, source: 'category_seed' }); }

async function fetchShopeeShopOffers(limit = 10, page = 1) {
  const query = 'query ShopeeShopOfferSearch($page: Int, $limit: Int, $sortType: Int) { shopOfferV2(page: $page, limit: $limit, sortType: $sortType) { nodes { shopId shopName ratingStar commissionRate remainingBudget sellerCommCoveRatio periodStartTime periodEndTime offerLink } pageInfo { page limit hasNextPage } } }';
  const payload = buildShopeeGraphQLPayload('ShopeeShopOfferSearch', query, { page, limit: Math.min(10, limit), sortType: 2 });
  const resp = await callShopeeAffiliateApi(payload);
  if (!resp || resp.status !== 200 || resp.data?.errors) return [];
  return Array.isArray(resp.data?.data?.shopOfferV2?.nodes) ? resp.data.data.shopOfferV2.nodes : [];
}

async function fetchShopeeCampaignOffers(limit = 10, page = 1) {
  const query = 'query ShopeeCampaignOfferSearch($page: Int, $limit: Int) { shopeeOfferV2(page: $page, limit: $limit) { nodes { offerName offerLink commissionRate periodStartTime periodEndTime categoryId collectionId } pageInfo { page limit hasNextPage } } }';
  const payload = buildShopeeGraphQLPayload('ShopeeCampaignOfferSearch', query, { page, limit: Math.min(10, limit) });
  const resp = await callShopeeAffiliateApi(payload);
  if (!resp || resp.status !== 200 || resp.data?.errors) return [];
  return Array.isArray(resp.data?.data?.shopeeOfferV2?.nodes) ? resp.data.data.shopeeOfferV2.nodes : [];
}

async function fetchShopeeItemFeedsIfAvailable() {
  const query = 'query ShopeeListItemFeeds { listItemFeeds { nodes { id status } } }';
  const payload = buildShopeeGraphQLPayload('ShopeeListItemFeeds', query, {});
  const resp = await callShopeeAffiliateApi(payload);
  if (!resp || resp.status !== 200 || resp.data?.errors) return null;
  return resp.data?.data?.listItemFeeds?.nodes || [];
}

async function generateShopeeBatchShortLinks(originLinks) {
  // Mock para dry-run. Não gera link final no banco, só demonstra.
  return originLinks.map(url => ({ original: url, shortLink: url }));
}

function dedupeShopeeProducts(products) {
  return dedupeShopeeProductsDetailed(products).products;
}

function collectShopeeProductCatIds(nodes, max = 3) {
  const selected = [];
  const maxDepth = Math.max(0, ...(nodes || []).map(n => Array.isArray(n.productCatIds) ? n.productCatIds.length : 0));
  for (let depth = 0; depth < maxDepth && selected.length < max; depth++) {
    for (const node of (nodes || [])) {
      const id = Number(node.productCatIds?.[depth]);
      if (Number.isInteger(id) && !selected.includes(id)) selected.push(id);
      if (selected.length >= max) break;
    }
  }
  return selected;
}

function isShopeePeriodActive(node, nowSeconds = Math.floor(Date.now() / 1000)) {
  const start = node?.periodStartTime == null ? null : Number(node.periodStartTime);
  const end = node?.periodEndTime == null ? null : Number(node.periodEndTime);
  if (Number.isFinite(start) && nowSeconds < start) return false;
  if (Number.isFinite(end) && nowSeconds > end) return false;
  return true;
}

function mergeShopeeDiscoveryProducts(nodes) {
  const products = [];
  const byKey = new Map();
  let duplicatesRejected = 0;
  for (const node of nodes || []) {
    if (node._discoverySource === 'category_seed') continue;
    const key = node.itemId != null ? `item:${node.shopId ?? ''}:${node.itemId}` : `url:${node.productLink || node.offerLink || ''}`;
    const source = node._discoverySource || 'category_seed';
    if (byKey.has(key)) {
      const existing = byKey.get(key);
      existing.discoverySources = [...new Set([...(existing.discoverySources || []), source])];
      duplicatesRejected++;
      continue;
    }
    const copy = { ...node, discoverySources: [source] };
    byKey.set(key, copy);
    products.push(copy);
  }
  return { products, duplicatesRejected };
}

function isShopeeHighCommissionEligible(node, nowSeconds = Math.floor(Date.now() / 1000)) {
  const price = parseShopeeMoney(node?.priceMin) ?? parseShopeeMoney(node?.priceMax);
  const rating = Number(node?.ratingStar);
  return Number(node?.sales) > 0 && Number.isFinite(rating) && rating > 0 && price > 0 && Boolean(node?.imageUrl) && Boolean(node?.productLink) && Boolean(node?.offerLink) && isShopeePeriodActive(node, nowSeconds);
}

function formatShopeePercent(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  return `${Number((number * 100).toFixed(2))}%`;
}

function normalizeShopeeProduct(node) {
  const currentPrice = parseShopeeMoney(node?.priceMin) ?? parseShopeeMoney(node?.priceMax);
  if (!node?.productName || !currentPrice || !node?.productLink) return null;

  return {
    product_name: String(node.productName).trim(),
    current_price: currentPrice,
    old_price: null,
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
    commission_rate: node.commissionRate ?? null,
    seller_commission_rate: node.sellerCommissionRate ?? null,
    shopee_commission_rate: node.shopeeCommissionRate ?? null,
    discount_rate: node.priceDiscountRate ?? null,
    product_cat_ids: Array.isArray(node.productCatIds) ? node.productCatIds : [],
    discoverySources: Array.isArray(node.discoverySources) ? node.discoverySources : [node._discoverySource || 'category_seed'],
    sourceFilter: node._sourceFilter || null,
    isKeySellerFilterApplied: node._discoverySource === 'key_seller',
    raw_node: node
  };
}

function evaluateShopeePriceFloor(product) {
  const currentPrice = product.current_price;
  if (currentPrice < 15) return { status: 'REJECTED', reason: 'Preço abaixo de R$ 15', signals: [] };
  if (currentPrice >= 30) return { status: 'ACCEPTED', reason: 'Preço acima de R$ 30', signals: [] };

  const signals = [];
  if (product.sales >= 500) signals.push('sales_high');
  if (product.rating >= 4.7) signals.push('rating_high');
  if (product.discount_rate >= 20) signals.push('discount_high');
  if (product.commission_rate >= 0.10) signals.push('commission_high');
  if (product.raw_node?.sellerCommissionRate >= 0.07) signals.push('seller_commission_high');
  
  const nameLower = product.product_name.toLowerCase();
  const lixoKeywords = ['capinha', 'película', 'cabo', 'carregador', 'fone de fio', 'suporte', 'adaptador', 'pulseira'];
  const hasLixo = lixoKeywords.some(kw => nameLower.includes(kw));

  if (signals.length >= 2 && !hasLixo) {
    return { status: 'REVIEW', reason: 'Recuperado por Sinais Fortes', signals };
  }
  return { status: 'REJECTED', reason: 'Falta de sinais de qualidade', signals };
}

function applyShopeeQualityGateV4(products, telemetria) {
  if (!telemetria.lista_recuperados) telemetria.lista_recuperados = [];
  if (!telemetria.lista_descartados_pf) telemetria.lista_descartados_pf = [];

  return products.filter(p => {
    const nameLower = p.product_name.toLowerCase();
    const lixoKeywords = ['capinha', 'película', 'cabo', 'carregador', 'fone de fio', 'suporte', 'adaptador', 'pulseira'];
    if (lixoKeywords.some(kw => nameLower.includes(kw))) {
      telemetria.produtos_descartados_lixo_keyword++;
      return false;
    }

    if (p.current_price < 30) {
      telemetria.descartados_price_floor_antigo = (telemetria.descartados_price_floor_antigo || 0) + 1;
    }

    const pf = evaluateShopeePriceFloor(p);
    if (pf.status === 'REJECTED') {
      telemetria.descartados_price_floor_novo = (telemetria.descartados_price_floor_novo || 0) + 1;
      telemetria.lista_descartados_pf.push(p);
      return false;
    }

    if (pf.status === 'REVIEW') {
      telemetria.recuperados_price_floor = (telemetria.recuperados_price_floor || 0) + 1;
      if (pf.signals.includes('rating_high')) telemetria.recuperados_com_rating = (telemetria.recuperados_com_rating || 0) + 1;
      if (pf.signals.includes('sales_high')) telemetria.recuperados_com_sales = (telemetria.recuperados_com_sales || 0) + 1;
      if (pf.signals.includes('discount_high')) telemetria.recuperados_com_desconto = (telemetria.recuperados_com_desconto || 0) + 1;
      if (pf.signals.includes('commission_high') || pf.signals.includes('seller_commission_high')) telemetria.recuperados_com_comissao = (telemetria.recuperados_com_comissao || 0) + 1;
      telemetria.lista_recuperados.push({ ...p, signals: pf.signals });
    }

    const enriched = enrichShopeeOffer(p.raw_node);
    const origin = validateShopeeOrigin(p.original_url, p.product_name, enriched);
    if (origin.qualityGate === 'REJECTED') {
      telemetria.produtos_descartados_internacional++;
      return false;
    }
    return true;
  });
}

function rankShopeeDiscoveryCandidates(products) {
  return products.map(p => ({ ...p, score: calculateScoreV1(p) })).sort((a, b) => b.score - a.score);
}

async function fetchShopeeDiscoveryV4(options = {}) {
  console.log('[Shopee V4] Buscando produtos por comissão...');
  const byCommission = await fetchShopeeProductsByCommission(50, 1);
  console.log('[Shopee V4] Buscando produtos por vendas...');
  const bySales = await fetchShopeeProductsBySales(50, 1);
  console.log('[Shopee V4] Buscando produtos por desconto...');
  const byDiscount = await fetchShopeeProductsByDiscount(50, 1);
  console.log('[Shopee V4] Buscando lojas...');
  const shops = await fetchShopeeShopOffers(20, 1);
  console.log('[Shopee V4] Buscando campanhas...');
  const campaigns = await fetchShopeeCampaignOffers(20, 1);
  console.log('[Shopee V4] Buscando feeds (se disponíveis)...');
  const feeds = await fetchShopeeItemFeedsIfAvailable();

  const allRaw = [...byCommission, ...bySales, ...byDiscount];
  const uniqueNodes = dedupeShopeeProducts(allRaw);
  const normalized = uniqueNodes.map(normalizeShopeeProduct).filter(Boolean);

  return {
    rawCommission: byCommission,
    rawSales: bySales,
    rawDiscount: byDiscount,
    shops,
    campaigns,
    feeds,
    normalized
  };
}

async function runShopeeV4DryRun() {
  console.log('\n[DRY-RUN V4] Iniciando Shopee Discovery V4...\n');
  const fs = require('fs');
  const path = require('path');
  
  const telemetry = {
    retornados_productOfferV2_comissao: 0,
    retornados_productOfferV2_vendas: 0,
    retornados_productOfferV2_desconto: 0,
    retornados_shopOfferV2: 0,
    retornados_campaignOfferV2: 0,
    feeds_disponiveis: false,
    produtos_unicos: 0,
    produtos_descartados_lixo_keyword: 0,
    produtos_descartados_internacional: 0,
    descartados_price_floor_antigo: 0,
    descartados_price_floor_novo: 0,
    recuperados_price_floor: 0,
    recuperados_com_rating: 0,
    recuperados_com_sales: 0,
    recuperados_com_desconto: 0,
    recuperados_com_comissao: 0,
    recuperados_loja_oficial: 0,
    produtos_chegaram_ranking: 0,
    produtos_que_chegariam_ia: 0,
    top_lojas: [],
    top_comissao: [],
    top_desconto: [],
    top_vendas: [],
    lista_recuperados: [],
    lista_descartados_pf: []
  };

  const discovery = await fetchShopeeDiscoveryV4();

  telemetry.retornados_productOfferV2_comissao = discovery.rawCommission.length;
  telemetry.retornados_productOfferV2_vendas = discovery.rawSales.length;
  telemetry.retornados_productOfferV2_desconto = discovery.rawDiscount.length;
  telemetry.retornados_shopOfferV2 = discovery.shops.length;
  telemetry.retornados_campaignOfferV2 = discovery.campaigns.length;
  telemetry.feeds_disponiveis = discovery.feeds !== null;
  telemetry.produtos_unicos = discovery.normalized.length;

  const validProducts = applyShopeeQualityGateV4(discovery.normalized, telemetry);
  const rankedProducts = rankShopeeDiscoveryCandidates(validProducts);
  
  telemetry.produtos_chegaram_ranking = rankedProducts.length;
  const top10 = rankedProducts.slice(0, 10);
  telemetry.produtos_que_chegariam_ia = top10.length;

  telemetry.top_lojas = discovery.shops.slice(0, 20);
  telemetry.top_comissao = rankedProducts.sort((a,b) => (b.commission_rate||0) - (a.commission_rate||0)).slice(0, 20);
  telemetry.top_desconto = rankedProducts.sort((a,b) => (b.discount_rate||0) - (a.discount_rate||0)).slice(0, 20);
  telemetry.top_vendas = rankedProducts.sort((a,b) => (b.sales||0) - (a.sales||0)).slice(0, 20);

  const reportsDir = path.join(__dirname, '../reports');
  if (!fs.existsSync(reportsDir)) fs.mkdirSync(reportsDir);

  fs.writeFileSync(path.join(reportsDir, 'sprint_07.1_shopee_price_floor_summary.json'), JSON.stringify(telemetry, null, 2));
  fs.writeFileSync(path.join(reportsDir, 'sprint_07.1_shopee_price_floor_recuperados.csv'), `name,price,sales,commission,discount,signals\n${telemetry.lista_recuperados.map(p => `"${p.product_name}",${p.current_price},${p.sales||0},${p.commission_rate||0},${p.discount_rate||0},"${(p.signals||[]).join(';')}"`).join('\n')}`);
  fs.writeFileSync(path.join(reportsDir, 'sprint_07.1_shopee_price_floor_descartados.csv'), `name,price,sales,commission,discount\n${telemetry.lista_descartados_pf.map(p => `"${p.product_name}",${p.current_price},${p.sales||0},${p.commission_rate||0},${p.discount_rate||0}`).join('\n')}`);
  
  const mdReport = `
# Sprint 07.1 Shopee Price Floor Inteligente
- Produtos Retornados: ${telemetry.produtos_unicos}
- Produtos Únicos Pré-Filtro: ${telemetry.produtos_unicos}
- Descartados (Price Floor Antigo): ${telemetry.descartados_price_floor_antigo}
- Descartados (Price Floor Novo): ${telemetry.descartados_price_floor_novo}
- Recuperados (Price Floor): ${telemetry.recuperados_price_floor}
- Recuperados com Rating: ${telemetry.recuperados_com_rating}
- Recuperados com Sales: ${telemetry.recuperados_com_sales}
- Recuperados com Desconto: ${telemetry.recuperados_com_desconto}
- Recuperados com Comissão: ${telemetry.recuperados_com_comissao}
- Recuperados Loja Oficial: ${telemetry.recuperados_loja_oficial}
- Descartados (Lixo): ${telemetry.produtos_descartados_lixo_keyword}
- Descartados (Internacional/Loja): ${telemetry.produtos_descartados_internacional}
- Produtos ao Ranking: ${telemetry.produtos_chegaram_ranking}
- Produtos para IA: ${telemetry.produtos_que_chegariam_ia}
`;
  fs.writeFileSync(path.join(reportsDir, 'sprint_07.1_shopee_price_floor.md'), mdReport);

  console.log(mdReport);
  console.log('[DRY-RUN V4] Relatórios salvos em /reports.');
}
