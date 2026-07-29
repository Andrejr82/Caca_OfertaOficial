'use strict';

const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
const { SCENARIOS: AMAZON_SCENARIOS } = require('./amazon-scenario-config.cjs');

const MARKETPLACES = Object.freeze(['Shopee', 'Amazon', 'Mercado Livre']);
const COMMON_BLOCKED = Object.freeze(['pet', 'cachorro', 'gato', 'ração', 'suplemento']);

function contract(terms, categories, allowed, blocked = []) {
  return { terms, categories, allowedProductTerms: allowed, blockedProductTerms: [...COMMON_BLOCKED, ...blocked] };
}

const EXPLICIT = {
  Shopee: {
    tecnologia_desejo: contract(['smartphone', 'celular', 'notebook', 'tablet', 'fone bluetooth', 'smartwatch'], [100013, 100634], ['celular', 'smartphone', 'notebook', 'tablet', 'fone', 'smartwatch'], ['pet', 'panela']),
    treino_academia: contract(['tênis corrida', 'legging fitness', 'halter', 'whey protein', 'tapete yoga', 'faixa elástica'], [100011], ['fitness', 'academia', 'corrida', 'halter', 'whey', 'yoga', 'legging'], ['pet', 'bebê', 'cozinha']),
    mae_de_primeira_viagem: contract(['fralda bebê', 'carrinho bebê', 'berço portátil', 'cadeirinha alimentação', 'manta bebê', 'bolsa maternidade'], [100632], ['bebê', 'bebe', 'maternidade', 'fralda', 'carrinho', 'berço', 'manta'], ['pet', 'fitness']),
    eletrodomesticos_cozinha: contract(['air fryer', 'cafeteira', 'liquidificador', 'panela elétrica', 'processador', 'cooktop'], [100010], ['air fryer', 'cafeteira', 'liquidificador', 'panela', 'processador', 'cooktop'], ['pet', 'fitness', 'acessório', 'cabo']),
    enxoval_casamento: contract(['jogo de cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha de banho', 'toalha de rosto', 'tapete banheiro', 'cortina', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador de cozinha'], [100010, 100636], ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'], ['fitness', 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa']),
    moda_masculina: contract(['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'], [100011], ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'], ['fitness', 'feminino', 'bebê']),
  },
  Amazon: {
    tecnologia_desejo: contract(['smartphone', 'celular desbloqueado', 'notebook', 'tablet', 'fone bluetooth', 'smartwatch'], [], ['celular', 'smartphone', 'notebook', 'tablet', 'fone', 'smartwatch'], ['pet', 'panela']),
    treino_academia: contract(['tênis de corrida', 'legging fitness', 'halter', 'whey protein', 'tapete de yoga', 'faixa elástica'], [], ['fitness', 'academia', 'corrida', 'halter', 'whey', 'yoga', 'legging'], ['pet', 'bebê', 'cozinha']),
    mae_de_primeira_viagem: contract(['fralda de bebê', 'carrinho de bebê', 'berço portátil', 'cadeira alimentação bebê', 'manta bebê', 'bolsa maternidade'], [], ['bebê', 'bebe', 'maternidade', 'fralda', 'carrinho', 'berço', 'manta'], ['pet', 'fitness']),
    eletrodomesticos_cozinha: contract(['air fryer', 'cafeteira elétrica', 'liquidificador', 'panela elétrica', 'processador alimentos', 'cooktop'], [], ['air fryer', 'cafeteira', 'liquidificador', 'panela', 'processador', 'cooktop'], ['pet', 'fitness', 'acessório', 'cabo']),
    enxoval_casamento: contract(['jogo de cama casal', 'lençol casal', 'fronha', 'edredom casal', 'cobertor', 'toalha de banho', 'toalha de rosto', 'jogo de toalhas', 'tapete banheiro', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador cozinha'], [], ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'], ['fitness', 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa']),
    moda_masculina: contract(['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça jeans masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'], [], ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'], ['fitness', 'feminino', 'bebê']),
  },
  'Mercado Livre': {
    tecnologia_desejo: contract(['smartphone desbloqueado', 'celular', 'notebook', 'tablet', 'fone bluetooth', 'smartwatch'], [], ['celular', 'smartphone', 'notebook', 'tablet', 'fone', 'smartwatch'], ['pet', 'panela']),
    treino_academia: contract(['tênis para corrida', 'legging academia', 'halter', 'whey protein', 'tapete yoga', 'faixa elástica'], [], ['fitness', 'academia', 'corrida', 'halter', 'whey', 'yoga', 'legging'], ['pet', 'bebê', 'cozinha']),
    mae_de_primeira_viagem: contract(['fralda bebê', 'carrinho bebê', 'berço portátil', 'cadeira alimentação bebê', 'manta bebê', 'bolsa maternidade'], [], ['bebê', 'bebe', 'maternidade', 'fralda', 'carrinho', 'berço', 'manta'], ['pet', 'fitness']),
    eletrodomesticos_cozinha: contract(['air fryer', 'cafeteira', 'liquidificador', 'panela elétrica', 'processador de alimentos', 'cooktop'], [], ['air fryer', 'cafeteira', 'liquidificador', 'panela', 'processador', 'cooktop'], ['pet', 'fitness', 'acessório', 'cabo']),
    enxoval_casamento: contract(['jogo de cama casal', 'lençol casal', 'fronha avulsa', 'edredom casal', 'cobertor casal', 'toalha de banho', 'jogo de toalhas', 'tapete para banheiro', 'jogo americano', 'mesa posta', 'pano de prato', 'organizador de cozinha'], [], ['cama', 'lençol', 'fronha', 'edredom', 'cobertor', 'toalha', 'banho', 'mesa', 'cozinha', 'cortina', 'tapete'], ['fitness', 'air fryer', 'liquidificador', 'panela elétrica', 'processador', 'bolsa']),
    moda_masculina: contract(['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça jeans masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'], [], ['masculino', 'homem', 'camisa', 'camiseta', 'bermuda', 'calça', 'tênis', 'sapato', 'moletom'], ['fitness', 'feminino', 'bebê']),
  },
};

function normalize(value) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
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
    terms: [...new Set(terms)], keywords: [...new Set(terms)],
    categories: [...(explicit?.categories || base.apiCategories || [])],
    apiCategories: [...(explicit?.categories || base.apiCategories || [])],
    allowedProductTerms: [...new Set(explicit?.allowedProductTerms || base.allowedProductTerms || [])],
    blockedProductTerms: [...new Set(explicit?.blockedProductTerms || base.blockedProductTerms || [])],
  };
}

function matchesMarketplaceContract(contract, title) {
  const value = normalize(title);
  if (!value || !contract) return false;
  if ((contract.blockedProductTerms || []).some((term) => value.includes(normalize(term)))) return false;
  const allowed = contract.allowedProductTerms || [];
  return allowed.length === 0 || allowed.some((term) => value.includes(normalize(term)));
}

module.exports = { MARKETPLACES, MARKETPLACE_CONTRACTS: EXPLICIT, getMarketplaceScenarioContract, matchesMarketplaceContract };
