'use strict';

// 1. Definição dos Mega Bancos (Scenarios)
const SCENARIOS = {
  eletros_cozinha: {
    id: 'eletros_cozinha',
    name: 'Eletros de Cozinha',
    // Busca somente por termos: a varredura ampla de categoria retornava itens não relacionados.
    productCatId: 100010,
    apiCategories: [],
    keywordSelection: 'all',
    maxPagesPerKeyword: 1,
    keywords: [
      'cafeteira elétrica', 'cafeteira expresso', 'batedeira planetária', 'batedeira elétrica',
      'liquidificador', 'air fryer', 'mixer 3 em 1', 'sanduicheira elétrica',
      'chaleira elétrica', 'panela elétrica', 'processador de alimentos', 'forno elétrico',
      'pipoqueira elétrica', 'cozedor de ovos', 'espremedor elétrico', 'mini processador elétrico',
      'panela de pressão elétrica', 'multiprocessador', 'processador triturador', 'fritadeira sem óleo',
      'sanduicheira waffles', 'sanduicheira grill', 'waffle maker', 'batedeira de mão'
    ],
    allowedProductTerms: [
      'cafeteira', 'batedeira', 'liquidificador', 'air fryer', 'airfryer', 'mixer 3 em 1',
      'sanduicheira', 'sanduicheira waffles', 'sanduicheira grill', 'waffle maker', 'chaleira elétrica', 'panela elétrica', 'panela de pressão elétrica', 'processador', 'processador triturador', 'multiprocessador', 'forno elétrico',
      'fritadeira sem óleo', 'batedeira de mão',
      'pipoqueira elétrica', 'cozedor de ovos', 'espremedor elétrico', 'mini processador'
    ],
    blockedProductTerms: [
      'utensílio', 'utensilio', 'manual', 'veicular', 'filtro de linha', 'torneira',
      'pigment', 'henna', 'sobrancelha', 'beleza', 'acessório', 'acessorio', 'suporte', 'refil',
      'borrifador', 'spray', 'limpa ', 'limpeza', 'desengordurante', 'descalcificante', 'espuma ',
      'forma de silicone', 'formas de silicone', 'assadeira', 'cafeteira italiana', 'moka', 'fogão'
    ]
  },
  mae_de_primeira_viagem: {
    id: 'mae_de_primeira_viagem',
    name: 'Mãe de Primeira Viagem',
    apiCategories: [100632, 100633], // Mom & Baby, Baby & Kids Fashion
    keywords: [
      'fralda descartável atacado', 'lenço umedecido atacado', 'pomada assadura', 'mamadeira anti cólica', 
      'babá eletrônica', 'bolsa maternidade', 'ninho redutor de berço', 'kit higiene bebê', 
      'banheira bebê', 'termômetro digital', 'extrator de leite', 'toalha de banho com capuz', 
      'cadeirinha de alimentação', 'mordedor silicone', 'roupinhas de bebê kit', 'absorvente seios', 
      'travesseiro antissufocante bebê', 'berço portátil desmontável', 'tapete atividades bebê', 
      'móbile berço musical', 'cadeira descanso bebê', 'aspirador nasal bebê', 'kit cortador unha bebê', 
      'sabonete líquido recém nascido', 'óleo massagem bebê', 'fralda pano algodão', 'cueiro bebê flanelado', 
      'body bebê manga longa', 'mijãozinho bebê atacado', 'meia bebê antiderrapante', 'protetor quina móvel', 
      'trava gaveta segurança', 'cadeirinha carro bebê', 'canguru ergonômico bebê', 'sling tecido recém nascido'
    ]
  },
  dono_de_pet: {
    id: 'dono_de_pet',
    name: 'Dono de Pet',
    apiCategories: [100631], // Pets
    keywords: [
      'tapete higiênico cachorro', 'ração premium', 'tira pelos pet', 'bebedouro fonte gato', 
      'brinquedo pet interativo', 'caminha para cachorro', 'areia higiênica gato', 'arranhador gato', 
      'coleira peitoral', 'shampoo pet', 'escova rasqueadeira', 'bolsa de transporte pet', 
      'comedouro lento cachorro', 'pazinha areia gato', 'caixa de areia fechada gato', 
      'casinha cachorro plástico', 'roupinha pet inverno', 'cinto segurança cachorro carro', 
      'capa banco carro pet', 'petisco cachorro natural', 'sachê gato atacado', 'cortador unha pet', 
      'toalha banho pet super absorvente', 'brinquedo corda cachorro', 'erva de gato catnip',
      'fonte água gato', 'cama pet', 'tapete cachorro', 'brinquedo mordedor cachorro'
    ]
  },
  morando_sozinho: {
    id: 'morando_sozinho',
    name: 'Morando Sozinho',
    apiCategories: [100010, 100636], // Home Appliances, Home & Construction
    keywords: [
      'air fryer', 'mop giratório', 'sanduicheira elétrica', 'chaleira elétrica', 'forro de papel airfryer', 
      'esfregão de limpeza', 'varal de chão', 'tábua de passar', 'ferro de passar', 'kit ferramentas básico', 
      'abridor de vinho elétrico', 'filtro de água barro', 'lixeira inox pedal', 'jogo de copos vidro', 
      'mixer triturador', 'panela elétrica arroz', 'escorredor pratos plástico', 'organizador sapatos', 
      'cabides veludo kit', 'balança digital cozinha', 'extensão elétrica', 'lâmpada led inteligente', 
      'cesto roupa suja flexível', 'pregadores roupa madeira', 'pano microfibra limpeza', 'rodo mágico abs', 
      'limpa vidros magnético', 'dispenser creme dental', 'organizador cabos', 'miniprocessador manual alho', 
      'ventilador mesa', 'aquecedor portátil', 'jogo lençol microfibra', 'toalha banho avulsa', 'vasilha plástico kit',
      'aspirador vertical', 'cafeteira compacta', 'organizador cozinha', 'luminária mesa'
    ]
  },
  enxoval_casamento: {
    id: 'enxoval_casamento',
    name: 'Enxoval de Casamento',
    apiCategories: [100010, 100636], // Home Appliances, Home & Construction
    keywords: [
      'jogo de panelas antiaderente', 'jogo de lençol algodão', 'faqueiro aço inox', 'aparelho de jantar porcelana', 
      'jogo de taças', 'toalha de banho fio penteado', 'liquidificador turbo', 'escorredor de louça inox', 
      'panela de pressão', 'jogo de potes herméticos', 'conjunto de xícaras café', 'tábua de corte bambu', 
      'pano de prato kit', 'edredom casal', 'tapete para banheiro', 'jogo de toalhas de rosto', 
      'kit utensílios silicone', 'travesseiro antialérgico', 'garrafa térmica café', 'batedeira planetária', 
      'jogo de sobremesa vidro', 'assadeira antiaderente', 'frigideira cerâmica', 'espatula silicone', 
      'jogo de copos vidro', 'dispenser detergente', 'lixeira inox pedal', 'suporte papel toalha', 
      'toalha de mesa impermeável', 'jogo americano bambu', 'bandeja espelhada lavabo', 'kit organizador gavetas', 
      'capa protetora colchão', 'cortina blackout sala', 'tapete felpudo sala', 'cobre leito matelassê', 
      'conjunto mantimentos', 'boleira vidro', 'cafeteira elétrica', 'ferro a vapor',
      'jogo de cama casal', 'kit cozinha', 'pote organizador cozinha', 'panela elétrica arroz'
    ]
  },
  moda_masculina: {
    id: 'moda_masculina',
    name: 'Moda Masculina',
    apiCategories: [100011, 100012, 100009], // Men Clothes, Men Shoes, Fashion Accessories
    keywords: [
      'sapatos masculinos', 'tênis casual masculino', 'relógio masculino de pulso', 
      'jaqueta de couro masculina', 'cinto de couro social', 'carteira masculina couro', 
      'mochila executiva masculina', 'óculos de sol masculino', 'camisa polo masculina', 'calça jeans masculina',
      'camiseta masculina', 'bermuda masculina', 'tênis esportivo masculino', 'moletom masculino'
    ],
    blockedProductTerms: ['infantil', 'criança', 'crianca', 'juvenil', 'bebê', 'bebe']
  },
  gamer_tecnologia: {
    id: 'gamer_tecnologia',
    name: 'Gamer e Tecnologia',
    apiCategories: [100644, 100013, 100634], // Computers, Mobile & Gadgets, Gaming
    keywords: [
      'mouse gamer rgb', 'teclado mecânico switch', 'fone bluetooth sem fio', 
      'cadeira gamer ergonômica', 'smartwatch relógio inteligente', 'suporte notebook alumínio', 
      'carregador turbo', 'cabo iphone', 'ring light', 'tripé celular',
      'headset gamer', 'mouse sem fio', 'teclado gamer', 'suporte celular mesa', 'webcam gamer'
    ]
  },
  beleza_autocuidado: {
    id: 'beleza_autocuidado',
    name: 'Beleza e Autocuidado',
    apiCategories: [100630, 100001], // Beauty, Health
    keywords: [
      'skincare rosto', 'protetor solar facial', 'secador de cabelo profissional', 
      'chapinha alisadora', 'perfume importado', 'kit pincéis maquiagem',
      'escova secadora', 'sérum vitamina c', 'creme hidratante corporal', 'kit maquiagem completo',
      'hidratante facial', 'modelador de cachos', 'óleo capilar', 'base maquiagem'
    ]
  },
  treino_academia: {
    id: 'treino_academia',
    name: 'Treino e Academia',
    apiCategories: [100637, 100001], // Sports & Outdoors, Health
    keywords: [
      'whey protein', 'creatina pura', 'garrafa térmica inox', 
      'roupa de academia fitness', 'tapete yoga pilates', 'tênis de corrida',
      'corda de pular', 'faixa elástica mini band', 'halter emborrachado', 'suplemento pré treino',
      'legging fitness', 'camiseta dry fit', 'barra musculação', 'luva academia'
    ]
  },
  acessorios_relogios: {
    id: 'acessorios_relogios',
    name: 'Acessórios e Relógios',
    apiCategories: [100009, 100534], // Fashion Accessories, Watches
    keywords: [
      'relógio smartwatch', 'óculos de sol polarizado', 'colar prata 925', 
      'pulseira magnética', 'anel de compromisso', 'boné aba curva', 
      'mochila transversal', 'carteira couro fina', 'brinco argola',
      'relógio g-shock', 'corrente masculina', 'tiara de cabelo',
      'relógio digital', 'pulseira smartwatch', 'necessaire feminina', 'porta-cartão'
    ]
  },
  viagem_aventura: {
    id: 'viagem_aventura',
    name: 'Viagem e Aventura',
    apiCategories: [100015, 100637], // Travel & Luggage, Sports & Outdoors
    keywords: [
      'mala de bordo 10kg', 'kit organizador mala', 'travesseiro de pescoço', 
      'barraca camping 4 pessoas', 'garrafa térmica inox', 'lanterna tática recarregável', 
      'mochila trilha', 'capa chuva impermeável', 'cadeira de praia dobrável',
      'saco de dormir', 'canivete suíço', 'balança digital bagagem',
      'mala média viagem', 'mochila viagem', 'organizador compressão mala', 'capa mala'
    ]
  }
};

