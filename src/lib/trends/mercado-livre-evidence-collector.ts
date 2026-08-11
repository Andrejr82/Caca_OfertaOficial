import type { TrendDirectEvidence, TrendSignal } from "@/core/trends/types";

const SITE_ID = "MLB";
const SOURCE = "mercado_livre_best_seller";

type HighlightEntityType = "ITEM" | "PRODUCT" | "USER_PRODUCT";
type OfficialEntity = Record<string, unknown>;
type LoadedEntity = OfficialEntity | { entity: OfficialEntity; offer?: OfficialEntity | null };

type HighlightEntry = {
  id?: unknown;
  position?: unknown;
  type?: unknown;
};

type HighlightPayload = {
  query_data?: {
    highlight_type?: unknown;
    criteria?: unknown;
    id?: unknown;
  };
  content?: unknown;
};

interface NormalizeOptions {
  categoryId: string;
  observedAt: string;
  capturedAt: string;
  loadEntity: (entry: { id: string; type: "ITEM" | "PRODUCT" }) => Promise<LoadedEntity>;
}

interface CollectorDependencies {
  now?: () => Date;
  loadHighlights?: (categoryId: string, accessToken: string) => Promise<unknown>;
  loadEntity?: (entry: { id: string; type: "ITEM" | "PRODUCT" }, accessToken: string) => Promise<LoadedEntity>;
}

interface MercadoLivreOfficialService {
  apiGet(path: string, options: { accessToken: string }): Promise<any>;
}

export interface MercadoLivreEvidenceCollectionResult {
  source: typeof SOURCE;
  status: "ok" | "empty" | "failed";
  received: number;
  accepted: number;
  rejected: number;
  errorCode: string | null;
  signals: TrendSignal[];
}

function text(value: unknown): string | null {
  const result = String(value ?? "").trim();
  return result || null;
}

