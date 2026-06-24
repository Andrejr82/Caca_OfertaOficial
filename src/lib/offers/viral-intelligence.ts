/**
 * viral-intelligence.ts
 * Módulo central de inteligência comercial do Caça Oferta Oficial.
 *
 * Responsabilidades:
 *  - Whitelist de marcas virais por segmento (brand_score real)
 *  - Penalidades graduais por palavras de baixo apelo viral (NÃO blocklist absoluta)
 *  - Desconto mínimo recomendado por categoria
 *  - calculateBrandScore()      → 0-10
 *  - isProductViralEligible()   → penalty multiplicador 0.35-1.0
 *
 * IMPORTANTE: Nenhuma função deste módulo descarta uma oferta diretamente.
 * Todas as funções retornam multiplicadores de penalidade, nunca valores booleanos de rejeição.
 */

// ─── Whitelist de Marcas Virais por Segmento ──────────────────────────────────

export const VIRAL_BRANDS: Record<string, string[]> = {
  smartphones: [
    "apple", "iphone", "samsung galaxy", "motorola moto",
    "xiaomi", "redmi", "poco", "realme", "asus zenfone",
    "oneplus", "nothing phone",
  ],
  audio: [
    "jbl", "sony wh", "sony wf", "beats", "bose", "sennheiser",
    "airpods", "galaxy buds", "anker soundcore", "skullcandy", "marshall",
  ],
  informatica: [
    "samsung ssd", "kingston", "western digital", "wd blue", "wd black",
    "seagate", "corsair", "logitech", "razer", "hyperx", "redragon",
    "crucial", "sandisk", "adata",
  ],
  games: [
    "playstation", "ps5", "ps4", "xbox", "nintendo switch",
    "razer", "hyperx", "dualshock", "dualsense", "redragon",
  ],
  tenis: [
    "nike", "adidas", "new balance", "puma", "asics",
    "reebok", "vans", "converse", "fila", "under armour",
  ],
  perfumes: [
    "carolina herrera", "armani", "dior", "lancôme", "azzaro",
    "calvin klein", "versace", "burberry", "natura ekos", "o boticário",
    "avon", "boticário",
  ],
  suplementos: [
    "optimum nutrition", "integral medica", "growth supplements",
    "max titanium", "black skull", "nutrifor", "body action", "probiótica",
    "gold standard",
  ],
  eletroportateis: [
    "philips walita", "mondial", "britânia", "oster", "arno",
    "tramontina", "philco", "xiaomi mi",
  ],
  tv: [
    "samsung qled", "samsung neo", "lg oled", "sony bravia",
    "philips ambilight", "tcl", "hisense", "aoc",
  ],
  amazon_devices: [
    "kindle", "echo dot", "echo pop", "echo show",
    "fire tv", "amazon basics", "ring",
  ],
  smartwatch: [
    "apple watch", "samsung galaxy watch", "amazfit", "garmin",
    "xiaomi mi band", "huawei band", "fitbit",
  ],
};

// Lista plana única para lookup rápido
const ALL_VIRAL_BRANDS_FLAT: string[] = [
  ...new Set(Object.values(VIRAL_BRANDS).flat()),
];

// Tier S — Marcas de altíssimo engajamento viral (score: 10)
const TIER_S_BRANDS: string[] = [
  "apple", "iphone", "samsung galaxy", "nike", "adidas", "kindle",
  "echo dot", "echo pop", "echo show", "fire tv", "ps5", "playstation 5",
  "xbox series", "nintendo switch", "airpods", "jbl", "sony",
  "optimum nutrition", "gold standard",
];

// Tier A — Marcas de bom engajamento (score: 7)
const TIER_A_BRANDS: string[] = [
  "motorola moto", "xiaomi", "redmi", "poco", "realme", "asus zenfone",
  "samsung ssd", "kingston", "logitech", "razer", "hyperx", "redragon",
  "philips", "oster", "tramontina", "arno", "mondial", "britânia",
  "new balance", "puma", "asics", "reebok", "vans", "converse", "fila",
  "calvin klein", "versace", "azzaro", "natura", "o boticário", "avon",
  "amazfit", "garmin", "huawei", "xiaomi mi band",
  "tcl", "lg", "hisense", "aoc", "philco",
  "integral medica", "growth supplements", "max titanium", "black skull",
  "samsung neo", "samsung qled",
  "oneplus", "nothing phone", "marshall", "beats", "bose",
];

