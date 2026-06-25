/**
 * ═══════════════════════════════════════════════════════════════
 *  ORACLE-SCRAPER.CJS — Robô Caçador de Ofertas (Oracle Cloud)
 * ═══════════════════════════════════════════════════════════════
 * 
 * Processo permanente gerenciado pelo PM2.
 * Roda a cada 4 horas: raspa as 6 maiores lojas e salva no Supabase.
 * Zero dependência do Next.js, zero timeout da Vercel.
 * 
 * Lojas: Mercado Livre, Shopee, Amazon, Shein, Magalu, Netshoes
 */

'use strict';

// ⚠️ CRÍTICO: Deve ser definido ANTES de qualquer require do Supabase
global.WebSocket = require('ws');

const cron    = require('node-cron');
const { createClient } = require('@supabase/supabase-js');
const ws      = require('ws');
require('dotenv').config({ path: '.env.local' });

// ─── Supabase Admin Client ────────────────────────────────────
// Node.js < 22 exige passagem explícita do ws como transport
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  }
);

// ─── Configurações ────────────────────────────────────────────
const FIRECRAWL_KEY   = process.env.FIRECRAWL_API_KEY;
const ADMIN_USER_ID   = '7a9ca7b7-f464-46e0-a9de-9b322c73628a'; // ID do André (para aparecer no dashboard)
const OFFERS_PER_STORE = 8;   // Produtos buscados por loja por ciclo
const CLEANUP_DAYS     = 7;   // Apagar drafts mais velhos que X dias
const CRON_SCHEDULE    = '0 */4 * * *'; // A cada 4 horas

// ─── Fontes de afiliados ──────────────────────────────────────
const ML_AFFILIATE_ID      = process.env.MERCADO_LIVRE_AFFILIATE_ID || '';
const AMAZON_TAG           = process.env.AMAZON_PARTNER_TAG || '';
const MAGALU_PARTNER_ID    = process.env.MAGALU_PARTNER_ID || '';
const RAKUTEN_AFFILIATE_ID = process.env.RAKUTEN_AFFILIATE_ID || '';
const RAKUTEN_NETSHOES_MID = process.env.RAKUTEN_NETSHOES_MID || '43984';

// ─── Listas de palavras-chave virais por loja ─────────────────
const VIRAL_QUERIES = {
  'Mercado Livre': ['airfryer oferta', 'celular oferta', 'fone bluetooth', 'aspirador robô', 'monitor gamer'],
  'Shopee':        ['kit cozinha', 'suporte celular', 'relógio smartwatch', 'luminária led', 'bolsa feminina'],
  'Amazon':        ['kindle oferta', 'echo dot', 'impressora', 'headphone', 'câmera de segurança'],
  'Shein':         ['vestido promoção', 'conjunto feminino', 'bolsa tendência', 'calçado feminino', 'acessórios moda'],
  'Magalu':        ['tv oferta', 'geladeira promoção', 'micro-ondas', 'máquina de lavar', 'notebook'],
  'Netshoes':      ['tênis corrida', 'chuteira', 'bola futebol', 'suplemento proteína', 'camiseta esporte'],
};

// ─── Contador de rotação de queries ──────────────────────────
const queryIndex = {};
Object.keys(VIRAL_QUERIES).forEach(store => { queryIndex[store] = 0; });

function getNextQuery(store) {
  const queries = VIRAL_QUERIES[store];
  const q = queries[queryIndex[store] % queries.length];
  queryIndex[store]++;
  return q;
}

