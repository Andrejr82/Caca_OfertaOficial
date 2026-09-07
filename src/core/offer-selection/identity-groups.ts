import type {
  CandidateDecisionV2,
  CandidateIdentityGroupV2,
} from "./types";

const BRANDS = [
  "lg",
  "samsung",
  "kingston",
  "crucial",
  "dell",
  "acer",
  "lenovo",
  "logitech",
  "redragon",
  "mondial",
  "epson",
  "tp-link",
  "tplink",
  "d-link",
  "dlink",
  "mercusys",
  "brother",
  "qcy",
  "jbl",
  "amazfit",
  "electrolux",
  "cadence",
  "olympikus",
  "philips",
  "xiaomi",
  "apple",
  "intel",
  "amd",
  "beelink",
];

function normalizeText(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function computeIdentityGroups(
  candidate: CandidateDecisionV2,
): CandidateIdentityGroupV2 {
  const normTitle = normalizeText(candidate.title);
  const words = normTitle.split(" ").filter((w) => w.length > 1);

  const brand = BRANDS.find((b) => normTitle.includes(b.replace("-", " ")) || normTitle.includes(b)) ?? "generic";

  const modelMatch = normTitle.match(/\b(ultragear|nv2|aspire\s*5?|ideapad\s*1?|c920s?|kumara|g203|ecotank\s*l\d+|tapo\s*c\d+|t13|go\s*3|bip\s*u|corre\s*3|s12\s*pro|bx500|fobos|es\s*50|ds\s*640|ac12g|tl\s*sg\d+|dgs\s*1016a|afn\s*40|dynamica)\b/i);
  const model = modelMatch ? modelMatch[0].replace(/\s+/g, "") : "";

  const rawSpecs: string[] = [];
  const screenMatch = normTitle.match(/\b(1[5-9]|2[0-9]|3[2-9]|4[0-9]|5[0-9]|6[5-9]|7[0-9]|8[5-9])\s*(?:polegadas|pol|"|''|\b)/gi);
  if (screenMatch && (normTitle.includes("monitor") || normTitle.includes("tv") || normTitle.includes("notebook") || normTitle.includes("smart tv"))) {
    const sizeNum = screenMatch[0].match(/\d+/)?.[0];
    if (sizeNum) rawSpecs.push(sizeNum);
  }

  const specMatch = normTitle.match(/\b(\d{1,4}(?:[.,]\d+)?\s*(?:tb|gb|mb|l|ml|w|hz|fps|v|k))\b/gi);
  if (specMatch) {
    for (const s of specMatch) {
      rawSpecs.push(s.replace(/\s+/g, "").toLowerCase());
    }
  }

  const specs = [...new Set(rawSpecs)].sort().join(":");

  const exactKey = `${candidate.marketplace.toLowerCase()}:${candidate.nativeIdentity.toLowerCase().startsWith("b0") ? "asin" : "item"}:${candidate.nativeIdentity.toLowerCase()}`;

  const familyKey = brand !== "generic" && model
    ? `${brand}:${model}${specs ? `:${specs}` : ""}`
    : `${brand}:${words.slice(0, 3).join("-")}`;

  const hasHighConfidence = brand !== "generic" && (model.length > 0 || specs.length > 0);
  const confidence = hasHighConfidence ? 90 : 60;
  const crossMarketplaceKey = hasHighConfidence ? `${brand}:${model || "model"}:${specs || "spec"}` : null;

  return Object.freeze({
    exactKey,
    familyKey,
    crossMarketplaceKey,
    confidence,
  });
}

export function deduplicateCandidatesByGroup(candidates: readonly CandidateDecisionV2[]): {
  selected: CandidateDecisionV2[];
  duplicates: Array<{
    candidate: CandidateDecisionV2;
    winnerSourceItemId: string;
    groupKey: string;
  }>;
} {
  const groups = new Map<string, CandidateDecisionV2[]>();

  for (const candidate of candidates) {
    const identity = computeIdentityGroups(candidate);
    const key = identity.crossMarketplaceKey ?? identity.exactKey;

    if (!groups.has(key)) {
      groups.set(key, []);
    }
    groups.get(key)!.push(candidate);
  }

  const selected: CandidateDecisionV2[] = [];
  const duplicates: Array<{
    candidate: CandidateDecisionV2;
    winnerSourceItemId: string;
    groupKey: string;
  }> = [];

  for (const [groupKey, items] of groups.entries()) {
    // Ordena pelo menor preço válido; se empate, maior rating
    items.sort((a, b) => {
      const priceDiff = a.evidence.currentPrice - b.evidence.currentPrice;
      if (Math.abs(priceDiff) > 0.01) return priceDiff;
      const aRating = a.evidence.rating ?? 0;
      const bRating = b.evidence.rating ?? 0;
      return bRating - aRating;
    });

    const winner = items[0];
    selected.push(winner);

    for (let i = 1; i < items.length; i++) {
      const duplicateCandidate: CandidateDecisionV2 = {
        ...items[i],
        decision: "deferred",
        reasons: [
          ...items[i].reasons,
          {
            stage: "deduplication",
            code: "DUPLICATE_GROUP_OFFER",
            message: `Oferta duplicada com menor vantagem em relação ao vencedor ${winner.sourceItemId}`,
          },
        ],
      };
      duplicates.push({
        candidate: duplicateCandidate,
        winnerSourceItemId: winner.sourceItemId,
        groupKey,
      });
    }
  }

  return { selected, duplicates };
}
