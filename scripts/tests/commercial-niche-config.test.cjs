'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  COMMERCIAL_NICHES,
  COMMERCIAL_NICHE_IDS,
  LEGACY_SCENARIO_TO_NICHE_MAP,
  LEGACY_SCENARIOS_OUTSIDE_NICHES,
  AFFINITY_RULES,
  getCommercialNiche,
  resolveNicheFromLegacyScenario,
  getAffinityRules,
} = require('../commercial-niche-config.cjs');

test('1. Valida existência exata dos 7 nichos comerciais canônicos', () => {
  assert.equal(COMMERCIAL_NICHE_IDS.length, 7);
  const expectedIds = [
    'casa_cozinha_organizacao',
    'beleza',
    'moda',
    'eletrodomesticos',
    'informatica',
    'ferramentas',
    'pet',
  ];
  assert.deepEqual(COMMERCIAL_NICHE_IDS.slice().sort(), expectedIds.slice().sort());
  assert.equal(COMMERCIAL_NICHE_IDS.includes('beleza_cuidados_pessoais'), false);
  assert.equal(COMMERCIAL_NICHE_IDS.includes('moda_calcados'), false);
});

test('2. Valida mapeamento exato dos cenários legados para os 7 nichos', () => {
  assert.equal(resolveNicheFromLegacyScenario('casa_cozinha_editorial').nicheId, 'casa_cozinha_organizacao');
  assert.equal(resolveNicheFromLegacyScenario('organizacao_editorial').nicheId, 'casa_cozinha_organizacao');
  assert.equal(resolveNicheFromLegacyScenario('beleza_editorial').nicheId, 'beleza');
  assert.equal(resolveNicheFromLegacyScenario('moda_editorial').nicheId, 'moda');
  assert.equal(resolveNicheFromLegacyScenario('eletrodomesticos_editorial').nicheId, 'eletrodomesticos');
  assert.equal(resolveNicheFromLegacyScenario('informatica_editorial').nicheId, 'informatica');
  assert.equal(resolveNicheFromLegacyScenario('ferramentas_editorial').nicheId, 'ferramentas');
  assert.equal(resolveNicheFromLegacyScenario('pet_editorial').nicheId, 'pet');
});

