'use strict';

const { EDITORIAL_SCENARIOS } = require('./editorial-scenario-config.cjs');

const AMAZON_ALIASES = Object.freeze({
  casa_cozinha_editorial: ['jogo de cama', 'toalha de banho', 'cafeteira elétrica', 'air fryer', 'batedeira', 'aspirador vertical', 'forno elétrico', 'grill elétrico', 'chaleira elétrica', 'mixer', 'máquina de café'],
  organizacao_editorial: ['organizador', 'caixa organizadora', 'cesto organizador', 'cabide', 'lixeira', 'organizador de gaveta', 'organizador de armário', 'estante organizadora', 'prateleira organizadora', 'organizador de banheiro'],
  ferramentas_editorial: ['furadeira', 'parafusadeira', 'kit ferramentas', 'ferramenta elétrica', 'trena', 'esmerilhadeira', 'martelete', 'serra circular', 'serra tico-tico', 'chave de impacto', 'lixadeira'],
  informatica_editorial: ['notebook', 'computador', 'monitor', 'impressora', 'ssd', 'roteador', 'mini pc', 'all in one', 'scanner', 'nobreak', 'switch de rede'],
  celulares_editorial: ['smartphone', 'celular desbloqueado', 'iphone', 'samsung galaxy smartphone', 'xiaomi redmi smartphone', 'poco smartphone', 'celular motorola', 'realme smartphone'],
  beleza_editorial: ['protetor solar facial', 'hidratante facial', 'shampoo', 'secador', 'perfume', 'maquiagem', 'aparador', 'máquina de cortar cabelo', 'modelador', 'escova alisadora', 'depilador'],
  moda_editorial: ['camiseta masculina', 'camisa', 'calça jeans', 'tênis masculino', 'bolsa', 'relógio', 'jaqueta', 'vestido', 'mochila', 'tênis feminino', 'calça social'],
  esporte_editorial: ['tênis de corrida', 'whey protein', 'creatina', 'tapete de yoga', 'halter', 'corda de pular', 'kettlebell', 'banco de musculação', 'bicicleta ergométrica', 'esteira', 'bicicleta'],
  pet_editorial: ['ração para cachorro', 'ração para gato', 'cama pet', 'brinquedo pet', 'areia para gato', 'coleira', 'bebedouro automático', 'comedouro automático', 'fonte pet', 'arranhador', 'caixa de areia fechada', 'casinha pet'],
  // Cenários naturalmente caros recebem também intenções de entrada da mesma vertical.
  // Não há quota por ticket: o ranking continua escolhendo por mérito comercial.
  tv_audio_editorial: ['smart tv', 'televisão 4k', 'soundbar', 'caixa de som', 'caixa de som bluetooth', 'fone bluetooth', 'headphone', 'projetor', 'smart tv oled', 'smart tv qled', 'caixa bluetooth', 'receiver', 'amplificador', 'monitor smart'],
  eletrodomesticos_editorial: ['geladeira', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'aspirador', 'forno elétrico', 'coifa', 'depurador', 'frigobar', 'adega climatizada'],
  moveis_editorial: ['sofá', 'guarda-roupa', 'cama', 'colchão', 'mesa de jantar', 'rack para tv', 'mesa lateral', 'escrivaninha compacta', 'poltrona', 'estante', 'painel tv', 'mesa de centro', 'mesa escritório'],
  grandes_ofertas_editorial: ['smartphone', 'fone bluetooth', 'air fryer', 'aspirador', 'monitor', 'notebook', 'smart tv', 'geladeira', 'lavadora', 'liquidificador', 'caixa de som', 'fone', 'iphone', 'samsung galaxy smartphone'],
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
    allowedProductTerms: [...source.allowedProductTerms],
  }];
}));

module.exports = { SCENARIOS, AMAZON_ALIASES };
