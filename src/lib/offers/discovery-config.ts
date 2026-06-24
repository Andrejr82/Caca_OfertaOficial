/**
 * discovery-config.ts
 * Configuração central de targets de descoberta viral por marketplace.
 *
 * Substitui a roleta aleatória de categorias genéricas por busca inteligente
 * baseada em viralScore — produtos que normalmente aparecem no Pelando, Promobit
 * e Pechinchou.
 *
 * FLUXO: getNextViralTarget(source) → ViralSearchTarget → usado em scraper.ts
 */

export interface ViralSearchTarget {
  query: string;       // Termo de busca para o marketplace
  category: string;    // Categoria normalizada do sistema (category-taxonomy)
  viralScore: number;  // Potencial viral (1–10). Usado para ordenar prioridade.
  source: string;      // Marketplace alvo (redundante mas útil para logs)
}

/**
 * Mapa de targets virais por marketplace.
 * Ordenados internamente por viralScore desc dentro de cada grupo semântico.
 * getNextViralTarget() garante rotação e prioriza os de maior viralScore.
 */
export const VIRAL_SEARCH_TARGETS: Record<string, ViralSearchTarget[]> = {

  // ─── Mercado Livre ─────────────────────────────────────────────────────────
  "Mercado Livre": [
    // Tier S — Smartphones
    { query: "iphone",              category: "Telefonia",                viralScore: 10, source: "Mercado Livre" },
    { query: "samsung galaxy a",    category: "Telefonia",                viralScore: 9,  source: "Mercado Livre" },
    { query: "moto g",              category: "Telefonia",                viralScore: 8,  source: "Mercado Livre" },
    { query: "xiaomi redmi",        category: "Telefonia",                viralScore: 8,  source: "Mercado Livre" },
    // Tier S — Amazon devices / Eletrônicos premium
    { query: "kindle",              category: "Eletrônicos",              viralScore: 9,  source: "Mercado Livre" },
    { query: "echo dot",            category: "Eletrônicos",              viralScore: 9,  source: "Mercado Livre" },
    { query: "fone jbl bluetooth",  category: "Eletrônicos",              viralScore: 9,  source: "Mercado Livre" },
    { query: "smartwatch",          category: "Eletrônicos",              viralScore: 8,  source: "Mercado Livre" },
    { query: "fone sony bluetooth", category: "Eletrônicos",              viralScore: 8,  source: "Mercado Livre" },
    // Tier S — Informática
    { query: "ssd 1tb",             category: "Informática",              viralScore: 9,  source: "Mercado Livre" },
    { query: "notebook gamer",      category: "Informática",              viralScore: 8,  source: "Mercado Livre" },
    { query: "headset gamer",       category: "Games",                    viralScore: 8,  source: "Mercado Livre" },
    // Tier S — Games
    { query: "ps5",                 category: "Games",                    viralScore: 10, source: "Mercado Livre" },
    { query: "controle xbox",       category: "Games",                    viralScore: 8,  source: "Mercado Livre" },
    // Tier A — Eletroportáteis
    { query: "air fryer",           category: "Eletroportáteis",          viralScore: 9,  source: "Mercado Livre" },
    { query: "aspirador robô",      category: "Eletroportáteis",          viralScore: 8,  source: "Mercado Livre" },
    // Tier A — TV
    { query: "smart tv 4k 55",      category: "Televisão",                viralScore: 8,  source: "Mercado Livre" },
    // Tier A — Beleza & Suplementos
    { query: "perfume importado",   category: "Moda, Beleza e Perfumaria", viralScore: 8, source: "Mercado Livre" },
    { query: "whey protein",        category: "Esporte e Lazer",          viralScore: 8,  source: "Mercado Livre" },
    { query: "creatina",            category: "Esporte e Lazer",          viralScore: 7,  source: "Mercado Livre" },
  ],

  // ─── Amazon ────────────────────────────────────────────────────────────────
  "Amazon": [
    { query: "kindle",              category: "Eletrônicos",              viralScore: 10, source: "Amazon" },
    { query: "echo dot",            category: "Eletrônicos",              viralScore: 10, source: "Amazon" },
    { query: "iphone",              category: "Telefonia",                viralScore: 10, source: "Amazon" },
    { query: "samsung galaxy",      category: "Telefonia",                viralScore: 9,  source: "Amazon" },
    { query: "ssd samsung",         category: "Informática",              viralScore: 9,  source: "Amazon" },
    { query: "airfryer philips",    category: "Eletroportáteis",          viralScore: 8,  source: "Amazon" },
    { query: "fone jbl",            category: "Eletrônicos",              viralScore: 8,  source: "Amazon" },
    { query: "smartwatch",          category: "Eletrônicos",              viralScore: 8,  source: "Amazon" },
    { query: "moto g",              category: "Telefonia",                viralScore: 8,  source: "Amazon" },
  ],

  // ─── Shopee ────────────────────────────────────────────────────────────────
  "Shopee": [
    { query: "air fryer",           category: "Eletroportáteis",          viralScore: 9,  source: "Shopee" },
    { query: "xiaomi",              category: "Telefonia",                viralScore: 8,  source: "Shopee" },
    { query: "fone bluetooth",      category: "Eletrônicos",              viralScore: 8,  source: "Shopee" },
    { query: "smartwatch",          category: "Eletrônicos",              viralScore: 8,  source: "Shopee" },
    { query: "perfume importado",   category: "Moda, Beleza e Perfumaria", viralScore: 8, source: "Shopee" },
    { query: "creatina",            category: "Esporte e Lazer",          viralScore: 8,  source: "Shopee" },
    { query: "whey protein",        category: "Esporte e Lazer",          viralScore: 8,  source: "Shopee" },
    { query: "creme hidratante",    category: "Moda, Beleza e Perfumaria", viralScore: 7, source: "Shopee" },
    { query: "moto g",              category: "Telefonia",                viralScore: 7,  source: "Shopee" },
  ],

  // ─── Shein ─────────────────────────────────────────────────────────────────
  "Shein": [
    { query: "vestido",             category: "Moda, Beleza e Perfumaria", viralScore: 7, source: "Shein" },
    { query: "conjunto feminino",   category: "Moda, Beleza e Perfumaria", viralScore: 7, source: "Shein" },
    { query: "bolsa",               category: "Moda, Beleza e Perfumaria", viralScore: 7, source: "Shein" },
    { query: "tênis casual",        category: "Moda, Beleza e Perfumaria", viralScore: 7, source: "Shein" },
    { query: "camiseta",            category: "Moda, Beleza e Perfumaria", viralScore: 6, source: "Shein" },
    { query: "calça",               category: "Moda, Beleza e Perfumaria", viralScore: 6, source: "Shein" },
  ],

  // ─── Magalu ────────────────────────────────────────────────────────────────
  "Magalu": [
    { query: "iphone",              category: "Telefonia",                viralScore: 10, source: "Magalu" },
    { query: "samsung galaxy",      category: "Telefonia",                viralScore: 9,  source: "Magalu" },
    { query: "air fryer",           category: "Eletroportáteis",          viralScore: 9,  source: "Magalu" },
    { query: "smart tv 4k",         category: "Televisão",                viralScore: 8,  source: "Magalu" },
    { query: "notebook",            category: "Informática",              viralScore: 8,  source: "Magalu" },
    { query: "moto g",              category: "Telefonia",                viralScore: 8,  source: "Magalu" },
    { query: "geladeira",           category: "Eletrodomésticos",         viralScore: 7,  source: "Magalu" },
    { query: "kindle",              category: "Eletrônicos",              viralScore: 9,  source: "Magalu" },
  ],

  // ─── Netshoes ──────────────────────────────────────────────────────────────
  "Netshoes": [
    { query: "tênis nike",          category: "Esporte e Lazer",          viralScore: 9,  source: "Netshoes" },
    { query: "tênis adidas",        category: "Esporte e Lazer",          viralScore: 9,  source: "Netshoes" },
    { query: "whey protein",        category: "Esporte e Lazer",          viralScore: 8,  source: "Netshoes" },
    { query: "creatina",            category: "Esporte e Lazer",          viralScore: 8,  source: "Netshoes" },
    { query: "tênis new balance",   category: "Esporte e Lazer",          viralScore: 7,  source: "Netshoes" },
    { query: "camiseta seleção",    category: "Esporte e Lazer",          viralScore: 7,  source: "Netshoes" },
    { query: "chuteira nike",       category: "Esporte e Lazer",          viralScore: 7,  source: "Netshoes" },
  ],
};

