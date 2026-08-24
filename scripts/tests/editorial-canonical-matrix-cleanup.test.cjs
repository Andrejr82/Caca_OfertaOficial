'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  EDITORIAL_SCENARIOS,
  EDITORIAL_SCENARIO_IDS,
  getEditorialScenarioById,
} = require('../editorial-scenario-config.cjs');

const {
  AMAZON_ALIASES,
  SCENARIOS: AMAZON_SCENARIOS,
} = require('../amazon-scenario-config.cjs');

const {
  SCENARIOS: SHOPEE_SCENARIOS,
} = require('../shopee-scenario-config.cjs');

const {
  SEARCH_ALIASES: ML_ALIASES,
} = require('../mercadolivre-official-intents-v5.cjs');

const {
  MARKETPLACES,
  getMarketplaceScenarioContract,
  matchesMarketplaceContract,
} = require('../marketplace-scenario-contracts.cjs');

const {
  getMarketplaceTerms,
} = require('../marketplace-intent-map.cjs');

test('A) Nenhum marketplace adiciona família fora do cenário canônico', () => {
  for (const scenarioId of EDITORIAL_SCENARIO_IDS) {
    const canonical = EDITORIAL_SCENARIOS[scenarioId];
    for (const marketplace of MARKETPLACES) {
      const contract = getMarketplaceScenarioContract(scenarioId, marketplace);
      assert.ok(contract, `Contrato ausente para ${marketplace}/${scenarioId}`);
      // As allowedProductTerms do contrato de marketplace devem respeitar estritamente a matriz canônica
      for (const term of contract.allowedProductTerms) {
        assert.ok(
          canonical.allowedProductTerms.includes(term) || canonical.keywords.includes(term),
          `Marketplace ${marketplace} introduziu termo '${term}' fora do canônico em ${scenarioId}`
        );
      }
    }
  }
});

test('B) Celulares: aceitar smartphones específicos e proibir termos genéricos autônomos', () => {
  const celulares = EDITORIAL_SCENARIOS.celulares_editorial;
  
  // Não devem existir como queries autônomas nem como allowedProductTerms genéricos
  const forbiddenAutonomous = ['galaxy', 'redmi', 'poco', 'motorola', 'realme'];
  for (const term of forbiddenAutonomous) {
    assert.ok(
      !celulares.keywords.includes(term),
      `celulares_editorial não deve ter keyword autônoma '${term}'`
    );
    assert.ok(
      !celulares.allowedProductTerms.includes(term),
      `celulares_editorial não deve ter allowedProductTerm autônomo '${term}'`
    );
  }

  // Devem estar presentes os refinamentos
  const expectedRefined = [
    'samsung galaxy smartphone',
    'xiaomi redmi smartphone',
    'poco smartphone',
    'celular motorola',
    'realme smartphone',
    'smartphone',
    'celular',
    'iphone'
  ];
  for (const term of expectedRefined) {
    assert.ok(
      celulares.keywords.includes(term),
      `celulares_editorial deve conter keyword '${term}'`
    );
    assert.ok(
      celulares.allowedProductTerms.includes(term),
      `celulares_editorial deve conter allowedProductTerm '${term}'`
    );
  }

  // Em todos os marketplaces, termos do intent map não devem ter as palavras soltas
  for (const marketplace of MARKETPLACES) {
    const terms = getMarketplaceTerms('celulares_editorial', marketplace);
    for (const forbidden of forbiddenAutonomous) {
      assert.ok(
        !terms.includes(forbidden),
        `${marketplace} não deve conter keyword autônoma '${forbidden}' em celulares_editorial`
      );
    }
  }

  // Testar matching de produtos reais
  for (const marketplace of MARKETPLACES) {
    const contract = getMarketplaceScenarioContract('celulares_editorial', marketplace);
    assert.ok(matchesMarketplaceContract(contract, 'Samsung Galaxy Smartphone S23 5G 128GB'));
    assert.ok(matchesMarketplaceContract(contract, 'Xiaomi Redmi Smartphone Note 12 128GB'));
    assert.ok(matchesMarketplaceContract(contract, 'Poco Smartphone X5 Pro 5G 256GB'));
    assert.ok(matchesMarketplaceContract(contract, 'Celular Motorola Moto G54 5G 256GB'));
    assert.ok(matchesMarketplaceContract(contract, 'Realme Smartphone C55 256GB'));
    assert.ok(matchesMarketplaceContract(contract, 'Apple iPhone 15 128GB'));
  }
});

test('C) Amazon celulares: browse node 16243802011 ausente', () => {
  const celulares = EDITORIAL_SCENARIOS.celulares_editorial;
  assert.ok(!celulares.amazonBrowseNodes.includes('16243802011'), '16243802011 não deve estar em celulares.amazonBrowseNodes');

  const amazonContract = getMarketplaceScenarioContract('celulares_editorial', 'Amazon');
  assert.ok(!amazonContract.browseNodeIds.includes('16243802011'), '16243802011 não deve estar em amazonContract.browseNodeIds');
  assert.ok(!amazonContract.categories.includes('16243802011'), '16243802011 não deve estar em amazonContract.categories');
});

