export interface ShopeeIdentityInput {
  selectedItemId?: string | null;
  resolvedUrl: string;
}

export interface ShopeeIdentity {
  shopId?: string;
  itemId?: string;
}

function extractFromUrl(url: string): ShopeeIdentity {
  try {
    const parsed = new URL(url);
    const pathMatch = parsed.pathname.match(/\/(?:product|opaanlp)\/(\d+)\/(\d+)/i)
      || parsed.pathname.match(/\/i\.(\d+)\.(\d+)/i);
    if (pathMatch) return { shopId: pathMatch[1], itemId: pathMatch[2] };

    const shopId = parsed.searchParams.get("shop_id") || undefined;
    const itemId = parsed.searchParams.get("item_id") || undefined;
    return { shopId, itemId };
  } catch {
    return {};
  }
}

/** Converts the resolver identity (shopId.itemId for Shopee) to API fields. */
export function selectShopeeIdentity(input: ShopeeIdentityInput): ShopeeIdentity {
  const fromUrl = extractFromUrl(input.resolvedUrl);
  const selected = String(input.selectedItemId || "").trim();
  const combined = selected.match(/^(\d+)\.(\d+)$/);
  if (combined) return { shopId: combined[1], itemId: combined[2] };
  if (/^\d+$/.test(selected)) return { shopId: fromUrl.shopId, itemId: selected };
  return fromUrl;
}
