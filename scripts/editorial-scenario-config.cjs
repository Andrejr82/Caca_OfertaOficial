'use strict';

const MARKETPLACES = Object.freeze(['Shopee', 'Mercado Livre', 'Amazon']);
const EDITORIAL_SCHEDULE_TIMEZONE = 'America/Sao_Paulo';

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
    productCatId: options.productCatId || null,
    maxPriceThreshold: options.maxPriceThreshold || null,
  };
}

const EDITORIAL_SCENARIOS = Object.freeze({
  casa_cozinha_editorial: scenario('casa_cozinha_editorial', 'Casa e Cozinha', 7,
    ['jogo de cama', 'toalha de banho', 'aparelho de jantar', 'faqueiro', 'cafeteira', 'air fryer', 'liquidificador', 'batedeira', 'sanduicheira', 'panela elétrica', 'aspirador vertical', 'forno elétrico', 'grill elétrico', 'chaleira elétrica', 'mixer', 'máquina de café'],
    ['cama', 'lençol', 'toalha', 'faqueiro', 'jantar', 'cafeteira', 'air fryer', 'liquidificador', 'batedeira', 'sanduicheira', 'panela elétrica', 'aspirador vertical', 'forno elétrico', 'grill elétrico', 'chaleira elétrica', 'mixer', 'máquina de café'],
    ['pet', 'cachorro', 'gato', 'automotivo', 'celular', 'tênis'],
    ['size', 'material', 'pieces', 'capacity', 'voltage'], { apiCategories: [100010, 100636], amazonBrowseNodes: ['17100532011', '17124722011', '17124716011'] }),

  organizacao_editorial: scenario('organizacao_editorial', 'Organização', 8,
    ['organizador de cozinha', 'caixa organizadora', 'cesto organizador', 'cabide', 'sapateira', 'lixeira', 'mop', 'varal', 'cesto roupa', 'organizador de gaveta', 'organizador de armário', 'estante organizadora', 'prateleira organizadora', 'organizador de banheiro'],
    ['organizador', 'caixa organizadora', 'cesto', 'cabide', 'sapateira', 'lixeira', 'mop', 'varal', 'lavanderia', 'organizador de gaveta', 'organizador de armário', 'estante organizadora', 'prateleira organizadora', 'organizador de banheiro'],
    ['pet', 'bebê', 'bebe', 'automotivo', 'industrial'],
    ['material', 'dimensions', 'quantity', 'capacity'], { apiCategories: [100010, 100636], amazonBrowseNodes: ['17100533011', '17100522011', '17124717011'] }),

  ferramentas_editorial: scenario('ferramentas_editorial', 'Ferramentas', 9,
    ['furadeira', 'parafusadeira', 'kit ferramentas', 'chave de fenda', 'alicate', 'serra', 'trena', 'maleta ferramentas', 'ferramenta elétrica', 'esmerilhadeira', 'martelete', 'serra circular', 'serra tico-tico', 'chave de impacto', 'lixadeira'],
    ['furadeira', 'parafusadeira', 'ferramenta', 'alicate', 'serra', 'trena', 'chave', 'maleta ferramentas', 'esmerilhadeira', 'martelete', 'serra circular', 'serra tico-tico', 'chave de impacto', 'lixadeira'],
    ['infantil', 'brinquedo', 'automotivo', 'cosmético', 'cosmetico'],
    ['brand', 'model', 'voltage', 'power', 'pieces'], { apiCategories: [100636], amazonBrowseNodes: ['165793011', '165796011'] }),

  informatica_editorial: scenario('informatica_editorial', 'Informática', 10,
    ['notebook', 'computador', 'pc gamer', 'monitor', 'impressora', 'teclado', 'mouse', 'webcam', 'ssd', 'hd externo', 'roteador', 'mini pc', 'all in one', 'scanner', 'nobreak', 'switch de rede'],
    ['notebook', 'computador', 'pc gamer', 'monitor', 'impressora', 'teclado', 'mouse', 'webcam', 'ssd', 'hd', 'roteador', 'mini pc', 'all in one', 'scanner', 'nobreak', 'switch de rede'],
    ['celular', 'smartphone', 'tablet infantil', 'cabo isolado', 'suporte'],
    ['brand', 'model', 'memory', 'screen', 'connectivity'], { apiCategories: [100644, 100013], amazonBrowseNodes: ['16243803011', '16243794011', '24035344011'] }),

  celulares_editorial: scenario('celulares_editorial', 'Celulares', 11,
    ['smartphone', 'celular', 'iphone', 'galaxy', 'redmi', 'samsung galaxy', 'xiaomi redmi', 'poco', 'motorola', 'realme'],
    ['smartphone', 'celular', 'iphone', 'galaxy', 'redmi', 'samsung galaxy', 'xiaomi redmi', 'poco', 'motorola', 'realme'],
    ['notebook', 'monitor', 'cabo avulso', 'película avulsa'],
    ['brand', 'model', 'memory', 'screen', 'battery'], { apiCategories: [100013], amazonBrowseNodes: ['16243809011', '16243802011', '16243799011'] }),

  beleza_editorial: scenario('beleza_editorial', 'Beleza', 12,
    ['protetor solar', 'hidratante facial', 'sérum', 'shampoo', 'secador', 'chapinha', 'perfume', 'maquiagem', 'escova secadora', 'aparador', 'máquina de cortar cabelo', 'modelador', 'escova alisadora', 'depilador'],
    ['protetor solar', 'hidratante', 'serum', 'sérum', 'shampoo', 'secador', 'chapinha', 'perfume', 'maquiagem', 'escova', 'aparador', 'máquina de cortar cabelo', 'modelador', 'escova alisadora', 'depilador'],
    ['pet', 'bebê', 'suplemento', 'medicamento', 'alimento'],
    ['brand', 'volume', 'function', 'skin_type', 'fragrance'], { apiCategories: [100630, 100001], amazonBrowseNodes: ['16754345011', '16754346011', '16754347011'] }),

  moda_editorial: scenario('moda_editorial', 'Moda', 13,
    ['camiseta masculina', 'camisa', 'calça jeans', 'bermuda', 'tênis casual', 'sapato', 'moletom', 'bolsa', 'relógio', 'óculos', 'jaqueta', 'vestido', 'mochila', 'tênis masculino', 'tênis feminino', 'calça social'],
    ['camiseta', 'camisa', 'calça', 'bermuda', 'tênis', 'sapato', 'moletom', 'bolsa', 'relógio', 'óculos', 'jaqueta', 'vestido', 'mochila', 'tênis masculino', 'tênis feminino', 'calça social'],
    ['bebê', 'bebe', 'infantil', 'fitness específico', 'pet'],
    ['brand', 'size', 'color', 'material', 'gender'], { apiCategories: [100009, 100011, 100012, 100534], amazonBrowseNodes: ['17681970011', '17681966011', '23577004011'] }),

  esporte_editorial: scenario('esporte_editorial', 'Esporte', 14,
    ['tênis de corrida', 'legging fitness', 'whey protein', 'creatina', 'tapete de yoga', 'halter', 'corda de pular', 'faixa elástica', 'luva academia', 'kettlebell', 'banco de musculação', 'bicicleta ergométrica', 'esteira', 'bicicleta'],
    ['corrida', 'fitness', 'whey', 'creatina', 'yoga', 'halter', 'corda', 'faixa elástica', 'academia', 'kettlebell', 'banco de musculação', 'bicicleta ergométrica', 'esteira', 'bicicleta'],
    ['pet', 'bebê', 'moda social', 'automotivo'],
    ['brand', 'size', 'weight', 'material', 'volume'], { apiCategories: [100637, 100001], amazonBrowseNodes: ['17833921011', '17833929011', '17833917011'] }),

  pet_editorial: scenario('pet_editorial', 'Pet', 15,
    ['ração cachorro', 'ração gato', 'tapete higiênico', 'cama pet', 'brinquedo pet', 'areia gato', 'coleira', 'caixa transporte pet', 'shampoo pet', 'bebedouro automático', 'comedouro automático', 'fonte pet', 'arranhador', 'caixa de areia fechada', 'casinha pet'],
    ['ração', 'tapete higiênico', 'cama pet', 'brinquedo pet', 'areia', 'coleira', 'transporte pet', 'shampoo pet', 'bebedouro automático', 'comedouro automático', 'fonte pet', 'arranhador', 'caixa de areia fechada', 'casinha pet'],
    ['bebê', 'bebe', 'humano', 'automotivo'],
    ['species', 'size', 'weight', 'material', 'flavor'], { apiCategories: [100631], amazonBrowseNodes: ['19653951011', '19653950011', '19653948011'] }),

  tv_audio_editorial: scenario('tv_audio_editorial', 'TV e Áudio', 18,
    ['smart tv', 'televisão 4k', 'tv led', 'soundbar', 'caixa de som', 'fone bluetooth', 'headphone', 'home theater', 'projetor', 'smart tv oled', 'smart tv qled', 'caixa bluetooth', 'receiver', 'amplificador', 'monitor smart'],
    ['smart tv', 'televisão', 'tv', 'soundbar', 'caixa de som', 'fone', 'headphone', 'home theater', 'projetor', 'smart tv oled', 'smart tv qled', 'caixa bluetooth', 'receiver', 'amplificador', 'monitor smart'],
    ['cabo avulso', 'suporte isolado', 'película', 'pet', 'bebê'],
    ['brand', 'screen', 'resolution', 'power', 'connectivity'], { apiCategories: [100013, 100644], amazonBrowseNodes: ['16243803011', '16243794011', '16243809011'] }),

  eletrodomesticos_editorial: scenario('eletrodomesticos_editorial', 'Eletrodomésticos', 19,
    ['geladeira', 'refrigerador', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'lava e seca', 'lava-louças', 'ar condicionado', 'aspirador', 'forno elétrico', 'coifa', 'depurador', 'frigobar', 'adega climatizada'],
    ['geladeira', 'refrigerador', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'lava e seca', 'lava louças', 'ar condicionado', 'aspirador', 'forno elétrico', 'coifa', 'depurador', 'frigobar', 'adega climatizada'],
    ['acessório', 'acessorio', 'cabo', 'peça', 'refil', 'pet', 'bebê'],
    ['brand', 'model', 'capacity', 'dimensions', 'voltage'], { apiCategories: [100010], amazonBrowseNodes: ['16745371011', '17124786011', '16745366011'] }),

  moveis_editorial: scenario('moveis_editorial', 'Móveis', 20,
    ['sofá', 'guarda roupa', 'guarda-roupa', 'cama', 'colchão', 'mesa de jantar', 'escrivaninha', 'cadeira escritório', 'rack tv', 'cômoda', 'poltrona', 'estante', 'painel tv', 'mesa lateral', 'mesa de centro', 'mesa escritório'],
    ['sofá', 'guarda roupa', 'guarda-roupa', 'cama', 'colchão', 'mesa', 'escrivaninha', 'cadeira', 'rack', 'cômoda', 'poltrona', 'estante', 'painel tv', 'mesa lateral', 'mesa de centro', 'mesa escritório'],
    ['pet', 'bebê', 'bebe', 'peça avulsa', 'capa isolada'],
    ['material', 'dimensions', 'seats', 'color', 'assembly'], { apiCategories: [100636], amazonBrowseNodes: ['17100553011', '17100552011', '17100547011'] }),

  grandes_ofertas_editorial: scenario('grandes_ofertas_editorial', 'Grandes Ofertas', 21,
    ['smartphone', 'smart tv', 'notebook', 'geladeira', 'fogão', 'ar condicionado', 'fritadeira', 'micro-ondas', 'lavadora', 'monitor', 'aspirador', 'liquidificador', 'caixa de som', 'fone', 'iphone', 'galaxy'],
    ['smartphone', 'smart tv', 'notebook', 'geladeira', 'fogão', 'lavadora', 'ar condicionado', 'monitor', 'caixa de som', 'console', 'fritadeira', 'micro-ondas', 'aspirador', 'liquidificador', 'fone', 'iphone', 'galaxy'],
    ['cupom sem aprovação', 'usado', 'recondicionado', 'serviço', 'servico'],
    ['price', 'old_price', 'discount', 'seller', 'shipping'], { priority: 'critical', maxAgeHours: 2, apiCategories: [100013, 100644, 100636], amazonBrowseNodes: ['16243809011', '16243803011', '16243794011', '17100532011'] }),

  cupons_aprovados_editorial: {
    id: 'cupons_aprovados_editorial', name: 'Cupons', queueHour: 22, marketplaces: [...MARKETPLACES],
    keywords: ['cupom', 'código promocional', 'desconto'], allowedProductTerms: [],
    blockedProductTerms: ['produto_sem_cupom', 'cupom_expirado'], attributes: ['code', 'rules', 'valid_until', 'marketplace'], maxAgeHours: 24,
    priority: 'high', discoveryMode: 'manual_only', apiCategories: [], amazonBrowseNodes: [], aliases: [],
  },


});

