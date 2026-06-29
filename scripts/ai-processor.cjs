/**
 * ═══════════════════════════════════════════════════════════════
 *  AI-PROCESSOR.CJS — O Cérebro de Marketing Desacoplado
 * ═══════════════════════════════════════════════════════════════
 * 
 * Script isolado responsável por:
 * 1. Ler as ofertas 'draft' no banco.
 * 2. Acionar a camada LLM Abstrata (Factory).
 * 3. Gerar Links Trackeados.
 * 4. Inserir Posts e aprovar Oferta.
 */

'use strict';

global.WebSocket = require('ws');
const { createClient } = require('@supabase/supabase-js');
const ws = require('ws');
require('dotenv').config({ path: '.env.local' });

// ─── Importa a Factory Abstrata ───────────────────────────────
const { LLMFactory } = require('../src/core/llm/factory');

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false },
    realtime: { webSocketImpl: ws },
  }
);

const ADMIN_USER_ID = '7a9ca7b7-f464-46e0-a9de-9b322c73628a';
const VIP_SLOTS = 10; // Processa de 10 em 10 para não sobrecarregar
const APPROVAL_SCORE = 7.0;

// ─── Sub-ID e Tracked URL ─────────────────────────────────────
function createSubId(channel, offerId) {
  const shortId = offerId.replace(/-/g, "").slice(0, 8);
  const prefixes = { telegram: "tg", instagram: "ig", whatsapp: "wp" };
  return `${prefixes[channel] || "x"}_${shortId}`;
}

function createTrackedUrl(subId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || "https://caca-oferta-oficial.vercel.app";
  return `${baseUrl}/go/${subId}`;
}

// ─── Lógica de IA (Usando a Factory) ──────────────────────────
async function generateOfferAnalysis(product, store) {
  const baseSystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão. Respond in JSON.
Sua persona: Administrador eufórico de grupos de ofertas. Foco em escassez extrema e descontos.
Regras:
1. Ignore criação de links, injetaremos depois.
2. Coloque hashtags no array 'hashtags'.
3. Ignore preços monetários, injetaremos depois.
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

  const userPrompt = `Gerar copy para:
Nome: ${product.product_name}
Loja: ${store}

RETORNE EXATAMENTE NESTE FORMATO JSON:
{
  "strategies": [
    { "headline": "...", "hook": "...", "body": "...", "cta": "...", "score": 9.5 }
  ],
  "hashtags": ["#oferta"]
}`;

  console.log(`  [IA] Solicitando geração de Copy via LLM Factory...`);
  
  // Chama a Factory que gerencia o Fallback nativamente
  let raw;
  try {
    raw = await LLMFactory.generateWithFallback(baseSystemPrompt, userPrompt, true);
  } catch (error) {
    console.error(`  [IA] Erro Crítico na geração: ${error.message}`);
    return generateFallback(product, store);
  }

  const strategy = (raw.strategies && raw.strategies[0]) ? raw.strategies[0] : null;
  if (!strategy) {
    console.warn(`  [IA] JSON retornado não continha 'strategies'. Usando fallback.`);
    return generateFallback(product, store);
  }

  const hashtags = (raw.hashtags || ["#promocao"]).map(h => h.startsWith('#') ? h : `#${h}`).join(' ');

  const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  
  const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
  const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;
  const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

  return {
    score: strategy.score || 8.0,
    telegram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}\n\n${hashtags}`,
    instagram: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${instagramBottomBlock}\n\n${hashtags}`,
    whatsapp: `🚨 *${strategy.headline}*\n\n${strategy.hook}\n\n${strategy.body}\n\n👉 ${strategy.cta}\n${bottomBlock}`
  };
}

function generateFallback(product, store) {
  const pStr = product.current_price ? product.current_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = product.old_price ? product.old_price.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  
  const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
  const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;
  const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

  return {
    score: 5.0,
    telegram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}\n\n#oferta`,
    instagram: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${instagramBottomBlock}\n\n#oferta`,
    whatsapp: `🚨 *Oferta: ${product.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}`
  };
}

// ─── Processamento Principal ────────────────────────────────────
async function runAiProcessorCycle() {
  console.log(`\n===========================================`);
  console.log(`🧠 Iniciando Cérebro de Marketing (AI Processor)`);
  console.log(`===========================================`);

  // 1. Busca os Drafts no Banco
  const { data: drafts, error } = await supabase
    .from('offers')
    .select('*')
    .eq('status', 'draft')
    .order('score', { ascending: false })
    .limit(VIP_SLOTS);

  if (error || !drafts || drafts.length === 0) {
    console.log(`🤖 Nenhum draft pendente para processar.`);
    return;
  }

  console.log(`🤖 Processando ${drafts.length} ofertas pendentes...`);

  let processed = 0;

  for (const item of drafts) {
    console.log(`\n➔ Analisando: ${item.product_name.substring(0, 40)}...`);
    
    // Geração do Copy com a Factory
    const analysis = await generateOfferAnalysis(item, item.platform);
    
    // Calcula Score Final
    const currentScore = item.score || 0;
    const finalScore = Number(((currentScore * 0.7) + (analysis.score * 0.3)).toFixed(2));
    
    // Remove rascunhos antigos da tabela posts se houver
    await supabase.from('posts').delete().eq('offer_id', item.id).eq('status', 'draft');

    const channels = ['telegram', 'instagram', 'whatsapp'];
    const linksMap = {};

    for (const channel of channels) {
      const subId = createSubId(channel, item.id);
      const trackedUrl = createTrackedUrl(subId);
      
      const { data: linkData } = await supabase.from('affiliate_links').upsert({
        user_id: ADMIN_USER_ID, 
        offer_id: item.id, 
        channel, 
        original_url: item.original_url, 
        tracked_url: trackedUrl, 
        sub_id: subId
      }, { onConflict: 'offer_id,channel' }).select('id').single();

      linksMap[channel] = { id: linkData.id, url: trackedUrl };
    }

    const postsToInsert = [
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.telegram.id, channel: 'telegram', content: analysis.telegram.replace('{LINK}', linksMap.telegram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.instagram.id, channel: 'instagram', content: analysis.instagram.replace('{LINK}', linksMap.instagram.url), status: 'draft' },
      { user_id: ADMIN_USER_ID, offer_id: item.id, affiliate_link_id: linksMap.whatsapp.id, channel: 'whatsapp', content: analysis.whatsapp.replace('{LINK}', linksMap.whatsapp.url), status: 'draft' }
    ];

    const { error: insertError } = await supabase.from('posts').insert(postsToInsert);
    if (insertError) {
      console.error(`  [Erro] Falha ao inserir posts: ${insertError.message}`);
      continue;
    }

    await supabase.from('offers').update({ status: 'approved', score: finalScore }).eq('id', item.id);
    console.log(`  ✓ Oferta promovida para 'approved' e Posts gerados!`);

    processed++;
    // Delay de segurança anti-rate limit
    await new Promise(r => setTimeout(r, 4000)); 
  }
  
  console.log(`\n✅ Resumo: ${processed} ofertas processadas com IA e prontas na Vercel.`);
}

// ─── CLI Entrypoint ───────────────────────────────────────────
if (require.main === module) {
  runAiProcessorCycle().then(() => {
    console.log("\n🚀 Cérebro de Marketing finalizou o ciclo.");
    process.exit(0);
  }).catch(err => {
    console.error("\n❌ Erro Crítico no AI Processor:", err);
    process.exit(1);
  });
}
