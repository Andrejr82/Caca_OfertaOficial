const os = require('os');
os.freemem = () => 4 * 1024 * 1024 * 1024; // 4 GB
os.totalmem = () => 4 * 1024 * 1024 * 1024; // 4 GB
const express = require('express');
const axios = require('axios');
require('dotenv').config({ path: '.env.local' });
const {
  normalizeProductContentForLLM,
  createLLMInputFromNormalizedContent
} = require('../src/lib/token-optimization.js');

const app = express();
app.use(express.json());

const PORT = 3002;
const API_KEY = process.env.ORACLE_API_KEY;
const LEGACY_ENDPOINT_DISABLED = 'LEGACY_ENDPOINT_DISABLED: Oracle API is a technical gateway; Discovery belongs to the Oracle Worker';

function isAuthorized(token) {
  return token === API_KEY;
}

function detectMarketplaceFromUrl(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('shopee')) return 'Shopee';
  if (value.includes('amazon')) return 'Amazon';
  if (value.includes('mercadolivre') || value.includes('meli.la')) return 'Mercado Livre';
  return 'Desconhecido';
}


app.post('/api/scrape', async (req, res) => {
  const { url, token } = req.body;

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  const marketplace = detectMarketplaceFromUrl(url);
  if (!url) {
    return res.status(400).json({ error: 'Missing url param' });
  }

  console.log(`[API] Recebido pedido para raspar: ${url}`);
  let htmlResult = '';
  let textResult = '';
  let metaResult = {};

  const envKeys = process.env.SCRAPFLY_API_KEYS || process.env.SCRAPFLY_API_KEY || '';
  const SCRAPFLY_KEYS = envKeys.split(',').map(k => k.trim()).filter(Boolean);

  if (marketplace !== 'Amazon' && SCRAPFLY_KEYS.length === 0) {
    return res.status(500).json({ error: 'Nenhuma SCRAPFLY_API_KEY configurada na VPS.' });
  }

  const SCRAPFLY_API_KEY = SCRAPFLY_KEYS.length > 0
    ? SCRAPFLY_KEYS[Math.floor(Math.random() * SCRAPFLY_KEYS.length)]
    : null;

  try {
    if (marketplace === 'Amazon') {
      console.log('[API] Solicitando HTML da Amazon via Scrape.do.');
      const { fetchMercadoLivreViaScrapedo } = require('./oracle-scraper.cjs');
      htmlResult = await fetchMercadoLivreViaScrapedo(url);
    } else {
      console.log('[API] Solicitando HTML ao Scrapfly.');
      const scrapflyUrl = `https://api.scrapfly.io/scrape?key=${SCRAPFLY_API_KEY}&url=${encodeURIComponent(url)}&asp=true&render_js=true&country=br`;
      const response = await axios.get(scrapflyUrl, { timeout: 60000 });
      htmlResult = response.data.result.content;
    }
    if (!htmlResult) {
      throw new Error("Falha ao raspar a página. Retorno vazio do provider.");
    }

    const cheerio = require('cheerio');
    const $ = cheerio.load(htmlResult);
    $('script, style, noscript, svg').remove();
    $('img').each((i, el) => {
      let src = '';
      const dyn = $(el).attr('data-a-dynamic-image');
      if (dyn) {
        try { src = Object.keys(JSON.parse(dyn))[0]; } catch(e){}
      }
      if (!src) src = $(el).attr('data-src');
      if (!src) {
        const srcset = $(el).attr('srcset');
        if (srcset) src = srcset.split(' ')[0];
      }
      if (!src) src = $(el).attr('src');
      
      if (src && !src.startsWith('data:image') && !src.includes('base64') && !src.includes('svg') && !src.includes('placeholder')) {
        $(el).replaceWith(` [IMG:${src}] `);
      } else {
        $(el).remove();
      }
    });
    textResult = $('body').text().replace(/\s+/g, ' ').trim();

    metaResult.title = $('title').text() || '';
    metaResult.ogImage = $('meta[property="og:image"]').attr('content') || '';

    const normalized = normalizeProductContentForLLM({
      marketplace,
      html: htmlResult,
      text: textResult,
      url
    });
    const normalizedPayload = JSON.parse(createLLMInputFromNormalizedContent(normalized, { fallbackText: textResult }));

    console.log(`[API] Raspagem concluída. Retornando conteúdo normalizado para extração no Vercel...`);

    return res.json({
      success: true,
      data: {
        html: htmlResult,
        text: textResult,
        extract: {
          title: normalized.title,
          price: normalized.price,
          image: normalized.imageUrl,
          normalized: normalizedPayload
        },
        metadata: metaResult
      }
    });

  } catch (err) {
    console.error(`[API] Erro na raspagem: ${err.message || String(err)} | HTTP ${err.response?.status || 'n/a'}`);
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/shopee/trends', async (req, res) => {
  const { token } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }
  return res.status(410).json({ success: false, code: 'LEGACY_ENDPOINT_DISABLED', error: LEGACY_ENDPOINT_DISABLED });
});

