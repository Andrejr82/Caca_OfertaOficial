const cheerio = require('cheerio');

function normalizeMarketplaceName(value) {
  const raw = String(value || '').trim().toLowerCase();
  if (raw.includes('shopee')) return 'Shopee';
  if (raw.includes('amazon')) return 'Amazon';
  if (raw.includes('mercado')) return 'Mercado Livre';
  if (raw.includes('magalu') || raw.includes('magazine')) return 'Magalu';
  if (raw.includes('netshoes')) return 'Netshoes';
  if (raw.includes('shein')) return 'Shein';
  return value || 'Desconhecido';
}

function cleanText(value) {
  return String(value || '').replace(/\s+/g, ' ').trim();
}

function parsePrice(value) {
  if (value == null || value === '') return null;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  const normalized = String(value)
    .replace(/R\$\s*/gi, '')
    .replace(/[^\d,.-]/g, '')
    .trim();

  if (!normalized) return null;

  if (normalized.includes(',') && normalized.includes('.')) {
    const withDotDecimal = normalized.replace(/\./g, '').replace(',', '.');
    const parsed = parseFloat(withDotDecimal);
    return Number.isFinite(parsed) ? parsed : null;
  }

  if (normalized.includes(',')) {
    const parsed = parseFloat(normalized.replace(/\./g, '').replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }

  const parsed = parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeUrl(url) {
  const clean = cleanText(url);
  return clean || null;
}

function parseDynamicAmazonImage(value) {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value);
    const first = Object.keys(parsed || {})[0];
    return normalizeUrl(first);
  } catch {
    return null;
  }
}

function pickFirst(...values) {
  for (const value of values) {
    if (Array.isArray(value)) {
      const filtered = value.map(cleanText).filter(Boolean);
      if (filtered.length > 0) return filtered;
      continue;
    }

    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return null;
}

function normalizeSpecs(value) {
  if (Array.isArray(value)) {
    const specs = value.map(cleanText).filter(Boolean);
    return specs.length > 0 ? specs : [];
  }

  const text = cleanText(value);
  if (!text) return [];
  return [text];
}

function buildNormalizedContent(marketplace, data, source) {
  const price = parsePrice(data.price ?? data.current_price);
  const oldPrice = parsePrice(data.oldPrice ?? data.old_price);
  const normalized = {
    marketplace,
    title: cleanText(data.title || data.product_name) || null,
    price,
    oldPrice,
    discount: cleanText(data.discount || data.discount_badge) || null,
    rating: data.rating != null && data.rating !== '' ? Number(String(data.rating).replace(',', '.')) || null : null,
    reviews: cleanText(data.reviews) || null,
    imageUrl: normalizeUrl(data.imageUrl || data.image_url || data.image),
    url: normalizeUrl(data.url || data.original_url || data.product_url) || null,
    seller: cleanText(data.seller || data.shop_name || data.merchant_name || data.store) || null,
    specs: normalizeSpecs(data.specs || data.raw_text || data.cleanedText),
    source,
    tokenOptimized: true
  };

  if (!normalized.discount && normalized.oldPrice && normalized.price && normalized.oldPrice > normalized.price) {
    const pct = Math.round(((normalized.oldPrice - normalized.price) / normalized.oldPrice) * 100);
    if (Number.isFinite(pct) && pct > 0) normalized.discount = `${pct}%`;
  }

  return normalized;
}

function flattenJsonLd(input, acc = []) {
  if (!input) return acc;
  if (Array.isArray(input)) {
    input.forEach((item) => flattenJsonLd(item, acc));
    return acc;
  }
  if (typeof input === 'object') {
    acc.push(input);
    if (Array.isArray(input['@graph'])) flattenJsonLd(input['@graph'], acc);
  }
  return acc;
}

function extractJsonLdProduct(html, marketplace, url) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const scripts = $('script[type="application/ld+json"]').toArray();
  for (const script of scripts) {
    const raw = $(script).contents().text();
    if (!cleanText(raw)) continue;
    try {
      const parsed = JSON.parse(raw);
      const nodes = flattenJsonLd(parsed);
      for (const node of nodes) {
        const type = String(node?.['@type'] || '').toLowerCase();
        const offers = Array.isArray(node?.offers) ? node.offers[0] : node?.offers;
        const aggregateRating = node?.aggregateRating || {};
        const candidate = buildNormalizedContent(marketplace, {
          title: node?.name,
          price: offers?.price ?? node?.price,
          old_price: offers?.highPrice ?? offers?.priceSpecification?.price,
          image: Array.isArray(node?.image) ? node.image[0] : node?.image,
          url: node?.url || url,
          seller: offers?.seller?.name || node?.brand?.name,
          rating: aggregateRating?.ratingValue,
          reviews: aggregateRating?.reviewCount,
          specs: node?.description
        }, 'json_ld');

        if (type.includes('product') && hasMinimumProductContent(candidate)) {
          return candidate;
        }
      }
    } catch {
      continue;
    }
  }
  return null;
}

