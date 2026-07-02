import { LinkMetadata } from "./scraper";
import { validateOfferForPersistence } from "@/core/scraper/product-validator";

export type PageClassification =
  | "VALID_PRODUCT"
  | "CATEGORY_PAGE"
  | "STORE_PAGE"
  | "SOCIAL_PAGE"
  | "PROFILE_PAGE"
  | "INVALID_PAGE"
  | "UNKNOWN";

export interface QualityGateResult {
  status: "APPROVED" | "REJECTED";
  classification: PageClassification;
  reason?: string;
}

export function evaluateQualityGate(metadata: LinkMetadata): QualityGateResult {
  const titleLower = metadata.title ? metadata.title.toLowerCase() : "";
  const finalUrlLower = metadata.finalUrl ? metadata.finalUrl.toLowerCase() : "";

  // 1. Check for invalid or pure social profiles (that are not store links)
  const isProfileUrl = finalUrlLower.includes("/perfil/");
  // Many affiliate links resolve to /social/... but are actually product/store wrappers.
  // We should NOT reject them if they have a product price or image.
  
  const hasPrice = metadata.price && metadata.price > 0;
  const hasImage = !!metadata.imageUrl;
  const isRandomSequence = /^[a-z0-9]{15,}$/i.test(metadata.title ? metadata.title.split(" | ")[0] : "");
  const persistenceValidation = validateOfferForPersistence({
    product_name: metadata.title,
    platform: metadata.platform,
    original_url: metadata.finalUrl,
    image_url: metadata.imageUrl,
    current_price: metadata.price,
  });

  if (!persistenceValidation.valid) {
    return {
      status: "REJECTED",
      classification: "INVALID_PAGE",
      reason: persistenceValidation.rejectReason || "Oferta inválida para persistência."
    };
  }

  if (isProfileUrl && !hasPrice && !hasImage) {
    return {
      status: "REJECTED",
      classification: "PROFILE_PAGE",
      reason: "Link apontou para um perfil social sem produto identificado."
    };
  }

  if (isRandomSequence && !hasPrice && !hasImage) {
    return {
      status: "REJECTED",
      classification: "INVALID_PAGE",
      reason: "Título parece ser uma sequência aleatória ou CAPTCHA, sem produto detectado."
    };
  }

  // Se tem preço e imagem, consideramos VALID_PRODUCT, mesmo que a URL tenha /social/
  if (hasPrice && hasImage) {
    return {
      status: "APPROVED",
      classification: "VALID_PRODUCT"
    };
  }

  // Se a URL contém "social", mas tem um título que parece uma lista de ofertas ou vitrine
  if (finalUrlLower.includes("/social/") || titleLower.includes("ofertas") || titleLower.includes("vitrine")) {
    return {
      status: "APPROVED", // Aprova para que a IA possa gerar copy de "loja/vitrine"
      classification: "STORE_PAGE"
    };
  }

  // Se for categoria
  if (finalUrlLower.includes("/c/") || finalUrlLower.includes("/categoria/")) {
    return {
      status: "APPROVED",
      classification: "CATEGORY_PAGE"
    };
  }

  // Se tem imagem mas sem preço, aprova como VALID_PRODUCT (pode ser produto sem preço exposto ou Shein/Shopee com JS)
  if (hasImage) {
    return {
      status: "APPROVED",
      classification: "VALID_PRODUCT"
    };
  }

  return {
    status: "APPROVED",
    classification: "UNKNOWN"
  };
}
