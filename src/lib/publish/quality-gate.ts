import type { Platform } from "@/types/domain";
import { validateOfferForPersistence } from "@/core/scraper/product-validator";

export interface LinkMetadata {
  title: string;
  platform: Platform;
  imageUrl?: string;
  price?: number;
  finalUrl?: string;
  imageSource?: string;
  confidenceScore?: number;
  extractionDate?: string;
  sold_quantity?: number;
  available_quantity?: number;
  official_store_id?: number | string | null;
  rating?: number;
}

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

  // 1. Identificar se é uma página de Vitrine, Social, Categoria ou Coleção
  const isStoreOrSocial = finalUrlLower.includes("/social/") || titleLower.includes("ofertas") || titleLower.includes("vitrine");
  const isCategory = finalUrlLower.includes("/c/") || finalUrlLower.includes("/categoria/");
  const isProfileUrl = finalUrlLower.includes("/perfil/");

  const hasPrice = metadata.price && metadata.price > 0;
  const hasImage = !!metadata.imageUrl;
  const isRandomSequence = /^[a-z0-9]{15,}$/i.test(metadata.title ? metadata.title.split(" | ")[0] : "");

  // Se a URL aponta explicitamente para uma vitrine/social (mesmo que não tenha preço individual)
  if (isStoreOrSocial) {
    return {
      status: "APPROVED",
      classification: "STORE_PAGE"
    };
  }

  // Se for uma categoria
  if (isCategory) {
    return {
      status: "APPROVED",
      classification: "CATEGORY_PAGE"
    };
  }

  // 2. Validação Estrita (Apenas para produtos individuais que não passaram nas checagens acima)
  const persistenceValidation = validateOfferForPersistence({
    product_name: metadata.title,
    platform: metadata.platform,
    original_url: metadata.finalUrl,
    image_url: metadata.imageUrl,
    current_price: metadata.price,
  });

  if (!persistenceValidation.valid) {
    if (finalUrlLower.includes('/gz/account-verification')) {
      return {
        status: "REJECTED",
        classification: "INVALID_PAGE",
        reason: "MERCADO_LIVRE_ANTIBOT_BLOCK"
      };
    }

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

  // Se tem preço e imagem, consideramos VALID_PRODUCT
  if (hasPrice && hasImage) {
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
