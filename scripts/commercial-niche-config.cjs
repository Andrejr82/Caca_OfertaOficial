'use strict';

/**
 * Configuração Autoritativa dos 7 Nichos Comerciais do Caça Oferta Oficial.
 * Fornece parâmetros de catálogo (Core, Expansion, Opportunity), Guardrails,
 * Mapeamento de Cenários Legados e Regras de Afinidade por Marketplace.
 */

const COMMERCIAL_NICHES = Object.freeze({
  casa_cozinha_organizacao: Object.freeze({
    id: 'casa_cozinha_organizacao',
    name: 'Casa, Cozinha e Organização',
    role: 'volume_e_recorrencia',
    coreProducts: Object.freeze([
      'air fryer', 'cafeteira', 'liquidificador', 'aspirador vertical', 'panela elétrica',
      'jogo de panelas', 'jogo de cama', 'toalha de banho', 'aparelho de jantar',
      'organizador de cozinha',
    ]),
    expansionProducts: Object.freeze([
      'batedeira', 'mixer', 'sanduicheira', 'forno elétrico', 'chaleira elétrica', 'grill',
      'faqueiro', 'organizador de gaveta', 'organizador de armário', 'mop', 'varal',
      'caixa organizadora', 'cesto organizador',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 3, 'Mercado Livre': 3, Shopee: 3 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'air fryer', 'airfryer', 'fritadeira sem oleo', 'fritadeira eletrica',
        'cafeteira', 'maquina de cafe', 'liquidificador', 'mixer', 'batedeira',
        'panela eletrica', 'panela de pressao', 'jogo de panelas', 'conjunto de panelas',
        'aspirador vertical', 'aspirador po', 'mop', 'varal', 'faqueiro', 'aparelho de jantar',
        'jogo de cama', 'lencol', 'edredom', 'toalha de banho', 'jogo de toalhas',
        'organizador', 'caixa organizadora', 'cesto organizador', 'prateleira organizadora',
        'forno eletrico', 'chaleira eletrica', 'grill', 'sanduicheira',
      ]),
      blockedProductTerms: Object.freeze([
        'resistencia para forno', 'resistencia reposicao', 'resistencia compativel',
        'peca de resistencia', 'kit resistencia', 'elemento aquecedor avulso',
        'borracha de panela', 'filtro industrial', 'motor de reposicao', 'lampada avulsa',
        'valvula avulsa', 'cabo avulso', 'reparo', 'conserto',
        'forma para air fryer', 'papel descartavel para air fryer', 'cesto de silicone',
        'cesto para air fryer', 'cesto reposicao air fryer', 'cesto avulso air fryer',
        'assadeira air fryer', 'forro air fryer', 'tapete air fryer',
        'formas descartavel', 'forma descartavel',
      ]),
    }),
  }),

  beleza: Object.freeze({
    id: 'beleza',
    name: 'Beleza e Cuidados Pessoais',
    role: 'conversao_e_recorrencia',
    coreProducts: Object.freeze([
      'protetor solar', 'hidratante facial', 'sérum', 'shampoo', 'tratamento capilar',
      'perfume', 'maquiagem', 'escova secadora', 'secador',
    ]),
    expansionProducts: Object.freeze([
      'chapinha', 'modelador', 'aparador', 'máquina de cortar cabelo', 'escova alisadora', 'depilador',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 3, 'Mercado Livre': 2, Shopee: 3 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'protetor solar', 'protetor solar facial', 'hidratante facial', 'serum', 'serum facial',
        'shampoo', 'condicionador', 'mascara capilar', 'tratamento capilar', 'oleo capilar',
        'perfume', 'eau de parfum', 'maquiagem', 'base facial', 'batom', 'rimel',
        'escova secadora', 'secador', 'secador de cabelo', 'chapinha', 'prancha', 'prancha alisadora',
        'prancha de cabelo', 'prancha profissional', 'modelador', 'modelador de cachos',
        'aparador', 'aparador de pelos', 'maquina de cortar cabelo', 'escova alisadora', 'depilador',
      ]),
      blockedProductTerms: Object.freeze([
        'amostra gratis', 'tester', 'frasco vazio', 'embalagem vazia', 'lamina avulsa',
        'pente avulso de maquina', 'carregador avulso', 'manual', 'tampa avulsa',
      ]),
    }),
  }),

  moda: Object.freeze({
    id: 'moda',
    name: 'Moda e Calçados',
    role: 'grande_volume',
    coreProducts: Object.freeze([
      'tênis masculino', 'tênis feminino', 'tênis casual', 'camiseta masculina', 'vestido',
      'calça jeans', 'jaqueta', 'bolsa', 'mochila',
    ]),
    expansionProducts: Object.freeze([
      'camisa', 'bermuda', 'moletom', 'calça social', 'relógio', 'óculos',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 2, 'Mercado Livre': 2, Shopee: 3 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'tenis masculino', 'tenis feminino', 'tenis casual', 'tenis corrida',
        'camiseta masculina', 'camiseta feminina', 'vestido', 'calca jeans',
        'jaqueta', 'bolsa', 'bolsa feminina', 'bolsa transversal', 'mochila', 'mochila escolar',
        'camisa', 'bermuda', 'moletom', 'calca social', 'relogio', 'oculos', 'oculos de sol',
      ]),
      blockedProductTerms: Object.freeze([
        'palmilha avulsa', 'cadarco avulso', 'botao avulso', 'etiqueta avulsa',
        'cabide avulso', 'ziper avulso', 'tecido por metro', 'retalho',
      ]),
    }),
  }),

  eletrodomesticos: Object.freeze({
    id: 'eletrodomesticos',
    name: 'Eletrodomésticos',
    role: 'ticket_alto',
    coreProducts: Object.freeze([
      'geladeira', 'máquina de lavar', 'ar condicionado', 'micro-ondas', 'fogão', 'cooktop',
      'lava e seca', 'aspirador',
    ]),
    expansionProducts: Object.freeze([
      'freezer', 'lava-louças', 'frigobar', 'adega climatizada', 'coifa', 'depurador',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 3, 'Mercado Livre': 3, Shopee: 2 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'geladeira', 'refrigerador', 'maquina de lavar', 'lavadora de roupas',
        'ar condicionado', 'ar-condicionado', 'split', 'micro-ondas', 'microondas',
        'fogao', 'fogao a gas', 'cooktop', 'cooktop por inducao', 'lava e seca',
        'aspirador', 'aspirador de po', 'freezer', 'lava loucas', 'lava-loucas',
        'frigobar', 'adega climatizada', 'coifa', 'depurador',
      ]),
      blockedProductTerms: Object.freeze([
        'placa eletrica', 'motor de geladeira', 'compressor geladeira', 'compressor de geladeira', 'compressor para geladeira',
        'gas refrigerante', 'termostato avulso',
        'borracha de geladeira', 'grade de fogao', 'pes de lavadora', 'filtro de coifa',
        'suporte de ar condicionado', 'tubulacao', 'valvula avulsa',
        'papel de parede para geladeira', 'papel adesivo para geladeira', 'adesivo para geladeira',
        'porta frios', 'forro para geladeira', 'forro de geladeira', 'organizador para geladeira',
        'suporte para geladeira', 'base para geladeira',
        'detergente para lava loucas', 'detergente lava loucas', 'sabao para lava loucas',
        'pastilha para lava loucas', 'pastilhas lava loucas', 'secante para lava loucas',
        'abrilhantador para lava loucas', 'suporte para lava loucas',
        'helice lava loucas', 'espargidor lava loucas',
      ]),
    }),
  }),

  informatica: Object.freeze({
    id: 'informatica',
    name: 'Informática',
    role: 'ticket_medio_alto',
    coreProducts: Object.freeze([
      'notebook', 'monitor', 'ssd', 'impressora', 'roteador', 'mini pc',
    ]),
    expansionProducts: Object.freeze([
      'computador', 'desktop', 'teclado', 'mouse', 'webcam', 'hd externo', 'scanner',
      'nobreak', 'switch de rede',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 3, 'Mercado Livre': 3, Shopee: 2 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'notebook', 'laptop', 'monitor', 'monitor gamer', 'ssd', 'ssd nvme',
        'impressora', 'multifuncional', 'roteador', 'roteador mesh', 'mini pc',
        'computador', 'desktop', 'teclado', 'teclado mecanico', 'mouse', 'mouse sem fio',
        'webcam', 'hd externo', 'scanner', 'nobreak', 'switch de rede',
      ]),
      blockedProductTerms: Object.freeze([
        'parafuso', 'cabo sata avulso', 'pasta termica avulsa', 'tecla avulsa',
        'cooler avulso 80mm', 'adesivo para teclado', 'case vazia', 'gaveta de hd',
        'suporte para notebook', 'suporte articulado para notebook', 'base para notebook',
        'mochila notebook', 'mochila para notebook', 'cooler para notebook',
        'carregador para notebook', 'fonte para notebook',
        'suporte articulado para monitor', 'braco para monitor', 'suporte para monitor',
        'suporte a gas para monitor',
        'tripe para webcam', 'suporte para webcam', 'ring light avulso',
        'protetor webcam', 'protetor camera webcam', 'tampa webcam', 'tampa camera webcam',
        'kit protetor camera', 'kit protetor webcam',
      ]),
    }),
  }),

  ferramentas: Object.freeze({
    id: 'ferramentas',
    name: 'Ferramentas',
    role: 'demanda_consistente',
    coreProducts: Object.freeze([
      'parafusadeira', 'furadeira', 'lavadora de alta pressão', 'esmerilhadeira', 'serra',
      'máquina de solda', 'jogo de ferramentas', 'kit de chaves',
    ]),
    expansionProducts: Object.freeze([
      'alicate', 'chave de impacto', 'trena', 'nível laser', 'compressor',
      'maleta de ferramentas', 'lixadeira', 'soprador',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 3, 'Mercado Livre': 3, Shopee: 3 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'parafusadeira', 'parafusadeira a bateria', 'furadeira', 'furadeira de impacto',
        'lavadora de alta pressao', 'esmerilhadeira', 'esmerilhadeira angular',
        'serra', 'serra circular', 'serra tico tico', 'maquina de solda',
        'jogo de ferramentas', 'kit de ferramentas', 'kit de chaves', 'jogo de chaves',
        'alicate', 'chave de impacto', 'trena', 'trena a laser', 'nivel laser',
        'compressor', 'compressor de ar', 'maleta de ferramentas', 'lixadeira', 'soprador',
      ]),
      blockedProductTerms: Object.freeze([
        'broca avulsa', 'jogo de brocas', 'kit de brocas', 'kit brocas', 'brocas para furadeira',
        'disco de corte avulso', 'mandril avulso', 'parafuso avulso', 'porca avulsa',
        'arruela', 'escova de carvao', 'bateria avulsa sem maquina',
      ]),
    }),
  }),

  pet: Object.freeze({
    id: 'pet',
    name: 'Pet',
    role: 'forte_recorrencia',
    coreProducts: Object.freeze([
      'ração cachorro', 'ração gato', 'areia para gato', 'tapete higiênico',
    ]),
    expansionProducts: Object.freeze([
      'cama pet', 'fonte pet', 'bebedouro automático', 'comedouro automático',
      'caixa de transporte', 'arranhador', 'caixa de areia', 'brinquedo pet',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({ Amazon: 3, 'Mercado Livre': 3, Shopee: 3 }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'racao cachorro', 'racao para cachorro', 'racao caes', 'racao para caes', 'racao de caes',
        'racao gato', 'racao para gato', 'areia para gato', 'areia sanitaria gato', 'areia sanitaria para gato',
        'granulado sanitario', 'tapete higienico', 'tapete higienico cachorro',
        'cama pet', 'caminha pet', 'fonte pet', 'fonte de agua pet',
        'bebedouro automatico', 'comedouro automatico', 'caixa de transporte',
        'arranhador', 'arranhador gato', 'caixa de areia', 'brinquedo pet',
      ]),
      blockedProductTerms: Object.freeze([
        'refil avulso sem fonte', 'sache unitario', 'pecas plasticas', 'tampa avulsa',
        'pa para areia', 'pa coletora', 'pa de areia', 'tapete coletor de areia',
        'saco para bandeja',
      ]),
    }),
  }),
});

