'use strict';

process.env.ORACLE_SCRAPER_DISABLE_AUTORUN = '1';
require('dotenv').config({ path: '.env.local' });

const axios = require('axios');
const { normalizeProductContentForLLM, createLLMInputFromNormalizedContent } = require('../src/lib/token-optimization.js');
const {
  fetchShopeeProductsFromOfficialApi,
  fetchNetshoesProductsFromRakuten,
} = require('./oracle-scraper.cjs');

const ORACLE_URL = process.env.ORACLE_REMOTE_URL || 'http://193.122.242.178:3002/api/scrape';
const ORACLE_TOKEN = process.env.ORACLE_API_KEY || '';
const DEFAULT_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (compatible; TokenOptimizationValidator/1.0; +https://cacaoferta.com.br)',
  'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8,en;q=0.7',
};

function logValidation(marketplace, source, tokenOptimized) {
  const safeSource = String(source || 'unknown');
  const safeOpt = tokenOptimized === true ? 'true' : 'false';
  console.log(`[Token Validation] ${marketplace} productionFlow=true source=${safeSource} tokenOptimized=${safeOpt}`);
}

const DEFAULT_URLS = {
  // URL via env VALIDATE_URLS_AMAZON ou fallback Echo Pop (produto estável Amazon BR)
  amazon: [
    process.env.VALIDATE_URL_AMAZON_OVERRIDE ||
    'https://www.amazon.com.br/dp/B07PXGQC1Q',
  ],
  mercadolivre: [
    // URL de listagem ML (funciona via scrape.do; /p/ produto descontinuado retorna 404)
    process.env.VALIDATE_URL_ML_OVERRIDE || 'https://lista.mercadolivre.com.br/echo-dot',
  ],
  // Magalu: ignorada nesta validação
  netshoes: [
    'https://www.netshoes.com.br/tenis-nike-revolution-7-masculino-preto+branco-JD8-6343-026',
  ],
};

const DEFAULT_SHOPEE_QUERIES = ['tenis corrida'];
const DEFAULT_NETSHOES_QUERIES = ['tenis nike'];

function parseList(value, fallback) {
  if (!value) return fallback;
  return String(value).split(',').map((item) => item.trim()).filter(Boolean);
}

async function scrapeAndNormalizeUrl(marketplace, url) {
  let payload = null;

  // Mercado Livre: usar scrape.do com super=true (ML_PROVIDER=scrapedo)
  if (marketplace === 'Mercado Livre' && process.env.SCRAPEDO_API_KEY) {
    const scrapeDoUrl = `https://api.scrape.do?token=${process.env.SCRAPEDO_API_KEY}&url=${encodeURIComponent(url)}&super=true`;
    const r = await axios.get(scrapeDoUrl, { timeout: 90000, validateStatus: () => true });
    const html = typeof r.data === 'string' ? r.data : '';
    if (r.status === 200 && html.length > 5000) {
      payload = { success: true, data: { html, text: '' } };
    } else {
      console.log('[ML scrape.do] HTTP:', r.status, '| len:', html.length);
    }
  }

  if (!payload && ORACLE_TOKEN) {
    const response = await axios.post(ORACLE_URL, { url, token: ORACLE_TOKEN }, {
      timeout: 120000,
      validateStatus: () => true,
    });
    if (response.status === 200 && response.data?.success && (response.data?.data?.html || response.data?.data?.text)) {
      payload = response.data;
    }
  }

  if (!payload) {
    const directResponse = await axios.get(url, {
      timeout: 120000,
      headers: DEFAULT_HEADERS,
      validateStatus: () => true,
    });
    if (directResponse.status !== 200) {
      throw new Error(`Oracle indisponivel e fetch direto HTTP ${directResponse.status}`);
    }
    payload = {
      success: true,
      data: {
        html: typeof directResponse.data === 'string' ? directResponse.data : String(directResponse.data || ''),
        text: '',
      },
    };
  }

  const normalized = normalizeProductContentForLLM({
    marketplace,
    html: payload.data.html,
    text: payload.data.text,
    url,
  });
  logValidation(marketplace, normalized.source, normalized.tokenOptimized);
  return {
    marketplace,
    input: url,
    normalized,
    llmPayload: JSON.parse(createLLMInputFromNormalizedContent(normalized, {
      fallbackText: payload.data.text || payload.data.html || '',
    })),
  };
}

async function captureValidation(label, runner) {
  try {
    return await runner();
  } catch (error) {
    return {
      marketplace: label,
      error: error.message,
    };
  }
}

