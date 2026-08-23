'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');

const {
  classifyBenchmarkFamily,
  buildBenchmarkContext,
  peerConfidenceForCount,
} = require('../../src/core/trends/benchmark-peer-engine.cjs');
const {
  COMMERCIAL_OPPORTUNITY_VNEXT_STRATEGY_VERSION,
  calculateCommercialOpportunityScoreVNext,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');

test('BENCHMARK 1: Semantic Family - Power Bank 20000mAh matches Carregador Portatil 20.000 mAh as peers', () => {
  const p1 = {
    productName: 'Power Bank 20000mAh Carregador Portátil por Indução Rápido',
    currentPrice: 85.0,
  };
  const p2 = {
    productName: 'Carregador Portátil Powerbank 20.000 mAh Display Digital',
    currentPrice: 89.0,
  };
  const p3 = {
    productName: 'Power Bank 20.000mAh Bateria Externa Turbo',
    currentPrice: 79.0,
  };
  const p4 = {
    productName: 'Carregador Portátil 20000 mAh Ultra Rápido',
    currentPrice: 82.0,
  };

  const f1 = classifyBenchmarkFamily(p1);
  const f2 = classifyBenchmarkFamily(p2);
  assert.equal(f1.functionalFamily, f2.functionalFamily, 'Should have same functionalFamily');
  assert.equal(f1.variantClass, f2.variantClass, 'Should have same variantClass (20000mah)');
  assert.equal(f1.quantityClass, f2.quantityClass, 'Both are single units');

  const context = buildBenchmarkContext(p1, [p1, p2, p3, p4]);
  assert.equal(context.peerCount, 3, 'Should find 3 peers');
  assert.equal(context.peerConfidence, 'MEDIUM', '3 peers is MEDIUM confidence');
  assert.equal(context.benchmarkStatus, 'authoritative');
  assert.equal(context.priceCompetitive, true);
});

test('BENCHMARK 2: Semantic Discrimination - Power Bank is NEVER a peer of Fone Bluetooth', () => {
  const powerBank = {
    productName: 'Power Bank 20000mAh Carregador Portátil',
    currentPrice: 85.0,
  };
  const fone = {
    productName: 'Fone de Ouvido Bluetooth Sem Fio TWS',
    currentPrice: 45.0,
  };

  const fPB = classifyBenchmarkFamily(powerBank);
  const fFone = classifyBenchmarkFamily(fone);
  assert.notEqual(fPB.functionalFamily, fFone.functionalFamily, 'Power Bank must not be in same family as Fone');

  const context = buildBenchmarkContext(powerBank, [powerBank, fone]);
  assert.equal(context.peerCount, 0, 'Fone cannot be peer of Power Bank');
  assert.equal(context.peerConfidence, 'NONE');
});

test('BENCHMARK 3: Quantity Discrimination - kit 3 is NEVER a peer of single unit', () => {
  const kit3 = {
    productName: 'Kit 3 Camisetas Básicas Algodão Premium',
    currentPrice: 69.0,
  };
  const single = {
    productName: 'Camiseta Básica Algodão Masculina',
    currentPrice: 25.0,
  };

  const fKit = classifyBenchmarkFamily(kit3);
  const fSingle = classifyBenchmarkFamily(single);
  assert.notEqual(fKit.quantityClass, fSingle.quantityClass, 'Kit 3 must have different quantityClass from single');

  const context = buildBenchmarkContext(kit3, [kit3, single]);
  assert.equal(context.peerCount, 0, 'Single unit cannot be peer of Kit 3');
});

test('BENCHMARK 4: Confidence Scale - HIGH >= 5, MEDIUM 3-4, LOW 1-2, NONE 0', () => {
  assert.equal(peerConfidenceForCount(5), 'HIGH');
  assert.equal(peerConfidenceForCount(7), 'HIGH');
  assert.equal(peerConfidenceForCount(4), 'MEDIUM');
  assert.equal(peerConfidenceForCount(3), 'MEDIUM');
  assert.equal(peerConfidenceForCount(2), 'LOW');
  assert.equal(peerConfidenceForCount(1), 'LOW');
  assert.equal(peerConfidenceForCount(0), 'NONE');
});
