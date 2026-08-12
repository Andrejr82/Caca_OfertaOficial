import type { TrendCommercialDecision, TrendSignalClassification } from "@/core/trends/types";
import { expandMarketplaceQueries } from "@/lib/trends/targeted-marketplace-discovery";
import type { TrendMarketplaceIntent } from "@/lib/trends/multimarketplace-discovery";

export type TrendDiscoveryClassification = Pick<TrendSignalClassification, "decision" | "isProductIntent" | "normalizedProductTerm" | "categoryHint">;

export interface TrendIntentBuildOptions {
  maxTotalIntents?: number;
  maxIntentsPerCategory?: number;
}

export interface TrendIntentBuildResult {
  intents: TrendMarketplaceIntent[];
  categoryCounts: Record<string, number>;
  rejected: Array<{ normalizedProductTerm: string | null; reason: string }>;
}

const DEFAULT_MAX_TOTAL = 50;
const DEFAULT_MAX_PER_CATEGORY = 10;

function cleanTerm(value: string | null): string {
  return String(value ?? "").replace(/\s+/g, " ").trim();
}

function bounded(value: number | undefined, fallback: number): number {
  if (!Number.isFinite(value)) return fallback;
  return Math.min(100, Math.max(1, Math.trunc(value as number)));
}

function category(value: string | null): string {
  return cleanTerm(value) || "sem_categoria";
}

export function buildEligibleTrendMarketplaceIntents(
  classifications: TrendDiscoveryClassification[],
  options: TrendIntentBuildOptions = {}
): TrendIntentBuildResult {
  const maxTotalIntents = bounded(options.maxTotalIntents, DEFAULT_MAX_TOTAL);
  const maxIntentsPerCategory = bounded(options.maxIntentsPerCategory, DEFAULT_MAX_PER_CATEGORY);
  const rejected: TrendIntentBuildResult["rejected"] = [];
  const grouped = new Map<string, TrendMarketplaceIntent[]>();
  const seen = new Set<string>();

  for (const classification of classifications) {
    const term = cleanTerm(classification.normalizedProductTerm);
    if (classification.decision !== ("eligible" satisfies TrendCommercialDecision)) {
      rejected.push({ normalizedProductTerm: classification.normalizedProductTerm, reason: "Classificação comercial não elegível." });
      continue;
    }
    if (!classification.isProductIntent || !term) {
      rejected.push({ normalizedProductTerm: classification.normalizedProductTerm, reason: "Sinal não representa uma intenção de produto." });
      continue;
    }
    const categoryHint = category(classification.categoryHint);
    const key = `${categoryHint.toLocaleLowerCase("pt-BR")}\u0000${term.toLocaleLowerCase("pt-BR")}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const bucket = grouped.get(categoryHint) ?? [];
    if (bucket.length < maxIntentsPerCategory) {
      bucket.push({
        normalizedProductTerm: term,
        productIdentity: term,
        category: categoryHint,
        queryVariants: expandMarketplaceQueries(term)
      });
      grouped.set(categoryHint, bucket);
    }
  }

  const intents: TrendMarketplaceIntent[] = [];
  const categories = [...grouped.keys()].sort((left, right) => left.localeCompare(right, "pt-BR"));
  for (let index = 0; intents.length < maxTotalIntents && categories.length > 0; index += 1) {
    const bucket = grouped.get(categories[index % categories.length]) ?? [];
    const item = bucket.shift();
    if (item) intents.push(item);
    if (categories.every((name) => (grouped.get(name)?.length ?? 0) === 0)) break;
  }

  const categoryCounts = intents.reduce<Record<string, number>>((counts, intent) => {
    const name = intent.category ?? "sem_categoria";
    counts[name] = (counts[name] ?? 0) + 1;
    return counts;
  }, {});
  return { intents, categoryCounts, rejected };
}
