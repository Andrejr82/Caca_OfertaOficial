const categoryBoosts: Record<string, number> = {
  casa: 0.5,
  cozinha: 0.4,
  eletronicos: 0.6,
  eletrônicos: 0.6,
  beleza: 0.4,
  moda: 0.3,
  mercado: 0.4
};

export interface ScoreInput {
  current_price: number;
  old_price?: number | null;
  coupon?: string | null;
  rating?: number | null;
  estimated_commission?: number | null;
  category?: string | null;
  seasonality?: number | null;
  /** Nome do produto — usado para calcular brand_score real no score-v2.ts */
  product_name?: string | null;
}

export function calculateOfferScore(input: ScoreInput) {
  let score = 2;

  if (input.old_price && input.old_price > input.current_price) {
    const discount = (input.old_price - input.current_price) / input.old_price;
    score += Math.min(discount * 8, 3);
  }

  if (input.coupon) score += 1.1;
  if (input.rating) score += Math.min(input.rating / 5, 1.2);
  if (input.estimated_commission) score += Math.min(input.estimated_commission / 25, 1.2);

  const category = (input.category || "").toLowerCase();
  score += Object.entries(categoryBoosts).find(([key]) => category.includes(key))?.[1] ?? 0.2;

  if (input.current_price <= 50) score += 0.7;
  if (input.current_price > 50 && input.current_price <= 200) score += 0.4;
  if (input.seasonality) score += Math.min(input.seasonality, 2);

  return Number(Math.max(0, Math.min(10, score)).toFixed(2));
}
