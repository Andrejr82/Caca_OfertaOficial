import { extractMLId } from "@/lib/platforms/mercadolivre";
import { ML_EXPRESS_SOURCE_PARAM } from "@/lib/platforms/mercadolivre-featured-fallback";

function isMeliShortlink(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === "https:" && url.hostname.toLowerCase().replace(/^www\./, "") === "meli.la";
  } catch {
    return false;
  }
}

export function chooseMLExtractionUrl(
  inputUrl: string,
  resolvedUrl: string,
  confirmedIdentity: boolean,
  itemId?: string | null,
) {
  if (!confirmedIdentity || !itemId) return resolvedUrl;

  if (extractMLId(inputUrl)) return inputUrl;

  const normalizedItemId = itemId.trim().toUpperCase();
  if (/^MLB\d+$/.test(normalizedItemId)) {
    const technicalUrl = new URL(`https://produto.mercadolivre.com.br/MLB-${normalizedItemId.slice(3)}`);
    if (isMeliShortlink(inputUrl)) {
      technicalUrl.searchParams.set(ML_EXPRESS_SOURCE_PARAM, inputUrl);
    }
    return technicalUrl.toString();
  }

  return resolvedUrl;
}
