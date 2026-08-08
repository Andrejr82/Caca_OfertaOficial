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

function sendFacebookPost(message, mediaUrl) {
  if (!process.env.FACEBOOK_ACCESS_TOKEN || !process.env.FACEBOOK_PAGE_ID) {
    return Promise.reject(new Error("Facebook não configurado (Falta Access Token ou Page ID)."));
  }

  return new Promise((resolve, reject) => {
    const pageId = process.env.FACEBOOK_PAGE_ID;
    const isVideo = mediaUrl && mediaUrl.toLowerCase().endsWith('.mp4');

    let endpoint = `/v19.0/${pageId}/feed`;
    if (mediaUrl) {
       endpoint = isVideo ? `/v19.0/${pageId}/videos` : `/v19.0/${pageId}/photos`;
    }

    const payloadData = {
      access_token: process.env.FACEBOOK_ACCESS_TOKEN
    };

    if (isVideo) {
      payloadData.description = message || '';
      payloadData.file_url = mediaUrl;
    } else if (mediaUrl) {
      payloadData.message = message || '';
      payloadData.url = mediaUrl;
    } else {
      payloadData.message = message || '';
    }

    // Convert to query string for form-urlencoded or JSON
    // Facebook aceita JSON bem em requisições POST para a maioria dos endpoints
    const payload = JSON.stringify(payloadData);

    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
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
          if (result.error) {
             // 429 ou erro de rate limit do Facebook tem códigos específicos
             // https://developers.facebook.com/docs/graph-api/overview/errors/
             if (result.error.code === 4 || result.error.code === 17 || result.error.code === 32 || result.error.code === 613) {
               reject(new Error(`RATE_LIMIT:60`)); // Espera 60s padrão em rate limits básicos
             } else {
               reject(new Error(result.error.message || "Falha ao publicar no Facebook."));
             }
          } else {
            // Em fotos, retorna result.id e as vezes result.post_id. O post_id é mais seguro para comentários,
            // mas o video_id (result.id) também aceita comentários nativamente.
            resolve(result.post_id || result.id);
          }
        } catch (e) {
          reject(new Error("Resposta inválida da API do Facebook."));
        }
      });
    });

    req.on('error', (e) => {
      reject(new Error(`Erro de Conexão HTTPS com o Facebook: ${e.message}`));
    });

    req.write(payload);
    req.end();
  });
}

function sendFacebookComment(postId, message) {
  if (!process.env.FACEBOOK_ACCESS_TOKEN) {
    return Promise.reject(new Error("Facebook não configurado (Falta Access Token)."));
  }
  return new Promise((resolve, reject) => {
    const endpoint = `/v19.0/${postId}/comments`;
    const payloadData = {
      message: message || '',
      access_token: process.env.FACEBOOK_ACCESS_TOKEN
    };
    const payload = JSON.stringify(payloadData);
    const options = {
      hostname: 'graph.facebook.com',
      port: 443,
      path: endpoint,
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
          if (result.error) {
             reject(new Error(result.error.message || "Falha ao comentar."));
          } else {
            resolve(result.id);
          }
        } catch (e) {
          reject(new Error("Resposta inválida da API do Facebook."));
        }
      });
    });
    req.on('error', (e) => reject(new Error(`Erro de Conexão: ${e.message}`)));
    req.write(payload);
    req.end();
  });
}

