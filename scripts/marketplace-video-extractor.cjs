/**
 * scripts/marketplace-video-extractor.cjs
 * 
 * Módulo unificado para extração automatizada de vídeos dos 3 marketplaces:
 * - Amazon (global.fetch + regex m3u8/mp4 em /dp/ASIN)
 * - Mercado Livre (API oficial OAuth + items?ids + refresh automático)
 * - Shopee (shopee-video-collector.cjs + video-parser.js da extensão via Playwright)
 */

const path = require('path');
const fs = require('fs');

const ML_API_ROOT = 'https://api.mercadolibre.com';
let cachedMlToken = null;
let cachedMlTokenExpiresAt = 0;

/**
 * 1. AMAZON VIDEO EXTRACTOR
 */
async function extractAmazonVideo(urlOrAsin, { timeoutMs = 15000 } = {}) {
  try {
    let asin = null;
    const input = String(urlOrAsin || '').trim();

    // 1. Tentar extrair ASIN de URLs
    const urlMatch = input.match(/(?:dp\/|gp\/product\/|d\/|\/)([A-Z0-9]{10})(?:[/?#]|$)/i);
    if (urlMatch) {
      asin = urlMatch[1].toUpperCase();
    } else if (/^[A-Z0-9]{10}$/i.test(input)) {
      asin = input.toUpperCase();
    }

    if (!asin) {
      return { found: false, reason: 'INVALID_ASIN' };
    }

    const targetUrl = `https://www.amazon.com.br/dp/${asin}`;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    const res = await fetch(targetUrl, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
        'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
        'Accept-Language': 'pt-BR,pt;q=0.9,en-US;q=0.8',
        'Cache-Control': 'no-cache'
      },
      signal: controller.signal
    }).finally(() => clearTimeout(timeout));

    if (!res.ok) {
      return { found: false, reason: `HTTP_${res.status}` };
    }

    const html = await res.text();
    const decoded = html.replace(/&quot;/g, '"');

    // HLS streaming (preferido)
    const hlsMatches = [...decoded.matchAll(/https:\/\/m\.media-amazon\.com\/images\/S\/vse-vms-transcoding-artifact-us-east-1-prod\/([a-f0-9-]{36})\/(?:default\.jobtemplate\.hls\.m3u8|default\.vertical\.jobtemplate\.hls\.m3u8)/gi)];
    // MP4 direto (fallback)
    const mp4Matches = [...decoded.matchAll(/https:\/\/m\.media-amazon\.com\/images\/S\/vse-vms-transcoding-artifact-us-east-1-prod\/([a-f0-9-]{36})\/videopreview\.jobtemplate\.mp4\.default\.mp4/gi)];

    if (hlsMatches.length > 0) {
      return {
        found: true,
        videoUrl: hlsMatches[0][0],
        videoType: 'hls',
        source: 'amazon_direct_hls',
        uuid: hlsMatches[0][1],
        totalFound: hlsMatches.length + mp4Matches.length
      };
    }

    if (mp4Matches.length > 0) {
      return {
        found: true,
        videoUrl: mp4Matches[0][0],
        videoType: 'mp4',
        source: 'amazon_direct_mp4',
        uuid: mp4Matches[0][1],
        totalFound: mp4Matches.length
      };
    }

    return { found: false, reason: 'NO_VIDEO_IN_PAGE' };
  } catch (err) {
    return { found: false, reason: err.message };
  }
}

function ensureEnvLoaded() {
  if (process.env.MERCADO_LIVRE_CLIENT_ID || process.env.MERCADO_LIVRE_APP_ID) return;
  const envPath = path.resolve(process.cwd(), '.env.local');
  if (fs.existsSync(envPath)) {
    const lines = fs.readFileSync(envPath, 'utf8').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const idx = trimmed.indexOf('=');
      if (idx !== -1) {
        const key = trimmed.slice(0, idx).trim();
        let val = trimmed.slice(idx + 1).trim();
        if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
          val = val.slice(1, -1);
        }
        if (!process.env[key]) process.env[key] = val;
      }
    }
  }
}

/**
 * 2. MERCADO LIVRE VIDEO EXTRACTOR
 */
