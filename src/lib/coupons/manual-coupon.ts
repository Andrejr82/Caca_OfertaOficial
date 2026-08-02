export const MANUAL_COUPON_MARKETPLACES = ["Mercado Livre", "Shopee", "Amazon"] as const;
export type ManualCouponMarketplace = (typeof MANUAL_COUPON_MARKETPLACES)[number];

export type ManualCouponInput = {
  marketplace: string;
  code: string;
  discount: string;
  rules: string;
  validity: string;
  link: string;
  imageUrl?: string;
};

export function normalizeManualCouponInput(input: Partial<ManualCouponInput>): ManualCouponInput {
  return {
    marketplace: String(input.marketplace || "").trim(),
    code: String(input.code || "").trim(),
    discount: String(input.discount || "").trim(),
    rules: String(input.rules || "").trim(),
    validity: String(input.validity || "").trim(),
    link: String(input.link || "").trim(),
    imageUrl: String(input.imageUrl || "").trim() || undefined
  };
}

function isMarketplaceUrl(marketplace: string, rawUrl: string) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase();
    if (marketplace === "Mercado Livre") return hostname === "mercadolivre.com.br" || hostname.endsWith(".mercadolivre.com.br");
    if (marketplace === "Shopee") return hostname === "shopee.com.br" || hostname.endsWith(".shopee.com.br");
    if (marketplace === "Amazon") return ["amazon.com.br", "amzn.to", "a.co"].includes(hostname) || hostname.endsWith(".amazon.com.br");
    return false;
  } catch {
    return false;
  }
}

export function validateManualCouponInput(input: ManualCouponInput) {
  const errors: string[] = [];
  if (!MANUAL_COUPON_MARKETPLACES.includes(input.marketplace as ManualCouponMarketplace)) errors.push("Marketplace inválido.");
  if (!input.code) errors.push("Informe o código do cupom.");
  else if (/^https?:\/\//i.test(input.code)) errors.push("O campo Código não aceita links. Use RESGATE DIRETO e coloque o link no campo Link oficial.");
  if (!input.discount) errors.push("Informe o benefício ou desconto.");
  if (!input.rules) errors.push("Informe as regras de uso.");
  if (!input.validity) errors.push("Informe a validade.");
  if (!input.link) errors.push("Informe o link do cupom ou produto.");
  else if (!isMarketplaceUrl(input.marketplace, input.link)) errors.push("Link deve pertencer ao marketplace selecionado.");
  if (input.imageUrl) {
    try {
      const imageUrl = new URL(input.imageUrl);
      const hostname = imageUrl.hostname.toLowerCase();
      if (!/^https?:$/.test(imageUrl.protocol)) errors.push("Imagem deve usar URL HTTP(S).");
      if (hostname.includes("shopee") || hostname.includes("mercadolivre") || hostname.includes("amazon") || hostname.includes("affiliate")) {
        errors.push("Imagem deve ser uma URL direta de imagem, não um link de produto ou afiliado.");
      }
    } catch {
      errors.push("Imagem deve usar URL HTTP(S).");
    }
  }
  return { ok: errors.length === 0, errors };
}