// ─── Utilitário: Chamar a Firecrawl API (com retry) ─────────
async function firecrawlExtract(url, limit, storeName, attempt = 1) {
  if (!FIRECRAWL_KEY) {
    console.error('[SCRAPER] FIRECRAWL_API_KEY não configurada!');
    return [];
  }

  const MAX_RETRIES = 2;
  const prompt = `Você é um robô caçador de achadinhos. Extraia TODOS os produtos da página que sejam CLARAMENTE uma promoção. ` +
    `Inclua: 1) preço antigo riscado; 2) selos de desconto (ex: -30% OFF); 3) tags de oferta relâmpago, oferta do dia, venda flash. ` +
    `Ignore produtos sem desconto visível. Mire em ${limit * 3} itens. ` +
    `Retorne: title, url (completa com https://), image, price (número), old_price (número ou null), discount_badge (texto ou null), rating (número ou null), category.`;

  try {
    console.log(`  [Firecrawl] ${storeName} — tentativa ${attempt}/${MAX_RETRIES}...`);
    const res = await fetch('https://api.firecrawl.dev/v1/scrape', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${FIRECRAWL_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        url,
        formats: ['extract'],
        waitFor: 8000,
        timeout: 60000,
        mobile: true,
        proxy: 'stealth',
        blockAds: true,
        extract: {
          prompt,
          schema: {
            type: 'object',
            properties: {
              products: {
                type: 'array',
                items: {
                  type: 'object',
                  properties: {
                    title:          { type: 'string' },
                    url:            { type: 'string' },
                    image:          { type: 'string' },
                    price:          { type: 'number' },
                    old_price:      { type: 'number', nullable: true },
                    discount_badge: { type: 'string', nullable: true },
                    rating:         { type: 'number', nullable: true },
                    category:       { type: 'string' },
                  },
                  required: ['title', 'url', 'price'],
                },
              },
            },
            required: ['products'],
          },
        },
      }),
    });

    // Retry em caso de 408 (timeout) ou 429 (rate limit)
    if (res.status === 408 || res.status === 429) {
      if (attempt < MAX_RETRIES) {
        const delay = attempt * 15000; // 15s, 30s...
        console.warn(`  [Firecrawl] ${storeName} HTTP ${res.status} — aguardando ${delay/1000}s e tentando novamente...`);
        await new Promise(r => setTimeout(r, delay));
        return firecrawlExtract(url, limit, storeName, attempt + 1);
      }
      console.warn(`  [Firecrawl] ${storeName} — máximo de tentativas atingido (${res.status}).`);
      return [];
    }

    if (!res.ok) {
      console.warn(`  [Firecrawl] ${storeName} HTTP ${res.status}`);
      return [];
    }

    const data = await res.json();
    const products = data?.data?.extract?.products || [];

    // Filtra apenas produtos com desconto real
    return products
      .filter(p => p.title && p.price > 0 && (
        (p.old_price && p.old_price > p.price) ||
        (p.discount_badge && p.discount_badge.trim().length > 0)
      ))
      .slice(0, limit);

  } catch (err) {
    console.error(`  [Firecrawl] ${storeName} Erro: ${err.message}`);
    return [];
  }
}

