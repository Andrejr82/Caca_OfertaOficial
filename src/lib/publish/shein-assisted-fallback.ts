import type { SheinManualConfirmation } from "./shein-express-adapter";

export const SHEIN_ASSISTED_SOURCE = "quick-publication-shein" as const;

export interface SheinAssistedFormValue {
  originalUrl: string;
  title: string;
  price: string;
  imageUrl: string;
  couponText?: string;
  discountPercent?: number;
}

export interface SheinAssistedPayload extends SheinManualConfirmation {
  originalUrl: string;
  manual_source: true;
  source: typeof SHEIN_ASSISTED_SOURCE;
}

type ValidationResult =
  | { ok: true; confirmation: SheinManualConfirmation }
  | { ok: false; errors: string[] };

function parsePrice(value: string): number {
  const normalized = value.trim().replace(/^R\$\s*/i, "");
  if (!normalized) return 0;
  const brazilian = normalized.includes(",")
    ? normalized.replace(/\./g, "").replace(",", ".")
    : normalized;
  const price = Number(brazilian);
  return Number.isFinite(price) && price > 0 ? price : 0;
}

function isHttpUrl(value: string): boolean {
  if (/^data:image\/(?:jpe?g|png|webp);base64,/i.test(value.trim())) return true;
  try {
    const url = new URL(value.trim());
    return (url.protocol === "http:" || url.protocol === "https:")
      && /\.(?:jpe?g|png|webp)(?:$|[?#])/i.test(url.pathname + url.search);
  } catch {
    return false;
  }
}

export function isValidSheinImageValue(value: string): boolean {
  return isHttpUrl(value);
}

export function validateSheinAssistedConfirmation(value: SheinAssistedFormValue): ValidationResult {
  const errors: string[] = [];
  const title = value.title.trim();
  const price = parsePrice(value.price);
  const imageUrl = value.imageUrl.trim();

  if (!title) errors.push("TÍTULO_OBRIGATÓRIO");
  if (!price) errors.push("PREÇO_OBRIGATÓRIO");
  if (!isValidSheinImageValue(imageUrl)) errors.push("IMAGEM_URL_INVÁLIDA");

  if (errors.length > 0) return { ok: false, errors };
  const couponText = value.couponText?.trim();
  const discountPercent = typeof value.discountPercent === "number" && value.discountPercent >= 0
    ? value.discountPercent
    : undefined;
  return {
    ok: true,
    confirmation: { title, price, imageUrl, ...(couponText ? { couponText } : {}), ...(discountPercent !== undefined ? { discountPercent } : {}) },
  };
}

export function buildSheinAssistedPayload(
  originalUrl: string,
  confirmation: SheinManualConfirmation,
): SheinAssistedPayload {
  return {
    originalUrl: originalUrl.trim(),
    manual_source: true,
    source: SHEIN_ASSISTED_SOURCE,
    title: confirmation.title,
    price: confirmation.price,
    imageUrl: confirmation.imageUrl,
    ...(confirmation.couponText ? { couponText: confirmation.couponText } : {}),
    ...(confirmation.discountPercent !== undefined ? { discountPercent: confirmation.discountPercent } : {}),
  };
}
