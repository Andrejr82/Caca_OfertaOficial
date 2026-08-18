import { extractMLId } from "@/lib/platforms/mercadolivre";

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
    return `https://produto.mercadolivre.com.br/MLB-${normalizedItemId.slice(3)}`;
  }

  return resolvedUrl;
}