async function getMercadoLivreToken({ env = process.env } = {}) {
  ensureEnvLoaded();
  const now = Date.now();
  if (cachedMlToken && cachedMlTokenExpiresAt > now + 60000) {
    return cachedMlToken;
  }

  const clientId = env.MERCADO_LIVRE_APP_ID || env.MERCADO_LIVRE_CLIENT_ID;
  const clientSecret = env.MERCADO_LIVRE_CLIENT_SECRET;
  const refreshToken = env.MERCADO_LIVRE_REFRESH_TOKEN;

  if (!clientId || !clientSecret || !refreshToken) {
    if (env.MERCADO_LIVRE_ACCESS_TOKEN) return env.MERCADO_LIVRE_ACCESS_TOKEN;
    throw new Error('Credenciais OAuth do Mercado Livre ausentes no ambiente');
  }

  const res = await fetch(`${ML_API_ROOT}/oauth/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'refresh_token',
      client_id: clientId,
      client_secret: clientSecret,
      refresh_token: refreshToken
    }).toString()
  });

  const data = await res.json();
  if (!res.ok || !data.access_token) {
    if (env.MERCADO_LIVRE_ACCESS_TOKEN) return env.MERCADO_LIVRE_ACCESS_TOKEN;
    throw new Error(`Falha ao renovar token ML: HTTP ${res.status}`);
  }

  cachedMlToken = data.access_token;
  cachedMlTokenExpiresAt = Date.now() + (Number(data.expires_in || 21600) * 1000);
  return cachedMlToken;
}

async function extractMercadoLivreVideo(itemIdOrUrl, { timeoutMs = 15000, env = process.env } = {}) {
  try {
    const input = String(itemIdOrUrl || '').trim();
    const isCatalog = input.includes('/p/MLB') || /MLB\d{6,8}(?:[/?#]|$)/i.test(input);
    const match = input.match(/MLB-?(\d+)/i);
    if (!match) return { found: false, reason: 'INVALID_ML_ID' };

    const mlId = 'MLB' + match[1];
    const token = await getMercadoLivreToken({ env });
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);

    let videoId = null;

    if (isCatalog) {
      // Catálogo /products/MLB...
      const res = await fetch(`${ML_API_ROOT}/products/${mlId}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const prodData = await res.json();
        videoId = prodData.video_id;
      }
    } else {
      // Item regular /items?ids=MLB...
      const res = await fetch(`${ML_API_ROOT}/items?ids=${mlId}&attributes=id,title,video_id,status`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
        signal: controller.signal
      }).finally(() => clearTimeout(timeout));

      if (res.ok) {
        const data = await res.json();
        const item = Array.isArray(data) ? data[0]?.body : data;
        videoId = item?.video_id;
      }
    }

    if (!videoId) {
      return { found: false, reason: 'NO_VIDEO_ID' };
    }

    const normVideoId = String(videoId).trim();
    if (normVideoId.length === 11) {
      return {
        found: true,
        videoUrl: `https://www.youtube.com/watch?v=${normVideoId}`,
        videoType: 'youtube',
        videoId: normVideoId,
        source: 'mercadolivre_youtube'
      };
    }

    return {
      found: true,
      videoUrl: `https://api.mercadolibre.com/videos/${normVideoId}`,
      videoType: 'ml_native',
      videoId: normVideoId,
      source: 'mercadolivre_native'
    };
  } catch (err) {
    return { found: false, reason: err.message };
  }
}

/**
 * 3. SHOPEE VIDEO EXTRACTOR
 */
