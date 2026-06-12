import type { Channel } from "@/types/domain";

export function slugifyProductName(productName: string) {
  return productName
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 48);
}

export function createSubId(channel: Channel, productName: string, offerId: string) {
  const shortId = offerId.replace(/-/g, "").slice(0, 8);
  return `${channel}_${slugifyProductName(productName)}_${shortId}`;
}

export function createTrackedUrl(
  originalUrl: string,
  subId: string,
  utmSource?: string,
  utmMedium?: string,
  utmCampaign?: string
) {
  // Ignoramos UTMs na URL gerada pois vamos usar o redirecionador interno
  // que protegerá a original_url contra quebras em shortlinks de afiliados.
  let baseUrl = process.env.NEXT_PUBLIC_APP_URL || process.env.NEXT_PUBLIC_SITE_URL || "https://cacaoferta.com.br";
  if (process.env.NODE_ENV === "development" && !process.env.NEXT_PUBLIC_APP_URL) {
    baseUrl = "http://localhost:3000";
  }
  return `${baseUrl}/go/${subId}`;
}
