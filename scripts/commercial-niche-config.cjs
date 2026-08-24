'use strict';

/**
 * Configuração Autoritativa dos 7 Nichos Comerciais do Caça Oferta Oficial.
 * Cada nicho possui Core Products, Expansion Products, Opportunity Products (dinâmicos),
 * Afinidade por Marketplace (1-3) e Guardrails estritos.
 */

const COMMERCIAL_NICHES = Object.freeze({
  casa_cozinha_organizacao: {
    id: 'casa_cozinha_organizacao',
    name: 'Casa, Cozinha e Organização',
    role: 'volume_e_recorrencia',
    coreProducts: Object.freeze([
      'air fryer',
      'cafeteira',
      'liquidificador',
      'aspirador vertical',
      'panela elétrica',
      'jogo de panelas',
      'jogo de cama',
      'toalha de banho',
      'aparelho de jantar',
      'organizador de cozinha',
    ]),
    expansionProducts: Object.freeze([
      'batedeira',
      'mixer',
      'sanduicheira',
      'forno elétrico',
      'chaleira elétrica',
      'grill',
      'faqueiro',
      'organizador de gaveta',
      'organizador de armário',
      'mop',
      'varal',
      'caixa organizadora',
      'cesto organizador',
    ]),
    opportunityProducts: Object.freeze([]), // Dinâmico via signals/trends
    marketplaceAffinity: Object.freeze({
      Amazon: 3,
      'Mercado Livre': 3,
      Shopee: 3,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'air fryer', 'airfryer', 'fritadeira sem oleo', 'fritadeira eletrica',
        'cafeteira', 'maquina de cafe', 'liquidificador', 'mixer', 'batedeira',
        'panela eletrica', 'panela de pressao', 'jogo de panelas', 'conjunto de panelas',
        'aspirador vertical', 'aspirador po', 'mop', 'varal', 'faqueiro', 'aparelho de jantar',
        'jogo de cama', 'lencol', 'edredom', 'toalha de banho', 'jogo de toalhas',
        'organizador', 'caixa organizadora', 'cesto organizador', 'prateleira organizadora',
        'forno eletrico', 'chaleira eletrica', 'grill', 'sanduicheira'
      ]),
      blockedProductTerms: Object.freeze([
        'peca', 'pecas', 'resistencia', 'borracha de panela', 'filtro industrial',
        'motor de reposicao', 'lampada avulsa', 'valvula avulsa', 'cabo avulso',
        'reparo', 'conserto', 'adesivo'
      ]),
    }),
  },

  beleza_cuidados_pessoais: {
    id: 'beleza_cuidados_pessoais',
    name: 'Beleza e Cuidados Pessoais',
    role: 'conversao_e_recorrencia',
    coreProducts: Object.freeze([
      'protetor solar facial',
      'hidratante facial',
      'sérum facial',
      'shampoo',
      'perfume',
      'maquiagem',
      'escova secadora',
      'secador de cabelo',
    ]),
    expansionProducts: Object.freeze([
      'chapinha',
      'modelador de cachos',
      'aparador de pelos',
      'máquina de cortar cabelo',
      'escova alisadora',
      'depilador elétrico',
      'máscara capilar',
      'óleo capilar',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({
      Amazon: 3,
      'Mercado Livre': 2,
      Shopee: 3,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'protetor solar', 'protetor solar facial', 'hidratante facial', 'serum facial', 'serum',
        'shampoo', 'condicionador', 'mascara capilar', 'oleo capilar', 'perfume', 'eau de parfum',
        'maquiagem', 'base facial', 'batom', 'rimel', 'escova secadora', 'secador de cabelo',
        'secador', 'chapinha', 'prancha de cabelo', 'modelador de cachos', 'aparador de pelos',
        'maquina de cortar cabelo', 'escova alisadora', 'depilador eletrico'
      ]),
      blockedProductTerms: Object.freeze([
        'amostra gratis', 'tester', 'frasco vazio', 'embalagem vazia', 'lamina avulsa',
        'pente avulso de maquina', 'carregador avulso', 'manual', 'tampa avulsa'
      ]),
    }),
  },

  moda_calcados: {
    id: 'moda_calcados',
    name: 'Moda e Calçados',
    role: 'grande_volume',
    coreProducts: Object.freeze([
      'tênis masculino',
      'tênis feminino',
      'tênis casual',
      'camiseta masculina',
      'vestido',
      'calça jeans',
      'jaqueta',
      'bolsa feminina',
      'mochila',
    ]),
    expansionProducts: Object.freeze([
      'camisa polo',
      'camisa social',
      'bermuda masculina',
      'moletom',
      'calça social',
      'relógio de pulso',
      'óculos de sol',
      'carteira de couro',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({
      Amazon: 2,
      'Mercado Livre': 2,
      Shopee: 3,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'tenis masculino', 'tenis feminino', 'tenis casual', 'tenis corrida', 'tenis',
        'camiseta masculina', 'camiseta', 'camisa polo', 'camisa social', 'vestido',
        'calca jeans', 'calca social', 'bermuda', 'jaqueta', 'moletom', 'bolsa feminina',
        'bolsa', 'mochila', 'relogio de pulso', 'relogio', 'oculos de sol', 'carteira'
      ]),
      blockedProductTerms: Object.freeze([
        'cadarco', 'cadarco avulso', 'palmilha avulsa', 'palmilha', 'botao', 'ziper',
        'retalho', 'tecido por metro', 'linha de costura', 'etiqueta', 'fivela avulsa'
      ]),
    }),
  },

  eletrodomesticos: {
    id: 'eletrodomesticos',
    name: 'Eletrodomésticos',
    role: 'ticket_alto',
    coreProducts: Object.freeze([
      'geladeira',
      'máquina de lavar',
      'ar-condicionado',
      'micro-ondas',
      'fogão',
      'cooktop',
      'lava e seca',
      'aspirador de pó',
    ]),
    expansionProducts: Object.freeze([
      'freezer vertical',
      'lava-louças',
      'frigobar',
      'adega climatizada',
      'coifa de parede',
      'depurador de ar',
      'forno de embutir',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({
      Amazon: 3,
      'Mercado Livre': 3,
      Shopee: 2,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'geladeira', 'refrigerador', 'maquina de lavar', 'lavadora de roupas', 'lava e seca',
        'ar-condicionado', 'ar condicionado split', 'micro-ondas', 'microondas', 'fogao',
        'fogao 4 bocas', 'fogao 5 bocas', 'cooktop', 'cooktop por inducao', 'aspirador de po',
        'freezer vertical', 'freezer', 'lava-loucas', 'lava loucas', 'frigobar', 'adega climatizada',
        'coifa de parede', 'coifa', 'depurador de ar', 'forno de embutir', 'forno eletrico embutir'
      ]),
      blockedProductTerms: Object.freeze([
        'placa', 'placa eletronica', 'placa potencia', 'placa interface', 'motor',
        'compressor', 'resistencia', 'mangueira', 'gas refrigerante', 'correia',
        'peca', 'pecas', 'pecas de reposicao', 'suporte avulso', 'tampa avulsa',
        'gaveta avulsa', 'prateleira de geladeira', 'pe de geladeira', 'termostato avulso'
      ]),
    }),
  },

  informatica: {
    id: 'informatica',
    name: 'Informática',
    role: 'ticket_medio_alto',
    coreProducts: Object.freeze([
      'notebook',
      'monitor',
      'ssd',
      'impressora',
      'roteador wi-fi',
      'mini pc',
    ]),
    expansionProducts: Object.freeze([
      'computador desktop',
      'teclado mecânico',
      'mouse sem fio',
      'webcam full hd',
      'hd externo',
      'nobreak',
      'switch de rede',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({
      Amazon: 3,
      'Mercado Livre': 3,
      Shopee: 2,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'notebook', 'computador', 'desktop', 'monitor', 'monitor gamer', 'ssd', 'ssd nvme',
        'impressora', 'impressora multifuncional', 'roteador', 'roteador wi-fi', 'mini pc',
        'teclado mecanico', 'teclado sem fio', 'mouse sem fio', 'mouse gamer', 'webcam',
        'hd externo', 'nobreak', 'switch de rede'
      ]),
      blockedProductTerms: Object.freeze([
        'memoria ram avulsa', 'placa-mae', 'placa mae', 'processador avulso', 'cooler avulso',
        'fonte atx avulsa', 'cabo sata', 'pasta termica', 'parafusos', 'gabinete vazio',
        'adaptador simples', 'extensao usb'
      ]),
    }),
  },

  ferramentas: {
    id: 'ferramentas',
    name: 'Ferramentas',
    role: 'demanda_consistente',
    coreProducts: Object.freeze([
      'furadeira',
      'parafusadeira',
      'kit de ferramentas',
      'esmerilhadeira',
      'trena a laser',
      'serra circular',
    ]),
    expansionProducts: Object.freeze([
      'martelete perfurador',
      'serra tico-tico',
      'chave de impacto',
      'lixadeira orbital',
      'jogo de soquetes',
      'maleta de ferramentas',
      'lavadora de alta pressão',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({
      Amazon: 3,
      'Mercado Livre': 3,
      Shopee: 3,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'furadeira', 'parafusadeira', 'furadeira de impacto', 'parafusadeira impacto',
        'kit ferramentas', 'jogo de ferramentas', 'maleta de ferramentas', 'esmerilhadeira',
        'trena a laser', 'trena', 'serra circular', 'martelete', 'serra tico-tico',
        'chave de impacto', 'lixadeira', 'jogo de soquetes', 'lavadora de alta pressao'
      ]),
      blockedProductTerms: Object.freeze([
        'broca avulsa', 'jogo de brocas sem furadeira', 'parafuso', 'bucha', 'carvao reposicao',
        'mandril avulso', 'lamina solta', 'disco avulso', 'carvao de motor'
      ]),
    }),
  },

  pet: {
    id: 'pet',
    name: 'Pet',
    role: 'forte_recorrencia',
    coreProducts: Object.freeze([
      'ração para cachorro',
      'ração para gato',
      'areia para gato',
      'tapete higiênico cachorro',
    ]),
    expansionProducts: Object.freeze([
      'cama pet',
      'fonte de água pet',
      'comedouro automático',
      'caixa de transporte pet',
      'arranhador para gato',
      'casinha pet',
      'coleira peitoral',
    ]),
    opportunityProducts: Object.freeze([]),
    marketplaceAffinity: Object.freeze({
      Amazon: 3,
      'Mercado Livre': 3,
      Shopee: 3,
    }),
    guardrails: Object.freeze({
      allowedProductTerms: Object.freeze([
        'racao para cachorro', 'racao cachorro', 'racao para gato', 'racao gato',
        'areia para gato', 'areia sanitaria gato', 'tapete higienico', 'tapete higienico cachorro',
        'cama pet', 'caminha pet', 'fonte de agua pet', 'bebedouro pet', 'comedouro automatico',
        'caixa de transporte pet', 'arranhador gato', 'casinha pet', 'coleira peitoral', 'guia peitoral'
      ]),
      blockedProductTerms: Object.freeze([
        'refil avulso sem fonte', 'sache unitario', 'pecas plasticas', 'tampa avulsa'
      ]),
    }),
  },
});