// Matriz V2: intenções orientadas a impulso, alto valor e diversidade editorial.
// Os cenários antigos permanecem disponíveis para compatibilidade e auditoria.
SCENARIOS.tecnologia_desejo = {
  id: 'tecnologia_desejo', name: 'Tecnologia e Eletrônicos de Desejo',
  apiCategories: [100013, 100634, 100644], keywordSelection: 'all', maxPagesPerKeyword: 1,
  keywords: [...SCENARIOS.gamer_tecnologia.keywords, 'celular', 'notebook', 'tablet', 'monitor', 'console', 'climatizador', 'aspirador robô'],
};
SCENARIOS.eletrodomesticos_cozinha = {
  id: 'eletrodomesticos_cozinha', name: 'Eletrodomésticos e Cozinha',
  apiCategories: [100010], keywordSelection: 'all', maxPagesPerKeyword: 1,
  keywords: [...SCENARIOS.eletros_cozinha.keywords, 'Smart TV 4K', 'geladeira', 'refrigerador', 'máquina de lavar', 'lava e seca', 'lava louças', 'cooktop', 'micro ondas', 'ar condicionado', 'fogão'],
  blockedProductTerms: ['acessório', 'acessorio', 'adaptador', 'cabo', 'chave', 'filtro de linha', 'kit recarga automotivo', 'peça', 'refil', 'suporte'],
};
SCENARIOS.impulso_casa = {
  id: 'impulso_casa', name: 'Impulso para Casa e Utilidades',
  apiCategories: [100010, 100636], keywordSelection: 'all', maxPagesPerKeyword: 1,
  keywords: ['organizador de cozinha', 'iluminação', 'utensílios úteis', 'limpeza prática', 'pequenos eletroportáteis', 'itens para escritório', 'cozinha compacta', 'organização doméstica', 'lixeira inox', 'cafeteira compacta', 'luminária de mesa', 'balança digital cozinha'],
};
SCENARIOS.casa_moveis = {
  id: 'casa_moveis', name: 'Casa e Móveis',
  apiCategories: [100636], keywordSelection: 'all', maxPagesPerKeyword: 1,
  keywords: ['sofá', 'guarda roupa', 'cama', 'colchão', 'mesa de jantar', 'escrivaninha', 'cadeira de escritório', 'rack e painel para TV', 'cômoda'],
};
SCENARIOS.pet_bebe = {
  id: 'pet_bebe', name: 'Pet e Bebê',
  apiCategories: [100631, 100632, 100633], keywordSelection: 'all', maxPagesPerKeyword: 1,
  keywords: [...SCENARIOS.dono_de_pet.keywords, ...SCENARIOS.mae_de_primeira_viagem.keywords],
};
SCENARIOS.moda_fitness_beleza_viagem = {
  id: 'moda_fitness_beleza_viagem', name: 'Moda, Fitness, Beleza e Viagem',
  apiCategories: [100009, 100011, 100012, 100015, 100534, 100630, 100637], keywordSelection: 'all', maxPagesPerKeyword: 1,
  keywords: [
    ...SCENARIOS.moda_masculina.keywords,
    ...SCENARIOS.treino_academia.keywords,
    ...SCENARIOS.beleza_autocuidado.keywords,
    ...SCENARIOS.viagem_aventura.keywords,
  ],
};

