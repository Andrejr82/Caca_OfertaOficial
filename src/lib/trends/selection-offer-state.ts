export type TrendOfferHandoffResolution = "reuse" | "select" | "reopen" | "reject";

export type TrendOfferHandoffBlock = {
  code: "offer_unavailable" | "trend_missing_image";
  message: string;
};

export const TREND_REJECTED_OFFER_MESSAGE = "Esta oportunidade está vinculada a uma oferta rejeitada. Ignore-a ou aguarde nova oportunidade.";
export const TREND_MISSING_IMAGE_MESSAGE = "Esta oportunidade não possui imagem oficial válida e não pode ser aprovada para publicação.";

export function supportsTrendApprovalMarketplace(marketplace: string | null | undefined): boolean {
  return marketplace === "Shopee" || marketplace === "Mercado Livre" || marketplace === "Amazon";
}

/**
 * A tendência só pode aparecer na fila de aprovação quando a oferta exata
 * puder ser entregue ao fluxo oficial de seleção. Estados já publicados,
 * expirados ou desconhecidos ficam fora da fila.
 */
export function isTrendOfferApprovalEligible(status: string | null | undefined): boolean {
  if (!status) return false;
  return resolveTrendOfferHandoff(status.trim().toLowerCase()) !== "reject";
}

export function resolveTrendOfferHandoff(status: string): TrendOfferHandoffResolution {
  if (status === "selected" || status === "approved") return "reuse";
  if (status === "pending_manual_review") return "select";
  if (status === "rejected") return "reopen";
  return "reject";
}

export function resolveTrendOfferHandoffBlock(status: string): TrendOfferHandoffBlock | null {
  if (resolveTrendOfferHandoff(status) !== "reject") return null;
  return {
    code: "offer_unavailable",
    message: `Esta oportunidade está vinculada a uma oferta em estado ${status || "desconhecido"} e não pode ser aprovada automaticamente.`,
  };
}

function parseValidHttpsUrl(value: unknown): string | null {
  if (!value) return null;
  const raw = String(value).trim();
  if (!raw) return null;
  try {
    const parsed = new URL(raw);
    return parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

export function resolveTrendSnapshotImageUrl(
  evidence?: Record<string, unknown> | null,
  candidateOrProduct?: Record<string, unknown> | null,
  offer?: Record<string, unknown> | null,
): string | null {
  const ev = evidence ?? {};
  const metrics = (ev.commercial_metrics && typeof ev.commercial_metrics === "object"
    ? ev.commercial_metrics as Record<string, unknown>
    : {}) ?? {};

  // 1. image_url do snapshot
  const fromSnapshot = parseValidHttpsUrl(ev.image_url ?? ev.imageUrl);
  if (fromSnapshot) return fromSnapshot;

  // 2. imageUrl / thumbnail oficial já presente no candidato/evidência
  const fromThumbnail = parseValidHttpsUrl(
    ev.thumbnail ??
    ev.picture ??
    (Array.isArray(ev.pictures) && ev.pictures[0] ? ev.pictures[0] : null) ??
    candidateOrProduct?.imageUrl ??
    candidateOrProduct?.image_url ??
    candidateOrProduct?.thumbnail
  );
  if (fromThumbnail) return fromThumbnail;

  // 3. imagem existente da oferta encontrada pela mesma identidade oficial
  const fromOffer = parseValidHttpsUrl(offer?.image_url);
  if (fromOffer) return fromOffer;

  // 4. primeira imagem oficial existente em metadata/gallery/explainability já persistida
  const explainability = (offer?.explainability && typeof offer.explainability === "object"
    ? offer.explainability as Record<string, unknown>
    : {}) ?? {};
  const offerMetrics = (offer?.marketplace_metrics && typeof offer.marketplace_metrics === "object"
    ? offer.marketplace_metrics as Record<string, unknown>
    : {}) ?? {};

  const fromMetadata = parseValidHttpsUrl(
    metrics.image_url ??
    metrics.imageUrl ??
    explainability.image_url ??
    explainability.imageUrl ??
    offerMetrics.image_url ??
    offerMetrics.imageUrl
  );
  if (fromMetadata) return fromMetadata;

  return null;
}

export function validateTrendOfferImage(imageUrl: string | null | undefined): TrendOfferHandoffBlock | null {
  const valid = parseValidHttpsUrl(imageUrl);
  if (!valid) {
    return {
      code: "trend_missing_image",
      message: TREND_MISSING_IMAGE_MESSAGE,
    };
  }
  return null;
}