// ─── Normalização de URL de imagem ───────────────────────────
function normalizeImageUrl(url) {
  if (!url) return null;
  let u = url;
  if (u.startsWith('//')) u = 'https:' + u;
  if (u.includes('mlcdn.com.br')) u = u.replace(/\/\d+x\d+\//, '/orig/');
  return u;
}

// ─── Gera URL de afiliado por loja ───────────────────────────
function buildAffiliateUrl(originalUrl, store) {
  try {
    const obj = new URL(originalUrl);
    if (store === 'Mercado Livre' && ML_AFFILIATE_ID) {
      obj.searchParams.set('dealerRef', ML_AFFILIATE_ID);
      return obj.toString();
    }
    if (store === 'Amazon' && AMAZON_TAG) {
      obj.searchParams.set('tag', AMAZON_TAG);
      return obj.toString();
    }
    if (store === 'Magalu' && MAGALU_PARTNER_ID) {
      obj.hostname = 'www.magazinevoce.com.br';
      obj.pathname = `/${MAGALU_PARTNER_ID}${obj.pathname}`;
      return obj.toString();
    }
    if (store === 'Netshoes' && RAKUTEN_AFFILIATE_ID) {
      return `https://click.linksynergy.com/deeplink?id=${RAKUTEN_AFFILIATE_ID}&mid=${RAKUTEN_NETSHOES_MID}&murl=${encodeURIComponent(originalUrl)}`;
    }
  } catch (_) {}
  return originalUrl;
}

// ─── Score simplificado para a Oracle (sem Next.js) ──────────
function calculateScore(product) {
  const price     = product.current_price || 0;
  const oldPrice  = product.old_price || 0;
  const rating    = product.rating || 0;

  // Score de desconto (peso 40%)
  let discountScore = 0;
  if (oldPrice > price) {
    const pct = (oldPrice - price) / oldPrice;
    if (pct >= 0.05 && pct <= 0.80) discountScore = Math.min((pct / 0.5) * 10, 10);
    else if (pct > 0.80) discountScore = 2;
  }

  // Score de preço (peso 25%)
  let priceScore = 0;
  if (price > 0 && price <= 100)       priceScore = 10;
  else if (price <= 300)               priceScore = 8;
  else if (price <= 700)               priceScore = 5;
  else                                 priceScore = 2;

  // Score de impulso (peso 20%)
  let impulseScore = 0;
  if (price <= 80)       impulseScore = 10;
  else if (price <= 150) impulseScore = 8;
  else if (price <= 300) impulseScore = 5;
  else                   impulseScore = 2;

  // Score de rating (peso 15%)
  const ratingScore = rating > 0 ? (rating / 5) * 10 : 5;

  const finalScore = Number(
    ((discountScore * 0.40) + (priceScore * 0.25) + (impulseScore * 0.20) + (ratingScore * 0.15))
    .toFixed(2)
  );

  return Math.max(0, Math.min(10, finalScore));
}

// ─── Salva/atualiza oferta no Supabase ───────────────────────
async function upsertOffer(product, store, affiliateUrl) {
  const score = calculateScore(product);

  // Checa duplicata pela URL
  const { data: existing } = await supabase
    .from('offers')
    .select('id, current_price, score')
    .eq('original_url', affiliateUrl)
    .eq('user_id', ADMIN_USER_ID)
    .maybeSingle();

  if (existing) {
    const priceChanged = Number(existing.current_price) !== product.current_price;
    if (priceChanged) {
      await supabase.from('offers').update({
        current_price: product.current_price,
        old_price:     product.old_price,
        image_url:     product.image_url,
        score,
        status:        'draft',
        updated_at:    new Date().toISOString(),
        notes:         `[Oracle] Preço atualizado: R$ ${existing.current_price} → R$ ${product.current_price}`,
      }).eq('id', existing.id);
      console.log(`  ↻ Atualizado: ${product.product_name.substring(0, 50)} (R$ ${product.current_price})`);
    } else {
      // Só atualiza o timestamp para a faxina não apagar
      await supabase.from('offers').update({ updated_at: new Date().toISOString() }).eq('id', existing.id);
    }
    return;
  }

  // Inserção nova
  const { error } = await supabase.from('offers').insert({
    user_id:      ADMIN_USER_ID,
    platform:     store,
    product_name: product.product_name,
    original_url: affiliateUrl,
    image_url:    product.image_url,
    current_price: product.current_price,
    old_price:    product.old_price,
    rating:       product.rating,
    category:     product.category || 'Geral',
    score,
    status:       'draft',
    notes:        `[Oracle-Scraper] Importado de ${store} às ${new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}`,
  });

  if (error) {
    console.error(`  ✗ Erro ao salvar: ${error.message}`);
  } else {
    console.log(`  ✓ Novo: ${product.product_name.substring(0, 50)} — R$ ${product.current_price} (score: ${score})`);
  }
}

// ─── Faxina automática: apaga drafts velhos ──────────────────
async function cleanupOldDrafts() {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - CLEANUP_DAYS);

  const { data: deleted, error } = await supabase
    .from('offers')
    .delete()
    .eq('status', 'draft')
    .lt('updated_at', cutoff.toISOString())
    .select('id');

  if (error) {
    console.error('[FAXINA] Erro na limpeza:', error.message);
  } else {
    console.log(`[FAXINA] ${deleted?.length || 0} drafts antigos removidos (>= ${CLEANUP_DAYS} dias).`);
  }
}

// ─── Raspa uma loja específica ────────────────────────────────
async function scrapeStore(store) {
  const query = getNextQuery(store);
  console.log(`\n🔍 [${store}] Buscando: "${query}"...`);

  let targetUrl = '';
  switch (store) {
    case 'Mercado Livre': targetUrl = `https://www.mercadolivre.com.br/ofertas?q=${encodeURIComponent(query)}`; break;
    case 'Shopee':        targetUrl = `https://shopee.com.br/search?keyword=${encodeURIComponent(query)}`; break;
    case 'Amazon':        targetUrl = `https://www.amazon.com.br/s?k=${encodeURIComponent(query)}&rh=p_n_availability%3A2661601011`; break;
    case 'Shein':         targetUrl = `https://br.shein.com/pdsearch/${encodeURIComponent(query)}/`; break;
    case 'Magalu':        targetUrl = `https://www.magazineluiza.com.br/busca/${encodeURIComponent(query)}/`; break;
    case 'Netshoes':      targetUrl = `https://www.netshoes.com.br/busca?nsCat=natural&q=${encodeURIComponent(query)}`; break;
    default: return;
  }

  const rawProducts = await firecrawlExtract(targetUrl, OFFERS_PER_STORE, store);
  console.log(`  → ${rawProducts.length} produtos encontrados.`);

  let saved = 0;
  for (const p of rawProducts) {
    const imageUrl    = normalizeImageUrl(p.image || null);
    const originalUrl = p.url?.startsWith('http') ? p.url : targetUrl;
    const affiliateUrl = buildAffiliateUrl(originalUrl, store);

    await upsertOffer({
      product_name:  p.title,
      image_url:     imageUrl,
      current_price: p.price,
      old_price:     p.old_price && p.old_price > p.price ? p.old_price : null,
      rating:        p.rating ? parseFloat(String(p.rating)) : null,
      category:      p.category || 'Geral',
    }, store, affiliateUrl);
    saved++;
  }
  console.log(`  ✅ [${store}] ${saved} ofertas processadas.`);
  return saved;
}