// 2. Roteamento editorial único. Os contratos legados acima são mantidos
// somente para leitura histórica; nenhum ciclo ativo os utiliza.
const {
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_IDS,
  QUEUE_BY_HOUR,
  getEditorialScenarioById,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
} = require('./editorial-scenario-config.cjs');
for (const id of Object.keys(SCENARIOS)) delete SCENARIOS[id];
Object.assign(SCENARIOS, EDITORIAL_SCENARIOS);

const SCENARIO_WINDOWS = Object.freeze(EDITORIAL_SCENARIO_IDS.map((id) => ({
  start: EDITORIAL_SCENARIOS[id].queueHour,
  end: EDITORIAL_SCENARIOS[id].queueHour + 1,
  scenarioId: id,
  label: EDITORIAL_SCENARIOS[id].name,
})));

const DEFAULT_CYCLE_SCENARIO_ROUTING = Object.freeze({
  0: 'casa_cozinha_editorial',
  4: 'ferramentas_editorial',
  8: 'informatica_editorial',
  12: 'beleza_editorial',
  16: 'games_editorial',
  20: 'grandes_ofertas_editorial',
});

function getCycleScenarioRouting() {
  const raw = process.env.ORACLE_CYCLE_SCENARIO_ROUTING_JSON;
  if (!raw) return DEFAULT_CYCLE_SCENARIO_ROUTING;
  try {
    const parsed = JSON.parse(raw);
    const routing = {};
    for (const hour of [0, 4, 8, 12, 16, 20]) {
      const id = String(parsed?.[hour] || '').trim();
      routing[hour] = getEditorialScenarioById(id) ? id : DEFAULT_CYCLE_SCENARIO_ROUTING[hour];
    }
    return Object.freeze(routing);
  } catch {
    return DEFAULT_CYCLE_SCENARIO_ROUTING;
  }
}

