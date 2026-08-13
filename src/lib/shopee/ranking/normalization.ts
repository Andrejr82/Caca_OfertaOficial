export function normalizePrice(price: string | number | null | undefined): number {
  if (price === null || price === undefined) return 0;
  if (typeof price === 'number') return price;
  
  const parsed = parseFloat(price);
  return isNaN(parsed) ? 0 : parsed;
}

export function normalizePercent(percent: string | number | null | undefined): number {
  if (percent === null || percent === undefined) return 0;
  
  let val = 0;
  if (typeof percent === 'number') {
    val = percent;
  } else {
    val = parseFloat(percent);
    if (isNaN(val)) return 0;
  }
  
  // If the value is a fraction between 0 and 1 (exclusive), convert to percentage (0-100)
  // Shopee rates are often 0.15 for 15%
  if (val > 0 && val < 1) {
    return val * 100;
  }
  
  return val;
}

export function normalizeText(text: string | null | undefined): string {
  if (!text) return '';
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // Remove accents
    .trim()
    .replace(/\s+/g, ' '); // Normalize spaces
}

export function buildIdentity(shopId: string | number, itemId: string | number): string {
  if (!shopId || !itemId) return '';
  return `shopee:${shopId}:${itemId}`;
}

export function isValidHttpsUrl(url: string | null | undefined): boolean {
  if (!url) return false;
  try {
    const parsed = new URL(url);
    return parsed.protocol === 'https:';
  } catch {
    return false;
  }
}
