'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  MERCADOLIVRE_DOMAIN_CATEGORY_MAP_V1,
  MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1,
  getMercadoLivreCertifiedFamilies,
  getMercadoLivreFamilyConfig,
  shouldUseMercadoLivreFamily,
  isMercadoLivreDomainAllowedForFamily,
  getMercadoLivreExtractionRoute,
  getMercadoLivreBlockedFamilies,
  getMercadoLivreMapStats
} = require('../mercadolivre-domain-category-map-v1.cjs');

test('1. Total de famílias certificadas é exatamente 30', () => {
  const all = getMercadoLivreCertifiedFamilies();
  assert.equal(all.length, 30, `Esperado 30 famílias certificadas, recebido ${all.length}`);
});

test('2. Todas as famílias possuem atributos obrigatórios e válidos', () => {
  const all = getMercadoLivreCertifiedFamilies();
  for (const item of all) {
    assert.ok(item.niche, `Nicho ausente para família ${item.family}`);
    assert.ok(item.family, `Nome da família ausente`);
    assert.ok(item.normalizedFamily, `Normalized family ausente`);
    assert.ok(['alta', 'media'].includes(item.confidence), `Confiança inválida (${item.confidence}) para ${item.family}`);
    assert.ok(['domain_discovery_highlights', 'domain_discovery_products_search'].includes(item.bestExtractionRoute), `Rota inválida para ${item.family}`);
    assert.ok(Array.isArray(item.domainIds) && item.domainIds.length > 0, `domainIds vazio para ${item.family}`);
    assert.ok(Array.isArray(item.positiveTerms) && item.positiveTerms.length > 0, `positiveTerms vazio para ${item.family}`);
    assert.ok(Array.isArray(item.negativeTerms) && item.negativeTerms.length > 0, `negativeTerms vazio para ${item.family}`);
    assert.equal(item.safeForAutomaticSearch, true, `safeForAutomaticSearch deve ser true para ${item.family}`);
    assert.equal(item.enrichmentRequired, true, `enrichmentRequired deve ser true para ${item.family}`);
  }
});

test('3. Distribuição exata das rotas de extração (22 highlights / 8 products_search)', () => {
  const all = getMercadoLivreCertifiedFamilies();
  const highlights = all.filter((f) => f.bestExtractionRoute === 'domain_discovery_highlights');
  const productsSearch = all.filter((f) => f.bestExtractionRoute === 'domain_discovery_products_search');

  assert.equal(highlights.length, 22, `Esperado 22 highlights, obtido ${highlights.length}`);
  assert.equal(productsSearch.length, 8, `Esperado 8 products_search, obtido ${productsSearch.length}`);
  assert.equal(highlights.length + productsSearch.length, 30);
});

test('4. Nenhum domínio proibido aparece no mapa e rejeição é estrita', () => {
  const all = getMercadoLivreCertifiedFamilies();
  for (const item of all) {
    for (const forbidden of MERCADOLIVRE_FORBIDDEN_DOMAIN_IDS_V1) {
      assert.equal(
        item.domainIds.includes(forbidden),
        false,
        `Domínio proibido ${forbidden} encontrado na família ${item.family}`
      );
    }
  }

  // isMercadoLivreDomainAllowedForFamily deve rejeitar domínios proibidos explicitamente
  assert.equal(isMercadoLivreDomainAllowedForFamily('air fryer', 'MLB-MINERAL_WATERS'), false);
  assert.equal(isMercadoLivreDomainAllowedForFamily('liquidificador', 'MLB-MINERAL_WATERS'), false);
  assert.equal(isMercadoLivreDomainAllowedForFamily('batedeira', 'MLB-SOFT_DRINKS'), false);
  assert.equal(isMercadoLivreDomainAllowedForFamily('roteador', 'MLB-DJ_MIXERS'), false);
});

test('5. Famílias bloqueadas/investigar/manter não são automáticas', () => {
  const nonAutomatedFamilies = [
    'panela', 'cafeteira', 'organizador', 'toalha', 'lixeira', 'mixer', 'grill',
    'skincare', 'perfume', 'tratamento capilar', 'secador', 'maquiagem', 'aparador',
    'camiseta masculina', 'camisa polo masculina', 'calça jeans masculina', 'bermuda masculina',
    'chave', 'serra', 'aspirador', 'teclado', 'mouse', 'furadeira', 'parafusadeira'
  ];

  for (const fam of nonAutomatedFamilies) {
    assert.equal(
      shouldUseMercadoLivreFamily(fam),
      false,
      `Família não-automática ${fam} não deve ser liberada para busca automática`
    );
  }
});

