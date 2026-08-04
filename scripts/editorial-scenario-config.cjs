'use strict';

const MARKETPLACES = Object.freeze(['Shopee', 'Mercado Livre', 'Amazon']);

const COMMON_BLOCKED = Object.freeze([
  'adulto', 'infantil', 'usado', 'recondicionado', 'peça avulsa', 'peca avulsa',
  'réplica', 'replica', 'download', 'ebook', 'serviço', 'servico',
]);

function scenario(id, name, queueHour, keywords, allowedProductTerms, blockedProductTerms, attributes, options = {}) {
  return {
    id,
    name,
    queueHour,
    marketplaces: [...MARKETPLACES],
    keywords: [...new Set(keywords)],
    allowedProductTerms: [...new Set(allowedProductTerms)],
    blockedProductTerms: [...new Set([...COMMON_BLOCKED, ...blockedProductTerms])],
    attributes: [...new Set(attributes)],
    maxAgeHours: options.maxAgeHours ?? 4,
    priority: options.priority || 'medium',
    discoveryMode: options.discoveryMode || 'api_search',
    keywordSelection: 'all',
    maxPagesPerKeyword: 1,
    apiCategories: options.apiCategories || [],
    amazonBrowseNodes: options.amazonBrowseNodes || [],
    aliases: options.aliases || [],
  };
}