const CYCLE_SCENARIO_ROUTING = Object.freeze({
  0: 'casa_cozinha_editorial',
  4: 'casa_cozinha_editorial',
  8: 'ferramentas_editorial',
  12: 'beleza_editorial',
  16: 'games_editorial',
  20: 'grandes_ofertas_editorial',
});

function getCanonicalCycleScenarioId(startHour) {
  return getEditorialScenarioForDiscoveryHour(startHour).id;
}

function getScenarioWindow(currentHour) {
  const hour = ((Number(currentHour) % 24) + 24) % 24;
  return SCENARIO_WINDOWS.find((window) => hour >= window.start && hour < window.end)
    || { start: hour, end: hour + 1, scenarioId: getEditorialScenarioForHour(hour).id, label: getEditorialScenarioForHour(hour).name };
}

function getSaoPauloHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));
}

function getActiveScenario(currentHour) {
  const window = getScenarioWindow(currentHour);
  const scenario = SCENARIOS[window.scenarioId];
  return { ...scenario, name: window.label, schedule: window };
}

function getCycleScenario(startHour, durationHours = 4) {
  const hour = ((Number(startHour) % 24) + 24) % 24;
  const scenario = getEditorialScenarioForDiscoveryHour(hour);
  const scenarioId = scenario.id;
  const window = getScenarioWindow(scenario.queueHour);
  return {
    ...scenario,
    id: scenarioId,
    scenarioId,
    scenarioIds: [scenarioId],
    name: scenario.name || window?.label || scenarioId,
    schedule: window ? [window] : [],
    routingMode: 'editorial_queue',
    discoveryHour: hour,
    publicationHour: scenario.queueHour,
  };
}