function validDate(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function numberOrNull(value: unknown, minimum = 0): number | null {
  if (value === null || value === undefined || value === "") return null;
  const result = Number(value);
  return Number.isFinite(result) && result >= minimum ? result : null;
}

function integerOrNull(value: unknown, minimum = 0): number | null {
  const result = numberOrNull(value, minimum);
  return result !== null && Number.isInteger(result) ? result : null;
}

function validCategoryId(value: unknown): string | null {
  const categoryId = text(value)?.toUpperCase() ?? null;
  return categoryId && /^MLB\d+$/u.test(categoryId) ? categoryId : null;
}

function validEntityId(value: unknown, type: HighlightEntityType): string | null {
  const id = text(value)?.toUpperCase() ?? null;
  if (!id) return null;
  if (type === "USER_PRODUCT") return /^MLBU\d+$/u.test(id) ? id : null;
  return /^MLB\d+$/u.test(id) ? id : null;
}

function entityType(value: unknown): HighlightEntityType | null {
  return value === "ITEM" || value === "PRODUCT" || value === "USER_PRODUCT" ? value : null;
}

function apiUrl(path: string): string {
  return `https://api.mercadolibre.com${path}`;
}

function emptyEvidence(input: {
  claim: string;
  evidenceType: string;
  sourceUrl: string;
  observedAt: string;
  identity: Record<string, string | null>;
}): TrendDirectEvidence {
  return {
    claim: input.claim,
    evidence_type: input.evidenceType,
    source_url: input.sourceUrl,
    observed_at: input.observedAt,
    rank_position: null,
    best_seller_flag: null,
    trending_flag: null,
    sold_quantity: null,
    price: null,
    old_price: null,
    discount_percent: null,
    rating: null,
    review_count: null,
    shipping: null,
    marketplace_identity: input.identity
  };
}

function failed(errorCode: string): MercadoLivreEvidenceCollectionResult {
  return { source: SOURCE, status: "failed", received: 0, accepted: 0, rejected: 0, errorCode, signals: [] };
}

function finalize(received: number, signals: TrendSignal[]): MercadoLivreEvidenceCollectionResult {
  const accepted = signals.length;
  return {
    source: SOURCE,
    status: accepted > 0 ? "ok" : "empty",
    received,
    accepted,
    rejected: Math.max(0, received - accepted),
    errorCode: null,
    signals
  };
}

function itemIdentity(categoryId: string, itemId: string, productId: string | null = null) {
  return {
    marketplace: "mercado_livre",
    entity_type: "ITEM",
    item_id: itemId,
    product_id: productId,
    category_id: categoryId
  };
}

function productIdentity(categoryId: string, productId: string) {
  return {
    marketplace: "mercado_livre",
    entity_type: "PRODUCT",
    item_id: null,
    product_id: productId,
    category_id: categoryId
  };
}

function splitLoadedEntity(value: LoadedEntity): { entity: OfficialEntity; offer: OfficialEntity | null } {
  if (value && typeof value === "object" && "entity" in value) {
    const wrapped = value as { entity?: unknown; offer?: unknown };
    return {
      entity: wrapped.entity && typeof wrapped.entity === "object" ? wrapped.entity as OfficialEntity : {},
      offer: wrapped.offer && typeof wrapped.offer === "object" ? wrapped.offer as OfficialEntity : null
    };
  }
  return { entity: value as OfficialEntity, offer: null };
}

function applyOfferFacts(evidence: TrendDirectEvidence, entity: OfficialEntity) {
  evidence.price = numberOrNull(entity.price, 0.01);
  evidence.old_price = numberOrNull(entity.original_price, 0.01);
  evidence.sold_quantity = integerOrNull(entity.sold_quantity, 0);
  const shipping = entity.shipping && typeof entity.shipping === "object" ? entity.shipping as Record<string, unknown> : null;
  evidence.shipping = shipping?.free_shipping === true ? "free_shipping" : null;
}

function normalizeItemEvidence(entity: OfficialEntity, categoryId: string, itemId: string, observedAt: string): { title: string; evidence: TrendDirectEvidence } | null {
  const resolvedId = text(entity.id)?.toUpperCase();
  const title = text(entity.title);
  if (resolvedId !== itemId || !title) return null;

  const evidence = emptyEvidence({
    claim: `Item observado via API oficial do Mercado Livre: ${title}.`,
    evidenceType: "mercado_livre_offer",
    sourceUrl: apiUrl(`/items?ids=${itemId}`),
    observedAt,
    identity: itemIdentity(categoryId, itemId, text(entity.catalog_product_id)?.toUpperCase() ?? null)
  });
  applyOfferFacts(evidence, entity);
  return { title, evidence };
}

function normalizeProductEvidence(entity: OfficialEntity, categoryId: string, productId: string, observedAt: string): { title: string; evidence: TrendDirectEvidence } | null {
  const resolvedId = text(entity.id)?.toUpperCase();
  const title = text(entity.name) ?? text(entity.title);
  if (resolvedId !== productId || !title) return null;

  return {
    title,
    evidence: emptyEvidence({
      claim: `Produto de catálogo observado via API oficial do Mercado Livre: ${title}.`,
      evidenceType: "mercado_livre_product_evidence",
      sourceUrl: apiUrl(`/products/${productId}`),
      observedAt,
      identity: productIdentity(categoryId, productId)
    })
  };
}

function normalizeProductOfferEvidence(offer: OfficialEntity | null, categoryId: string, productId: string, title: string, observedAt: string): TrendDirectEvidence | null {
  if (!offer) return null;
  const itemId = validEntityId(offer.item_id ?? offer.id, "ITEM");
  const price = numberOrNull(offer.price, 0.01);
  if (!itemId || price === null) return null;

  const evidence = emptyEvidence({
    claim: `Oferta ativa observada para o produto de catálogo ${title}.`,
    evidenceType: "mercado_livre_offer",
    sourceUrl: apiUrl(`/products/${productId}/items?limit=20`),
    observedAt,
    identity: itemIdentity(categoryId, itemId, productId)
  });
  applyOfferFacts(evidence, offer);
  return evidence;
}

export async function normalizeMercadoLivreBestSellerEvidence(
  payload: unknown,
  options: NormalizeOptions
): Promise<MercadoLivreEvidenceCollectionResult> {
  const categoryId = validCategoryId(options.categoryId);
  const observedAt = validDate(options.observedAt);
  const capturedAt = validDate(options.capturedAt);
  if (!categoryId) return failed("invalid_category_id");
  if (!observedAt) return failed("invalid_observed_at");
  if (!capturedAt) return failed("invalid_captured_at");

  const body = payload && typeof payload === "object" ? payload as HighlightPayload : {};
  const queryData = body.query_data;
  const contractMatches = queryData?.highlight_type === "BEST_SELLER"
    && queryData?.criteria === "CATEGORY"
    && validCategoryId(queryData?.id) === categoryId;
  if (!contractMatches) return failed("invalid_highlight_contract");

  const entries = Array.isArray(body.content) ? body.content as HighlightEntry[] : [];
  const signals: TrendSignal[] = [];

  for (const rawEntry of entries) {
    const type = entityType(rawEntry.type);
    const position = integerOrNull(rawEntry.position, 1);
    if (!type || !position || position > 20 || type === "USER_PRODUCT") continue;
    const id = validEntityId(rawEntry.id, type);
    if (!id) continue;

    let loaded: { entity: OfficialEntity; offer: OfficialEntity | null };
    try {
      loaded = splitLoadedEntity(await options.loadEntity({ id, type }));
    } catch {
      continue;
    }

    const commercial = type === "ITEM"
      ? normalizeItemEvidence(loaded.entity, categoryId, id, observedAt)
      : normalizeProductEvidence(loaded.entity, categoryId, id, observedAt);
    if (!commercial) continue;

    const identity = type === "ITEM" ? itemIdentity(categoryId, id, text(loaded.entity.catalog_product_id)?.toUpperCase() ?? null) : productIdentity(categoryId, id);
    const rankEvidence = emptyEvidence({
      claim: `${commercial.title} ocupa a posição ${position} no ranking oficial BEST_SELLER da categoria ${categoryId}.`,
      evidenceType: SOURCE,
      sourceUrl: apiUrl(`/highlights/${SITE_ID}/category/${categoryId}`),
      observedAt,
      identity
    });
    rankEvidence.rank_position = position;
    rankEvidence.best_seller_flag = true;

    const directEvidence = [rankEvidence, commercial.evidence];
    if (type === "PRODUCT") {
      const offerEvidence = normalizeProductOfferEvidence(loaded.offer, categoryId, id, commercial.title, observedAt);
      if (offerEvidence) directEvidence.push(offerEvidence);
    }

    const externalId = `${SITE_ID}:${categoryId}:${type}:${id}`;
    signals.push({
      id: `${SOURCE}:${externalId}`,
      sourceType: "external",
      sourceName: SOURCE,
      source: SOURCE,
      region: "BR",
      externalId,
      term: commercial.title,
      title: commercial.title,
      evidence: {
        source_urls: directEvidence.map((evidence) => evidence.source_url).filter((url): url is string => Boolean(url)),
        direct_evidence: directEvidence,
        category_id: categoryId,
        highlight_type: "BEST_SELLER",
        entity_type: type
      },
      observedAt,
      capturedAt,
      trendStrength: null,
      trendDirection: null,
      offerId: null
    });
  }

  return finalize(entries.length, signals);
}

function officialService(): MercadoLivreOfficialService {
  return require("../../../scripts/mercadolivre-official-intents-v5.cjs") as MercadoLivreOfficialService;
}

async function loadHighlights(categoryId: string, accessToken: string): Promise<unknown> {
  return officialService().apiGet(`/highlights/${SITE_ID}/category/${categoryId}`, { accessToken });
}

async function loadEntity(entry: { id: string; type: "ITEM" | "PRODUCT" }, accessToken: string): Promise<LoadedEntity> {
  const service = officialService();
  if (entry.type === "ITEM") {
    const response = await service.apiGet(`/items?ids=${encodeURIComponent(entry.id)}`, { accessToken });
    const first = Array.isArray(response) ? response[0] : null;
    return first?.body && typeof first.body === "object" ? first.body as OfficialEntity : {};
  }

  const [entity, offersPayload] = await Promise.all([
    service.apiGet(`/products/${entry.id}`, { accessToken }),
    service.apiGet(`/products/${entry.id}/items?limit=20`, { accessToken })
  ]);
  const offers = Array.isArray(offersPayload?.results) ? offersPayload.results as OfficialEntity[] : [];
  const offer = offers.find((candidate) => numberOrNull(candidate.price, 0.01) !== null) ?? null;
  return {
    entity: entity && typeof entity === "object" ? entity as OfficialEntity : {},
    offer
  };
}

export async function collectMercadoLivreBestSellerEvidence(
  categoryId: string,
  accessToken: string,
  dependencies: CollectorDependencies = {}
): Promise<MercadoLivreEvidenceCollectionResult> {
  const observedAt = (dependencies.now?.() ?? new Date()).toISOString();
  try {
    const payload = await (dependencies.loadHighlights ?? loadHighlights)(categoryId, accessToken);
    return normalizeMercadoLivreBestSellerEvidence(payload, {
      categoryId,
      observedAt,
      capturedAt: observedAt,
      loadEntity: (entry) => (dependencies.loadEntity ?? loadEntity)(entry, accessToken)
    });
  } catch {
    return failed("source_unavailable");
  }
}
