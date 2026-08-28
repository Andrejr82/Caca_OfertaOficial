'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { classifyCandidate, buildClassificationCoverage } = require('../classification-coverage.cjs');

const base = {
  marketplace: 'Amazon',
  title: 'Air Fryer 5L',
  category: { name: 'Eletrodomésticos' },
  sourceUrl: 'https://example.com/product',
  imageUrl: 'https://example.com/image.jpg',
  currentPrice: 100,
};

test('prioriza domínio oficial sobre título', () => {
  const result = classifyCandidate({ ...base, rawPayload: { domain_id: 'MLB-AIR_FRYERS' }, title: 'Produto sem nome útil' }, 'Amazon');
  assert.equal(result.productType, 'air_fryer');
  assert.equal(result.source, 'domain:MLB-AIR_FRYERS');
  assert.equal(result.confidence, 1);
});

test('classifica por atributo antes de título', () => {
  const result = classifyCandidate({ ...base, title: 'Eletrodoméstico cozinha', attributes: [{ name: 'Tipo', value_name: 'air fryer' }] }, 'Amazon');
  assert.equal(result.productType, 'air_fryer');
  assert.equal(result.source, 'attributes');
});

test('retorna review_required para produto sem evidência', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Produto especial' }, 'Amazon');
  assert.equal(result.status, 'review_required');
  assert.equal(result.productType, 'unknown');
});

test('cobertura exige 100% classificado para aprovação', () => {
  const products = [
    { ...base, classification: classifyCandidate(base, 'Amazon') },
    { ...base, category: {}, title: 'Produto especial', classification: classifyCandidate({ ...base, category: {}, title: 'Produto especial' }, 'Amazon') },
  ];
  const result = buildClassificationCoverage(products, 'Amazon');
  assert.equal(result.total_validos, 2);
  assert.equal(result.total_classificados, 1);
  assert.equal(result.cobertura_classificacao, 0.5);
  assert.equal(result.approved_for_publication, false);
});

test('Amazon: Mini PC vence menção secundária a SSD', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Mini PC BOSGAME Ryzen 5 16GB 512GB SSD para Home Office' }, 'Amazon');
  assert.equal(result.productType, 'mini_pc');
});

test('Amazon: webcam vence compatibilidade com notebook', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Webcam Full HD 1080p com microfone para PC e Notebook' }, 'Amazon');
  assert.equal(result.productType, 'webcam');
});

test('Amazon: mouse vence compatibilidade com notebook', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Mouse Sem Fio Bluetooth ergonômico para Notebook e PC' }, 'Amazon');
  assert.equal(result.productType, 'mouse');
});

test('Amazon: computador com geração não vira pet_food', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Computador Completo Intel Core i5 4ª Geração 16GB SSD 480GB' }, 'Amazon');
  assert.equal(result.productType, 'desktop');
});

test('Amazon: teclado com camadas não vira pet_bed', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'Teclado mecânico gamer sem fio com acolchoamento de cinco camadas RGB' }, 'Amazon');
  assert.equal(result.productType, 'keyboard');
});

test('Amazon: switch Ethernet é classificado como equipamento de rede', () => {
  const result = classifyCandidate({ ...base, category: {}, title: 'TP-Link Switch Ethernet Gigabit de 8 Portas Plug & Play' }, 'Amazon');
  assert.equal(result.productType, 'network_switch');
});