const EDITORIAL_SCENARIOS = Object.freeze({
  casa_cozinha_editorial: scenario('casa_cozinha_editorial', 'Casa e Cozinha', 7,
    ['jogo de cama', 'toalha de banho', 'aparelho de jantar', 'faqueiro', 'cafeteira', 'air fryer', 'liquidificador', 'batedeira', 'sanduicheira', 'panela elétrica'],
    ['cama', 'lençol', 'toalha', 'faqueiro', 'jantar', 'cafeteira', 'air fryer', 'liquidificador', 'batedeira', 'sanduicheira', 'panela elétrica'],
    ['pet', 'cachorro', 'gato', 'automotivo', 'celular', 'tênis'],
    ['size', 'material', 'pieces', 'capacity', 'voltage'], { apiCategories: [100010, 100636], amazonBrowseNodes: ['17100532011', '17124722011', '17124716011'] }),

  organizacao_editorial: scenario('organizacao_editorial', 'Organização', 8,
    ['organizador de cozinha', 'caixa organizadora', 'cesto organizador', 'cabide', 'sapateira', 'lixeira', 'mop', 'varal', 'cesto roupa'],
    ['organizador', 'caixa organizadora', 'cesto', 'cabide', 'sapateira', 'lixeira', 'mop', 'varal', 'lavanderia'],
    ['pet', 'bebê', 'bebe', 'automotivo', 'industrial'],
    ['material', 'dimensions', 'quantity', 'capacity'], { apiCategories: [100010, 100636], amazonBrowseNodes: ['17100533011', '17100522011', '17124717011'] }),

  ferramentas_editorial: scenario('ferramentas_editorial', 'Ferramentas', 9,
    ['furadeira', 'parafusadeira', 'kit ferramentas', 'chave de fenda', 'alicate', 'serra', 'trena', 'maleta ferramentas', 'ferramenta elétrica'],
    ['furadeira', 'parafusadeira', 'ferramenta', 'alicate', 'serra', 'trena', 'chave', 'maleta ferramentas'],
    ['infantil', 'brinquedo', 'automotivo', 'cosmético', 'cosmetico'],
    ['brand', 'model', 'voltage', 'power', 'pieces'], { apiCategories: [100636], amazonBrowseNodes: ['165793011', '165796011'] }),

  informatica_editorial: scenario('informatica_editorial', 'Informática', 10,
    ['notebook', 'computador', 'pc gamer', 'monitor', 'impressora', 'teclado', 'mouse', 'webcam', 'ssd', 'hd externo', 'roteador'],
    ['notebook', 'computador', 'pc gamer', 'monitor', 'impressora', 'teclado', 'mouse', 'webcam', 'ssd', 'hd', 'roteador'],
    ['celular', 'smartphone', 'tablet infantil', 'cabo isolado', 'suporte'],
    ['brand', 'model', 'memory', 'screen', 'connectivity'], { apiCategories: [100644, 100013], amazonBrowseNodes: ['16243803011', '16243794011', '24035344011'] }),

  celulares_editorial: scenario('celulares_editorial', 'Celulares', 11,
    ['smartphone', 'celular', 'iphone', 'galaxy', 'redmi', 'carregador turbo', 'power bank', 'capa celular'],
    ['smartphone', 'celular', 'iphone', 'galaxy', 'redmi', 'carregador', 'power bank', 'capa celular'],
    ['notebook', 'monitor', 'cabo avulso', 'película avulsa'],
    ['brand', 'model', 'memory', 'screen', 'battery'], { apiCategories: [100013], amazonBrowseNodes: ['16243809011', '16243802011', '16243799011'] }),

  beleza_editorial: scenario('beleza_editorial', 'Beleza', 12,
    ['protetor solar', 'hidratante facial', 'sérum', 'shampoo', 'secador', 'chapinha', 'perfume', 'maquiagem', 'escova secadora'],
    ['protetor solar', 'hidratante', 'serum', 'sérum', 'shampoo', 'secador', 'chapinha', 'perfume', 'maquiagem', 'escova'],
    ['pet', 'bebê', 'suplemento', 'medicamento', 'alimento'],
    ['brand', 'volume', 'function', 'skin_type', 'fragrance'], { apiCategories: [100630, 100001], amazonBrowseNodes: ['16754345011', '16754346011', '16754347011'] }),

  moda_editorial: scenario('moda_editorial', 'Moda', 13,
    ['camiseta masculina', 'camisa', 'calça jeans', 'bermuda', 'tênis casual', 'sapato', 'moletom', 'bolsa', 'relógio', 'óculos'],
    ['camiseta', 'camisa', 'calça', 'bermuda', 'tênis', 'sapato', 'moletom', 'bolsa', 'relógio', 'óculos'],
    ['bebê', 'bebe', 'infantil', 'fitness específico', 'pet'],
    ['brand', 'size', 'color', 'material', 'gender'], { apiCategories: [100009, 100011, 100012, 100534], amazonBrowseNodes: ['17681970011', '17681966011', '23577004011'] }),

  esporte_editorial: scenario('esporte_editorial', 'Esporte', 14,
    ['tênis de corrida', 'legging fitness', 'whey protein', 'creatina', 'tapete de yoga', 'halter', 'corda de pular', 'faixa elástica', 'luva academia'],
    ['corrida', 'fitness', 'whey', 'creatina', 'yoga', 'halter', 'corda', 'faixa elástica', 'academia'],
    ['pet', 'bebê', 'moda social', 'automotivo'],
    ['brand', 'size', 'weight', 'material', 'volume'], { apiCategories: [100637, 100001], amazonBrowseNodes: ['17833921011', '17833929011', '17833917011'] }),

  pet_editorial: scenario('pet_editorial', 'Pet', 15,
    ['ração cachorro', 'ração gato', 'tapete higiênico', 'cama pet', 'brinquedo pet', 'areia gato', 'coleira', 'caixa transporte pet', 'shampoo pet'],
    ['ração', 'tapete higiênico', 'cama pet', 'brinquedo pet', 'areia', 'coleira', 'transporte pet', 'shampoo pet'],
    ['bebê', 'bebe', 'humano', 'automotivo'],
    ['species', 'size', 'weight', 'material', 'flavor'], { apiCategories: [100631], amazonBrowseNodes: ['19653951011', '19653950011', '19653948011'] }),

  automotivo_editorial: scenario('automotivo_editorial', 'Automotivo', 16,
    ['acessório automotivo', 'tapete carro', 'capa banco carro', 'lâmpada automotiva', 'som automotivo', 'ferramenta automotiva', 'carregador veicular', 'compressor carro'],
    ['automotivo', 'carro', 'veicular', 'moto', 'pneu', 'lâmpada carro', 'som automotivo', 'compressor'],
    ['brinquedo', 'pet', 'bebê', 'bebe', 'peça incompatível'],
    ['brand', 'model', 'voltage', 'compatibility', 'vehicle'], { apiCategories: [100636], amazonBrowseNodes: ['156901011', '157069011'] }),

  games_editorial: scenario('games_editorial', 'Games', 17,
    ['console', 'playstation', 'xbox', 'nintendo switch', 'controle gamer', 'jogo ps5', 'jogo xbox', 'cadeira gamer', 'headset gamer'],
    ['console', 'playstation', 'xbox', 'nintendo', 'controle', 'jogo', 'cadeira gamer', 'headset gamer'],
    ['pet', 'bebê', 'bebe', 'software ilegal', 'conta digital'],
    ['platform', 'brand', 'model', 'storage', 'connectivity'], { apiCategories: [100634], amazonBrowseNodes: ['16364751011', '16364749011', '16253313011'] }),

  tv_audio_editorial: scenario('tv_audio_editorial', 'TV e Áudio', 18,
    ['smart tv', 'televisão 4k', 'tv led', 'soundbar', 'caixa de som', 'fone bluetooth', 'headphone', 'home theater', 'projetor'],
    ['smart tv', 'televisão', 'tv', 'soundbar', 'caixa de som', 'fone', 'headphone', 'home theater', 'projetor'],
    ['cabo avulso', 'suporte isolado', 'película', 'pet', 'bebê'],
    ['brand', 'screen', 'resolution', 'power', 'connectivity'], { apiCategories: [100013, 100644], amazonBrowseNodes: ['16243803011', '16243794011', '16243809011'] }),

  eletrodomesticos_editorial: scenario('eletrodomesticos_editorial', 'Eletrodomésticos', 19,
    ['geladeira', 'refrigerador', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'lava e seca', 'lava-louças', 'ar condicionado'],
    ['geladeira', 'refrigerador', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'lava e seca', 'lava louças', 'ar condicionado'],
    ['acessório', 'acessorio', 'cabo', 'peça', 'refil', 'pet', 'bebê'],
    ['brand', 'model', 'capacity', 'dimensions', 'voltage'], { apiCategories: [100010], amazonBrowseNodes: ['16745371011', '17124786011', '16745366011'] }),

  moveis_editorial: scenario('moveis_editorial', 'Móveis', 20,
    ['sofá', 'guarda roupa', 'guarda-roupa', 'cama', 'colchão', 'mesa de jantar', 'escrivaninha', 'cadeira escritório', 'rack tv', 'cômoda'],
    ['sofá', 'guarda roupa', 'guarda-roupa', 'cama', 'colchão', 'mesa', 'escrivaninha', 'cadeira', 'rack', 'cômoda'],
    ['pet', 'bebê', 'bebe', 'peça avulsa', 'capa isolada'],
    ['material', 'dimensions', 'seats', 'color', 'assembly'], { apiCategories: [100636], amazonBrowseNodes: ['17100553011', '17100552011', '17100547011'] }),

  grandes_ofertas_editorial: scenario('grandes_ofertas_editorial', 'Grandes Ofertas', 21,
    ['oferta', 'desconto', 'promoção', 'mais vendido', 'frete grátis', 'smartphone', 'smart tv', 'notebook', 'geladeira', 'fogão', 'ar condicionado', 'fritadeira', 'micro-ondas'],
    ['smartphone', 'smart tv', 'notebook', 'geladeira', 'fogão', 'lavadora', 'ar condicionado', 'monitor', 'caixa de som', 'console', 'fritadeira', 'micro-ondas', 'aspirador', 'liquidificador', 'fone', 'iphone', 'galaxy'],
    ['cupom sem aprovação', 'usado', 'recondicionado', 'serviço', 'servico'],
    ['price', 'old_price', 'discount', 'seller', 'shipping'], { priority: 'critical', maxAgeHours: 2, apiCategories: [100013, 100644, 100636], amazonBrowseNodes: ['16243809011', '16243803011', '16243794011', '17100532011'] }),

  cupons_aprovados_editorial: {
    id: 'cupons_aprovados_editorial', name: 'Cupons', queueHour: 22, marketplaces: [...MARKETPLACES],
    keywords: ['cupom', 'código promocional', 'desconto'], allowedProductTerms: [],
    blockedProductTerms: ['produto_sem_cupom', 'cupom_expirado'], attributes: ['code', 'rules', 'valid_until', 'marketplace'], maxAgeHours: 24,
    priority: 'high', discoveryMode: 'manual_only', apiCategories: [], amazonBrowseNodes: [], aliases: [],
  },

  bebidas_editorial: scenario('bebidas_editorial', 'Bebidas', 23,
    ['vinho', 'whisky', 'cerveja artesanal', 'licor', 'gin', 'vodka', 'café em grãos', 'chá', 'energético'],
    ['vinho', 'whisky', 'cerveja', 'licor', 'gin', 'vodka', 'café', 'chá', 'energético'],
    ['infantil', 'pet', 'automotivo'],
    ['brand', 'volume', 'type'], { apiCategories: [100001, 100636], amazonBrowseNodes: ['16754344011', '16754348011'] }),

  // --- INÍCIO DA ZONA DE LOJAS OFICIAIS (ALTO TICKET / DYNAMIC TRENDS) ---

  suplementacao_oficial: scenario('suplementacao_oficial', 'Suplementação e Saúde (Oficial)', 19,
    ['whey protein 100% puro', 'whey protein isolado', 'creatina monohidratada pura', 'pré treino', 'bcaa em pó', 'glutamina', 'colágeno hidrolisado'],
    ['whey', 'creatina', 'pré treino', 'bcaa', 'glutamina', 'colágeno'],
    ['infantil', 'usado', 'veicular'],
    ['brand', 'weight', 'flavor'], { apiCategories: [100001, 100637], discoveryMode: 'dynamic_trends' }),

  perfumaria_premium: scenario('perfumaria_premium', 'Perfumaria e Make Premium', 20,
    ['perfume importado', 'eau de parfum', 'base líquida matte', 'sérum anti-idade', 'kit cronograma capilar', 'máscara de hidratação profissional'],
    ['perfume importado', 'eau de parfum', 'base líquida', 'sérum', 'cronograma capilar'],
    ['pet', 'automotivo'],
    ['brand', 'volume'], { apiCategories: [100630, 100001], discoveryMode: 'dynamic_trends' }),

  calcados_premium: scenario('calcados_premium', 'Calçados Premium', 21,
    ['tênis de corrida original', 'sapato social couro', 'bota tratorada couro', 'chuteira society original', 'sandália salto bloco', 'sapatênis casual'],
    ['tênis de corrida', 'sapato social', 'bota', 'chuteira', 'sandália', 'sapatênis'],
    ['infantil', 'usado', 'réplica'],
    ['brand', 'size', 'color'], { apiCategories: [100012, 100011, 100009], discoveryMode: 'dynamic_trends' }),

  eletronicos_highticket: scenario('eletronicos_highticket', 'Eletrônicos Premium', 22,
    ['smartphone 5g', 'iphone apple', 'galaxy s', 'notebook gamer', 'macbook', 'ipad', 'smart tv oled'],
    ['smartphone', 'iphone', 'galaxy', 'notebook', 'macbook', 'ipad', 'smart tv'],
    ['cabo', 'capa', 'película', 'suporte', 'carregador'],
    ['brand', 'model', 'memory'], { apiCategories: [100013, 100644], discoveryMode: 'dynamic_trends' }),
});

const EDITORIAL_SCENARIO_IDS = Object.freeze(Object.keys(EDITORIAL_SCENARIOS));
const QUEUE_BY_HOUR = Object.freeze(Object.fromEntries(EDITORIAL_SCENARIO_IDS.map((id) => [EDITORIAL_SCENARIOS[id].queueHour, id])));

function getEditorialScenarioById(id) {
  return EDITORIAL_SCENARIOS[String(id || '').trim()] || null;
}

function getEditorialScenarioForHour(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  if (normalized < 7) return EDITORIAL_SCENARIOS.casa_cozinha_editorial;
  return EDITORIAL_SCENARIOS[QUEUE_BY_HOUR[normalized] || 'cupons_aprovados_editorial'];
}

function getEditorialScenarioForDiscoveryHour(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  const publicationHour = normalized < 6 ? 7 : Math.min(normalized + 1, 21);
  return getEditorialScenarioForHour(publicationHour);
}

module.exports = {
  MARKETPLACES,
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_IDS,
  QUEUE_BY_HOUR,
  getEditorialScenarioById,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
};