async function processFacebookQueue() {
  return { result: 'disabled', reason: 'Official Publication Service is the only publisher' };
  /*
  try {
    // Verifica flag de automação em general_settings
    const { data: setting } = await supabase
      .from('app_settings')
      .select('value')
      .eq('key', 'general_settings')
      .limit(1);

    // Pega a configuração do primeiro usuário
    const generalSettings = setting && setting.length > 0 ? setting[0].value : null;

    if (!generalSettings || generalSettings.facebook_automation_enabled !== true) {
      console.log('Automacao do Facebook esta desativada ou configuracao ausente. Abortando.');
      return;
    }

    console.log('Buscando posts com status draft para o Facebook...');
    const { data: posts, error } = await supabase
      .from('posts')
      .select('*, offers(image_url), affiliate_links(tracked_url)')
      .eq('status', 'draft')
      .eq('channel', 'facebook') // Filtrado apenas para o Facebook
      .order('created_at', { ascending: true })
      .limit(1);

    if (error) {
      console.error('Erro buscando posts pendentes (Facebook):', error);
      return;
    }

    if (!posts || posts.length === 0) {
      console.log('Nenhum post em draft encontrado na fila do Facebook.');
      return;
    }

    console.log(`Encontrados ${posts.length} posts em draft para disparar no Facebook...`);

    for (const post of posts) {
      console.log(`[Facebook Auto] Publicando post ${post.id}...`);
      try {
        const text = post.content || '';
        let mediaUrl = post.media_url || (post.offers && post.offers.image_url) || '';

        // Verifica se é vídeo para não sobrescrever com imagem
        const isVideo = mediaUrl && mediaUrl.toLowerCase().endsWith('.mp4');

        // Se temos um offer_id e não é um cupom, e NÃO É UM VÍDEO, usamos o gerador de imagem premium do WhatsApp/OG
        if (post.offer_id && post.offers) {
           const isCoupon = String(post.offers.product_name || '').startsWith('[CUPOM]') ||
                            String(post.offers.notes || '').includes('Robô de Cupons');

           if (!isCoupon && !isVideo) {
              const baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://caca-oferta-oficial.vercel.app";
              const cleanBaseUrl = baseUrl.replace(/\/$/, "");
              // O OG preview do WhatsApp serve muito bem para o feed quadrado do FB/IG
              mediaUrl = `${cleanBaseUrl}/api/images/whatsapp-premium?offerId=${encodeURIComponent(post.offer_id)}&v=1`;
           }
        }

        let cleanText = text;
        let linkToComment = post.affiliate_links ? post.affiliate_links.tracked_url : '';

        // Remove the instruction text from the body if needed, or leave it since it's correctly placed.
        // The text already has the 👉 Link de compra no primeiro comentário! 👇 from buildCopyV2ChannelCopy

        const postId = await sendFacebookPost(cleanText, mediaUrl);

        if (postId && linkToComment) {
           if (isVideo) {
             console.log(`[Facebook Auto] Vídeo ${postId} enviado! Aguardando processamento da Meta. O Webhook inserirá o comentário.`);
           } else {
             await sendFacebookComment(postId, `🛒 Compre aqui: ${linkToComment}`);
             console.log(`[Facebook Auto] Comentário com link adicionado no post ${postId}.`);
           }
        }

        const { error: updateError } = await supabase
          .from('posts')
          .update({
             status: 'published',
             external_id: postId,
             posted_at: new Date().toISOString()
          })
          .eq('id', post.id);

        if (updateError) {
          console.error(`[Facebook Auto] Falha ao atualizar status do post ${post.id}:`, updateError.message);
        } else {
          console.log(`[Facebook Auto] Post ${post.id} publicado com sucesso.`);
        }

        // Sleep para evitar rate limit e simular delay natural (10s para Facebook)
        await new Promise(r => setTimeout(r, 10000));
      } catch (err) {
        if (err.message.startsWith('RATE_LIMIT:')) {
           const retryAfter = parseInt(err.message.split(':')[1], 10);
           console.warn(`[Facebook Auto] Rate limit! Aguardando ${retryAfter}s...`);
           await new Promise(r => setTimeout(r, retryAfter * 1000));
           break; // Interrompe o processamento atual e tenta de novo no próximo ciclo
        }
        console.error(`[Facebook Auto] Erro ao publicar post ${post.id}:`, err.message);
      }
    }
  } catch (err) {
    console.error('[Facebook Auto] Falha no ciclo:', err.message);
  }
  */
}

let intervalTimer = null;

function startFacebookAutomation(_intervalMs = 1200000) { // A cada 20 minutos
  console.log('[Facebook Auto] Desativado: publicação deve passar pelo Official Publication Service.');
}

module.exports = {
  startFacebookAutomation,
  processFacebookQueue,
  sendFacebookPost
};