async function validateShopee(queries) {
  const results = [];
  for (const query of queries) {
    // Shopee: somente API/GraphQL oficial — sem fallback HTML
    const products = await fetchShopeeProductsFromOfficialApi(query, 5);
    const sample = Array.isArray(products) ? products.slice(0, 3) : [];
    const samples = sample.map((product) => {
      const normalized = normalizeProductContentForLLM({
        marketplace: 'Shopee',
        product,
        url: product.original_url,
      });
      logValidation('Shopee', normalized.source, normalized.tokenOptimized);
      return { normalized };
    });
    results.push({
      marketplace: 'Shopee',
      input: query,
      source: 'api',
      total: Array.isArray(products) ? products.length : 0,
      samples,
    });
  }
  return results;
}

async function validateNetshoesOfficial(queries) {
  const results = [];
  for (const query of queries) {
    // Netshoes: somente Rakuten API oficial — credenciais de .env.local, sem inventar desconto
    const products = await fetchNetshoesProductsFromRakuten(query, 5, 1);
    if (products.length === 0) {
      console.log('[Token Validation] Netshoes productionFlow=true source=api tokenOptimized=false — Rakuten retornou 0 produtos (credenciais ausentes ou 401)');
    }
    const sample = Array.isArray(products) ? products.slice(0, 3) : [];
    const samples = sample.map((product) => {
      const normalized = normalizeProductContentForLLM({
        marketplace: 'Netshoes',
        product,
        url: product.original_url,
      });
      logValidation('Netshoes', normalized.source, normalized.tokenOptimized);
      return { normalized };
    });
    results.push({
      marketplace: 'Netshoes API',
      input: query,
      source: 'api',
      total: Array.isArray(products) ? products.length : 0,
      samples,
    });
  }
  return results;
}

function summarizeNormalized(normalized) {
  if (!normalized) return { title: false, price: false, image: false, url: false, source: 'unknown', tokenOptimized: false };
  return {
    title: Boolean(normalized.title),
    price: normalized.price != null,
    image: Boolean(normalized.imageUrl),
    url: Boolean(normalized.url),
    source: normalized.source || 'unknown',
    tokenOptimized: normalized.tokenOptimized === true,
  };
}

async function main() {
  const urls = {
    amazon: parseList(process.env.VALIDATE_URLS_AMAZON, DEFAULT_URLS.amazon),
    mercadolivre: parseList(process.env.VALIDATE_URLS_ML, DEFAULT_URLS.mercadolivre),
    // Magalu: ignorada nesta validação (abortado conforme escopo)
    netshoes: parseList(process.env.VALIDATE_URLS_NETSHOES, DEFAULT_URLS.netshoes),
  };
  const shopeeQueries = parseList(process.env.VALIDATE_QUERIES_SHOPEE, DEFAULT_SHOPEE_QUERIES);
  const netshoesQueries = parseList(process.env.VALIDATE_QUERIES_NETSHOES, DEFAULT_NETSHOES_QUERIES);

  const report = [];

  // Amazon: JSON-LD > CSS selectors > cleaned_html > LLM
  for (const url of urls.amazon) report.push(await captureValidation('Amazon', () => scrapeAndNormalizeUrl('Amazon', url)));
  // Mercado Livre: CSS selectors > JSON-LD > cleaned_html > LLM
  for (const url of urls.mercadolivre) report.push(await captureValidation('Mercado Livre', () => scrapeAndNormalizeUrl('Mercado Livre', url)));
  // Magalu: IGNORADA nesta rodada
  // Shopee: GraphQL oficial
  report.push(await captureValidation('Shopee', () => validateShopee(shopeeQueries)));
  // Netshoes: Rakuten API
  report.push(await captureValidation('Netshoes API', () => validateNetshoesOfficial(netshoesQueries)));

  // Resumo estruturado sem secrets
  const rows = [];
  for (const r of report) {
    if (!r) continue;
    if (r.error) {
      rows.push({ marketplace: r.marketplace, extraiu: false, error: r.error });
      continue;
    }
    // Shopee/Netshoes retornam array de queries
    if (Array.isArray(r)) {
      for (const item of r) {
        const first = item.samples?.[0]?.normalized || null;
        rows.push({
          marketplace: item.marketplace,
          input: item.input,
          extraiu: item.total > 0,
          total: item.total,
          ...summarizeNormalized(first),
        });
      }
      continue;
    }
    rows.push({
      marketplace: r.marketplace,
      input: r.input,
      extraiu: Boolean(r.normalized?.title || r.normalized?.price),
      ...summarizeNormalized(r.normalized),
    });
  }

  console.log('\n=== RESULTADO DA VALIDAÇÃO TOKEN OPTIMIZATION ===');
  console.log(JSON.stringify(rows, null, 2));
}

main().catch((error) => {
  console.error('[validate-token-optimization] erro:', error.message);
  process.exitCode = 1;
});
