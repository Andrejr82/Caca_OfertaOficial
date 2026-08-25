'use strict';

const { EDITORIAL_SCENARIOS } = require('./editorial-scenario-config.cjs');
const { buildCommercialScenarioMap } = require('./commercial-niche-scenario-bridge.cjs');

// Compatibilidade somente para os cenários ainda ativos. Os 7 nichos comerciais
// usam a configuração canônica; aliases não reativam cenários descontinuados.
const AMAZON_ALIASES = Object.freeze({
  casa_cozinha_editorial: ['jogo de cama', 'toalha de banho', 'cafeteira elétrica', 'air fryer', 'batedeira', 'aspirador vertical', 'forno elétrico', 'grill elétrico', 'chaleira elétrica', 'mixer', 'máquina de café'],
  ferramentas_editorial: ['furadeira', 'parafusadeira', 'kit ferramentas', 'ferramenta elétrica', 'trena', 'esmerilhadeira', 'martelete', 'serra circular', 'serra tico-tico', 'chave de impacto', 'lixadeira'],
  informatica_editorial: ['notebook', 'computador', 'monitor', 'impressora', 'ssd', 'roteador', 'mini pc', 'all in one', 'scanner', 'nobreak', 'switch de rede'],
  beleza_editorial: ['protetor solar facial', 'hidratante facial', 'shampoo', 'secador', 'perfume', 'maquiagem', 'aparador', 'máquina de cortar cabelo', 'modelador', 'escova alisadora', 'depilador'],
  moda_editorial: ['camiseta masculina', 'camisa', 'calça jeans', 'tênis masculino', 'bolsa', 'relógio', 'jaqueta', 'vestido', 'mochila', 'tênis feminino', 'calça social'],
  pet_editorial: ['ração para cachorro', 'ração para gato', 'cama pet', 'brinquedo pet', 'areia para gato', 'coleira', 'bebedouro automático', 'comedouro automático', 'fonte pet', 'arranhador', 'caixa de areia fechada', 'casinha pet'],
  eletrodomesticos_editorial: ['geladeira', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'aspirador', 'forno elétrico', 'coifa', 'depurador', 'frigobar', 'adega climatizada'],
  cupons_aprovados_editorial: [],
});

const AMAZON_GENERIC_PROMO_QUERIES = new Set(['oferta', 'desconto', 'promoção', 'mais vendido', 'frete grátis']);
const COMMERCIAL_SCENARIOS = buildCommercialScenarioMap(EDITORIAL_SCENARIOS, 'Amazon');

const SCENARIOS = Object.fromEntries(Object.entries(COMMERCIAL_SCENARIOS).map(([id, source]) => {
  const isCommercialNiche = Boolean(source.commercialNiche);
  const sourceKeywords = id === 'grandes_ofertas_editorial'
    ? source.keywords.filter((keyword) => !AMAZON_GENERIC_PROMO_QUERIES.has(String(keyword).trim().toLowerCase()))
    : source.keywords;

  const keywords = isCommercialNiche
    ? sourceKeywords
    : [...new Set([...(AMAZON_ALIASES[id] || []), ...sourceKeywords])];

  return [id, {
    ...source,
    label: `${source.name} — Amazon Brasil`,
    keywords: [...new Set(keywords)],
    apiCategories: [...(source.amazonBrowseNodes || source.browseNodeIds || [])],
    browseNodeIds: [...(source.amazonBrowseNodes || source.browseNodeIds || [])],
    allowedProductTerms: [...source.allowedProductTerms],
  }];
}));

module.exports = { SCENARIOS, AMAZON_ALIASES };
