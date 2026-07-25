/**
 * Validador progressivo de produtos para a Publicação Expressa.
 *
 * Valida separadamente:
 *   identityConfirmed — itemId ou shopId presente
 *   nameConfirmed     — título válido e não genérico
 *   priceConfirmed    — preço > 0 e finito
 *   imageConfirmed    — URL de imagem de CDN válido dos marketplaces
 *
 * Regra mínima para publicação:
 *   identityConfirmed + nameConfirmed + priceConfirmed + imageConfirmed
 *
 * Campos opcionais (não bloqueantes):
 *   preço anterior, desconto, rating, reviews, vendedor, frete
 */

export interface ExpressProductInput {
  title: string;
  marketplace: string;
  imageUrl?: string;
  price?: number;
  resolvedUrl?: string;
  itemId?: string;
  shopId?: string;
}

export interface ExpressValidationResult {
  approved: boolean;
  identityConfirmed: boolean;
  nameConfirmed: boolean;
  priceConfirmed: boolean;
  imageConfirmed: boolean;
  errorCode?:
    | "PRODUCT_ID_NOT_FOUND"
    | "PRODUCT_NAME_MISSING"
    | "CURRENT_PRICE_MISSING"
    | "PRODUCT_IMAGE_MISSING"
    | "VALIDATION_TOO_STRICT";
  errorStage?: string;
  details?: Record<string, string>;
}

// ─── CDNs de imagem permitidos por marketplace ────────────────────────────────

const ALLOWED_IMAGE_DOMAINS = [
  // Shopee
  "susercontent.com",
  "down-br.img.susercontent.com",
  "cf.shopee.com.br",
  // Mercado Livre
  "mlstatic.com",
  "http2.mlstatic.com",
  "mla-s2-p.mlstatic.com",
  "http-img.mlstatic.com",
  // Shein
  "img.ltwebstatic.com",
  "shein.com",
  // Genéricos de produto
  "cdn.icecat.us",
];

const BLOCKED_IMAGE_PATTERNS = [
  /placeholder/i,
  /via\.placeholder/i,
  /picsum\.photos/i,
  /unsplash\.com/i,
  /\.svg(\?|$)/i,
  /\/logo[-_]?(?:main|oficial|marca)?\./i,
  /\/sprite/i,
  /\/favicon/i,
  /\/banner/i,
  /nav-sprite/i,
  /sponsored-ads/i,
  /pixel\.gif/i,
  /data:image/i,
];

/** Títulos genéricos que indicam falha de extração, não produto real */
const GENERIC_TITLE = /^(?:gen[eê]rico|generic|produto\s+gen[eê]rico|sem\s+nome|unknown|unnamed|produto|item|placeholder|oferta\s+mercado\s+livre|shopee|mercado\s+livre\s+brasil)$/iu;

/** Títulos que parecem ser apenas o ID/código do produto */
const CODE_ONLY = /^(?:MLB[-_ ]?\d{6,14}|B0[-_ ]?[A-Z0-9]{8}|SKU[-_ ]?\d+|[A-Z0-9]{10,25})$/iu;

// ─── Validações individuais ──────────────────────────────────────────────────

function validateIdentity(input: ExpressProductInput): boolean {
  return !!(input.itemId?.trim() || input.shopId?.trim());
}

function validateName(title: string): boolean {
  const normalized = title.trim();
  if (!normalized || normalized.length < 10) return false;
  if (GENERIC_TITLE.test(normalized)) return false;
  if (CODE_ONLY.test(normalized)) return false;

  // Deve ter pelo menos 2 palavras úteis
  const usefulWords = normalized
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/gu, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/u)
    .filter((w) => w.length >= 2 && !/^(?:de|da|do|e|para|com|sem|na|no|em|um|uma)$/.test(w));

  return usefulWords.length >= 2;
}

function validatePrice(price: number | undefined): boolean {
  if (price === undefined || price === null) return false;
  if (!Number.isFinite(price)) return false;
  if (price <= 0) return false;
  if (price > 100_000) return false; // Limite razoável
  return true;
}