function getCycleStartHour(currentHour) {
  const hour = ((Number(currentHour) % 24) + 24) % 24;
  return hour - (hour % 4);
}

// 3. Função Auxiliar de Sorteio
function getRandomItems(array, count = 5) {
  if (!array || array.length === 0) return [];
  const shuffled = [...array].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

function normalizeProductTitle(value) {
  return String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('pt-BR')
    .replace(/\s+/g, ' ')
    .trim();
}

function matchesScenarioProduct(scenario, title) {
  const normalizedTitle = normalizeProductTitle(title);
  const containsTerm = (term) => {
    const normalizedTerm = normalizeProductTitle(term).replace(/[^a-z0-9]+/g, ' ').trim();
    return normalizedTerm && (` ${normalizedTitle.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${normalizedTerm} `);
  };
  const blocked = (scenario?.blockedProductTerms || []).some(containsTerm);
  if (blocked) return false;
  const allowedTerms = scenario?.allowedProductTerms || [];
  if (allowedTerms.length > 0) return allowedTerms.some(containsTerm);

  // Cenários amplos usam categorias API como descoberta, mas o título ainda
  // precisa confirmar a intenção. Exigimos a frase inteira ou pelo menos dois
  // tokens relevantes da intenção (um token quando a intenção é unitária).
  const stopwords = new Set(['para', 'com', 'sem', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'kit', 'tipo', 'mais']);
  const keywords = Array.isArray(scenario?.keywords) ? scenario.keywords : [];
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeProductTitle(keyword);
    if (!normalizedKeyword) return false;
    if (containsTerm(normalizedKeyword)) return true;
    const tokens = normalizedKeyword.split(' ').filter((token) => token.length >= 4 && !stopwords.has(token));
    if (!tokens.length) return false;
    const matches = tokens.filter((token) => containsTerm(token)).length;
    return matches >= Math.min(2, tokens.length);
  });
}

function extractProductModelKey(title) {
  const normalized = normalizeProductTitle(title);
  const model = normalized.match(/\b(?:[a-z]{2,}[a-z0-9-]*\d[a-z0-9-]*|[a-z]-\d{2,})\b/u)?.[0];
  return model ? `model:${model}` : null;
}

module.exports = {
  SCENARIOS,
  getSaoPauloHour,
  getActiveScenario,
  getCycleScenario,
  getCanonicalCycleScenarioId,
  CYCLE_SCENARIO_ROUTING,
  getCycleStartHour,
  getScenarioWindow,
  SCENARIO_WINDOWS,
  getRandomItems,
  normalizeProductTitle,
  matchesScenarioProduct,
  extractProductModelKey
};