app.post('/api/shopee/product', async (req, res) => {
  const { token, shopId, itemId, keyword } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }
  if (!/^\d+$/.test(String(shopId || '')) || !/^\d+$/.test(String(itemId || ''))) {
    return res.status(400).json({ ok: false, code: 'INVALID_SHOPEE_PRODUCT_ID', message: 'shopId e itemId numéricos são obrigatórios.' });
  }
  if (keyword != null && (typeof keyword !== 'string' || keyword.trim().length > 100)) {
    return res.status(400).json({ ok: false, code: 'INVALID_SHOPEE_KEYWORD', message: 'keyword deve ter no máximo 100 caracteres.' });
  }
  try {
    const { lookupShopeeAffiliateProduct } = require('./oracle-scraper.cjs');
    const product = await lookupShopeeAffiliateProduct(shopId, itemId, keyword || '');
    if (!product) {
      return res.status(404).json({ ok: false, code: 'SHOPEE_PRODUCT_NOT_FOUND', message: 'A API oficial da Shopee não confirmou este SKU.' });
    }
    return res.json({ ok: true, data: product });
  } catch (error) {
    console.error(`[API] Consulta Shopee por SKU falhou: ${error.message || String(error)}`);
    return res.status(502).json({ ok: false, code: 'SHOPEE_PRODUCT_LOOKUP_FAILED', message: 'A Oracle não concluiu a consulta oficial Shopee.' });
  }
});

app.post('/api/netshoes/trends', async (req, res) => {
  const { token } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }
  return res.status(410).json({ success: false, code: 'LEGACY_ENDPOINT_DISABLED', error: LEGACY_ENDPOINT_DISABLED });
});

app.post('/api/amazon/trends', async (req, res) => {
  console.log('[API] Rota /api/amazon/trends desativada (Legado Amazon)');
  return res.status(403).json({ error: 'Amazon Discovery API desativada.' });
});

app.post('/api/manual/trends', async (req, res) => {
  const { token, tenantId, category, marketplaces, limit } = req.body || {};
  if (!isAuthorized(token)) {
    return res.status(401).json({ ok: false, code: 'UNAUTHORIZED', message: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }
  if (!tenantId || !Array.isArray(marketplaces) || marketplaces.length === 0) {
    return res.status(400).json({ ok: false, code: 'INVALID_MANUAL_DISCOVERY_REQUEST', message: 'tenantId e ao menos um marketplace são obrigatórios.' });
  }
  try {
    const { runManualMarketplaceScenarioRecording } = require('./oracle-scraper.cjs');
    const result = await runManualMarketplaceScenarioRecording({ tenantId, category, marketplaces, limit });
    return res.json({ ok: true, result, message: `Busca manual concluída: ${result.offerIds.length} oferta(s) persistida(s) e enviada(s) à Official AI.` });
  } catch (error) {
    console.error(`[API] Busca manual falhou: ${error.message || String(error)}`);
    return res.status(502).json({ ok: false, code: 'MANUAL_DISCOVERY_FAILED', message: error.message || 'Falha na busca manual.' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Micro-API Oracle rodando firme e forte na porta ${PORT}`);
});
