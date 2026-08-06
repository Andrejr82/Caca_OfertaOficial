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
const { createClient } = require('@supabase/supabase-js');

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { 
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: require('ws') }
  }
);

const fs = require('fs');
const util = require('util');
const logFile = fs.createWriteStream('oracle-debug.log', { flags: 'a' });
const logStdout = process.stdout;

console.log = function() {
  logFile.write(util.format.apply(null, arguments) + '\n');
  logStdout.write(util.format.apply(null, arguments) + '\n');
};
console.error = function() {
  logFile.write(util.format.apply(null, arguments) + '\n');
  process.stderr.write(util.format.apply(null, arguments) + '\n');
};

const app = express();
app.use(express.json());

// CORS para extensão Chrome
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// Rota de diagnóstico
app.get('/ping', (req, res) => {
  const msg = '[PING] Oracle v2 respondendo - ' + new Date().toISOString();
  console.log(msg);
  res.json({ ok: true, version: 'oracle-v2', ts: Date.now() });
});

const { startTelegramAutomation } = require('./telegram-auto-publisher.cjs');
const { startFacebookAutomation } = require('./facebook-auto-publisher.cjs');
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

app.post('/api/shopee/dub-video', async (req, res) => {
  const { token, videoUrl, title, price, originalUrl, imageUrl, tenantId } = req.body || {};

  if (!isAuthorized(token)) {
    return res.status(401).json({ error: 'Unauthorized. Verifique a sua ORACLE_API_KEY.' });
  }

  if (!videoUrl || !title || !originalUrl || !tenantId) {
    return res.status(400).json({ error: 'Faltam parâmetros obrigatórios (videoUrl, title, originalUrl, tenantId).' });
  }

  if (price <= 0) {
    return res.status(400).json({ error: 'O preço capturado foi R$ 0,00. A extração falhou. Tente novamente.' });
  }

  try {
    // 1. Verifica se a oferta já existe no banco
    let offerId = null;
    let productName = title;
    
    // Busca oferta pela URL original
    const { data: existingOffers } = await supabaseAdmin
      .from('offers')
      .select('id, product_name')
      .eq('original_url', originalUrl)
      .eq('user_id', tenantId)
      .limit(1);
      
    if (existingOffers && existingOffers.length > 0) {
      offerId = existingOffers[0].id;
      productName = existingOffers[0].product_name || title;
      console.log(`[Oracle Dubber] Oferta encontrada no banco: ${offerId}`);
    } else {
      // Cria a oferta automaticamente (Fluxo Magalu)
      console.log(`[Oracle Dubber] Oferta não encontrada. Criando nova oferta no banco...`);
      const { data: newOffer, error: offerError } = await supabaseAdmin
        .from('offers')
        .insert({
          user_id: tenantId,
          product_name: title,
          original_url: originalUrl,
          image_url: imageUrl || null,
          current_price: parseFloat(String(price || '').replace(/[^0-9,.]/g, '').replace(',', '.')) || 0,
          platform: 'Shopee',
          status: 'pending_manual_review'
        })
        .select('id')
        .single();
        
      if (offerError || !newOffer) {
        throw new Error(`Erro ao criar oferta no banco: ${offerError?.message}`);
      }
      offerId = newOffer.id;
      console.log(`[Oracle Dubber] Nova oferta criada: ${offerId}`);
    }
    console.log(`[DEBUG] O valor final de offerId antes de seguir:`, offerId);

    if (!offerId) {
      throw new Error(`CRÍTICO: offerId ficou ${offerId} após checar ou criar a oferta! A coluna id existe na tabela offers?`);
    }

    // 2. Dubla o vídeo localmente
    const { processShopeeVideoDubbing } = require('./video-dubber.cjs');
    const result = await processShopeeVideoDubbing(videoUrl, title, price || 'Não informado');

    if (!result.success) {
      return res.status(500).json({ error: result.error });
    }

    // 3. Faz o upload para o Supabase Storage
    const fs = require('fs');
    const path = require('path');
    const videoBuffer = fs.readFileSync(result.finalVideoPath);
    
    const jobId = require('crypto').randomUUID();
    const storagePath = `${tenantId}/${jobId}.mp4`;
    
    console.log(`[Oracle Dubber] Fazendo upload do vídeo para o Storage...`);
    const { error: uploadError } = await supabaseAdmin.storage
      .from('videos')
      .upload(storagePath, videoBuffer, { contentType: 'video/mp4', upsert: true });
      
    if (uploadError) {
      throw new Error(`Erro no upload para o Supabase: ${uploadError.message}`);
    }
    
    const { data: publicData } = supabaseAdmin.storage.from('videos').getPublicUrl(storagePath);
    const uploadedVideoUrl = publicData.publicUrl;

    // 3b. (Removido) Não sobrescrever mais a image_url com video_url. 
    // A image_url real já foi extraída via extensão.

    // 4. Cria o Video Job
    console.log(`[Oracle Dubber] Criando Video Job...`);
    const { error: jobError } = await supabaseAdmin
      .from('video_jobs')
      .insert({
        id: jobId,
        user_id: tenantId,
        offer_id: offerId,
        status: 'ready',
        stage: 'ready_for_review',
        script: result.copy || '',
        video_url: uploadedVideoUrl,
        metadata: {
          source: 'oracle-extension',
          prompt: result.copy
        },
        completed_at: new Date().toISOString()
      });
      
    if (jobError) {
      throw new Error(`Erro ao criar video_job: ${jobError.message}`);
    }
    
    // 5. Cria links e posts (rascunhos) para Facebook e Instagram
    console.log(`[Oracle Dubber] Criando drafts para Facebook e Instagram...`);
    const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://caca-oferta-oficial.vercel.app';
    const channels = [
      { name: 'facebook', prefix: 'fb_' },
      { name: 'instagram', prefix: 'ig_' }
    ];
    
    for (const channel of channels) {
      const subId = `${channel.prefix}${offerId}`;
      const trackedUrl = `${baseUrl.replace(/\/$/, '')}/go/${subId}`;
      
      const { data: link, error: linkError } = await supabaseAdmin
        .from('affiliate_links')
        .upsert({ 
          user_id: tenantId, 
          offer_id: offerId, 
          channel: channel.name, 
          original_url: originalUrl, 
          tracked_url: trackedUrl, 
          sub_id: subId 
        }, { onConflict: 'offer_id,channel' })
        .select('id')
        .single();
        
      if (!linkError && link) {
        const priceNum = parseFloat(String(price || '').replace(/[^0-9,.]/g, '').replace(',', '.'));
        const priceStr = priceNum && priceNum > 0 ? `R$ ${priceNum.toFixed(2).replace('.', ',')}` : null;
        
        const hook = priceStr ? `✨ Encontramos este por ${priceStr}` : `✨ Achado incrível na Shopee`;
        
        let finalCopy;
        if (channel.name === 'facebook') {
          finalCopy = [
            hook,
            '',
            `🛍️ ${productName}`,
            '',
            `🧴 Achado na Shopee`,
            '',
            priceStr ? `💰 ${priceStr}` : `💰 Consulte o preço atual no link!`,
            '',
            `👉 Link de compra no primeiro comentário! 👇`
          ].filter(line => line !== null).join('\n');
        } else {
          finalCopy = [
            hook,
            '',
            `Uma opção para sua rotina: **${productName}**.`,
            '',
            priceStr ? `💰 **Apenas ${priceStr}**` : `💰 **Consulte no site**`,
            '',
            `🔎 **Link na bio ou nos Stories para consultar a oferta.** 👇`,
            '',
            `#oferta #shopee`
          ].filter(line => line !== null).join('\n');
        }
        
        const { error: postError } = await supabaseAdmin
          .from('posts')
          .insert({ 
            user_id: tenantId, 
            offer_id: offerId, 
            affiliate_link_id: link.id, 
            channel: channel.name, 
            content: finalCopy, 
            status: 'draft' 
          });
        
        if (postError) {
          console.error(`[Oracle Dubber] Falha ao criar draft ${channel.name}: ${postError.message}`);
        } else {
          console.log(`[Oracle Dubber] Draft ${channel.name} criado com sucesso!`);
        }
      }
    }
    
    // 6. Apaga o arquivo local
    try {
      fs.unlinkSync(result.finalVideoPath);
      console.log(`[Oracle Dubber] Arquivo temporário local apagado.`);
    } catch(e) {
      console.warn(`[Oracle Dubber] Não foi possível apagar arquivo temporário: ${e.message}`);
    }

    const payload = {
      success: true,
      message: 'Vídeo dublado e salvo no Painel com sucesso',
      data: {
        jobId,
        videoUrl: uploadedVideoUrl,
        offerId
      }
    };
    console.log(`[Oracle Dubber] Respondendo para a extensão:`, payload);
    return res.json(payload);
  } catch (error) {
    console.error(`[API] Erro no endpoint dub-video: ${error.message}`);
    return res.status(500).json({ error: 'Erro interno ao processar a dublagem e salvar no banco' });
  }
});

app.listen(PORT, () => {
  console.log(`🚀 Micro-API Oracle rodando firme e forte na porta ${PORT}`);
  
  // Inicia o motor de disparo do Telegram
  startTelegramAutomation(60000); // Roda a cada 60s
  
  // Inicia o motor de disparo do Facebook
  startFacebookAutomation(90000); // Roda a cada 90s
});