// ─── Penalidades por Palavras de Baixo Apelo (graduais, nunca absolutas) ──────

export interface LowAppealEntry {
  keyword: string;
  penalty: number;   // Multiplicador 0.0–1.0 aplicado ao score final
  reason: string;
}

/**
 * Palavras que indicam baixo apelo viral.
 * REGRA: Penalidades são ACUMULATIVAS mas o mínimo garantido é 0.35.
 * Nenhuma palavra sozinha pode descartar uma oferta — apenas reduzir seu score.
 */
export const LOW_APPEAL_KEYWORDS: LowAppealEntry[] = [
  // ── Telefonia fixa/residencial (penalidade alta) ──
  { keyword: "telefone fixo",          penalty: 0.40, reason: "Telefonia residencial/fixa" },
  { keyword: "telefone sem fio",        penalty: 0.45, reason: "Telefonia sem fio residencial" },
  { keyword: "telefone com fio",        penalty: 0.40, reason: "Telefonia com fio residencial" },
  { keyword: "telefone residencial",    penalty: 0.40, reason: "Telefonia residencial" },
  { keyword: "ramal",                   penalty: 0.50, reason: "Equipamento corporativo PABX" },
  { keyword: "interfone",               penalty: 0.45, reason: "Portaria/condomínio" },
  { keyword: "porteiro eletrônico",     penalty: 0.45, reason: "Portaria/condomínio" },
  { keyword: "central pabx",            penalty: 0.60, reason: "B2B/corporativo" },
  { keyword: "headset corporativo",     penalty: 0.50, reason: "B2B/corporativo" },
  { keyword: "telefone ip",             penalty: 0.55, reason: "B2B/VoIP" },
  { keyword: "voip",                    penalty: 0.55, reason: "B2B/VoIP" },
  // ── Celulares de baixo apelo (flip/idoso) ──
  { keyword: "celular flip",            penalty: 0.50, reason: "Flip — baixo apelo viral" },
  { keyword: "celular para idoso",      penalty: 0.45, reason: "Nicho restrito" },
  { keyword: "positivo flip",           penalty: 0.55, reason: "Flip — baixo apelo viral" },
  { keyword: "positivo twist",          penalty: 0.50, reason: "Flip — baixo apelo viral" },
  // ── Industrial/Construção (penalidade alta) ──
  { keyword: "furadeira industrial",    penalty: 0.40, reason: "Industrial/B2B" },
  { keyword: "compressor industrial",   penalty: 0.45, reason: "Industrial/B2B" },
  { keyword: "argamassa",               penalty: 0.60, reason: "Construção/B2B" },
  { keyword: "massa corrida",           penalty: 0.55, reason: "Construção" },
  { keyword: "cano pvc",                penalty: 0.55, reason: "Hidráulica/B2B" },
  { keyword: "tinta parede",            penalty: 0.50, reason: "Construção" },
  { keyword: "kit hidráulico",          penalty: 0.55, reason: "Hidráulica/B2B" },
  // ── Outros nichos de baixo engajamento ──
  { keyword: "detector de metais",      penalty: 0.45, reason: "Nicho restrito" },
  { keyword: "caixa d'água",            penalty: 0.55, reason: "Baixo apelo viral" },
  { keyword: "bomba d'água",            penalty: 0.55, reason: "Baixo apelo viral" },
];

// ─── Desconto Mínimo Recomendado por Categoria ────────────────────────────────

/**
 * Percentual mínimo de desconto para que uma oferta seja considerada relevante.
 * Usado como filtro suave: produtos abaixo do mínimo recebem penalidade de score,
 * mas NÃO são descartados automaticamente se não houver old_price disponível.
 */
export const MINIMUM_DISCOUNT_BY_CATEGORY: Record<string, number> = {
  "telefonia":            0.10, // 10% — smartphones têm preço real verificável
  "informatica":          0.15, // 15%
  "informática":          0.15,
  "eletrônicos":          0.15,
  "eletronicos":          0.15,
  "games":                0.10, // 10% — games têm preços tabelados
  "eletroportateis":      0.20, // 20% — inflação de preço de referência é comum
  "eletroportáteis":      0.20,
  "televisao":            0.15,
  "televisão":            0.15,
  "eletrodomesticos":     0.20,
  "eletrodomésticos":     0.20,
  "moda":                 0.25, // 25% — Shein: inflação de referência é padrão
  "beleza":               0.20,
  "esporte":              0.20,
  "petshop":              0.15,
  "saude":                0.15,
  "saúde":                0.15,
  "default":              0.10, // mínimo global
};

