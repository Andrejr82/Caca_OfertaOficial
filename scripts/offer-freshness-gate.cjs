'use strict';

const DEFAULT_COOLDOWN_DAYS = Object.freeze({
  'Mercado Livre': 14,
  Amazon: 14,
  Shopee: 7,
});

function normalizeTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

function identityFor(marketplace, product) {
  const metrics = product?.marketplaceMetrics || {};
  const m = String(marketplace || '').toLowerCase();
  if (m === 'mercado livre') return String(metrics.item_id || metrics.itemId || product?.sourceItemId || '');
  if (m === 'amazon') return String(metrics.asin || metrics.product_id || product?.sourceItemId || '').toUpperCase();
  if (m === 'shopee') return [metrics.shop_id || metrics.shopId || '', metrics.shopee_item_id || metrics.itemId || product?.sourceItemId || ''].join(':');
  return String(product?.sourceItemId || '');
}

function isMateriallyBetter(product, previous) {
  const current = Number(product?.currentPrice);
  const old = Number(previous?.current_price ?? previous?.currentPrice);
  if (Number.isFinite(current) && Number.isFinite(old) && old > 0 && current <= old * 0.9) return true;
  const currentOriginal = Number(product?.originalPrice);
  const previousOriginal = Number(previous?.old_price ?? previous?.originalPrice);
  if (Number.isFinite(current) && Number.isFinite(currentOriginal) && currentOriginal > current) {
    const currentDiscount = ((currentOriginal - current) / currentOriginal) * 100;
    const previousDiscount = Number.isFinite(previousOriginal) && previousOriginal > 0
      ? ((previousOriginal - old) / previousOriginal) * 100
      : 0;
    return currentDiscount >= previousDiscount + 10;
  }
  return false;
}

function hasPublicationEvidence(row = {}) {
  if (row.published === true || row.publication_evidence === true || row.posted_at || row.external_id) return true;
  const offerStatus = String(row.status || '').trim().toLowerCase();
  if (offerStatus === 'posted' || offerStatus === 'published') return true;
  const posts = Array.isArray(row.posts) ? row.posts : (row.posts ? [row.posts] : []);
  return posts.some((post) => {
    const status = String(post?.status || '').trim().toLowerCase();
    return status === 'published' || status === 'posted' || Boolean(post?.posted_at || post?.external_id);
  });
}

function evaluateCandidateFreshness(marketplace, product, history, options = {}) {
  const cooldownDays = Number(options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS[marketplace] ?? 7);
  const referenceTime = options.now ? new Date(options.now).getTime() : Date.now();
  const cutoff = referenceTime - cooldownDays * 24 * 60 * 60 * 1000;
  const targetIdentity = identityFor(marketplace, product);
  const targetTitle = normalizeTitle(product.title);

  let previous = null;
  for (const row of Array.isArray(history) ? history : []) {
    const rowIdentity = identityFor(marketplace, {
      sourceItemId: row.item_id || row.product_id || row.shopee_item_id,
      marketplaceMetrics: {
        item_id: row.item_id,
        product_id: row.product_id,
        shopee_item_id: row.shopee_item_id,
        shopee_shop_id: row.shopee_shop_id,
        itemId: row.item_id || row.shopee_item_id,
        shopId: row.shopee_shop_id || row.shop_id,
        asin: row.product_id,
      },
    });
    const rowTitle = normalizeTitle(row.product_name || row.title);
    if ((targetIdentity && rowIdentity && rowIdentity === targetIdentity) || (targetTitle && rowTitle && rowTitle === targetTitle)) {
      previous = row;
      break;
    }
  }

  if (!previous) {
    return {
      state: 'new',
      eligible: true,
      reason: 'novel_candidate',
      previousRow: null,
    };
  }

  const isPublished = hasPublicationEvidence(previous);
  if (!isPublished) {
    return {
      state: 'known_unpublished',
      eligible: true,
      reason: 'known_unpublished_revalidated',
      previousRow: previous,
    };
  }

  if (isMateriallyBetter(product, previous)) {
    return {
      state: 'material_change',
      eligible: true,
      reason: 'material_price_drop',
      previousRow: previous,
    };
  }

  const rowCreated = new Date(previous.created_at || previous.createdAt || previous.updated_at || previous.posted_at || 0).getTime();
  const insideCooldown = rowCreated > cutoff;

  if (insideCooldown) {
    return {
      state: 'published_cooldown',
      eligible: false,
      reason: 'published_in_cooldown',
      previousRow: previous,
    };
  }

  return {
    state: 'new',
    eligible: true,
    reason: 'cooldown_expired_eligible',
    previousRow: previous,
  };
}

function filterFreshCandidates(marketplace, products, history, options = {}) {
  const cooldownDays = Number(options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS[marketplace] ?? 7);
  const accepted = [];
  const rejected = [];

  for (const product of Array.isArray(products) ? products : []) {
    const freshness = evaluateCandidateFreshness(marketplace, product, history, options);

    if (freshness.eligible) {
      accepted.push({
        ...product,
        isKnown: freshness.state !== 'new',
        isRevalidated: freshness.state === 'known_unpublished' || freshness.state === 'material_change',
        isNovel: freshness.state === 'new',
        freshness,
        historicalRow: freshness.previousRow,
        freshnessReason: freshness.reason,
      });
    } else {
      rejected.push({
        ...product,
        freshness,
        historicalRow: freshness.previousRow,
        reason: freshness.reason,
      });
    }
  }
  return { accepted, rejected, cooldownDays };
}

module.exports = {
  DEFAULT_COOLDOWN_DAYS,
  normalizeTitle,
  identityFor,
  isMateriallyBetter,
  hasPublicationEvidence,
  evaluateCandidateFreshness,
  filterFreshCandidates,
};

