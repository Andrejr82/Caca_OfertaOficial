'use strict';

function compareByCommercialScore(a, b) {
  const scoreDiff = Number(b?.commercial_score || 0) - Number(a?.commercial_score || 0);
  if (scoreDiff !== 0) return scoreDiff;
  const marketplaceDiff = String(a?.marketplace || '').localeCompare(String(b?.marketplace || ''), 'pt-BR');
  if (marketplaceDiff !== 0) return marketplaceDiff;
  return String(a?.product_term || '').localeCompare(String(b?.product_term || ''), 'pt-BR');
}

function reindexProducts(products = []) {
  return products.map((product, index) => {
    const priority = index + 1;
    const directEvidence = Array.isArray(product.direct_evidence)
      ? product.direct_evidence.map((evidence) => ({ ...evidence, rank_position: priority }))
      : product.direct_evidence;
    return {
      ...product,
      priority,
      is_focus: priority <= 3,
      direct_evidence: directEvidence,
    };
  });
}

function composeBalancedMarketplaceTop20(
  shopeeProducts = [],
  mlProducts = [],
  { maxProducts = 20, minimumPerMarketplace = 6 } = {},
) {
  const limit = Math.max(0, Number(maxProducts) || 0);
  if (limit === 0) return [];

  const minimum = Math.max(0, Math.min(Number(minimumPerMarketplace) || 0, Math.floor(limit / 2)));
  const shopee = [...shopeeProducts].sort(compareByCommercialScore);
  const ml = [...mlProducts].sort(compareByCommercialScore);

  const reservedShopee = shopee.slice(0, Math.min(minimum, shopee.length));
  const reservedMl = ml.slice(0, Math.min(minimum, ml.length));
  const reserved = [...reservedShopee, ...reservedMl];
  const reservedSet = new Set(reserved);

  const remainingSlots = Math.max(0, limit - reserved.length);
  const remaining = [...shopee, ...ml]
    .filter((product) => !reservedSet.has(product))
    .sort(compareByCommercialScore)
    .slice(0, remainingSlots);

  return reindexProducts([...reserved, ...remaining].sort(compareByCommercialScore));
}

module.exports = {
  compareByCommercialScore,
  composeBalancedMarketplaceTop20,
};
