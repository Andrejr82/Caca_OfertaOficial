'use strict';

global.WebSocket = require('ws');

const fs = require('fs');
const path = require('path');
const os = require('os');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const { LLMFactory } = require('../src/core/llm/factory');

const CHANNELS = ['telegram', 'instagram', 'whatsapp'];
const DRY_RUN = process.env.CONFIRM_BACKFILL !== '1';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  {
    auth: { autoRefreshToken: false, persistSession: false }
  }
);

function createSubId(channel, offerId) {
  const shortId = offerId.replace(/-/g, '').slice(0, 8);
  const prefixes = { telegram: 'tg', instagram: 'ig', whatsapp: 'wp' };
  return `${prefixes[channel] || 'x'}_${shortId}`;
}

function createTrackedUrl(subId) {
  const baseUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://caca-oferta-oficial.vercel.app';
  return `${baseUrl}/go/${subId}`;
}

function generateFallback(offer, store) {
  const pStr = offer.current_price ? Number(offer.current_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = offer.old_price ? Number(offer.old_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const priceBlock = opStr ? `de ${opStr}\n🔥 por ${pStr}` : `🔥 por ${pStr}`;
  const bottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'} 👇🏼\n🔗 {LINK}\n\n🚨 CHAMA seus amigos para receber promoções\nhttps://t.me/caca_ofertaoficial`;
  const instagramBottomBlock = `\n${priceBlock}\n\n🛒 Achado ${store || 'Especial'}\n\n🛍️ Quer garantir essa oferta?\n👉 Acesse a nossa **VITRINE** no link da BIO do perfil! Lá você encontra o link direto para comprar com segurança.\n\nCorre antes que esgote! 🏃‍♂️💨`;

  return {
    score: 5.0,
    telegram: `🚨 *Oferta: ${offer.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}\n\n#oferta`,
    instagram: `🚨 *Oferta: ${offer.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${instagramBottomBlock}\n\n#oferta`,
    whatsapp: `🚨 *Oferta: ${offer.product_name}*\n\nPreço especial detectado.\n\n👉 Compre agora!\n${bottomBlock}`
  };
}

async function generateOfferAnalysis(offer, store) {
  const baseSystemPrompt = `Você é um Copywriter de ELITE especializado em marketing de afiliados de alta conversão. Respond in JSON.
Sua persona: Administrador eufórico de grupos de ofertas. Foco em escassez extrema e descontos.
Regras:
1. Ignore criação de links, injetaremos depois.
2. Coloque hashtags no array 'hashtags'.
3. Ignore preços monetários, injetaremos depois.
Formato: JSON com strategies[{headline, hook, body, cta, score}], hashtags[].`;

  const userPrompt = `Gerar copy para:
Nome: ${offer.product_name}
Loja: ${store}

RETORNE EXATAMENTE NESTE FORMATO JSON:
{
  "strategies": [
    { "headline": "...", "hook": "...", "body": "...", "cta": "...", "score": 9.5 }
  ],
  "hashtags": ["#oferta"]
}`;

  let raw;
  try {
    raw = await LLMFactory.generateWithFallback(baseSystemPrompt, userPrompt, true);
  } catch (error) {
    console.error(`  [IA] Erro crítico em ${offer.id}: ${error.message}`);
    return generateFallback(offer, store);
  }

  const strategy = raw?.strategies?.[0];
  if (!strategy) {
    console.warn(`  [IA] Sem strategy em ${offer.id}. Usando fallback.`);
    return generateFallback(offer, store);
  }

  const hashtags = (raw.hashtags || ['#promocao']).map((h) => h.startsWith('#') ? h : `#${h}`).join(' ');
  const pStr = offer.current_price ? Number(offer.current_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
  const opStr = offer.old_price ? Number(offer.old_price).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }) : '';
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

async function countDraftPosts() {
  const counts = {};
  for (const channel of CHANNELS) {
    const { count, error } = await supabase
      .from('posts')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'draft')
      .eq('channel', channel);
    if (error) throw error;
    counts[channel] = count || 0;
  }
  return counts;
}

async function loadApprovedOffersWithMissingChannels() {
  const { data: offers, error: offersError } = await supabase
    .from('offers')
    .select('id,user_id,product_name,current_price,old_price,original_url,platform,rating,status')
    .eq('status', 'approved')
    .order('updated_at', { ascending: true });

  if (offersError) throw offersError;

  const offerIds = (offers || []).map((offer) => offer.id);
  if (offerIds.length === 0) {
    return [];
  }

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('offer_id,channel,status')
    .in('offer_id', offerIds)
    .neq('status', 'deleted');

  if (postsError) throw postsError;

  const activeChannelsByOffer = new Map();
  for (const post of posts || []) {
    if (!activeChannelsByOffer.has(post.offer_id)) {
      activeChannelsByOffer.set(post.offer_id, new Set());
    }
    activeChannelsByOffer.get(post.offer_id).add(post.channel);
  }

  return (offers || [])
    .map((offer) => {
      const activeChannels = activeChannelsByOffer.get(offer.id) || new Set();
      const missingChannels = CHANNELS.filter((channel) => !activeChannels.has(channel));
      return { offer, missingChannels };
    })
    .filter((entry) => entry.missingChannels.length > 0);
}

async function getStillMissingChannels(offerId) {
  const { data, error } = await supabase
    .from('posts')
    .select('channel,status')
    .eq('offer_id', offerId)
    .neq('status', 'deleted');

  if (error) throw error;

  const activeChannels = new Set((data || []).map((post) => post.channel));
  return CHANNELS.filter((channel) => !activeChannels.has(channel));
}

async function ensureLink(offer, channel) {
  const subId = createSubId(channel, offer.id);
  const trackedUrl = createTrackedUrl(subId);
  const { data, error } = await supabase
    .from('affiliate_links')
    .upsert({
      user_id: offer.user_id,
      offer_id: offer.id,
      channel,
      original_url: offer.original_url,
      tracked_url: trackedUrl,
      sub_id: subId
    }, { onConflict: 'offer_id,channel' })
    .select('id,tracked_url')
    .single();

  if (error || !data?.id) {
    throw new Error(`Falha ao garantir affiliate_link ${channel}: ${error?.message || 'id ausente'}`);
  }

  return data;
}

async function run() {
  const draftBefore = await countDraftPosts();
  const candidates = await loadApprovedOffersWithMissingChannels();
  const report = {
    dryRun: DRY_RUN,
    approvedOffersWithMissingPosts: candidates.length,
    first10OfferIds: candidates.slice(0, 10).map((entry) => entry.offer.id),
    first10MissingChannels: candidates.slice(0, 10).map((entry) => ({ id: entry.offer.id, missingChannels: entry.missingChannels })),
    draftBefore,
    createdByChannel: { telegram: 0, instagram: 0, whatsapp: 0 },
    correctedOffers: 0,
    skippedOffers: 0,
    failedOffers: 0,
    failures: []
  };

  console.log(`MODE\t${DRY_RUN ? 'DRY_RUN' : 'WRITE'}`);
  console.log(`OFFERS_TO_FIX\t${report.approvedOffersWithMissingPosts}`);
  console.log(`FIRST_10_IDS\t${report.first10OfferIds.join(',') || '(none)'}`);
  console.log(`FIRST_10_DETAILS\t${JSON.stringify(report.first10MissingChannels)}`);

  if (DRY_RUN) {
    const dryRunChannelTotals = { telegram: 0, instagram: 0, whatsapp: 0 };
    for (const entry of candidates) {
      for (const channel of entry.missingChannels) {
        dryRunChannelTotals[channel]++;
      }
    }
    report.wouldCreateByChannel = dryRunChannelTotals;
    console.log(`WOULD_CREATE_BY_CHANNEL\t${JSON.stringify(dryRunChannelTotals)}`);
    writeReport(report);
    return report;
  }

  for (const entry of candidates) {
    const { offer } = entry;

    try {
      const stillMissingChannels = await getStillMissingChannels(offer.id);
      if (stillMissingChannels.length === 0) {
        report.skippedOffers++;
        continue;
      }

      const links = {};
      for (const channel of stillMissingChannels) {
        links[channel] = await ensureLink(offer, channel);
      }

      const analysis = await generateOfferAnalysis(offer, offer.platform);
      const postsToInsert = stillMissingChannels.map((channel) => ({
        user_id: offer.user_id,
        offer_id: offer.id,
        affiliate_link_id: links[channel].id,
        channel,
        content: analysis[channel].replace('{LINK}', links[channel].tracked_url),
        status: 'draft'
      }));

      if (postsToInsert.length === 0) {
        report.skippedOffers++;
        continue;
      }

      const { error: insertError } = await supabase.from('posts').insert(postsToInsert);
      if (insertError) {
        throw new Error(`Falha ao inserir posts: ${insertError.message}`);
      }

      report.correctedOffers++;
      for (const post of postsToInsert) {
        report.createdByChannel[post.channel]++;
      }
    } catch (error) {
      report.failedOffers++;
      report.failures.push({ offerId: offer.id, message: error.message });
      console.error(`BACKFILL_FAIL\t${offer.id}\t${error.message}`);
    }
  }

  report.draftAfter = await countDraftPosts();
  console.log(`CORRECTED_OFFERS\t${report.correctedOffers}`);
  console.log(`CREATED_BY_CHANNEL\t${JSON.stringify(report.createdByChannel)}`);
  console.log(`FAILED_OFFERS\t${report.failedOffers}`);
  console.log(`DRAFT_BEFORE\t${JSON.stringify(report.draftBefore)}`);
  console.log(`DRAFT_AFTER\t${JSON.stringify(report.draftAfter)}`);
  writeReport(report);
  return report;
}

function writeReport(report) {
  const reportPath = path.join(os.tmpdir(), `backfill-approved-posts-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`REPORT_PATH\t${reportPath}`);
}

run().catch((error) => {
  console.error(`BACKFILL_FATAL\t${error.message}`);
  process.exit(1);
});
