export interface CommercialPortfolioOffer {
  id: string;
  product_name?: string | null;
  platform?: string | null;
  current_price?: number | string | null;
  old_price?: number | string | null;
  category?: string | null;
  explainability?: Record<string, unknown> | null;
  status?: string | null;
}

export interface CommercialPortfolioOptions {
  maxTotal?: number;
  maxPerType?: number;
}

export interface CommercialPortfolioRankedOffer {
  offer: CommercialPortfolioOffer;
  score: number;
  commercialType: string;
  comparablePrice: number;
  measureKind: "unit" | "weight" | "volume" | "each";
  reasons: readonly string[];
}

export interface CommercialPortfolioSelection {
  selected: readonly CommercialPortfolioRankedOffer[];
  rejected: readonly (CommercialPortfolioRankedOffer & { rejectionReason: string })[];
}

const TYPE_PATTERNS: readonly [string, RegExp][] = [
  ["tapete-higienico", /\btapete\s+higienic/],
  ["caixa-areia", /\b(caixa|bandeja|sanitario|banheiro).*\b(areia|gato)|\bfurba\b|\bfurbox\b/],
  ["areia-gato", /\bareia\b.*\b(gato|gatos|silica|biodegradavel)|\b(areia\s+biodegradavel|areia\s+silica)\b/],
  ["racao", /\bracao\b/],
  ["cama-pet", /\b(cama|caminha)\b.*\b(pet|cachorro|gato)/],
  ["arranhador", /\barranhador\b/],
  ["bebedouro-pet", /\bbebedouro\b.*\b(pet|cao|caes|gato)/],
  ["mordedor-pet", /\bmordedor\b.*\b(cachorro|pet)/],
  ["tenis", /\btenis\b/],
  ["notebook", /\b(notebook|laptop)\b/],
  ["smartphone", /\b(celular|smartphone|iphone|galaxy)\b/],
  ["fone", /\b(fone|headphone|headset|earbuds?)\b/],
  ["smartwatch", /\b(smartwatch|relogio inteligente)\b/],
  ["air-fryer", /\bair\s*fryer\b/],
  ["liquidificador", /\bliquidificador\b/],
  ["cafeteira", /\bcafeteira\b/],
  ["panela", /\bpanela\b/],
  ["aspirador", /\baspirador\b/],
  ["geladeira", /\b(geladeira|refrigerador)\b/],
  ["microondas", /\bmicro\s*ondas\b/],
  ["parafusadeira", /\bparafusadeira\b/],
  ["furadeira", /\bfuradeira\b/],
  ["serra", /\bserra\b/],
  ["organizador", /\borganizador\b/],
  ["pote", /\bpotes?\b/],
  ["secador", /\bsecador\b/],
  ["chapinha", /\b(chapinha|prancha)\b/],
  ["escova-secadora", /\bescova\b.*\b(secadora|alisadora)\b/],
];

const STOP_WORDS = new Set([
  "de", "da", "do", "das", "dos", "para", "com", "sem", "por", "em", "e", "a", "o", "as", "os",
  "um", "uma", "kit", "pack", "cor", "modelo", "produto", "pet", "cao", "caes", "cachorro", "gato", "gatos",
]);

