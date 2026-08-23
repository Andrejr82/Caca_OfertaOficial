'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { qualityGate } = require('../curation-policy.cjs');

function baseProduct(overrides = {}) {
  return {
    marketplace: 'Mercado Livre',
    sourceUrl: 'https://produto.mercadolivre.com.br/MLB-1234567890',
    imageUrl: 'https://http2.mlstatic.com/D_NQ_NP_123456-MLB.jpg',
    currentPrice: 349.9,
    originalPrice: 399.9,
    category: { name: 'Games' },
    marketplaceMetrics: {},
    deterministicScore: 8,
    ...overrides,
  };
}

test('aceita controle real quando a intenção explícita pesquisada é controle gamer', () => {
  const gate = qualityGate(baseProduct({
    intent: 'controle gamer',
    title: 'Controle Joystick Sem Fio Sony PlayStation 5 DualSense Midnight Black',
  }));

  assert.equal(gate.reasons.includes('ACESSORIO_OU_CONSUMIVEL'), false);
});

test('continua rejeitando acessório não pedido pela intenção', () => {
  const gate = qualityGate(baseProduct({
    intent: 'console',
    title: 'Cabo USB Tipo C 2 Metros Reforçado para Controle e Celular',
  }));

  assert.equal(gate.reasons.includes('ACESSORIO_OU_CONSUMIVEL'), true);
});
