'use strict';

global.WebSocket = require('ws');

const fs = require('fs');
const os = require('os');
const path = require('path');
const { createClient } = require('@supabase/supabase-js');
require('dotenv').config({ path: '.env.local' });

const { LLMFactory } = require('../src/core/llm/factory');

const CHANNELS = ['telegram', 'instagram', 'whatsapp'];
const DRY_RUN = process.env.CONFIRM_SANITIZE !== '1';

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

function cleanJsonString(str) {
  return String(str || '')
    .trim()
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/, '')
    .replace(/\s*```$/, '')
    .trim();
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
  } catch (_) {
    return generateFallback(offer, store);
  }

  const strategy = raw?.strategies?.[0];
  if (!strategy) {
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

function isInvalidAmazonOffer(offer) {
  if (!offer || offer.platform !== 'Amazon') return false;

  const title = String(offer.product_name || '').trim().toLowerCase();
  const image = String(offer.image_url || '').trim().toLowerCase();
  const url = String(offer.original_url || '').trim().toLowerCase();
  const price = Number(offer.current_price || 0);

  const genericTitle = ['amazon', 'amazon.com.br', 'amazon brasil', 'amazon.com'].includes(title);
  const badImage = !image ||
    image.includes('/s/al-na') ||
    image.includes('sponsored-ads.amazon') ||
    image.includes('aax-us-east-retail') ||
    image.includes('nav-sprite') ||
    image.includes('sprite') ||
    image.includes('banner') ||
    image.includes('logo') ||
    image.includes('icon') ||
    image.includes('pixel') ||
    image.includes('placeholder') ||
    image.endsWith('.gif');
  const badUrl = !(url.includes('amazon.com.br') || url.includes('amzn.to'));

  return price <= 0 || genericTitle || badImage || badUrl;
}

function chooseBestPostToKeep(posts) {
  return [...posts].sort((a, b) => {
    const aPublished = a.status === 'published' ? 1 : 0;
    const bPublished = b.status === 'published' ? 1 : 0;
    if (bPublished !== aPublished) return bPublished - aPublished;

    const aLen = String(a.content || '').trim().length;
    const bLen = String(b.content || '').trim().length;
    if (bLen !== aLen) return bLen - aLen;

    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0] || null;
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

async function loadApprovedOffers() {
  const { data, error } = await supabase
    .from('offers')
    .select('id,user_id,product_name,current_price,old_price,original_url,platform,rating,status,image_url,score')
    .eq('status', 'approved')
    .order('updated_at', { ascending: true });

  if (error) throw error;
  return data || [];
}

async function loadActivePostsWithOffers() {
  const { data, error } = await supabase
    .from('posts')
    .select(`
      id,
      user_id,
      offer_id,
      affiliate_link_id,
      channel,
      status,
      content,
      created_at,
      offers!inner(
        id,
        user_id,
        product_name,
        current_price,
        old_price,
        original_url,
        platform,
        status,
        image_url,
        rating
      )
    `)
    .neq('status', 'deleted')
    .order('created_at', { ascending: false })
    .limit(20000);

  if (error) throw error;
  return data || [];
}

function buildPlan(approvedOffers, activePosts) {
  const postsByOffer = new Map();
  const postsByOfferChannel = new Map();

  for (const post of activePosts) {
    const offerId = post.offer_id;
    if (!postsByOffer.has(offerId)) postsByOffer.set(offerId, []);
    postsByOffer.get(offerId).push(post);

    const key = `${offerId}::${post.channel}`;
    if (!postsByOfferChannel.has(key)) postsByOfferChannel.set(key, []);
    postsByOfferChannel.get(key).push(post);
  }

  const invalidAmazonPosts = [];
  for (const post of activePosts) {
    if (isInvalidAmazonOffer(post.offers)) {
      invalidAmazonPosts.push({
        postId: post.id,
        offerId: post.offer_id,
        channel: post.channel,
        status: post.status,
        created_at: post.created_at
      });
    }
  }

  const duplicateGroups = [];
  for (const [key, posts] of postsByOfferChannel.entries()) {
    if (posts.length <= 1) continue;
    const keep = chooseBestPostToKeep(posts);
    const deletePosts = posts.filter((post) => post.id !== keep.id);
    duplicateGroups.push({
      key,
      offerId: keep.offer_id,
      channel: keep.channel,
      keepPostId: keep.id,
      deletePostIds: deletePosts.map((post) => post.id)
    });
  }

  const deleteIds = new Set(invalidAmazonPosts.map((post) => post.postId));
  for (const group of duplicateGroups) {
    for (const postId of group.deletePostIds) {
      deleteIds.add(postId);
    }
  }

  const activeAfterPlanByOffer = new Map();
  for (const post of activePosts) {
    if (deleteIds.has(post.id)) continue;
    if (!activeAfterPlanByOffer.has(post.offer_id)) activeAfterPlanByOffer.set(post.offer_id, []);
    activeAfterPlanByOffer.get(post.offer_id).push(post);
  }

  const offersToBackfill = [];
  const incompleteApprovedOffers = [];
  for (const offer of approvedOffers) {
    const remainingPosts = activeAfterPlanByOffer.get(offer.id) || [];
    const activeChannels = new Set(remainingPosts.map((post) => post.channel));
    const missingChannels = CHANNELS.filter((channel) => !activeChannels.has(channel));

    if (missingChannels.length > 0) {
      const incompleteEntry = {
        offer,
        missingChannels
      };
      incompleteApprovedOffers.push(incompleteEntry);
      if (!isInvalidAmazonOffer(offer)) {
        offersToBackfill.push(incompleteEntry);
      }
    }
  }

  const invalidIncompleteOffers = incompleteApprovedOffers.filter((entry) => isInvalidAmazonOffer(entry.offer));
  const potentiallyValidIncompleteOffers = incompleteApprovedOffers.filter((entry) => !isInvalidAmazonOffer(entry.offer));

  return {
    invalidAmazonPosts,
    duplicateGroups,
    deleteIds: [...deleteIds],
    offersToBackfill,
    incompleteApprovedOffers,
    invalidIncompleteOffers,
    potentiallyValidIncompleteOffers
  };
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

async function getStillActiveChannels(offerId) {
  const { data, error } = await supabase
    .from('posts')
    .select('channel')
    .eq('offer_id', offerId)
    .neq('status', 'deleted');

  if (error) throw error;
  return new Set((data || []).map((post) => post.channel));
}

async function markPostsDeleted(postIds) {
  if (postIds.length === 0) return;
  const { error } = await supabase
    .from('posts')
    .update({ status: 'deleted' })
    .in('id', postIds);

  if (error) {
    throw new Error(`Falha ao marcar posts deleted: ${error.message}`);
  }
}

async function collectFinalValidation() {
  const approvedOffers = await loadApprovedOffers();
  const activePosts = await loadActivePostsWithOffers();
  const draftCounts = await countDraftPosts();
  const plan = buildPlan(approvedOffers, activePosts);

  return {
    approvedOffers: approvedOffers.length,
    invalidAmazonActivePosts: plan.invalidAmazonPosts.length,
    duplicateActiveGroups: plan.duplicateGroups.length,
    approvedOffersMissingChannels: plan.incompleteApprovedOffers.length,
    approvedOffersMissingChannelsExcludingPotentiallyValidPending: plan.invalidIncompleteOffers.length,
    potentiallyValidPendingIds: plan.potentiallyValidIncompleteOffers.map((entry) => entry.offer.id),
    draftCounts
  };
}

async function rejectOffers(offerIds) {
  if (offerIds.length === 0) return;
  const { error } = await supabase
    .from('offers')
    .update({ status: 'rejected' })
    .in('id', offerIds);

  if (error) {
    throw new Error(`Falha ao rejeitar offers: ${error.message}`);
  }
}

function writeReport(report) {
  const reportPath = path.join(os.tmpdir(), `sanitize-posts-integrity-report-${Date.now()}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2), 'utf8');
  console.log(`REPORT_PATH\t${reportPath}`);
}

