'use strict';

const assert = require('node:assert/strict');
const { classifyMercadoLivreProduct } = require('./mercadolivre-canonical-classifier.cjs');

const cases = [
  ['Kit 2 Mamadeiras Buba Easy Flow Anticólica', 'MLB-BABY_BOTTLES', 'baby_bottle'],
  ['Kit Bolsa Maternidade com Mochila Bambinelli', 'MLB-DIAPER_BAGS', 'maternity_bag'],
  ['Canguru Sling de Bebê para Recém Nascido', 'MLB-BABY_WRAP_SLINGS', 'baby_sling'],
  ['Produto comercial de bebê', undefined, 'baby_towel', 'MLB420379'],
];

for (const [title, domainId, expected, categoryId] of cases) {
  const result = classifyMercadoLivreProduct({ title, domainId, categoryId });
  assert.equal(result.productType, expected, `${title} deveria ser ${expected}`);
  assert.equal(result.status, 'classified');
}

console.log(`mercadolivre-canonical-classifier: ${cases.length} casos aprovados`);