// ─── Rastreamento de Rotação por Source ──────────────────────────────────────

/**
 * Rastreamento em memória dos targets já usados nesta instância.
 * Garante rotação e evita repetição consecutiva do mesmo query.
 * Reseta automaticamente quando todos os targets de um source são consumidos.
 */
const usedTargetsTracker = new Map<string, Set<string>>();

/**
 * Retorna o próximo target viral para um marketplace específico.
 *
 * Estratégia:
 *  1. Ordena targets do marketplace por viralScore desc
 *  2. Escolhe o primeiro que ainda não foi usado nesta sessão
 *  3. Quando todos foram usados, reseta e começa novamente
 *
 * Logs: [VIRAL_TARGET] para auditoria
 *
 * @param source - Nome do marketplace (ex: "Mercado Livre")
 * @returns ViralSearchTarget com query, category e viralScore
 */
export function getNextViralTarget(source: string): ViralSearchTarget {
  const targets = VIRAL_SEARCH_TARGETS[source];

  if (!targets || targets.length === 0) {
    console.log(`[VIRAL_TARGET] Source "${source}" sem targets configurados. Usando fallback genérico.`);
    return { query: "oferta", category: "Geral", viralScore: 5, source };
  }

  if (!usedTargetsTracker.has(source)) {
    usedTargetsTracker.set(source, new Set());
  }
  const used = usedTargetsTracker.get(source)!;

  // Reseta quando todos os targets foram usados
  if (used.size >= targets.length) {
    used.clear();
    console.log(`[VIRAL_TARGET] Rotação completa para "${source}". Reiniciando ciclo.`);
  }

  // Ordena por viralScore desc e escolhe o primeiro disponível
  const sorted = [...targets].sort((a, b) => b.viralScore - a.viralScore);
  const available = sorted.find(t => !used.has(t.query));

  if (!available) {
    used.clear();
    const fallback = sorted[0];
    console.log(`[VIRAL_TARGET] Fallback para "${source}": query="${fallback.query}" viralScore=${fallback.viralScore}`);
    return fallback;
  }

  used.add(available.query);
  console.log(
    `[VIRAL_TARGET] "${source}" → query="${available.query}" | category="${available.category}" | viralScore=${available.viralScore}`
  );
  return available;
}

/**
 * Retorna todos os targets de um marketplace ordenados por viralScore.
 * Útil para debug, auditoria e dashboards.
 */
export function getAllTargetsForSource(source: string): ViralSearchTarget[] {
  return (VIRAL_SEARCH_TARGETS[source] || []).sort((a, b) => b.viralScore - a.viralScore);
}
