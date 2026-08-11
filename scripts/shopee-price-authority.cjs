const {
  parseBrazilPrice,
  isSuspiciousPriceContext,
} = require('../extensions/shopee-video-extractor/price-parser.js');

function sameIdentity(existingOffer, payloadIdentity) {
  const existingShop = String(existingOffer?.shopee_shop_id || '').trim();
  const existingItem = String(existingOffer?.shopee_item_id || '').trim();
  const payloadShop = String(payloadIdentity?.shopId || '').trim();
  const payloadItem = String(payloadIdentity?.itemId || '').trim();
  return Boolean(existingShop && existingItem && payloadShop && payloadItem
    && existingShop === payloadShop && existingItem === payloadItem);
}

function resolvePriceAuthority({ payloadPrice, existingOffer, payloadIdentity }) {
  const canonical = Number(existingOffer?.current_price);
  const hasCanonical = Number.isFinite(canonical) && canonical > 0;
  const rawPayload = String(payloadPrice || '').trim();
  const candidate = parseBrazilPrice(rawPayload);
  const identityMismatch = Boolean(existingOffer && payloadIdentity
    && (String(existingOffer.shopee_shop_id || '') !== String(payloadIdentity.shopId || '')
      || String(existingOffer.shopee_item_id || '') !== String(payloadIdentity.itemId || '')));
  const implausibleAgainstCanonical = hasCanonical && candidate != null && candidate < canonical * 0.1;
  const suspicious = identityMismatch || isSuspiciousPriceContext(rawPayload) || candidate == null || implausibleAgainstCanonical;

  if (hasCanonical && (sameIdentity(existingOffer, payloadIdentity) || suspicious)) {
    return { price: canonical, source: 'existing-offer-canonical', suspicious };
  }
  if (candidate != null && !suspicious) return { price: candidate, source: 'validated-payload', suspicious: false };
  if (hasCanonical) return { price: canonical, source: 'existing-offer-canonical', suspicious: true };
  return { price: 0, source: 'rejected-suspicious-payload', suspicious: true };
}

module.exports = { resolvePriceAuthority, sameIdentity };