function validateImage(imageUrl: string | undefined, marketplace: string): boolean {
  if (!imageUrl?.trim()) return false;
  const url = imageUrl.trim();

  // Deve ser http ou https
  if (!url.startsWith("http://") && !url.startsWith("https://")) return false;

  // Verificar padrões bloqueados (logo, placeholder, etc.)
  if (BLOCKED_IMAGE_PATTERNS.some((re) => re.test(url))) return false;

  // Verificar tamanho mínimo (pixel de tracking)
  if (/[?&](w|width|h|height)=1(&|$)/.test(url)) return false;
  if (/[\/_-]1x1[\/_.-]/.test(url)) return false;

  // Verificar se é de domínio de CDN de marketplace permitido
  try {
    const parsed = new URL(url);
    const hostname = parsed.hostname.toLowerCase();

    // Aceitar qualquer subdomínio dos CDNs permitidos
    const isAllowedCdn = ALLOWED_IMAGE_DOMAINS.some(
      (allowed) => hostname === allowed || hostname.endsWith("." + allowed)
    );

    if (isAllowedCdn) return true;

    // Para Shopee: aceitar susercontent.com em qualquer subdomínio
    if (marketplace === "Shopee" && hostname.includes("susercontent")) return true;
    if (marketplace === "Shopee" && hostname.includes("shopee")) return true;

    // Para ML: aceitar mlstatic.com em qualquer subdomínio
    if (marketplace === "Mercado Livre" && hostname.includes("mlstatic")) return true;
    if (marketplace === "Mercado Livre" && hostname.includes("mercadolivre")) return true;

    // Se não for de CDN conhecido, verificar se ao menos parece uma imagem de produto
    // (aceitar se tiver extensão de imagem ou parâmetros típicos de imagem)
    const hasImageExtension = /\.(jpg|jpeg|png|webp|avif|gif)(\?|$)/i.test(parsed.pathname + parsed.search);
    const hasImageParams = /(?:image|img|photo|pic|w|h|size|quality|format)/i.test(parsed.search);

    // Aceitar como última opção se tem extensão de imagem comum
    if (hasImageExtension) return true;

    // Rejeitar se não reconhecemos o domínio nem tem extensão clara
    return false;
  } catch {
    return false;
  }
}

// ─── Função Principal ─────────────────────────────────────────────────────────

export function validateExpressProduct(input: ExpressProductInput): ExpressValidationResult {
  const identityConfirmed = validateIdentity(input);
  const nameConfirmed = validateName(input.title ?? "");
  const priceConfirmed = validatePrice(input.price);
  const imageConfirmed = validateImage(input.imageUrl, input.marketplace);

  // Prioridade dos erros: identidade > nome > preço > imagem
  let errorCode: ExpressValidationResult["errorCode"];
  let errorStage: string | undefined;

  if (!identityConfirmed) {
    errorCode = "PRODUCT_ID_NOT_FOUND";
    errorStage = "identity_validation";
  } else if (!nameConfirmed) {
    errorCode = "PRODUCT_NAME_MISSING";
    errorStage = "name_validation";
  } else if (!priceConfirmed) {
    errorCode = "CURRENT_PRICE_MISSING";
    errorStage = "price_validation";
  } else if (!imageConfirmed) {
    errorCode = "PRODUCT_IMAGE_MISSING";
    errorStage = "image_validation";
  }

  const approved = identityConfirmed && nameConfirmed && priceConfirmed && imageConfirmed;

  return {
    approved,
    identityConfirmed,
    nameConfirmed,
    priceConfirmed,
    imageConfirmed,
    errorCode,
    errorStage,
  };
}

// ─── Mensagens de interface por errorCode ────────────────────────────────────

export function getExpressErrorMessage(
  errorCode: ExpressValidationResult["errorCode"],
  marketplace: string
): string {
  switch (errorCode) {
    case "PRODUCT_ID_NOT_FOUND":
      return `O link do ${marketplace} foi reconhecido, mas o produto individual não pôde ser identificado. Cole o link direto do produto.`;
    case "PRODUCT_NAME_MISSING":
      return `O produto foi encontrado, mas o nome não pôde ser confirmado. Tente o link direto da página do produto.`;
    case "CURRENT_PRICE_MISSING":
      return `${marketplace} não expôs um preço verificável neste link. Use o link direto do item.`;
    case "PRODUCT_IMAGE_MISSING":
      return `A imagem principal do produto não pôde ser validada. Verifique se o link aponta para um produto com imagem.`;
    default:
      return `Não foi possível processar este link. Cole o link direto do produto em ${marketplace}.`;
  }
}