async function run() {
  const approvedOffers = await loadApprovedOffers();
  const activePosts = await loadActivePostsWithOffers();
  const draftBefore = await countDraftPosts();
  const plan = buildPlan(approvedOffers, activePosts);

  const report = {
    dryRun: DRY_RUN,
    totalAnalyzed: {
      approvedOffers: approvedOffers.length,
      activePosts: activePosts.length
    },
    invalidAmazonPostsToDelete: plan.invalidAmazonPosts.length,
    invalidAmazonPostsSample: plan.invalidAmazonPosts.slice(0, 10),
    duplicateGroupsToFix: plan.duplicateGroups.length,
    duplicateGroupsSample: plan.duplicateGroups.slice(0, 10),
    offersToCorrect: plan.offersToBackfill.length,
    offersToCorrectSample: plan.offersToBackfill.slice(0, 10).map((entry) => ({
      offerId: entry.offer.id,
      missingChannels: entry.missingChannels
    })),
    incompleteApprovedOffers: plan.incompleteApprovedOffers.length,
    invalidIncompleteOffers: plan.invalidIncompleteOffers.length,
    invalidIncompleteOfferIds: plan.invalidIncompleteOffers.map((entry) => entry.offer.id),
    potentiallyValidIncompleteOffers: plan.potentiallyValidIncompleteOffers.length,
    potentiallyValidIncompleteOfferIds: plan.potentiallyValidIncompleteOffers.map((entry) => entry.offer.id),
    draftBefore,
    wouldCreateByChannel: { telegram: 0, instagram: 0, whatsapp: 0 },
    markedDeleted: 0,
    duplicatesCorrected: 0,
    rejectedOffers: 0,
    offersCorrected: 0,
    createdByChannel: { telegram: 0, instagram: 0, whatsapp: 0 },
    failures: []
  };

  for (const entry of plan.offersToBackfill) {
    for (const channel of entry.missingChannels) {
      report.wouldCreateByChannel[channel]++;
    }
  }

  console.log(`MODE\t${DRY_RUN ? 'DRY_RUN' : 'WRITE'}`);
  console.log(`TOTAL_APPROVED_OFFERS\t${report.totalAnalyzed.approvedOffers}`);
  console.log(`TOTAL_ACTIVE_POSTS\t${report.totalAnalyzed.activePosts}`);
  console.log(`INVALID_AMAZON_POSTS_TO_DELETE\t${report.invalidAmazonPostsToDelete}`);
  console.log(`DUPLICATE_GROUPS_TO_FIX\t${report.duplicateGroupsToFix}`);
  console.log(`INCOMPLETE_APPROVED_OFFERS\t${report.incompleteApprovedOffers}`);
  console.log(`INVALID_INCOMPLETE_OFFERS\t${report.invalidIncompleteOffers}`);
  console.log(`POTENTIALLY_VALID_INCOMPLETE_OFFERS\t${report.potentiallyValidIncompleteOffers}`);
  console.log(`POTENTIALLY_VALID_IDS\t${report.potentiallyValidIncompleteOfferIds.join(',') || '(none)'}`);
  console.log(`DRAFT_BEFORE\t${JSON.stringify(report.draftBefore)}`);

  if (DRY_RUN) {
    report.finalValidation = {
      invalidAmazonActivePosts: report.invalidAmazonPostsToDelete,
      duplicateActiveGroups: report.duplicateGroupsToFix,
      approvedOffersMissingChannels: report.incompleteApprovedOffers,
      approvedOffersMissingChannelsExcludingPotentiallyValidPending: report.invalidIncompleteOffers,
      potentiallyValidPendingIds: report.potentiallyValidIncompleteOfferIds,
      draftCounts: draftBefore
    };
    writeReport(report);
    return report;
  }

  try {
    await markPostsDeleted(plan.deleteIds);
    report.markedDeleted = plan.deleteIds.length;
    report.duplicatesCorrected = plan.duplicateGroups.length;
  } catch (error) {
    report.failures.push({ stage: 'delete-posts', message: error.message });
    throw error;
  }

  try {
    await rejectOffers(report.invalidIncompleteOfferIds);
    report.rejectedOffers = report.invalidIncompleteOfferIds.length;
  } catch (error) {
    report.failures.push({ stage: 'reject-offers', message: error.message });
    throw error;
  }

  report.finalValidation = await collectFinalValidation();
  console.log(`MARKED_DELETED\t${report.markedDeleted}`);
  console.log(`DUPLICATES_CORRECTED\t${report.duplicatesCorrected}`);
  console.log(`REJECTED_OFFERS\t${report.rejectedOffers}`);
  console.log(`POTENTIALLY_VALID_IDS\t${report.potentiallyValidIncompleteOfferIds.join(',') || '(none)'}`);
  console.log(`FINAL_VALIDATION\t${JSON.stringify(report.finalValidation)}`);
  writeReport(report);
  return report;
}

run().catch((error) => {
  console.error(`SANITIZE_FATAL\t${error.message}`);
  process.exit(1);
});
