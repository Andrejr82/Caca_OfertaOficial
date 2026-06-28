import { isBlacklistedTitle, isBlacklistedImage } from "@/core/scraper/blacklist";
import { SCRAPER_LIMITS, SCRAPER_STRICT_MODE } from "@/core/scraper/constants";
import { logScraperMetrics } from "@/core/scraper/telemetry";

export interface ValidationResult {
  valid: boolean;
  confidence: number;
  rejectReason: string | null;
}

export function validateProduct(product: any, source: string): ValidationResult {
  if (!SCRAPER_STRICT_MODE) {
    return { valid: true, confidence: 100, rejectReason: null };
  }

  // 1. Campos Obrigatórios
  if (!product || typeof product !== "object") {
    return { valid: false, confidence: 0, rejectReason: "OBJETO_INVALIDO" };
  }

  const title = (product.title || product.product_name || "").trim();
  const price = typeof product.price === 'number' ? product.price : (product.current_price || 0);
  const image = (product.image || product.image_url || "").trim();
  const url = (product.url || product.original_url || "").trim();

  if (!title) {
    return { valid: false, confidence: 5, rejectReason: "SEM_TITULO" };
  }

  if (price < SCRAPER_LIMITS.MIN_PRICE || price > SCRAPER_LIMITS.MAX_PRICE) {
    return { valid: false, confidence: 10, rejectReason: "PRECO_INVALIDO" };
  }

  // 2. Validação de Título (Blacklist e Tamanho)
  if (title.length < SCRAPER_LIMITS.MIN_TITLE_LENGTH) {
    return { valid: false, confidence: 20, rejectReason: "TITULO_MUITO_CURTO" };
  }
  if (title.length > SCRAPER_LIMITS.MAX_TITLE_LENGTH) {
    return { valid: false, confidence: 30, rejectReason: "TITULO_MUITO_LONGO" };
  }

  if (isBlacklistedTitle(title)) {
    return { valid: false, confidence: 0, rejectReason: "BLACKLIST_TITLE" };
  }

  // Verificação semântica simples: se o título não tiver espaços, provavelmente é um placeholder ou erro (exceto marcas específicas curtas, mas <5 chars já cortou)
  if (!title.includes(" ") && title.length > 15) {
    return { valid: false, confidence: 15, rejectReason: "TITULO_SEM_ESPACOS" };
  }

  // 3. Validação de Imagem
  if (!image || image === "null" || image.length < 5) {
    return { valid: false, confidence: 0, rejectReason: "SEM_IMAGEM" };
  }
  
  if (isBlacklistedImage(image)) {
    return { valid: false, confidence: 10, rejectReason: "BLACKLIST_IMAGE" };
  }

  // 4. Validação de URL
  if (!url) {
    return { valid: false, confidence: 0, rejectReason: "SEM_URL" };
  }

  try {
    const parsedUrl = new URL(url);
    if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
      return { valid: false, confidence: 0, rejectReason: "PROTOCOLO_URL_INVALIDO" };
    }
  } catch (err) {
    return { valid: false, confidence: 0, rejectReason: "URL_MALFORMADA" };
  }

  // 5. Calcula Confidence Score (0 a 100)
  let confidence = 100;
  
  if (title.length < 15) confidence -= 15;
  if (!product.category) confidence -= 1;
  if (!product.rating) confidence -= 2;
  if (!product.brand) confidence -= 1;
  if (!product.old_price) confidence -= 4;

  // Limite de segurança: Confidence deve ser > 40 para ser aprovado (heurística)
  if (confidence < 40) {
    return { valid: false, confidence, rejectReason: "CONFIDENCE_MUITO_BAIXO" };
  }

  return { valid: true, confidence, rejectReason: null };
}
