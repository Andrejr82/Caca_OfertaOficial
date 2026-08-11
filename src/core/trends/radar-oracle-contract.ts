import type { TrendRadarSnapshotProductView, TrendRadarSnapshotView } from "@/lib/trends/radar-queries";

export const RADAR_ORACLE_CONTRACT_VERSION = "trend-executive.radar-oracle/v1";

export type RadarOracleMarketplace = "Shopee" | "Amazon" | "Mercado Livre";

export interface RadarOracleEvidenceRefs {
  radarRunId: string;
  radarProductId: string;
  opportunityId: string | null;
}

export interface RadarOracleDiscoveryContract {
  contractVersion: typeof RADAR_ORACLE_CONTRACT_VERSION;
  authority: "shadow_only";
  radarRunId: string;
  radarProductId: string;
  radarDate: string;
  strategyVersion: string;
  priority: number;
  marketplace: RadarOracleMarketplace;
  productTerm: string;
  normalizedProductTerm: string;
  category: string | null;
  searchTerms: string[];
  allowedProductTerms: string[];
  blockedProductTerms: string[];
  evidenceStatus: string;
  commercialScore: number | null;
  confidence: number;
  evidenceRefs: RadarOracleEvidenceRefs;
}

export interface RejectedRadarOracleProduct {
  radarProductId: string;
  priority: number;
  productTerm: string;
  marketplace: string | null;
  reason: "unsupported_marketplace" | "missing_product_term";
}

export interface RadarOracleContractBuildResult {
  contracts: RadarOracleDiscoveryContract[];
  rejected: RejectedRadarOracleProduct[];
}

const SUPPORTED_MARKETPLACES = new Set<RadarOracleMarketplace>([
  "Shopee",
  "Amazon",
  "Mercado Livre",
]);

function uniqueStrings(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const raw of values) {
    const value = String(raw ?? "").trim();
    if (!value || seen.has(value)) continue;
    seen.add(value);
    result.push(value);
  }
  return result;
}

function isSupportedMarketplace(value: string | null): value is RadarOracleMarketplace {
  return Boolean(value && SUPPORTED_MARKETPLACES.has(value as RadarOracleMarketplace));
}

function marketplaceFromEvidenceUrl(value: string): RadarOracleMarketplace | null {
  try {
    const hostname = new URL(value).hostname.toLocaleLowerCase("pt-BR").replace(/^www\./u, "");
    if (hostname === "shopee.com.br" || hostname.endsWith(".shopee.com.br")) return "Shopee";
    if (
      hostname === "mercadolivre.com.br"
      || hostname.endsWith(".mercadolivre.com.br")
      || hostname === "mercadolibre.com.br"
      || hostname.endsWith(".mercadolibre.com.br")
    ) return "Mercado Livre";
    if (hostname === "amazon.com.br" || hostname.endsWith(".amazon.com.br")) return "Amazon";
    return null;
  } catch {
    return null;
  }
}

function resolveMarketplace(product: TrendRadarSnapshotProductView): RadarOracleMarketplace | null {
  const evidenceMarketplaces = new Set(
    product.directEvidenceSourceUrls
      .map(marketplaceFromEvidenceUrl)
      .filter((value): value is RadarOracleMarketplace => value !== null),
  );
  const evidenceMarketplace = evidenceMarketplaces.size === 1 ? [...evidenceMarketplaces][0] : null;

  if (product.marketplace !== null) {
    if (!isSupportedMarketplace(product.marketplace)) return null;
    if (evidenceMarketplaces.size > 1) return null;
    if (evidenceMarketplace && evidenceMarketplace !== product.marketplace) return null;
    return product.marketplace;
  }

  return evidenceMarketplaces.size === 1 ? evidenceMarketplace : null;
}

function buildContract(snapshot: TrendRadarSnapshotView, product: TrendRadarSnapshotProductView): RadarOracleDiscoveryContract | null {
  const productTerm = product.productTerm.trim();
  const normalizedProductTerm = product.normalizedProductTerm.trim();
  const marketplace = resolveMarketplace(product);
  if (!productTerm || !normalizedProductTerm || !marketplace) return null;

  return {
    contractVersion: RADAR_ORACLE_CONTRACT_VERSION,
    authority: "shadow_only",
    radarRunId: snapshot.id,
    radarProductId: product.id,
    radarDate: snapshot.radarDate,
    strategyVersion: snapshot.strategyVersion,
    priority: product.priority,
    marketplace,
    productTerm,
    normalizedProductTerm,
    category: product.category,
    searchTerms: uniqueStrings([productTerm, normalizedProductTerm]),
    allowedProductTerms: [normalizedProductTerm],
    blockedProductTerms: [],
    evidenceStatus: product.evidenceStatus,
    commercialScore: product.commercialScore,
    confidence: product.confidence,
    evidenceRefs: {
      radarRunId: snapshot.id,
      radarProductId: product.id,
      opportunityId: product.opportunityId,
    },
  };
}

export function buildRadarOracleDiscoveryContracts(snapshot: TrendRadarSnapshotView): RadarOracleContractBuildResult {
  if (snapshot.status !== "completed") {
    throw new Error("Radar -> Oracle exige snapshot completed.");
  }

  const contracts: RadarOracleDiscoveryContract[] = [];
  const rejected: RejectedRadarOracleProduct[] = [];

  for (const product of [...snapshot.products].sort((a, b) => a.priority - b.priority || a.id.localeCompare(b.id))) {
    const contract = buildContract(snapshot, product);
    if (contract) {
      contracts.push(contract);
      continue;
    }

    rejected.push({
      radarProductId: product.id,
      priority: product.priority,
      productTerm: product.productTerm,
      marketplace: product.marketplace,
      reason: product.productTerm.trim() && product.normalizedProductTerm.trim()
        ? "unsupported_marketplace"
        : "missing_product_term",
    });
  }

  return { contracts, rejected };
}