test('D) allowedProductTerms genéricos removidos e E) Substitutos específicos presentes', () => {
  const removals = [
    { scenarioId: 'casa_cozinha_editorial', removed: ['cama', 'jantar'], added: ['jogo de cama', 'aparelho de jantar'] },
    { scenarioId: 'ferramentas_editorial', removed: ['ferramenta', 'chave'], added: ['kit ferramentas', 'ferramenta elétrica', 'chave de fenda'] },
    { scenarioId: 'informatica_editorial', removed: ['hd'], added: ['hd externo'] },
    { scenarioId: 'beleza_editorial', removed: ['escova'], added: ['escova secadora', 'escova alisadora'] },
    { scenarioId: 'esporte_editorial', removed: ['corrida', 'fitness', 'yoga', 'corda', 'academia'], added: ['tênis de corrida', 'legging fitness', 'tapete de yoga', 'corda de pular', 'luva academia'] },
    { scenarioId: 'pet_editorial', removed: ['areia', 'transporte pet'], added: ['areia gato', 'caixa transporte pet'] },
    { scenarioId: 'grandes_ofertas_editorial', removed: ['console', 'galaxy'], added: ['samsung galaxy smartphone'] },
  ];

  for (const { scenarioId, removed, added } of removals) {
    const canonical = EDITORIAL_SCENARIOS[scenarioId];
    for (const term of removed) {
      assert.ok(
        !canonical.allowedProductTerms.includes(term),
        `${scenarioId} não deve conter o termo genérico '${term}' em allowedProductTerms`
      );
    }
    for (const term of added) {
      assert.ok(
        canonical.allowedProductTerms.includes(term),
        `${scenarioId} deve conter o substituto específico '${term}' em allowedProductTerms`
      );
    }
  }
});

test('F) Amazon aliases extras removidos conforme matriz', () => {
  // Eletrodomésticos
  const eletro = AMAZON_ALIASES.eletrodomesticos_editorial || [];
  for (const term of ['air fryer', 'cafeteira', 'liquidificador', 'ventilador', 'aspirador vertical']) {
    assert.ok(!eletro.includes(term), `AMAZON_ALIASES.eletrodomesticos_editorial não deve conter '${term}'`);
  }

  // Móveis
  const moveis = AMAZON_ALIASES.moveis_editorial || [];
  for (const term of ['prateleira', 'banqueta', 'sapateira']) {
    assert.ok(!moveis.includes(term), `AMAZON_ALIASES.moveis_editorial não deve conter '${term}'`);
  }

  // Grandes Ofertas
  const grandes = AMAZON_ALIASES.grandes_ofertas_editorial || [];
  assert.ok(!grandes.includes('cafeteira'), `AMAZON_ALIASES.grandes_ofertas_editorial não deve conter 'cafeteira'`);
  assert.ok(!grandes.includes('galaxy'), `AMAZON_ALIASES.grandes_ofertas_editorial não deve conter 'galaxy'`);
});

test('G) Shopee sourcing preservado sem criar matriz paralela', () => {
  assert.equal(Object.keys(SHOPEE_SCENARIOS).length, 14);
  for (const id of EDITORIAL_SCENARIO_IDS) {
    assert.ok(SHOPEE_SCENARIOS[id], `Shopee deve usar o cenário ${id}`);
    assert.deepEqual(SHOPEE_SCENARIOS[id].allowedProductTerms, EDITORIAL_SCENARIOS[id].allowedProductTerms);
    assert.deepEqual(SHOPEE_SCENARIOS[id].keywords, EDITORIAL_SCENARIOS[id].keywords);
  }
});