const COMMERCIAL_NICHE_IDS = Object.freeze(Object.keys(COMMERCIAL_NICHES));

const LEGACY_SCENARIO_TO_NICHE_MAP = Object.freeze({
  casa_cozinha_editorial: 'casa_cozinha_organizacao',
  organizacao_editorial: 'casa_cozinha_organizacao',
  beleza_editorial: 'beleza_cuidados_pessoais',
  moda_editorial: 'moda_calcados',
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
  3: Object.freeze({
    corePercent: 1.0,
    expansionPercent: 1.0,
    maxPagesPerTerm: 2,
    candidateLimit: 10,
  }),
  2: Object.freeze({
    corePercent: 1.0,
    expansionPercent: 0.5,
    maxPagesPerTerm: 1,
    candidateLimit: 7,
  }),
  1: Object.freeze({
    corePercent: 1.0,
    expansionPercent: 0.0,
    maxPagesPerTerm: 1,
    candidateLimit: 4,
  }),
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
    return {
      mode: 'shadow_compatible',
      legacyScenarioId: id,
      nicheId,
      niche: COMMERCIAL_NICHES[nicheId],
    };
  }

  if (LEGACY_SCENARIOS_OUTSIDE_NICHES.includes(id)) {
    return {
      mode: 'legacy_only',
      legacyScenarioId: id,
      nicheId: null,
      reason: 'legacy_scenario_outside_final_7_niches',
    };
  }

  return {
    mode: 'unknown',
    legacyScenarioId: id,
    nicheId: null,
    reason: 'unmapped_scenario',
  };
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
