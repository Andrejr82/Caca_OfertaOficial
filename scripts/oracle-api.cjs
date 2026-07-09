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

function detectMarketplaceFromUrl(url) {
  const value = String(url || '').toLowerCase();
  if (value.includes('shopee')) return 'Shopee';
  if (value.includes('amazon')) return 'Amazon';
  if (value.includes('mercadolivre') || value.includes('meli.la')) return 'Mercado Livre';
  return 'Desconhecido';
}


app.post('/api/scrape', async (req, res) => {
  const { url, token } = req.body;

  if (token !== API_KEY) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  const mode = process.env.SCRAPER_MODE || 'LOCAL';
  if (mode === 'LOCAL' && process.platform !== 'win32') {
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

  if (SCRAPFLY_KEYS.length === 0) {
    return res.status(500).json({ error: 'Nenhuma SCRAPFLY_API_KEY configurada na VPS.' });
  }

  const SCRAPFLY_API_KEY = SCRAPFLY_KEYS[Math.floor(Math.random() * SCRAPFLY_KEYS.length)];

  try {
    console.log(`[API] Solicitando HTML ao Scrapfly usando chave terminada em ...${SCRAPFLY_API_KEY.slice(-4)}`);
    const scrapflyUrl = `https://api.scrapfly.io/scrape?key=${SCRAPFLY_API_KEY}&url=${encodeURIComponent(url)}&asp=true&render_js=true&country=br`;

    const response = await axios.get(scrapflyUrl, { timeout: 60000 });
    
    htmlResult = response.data.result.content;
    if (!htmlResult) {
      throw new Error("Falha ao raspar a página. Retorno vazio do Scrapfly.");
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

    const marketplace = detectMarketplaceFromUrl(url);
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
    console.error("[API] Erro na raspagem:", err);
    return res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Micro-API Oracle rodando firme e forte na porta ${PORT}`);
});
