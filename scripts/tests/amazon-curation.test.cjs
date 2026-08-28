'use strict';

const assert = require('node:assert/strict');
const { test } = require('node:test');
const { qualityGate, scoreCandidate } = require('../curation-policy.cjs');

function amazonProduct(overrides = {}) {
  return {
    marketplace: 'Amazon',
    sourceItemId: 'B08F2XQ36M',
    sourceUrl: 'https://www.amazon.com.br/dp/B08F2XQ36M',
    imageUrl: 'https://example.com/image.jpg',
    title: 'Smart TV Samsung 55 4K',
    currentPrice: 2099,
    originalPrice: null,
    deterministicScore: 8,
    category: { name: 'Televisores' },
    marketplaceMetrics: {},
    ...overrides,
  };
}

test('Amazon: Com desconto real', () => {
  const prod = amazonProduct({ originalPrice: 2500 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), false);
  const score = scoreCandidate(prod, gate);
  assert.ok(score > 0);
});

test('Amazon: Com preço anterior maior', () => {
  const prod = amazonProduct({ originalPrice: 2400 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), false);
});

test('Amazon: Prime identificado', () => {
  const prod = amazonProduct({ marketplaceMetrics: { prime: true } });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), false);
});

test('Amazon: Com cupom', () => {
  const prod = amazonProduct({ marketplaceMetrics: { coupon: true } });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
});

test('Amazon: Com promoção', () => {
  const prod = amazonProduct({ marketplaceMetrics: { promotion: true, verifiedPromotion: true } });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
});

test('Amazon: Sem dados comerciais, estruturalmente válida', () => {
  const prod = amazonProduct();
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), true);
});

test('Amazon: Sem dados comerciais e penalizada no score', () => {
  process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY = '-8';
  const prod = amazonProduct({ currentPrice: 50 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.equal(gate.warnings.includes('DADOS_COMERCIAIS_INDISPONIVEIS'), true);
  const score = scoreCandidate(prod, gate);
  // Base score agora é 8 * 2 = 16; sem prova comercial recebe -8.
  assert.equal(score, 8);
});

test('Amazon: Com preço inválido', () => {
  const prod = amazonProduct({ currentPrice: -10 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('PRECO_INVALIDO'));
});

test('Amazon: Imagem inválida', () => {
  const prod = amazonProduct({ imageUrl: 'http://example.com/image.jpg' });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('IMAGEM_INVALIDA'));
});

test('Amazon: URL inválida', () => {
  const prod = amazonProduct({ sourceUrl: 'http://example.com' });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('LINK_INVALIDO'));
});

test('Amazon: cenário de informática não libera cabo automaticamente', () => {
  const blocked = qualityGate(amazonProduct({
    title: 'Cabo USB-C para carregamento rápido de notebook',
    intent: 'informatica_editorial',
    allowAccessory: true,
  }));
  assert.equal(blocked.eligible, false);
  assert.ok(blocked.reasons.includes('ACCESSORY_ONLY_PRODUCT') || blocked.reasons.includes('ACESSORIO_OU_CONSUMIVEL'));
});

test('Amazon: organizador de cabos do ciclo real é bloqueado', () => {
  const gate = qualityGate(amazonProduct({
    title: '3 peças enroladoras de cabos multifuncionais de mesa para fio de mouse e fone de ouvido',
    intent: 'informatica_editorial',
    allowAccessory: true,
  }));
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('ACCESSORY_ONLY_PRODUCT'));
});

test('Amazon: kit de limpeza eletrônicos do ciclo real é bloqueado', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Kit Limpeza Eletrônicos 7 em 1 Teclado Notebook Celular Fones Completo',
    intent: 'informatica_editorial',
  }));
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('ACCESSORY_ONLY_PRODUCT'));
});

test('Amazon: suporte de parede para laptop/roteador é bloqueado', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Suporte de parede para laptop e gancho de fone para modem roteador e switch de rede',
    intent: 'informatica_editorial',
  }));
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('ACCESSORY_ONLY_PRODUCT'));
});

test('Amazon: suporte SSD é bloqueado', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Suporte SSD para Samsung T5 T7 T9 com clipe para smartphone',
    intent: 'informatica_editorial',
  }));
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('ACCESSORY_ONLY_PRODUCT'));
});

test('Amazon: webcam principal continua elegível', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Webcam Full HD 1080p com Microfone Integrado Foco Automático USB Plug & Play para PC e Notebook',
    currentPrice: 99,
    marketplaceMetrics: { rating: 4.7 },
    category: { evidenceUrl: 'https://www.amazon.com.br/s?k=webcam%20full%20hd%201080p' },
  }));
  assert.equal(gate.eligible, true);
});

test('Amazon: scanner de parede não passa pela intenção scanner', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Scanner de parede 5 em 1 detector de metal fios e vigas',
    currentPrice: 99,
    category: { evidenceUrl: 'https://www.amazon.com.br/s?k=scanner' },
  }));
  assert.equal(gate.eligible, false);
  assert.ok(gate.reasons.includes('AMAZON_INTENCAO_INCOMPATIVEL'));
});

test('Amazon: scanner de documentos passa pela intenção scanner', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Scanner de Documentos de Mesa A4 Duplex USB',
    currentPrice: 599,
    category: { evidenceUrl: 'https://www.amazon.com.br/s?k=scanner' },
  }));
  assert.equal(gate.eligible, true);
});

test('Amazon: tomada Nintendo Switch não passa por switch de rede', () => {
  const gate = qualityGate(amazonProduct({
    title: 'Adaptador USB-C para Nintendo Switch 2',
    currentPrice: 99,
    category: { evidenceUrl: 'https://www.amazon.com.br/s?k=switch%20de%20rede' },
  }));
  assert.equal(gate.eligible, false);
});

test('Amazon: switch Ethernet passa pela intenção switch de rede', () => {
  const gate = qualityGate(amazonProduct({
    title: 'TP-Link Switch Ethernet Gigabit de 8 Portas Plug & Play',
    currentPrice: 249,
    category: { evidenceUrl: 'https://www.amazon.com.br/s?k=switch%20de%20rede' },
  }));
  assert.equal(gate.eligible, true);
});

test('Amazon: Alto Valor sem vantagem com dados disponíveis é aviso', () => {
  const prod = amazonProduct({ originalPrice: 2099, currentPrice: 2099 });
  const gate = qualityGate(prod);
  assert.equal(gate.eligible, true);
  assert.ok(gate.warnings.includes('ALTO_VALOR_SEM_VANTAGEM'));
});
