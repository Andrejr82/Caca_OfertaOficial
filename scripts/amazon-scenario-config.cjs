'use strict';

const { EDITORIAL_SCENARIOS } = require('./editorial-scenario-config.cjs');

const AMAZON_ALIASES = Object.freeze({
  casa_cozinha_editorial: ['jogo de cama', 'toalha de banho', 'cafeteira elétrica', 'air fryer', 'batedeira'],
  organizacao_editorial: ['organizador', 'caixa organizadora', 'cesto organizador', 'cabide', 'lixeira'],
  ferramentas_editorial: ['furadeira', 'parafusadeira', 'kit ferramentas', 'ferramenta elétrica', 'trena'],
  informatica_editorial: ['notebook', 'computador', 'monitor', 'impressora', 'ssd', 'roteador'],
  celulares_editorial: ['smartphone', 'celular desbloqueado', 'iphone', 'galaxy', 'carregador turbo', 'power bank'],
  beleza_editorial: ['protetor solar facial', 'hidratante facial', 'shampoo', 'secador', 'perfume', 'maquiagem'],
  moda_editorial: ['camiseta masculina', 'camisa', 'calça jeans', 'tênis masculino', 'bolsa', 'relógio'],
  esporte_editorial: ['tênis de corrida', 'whey protein', 'creatina', 'tapete de yoga', 'halter', 'corda de pular'],
  pet_editorial: ['ração para cachorro', 'ração para gato', 'cama pet', 'brinquedo pet', 'areia para gato', 'coleira'],
  automotivo_editorial: ['acessório automotivo', 'tapete carro', 'lâmpada automotiva', 'som automotivo', 'carregador veicular'],
  games_editorial: ['console', 'playstation', 'xbox', 'nintendo switch', 'controle gamer', 'jogo ps5'],
  tv_audio_editorial: ['smart tv', 'televisão 4k', 'soundbar', 'caixa de som', 'fone bluetooth', 'projetor'],
  eletrodomesticos_editorial: ['geladeira', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar'],
  moveis_editorial: ['sofá', 'guarda-roupa', 'cama', 'colchão', 'mesa de jantar', 'rack para tv'],
  grandes_ofertas_editorial: ['oferta', 'desconto', 'mais vendido', 'frete grátis'],
  cupons_aprovados_editorial: [],
});

const SCENARIOS = Object.fromEntries(Object.entries(EDITORIAL_SCENARIOS).map(([id, source]) => [id, {
    ...source,
    label: `${source.name} — Amazon Brasil`,
    keywords: [...new Set([...(AMAZON_ALIASES[id] || []), ...source.keywords])],
    apiCategories: [...source.amazonBrowseNodes],
    browseNodeIds: [...source.amazonBrowseNodes],
    allowedProductTerms: [...new Set([...(AMAZON_ALIASES[id] || []), ...source.allowedProductTerms])],
  }]));

module.exports = { SCENARIOS, AMAZON_ALIASES };