const COMMERCIAL_NICHE_IDS = Object.freeze(Object.keys(COMMERCIAL_NICHES));

const LEGACY_SCENARIO_TO_NICHE_MAP = Object.freeze({
  casa_cozinha_editorial: 'casa_cozinha_organizacao',
  organizacao_editorial: 'casa_cozinha_organizacao',
  beleza_editorial: 'beleza',
  moda_editorial: 'moda',
  eletrodomesticos_editorial: 'eletrodomesticos',
  informatica_editorial: 'informatica',
  ferramentas_editorial: 'ferramentas',
  pet_editorial: 'pet',
});

const LEGACY_SCENARIOS_OUTSIDE_NICHES = Object.freeze([
  'celulares_editorial',
  'esporte_editorial',
  'tv_audio_editorial',
  'moveis_editorial',
  'grandes_ofertas_editorial',
  'cupons_aprovados_editorial',
]);

const AFFINITY_RULES = Object.freeze({
  3: Object.freeze({ corePercent: 1.0, expansionPercent: 1.0, maxPagesPerTerm: 2, candidateLimit: 10 }),
  2: Object.freeze({ corePercent: 1.0, expansionPercent: 0.5, maxPagesPerTerm: 1, candidateLimit: 7 }),
  1: Object.freeze({ corePercent: 1.0, expansionPercent: 0.0, maxPagesPerTerm: 1, candidateLimit: 4 }),
});

