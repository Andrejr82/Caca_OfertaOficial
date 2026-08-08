'use strict';

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { transport: require('ws') }
  }
);

function sendTelegramPhoto(text, photoUrl) {
  if (process.env.NO_PUBLISH === '1' && process.env.TELEGRAM_AUTO_PUBLISH !== '1') {
    return Promise.reject(new Error('Telegram publication disabled by NO_PUBLISH=1.'));
  }
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID) {
    return Promise.reject(new Error('Telegram não configurado.'));
  }

  const isAmazonImage = photoUrl.includes('amazon.com') || photoUrl.includes('media-amazon.com');
  const isNetshoesImage = photoUrl.includes('netshoes.com.br') || photoUrl.includes('zattini.com.br');
  const finalPhotoUrl = (isAmazonImage || isNetshoesImage)
    ? `https://wsrv.nl/?url=${encodeURIComponent(photoUrl)}`
    : photoUrl;

  return new Promise((resolve, reject) => {
    const payload = JSON.stringify({
      chat_id: process.env.TELEGRAM_CHANNEL_ID,
      photo: finalPhotoUrl,
      caption: text
    });
    const options = {
      hostname: 'api.telegram.org',
      port: 443,
      path: `/bot${process.env.TELEGRAM_BOT_TOKEN}/sendPhoto`,
      method: 'POST',
      family: 4,
      headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }
    };
    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (!result.ok) {
            if (result.error_code === 429) reject(new Error(`RATE_LIMIT:${result.parameters?.retry_after || 60}`));
            else reject(new Error(result.description || 'Falha ao publicar foto.'));
          } else resolve(result.result);
        } catch (_) {
          reject(new Error('Resposta inválida da API do Telegram.'));
        }
      });
    });
    req.on('error', (error) => reject(new Error(`Erro de Conexão HTTPS com o Telegram: ${error.message}`)));
    req.write(payload);
    req.end();
  });
}

function telegramIdempotencyKey(postId) {
  return `telegram:post:${postId}`;
}

