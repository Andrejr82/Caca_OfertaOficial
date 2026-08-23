'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  evaluateCampaignPotential,
  calculateCommercialOpportunityScoreVNext,
  classifyCommercialDecisionVNext,
  scoreEconomicReturn,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');
const { selectRadarVNext } = require('../../src/core/trends/radar-vnext-selector.cjs');

test('1. THRESHOLDS EXATOS: Valida estritamente as fronteiras de decisão', () => {
  assert.equal(classifyCommercialDecisionVNext(80), 'PRIORIDADE');
  assert.equal(classifyCommercialDecisionVNext(79), 'TESTAR');
  assert.equal(classifyCommercialDecisionVNext(65), 'TESTAR');
  assert.equal(classifyCommercialDecisionVNext(64), 'OBSERVAR');
  assert.equal(classifyCommercialDecisionVNext(50), 'OBSERVAR');
  assert.equal(classifyCommercialDecisionVNext(49), 'IGNORAR');
});

test('2. CAMPANHABILIDADE SEMÂNTICA POR ATRIBUTOS DE DEMONSTRAÇÃO: Validação de faixas e ordem', () => {
  const pEscova = { productName: 'Escova De Limpeza 9 Em 1 Elétrica Giratória Com Cabo Alongador' };
  const pFatiador = { productName: 'Fatiador Profissional Multifuncional De Aço Inoxidável 16 Em 1 Para Vegetais/Frutas/Legumes' };
  const pProcessador = { productName: 'Mini Processador E Triturador De Alimentos Manual 3 Laminas' };
  const pVentilador = { productName: 'Ventilador Luminária Led 6 Pás Lâmpada Soquete Bocal E27 Teto' };
  const pImpressora = { productName: 'Mini Impressora 58mm Portátil Térmica Sem Fio Bluetooth' };

  const pCamera = { productName: 'Câmera Segurança Prova D\'água Infravermelho 360 Wifi' };
  const pConsole = { productName: 'Console Portátil R36S +15.000 Jogos Linux IPS 3.5' };
  const pSuporte = { productName: 'Suporte Articulado Para Monitor 13 a 32 Pistão a Gás' };

  const pFone = { productName: 'Fone Bluetooth Pro5 Premium TWS Sem Fio' };
  const pAdaptador = { productName: 'Benjamim Articulado Adaptador 3 em 1 Bivolt Tomada Universal' };

  const cEscova = evaluateCampaignPotential(pEscova);
  const cFatiador = evaluateCampaignPotential(pFatiador);
  const cProcessador = evaluateCampaignPotential(pProcessador);
  const cVentilador = evaluateCampaignPotential(pVentilador);
  const cImpressora = evaluateCampaignPotential(pImpressora);

  const cCamera = evaluateCampaignPotential(pCamera);
  const cConsole = evaluateCampaignPotential(pConsole);
  const cSuporte = evaluateCampaignPotential(pSuporte);

  const cFone = evaluateCampaignPotential(pFone);
  const cAdaptador = evaluateCampaignPotential(pAdaptador);

  // Validação de Faixas:
  // Tier 1 (>= 26)
  assert.ok(cEscova.campaignabilityScore >= 26, `Escova elétrica (${cEscova.campaignabilityScore}) deve ser >= 26`);
  assert.ok(cFatiador.campaignabilityScore >= 26, `Fatiador multifuncional (${cFatiador.campaignabilityScore}) deve ser >= 26`);
  assert.ok(cProcessador.campaignabilityScore >= 26, `Mini processador (${cProcessador.campaignabilityScore}) deve ser >= 26`);
  assert.ok(cVentilador.campaignabilityScore >= 26, `Ventilador luminária (${cVentilador.campaignabilityScore}) deve ser >= 26`);
  assert.ok(cImpressora.campaignabilityScore >= 26, `Mini impressora (${cImpressora.campaignabilityScore}) deve ser >= 26`);

  // Tier 2 (20-25)
  assert.ok(cCamera.campaignabilityScore >= 20 && cCamera.campaignabilityScore <= 25, `Câmera (${cCamera.campaignabilityScore}) deve estar entre 20-25`);
  assert.ok(cConsole.campaignabilityScore >= 20 && cConsole.campaignabilityScore <= 25, `Console (${cConsole.campaignabilityScore}) deve estar entre 20-25`);
  assert.ok(cSuporte.campaignabilityScore >= 14 && cSuporte.campaignabilityScore <= 25, `Suporte (${cSuporte.campaignabilityScore}) deve estar entre 14-25`);

  // Tier 3 (14-19)
  assert.ok(cFone.campaignabilityScore >= 14 && cFone.campaignabilityScore <= 19, `Fone TWS (${cFone.campaignabilityScore}) deve estar entre 14-19`);

  // Tier 4 (8-13)
  assert.ok(cAdaptador.campaignabilityScore >= 8 && cAdaptador.campaignabilityScore <= 13, `Adaptador (${cAdaptador.campaignabilityScore}) deve estar entre 8-13`);

  // Validação de Ordem:
  assert.ok(cEscova.campaignabilityScore >= cCamera.campaignabilityScore);
  assert.ok(cCamera.campaignabilityScore > cFone.campaignabilityScore);
  assert.ok(cFone.campaignabilityScore > cAdaptador.campaignabilityScore);
});