// ─── Ciclo principal de scraping ─────────────────────────────
async function runScrapingCycle() {
  const startTime = Date.now();
  const ts = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`🚀 ORACLE-SCRAPER — Ciclo iniciado em ${ts}`);
  console.log(`${'═'.repeat(60)}`);

  const stores = ['Mercado Livre', 'Shopee', 'Amazon', 'Shein', 'Magalu', 'Netshoes'];
  let totalSaved = 0;

  for (const store of stores) {
    try {
      const count = await scrapeStore(store);
      totalSaved += (count || 0);
      // Pausa entre lojas para não sobrecarregar a Firecrawl
      await new Promise(r => setTimeout(r, 5000));
    } catch (err) {
      console.error(`[SCRAPER][${store}] Erro inesperado: ${err.message}`);
    }
  }

  // Faxina automática
  console.log('\n🧹 Executando faxina de ofertas antigas...');
  await cleanupOldDrafts();

  // Registra log no Supabase para monitoramento
  const duration = Math.round((Date.now() - startTime) / 1000);
  try {
    await supabase.from('integration_logs').insert({
      user_id:     ADMIN_USER_ID,
      integration: 'Oracle-Scraper',
      action:      'Ciclo Completo',
      status:      'success',
      message:     `${totalSaved} ofertas processadas em ${duration}s. Lojas: ${stores.join(', ')}`,
      metadata:    { total_saved: totalSaved, duration_seconds: duration, stores },
    });
  } catch (e) {
    console.error('[LOG] Falha ao registrar log:', e.message);
  }


  console.log(`\n🏁 Ciclo concluído! ${totalSaved} ofertas em ${duration}s.`);
  console.log(`⏰ Próximo ciclo em 4 horas.\n`);
}

// ─── Inicialização ────────────────────────────────────────────
console.log('');
console.log('╔══════════════════════════════════════════╗');
console.log('║   ORACLE-SCRAPER — Caça Oferta Oficial  ║');
console.log('║   Robô: 6 Lojas | Ciclo: 4 Horas        ║');
console.log('╚══════════════════════════════════════════╝');
console.log('');

// Verifica configuração crítica
if (!FIRECRAWL_KEY) {
  console.error('❌ FIRECRAWL_API_KEY não encontrada no .env.local!');
  console.error('   O scraper não consegue buscar produtos sem ela.');
  process.exit(1);
}
if (!process.env.SUPABASE_SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_SERVICE_ROLE_KEY não encontrada no .env.local!');
  process.exit(1);
}

console.log(`✅ Firecrawl: OK`);
console.log(`✅ Supabase Admin: OK`);
console.log(`✅ Lojas configuradas: Mercado Livre, Shopee, Amazon, Shein, Magalu, Netshoes`);
console.log(`✅ Frequência: a cada 4 horas (${CRON_SCHEDULE})`);
console.log(`✅ Faxina automática: drafts com mais de ${CLEANUP_DAYS} dias`);
console.log('');

// Executa imediatamente ao iniciar (não espera a primeira hora cheia)
console.log('▶ Executando ciclo inicial...');
runScrapingCycle().catch(err => {
  console.error('❌ Erro no ciclo inicial:', err.message);
});

// Agenda o cron recorrente
cron.schedule(CRON_SCHEDULE, () => {
  runScrapingCycle().catch(err => {
    console.error('❌ Erro no ciclo do cron:', err.message);
  });
}, {
  name:      'oracle-scraper-main',
  timezone:  'America/Sao_Paulo',
  noOverlap: true, // Evita execuções paralelas se uma rodada demorar muito
});

console.log(`✅ Cron agendado! Próximas execuções: a cada 4 horas (horário de Brasília).`);
console.log('');
