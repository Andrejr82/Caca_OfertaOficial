'use strict';

const { EDITORIAL_SCENARIOS } = require('./editorial-scenario-config.cjs');

const AMAZON_ALIASES = Object.freeze({
  casa_cozinha_editorial: ['jogo de cama', 'toalha de banho', 'cafeteira elétrica', 'air fryer', 'batedeira'],
  organizacao_editorial: ['organizador', 'caixa organizadora', 'cesto organizador', 'cabide', 'lixeira'],
  ferramentas_editorial: ['furadeira', 'parafusadeira', 'kit ferramentas', 'ferramenta elétrica', 'trena'],
  informatica_editorial: ['notebook', 'computador', 'monitor', 'impressora', 'ssd', 'roteador'],
  celulares_editorial: ['smartphone', 'celular desbloqueado', 'iphone', 'galaxy'],
  beleza_editorial: ['protetor solar facial', 'hidratante facial', 'shampoo', 'secador', 'perfume', 'maquiagem'],
  moda_editorial: ['camiseta masculina', 'camisa', 'calça jeans', 'tênis masculino', 'bolsa', 'relógio'],
  esporte_editorial: ['tênis de corrida', 'whey protein', 'creatina', 'tapete de yoga', 'halter', 'corda de pular'],
  pet_editorial: ['ração para cachorro', 'ração para gato', 'cama pet', 'brinquedo pet', 'areia para gato', 'coleira'],
  // Cenários naturalmente caros recebem também intenções de entrada da mesma vertical.
  // Não há quota por ticket: o ranking continua escolhendo por mérito comercial.
  tv_audio_editorial: ['smart tv', 'televisão 4k', 'soundbar', 'caixa de som', 'caixa de som bluetooth', 'fone bluetooth', 'headphone', 'projetor'],
  eletrodomesticos_editorial: ['geladeira', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'air fryer', 'cafeteira', 'liquidificador', 'ventilador', 'aspirador vertical'],
  moveis_editorial: ['sofá', 'guarda-roupa', 'cama', 'colchão', 'mesa de jantar', 'rack para tv', 'mesa lateral', 'escrivaninha compacta', 'prateleira', 'banqueta', 'sapateira'],
  grandes_ofertas_editorial: ['smartphone', 'fone bluetooth', 'air fryer', 'cafeteira', 'aspirador', 'monitor', 'notebook', 'smart tv', 'geladeira'],
  cupons_aprovados_editorial: [],
});

const AMAZON_GENERIC_PROMO_QUERIES = new Set(['oferta', 'desconto', 'promoção', 'mais vendido', 'frete grátis']);

const SCENARIOS = Object.fromEntries(Object.entries(EDITORIAL_SCENARIOS).map(([id, source]) => {
  const sourceKeywords = id === 'grandes_ofertas_editorial'
    ? source.keywords.filter((keyword) => !AMAZON_GENERIC_PROMO_QUERIES.has(String(keyword).trim().toLowerCase()))
    : source.keywords;

  return [id, {
    ...source,
    label: `${source.name} — Amazon Brasil`,
    keywords: [...new Set([...(AMAZON_ALIASES[id] || []), ...sourceKeywords])],
    apiCategories: [...source.amazonBrowseNodes],
    browseNodeIds: [...source.amazonBrowseNodes],
    allowedProductTerms: [...new Set([...(AMAZON_ALIASES[id] || []), ...source.allowedProductTerms])],
  }];
}));

module.exports = { SCENARIOS, AMAZON_ALIASES };
