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

module.exports = { SCENARIOS };