function createTelegramPublisher(options = {}) {
  const database = options.supabase || supabase;
  const sendPhoto = options.sendPhoto || sendTelegramPhoto;
  const logger = options.logger || console;
  const now = options.now || (() => new Date().toISOString());
  const sleep = options.sleep || ((milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds)));
  const pid = options.pid || process.pid;
  let cycleInFlight = false;

  function log(level, entry) {
    const target = typeof logger[level] === 'function' ? logger[level] : logger.log;
    target.call(logger, { component: 'telegram-auto-publisher', pid, ...entry });
  }

  async function claimPost(post) {
    const idempotencyKey = telegramIdempotencyKey(post.id);
    const { data, error } = await database
      .from('posts')
      .update({
        status: 'publishing',
        publishing_started_at: now(),
        publishing_idempotency_key: idempotencyKey,
        publishing_error: null
      })
      .eq('id', post.id)
      .eq('status', 'draft')
      .eq('channel', 'telegram')
      .select('id')
      .maybeSingle();

    if (error) throw error;
    return { data, idempotencyKey };
  }

  async function markPublished(post, idempotencyKey, externalId) {
    return database
      .from('posts')
      .update({
        status: 'published',
        posted_at: now(),
        external_id: externalId,
        publishing_error: null
      })
      .eq('id', post.id)
      .eq('status', 'publishing')
      .eq('publishing_idempotency_key', idempotencyKey)
      .select('id')
      .maybeSingle();
  }

  async function markFailed(post, idempotencyKey, message) {
    return database
      .from('posts')
      .update({ publishing_error: message })
      .eq('id', post.id)
      .eq('status', 'publishing')
      .eq('publishing_idempotency_key', idempotencyKey)
      .select('id')
      .maybeSingle();
  }

  function mediaFor(post) {
    let mediaUrl = post.media_url || post.offers?.image_url || '';
    if (post.offer_id && post.offers) {
      const isCoupon = String(post.offers.product_name || '').startsWith('[CUPOM]')
        || String(post.offers.notes || '').includes('Robô de Cupons');
      if (!isCoupon) {
        const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || 'https://caca-oferta-oficial.vercel.app';
        mediaUrl = `${baseUrl.replace(/\/$/, '')}/api/images/whatsapp-premium?offerId=${encodeURIComponent(post.offer_id)}&v=1`;
      }
    }
    return mediaUrl;
  }

  async function processQueue(options = {}) {
    const hasEditorialSelection = Array.isArray(options.selectedEditorialTop30OfferIds);
    if (!hasEditorialSelection) {
      log('log', { event: 'poll_skipped', result: 'editorial_selection_missing' });
      return { result: 'disabled', reason: 'editorial_selection_missing' };
    }
    if (process.env.NO_PUBLISH === '1' && process.env.TELEGRAM_AUTO_PUBLISH !== '1') {
      log('log', { event: 'poll_skipped', result: 'no_publish' });
      return { result: 'disabled', reason: 'NO_PUBLISH=1' };
    }
    if (cycleInFlight) {
      log('log', { event: 'poll_skipped', result: 'overlap' });
      return { result: 'overlap' };
    }
    cycleInFlight = true;
    try {
      const { data: setting, error: settingError } = await database
        .from('app_settings')
        .select('value')
        .eq('key', 'general_settings')
        .limit(1);
      if (settingError) throw settingError;
      const generalSettings = setting?.[0]?.value;
      if (!generalSettings || generalSettings.telegram_automation_enabled !== true) {
        log('log', { event: 'poll_skipped', result: 'disabled' });
        return { result: 'disabled' };
      }
      const selectedOfferIds = [...new Set(options.selectedEditorialTop30OfferIds.map(String).filter(Boolean))].slice(0, 30);
      if (selectedOfferIds.length === 0) {
        log('log', { event: 'poll_completed', result: 'empty', selection: 'editorial_top30' });
        return { result: 'empty' };
      }

      const { data: posts, error } = await database
        .from('posts')
        .select('id, offer_id, content, channel, status, offers(image_url, product_name, notes, explainability)')
        .eq('status', 'draft')
        .eq('channel', 'telegram')
        .in('offer_id', selectedOfferIds)
        .order('created_at', { ascending: true })
        .limit(30);
      if (error) throw error;
      const uniquePosts = [...new Map((posts || [])
        .filter((post) => post.offers?.explainability?.manual_source !== true)
        .map((post) => [post.offer_id, post])).values()];
      if (!uniquePosts.length) {
        log('log', { event: 'poll_completed', result: 'empty' });
        return { result: 'empty' };
      }

      for (const post of uniquePosts) {
        const idempotencyKey = telegramIdempotencyKey(post.id);
        let claim;
        try {
          claim = await claimPost(post);
        } catch (error) {
          log('error', { event: 'claim_failed', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'error', error: error.message });
          continue;
        }
        if (!claim.data) {
          log('log', { event: 'claim_finished', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'claim_lost' });
          continue;
        }

        const claimedPost = post;
        const mediaUrl = mediaFor(claimedPost);
        if (!mediaUrl) {
          await markFailed(claimedPost, idempotencyKey, 'Telegram publication requires media_url.');
          log('warn', { event: 'publication_finished', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'missing_media' });
          continue;
        }

        try {
          log('log', { event: 'publication_started', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'claimed' });
          const telegramResult = await sendPhoto(claimedPost.content || '', mediaUrl, {
            postId: post.id,
            offerId: post.offer_id,
            idempotencyKey,
            pid
          });
          const externalId = telegramResult?.message_id ?? telegramResult?.id;
          if (externalId === undefined || externalId === null) {
            log('error', { event: 'publication_reconciliation_required', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'send_without_external_id' });
            continue;
          }

          const { data: published, error: updateError } = await markPublished(claimedPost, idempotencyKey, String(externalId));
          if (updateError || !published) {
            log('error', { event: 'publication_reconciliation_required', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, external_id: String(externalId), result: 'send_confirmed_persistence_failed', error: updateError?.message || 'claim finalization returned no row' });
            continue;
          }
          log('log', { event: 'publication_finished', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, external_id: String(externalId), result: 'published' });
          await sleep(3000);
        } catch (error) {
          try {
            await markFailed(claimedPost, idempotencyKey, error.message);
          } catch (persistenceError) {
            log('error', { event: 'publication_reconciliation_required', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'send_failed_error_persistence_failed', error: persistenceError.message });
          }
          if (error.message.startsWith('RATE_LIMIT:')) {
            const retryAfter = parseInt(error.message.split(':')[1], 10);
            log('warn', { event: 'publication_finished', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'rate_limited', retry_after_seconds: retryAfter });
            await sleep(retryAfter * 1000);
            break;
          }
          log('error', { event: 'publication_finished', post_id: post.id, offer_id: post.offer_id, idempotency_key: idempotencyKey, result: 'send_failed', error: error.message });
        }
      }
      return { result: 'completed' };
    } catch (error) {
      log('error', { event: 'poll_failed', result: 'error', error: error.message });
      return { result: 'error' };
    } finally {
      cycleInFlight = false;
    }
  }

  return { processQueue };
}

const defaultPublisher = createTelegramPublisher();
let intervalTimer = null;

function processTelegramQueue(options = {}) {
  return defaultPublisher.processQueue(options);
}

function startTelegramAutomation(_intervalMs = 60000) {
  console.log('[Telegram Auto] Desativado: publicação deve passar pelo Official Publication Service.');
}

function stopTelegramAutomation() {
  if (!intervalTimer) return;
  clearInterval(intervalTimer);
  intervalTimer = null;
}

module.exports = {
  createTelegramPublisher,
  telegramIdempotencyKey,
  startTelegramAutomation,
  stopTelegramAutomation,
  processTelegramQueue,
  sendTelegramPhoto
};
