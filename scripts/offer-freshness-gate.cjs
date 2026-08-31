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

function filterFreshCandidates(marketplace, products, history, options = {}) {
  const cooldownDays = Number(options.cooldownDays ?? DEFAULT_COOLDOWN_DAYS[marketplace] ?? 7);
  const permanentStatuses = new Set((options.permanentStatuses || []).map((status) => String(status).trim().toLowerCase()).filter(Boolean));
  const reusableStatuses = new Set((options.reusableStatuses || []).map((status) => String(status).trim().toLowerCase()).filter(Boolean));
  const referenceTime = options.now ? new Date(options.now).getTime() : Date.now();
  const cutoff = referenceTime - cooldownDays * 24 * 60 * 60 * 1000;
  const byIdentity = new Map();
  const byTitle = new Map();
  const permanentByIdentity = new Map();
  const permanentByTitle = new Map();
  for (const row of Array.isArray(history) ? history : []) {
    const created = new Date(row.created_at || row.createdAt || row.updated_at || 0).getTime();
    const title = normalizeTitle(row.product_name || row.title);
    const identity = identityFor(marketplace, {
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
    const status = String(row.status || '').trim().toLowerCase();
    const permanent = permanentStatuses.has(status) || (options.blockPublished === true && hasPublicationEvidence(row));
    if (permanent) {
      if (identity) permanentByIdentity.set(identity, row);
      if (title) permanentByTitle.set(title, row);
    }
    if (permanent || reusableStatuses.has(status)) continue;
    if (!Number.isFinite(created) || created < cutoff) continue;
    if (title) byTitle.set(title, row);
    if (identity) byIdentity.set(identity, row);
  }
  const accepted = [];
  const rejected = [];
  for (const product of Array.isArray(products) ? products : []) {
    const identity = identityFor(marketplace, product);
    const title = normalizeTitle(product.title);
    const permanent = (identity && permanentByIdentity.get(identity)) || (title && permanentByTitle.get(title));
    if (permanent) {
      rejected.push({ sourceItemId: product.sourceItemId, reason: 'historical_identity' });
      continue;
    }
    const previous = (identity && byIdentity.get(identity)) || (title && byTitle.get(title));
    if (previous && !isMateriallyBetter(product, previous)) {
      rejected.push({ sourceItemId: product.sourceItemId, reason: 'cooldown_repeticao_historica' });
      continue;
    }
    accepted.push(product);
  }
  return { accepted, rejected, cooldownDays };
}

module.exports = { DEFAULT_COOLDOWN_DAYS, normalizeTitle, identityFor, isMateriallyBetter, hasPublicationEvidence, filterFreshCandidates };