// ─── calculateBrandScore ──────────────────────────────────────────────────────

/**
 * Calcula o brand score de um produto com base no nome.
 *
 * Escala 0–10:
 *   10 → Tier S: Apple, Samsung Galaxy, Nike, PS5, Kindle, etc.
 *    7 → Tier A: Motorola, Xiaomi, Philips, JBL, New Balance, etc.
 *    5 → Qualquer marca viral no catálogo (Tier B)
 *    2 → Marca genérica/desconhecida
 *
 * Logs: [BRAND_SCORE] para auditoria
 */
export function calculateBrandScore(productName: string | null | undefined): number {
  if (!productName) {
    console.log(`[BRAND_SCORE] Nome vazio → score: 2`);
    return 2;
  }
  const name = productName.toLowerCase();

  // Tier S — score 10
  if (TIER_S_BRANDS.some(b => name.includes(b))) {
    const matched = TIER_S_BRANDS.find(b => name.includes(b));
    console.log(`[BRAND_SCORE] Tier S "${matched}" detectado → score: 10`);
    return 10;
  }

  // Tier A — score 7
  if (TIER_A_BRANDS.some(b => name.includes(b))) {
    const matched = TIER_A_BRANDS.find(b => name.includes(b));
    console.log(`[BRAND_SCORE] Tier A "${matched}" detectado → score: 7`);
    return 7;
  }

  // Tier B — qualquer marca no catálogo viral — score 5
  if (ALL_VIRAL_BRANDS_FLAT.some(b => name.includes(b))) {
    const matched = ALL_VIRAL_BRANDS_FLAT.find(b => name.includes(b));
    console.log(`[BRAND_SCORE] Tier B "${matched}" detectado → score: 5`);
    return 5;
  }

  // Fallback — marca desconhecida
  console.log(`[BRAND_SCORE] Marca não reconhecida em "${productName.substring(0, 50)}" → score: 2`);
  return 2;
}

// ─── isProductViralEligible ───────────────────────────────────────────────────

export interface ViralEligibilityResult {
  eligible: boolean;  // true se penalty > 0.60 (penalidade < 40%)
  penalty: number;    // multiplicador final 0.35–1.0
  reasons: string[];  // log de razões para auditoria
}

/**
 * Avalia se um produto tem características que inibem a viralização.
 *
 * REGRAS:
 *  - Retorna um multiplicador de penalidade NUNCA abaixo de 0.35
 *  - Penalidades são acumulativas (ex: dois keywords penalizam em conjunto)
 *  - Um produto nunca é descartado apenas por este filtro — o score final decide
 *
 * Logs: [VIRAL_SCORE] para auditoria
 */
export function isProductViralEligible(
  productName: string | null | undefined,
  _category: string | null | undefined
): ViralEligibilityResult {
  if (!productName) {
    return { eligible: true, penalty: 1.0, reasons: [] };
  }

  const name = productName.toLowerCase();
  const reasons: string[] = [];
  let cumulativePenalty = 1.0;

  for (const entry of LOW_APPEAL_KEYWORDS) {
    if (name.includes(entry.keyword)) {
      cumulativePenalty *= entry.penalty;
      reasons.push(`"${entry.keyword}" → ${entry.reason} (×${entry.penalty})`);
    }
  }

  // Garante penalidade mínima de 0.35 (nunca zera o score)
  const finalPenalty = Math.max(0.35, cumulativePenalty);
  const eligible = finalPenalty > 0.60;

  if (reasons.length > 0) {
    console.log(
      `[VIRAL_SCORE] "${productName.substring(0, 60)}" | penalty: ${finalPenalty.toFixed(3)} | eligible: ${eligible} | razões: ${reasons.join("; ")}`
    );
  }

  return {
    eligible,
    penalty: Number(finalPenalty.toFixed(3)),
    reasons,
  };
}