test('3. DIVERSIDADE PROGRESSIVA: expansão para macros sub-representadas mantendo caps', () => {
  const candidates = [];
  const DISTINCT_FAMILIES = [
    { name: 'Câmera Segurança 360 Wifi', macro: 'seguranca' },
    { name: 'Sensor Presença Alarme Sem Fio', macro: 'seguranca' },
    { name: 'Video Game Stick Retrô', macro: 'games' },
    { name: 'Console Portátil R36S Linux', macro: 'games' },
    { name: 'Parafusadeira Sem Fio Bivolt', macro: 'ferramentas' },
    { name: 'Jogo Chave Catraca Bricolagem', macro: 'ferramentas' },
    { name: 'Fone Bluetooth TWS Sem Fio', macro: 'audio' },
    { name: 'Caixa de Som Portátil Bluetooth', macro: 'audio' },
    { name: 'Ventilador Luminária Teto E27', macro: 'casa_utilidades' },
    { name: 'Mini Processador Triturador Alimentos', macro: 'casa_utilidades' },
    { name: 'Organizador Gavetas Divisórias', macro: 'organizacao' },
    { name: 'Suporte Articulado Monitor Mesa', macro: 'organizacao' },
    { name: 'Mochila Antifurto Impermeável', macro: 'acessorios_vestuario' },
    { name: 'Smartwatch Relógio Inteligente', macro: 'acessorios_vestuario' },
  ];

  // 2 itens de cada uma das 14 famílias distintas (28 candidatos no total)
  for (let i = 0; i < DISTINCT_FAMILIES.length; i++) {
    const f = DISTINCT_FAMILIES[i];
    for (let j = 1; j <= 2; j++) {
      candidates.push({
        marketplace: 'Shopee',
        itemId: `item-${i}-${j}`,
        shopId: `shop-${i}-${j}`,
        productName: `${f.name} Modelo ${j}`,
        currentPrice: 45.0,
        sales: 5000,
        rating: 4.8,
        commissionRate: 10,
        permalink: `https://shopee.com.br/item-${i}-${j}`,
        imageUrl: `https://cf.shopee.com.br/item-${i}-${j}.jpg`,
        provenance: 'shopee_openapi_productOfferV2',
        evidenceStatus: 'verified',
      });
    }
  }

  const selected = selectRadarVNext(candidates, { maxProducts: 20 });
  assert.equal(selected.length, 20);

  const camCount = selected.filter(s => s.candidate.productName.includes('Câmera')).length;
  assert.equal(camCount, 2, 'Respeita maxPerFamily = 2 para câmeras');

  const secCount = selected.filter(s => s.family.macroFamily === 'seguranca').length;
  assert.ok(secCount <= 4, 'Respeita maxPerMacro = 4 para macro segurança');
});

test('4. FALLBACK GRADUAL QUANDO FALTAR DIVERSIDADE: preenche sem travar', () => {
  const candidates = [];
  // Pool com 10 candidatos todos de uma única família
  for (let i = 1; i <= 10; i++) {
    candidates.push({
      marketplace: 'Shopee',
      itemId: `cam-${i}`,
      shopId: `shop-${i}`,
      productName: `Câmera Segurança 360 Wifi Modelo ${i}`,
      currentPrice: 40.0 + i,
      sales: 3000,
      rating: 4.8,
      commissionRate: 10,
      permalink: `https://shopee.com.br/cam-${i}`,
      imageUrl: `https://cf.shopee.com.br/cam-${i}.jpg`,
      provenance: 'shopee_openapi_productOfferV2',
      evidenceStatus: 'verified',
    });
  }

  const selected = selectRadarVNext(candidates, { maxProducts: 10 });
  assert.equal(selected.length, 10, 'Fallback gradual deve preencher todos os 10 itens disponíveis');
  assert.ok(selected.some(s => s.isDiversityFallback), 'Indica que fallback foi ativado');
});

test('5. NORMALIZAÇÃO DE COMISSÃO: neutraliza 143%, 83%, 41%', () => {
  assert.equal(scoreEconomicReturn({ currentPrice: 20.0, commissionRate: 143 }).status, 'invalid');
  assert.equal(scoreEconomicReturn({ currentPrice: 30.0, commissionRate: 43, sellerCommissionRate: 40 }).status, 'invalid');
  assert.equal(scoreEconomicReturn({ currentPrice: 50.0, commissionRate: 41 }).status, 'invalid');
  assert.equal(scoreEconomicReturn({ currentPrice: 50.0, commissionRate: 10 }).status, 'observed');
});
