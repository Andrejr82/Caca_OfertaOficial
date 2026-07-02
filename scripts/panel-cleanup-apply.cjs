'use strict';

global.WebSocket = require('ws');

require('dotenv').config({ path: '.env.local' });

const { createClient } = require('@supabase/supabase-js');

const DRY_RUN = process.env.DRY_RUN !== 'false';
const APPLY_CLEANUP = process.env.APPLY_CLEANUP === '1';
const CAN_WRITE = APPLY_CLEANUP && !DRY_RUN;

const VALID_MARKETPLACES = new Set(['Shopee', 'Amazon', 'Magalu', 'Mercado Livre', 'Shein', 'Netshoes']);
const TRACKING_PARAMS = [
  'tag',
  'ascsubtag',
  'utm_source',
  'utm_medium',
  'utm_campaign',
  'utm_content',
  'utm_term',
  'sub_id',
  'subid',
  'fbclid',
  'gclid',
  'gbraid',
  'wbraid',
];
const STATUS_RANK = {
  posted: 4,
  published: 4,
  approved: 3,
  draft: 2,
  rejected: 1,
  failed: 1,
};

function hashString(input) {
  let hash = 2166136261;
  for (let i = 0; i < input.length; i++) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16).padStart(8, '0');
}

function normalizeProductTitle(title) {
  return String(title || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\b(azul|preto|branco|bege|verde|vermelho|rosa|cinza|masculino|feminino)\b/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function parseOfferPrice(value) {
  if (typeof value === 'number') return Number.isFinite(value) ? value : 0;
  const cleaned = String(value || '')
    .replace(/[R$\s]/g, '')
    .replace(/\./g, '')
    .replace(',', '.');
  return parseFloat(cleaned) || 0;
}

function canonicalizeOfferUrl(url) {
  try {
    let parsedUrl = new URL(String(url || '').trim());
    const unwrapParam = ['murl', 'url', 'u'].find((param) => {
      const value = parsedUrl.searchParams.get(param);
      return value && value.startsWith('http');
    });

    if (unwrapParam) {
      parsedUrl = new URL(parsedUrl.searchParams.get(unwrapParam));
    }

    TRACKING_PARAMS.forEach((param) => parsedUrl.searchParams.delete(param));
    parsedUrl.hash = '';
    parsedUrl.hostname = parsedUrl.hostname.toLowerCase().replace(/^www\./, '');
    parsedUrl.pathname = parsedUrl.pathname.replace(/\/+$/, '');

    return parsedUrl.toString().toLowerCase();
  } catch (_) {
    return null;
  }
}

function buildOfferContentHash(input) {
  const roundedPrice = Math.round(input.price * 100) / 100;
  return hashString(`${input.platform}|${input.normalizedTitle}|${roundedPrice}|${input.canonicalUrl}`);
}

function isBlacklistedTitle(title) {
  const trimmed = String(title || '').trim();
  return [
    /^Produto\s*\d*$/i,
    /^Item\s*\d*$/i,
    /^Example\s*\d*$/i,
    /^Placeholder\s*\d*$/i,
    /^Lorem\s*ipsum/i,
    /^Unknown$/i,
    /^Teste$/i,
    /^Generic\s*Product$/i,
    /^Sem\s*Nome$/i,
    /^Produto\s*Gen[ée]rico$/i,
    /Nome\s*limpo\s*do\s*produto/i,
  ].some((regex) => regex.test(trimmed));
}

function isBlacklistedImage(imageUrl) {
  if (!imageUrl) return true;
  const lowerUrl = String(imageUrl).toLowerCase();
  if (['unsplash.com', 'picsum.photos', 'placeholder.com', 'mock', 'example.com', 'data:image', 'svg'].some((blocked) => lowerUrl.includes(blocked))) {
    return true;
  }
  return !lowerUrl.startsWith('http://') && !lowerUrl.startsWith('https://');
}

function getBadImageReason(imageUrl) {
  const lower = String(imageUrl || '').trim().toLowerCase();
  if (!lower || lower === 'null' || lower.length < 5) return 'SEM_IMAGEM';
  if (!lower.startsWith('http://') && !lower.startsWith('https://')) return 'IMAGEM_URL_INVALIDA';
  if (lower.startsWith('data:')) return 'IMAGEM_DATA_URI';
  if (lower.includes('.svg') || lower.endsWith('svg')) return 'IMAGEM_SVG';
  if (lower.includes('placeholder') || lower.includes('via.placeholder') || lower.includes('picsum') || lower.includes('unsplash')) {
    return 'IMAGEM_PLACEHOLDER';
  }
  if (
    lower.includes('favicon') ||
    lower.includes('logo') ||
    lower.includes('sprite') ||
    lower.includes('icon') ||
    lower.includes('banner') ||
    lower.includes('nav-sprite') ||
    lower.includes('/s/al-na') ||
    lower.includes('sponsored-ads.amazon') ||
    lower.includes('aax-us-east-retail')
  ) {
    return 'IMAGEM_PROMOCIONAL_OU_LOGO';
  }
  if (lower.includes('pixel') || /[?&](w|width|h|height)=1(&|$)/.test(lower) || /[\/_-]1x1[\/_.-]/.test(lower)) {
    return 'IMAGEM_1X1';
  }

  const dimensions = lower.match(/(?:^|[\/_-])(\d{1,4})x(\d{1,4})(?:[\/_.-]|$)/);
  if (dimensions) {
    const width = Number(dimensions[1]);
    const height = Number(dimensions[2]);
    if (width <= 100 || height <= 100) return 'IMAGEM_PEQUENA';
  }

  return null;
}

function validateOfferForPersistence(product) {
  if (!product || typeof product !== 'object') {
    return { valid: false, rejectReason: 'OBJETO_INVALIDO', canonicalUrl: null, contentHash: null, normalizedTitle: null, platform: null, price: null };
  }

  const title = String(product.product_name || product.title || '').trim();
  const platform = String(product.platform || product.marketplace || '').trim();
  const price = parseOfferPrice(product.current_price ?? product.price);
  const rawUrl = String(product.original_url || product.url || '').trim();
  const image = String(product.image_url || product.image || '').trim();
  const canonicalUrl = canonicalizeOfferUrl(rawUrl);
  const normalizedTitle = title ? normalizeProductTitle(title) : null;

  if (!title || title.length < 15 || title.length > 250) {
    return { valid: false, rejectReason: 'TITULO_INVALIDO', canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (isBlacklistedTitle(title) || (!title.includes(' ') && title.length > 15)) {
    return { valid: false, rejectReason: 'TITULO_INVALIDO', canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (price <= 0 || price > 50000) {
    return { valid: false, rejectReason: 'PRECO_INVALIDO', canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (!VALID_MARKETPLACES.has(platform)) {
    return { valid: false, rejectReason: 'MARKETPLACE_INVALIDO', canonicalUrl, contentHash: null, normalizedTitle, platform: null, price };
  }
  if (!canonicalUrl) {
    return { valid: false, rejectReason: 'URL_INVALIDA', canonicalUrl, contentHash: null, normalizedTitle, platform, price };
  }

  const badImageReason = getBadImageReason(image);
  if (badImageReason) {
    return { valid: false, rejectReason: badImageReason, canonicalUrl, contentHash: null, normalizedTitle, platform, price };
  }
  if (isBlacklistedImage(image)) {
    return { valid: false, rejectReason: 'BLACKLIST_IMAGE', canonicalUrl, contentHash: null, normalizedTitle, platform, price };
  }

  const contentHash = buildOfferContentHash({ platform, normalizedTitle: normalizedTitle || '', price, canonicalUrl });
  return { valid: true, rejectReason: null, canonicalUrl, contentHash, normalizedTitle, platform, price };
}

function groupByDuplicates(items, getKey) {
  const groups = new Map();
  for (const item of items) {
    const key = getKey(item);
    if (!key) continue;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(item);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

function chooseOfferKeep(group) {
  return [...group].sort((a, b) => {
    const statusDelta = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
    if (statusDelta) return statusDelta;
    return new Date(b.updated_at || b.created_at).getTime() - new Date(a.updated_at || a.created_at).getTime();
  })[0];
}

function choosePostKeep(group) {
  return [...group].sort((a, b) => {
    const statusDelta = (STATUS_RANK[b.status] || 0) - (STATUS_RANK[a.status] || 0);
    if (statusDelta) return statusDelta;
    const lengthDelta = String(b.content || '').length - String(a.content || '').length;
    if (lengthDelta) return lengthDelta;
    return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
  })[0];
}

function compactOffer(offer, reason) {
  return {
    id: offer.id,
    reason,
    status: offer.status,
    platform: offer.platform,
    name: String(offer.product_name || '').slice(0, 90),
  };
}

function compactPost(post, reason) {
  return {
    id: post.id,
    reason,
    offer_id: post.offer_id,
    channel: post.channel,
    status: post.status,
  };
}

function countBy(items, getKey) {
  return items.reduce((acc, item) => {
    const key = getKey(item);
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

function buildPlan(offers, posts) {
  const offerById = new Map(offers.map((offer) => [offer.id, offer]));
  const invalidOffers = [];
  const validForDup = [];

  for (const offer of offers) {
    const validation = validateOfferForPersistence(offer);
    offer.__validation = validation;

    if (!validation.valid) {
      invalidOffers.push({ offer, reason: validation.rejectReason });
    } else {
      validForDup.push(offer);
    }
  }

  const urlGroups = groupByDuplicates(validForDup, (offer) => `${offer.user_id}|${offer.__validation.canonicalUrl}`);
  const hashGroups = groupByDuplicates(validForDup, (offer) => `${offer.user_id}|${offer.__validation.contentHash}`);
  const titleGroups = groupByDuplicates(validForDup, (offer) => {
    return `${offer.user_id}|${offer.platform}|${normalizeProductTitle(offer.product_name || '')}|${Number(offer.current_price || 0)}`;
  });

  const duplicateGroupMap = new Map();
  for (const group of [...urlGroups, ...hashGroups, ...titleGroups]) {
    const ids = [...new Set(group.map((offer) => offer.id))].sort().join('|');
    if (ids) duplicateGroupMap.set(ids, group);
  }

  const duplicateOfferPlans = [];
  const duplicateOfferRejectIds = new Set();

  for (const group of duplicateGroupMap.values()) {
    const keep = chooseOfferKeep(group);
    const reject = group.filter((offer) => offer.id !== keep.id);
    reject.forEach((offer) => duplicateOfferRejectIds.add(offer.id));
    duplicateOfferPlans.push({
      keep: compactOffer(keep, 'KEEP_DUPLICATE_PRIMARY'),
      reject: reject.map((offer) => compactOffer(offer, 'DUPLICATE_OFFER')),
      size: group.length,
    });
  }

  const invalidOfferIds = new Set(invalidOffers.map((entry) => entry.offer.id));
  const offersToReject = new Map();

  for (const entry of invalidOffers) {
    offersToReject.set(entry.offer.id, compactOffer(entry.offer, entry.reason));
  }

  for (const id of duplicateOfferRejectIds) {
    const offer = offerById.get(id);
    if (offer && !offersToReject.has(id)) {
      offersToReject.set(id, compactOffer(offer, 'DUPLICATE_OFFER'));
    }
  }

  const duplicatePostPlans = [];
  const postsToDelete = new Map();
  const postGroups = groupByDuplicates(posts, (post) => `${post.offer_id}|${post.channel}`);

  for (const group of postGroups) {
    const keep = choosePostKeep(group);
    const deletePosts = group.filter((post) => post.id !== keep.id);
    duplicatePostPlans.push({
      offer_id: keep.offer_id,
      channel: keep.channel,
      keep: { id: keep.id, status: keep.status },
      delete: deletePosts.map((post) => ({ id: post.id, status: post.status })),
    });

    for (const post of deletePosts) {
      postsToDelete.set(post.id, compactPost(post, 'DUPLICATE_POST_OFFER_CHANNEL'));
    }
  }

  for (const post of posts) {
    const offer = offerById.get(post.offer_id);
    if (!offer) {
      postsToDelete.set(post.id, compactPost(post, 'OFFER_NOT_FOUND'));
      continue;
    }

    if (invalidOfferIds.has(offer.id)) {
      postsToDelete.set(post.id, compactPost(post, `BAD_OFFER_${offer.__validation.rejectReason}`));
    }

    if (duplicateOfferRejectIds.has(offer.id)) {
      postsToDelete.set(post.id, compactPost(post, 'DUPLICATE_OFFER_POST'));
    }
  }

  const allOffersToReject = [...offersToReject.values()];
  const allPostsToDelete = [...postsToDelete.values()];
  const actionableOffersToReject = allOffersToReject.filter((offer) => offer.status !== 'rejected');

  return {
    analyzed: {
      offers: offers.length,
      activePosts: posts.length,
    },
    allOffersToReject,
    allPostsToDelete,
    actionableOffersToReject,
    duplicateOfferPlans,
    duplicatePostPlans,
    totals: {
      posts_marked_deleted: allPostsToDelete.length,
      offers_rejected: allOffersToReject.length,
      actionable_offers_rejected: actionableOffersToReject.length,
      duplicate_post_groups: duplicatePostPlans.length,
      duplicate_offer_groups: duplicateOfferPlans.length,
      duplicate_offers_rejected: duplicateOfferRejectIds.size,
    },
    reasons: {
      offers: countBy(allOffersToReject, (offer) => offer.reason),
      posts: countBy(allPostsToDelete, (post) => post.reason),
    },
    examples: {
      offers_rejected: allOffersToReject.slice(0, 8),
      posts_marked_deleted: allPostsToDelete.slice(0, 8),
      duplicate_offers: duplicateOfferPlans.slice(0, 5),
      duplicate_posts: duplicatePostPlans.slice(0, 5),
    },
  };
}

async function loadCurrentData(supabase) {
  const { data: offers, error: offersError } = await supabase
    .from('offers')
    .select('id,user_id,platform,product_name,original_url,image_url,current_price,status,score,coupon,created_at,updated_at')
    .limit(10000);

  if (offersError) throw offersError;

  const { data: posts, error: postsError } = await supabase
    .from('posts')
    .select('id,user_id,offer_id,channel,content,status,created_at,posted_at,affiliate_link_id')
    .neq('status', 'deleted')
    .limit(20000);

  if (postsError) throw postsError;

  return {
    offers: offers || [],
    posts: posts || [],
  };
}

function chunk(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

async function updateInChunks(supabase, table, ids, payload) {
  let affected = 0;
  for (const idChunk of chunk(ids, 100)) {
    if (idChunk.length === 0) continue;
    const { data, error } = await supabase
      .from(table)
      .update(payload)
      .in('id', idChunk)
      .select('id');

    if (error) throw error;
    affected += (data || []).length;
  }
  return affected;
}

async function main() {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.SUPABASE_SERVICE_ROLE_KEY) {
    throw new Error('Supabase env ausente.');
  }

  const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const current = await loadCurrentData(supabase);
  const plan = buildPlan(current.offers, current.posts);

  console.log(JSON.stringify({
    mode: CAN_WRITE ? 'APPLY' : 'DRY_RUN',
    dry_run: DRY_RUN,
    apply_cleanup: APPLY_CLEANUP,
    analyzed: plan.analyzed,
    totals: plan.totals,
    reasons: plan.reasons,
    examples: plan.examples,
  }, null, 2));

  if (!CAN_WRITE) {
    console.log('DRY_RUN=true: nenhuma escrita executada.');
    return;
  }

  const now = new Date().toISOString();
  const postIds = plan.allPostsToDelete.map((post) => post.id);
  const offerIds = plan.actionableOffersToReject.map((offer) => offer.id);

  const postsUpdated = await updateInChunks(supabase, 'posts', postIds, {
    status: 'deleted',
    deleted_at: now,
  });

  const offersUpdated = await updateInChunks(supabase, 'offers', offerIds, {
    status: 'rejected',
    updated_at: now,
  });

  const after = await loadCurrentData(supabase);
  const validationPlan = buildPlan(after.offers, after.posts);

  console.log(JSON.stringify({
    applied: {
      posts_marked_deleted: postsUpdated,
      offers_marked_rejected: offersUpdated,
      duplicate_post_groups_resolved: plan.totals.duplicate_post_groups,
      duplicate_offer_groups_resolved: plan.totals.duplicate_offer_groups,
    },
    final_validation: {
      active_posts_still_targeted: validationPlan.allPostsToDelete.length,
      actionable_offers_still_targeted: validationPlan.actionableOffersToReject.length,
      full_rejected_or_bad_offers_still_counted_if_including_rejected_status: validationPlan.allOffersToReject.length,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error('[panel-cleanup-apply] failed:', error.message || error);
  process.exit(1);
});
