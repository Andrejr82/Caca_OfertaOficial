const SCENARIOS = {
  eletronicos: {
    label: 'Eletrônicos — cobertura completa',
    keywords: [
      'smartphone', 'celular', 'iPhone', 'Galaxy', 'Redmi', 'carregador', 'power bank',
      'notebook', 'computador', 'tablet', 'monitor', 'impressora', 'teclado', 'mouse',
      'webcam', 'SSD', 'HD externo', 'roteador',
      'smart TV', 'televisão 4K', 'projetor', 'TV Box',
      'fone Bluetooth', 'headphone', 'headset gamer', 'caixa de som', 'soundbar', 'home theater',
      'smartwatch', 'smartband', 'Kindle Paperwhite', 'e-reader',
      'PlayStation', 'Xbox Series X', 'Nintendo Switch', 'console', 'controle gamer',
      'câmera digital', 'action cam', 'drone', 'câmera de segurança',
      'Alexa', 'Echo', 'lâmpada inteligente', 'tomada inteligente',
      'cabos', 'hubs', 'suportes', 'adaptadores'
    ]
  },
  eletros_cozinha: {
    label: 'Eletros de Cozinha',
    keywords: [
      // A Amazon indexa essas duas intenções por aliases mais curtos.
      'cafeteira', 'cafeteira expresso', 'batedeira planetária', 'batedeira elétrica',
      'liquidificador', 'air fryer', 'mixer 3 em 1', 'sanduicheira elétrica', 'chaleira elétrica',
      'panela elétrica', 'processador alimentos', 'forno elétrico', 'pipoqueira elétrica',
      'cozedor de ovos', 'espremedor elétrico', 'mini processador elétrico',
      'panela de pressão elétrica', 'multiprocessador', 'processador triturador',
      'fritadeira sem óleo', 'sanduicheira grill', 'sanduicheira waffles', 'waffle maker',
      'batedeira de mão'
    ]
  }
};

// Os demais cenários usam a Shopee como espelho de intenção. A estrutura é
// compartilhada aqui para que Amazon e Mercado Livre não tenham listas
// divergentes; aliases específicos podem ser adicionados posteriormente.
const { SCENARIOS: SHOPEE_SCENARIOS } = require('./shopee-scenario-config.cjs');
for (const [id, scenario] of Object.entries(SHOPEE_SCENARIOS)) {
  if (SCENARIOS[id]) continue;
  SCENARIOS[id] = { label: `${scenario.name} — cobertura por intenção`, keywords: [...scenario.keywords] };
}
SCENARIOS.enxoval_casamento.keywords.push('jogo de panelas', 'panelas antiaderentes');

// Aliases de busca próprios da taxonomia textual da Amazon Brasil. Não usar
// automaticamente os termos Shopee: cada cenário mantém intenção comercial
// equivalente, mas a consulta é adaptada ao vocabulário encontrado no HTML
// público da Amazon.
const AMAZON_INTENT_TERMS = {
  eletronicos: ['smartphone', 'notebook', 'tablet', 'monitor', 'smart tv', 'fone bluetooth', 'smartwatch', 'console', 'câmera digital', 'alexa'],
  tecnologia_desejo: ['celular desbloqueado', 'notebook', 'tablet', 'fone sem fio', 'smartwatch', 'smart tv', 'kindle'],
  gamer_tecnologia: ['pc gamer', 'placa de vídeo', 'monitor gamer', 'teclado mecânico', 'mouse gamer', 'headset gamer', 'console', 'cadeira gamer'],
  eletros_cozinha: ['cafeteira elétrica', 'air fryer', 'liquidificador', 'batedeira', 'mixer', 'sanduicheira', 'chaleira elétrica', 'processador de alimentos'],
  eletrodomesticos_cozinha: ['geladeira', 'freezer', 'fogão', 'cooktop', 'micro-ondas', 'máquina de lavar', 'lava-louças', 'forno elétrico'],
  enxoval_casamento: ['jogo de cama', 'lençol casal', 'edredom', 'toalha de banho', 'jogo de toalhas', 'aparelho de jantar', 'faqueiro', 'organizador de cozinha'],
  morando_sozinho: ['air fryer', 'mop', 'sanduicheira', 'varal de chão', 'ferro de passar', 'lixeira', 'organizador', 'aspirador vertical'],
  casa_moveis: ['sofá', 'guarda-roupa', 'cama', 'colchão', 'mesa de jantar', 'escrivaninha', 'cadeira de escritório', 'rack para tv'],
  impulso_casa: ['organizador', 'luminária', 'lixeira', 'cafeteira compacta', 'balança digital', 'utensílio de cozinha', 'produto de limpeza'],
  treino_academia: ['tênis de corrida', 'halter', 'whey protein', 'creatina', 'tapete de yoga', 'corda de pular', 'faixa elástica', 'roupa fitness'],
  viagem_aventura: ['mala de bordo', 'organizador de mala', 'mochila de trilha', 'barraca de camping', 'saco de dormir', 'lanterna', 'cadeira de praia'],
  mae_de_primeira_viagem: ['fralda', 'lenço umedecido', 'mamadeira', 'carrinho de bebê', 'berço portátil', 'banheira de bebê', 'bolsa maternidade', 'babá eletrônica'],
  dono_de_pet: ['tapete higiênico cachorro', 'ração para cachorro', 'ração para gato', 'cama para cachorro', 'brinquedo para cachorro', 'areia para gato', 'coleira', 'caixa de transporte pet'],
  pet_bebe: ['ração para cachorro', 'cama para cachorro', 'brinquedo pet', 'fralda de bebê', 'mamadeira', 'carrinho de bebê'],
  moda_masculina: ['camiseta masculina', 'camisa masculina', 'bermuda masculina', 'calça masculina', 'tênis masculino', 'sapato masculino', 'moletom masculino', 'carteira masculina'],
  beleza_autocuidado: ['protetor solar facial', 'serum facial', 'shampoo', 'secador de cabelo', 'chapinha', 'perfume', 'maquiagem', 'escova secadora'],
  acessorios_relogios: ['relógio masculino', 'smartwatch', 'óculos de sol', 'colar', 'anel', 'pulseira', 'boné', 'mochila'],
  moda_fitness_beleza_viagem: ['camiseta masculina', 'tênis de corrida', 'protetor solar', 'mala de bordo'],
};

for (const [scenarioId, terms] of Object.entries(AMAZON_INTENT_TERMS)) {
  if (SCENARIOS[scenarioId]) SCENARIOS[scenarioId] = { ...SCENARIOS[scenarioId], keywords: terms };
}

module.exports = { SCENARIOS };