function extractAmazonSelectors(html, url) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const title = pickFirst($('#productTitle').text());
  const currentPrice = pickFirst(
    $('.a-price:not(.a-text-price) .a-offscreen').first().text(),
    $('.a-price .a-offscreen').first().text()
  );
  const oldPrice = pickFirst(
    $('.a-price.a-text-price .a-offscreen').first().text(),
    $('.basisPrice .a-offscreen').first().text()
  );
  const specs = $('#feature-bullets li span').toArray().map((el) => $(el).text());
  const imageUrl = pickFirst(
    parseDynamicAmazonImage($('#landingImage').attr('data-a-dynamic-image')),
    $('#landingImage').attr('src'),
    $('#imgTagWrapperId img').attr('src'),
    $('meta[property="og:image"]').attr('content')
  );
  const ratingText = pickFirst($('#acrPopover').attr('title'), $('.a-icon-alt').first().text());
  const reviews = pickFirst($('#acrCustomerReviewText').text());
  const seller = pickFirst($('#bylineInfo').text(), $('#sellerProfileTriggerId').text());

  return buildNormalizedContent('Amazon', {
    title,
    price: currentPrice,
    old_price: oldPrice,
    image: imageUrl,
    url,
    seller,
    rating: ratingText ? ratingText.match(/[\d,.]+/)?.[0] : null,
    reviews: reviews ? reviews.match(/[\d.]+/)?.[0] : null,
    specs
  }, 'css_selectors');
}

function extractMercadoLivreSelectors(html, url) {
  if (!html) return null;
  const $ = cheerio.load(html);
  const title = pickFirst($('h1.ui-pdp-title').text(), $('meta[property="og:title"]').attr('content'));
  const priceFraction = pickFirst($('.andes-money-amount__fraction').first().text());
  const priceCents = pickFirst($('.andes-money-amount__cents').first().text());
  const oldPrice = pickFirst($('.ui-pdp-price__original-value .andes-money-amount__fraction').first().text());
  const rating = pickFirst($('.ui-pdp-review__rating').first().text());
  const reviews = pickFirst($('.ui-pdp-review__amount').first().text());
  const seller = pickFirst($('.ui-pdp-seller__link').first().text(), $('[data-testid="seller-link"]').first().text());
  const discount = pickFirst($('.ui-pdp-price__discount').first().text());
  const imageUrl = pickFirst(
    $('figure.ui-pdp-gallery__figure img').first().attr('src'),
    $('figure.ui-pdp-gallery__figure img').first().attr('data-zoom'),
    $('meta[property="og:image"]').attr('content')
  );
  const specs = $('.ui-vpp-highlighted-specs__features li, .ui-pdp-description__content').toArray().map((el) => $(el).text());

  const currentPrice = priceFraction
    ? `${priceFraction}${priceCents ? `,${priceCents}` : ''}`
    : null;

  return buildNormalizedContent('Mercado Livre', {
    title,
    price: currentPrice,
    old_price: oldPrice,
    image: imageUrl,
    url,
    seller,
    rating,
    reviews,
    discount,
    specs
  }, 'css_selectors');
}

function extractCleanedHtml(html, marketplace, url, text) {
  const cleanedTextParts = [];
  if (html) {
    const $ = cheerio.load(html);
    $('script, style, noscript, svg').remove();
    cleanedTextParts.push(cleanText($('body').text()));
  }
  if (text) cleanedTextParts.push(cleanText(text));
  const cleanedText = cleanedTextParts.filter(Boolean).join(' ').trim();
  if (!cleanedText) return null;

  return buildNormalizedContent(marketplace, {
    url,
    cleanedText: cleanedText.slice(0, 4000)
  }, 'cleaned_html');
}