const EDITORIAL_SCENARIO_IDS = Object.freeze(Object.keys(EDITORIAL_SCENARIOS));
const EXPECTED_PUBLICATION_HOURS = Object.freeze([7, 8, 9, 10, 11, 12, 13, 14, 15, 18, 19, 20, 21, 22]);
const EXPECTED_DISCOVERY_HOURS = Object.freeze([6, 7, 8, 9, 10, 11, 12, 13, 14, 17, 18, 19, 20]);
function buildQueueByHour(scenarios) {
  const queue = {};
  for (const id of EDITORIAL_SCENARIO_IDS) {
    const hour = Number(scenarios[id]?.queueHour);
    if (Object.prototype.hasOwnProperty.call(queue, hour)) {
      throw new Error(`CONFIGURAÇÃO INVÁLIDA\nduplicate queueHour=${hour}`);
    }
    queue[hour] = id;
  }
  return Object.freeze(queue);
}
const QUEUE_BY_HOUR = buildQueueByHour(EDITORIAL_SCENARIOS);

function validateEditorialSchedule(scenarios = EDITORIAL_SCENARIOS) {
  const entries = Object.values(scenarios || {});
  const errors = [];
  const ids = entries.map((entry) => entry?.id);
  const queueHours = entries.map((entry) => Number(entry?.queueHour));
  const expectedIds = EDITORIAL_SCENARIO_IDS;
  const expectedIdSet = new Set(expectedIds);
  const actualIdSet = new Set(ids);

  if (entries.length !== expectedIds.length) errors.push(`active scenario count=${entries.length}, expected=${expectedIds.length}`);
  for (const id of expectedIds) if (!actualIdSet.has(id)) errors.push(`missing active scenario=${id}`);
  for (const id of ids) if (!expectedIdSet.has(id)) errors.push(`extra active scenario=${id}`);

  const seenHours = new Set();
  for (const hour of queueHours) {
    if (seenHours.has(hour)) errors.push(`duplicate queueHour=${hour}`);
    seenHours.add(hour);
  }
  if (queueHours.some((hour) => !Number.isInteger(hour) || hour < 7 || hour > 22)) errors.push('queueHour outside 07-22');
  if (seenHours.size !== EXPECTED_PUBLICATION_HOURS.length || EXPECTED_PUBLICATION_HOURS.some((hour) => !seenHours.has(hour))) {
    errors.push('publication hours must match expected schedule');
  }

  for (let index = 0; index < expectedIds.length; index += 1) {
    const entry = scenarios[expectedIds[index]];
    if (!entry || Number(entry.queueHour) !== EXPECTED_PUBLICATION_HOURS[index]) {
      errors.push(`queueHour mismatch for ${expectedIds[index]}`);
    }
  }
  for (const hour of EXPECTED_DISCOVERY_HOURS) {
    const publication = getEditorialScenarioForDiscoveryHour(hour);
    const expected = scenarios[QUEUE_BY_HOUR[hour + 1]];
    if (!publication || !expected || publication.id !== expected.id) errors.push(`discovery mapping mismatch=${hour}`);
  }
  for (const hour of [15, 16]) {
    const publication = getEditorialScenarioForDiscoveryHour(hour);
    if (publication !== null) errors.push(`discovery hour ${hour} must return null`);
  }
  const coupons = scenarios.cupons_aprovados_editorial;
  if (!coupons || coupons.discoveryMode !== 'manual_only') errors.push('cupons_aprovados_editorial must be manual_only');
  if (getEditorialScenarioForDiscoveryHour(21)?.id === coupons?.id) errors.push('coupon hour 22 must not trigger product discovery');
  return { valid: errors.length === 0, errors };
}

