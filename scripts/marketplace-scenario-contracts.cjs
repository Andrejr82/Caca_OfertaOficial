'use strict';

const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('./amazon-scenario-config.cjs');

const MARKETPLACES = Object.freeze(['Shopee', 'Amazon', 'Mercado Livre']);
const COMMON_BLOCKED = Object.freeze(['pet', 'cachorro', 'gato', 'ração']);

function contract(terms, categories, allowed, blocked = []) {
  const allowedNormalized = allowed.map(normalize);
  const blockedProductTerms = [...new Set([...COMMON_BLOCKED, ...blocked])]
    .filter((term) => !allowedNormalized.some((allowedTerm) => allowedTerm.includes(normalize(term))));
  return { terms, categories, allowedProductTerms: allowed, blockedProductTerms };
}

const EXPLICIT = {
  Shopee: {
    tecnologia_desejo: contract(['smartphone', 'celular', 'notebook', 'tablet', 'fone bluetooth', 'smartwatch'], [100013, 100634], ['celular', 'smartphone', 'notebook', 'tablet', 'fone', 'smartwatch'], ['pet', 'panela']),
    treino_academia: contract(['tênis corrida', 'legging fitness', 'halter', 'whey protein', 'tapete yoga', 'faixa elástica'], [100011], ['fitness', 'academia', 'corrida', 'halter', 'whey', 'yoga', 'legging'], ['pet', 'bebê', 'cozinha', 'tênis casual', 'sapato casual', 'tênis social', 'sapato social']),
    mae_de_primeira_viagem: contract(['fralda bebê', 'carrinho bebê', 'berço portátil', 'cadeirinha alimentação', 'manta bebê', 'bolsa maternidade'], [100632], ['bebê', 'bebe', 'maternidade', 'fralda', 'carrinho', 'berço', 'manta'], ['pet', 'fitness']),
    eletrodomesticos_cozinha: contract(['air fryer', 'cafeteira', 'liquidificador', 'panela elétrica', 'processador', 'cooktop'], [100010], ['air fryer', 'cafeteira', 'liquidificador', 'panela', 'processador', 'cooktop'], ['pet', 'fitness', 'acessório', 'cabo']),
    enxoval_casamento: contract(['jogo de cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha de banho', 'toalha de rosto', 'tapete banheiro', 'cortina', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador de cozinha'], [100010, 100636], ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'], ['fitness', 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa']),
    moda_masculina: contract(['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'], [100011], ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'], ['fitness', 'feminino', 'bebê']),
  },
  Amazon: {
    tecnologia_desejo: contract(['smartphone', 'celular desbloqueado', 'notebook', 'tablet', 'fone bluetooth', 'smartwatch'], [], ['celular', 'smartphone', 'notebook', 'tablet', 'fone', 'smartwatch'], ['pet', 'panela']),
    treino_academia: contract(['tênis de corrida', 'legging fitness', 'halter', 'whey protein', 'tapete de yoga', 'faixa elástica'], [], ['fitness', 'academia', 'corrida', 'halter', 'whey', 'yoga', 'legging'], ['pet', 'bebê', 'cozinha', 'tênis casual', 'sapato casual', 'tênis social', 'sapato social']),
    mae_de_primeira_viagem: contract(['fralda de bebê', 'carrinho de bebê', 'berço portátil', 'cadeira alimentação bebê', 'manta bebê', 'bolsa maternidade'], [], ['bebê', 'bebe', 'maternidade', 'fralda', 'carrinho', 'berço', 'manta'], ['pet', 'fitness']),
    eletrodomesticos_cozinha: contract(['air fryer', 'cafeteira elétrica', 'liquidificador', 'panela elétrica', 'processador alimentos', 'cooktop'], [], ['air fryer', 'cafeteira', 'liquidificador', 'panela', 'processador', 'cooktop'], ['pet', 'fitness', 'acessório', 'cabo']),
    enxoval_casamento: contract(['jogo de cama casal', 'lençol casal', 'fronha', 'edredom casal', 'cobertor', 'toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'tapete banheiro', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador cozinha'], [], ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'], ['fitness', 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa']),
    moda_masculina: contract(['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça jeans masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'], [], ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'], ['fitness', 'feminino', 'bebê']),
  },
  'Mercado Livre': {
    tecnologia_desejo: contract(['smartphone desbloqueado', 'celular', 'notebook', 'tablet', 'fone bluetooth', 'smartwatch'], [], ['celular', 'smartphone', 'notebook', 'tablet', 'fone', 'smartwatch'], ['pet', 'panela']),
    treino_academia: contract(['tênis para corrida', 'legging academia', 'halter', 'whey protein', 'tapete yoga', 'faixa elástica'], [], ['fitness', 'academia', 'corrida', 'halter', 'whey', 'yoga', 'legging'], ['pet', 'bebê', 'cozinha', 'tênis casual', 'sapato casual', 'tênis social', 'sapato social']),
    mae_de_primeira_viagem: contract(['fralda bebê', 'carrinho bebê', 'berço portátil', 'cadeira alimentação bebê', 'manta bebê', 'bolsa maternidade'], [], ['bebê', 'bebe', 'maternidade', 'fralda', 'carrinho', 'berço', 'manta'], ['pet', 'fitness']),
    eletrodomesticos_cozinha: contract(['air fryer', 'cafeteira', 'liquidificador', 'panela elétrica', 'processador de alimentos', 'cooktop'], [], ['air fryer', 'cafeteira', 'liquidificador', 'panela', 'processador', 'cooktop'], ['pet', 'fitness', 'acessório', 'cabo']),
    enxoval_casamento: contract(['jogo de cama casal', 'lençol casal', 'fronha avulsa', 'edredom casal', 'cobertor casal', 'toalha de banho', 'jogo de toalhas', 'tapete para banheiro', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador de cozinha'], [], ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'], ['fitness', 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa']),
    moda_masculina: contract(['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça jeans masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'], [], ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'], ['fitness', 'feminino', 'bebê']),
  },
};

// Completa contratos ausentes usando catálogo de cenário como base. Marketplace
// continua tendo adaptação própria nos contratos explícitos; sem contrato,
// aliases oficiais do cenário evitam fallback genérico.
for (const marketplace of MARKETPLACES) {
  for (const [scenarioId, scenario] of Object.entries(SHOPEE_SCENARIOS)) {
    if (EXPLICIT[marketplace][scenarioId]) continue;
    EXPLICIT[marketplace][scenarioId] = contract(
      [...(scenario.keywords || [])],
      [...(scenario.apiCategories || [])],
      [...new Set([...(scenario.allowedProductTerms || []), ...(scenario.keywords || [])])],
      [...(scenario.blockedProductTerms || [])],
    );
  }
}

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
}

// IDs observados nas árvores públicas do catálogo Amazon Brasil. Não são IDs
// inventados: são mantidos como evidência de origem pública e devem ser
// atualizados quando a Amazon alterar a árvore.
const AMAZON_BROWSE_NODES = Object.freeze({
  eletronicos: ['16209062011', '16243803011', '16243794011', '24035344011', '16243809011', '16243802011', '16243799011'],
  tecnologia_desejo: ['16243803011', '16243794011', '24035344011', '16243809011', '16243802011', '16243799011', '16243796011'],
  gamer_tecnologia: ['16364751011', '16364749011', '16364756011', '16253313011', '16253332011', '20971488011', '16253372011', '20971505011'],
  eletros_cozinha: ['17124722011', '17124716011', '24417675011'],
  eletrodomesticos_cozinha: ['16745371011', '17124786011', '16745366011', '16745370011', '19821156011'],
  enxoval_casamento: ['17100532011', '17100528011', '17100531011', '17100533011', '23783015011'],
  morando_sozinho: ['17100533011', '17100522011', '17124722011', '17124717011', '17124721011'],
  casa_moveis: ['17100553011', '17100552011', '17100547011', '17100554011', '17100548011'],
  impulso_casa: ['17100533011', '17406462011', '17124717011', '17124722011'],
  treino_academia: ['17833921011', '17833929011', '17833934011', '17833917011', '17716665011', '23577004011'],
  viagem_aventura: ['17833924011', '17716665011', '17681967011'],
  mae_de_primeira_viagem: ['17540055011', '17540060011', '17540063011', '17681968011'],
  dono_de_pet: ['19653951011', '19653950011', '19653948011', '19653949011'],
  pet_bebe: ['19653951011', '19653950011', '17540055011', '17540060011'],
  moda_masculina: ['17681970011', '17681966011', '23577004011'],
  beleza_autocuidado: ['16754345011', '16754346011', '16754347011', '16754350011', '16754349011'],
  acessorios_relogios: ['17681966011', '17681967011', '16243802011'],
  moda_fitness_beleza_viagem: ['17681970011', '23577004011', '17833917011', '16754345011', '17681967011'],
});

const AMAZON_BLOCKED_BY_SCENARIO = Object.freeze({
  eletronicos: ['pet', 'bebê', 'moda', 'cozinha'],
  tecnologia_desejo: ['pet', 'bebê', 'moda', 'cozinha'],
  gamer_tecnologia: ['pet', 'bebê', 'moda feminina'],
  eletros_cozinha: ['pet', 'bebê', 'beleza', 'acessório isolado'],
  eletrodomesticos_cozinha: ['pet', 'bebê', 'acessório isolado'],
  treino_academia: ['pet', 'bebê', 'tênis casual', 'sapato social'],
  dono_de_pet: ['bebê', 'moda', 'cozinha'],
  mae_de_primeira_viagem: ['pet', 'adulto', 'fitness'],
  pet_bebe: [],
  moda_masculina: ['pet', 'bebê', 'fitness feminino'],
  beleza_autocuidado: ['pet', 'bebê', 'alimento', 'suplemento'],
  viagem_aventura: ['pet', 'bebê', 'eletrônico isolado'],
});

const AMAZON_SCENARIO_SPLITS = Object.freeze({
  pet_bebe: ['dono_de_pet', 'mae_de_primeira_viagem'],
  moda_fitness_beleza_viagem: ['moda_masculina', 'treino_academia', 'beleza_autocuidado', 'viagem_aventura'],
});

const AMAZON_ATTRIBUTES_BY_SCENARIO = Object.freeze({
  eletronicos: { productTypes: ['smartphone', 'notebook', 'audio', 'tv', 'wearable', 'games', 'camera'], attributes: ['brand', 'model', 'memory', 'screen', 'connectivity'], priority: 'high' },
  tecnologia_desejo: { productTypes: ['smartphone', 'notebook', 'tablet', 'audio', 'tv', 'wearable'], attributes: ['brand', 'model', 'memory', 'screen', 'connectivity'], priority: 'high' },
  gamer_tecnologia: { productTypes: ['pc_gamer', 'gpu', 'monitor_gamer', 'peripheral', 'console'], attributes: ['brand', 'gpu', 'ram', 'platform', 'connection'], priority: 'high' },
  eletros_cozinha: { productTypes: ['coffee_maker', 'air_fryer', 'blender', 'mixer'], attributes: ['brand', 'model', 'power', 'capacity', 'voltage'], priority: 'high' },
  eletrodomesticos_cozinha: { productTypes: ['refrigerator', 'stove', 'microwave', 'washer', 'oven'], attributes: ['brand', 'model', 'capacity', 'dimensions', 'voltage'], priority: 'high' },
  enxoval_casamento: { productTypes: ['bedding', 'bath', 'tableware', 'organizer'], attributes: ['size', 'pieces', 'material', 'color'], priority: 'medium' },
  morando_sozinho: { productTypes: ['compact_appliance', 'cleaning', 'laundry', 'organizer'], attributes: ['capacity', 'dimensions', 'material', 'use'], priority: 'medium' },
  casa_moveis: { productTypes: ['bed', 'sofa', 'rack', 'table', 'chair'], attributes: ['material', 'dimensions', 'seats', 'color'], priority: 'medium' },
  impulso_casa: { productTypes: ['organizer', 'lighting', 'utility', 'cleaning'], attributes: ['material', 'size', 'quantity', 'voltage'], priority: 'medium' },
  treino_academia: { productTypes: ['running_shoe', 'fitness_clothing', 'weight', 'yoga', 'supplement'], attributes: ['size', 'weight', 'material', 'flavor', 'volume'], priority: 'high' },
  viagem_aventura: { productTypes: ['luggage', 'backpack', 'camping', 'outdoor'], attributes: ['capacity', 'dimensions', 'weight', 'resistance'], priority: 'medium' },
  mae_de_primeira_viagem: { productTypes: ['diaper', 'stroller', 'crib', 'feeding', 'hygiene'], attributes: ['age', 'size', 'weight', 'safety'], priority: 'high' },
  dono_de_pet: { productTypes: ['pet_food', 'bed', 'toy', 'transport', 'hygiene'], attributes: ['species', 'size', 'weight', 'material'], priority: 'high' },
  pet_bebe: { productTypes: ['pet', 'baby'], attributes: ['species', 'age', 'size', 'weight', 'safety'], priority: 'high' },
  moda_masculina: { productTypes: ['shirt', 'pants', 'shoe', 'accessory'], attributes: ['size', 'color', 'material', 'brand'], priority: 'medium' },
  beleza_autocuidado: { productTypes: ['skin_care', 'hair_care', 'makeup', 'perfume'], attributes: ['volume', 'skin_type', 'function', 'fragrance'], priority: 'high' },
  acessorios_relogios: { productTypes: ['watch', 'jewelry', 'bag', 'glasses'], attributes: ['material', 'size', 'gender', 'brand'], priority: 'medium' },
  moda_fitness_beleza_viagem: { productTypes: ['fashion', 'fitness', 'beauty', 'travel'], attributes: ['size', 'material', 'function', 'capacity'], priority: 'medium' },
});

// Torna todos os cenários Amazon explícitos, sem recorrer ao contrato de
// outro marketplace. Termos continuam derivados do catálogo Amazon atual,
// enquanto aliases específicos podem ser ampliados por cenário.
for (const [scenarioId, scenario] of Object.entries(AMAZON_SCENARIOS)) {
  const existing = EXPLICIT.Amazon[scenarioId];
  const terms = [...new Set([...(scenario.keywords || []), ...(existing?.terms || [])])];
  const allowed = [...new Set([...(scenario.allowedProductTerms || []), ...(existing?.allowedProductTerms || []), ...terms])];
  EXPLICIT.Amazon[scenarioId] = contract(
    terms,
    AMAZON_BROWSE_NODES[scenarioId] || existing?.categories || [],
    allowed,
    AMAZON_BLOCKED_BY_SCENARIO[scenarioId] || scenario.blockedProductTerms || existing?.blockedProductTerms || [],
  );
}

function getMarketplaceScenarioContract(scenarioId, marketplace) {
  if (!MARKETPLACES.includes(marketplace)) throw new Error('Marketplace não autorizado: ' + marketplace);
  const source = marketplace === 'Amazon' ? AMAZON_SCENARIOS : SHOPEE_SCENARIOS;
  const base = source[scenarioId] || SHOPEE_SCENARIOS[scenarioId];
  if (!base) return null;
  const explicit = EXPLICIT[marketplace]?.[scenarioId];
  const terms = explicit?.terms || [...(base.keywords || [])];
  return {
    ...base, id: scenarioId, scenarioId, marketplace,
    source: 'explicit_marketplace_contract',
    splitInto: marketplace === 'Amazon' ? [...(AMAZON_SCENARIO_SPLITS[scenarioId] || [])] : [],
    amazonIntelligence: marketplace === 'Amazon'
      ? (AMAZON_ATTRIBUTES_BY_SCENARIO[scenarioId] || { productTypes: [], attributes: [], priority: 'medium' })
      : null,
    terms: [...new Set(terms)], keywords: [...new Set(terms)],
    categories: [...(explicit?.categories || base.apiCategories || [])],
    apiCategories: [...(explicit?.categories || base.apiCategories || [])],
    // Amazon chama esses identificadores de browse nodes. Mantemos um nome
    // explícito para que o discovery não trate categoria pública como termo
    // textual ou gere IDs sintéticos.
    browseNodeIds: marketplace === 'Amazon'
      ? [...(explicit?.categories || base.apiCategories || [])].map(String)
      : [],
    allowedProductTerms: [...new Set([...(base.allowedProductTerms || []), ...(explicit?.allowedProductTerms || []), ...(base.keywords || [])])],
    blockedProductTerms: [...new Set(explicit?.blockedProductTerms || base.blockedProductTerms || [])],
  };
}

function matchesMarketplaceContract(contract, title) {
  const value = normalize(title);
  if (!value || !contract) return false;
  const containsTerm = (term) => {
    const normalizedTerm = normalize(term).replace(/[^a-z0-9]+/g, ' ').trim();
    return normalizedTerm && (` ${value.replace(/[^a-z0-9]+/g, ' ')} `).includes(` ${normalizedTerm} `);
  };
  if ((contract.blockedProductTerms || []).some(containsTerm)) return false;
  const allowed = contract.allowedProductTerms || [];
  return allowed.length === 0 || allowed.some(containsTerm);
}

module.exports = { MARKETPLACES, MARKETPLACE_CONTRACTS: EXPLICIT, getMarketplaceScenarioContract, matchesMarketplaceContract, AMAZON_SCENARIO_SPLITS, AMAZON_ATTRIBUTES_BY_SCENARIO };
