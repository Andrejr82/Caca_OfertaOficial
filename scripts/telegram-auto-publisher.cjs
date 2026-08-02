'use strict';

const { createClient } = require('@supabase/supabase-js');
const https = require('https');
require('dotenv').config({ path: '.env.local' });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { 
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: {
      transport: require('ws')
    }
  }
);

function sendTelegramPhoto(text, photoUrl) {
  if (!process.env.TELEGRAM_BOT_TOKEN || !process.env.TELEGRAM_CHANNEL_ID) {
    return Promise.reject(new Error("Telegram não configurado."));
  }

  const isAmazonImage = photoUrl.includes("amazon.com") || photoUrl.includes("media-amazon.com");
  const isNetshoesImage = photoUrl.includes("netshoes.com.br") || photoUrl.includes("zattini.com.br");

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
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      }
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try {
          const result = JSON.parse(data);
          if (!result.ok) {
             if (result.error_code === 429) {
               reject(new Error(`RATE_LIMIT:${result.parameters?.retry_after || 60}`));
             } else {
               reject(new Error(result.description || "Falha ao publicar foto."));
             }
          } else {
            resolve(result.result);
          }
        } catch (e) {
          reject(new Error("Resposta inválida da API do Telegram."));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro de Conexão HTTPS com o Telegram: ${e.message}`));
    });

    req.write(payload);
    req.end();
  });
}

async function processTelegramQueue() {
  try {
    // Verifica flag de automação em general_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'general_settings')
      .limit(1);
    
    // Pega a configuração do primeiro usuário (como é um tenant)
    const generalSettings = setting && setting.length > 0 ? setting[0].value : null;

    if (!generalSettings || generalSettings.telegram_automation_enabled !== true) {
      console.log('Automacao do Telegram esta desativada ou configuracao ausente. Abortando.');
      return;
    }

    console.log('Buscando posts com status draft para o Telegram...');
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*, offers(image_url)')
      .eq('status', 'draft')
      .eq('channel', 'telegram')
      .order('created_at', { ascending: true })
      .limit(5);

    if (error) {
      console.error('Erro buscando posts pendentes:', error);
      return;
    }

    if (!posts || posts.length === 0) {
      console.log('Nenhum post em draft encontrado na fila.');
      return;
    }
    
    console.log(`Encontrados ${posts.length} posts em draft para disparar...`);

    for (const post of posts) {
      console.log(`[Telegram Auto] Publicando post ${post.id}...`);
      try {
        const text = post.content || '';
        const mediaUrl = post.media_url || (post.offers && post.offers.image_url) || '';
        
        if (mediaUrl) {
          await sendTelegramPhoto(text, mediaUrl);
        } else {
          // Se não houver imagem, ignorar por agora (poderíamos fazer sendTelegramMessage)
          console.warn(`[Telegram Auto] Post ${post.id} não possui media_url, ignorando.`);
        }
        
        await supabase
          .from('posts')
          .update({ 
             status: 'published', 
             published_at: new Date().toISOString() 
          })
          .eq('id', post.id);

        console.log(`[Telegram Auto] Post ${post.id} publicado com sucesso.`);

        // Sleep para evitar rate limit (3s)
        await new Promise(r => setTimeout(r, 3000));
      } catch (err) {
        if (err.message.startsWith('RATE_LIMIT:')) {
           const retryAfter = parseInt(err.message.split(':')[1], 10);
           console.warn(`[Telegram Auto] Rate limit! Aguardando ${retryAfter}s...`);
           await new Promise(r => setTimeout(r, retryAfter * 1000));
           break; // Interrompe o processamento atual e tenta de novo no próximo ciclo
        }
        console.error(`[Telegram Auto] Erro ao publicar post ${post.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Telegram Auto] Falha no ciclo:', err.message);
  }
}

let intervalTimer = null;

function startTelegramAutomation(intervalMs = 60000) {
  if (intervalTimer) return;
  console.log('[Telegram Auto] Iniciando loop de automação (intervalo:', intervalMs, 'ms)');
  
  // Executa imediatamente e depois agenda
  processTelegramQueue();
  intervalTimer = setInterval(processTelegramQueue, intervalMs);
}

module.exports = {
  startTelegramAutomation,
  processTelegramQueue,
  sendTelegramPhoto
};