function assertEditorialScheduleValid(scenarios = EDITORIAL_SCENARIOS) {
  const result = validateEditorialSchedule(scenarios);
  if (!result.valid) throw new Error(`CONFIGURAÇÃO INVÁLIDA\n${result.errors.join('\n')}`);
  return result;
}

function getEditorialScenarioById(id) {
  return EDITORIAL_SCENARIOS[String(id || '').trim()] || null;
}

function getEditorialScenarioForHour(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  if (normalized < 7) return EDITORIAL_SCENARIOS.casa_cozinha_editorial;
  const scenarioId = QUEUE_BY_HOUR[normalized];
  if (!scenarioId) return null;
  return EDITORIAL_SCENARIOS[scenarioId] || null;
}

function getEditorialScenarioForDiscoveryHour(hour) {
  const normalized = ((Number(hour) % 24) + 24) % 24;
  const publicationHour = normalized < 6 ? 7 : Math.min(normalized + 1, 21);
  return getEditorialScenarioForHour(publicationHour);
}

function getScenarioScheduleAudit() {
  const scenarios = {};
  const hours = new Map();
  for (const scenario of Object.values(EDITORIAL_SCENARIOS)) {
    const queueHour = Number(scenario.queueHour);
    const collision = hours.has(queueHour);
    if (!hours.has(queueHour)) hours.set(queueHour, []);
    hours.get(queueHour).push(scenario.id);
    scenarios[scenario.id] = {
      scheduleWindow: { start: queueHour, end: queueHour + 1, scenarioIds: [scenario.id] },
      hasHourCollision: collision,
      isOrphanScenario: !Number.isFinite(queueHour),
    };
  }
  for (const ids of hours.values()) {
    if (ids.length < 2) continue;
    for (const id of ids) {
      scenarios[id].hasHourCollision = true;
      scenarios[id].scheduleWindow.scenarioIds = [...ids];
    }
  }
  return { timezone: EDITORIAL_SCHEDULE_TIMEZONE, scenarios };
}

module.exports = {
  MARKETPLACES,
  EDITORIAL_SCHEDULE_TIMEZONE,
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_IDS,
  QUEUE_BY_HOUR,
  getEditorialScenarioById,
  getEditorialScenarioForHour,
  getEditorialScenarioForDiscoveryHour,
  getScenarioScheduleAudit,
  EXPECTED_PUBLICATION_HOURS,
  EXPECTED_DISCOVERY_HOURS,
  validateEditorialSchedule,
  assertEditorialScheduleValid,
};