test('3. Core e Expansion contêm exatamente os produtos aprovados', () => {
  // Casa/Cozinha/Organização
  const casa = getCommercialNiche('casa_cozinha_organizacao');
  assert.deepEqual(casa.coreProducts, [
    'air fryer', 'cafeteira', 'liquidificador', 'aspirador vertical', 'panela elétrica',
    'jogo de panelas', 'jogo de cama', 'toalha de banho', 'aparelho de jantar', 'organizador de cozinha',
  ]);
  assert.deepEqual(casa.expansionProducts, [
    'batedeira', 'mixer', 'sanduicheira', 'forno elétrico', 'chaleira elétrica', 'grill',
    'faqueiro', 'organizador de gaveta', 'organizador de armário', 'mop', 'varal', 'caixa organizadora', 'cesto organizador',
  ]);

  // Beleza
  const beleza = getCommercialNiche('beleza');
  assert.deepEqual(beleza.coreProducts, [
    'protetor solar', 'hidratante facial', 'sérum', 'shampoo', 'tratamento capilar',
    'perfume', 'maquiagem', 'escova secadora', 'secador',
  ]);
  assert.deepEqual(beleza.expansionProducts, [
    'chapinha', 'modelador', 'aparador', 'máquina de cortar cabelo', 'escova alisadora', 'depilador',
  ]);

  // Moda
  const moda = getCommercialNiche('moda');
  assert.deepEqual(moda.coreProducts, [
    'tênis masculino', 'tênis feminino', 'tênis casual', 'camiseta masculina', 'vestido',
    'calça jeans', 'jaqueta', 'bolsa', 'mochila',
  ]);
  assert.deepEqual(moda.expansionProducts, [
    'camisa', 'bermuda', 'moletom', 'calça social', 'relógio', 'óculos',
  ]);

  // Eletrodomésticos
  const eletro = getCommercialNiche('eletrodomesticos');
  assert.deepEqual(eletro.coreProducts, [
    'geladeira', 'máquina de lavar', 'ar condicionado', 'micro-ondas', 'fogão', 'cooktop', 'lava e seca', 'aspirador',
  ]);
  assert.deepEqual(eletro.expansionProducts, [
    'freezer', 'lava-louças', 'frigobar', 'adega climatizada', 'coifa', 'depurador',
  ]);

  // Informática
  const info = getCommercialNiche('informatica');
  assert.deepEqual(info.coreProducts, [
    'notebook', 'monitor', 'ssd', 'impressora', 'roteador', 'mini pc',
  ]);
  assert.deepEqual(info.expansionProducts, [
    'computador', 'desktop', 'teclado', 'mouse', 'webcam', 'hd externo', 'scanner', 'nobreak', 'switch de rede',
  ]);

  // Ferramentas
  const ferr = getCommercialNiche('ferramentas');
  assert.deepEqual(ferr.coreProducts, [
    'parafusadeira', 'furadeira', 'lavadora de alta pressão', 'esmerilhadeira', 'serra', 'máquina de solda', 'jogo de ferramentas', 'kit de chaves',
  ]);
  assert.deepEqual(ferr.expansionProducts, [
    'alicate', 'chave de impacto', 'trena', 'nível laser', 'compressor', 'maleta de ferramentas', 'lixadeira', 'soprador',
  ]);

  // Pet
  const pet = getCommercialNiche('pet');
  assert.deepEqual(pet.coreProducts, [
    'ração cachorro', 'ração gato', 'areia para gato', 'tapete higiênico',
  ]);
  assert.deepEqual(pet.expansionProducts, [
    'cama pet', 'fonte pet', 'bebedouro automático', 'comedouro automático', 'caixa de transporte', 'arranhador', 'caixa de areia', 'brinquedo pet',
  ]);
});

test('4. opportunityProducts continua array vazio e dinâmico para todos os nichos', () => {
  for (const id of COMMERCIAL_NICHE_IDS) {
    const niche = getCommercialNiche(id);
    assert.deepEqual(niche.opportunityProducts, []);
  }
});

test('5. Afinidades por marketplace correspondem exatamente à matriz aprovada', () => {
  assert.deepEqual(getCommercialNiche('casa_cozinha_organizacao').marketplaceAffinity, { Amazon: 3, 'Mercado Livre': 3, Shopee: 3 });
  assert.deepEqual(getCommercialNiche('beleza').marketplaceAffinity, { Amazon: 3, 'Mercado Livre': 2, Shopee: 3 });
  assert.deepEqual(getCommercialNiche('moda').marketplaceAffinity, { Amazon: 2, 'Mercado Livre': 2, Shopee: 3 });
  assert.deepEqual(getCommercialNiche('eletrodomesticos').marketplaceAffinity, { Amazon: 3, 'Mercado Livre': 3, Shopee: 2 });
  assert.deepEqual(getCommercialNiche('informatica').marketplaceAffinity, { Amazon: 3, 'Mercado Livre': 3, Shopee: 2 });
  assert.deepEqual(getCommercialNiche('ferramentas').marketplaceAffinity, { Amazon: 3, 'Mercado Livre': 3, Shopee: 3 });
  assert.deepEqual(getCommercialNiche('pet').marketplaceAffinity, { Amazon: 3, 'Mercado Livre': 3, Shopee: 3 });
});

test('6. Cenários fora dos 7 nichos permanecem estritamente legacy_only', () => {
  for (const legacyId of LEGACY_SCENARIOS_OUTSIDE_NICHES) {
    const res = resolveNicheFromLegacyScenario(legacyId);
    assert.equal(res.mode, 'legacy_only');
    assert.equal(res.nicheId, null);
    assert.equal(res.reason, 'legacy_scenario_outside_final_7_niches');
  }
});