function inferProductSource(marketplace, product) {
  if (product?.source === 'api' || marketplace === 'Shopee') return 'api';
  if (product?.source === 'json_ld') return 'json_ld';
  if (product?.source === 'cleaned_html') return 'cleaned_html';
  return 'css_selectors';
}

function hasMinimumProductContent(normalized) {
  if (!normalized) return false;
  return Boolean(normalized.title && (normalized.price != null || normalized.imageUrl || normalized.seller || normalized.specs?.length));
}

function logTokenOptimization(normalized) {
  const marketplace = normalized?.marketplace || 'desconhecido';
  const source = normalized?.source || 'fallback';
  console.log(
    `[Token Optimization] ${marketplace} source=${source} title=${normalized?.title ? 'sim' : 'nao'} price=${normalized?.price != null ? 'sim' : 'nao'} image=${normalized?.imageUrl ? 'sim' : 'nao'}`
  );
}

function normalizeProductContentForLLM({ marketplace, html, text, product, url }) {
  const normalizedMarketplace = normalizeMarketplaceName(marketplace || product?.marketplace || product?.platform);

  const candidates = [];

  if (product && typeof product === 'object') {
    candidates.push(buildNormalizedContent(normalizedMarketplace, {
      title: product.title || product.product_name,
      price: product.price ?? product.current_price,
      old_price: product.old_price,
      discount: product.discount || product.discount_badge,
      rating: product.rating,
      reviews: product.reviews,
      image: product.image || product.image_url,
      url: product.url || product.original_url || url,
      seller: product.seller || product.shop_name || product.merchant_name,
      specs: product.specs || product.raw_text
    }, inferProductSource(normalizedMarketplace, product)));
  }

  if (normalizedMarketplace === 'Amazon') {
    candidates.push(extractJsonLdProduct(html, normalizedMarketplace, url));
    candidates.push(extractAmazonSelectors(html, url));
    candidates.push(extractCleanedHtml(html, normalizedMarketplace, url, text));
  } else if (normalizedMarketplace === 'Mercado Livre') {
    candidates.push(extractMercadoLivreSelectors(html, url));
    candidates.push(extractJsonLdProduct(html, normalizedMarketplace, url));
    candidates.push(extractCleanedHtml(html, normalizedMarketplace, url, text));
  } else if (normalizedMarketplace === 'Shopee') {
    candidates.push(extractCleanedHtml(html, normalizedMarketplace, url, text));
  } else {
    candidates.push(extractJsonLdProduct(html, normalizedMarketplace, url));
    candidates.push(extractCleanedHtml(html, normalizedMarketplace, url, text));
  }

  const selected = candidates.find((candidate) => hasMinimumProductContent(candidate))
    || candidates.find(Boolean)
    || buildNormalizedContent(normalizedMarketplace, { url }, 'fallback');

  if (!hasMinimumProductContent(selected)) {
    selected.source = selected.source || 'fallback';
    console.log(`[Token Optimization] fallback usado para ${normalizedMarketplace}`);
  }

  logTokenOptimization(selected);
  return selected;
}

function createLLMInputFromNormalizedContent(normalized, options = {}) {
  const payload = {
    marketplace: normalized.marketplace,
    title: normalized.title,
    price: normalized.price,
    oldPrice: normalized.oldPrice,
    discount: normalized.discount,
    rating: normalized.rating,
    reviews: normalized.reviews,
    imageUrl: normalized.imageUrl,
    url: normalized.url,
    seller: normalized.seller,
    specs: normalized.specs,
    source: normalized.source,
    tokenOptimized: true
  };

  const fallbackText = cleanText(options.fallbackText);
  if (fallbackText && !hasMinimumProductContent(normalized)) {
    payload.fallbackText = fallbackText.slice(0, 4000);
  }

  return JSON.stringify(payload, null, 2);
}

module.exports = {
  normalizeProductContentForLLM,
  createLLMInputFromNormalizedContent,
  hasMinimumProductContent
};
