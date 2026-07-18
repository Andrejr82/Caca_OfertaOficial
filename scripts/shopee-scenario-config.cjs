'use strict';

// 1. Definição dos Mega Bancos (Scenarios)
const SCENARIOS = {
  mae_de_primeira_viagem: {
    id: 'mae_de_primeira_viagem',
    productCatId: 100001,
    name: 'Mãe de Primeira Viagem',
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
    productCatId: 100002,
    name: 'Dono de Pet',
    keywords: [
      'tapete higiênico cachorro', 'ração premium', 'tira pelos pet', 'bebedouro fonte gato', 
      'brinquedo pet interativo', 'caminha para cachorro', 'areia higiênica gato', 'arranhador gato', 
      'coleira peitoral', 'shampoo pet', 'escova rasqueadeira', 'bolsa de transporte pet', 
      'comedouro lento cachorro', 'pazinha areia gato', 'caixa de areia fechada gato', 
      'casinha cachorro plástico', 'roupinha pet inverno', 'cinto segurança cachorro carro', 
      'capa banco carro pet', 'petisco cachorro natural', 'sachê gato atacado', 'cortador unha pet', 
      'toalha banho pet super absorvente', 'brinquedo corda cachorro', 'erva de gato catnip'
    ]
  },
  morando_sozinho: {
    id: 'morando_sozinho',
    productCatId: 100003,
    name: 'Morando Sozinho',
    keywords: [
      'air fryer', 'mop giratório', 'sanduicheira elétrica', 'chaleira elétrica', 'forro de papel airfryer', 
      'esfregão de limpeza', 'varal de chão', 'tábua de passar', 'ferro de passar', 'kit ferramentas básico', 
      'abridor de vinho elétrico', 'filtro de água barro', 'lixeira inox pedal', 'jogo de copos vidro', 
      'mixer triturador', 'panela elétrica arroz', 'escorredor pratos plástico', 'organizador sapatos', 
      'cabides veludo kit', 'balança digital cozinha', 'extensão elétrica', 'lâmpada led inteligente', 
      'cesto roupa suja flexível', 'pregadores roupa madeira', 'pano microfibra limpeza', 'rodo mágico abs', 
      'limpa vidros magnético', 'dispenser creme dental', 'organizador cabos', 'miniprocessador manual alho', 
      'ventilador mesa', 'aquecedor portátil', 'jogo lençol microfibra', 'toalha banho avulsa', 'vasilha plástico kit'
    ]
  },
  enxoval_casamento: {
    id: 'enxoval_casamento',
    productCatId: 100004,
    name: 'Enxoval de Casamento',
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
      'conjunto mantimentos', 'boleira vidro', 'cafeteira elétrica', 'ferro a vapor'
    ]
  }
};

// 2. Roteamento Inteligente por Horário
function getActiveScenario(currentHour) {
  // A cron do Oracle roda nos horários: 00h, 04h, 08h, 12h, 16h, 20h.
  // Mapeamos a hora (0 a 23) para o cenário mais aderente.
  
  if (currentHour >= 6 && currentHour < 11) {
    return SCENARIOS.mae_de_primeira_viagem;
  }
  
  if (currentHour >= 11 && currentHour < 15) {
    return SCENARIOS.dono_de_pet;
  }
  
  if (currentHour >= 15 && currentHour < 19) {
    return SCENARIOS.morando_sozinho;
  }
  
  if (currentHour >= 19 && currentHour <= 23) {
    return SCENARIOS.enxoval_casamento;
  }
  
  // Madrugada (00h, 04h) - Cenário Mistura (Achadinhos Virais)
  const allKeywords = Object.values(SCENARIOS).flatMap(s => s.keywords);
  return {
    id: 'achadinhos_virais',
    productCatId: 100005,
    name: 'Achadinhos Virais',
    keywords: allKeywords
  };
}

// 3. Função Auxiliar de Sorteio
function getRandomKeywords(scenario, count = 5) {
  const shuffled = [...scenario.keywords].sort(() => 0.5 - Math.random());
  return shuffled.slice(0, count);
}

module.exports = {
  SCENARIOS,
  getActiveScenario,
  getRandomKeywords
};
