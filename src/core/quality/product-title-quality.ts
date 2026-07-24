export type ProductTitleQuality = {
  valid: boolean;
  reason?: "INVALID_PRODUCT_TITLE";
  normalized: string;
};

const GENERIC_TITLE = /^(?:gen[eê]rico|generic|produto\s+gen[eê]rico|generic\s+product|sem\s+nome|unknown|unnamed|produto|item|placeholder)$/iu;
const CODE_ONLY = /^(?:mlb[-_ ]?\d{6,14}|b0[-_ ]?[a-z0-9]{8}|sku[-_ ]?\d+|c[oó]digo[-_ ]?\d+|[a-z0-9]{10,20})$/iu;

function usefulWords(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLocaleLowerCase("pt-BR")
    .split(/[^a-z0-9]+/u)
    .filter((word) => word.length >= 2 && !/^(?:de|da|do|e|para|com|sem|na|no|em)$/u.test(word));
}

export function validateProductTitle(title: unknown): ProductTitleQuality {
  const normalized = String(title ?? "").replace(/\s+/gu, " ").trim();
  const words = usefulWords(normalized);
  const valid = Boolean(normalized)
    && !GENERIC_TITLE.test(normalized)
    && !CODE_ONLY.test(normalized)
    && words.length >= 2;
  return valid ? { valid: true, normalized } : { valid: false, reason: "INVALID_PRODUCT_TITLE", normalized };
}