test('6. Validação de casos positivos e coerência de domínios', () => {
  assert.equal(isMercadoLivreDomainAllowedForFamily('air fryer', 'MLB-AIR_FRYERS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('liquidificador', 'MLB-BLENDERS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('protetor solar', 'MLB-SUNSCREENS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('shampoo', 'MLB-HAIR_SHAMPOOS_AND_CONDITIONERS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('micro-ondas', 'MLB-MICROWAVES'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('freezer', 'MLB-FREEZERS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('notebook', 'MLB-NOTEBOOKS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('ração cachorro', 'MLB-CAT_AND_DOG_FOODS'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('areia gato', 'MLB-CATS_LITTER'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('trena', 'MLB-TAPE_MEASURES'), true);
  assert.equal(isMercadoLivreDomainAllowedForFamily('kit ferramentas', 'MLB-COMBINED_TOOL_KITS'), true);
});

test('7. Famílias de confiança média e filtros guardrails', () => {
  const tenisFem = getMercadoLivreFamilyConfig('tênis feminino');
  assert.ok(tenisFem, 'tênis feminino deve existir no mapa');
  assert.equal(tenisFem.confidence, 'media');
  assert.ok(tenisFem.negativeTerms.includes('infantil'));
  assert.ok(tenisFem.negativeTerms.includes('tenis masculino'));

  const frigobar = getMercadoLivreFamilyConfig('frigobar');
  assert.ok(frigobar, 'frigobar deve existir no mapa');
  assert.equal(frigobar.confidence, 'media');
  assert.equal(frigobar.minPrice, 400);
});

test('8. getMercadoLivreMapStats retorna métricas consolidadas', () => {
  const stats = getMercadoLivreMapStats();
  assert.equal(stats.totalFamilies, 30);
  assert.equal(stats.highConfidence, 28);
  assert.equal(stats.mediumConfidence, 2);
  assert.equal(stats.lowConfidence, 0);
  assert.equal(stats.byRoute.domain_discovery_highlights, 22);
  assert.equal(stats.byRoute.domain_discovery_products_search, 8);
  assert.equal(stats.byNiche['Casa/Cozinha/Organização'], 6);
  assert.equal(stats.byNiche['Beleza'], 4);
  assert.equal(stats.byNiche['Moda'], 3);
  assert.equal(stats.byNiche['Eletrodomésticos'], 5);
  assert.equal(stats.byNiche['Informática'], 3);
  assert.equal(stats.byNiche['Ferramentas'], 3);
  assert.equal(stats.byNiche['Pet'], 6);
});

test('9. Busca de famílias por cenário editorial', () => {
  const petFamilies = getMercadoLivreCertifiedFamilies('pet_editorial');
  assert.equal(petFamilies.length, 6);
  const names = petFamilies.map((f) => f.family);
  assert.ok(names.includes('ração cachorro'));
  assert.ok(names.includes('ração gato'));
  assert.ok(names.includes('areia gato'));

  const infoFamilies = getMercadoLivreCertifiedFamilies('informatica_editorial');
  assert.equal(infoFamilies.length, 3);
});

test('10. shouldUseMercadoLivreFamily suporta chamadas com escopo de nicho/cenário e validações avançadas', () => {
  assert.equal(shouldUseMercadoLivreFamily('pet_editorial', 'ração cachorro'), true);
  assert.equal(shouldUseMercadoLivreFamily('Pet', 'ração cachorro'), true);
  assert.equal(shouldUseMercadoLivreFamily('informatica_editorial', 'notebook'), true);
  assert.equal(shouldUseMercadoLivreFamily('Casa/Cozinha/Organização', 'air fryer'), true);
  assert.equal(shouldUseMercadoLivreFamily('Ferramentas', 'chave'), false);
  assert.equal(shouldUseMercadoLivreFamily('casa_cozinha_editorial', 'panela'), false);
  assert.equal(shouldUseMercadoLivreFamily('moda_editorial', 'tênis feminino', { minConfidence: 'alta' }), false);
  assert.equal(shouldUseMercadoLivreFamily('moda_editorial', 'tênis feminino'), true);
});

