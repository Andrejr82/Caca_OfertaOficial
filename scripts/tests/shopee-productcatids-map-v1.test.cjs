'use strict';

const assert = require('node:assert/strict');
const {
  SHOPEE_PRODUCTCATIDS_MAP_V1,
  getShopeeFamilyCategoryPath,
  shouldUseShopeeFamily,
  getShopeeBlockedFamilies,
} = require('../shopee-productcatids-map-v1.cjs');

const tests = [
  function testTotalFamiliesCount() {
    let count = 0;
    for (const [, families] of Object.entries(SHOPEE_PRODUCTCATIDS_MAP_V1)) {
      count += Object.keys(families).length;
    }
    assert.equal(count, 69, `Esperado 69 famílias no mapa, encontrado ${count}`);
    console.log(`[PASS] total de 69 famílias no mapa completo (${count}/69)`);
  },

  function testCamaPetBloqueado() {
    const isUsed = shouldUseShopeeFamily('Pet', 'cama pet');
    assert.equal(isUsed, false, 'cama pet não deve ser utilizada automaticamente');

    const blocked = getShopeeBlockedFamilies('Pet');
    assert.ok(blocked.includes('cama pet'), 'cama pet deve constar em getShopeeBlockedFamilies("Pet")');

    const petEntry = SHOPEE_PRODUCTCATIDS_MAP_V1.Pet['cama pet'];
    assert.equal(petEntry.decision, 'bloquear');
    console.log('[PASS] cama pet retorna bloqueado');
  },

  function testFamiliasInvestigarNaoPromovidas() {
    const investigatingFamilies = [
      { niche: 'Beleza', family: 'skincare' },
      { niche: 'Moda', family: 'sapato masculino' },
      { niche: 'Eletrodomésticos', family: 'refrigerador' },
      { niche: 'Eletrodomésticos', family: 'lava e seca' },
      { niche: 'Ferramentas', family: 'kit ferramentas' },
      { niche: 'Pet', family: 'shampoo pet' },
    ];

    for (const { niche, family } of investigatingFamilies) {
      const entry = SHOPEE_PRODUCTCATIDS_MAP_V1[niche][family];
      assert.equal(entry.decision, 'investigar', `${niche} > ${family} deve ter decision = 'investigar'`);
      assert.notEqual(entry.decision, 'promover', `${niche} > ${family} não deve ser 'promover'`);
      const isUsed = shouldUseShopeeFamily(niche, family);
      assert.equal(isUsed, false, `${niche} > ${family} não deve ser utilizado automaticamente`);
    }
    console.log('[PASS] famílias investigar não retornam como promovidas (6/6 verificadas)');
  },

  function testAirFryerCategoryPath() {
    const path = getShopeeFamilyCategoryPath('Casa/Cozinha/Organização', 'air fryer');
    assert.deepEqual(path, ['100010', '100041', '100198']);
    assert.equal(shouldUseShopeeFamily('Casa/Cozinha/Organização', 'air fryer'), true);
    console.log('[PASS] air fryer retorna ["100010", "100041", "100198"]');
  },

  function testFogaoCooktopCategoryPath() {
    const pathFogao = getShopeeFamilyCategoryPath('Eletrodomésticos', 'fogão');
    const pathCooktop = getShopeeFamilyCategoryPath('Eletrodomésticos', 'cooktop');
    assert.deepEqual(pathFogao, ['100010', '100041', '100197']);
    assert.deepEqual(pathCooktop, ['100010', '100041', '100197']);
    assert.equal(shouldUseShopeeFamily('Eletrodomésticos', 'fogão'), true);
    assert.equal(shouldUseShopeeFamily('Eletrodomésticos', 'cooktop'), true);
    console.log('[PASS] fogão e cooktop retornam ["100010", "100041", "100197"]');
  },

  function testMaquinaDeLavarCategoryPath() {
    const path = getShopeeFamilyCategoryPath('Eletrodomésticos', 'máquina de lavar');
    assert.deepEqual(path, ['100010', '100039', '100179']);
    assert.equal(shouldUseShopeeFamily('Eletrodomésticos', 'máquina de lavar'), true);
    console.log('[PASS] máquina de lavar retorna ["100010", "100039", "100179"]');
  },

  function testFerramentasConvergencia() {
    const expectedPath = ['100636', '100715', '101191'];
    const toolFamilies = [
      'furadeira',
      'parafusadeira',
      'alicate',
      'chave',
      'serra',
      'trena',
      'maleta de ferramentas',
      'kit ferramentas',
    ];

    for (const tool of toolFamilies) {
      const path = getShopeeFamilyCategoryPath('Ferramentas', tool);
      assert.deepEqual(path, expectedPath, `Ferramenta ${tool} deve convergir para ${expectedPath}`);
    }
    console.log(`[PASS] ferramentas convergem para ["100636", "100715", "101191"] (${toolFamilies.length}/${toolFamilies.length})`);
  },

  function testCaseAndAccentInsensitivity() {
    const path1 = getShopeeFamilyCategoryPath('eletrodomesticos', 'maquina de lavar');
    assert.deepEqual(path1, ['100010', '100039', '100179']);
    const path2 = getShopeeFamilyCategoryPath('casa/cozinha/organizacao', 'organizador');
    assert.deepEqual(path2, ['100016', '100097', '100347']);
    console.log('[PASS] normalização de acentos e maiúsculas/minúsculas');
  },
];

(async () => {
  let passed = 0;
  let failed = 0;

  console.log('=== Executando Testes de ProductCatIds Map V1 ===\n');

  for (const test of tests) {
    try {
      test();
      passed += 1;
    } catch (err) {
      failed += 1;
      console.error(`[FAIL] ${test.name}: ${err.message}`);
    }
  }

  console.log(`\n================================================`);
  console.log(`Resultado: ${passed} passaram, ${failed} falharam (Total: ${tests.length})`);
  console.log(`================================================`);

  process.exit(failed > 0 ? 1 : 0);
})();
