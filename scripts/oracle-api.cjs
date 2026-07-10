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
const GROQ_API_KEY = process.env.GROQ_API_KEY;

function isAuthorized(token) {
  return token === API_KEY;
}

function normalizeShopeeComparableUrl(url) {
  if (!url) return null;
  try {
    const parsed = new URL(url);
    parsed.search = "";
    parsed.hash = "";
    return parsed.toString().replace(/\/$/, "");
  } catch {
    return String(url).trim().replace(/\/$/, "");
  }
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
  const mode = process.env.SCRAPER_MODE || 'LOCAL';
  if (mode === 'LOCAL' && process.platform !== 'win32' && marketplace !== 'Amazon') {
    console.log(`[API] Bloqueado: Tentativa de scraping na Oracle enquanto SCRAPER_MODE=LOCAL`);
    return res.status(403).json({ error: 'Scraping on Oracle is disabled in LOCAL mode. The Notebook is responsible for scraping.' });
  }

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
  const { token, category = 'Todas', limit = 5 } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  try {
    const { runShopeeOfficialPipeline } = require('./oracle-scraper.cjs');
    const result = await runShopeeOfficialPipeline(category, limit);
    return res.json({
      success: true,
      candidates: result?.candidates || [],
      telemetry: result?.telemetry || null
    });
  } catch (err) {
    console.error('[API] Erro em /api/shopee/trends:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/shopee/product', async (req, res) => {
  const { token, productUrl } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  if (!productUrl) {
    return res.status(400).json({ error: 'Missing productUrl param' });
  }

  try {
    const { runShopeeOfficialPipeline, cleanProductUrl } = require('./oracle-scraper.cjs');
    const normalizedTargetUrl = normalizeShopeeComparableUrl(cleanProductUrl(productUrl) || productUrl);
    const itemMatch = String(productUrl).match(/-i\.(\d+)\.(\d+)/i);
    const targetItemId = itemMatch?.[2] || null;
    const { candidates } = await runShopeeOfficialPipeline('Todas', 500);
    const matched = (candidates || []).find((candidate) => {
      const productLink = normalizeShopeeComparableUrl(candidate.productLink);
      const affiliateLink = normalizeShopeeComparableUrl(candidate.affiliateLink);
      const itemId = candidate.marketplaceProductId ? String(candidate.marketplaceProductId) : null;
      return productLink === normalizedTargetUrl || affiliateLink === normalizedTargetUrl || (targetItemId && itemId === targetItemId);
    }) || null;

    return res.json({ success: true, candidate: matched });
  } catch (err) {
    console.error('[API] Erro em /api/shopee/product:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.post('/api/netshoes/trends', async (req, res) => {
  const { token, category = 'oferta', limit = 5 } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  try {
    const { fetchNetshoesProductsFromRakuten } = require('./oracle-scraper.cjs');
    const products = await fetchNetshoesProductsFromRakuten(category, limit);
    return res.json({ success: true, products: products || [] });
  } catch (err) {
    console.error('[API] Erro em /api/netshoes/trends:', err);
    return res.status(500).json({ error: err.message || String(err) });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Micro-API Oracle rodando firme e forte na porta ${PORT}`);
});