function normalize(value: unknown): string {
  return String(value ?? "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function number(value: unknown): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}

function metrics(offer: CommercialPortfolioOffer): Record<string, unknown> {
  const explainability = offer.explainability && typeof offer.explainability === "object" ? offer.explainability : {};
  const value = (explainability as Record<string, unknown>).marketplace_metrics;
  return value && typeof value === "object" ? value as Record<string, unknown> : {};
}

function commercialType(offer: CommercialPortfolioOffer): string {
  const text = normalize(`${offer.product_name ?? ""} ${offer.category ?? ""}`);
  for (const [type, pattern] of TYPE_PATTERNS) if (pattern.test(text)) return type;
  const tokens = text.split(" ").filter((token) => token.length > 2 && !STOP_WORDS.has(token));
  return `other:${tokens.slice(0, 3).join("-") || "unknown"}`;
}

function parseComparableAmount(title: string, type: string): { kind: CommercialPortfolioRankedOffer["measureKind"]; amount: number } {
  const text = normalize(title).replace(/,/g, ".");
  const multipack = text.match(/\b(\d{1,3})\s*x\s*(\d+(?:\.\d+)?)\s*(kg|g|l|ml)\b/);
  if (multipack) {
    const count = number(multipack[1]);
    const value = number(multipack[2]);
    const unit = multipack[3];
    if (unit === "kg") return { kind: "weight", amount: count * value * 1000 };
    if (unit === "g") return { kind: "weight", amount: count * value };
    if (unit === "l") return { kind: "volume", amount: count * value * 1000 };
    return { kind: "volume", amount: count * value };
  }

  const weight = text.match(/\b(\d+(?:\.\d+)?)\s*(kg|g)\b/);
  if (weight) return { kind: "weight", amount: number(weight[1]) * (weight[2] === "kg" ? 1000 : 1) };

  const volume = text.match(/\b(\d+(?:\.\d+)?)\s*(l|ml)\b/);
  if (volume) return { kind: "volume", amount: number(volume[1]) * (volume[2] === "l" ? 1000 : 1) };

  if (type === "tapete-higienico") {
    const count = text.match(/\b(\d{1,3})\s*(?:un|unid|unidade|unidades)\b/);
    if (count) return { kind: "unit", amount: number(count[1]) };
  }

  return { kind: "each", amount: 1 };
}

function explicitDiscountPercent(offer: CommercialPortfolioOffer): number {
  const current = number(offer.current_price);
  const old = number(offer.old_price);
  if (old > current && current > 0) return Math.min(80, ((old - current) / old) * 100);
  const m = metrics(offer);
  const explicit = number(m.discountPercent);
  return explicit > 0 && explicit <= 80 ? explicit : 0;
}

function normalizedTokens(title: string): Set<string> {
  return new Set(normalize(title)
    .split(" ")
    .filter((token) => token.length > 2 && !STOP_WORDS.has(token) && !/^\d+(?:\.\d+)?$/.test(token))
    .filter((token) => !/^(kg|ml|cm|mm|un|unid|unidade|unidades)$/.test(token)));
}

function similarity(a: string, b: string): number {
  const left = normalizedTokens(a);
  const right = normalizedTokens(b);
  if (!left.size || !right.size) return 0;
  let intersection = 0;
  for (const token of left) if (right.has(token)) intersection += 1;
  return intersection / new Set([...left, ...right]).size;
}

function scoreRows(offers: readonly CommercialPortfolioOffer[]): CommercialPortfolioRankedOffer[] {
  const prepared = offers
    .filter((offer) => offer.id && number(offer.current_price) > 0 && offer.status !== "rejected")
    .map((offer) => {
      const type = commercialType(offer);
      const amount = parseComparableAmount(offer.product_name ?? "", type);
      const current = number(offer.current_price);
      return {
        offer,
        commercialType: type,
        measureKind: amount.kind,
        comparablePrice: current / Math.max(amount.amount, 1),
      };
    });

  const minByGroup = new Map<string, number>();
  const countByGroup = new Map<string, number>();
  for (const row of prepared) {
    const key = `${row.commercialType}:${row.measureKind}`;
    minByGroup.set(key, Math.min(minByGroup.get(key) ?? Number.POSITIVE_INFINITY, row.comparablePrice));
    countByGroup.set(key, (countByGroup.get(key) ?? 0) + 1);
  }

  return prepared.map((row) => {
    const m = metrics(row.offer);
    const group = `${row.commercialType}:${row.measureKind}`;
    const groupCount = countByGroup.get(group) ?? 1;
    const minPrice = minByGroup.get(group) ?? row.comparablePrice;
    const pricePoints = groupCount > 1
      ? 30 * Math.min(1, minPrice / row.comparablePrice)
      : 18;
    const discountPct = explicitDiscountPercent(row.offer);
    const discountPoints = Math.min(20, (discountPct / 50) * 20);
    const sales = number(m.sales);
    const reviews = number(m.reviewCount);
    const proofBase = sales || reviews;
    const socialPoints = proofBase > 0 ? Math.min(20, (Math.log10(proofBase + 1) / 4.2) * 20) : 8;
    const rating = number(m.rating) || number(m.sellerRating);
    const ratingPoints = rating > 0 ? Math.min(10, (rating / 5) * 10) : 5;
    const commission = number(m.commissionRate);
    const commissionPoints = commission > 0 ? Math.min(10, (commission / 20) * 10) : 5;
    const position = number(m.sourcePosition) || number(m.position);
    const positionPoints = position > 0 ? (position <= 3 ? 5 : position <= 10 ? 3.5 : 1.5) : 2.5;
    const trustPoints = m.officialStoreId || m.prime || m.coupon ? 5 : 2.5;
    const total = Number((pricePoints + discountPoints + socialPoints + ratingPoints + commissionPoints + positionPoints + trustPoints).toFixed(2));
    return {
      ...row,
      score: total,
      reasons: Object.freeze([
        `price=${pricePoints.toFixed(1)}`,
        `discount=${discountPoints.toFixed(1)}`,
        `social=${socialPoints.toFixed(1)}`,
        `rating=${ratingPoints.toFixed(1)}`,
        `commission=${commissionPoints.toFixed(1)}`,
      ]),
    };
  }).sort((a, b) => b.score - a.score || a.offer.id.localeCompare(b.offer.id));
}

export function selectCommercialPortfolio(
  offers: readonly CommercialPortfolioOffer[],
  options: CommercialPortfolioOptions = {},
): CommercialPortfolioSelection {
  const maxTotal = Math.max(1, Math.floor(options.maxTotal ?? 18));
  const maxPerType = Math.max(1, Math.floor(options.maxPerType ?? 2));
  const ranked = scoreRows(offers);
  const selected: CommercialPortfolioRankedOffer[] = [];
  const rejected: Array<CommercialPortfolioRankedOffer & { rejectionReason: string }> = [];
  const typeCounts = new Map<string, number>();

  for (const row of ranked) {
    const nearDuplicate = selected.find((existing) =>
      existing.commercialType === row.commercialType
      && similarity(existing.offer.product_name ?? "", row.offer.product_name ?? "") >= 0.78);
    if (nearDuplicate) {
      rejected.push({ ...row, rejectionReason: "near_duplicate" });
      continue;
    }
    if ((typeCounts.get(row.commercialType) ?? 0) >= maxPerType) {
      rejected.push({ ...row, rejectionReason: "commercial_type_cap" });
      continue;
    }
    if (selected.length >= maxTotal) {
      rejected.push({ ...row, rejectionReason: "portfolio_limit" });
      continue;
    }
    selected.push(row);
    typeCounts.set(row.commercialType, (typeCounts.get(row.commercialType) ?? 0) + 1);
  }

  return Object.freeze({ selected: Object.freeze(selected), rejected: Object.freeze(rejected) });
}