async function extractShopeeVideo(offerOrUrl, { timeoutMs = 30000 } = {}) {
  try {
    let shopId = null;
    let itemId = null;
    let canonicalUrl = null;

    if (typeof offerOrUrl === 'string') {
      canonicalUrl = offerOrUrl;
      const productMatch = offerOrUrl.match(/\/product\/(\d+)\/(\d+)/i) 
        || offerOrUrl.match(/-i\.(\d+)\.(\d+)/i)
        || offerOrUrl.match(/\.(\d+)\.(\d+)/);
      if (productMatch) {
        shopId = productMatch[1];
        itemId = productMatch[2];
      }
    } else {
      shopId = offerOrUrl.shopId || offerOrUrl.shop_id || offerOrUrl.marketplaceMetrics?.shopId;
      itemId = offerOrUrl.itemId || offerOrUrl.item_id || offerOrUrl.sourceItemId || offerOrUrl.marketplaceMetrics?.itemId;
      canonicalUrl = offerOrUrl.canonicalUrl || offerOrUrl.sourceUrl || offerOrUrl.product_url || offerOrUrl.offerLink;
    }

    if (!shopId || !itemId) {
      return { found: false, reason: 'MISSING_SHOP_OR_ITEM_ID' };
    }

    if (!canonicalUrl) {
      canonicalUrl = `https://shopee.com.br/product/${shopId}/${itemId}`;
    }

    const { collectShopeeProductVideo } = require(path.resolve(__dirname, 'shopee-video-collector.cjs'));
    const result = await collectShopeeProductVideo({
      shopId,
      itemId,
      canonicalUrl,
      browserFallback: true
    });

    if (result.status === 'found' && result.videoUrl) {
      return {
        found: true,
        videoUrl: result.videoUrl,
        videoType: 'mp4',
        source: result.source || 'shopee_collector',
        shopId,
        itemId
      };
    }

    return {
      found: false,
      reason: result.failureReason || result.status || 'NO_VIDEO'
    };
  } catch (err) {
    return { found: false, reason: err.message };
  }
}

/**
 * 4. UNIFIED EXTRACTOR
 */
async function extractProductVideo({ marketplace, offer, url, timeoutMs = 25000 } = {}) {
  const normMarketplace = String(marketplace || offer?.marketplace || '').toLowerCase().trim();
  const targetUrl = url || offer?.sourceUrl || offer?.product_url || offer?.offerLink || offer?.productLink || '';

  if (normMarketplace.includes('amazon')) {
    const candidate = targetUrl || offer?.marketplaceMetrics?.asin || offer?.sourceItemId;
    return extractAmazonVideo(candidate, { timeoutMs });
  }

  if (normMarketplace.includes('mercado') || normMarketplace.includes('ml')) {
    const candidate = targetUrl || offer?.marketplaceMetrics?.itemId || offer?.sourceItemId;
    return extractMercadoLivreVideo(candidate, { timeoutMs });
  }

  if (normMarketplace.includes('shopee')) {
    return extractShopeeVideo(offer || targetUrl, { timeoutMs });
  }

  return { found: false, reason: `UNSUPPORTED_MARKETPLACE_${normMarketplace}` };
}

/**
 * 5. ASYNC ENRICHMENT HOOK FOR SUPABASE
 */
async function enrichOfferVideoAsync(supabaseClient, offerId, { marketplace, offer, url } = {}) {
  if (!supabaseClient || !offerId) return;

  try {
    const result = await extractProductVideo({ marketplace, offer, url });
    if (result.found && result.videoUrl) {
      const { error } = await supabaseClient
        .from('offers')
        .update({ video_url: result.videoUrl })
        .eq('id', offerId);

      if (error) {
        console.warn(`[VideoEnrichment] Falha ao atualizar offer ${offerId} com video_url: ${error.message}`);
      } else {
        console.log(`[VideoEnrichment] ✅ Offer ${offerId} enriquecida com video_url (${result.source}): ${result.videoUrl.slice(0, 70)}...`);
        
        // Criar registro correspondente em video_jobs para aparecer imediatamente em "Vídeos de ofertas"
        try {
          const defaultUserId = process.env.ADMIN_USER_ID || '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
          await supabaseClient
            .from('video_jobs')
            .insert({
              user_id: defaultUserId,
              offer_id: offerId,
              template_id: 'gemini-drive-v1',
              status: 'ready',
              stage: 'ready_for_review',
              script: `Vídeo oficial extraído automaticamente de ${marketplace || 'marketplace'}.`,
              video_url: result.videoUrl,
              metadata: {
                templateId: 'gemini-drive-v1',
                source: 'marketplace_extracted',
                videoType: result.videoType,
                marketplace: marketplace,
                extractedAt: new Date().toISOString()
              }
            });
        } catch (jobErr) {
          // Best effort para video_jobs
        }
      }
    }
  } catch (err) {
    console.warn(`[VideoEnrichment] Erro silencioso ao enriquecer offer ${offerId}: ${err.message}`);
  }
}

module.exports = {
  extractAmazonVideo,
  extractMercadoLivreVideo,
  extractShopeeVideo,
  extractProductVideo,
  enrichOfferVideoAsync
};