function getCommercialNiche(nicheId) {
  if (!nicheId) return null;
  return COMMERCIAL_NICHES[String(nicheId).trim()] || null;
}

function resolveNicheFromLegacyScenario(legacyScenarioId) {
  const id = String(legacyScenarioId || '').trim();
  if (!id) return { mode: 'invalid', nicheId: null, reason: 'missing_scenario_id' };

  if (LEGACY_SCENARIO_TO_NICHE_MAP[id]) {
    const nicheId = LEGACY_SCENARIO_TO_NICHE_MAP[id];
    return { mode: 'niche_mapped', legacyScenarioId: id, nicheId, niche: COMMERCIAL_NICHES[nicheId] };
  }

  if (LEGACY_SCENARIOS_OUTSIDE_NICHES.includes(id)) {
    return { mode: 'legacy_only', legacyScenarioId: id, nicheId: null, reason: 'legacy_scenario_outside_final_7_niches' };
  }

  return { mode: 'unknown', legacyScenarioId: id, nicheId: null, reason: 'unmapped_scenario' };
}

function getAffinityRules(affinityLevel = 2) {
  const level = Number(affinityLevel);
  return AFFINITY_RULES[level] || AFFINITY_RULES[2];
}

module.exports = {
  COMMERCIAL_NICHES,
  COMMERCIAL_NICHE_IDS,
  LEGACY_SCENARIO_TO_NICHE_MAP,
  LEGACY_SCENARIOS_OUTSIDE_NICHES,
  AFFINITY_RULES,
  getCommercialNiche,
  resolveNicheFromLegacyScenario,
  getAffinityRules,
};
