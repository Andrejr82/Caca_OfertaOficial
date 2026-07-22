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

// 2. Roteamento Inteligente por Horário
function getSaoPauloHour(date = new Date()) {
  return Number(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    hourCycle: 'h23'
  }).format(date));
}

function getActiveScenario(currentHour) {
  // O cron do Oracle inicia cada uma das janelas configuradas abaixo.
  
  if (currentHour >= 0 && currentHour < 4) {
    return SCENARIOS.gamer_tecnologia; // Madrugada Tech
  }
  if (currentHour >= 4 && currentHour < 7) {
    return SCENARIOS.treino_academia; // Manhã Treino
  }
  if (currentHour >= 7 && currentHour < 9) {
    return SCENARIOS.mae_de_primeira_viagem; // Manhã Bebê
  }
  if (currentHour >= 9 && currentHour < 12) {
    return SCENARIOS.viagem_aventura; // Manhã Viagem
  }
  if (currentHour >= 12 && currentHour < 13) {
    return SCENARIOS.beleza_autocuidado; // Tarde Beleza
  }
  if (currentHour >= 13 && currentHour < 14) {
    return SCENARIOS.eletros_cozinha; // Tarde Eletros de Cozinha
  }
  if (currentHour >= 14 && currentHour < 16) {
    return SCENARIOS.dono_de_pet; // Tarde Pet
  }
  if (currentHour >= 16 && currentHour < 18) {
    return SCENARIOS.acessorios_relogios; // Tarde Acessórios
  }
  if (currentHour >= 18 && currentHour < 20) {
    return SCENARIOS.morando_sozinho; // Noite Casa
  }
  if (currentHour >= 20 && currentHour < 22) {
    return SCENARIOS.moda_masculina; // Noite Moda
  }
  if (currentHour >= 22) {
    return SCENARIOS.enxoval_casamento; // Noite Enxoval
  }
  
  return SCENARIOS.dono_de_pet;
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
  const blocked = (scenario?.blockedProductTerms || []).some((term) => normalizedTitle.includes(normalizeProductTitle(term)));
  if (blocked) return false;
  const allowedTerms = scenario?.allowedProductTerms || [];
  if (allowedTerms.length > 0) return allowedTerms.some((term) => normalizedTitle.includes(normalizeProductTitle(term)));

  // Cenários amplos usam categorias API como descoberta, mas o título ainda
  // precisa confirmar a intenção. Exigimos a frase inteira ou pelo menos dois
  // tokens relevantes da intenção (um token quando a intenção é unitária).
  const stopwords = new Set(['para', 'com', 'sem', 'de', 'da', 'do', 'das', 'dos', 'e', 'em', 'kit', 'tipo', 'mais']);
  const keywords = Array.isArray(scenario?.keywords) ? scenario.keywords : [];
  return keywords.some((keyword) => {
    const normalizedKeyword = normalizeProductTitle(keyword);
    if (!normalizedKeyword) return false;
    if (normalizedTitle.includes(normalizedKeyword)) return true;
    const tokens = normalizedKeyword.split(' ').filter((token) => token.length >= 4 && !stopwords.has(token));
    if (!tokens.length) return false;
    const matches = tokens.filter((token) => normalizedTitle.includes(token)).length;
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
  getRandomItems,
  normalizeProductTitle,
  matchesScenarioProduct,
  extractProductModelKey
};