test('H) marketplace-scenario-contracts não reintroduz termos excluídos', () => {
  const forbiddenGlobally = [
    'cama', // em casa_cozinha
    'jantar', // em casa_cozinha
    'ferramenta', // em ferramentas
    'chave', // em ferramentas
    'hd', // em informatica
    'escova', // em beleza
    'corrida', // em esporte
    'fitness', // em esporte
    'yoga', // em esporte
    'corda', // em esporte
    'academia', // em esporte
    'areia', // em pet
    'transporte pet', // em pet
    'console', // em grandes_ofertas
    'galaxy', // em celulares e grandes_ofertas
    'redmi', // em celulares
    'poco', // em celulares
    'motorola', // em celulares
    'realme', // em celulares
  ];

  for (const marketplace of MARKETPLACES) {
    // Casa/Cozinha
    const casa = getMarketplaceScenarioContract('casa_cozinha_editorial', marketplace);
    assert.ok(!casa.allowedProductTerms.includes('cama'));
    assert.ok(!casa.allowedProductTerms.includes('jantar'));

    // Ferramentas
    const ferr = getMarketplaceScenarioContract('ferramentas_editorial', marketplace);
    assert.ok(!ferr.allowedProductTerms.includes('ferramenta'));
    assert.ok(!ferr.allowedProductTerms.includes('chave'));

    // Informática
    const info = getMarketplaceScenarioContract('informatica_editorial', marketplace);
    assert.ok(!info.allowedProductTerms.includes('hd'));

    // Beleza
    const bel = getMarketplaceScenarioContract('beleza_editorial', marketplace);
    assert.ok(!bel.allowedProductTerms.includes('escova'));

    // Esporte
    const esp = getMarketplaceScenarioContract('esporte_editorial', marketplace);
    assert.ok(!esp.allowedProductTerms.includes('corrida'));
    assert.ok(!esp.allowedProductTerms.includes('fitness'));
    assert.ok(!esp.allowedProductTerms.includes('yoga'));
    assert.ok(!esp.allowedProductTerms.includes('corda'));
    assert.ok(!esp.allowedProductTerms.includes('academia'));

    // Pet
    const pet = getMarketplaceScenarioContract('pet_editorial', marketplace);
    assert.ok(!pet.allowedProductTerms.includes('areia'));
    assert.ok(!pet.allowedProductTerms.includes('transporte pet'));

    // Grandes Ofertas
    const grand = getMarketplaceScenarioContract('grandes_ofertas_editorial', marketplace);
    assert.ok(!grand.allowedProductTerms.includes('console'));
    assert.ok(!grand.allowedProductTerms.includes('galaxy'));

    // Celulares
    const cel = getMarketplaceScenarioContract('celulares_editorial', marketplace);
    assert.ok(!cel.allowedProductTerms.includes('galaxy'));
    assert.ok(!cel.allowedProductTerms.includes('redmi'));
    assert.ok(!cel.allowedProductTerms.includes('poco'));
    assert.ok(!cel.allowedProductTerms.includes('motorola'));
    assert.ok(!cel.allowedProductTerms.includes('realme'));
  }
});

test('I) Nenhum Games/Automotivo reaparece no registro', () => {
  assert.equal(EDITORIAL_SCENARIOS.automotivo_editorial, undefined);
  assert.equal(EDITORIAL_SCENARIOS.games_editorial, undefined);
  assert.equal(getEditorialScenarioById('automotivo_editorial'), null);
  assert.equal(getEditorialScenarioById('games_editorial'), null);
});

test('J) pet_editorial aceita produtos válidos em todos os marketplaces e bloqueios não contradizem intents', () => {
  for (const marketplace of MARKETPLACES) {
    const contract = getMarketplaceScenarioContract('pet_editorial', marketplace);
    
    // Aceitações obrigatórias
    assert.equal(matchesMarketplaceContract(contract, 'Ração cachorro Premium 10kg'), true, `${marketplace} deve aceitar Ração cachorro Premium 10kg`);
    assert.equal(matchesMarketplaceContract(contract, 'Ração gato Castrado 3kg'), true, `${marketplace} deve aceitar Ração gato Castrado 3kg`);
    assert.equal(matchesMarketplaceContract(contract, 'Cama pet cachorro grande'), true, `${marketplace} deve aceitar Cama pet cachorro grande`);
    assert.equal(matchesMarketplaceContract(contract, 'Areia gato biodegradável'), true, `${marketplace} deve aceitar Areia gato biodegradável`);

    // Rejeições externas legítimas mantidas
    assert.equal(matchesMarketplaceContract(contract, 'Ração para bebê humano'), false, `${marketplace} deve rejeitar produto para bebê`);
    assert.equal(matchesMarketplaceContract(contract, 'Pneu automotivo aro 15'), false, `${marketplace} deve rejeitar produto automotivo`);
  }
});

test('K) Teste genérico: nenhum blockedProductTerm derivado contradiz tokens/termos do próprio cenário', () => {
  for (const scenarioId of EDITORIAL_SCENARIO_IDS) {
    const canonical = EDITORIAL_SCENARIOS[scenarioId];
    if (canonical.discoveryMode === 'manual_only' || canonical.allowedProductTerms.length === 0) continue;
    
    // Coletar tokens de intenção canônicos
    const intentTokens = new Set();
    const allIntentPhrases = [...canonical.keywords, ...canonical.allowedProductTerms].map((s) => String(s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
    for (const phrase of allIntentPhrases) {
      const tokens = phrase.split(/[^a-z0-9]+/g).filter((t) => t.length >= 2);
      for (const token of tokens) intentTokens.add(token);
    }

    for (const marketplace of MARKETPLACES) {
      const contract = getMarketplaceScenarioContract(scenarioId, marketplace);
      for (const blocked of contract.blockedProductTerms) {
        const normBlocked = String(blocked || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
        const blockedTokens = normBlocked.split(/[^a-z0-9]+/g).filter(Boolean);
        
        for (const bToken of blockedTokens) {
          assert.ok(
            !intentTokens.has(bToken),
            `Contradição detectada em ${marketplace}/${scenarioId}: blockedProductTerm '${blocked}' contém token '${bToken}' que é parte de intent canônica!`
          );
        }
      }
    }
  }
});
