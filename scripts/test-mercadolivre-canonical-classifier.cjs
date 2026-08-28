'use strict';

const assert = require('node:assert/strict');
const { classifyMercadoLivreProduct, classifyFromEditorialCatalog } = require('./mercadolivre-canonical-classifier.cjs');

const cases = [
  ['Kit 2 Mamadeiras Buba Easy Flow Anticólica', 'MLB-BABY_BOTTLES', 'baby_bottle'],
  ['Kit Bolsa Maternidade com Mochila Bambinelli', 'MLB-DIAPER_BAGS', 'maternity_bag'],
  ['Canguru Sling de Bebê para Recém Nascido', 'MLB-BABY_WRAP_SLINGS', 'baby_sling'],
  ['Produto comercial de bebê', undefined, 'baby_towel', 'MLB420379'],
  ['SSD NVMe Kingston 1TB PCIe 4.0', undefined, 'ssd'],
  ['Nobreak 1200VA Bivolt Senoidal', undefined, 'ups'],
  ['Switch de Rede Gigabit 8 Portas', undefined, 'switch_de_rede'],
];

for (const [title, domainId, expected, categoryId] of cases) {
  const result = classifyMercadoLivreProduct({ title, domainId, categoryId });
  assert.equal(result.productType, expected, `${title} deveria ser ${expected}`);
  assert.equal(result.status, 'classified');
}

const editorial = classifyFromEditorialCatalog({ title: 'Kit Utensílios de Cozinha Silicone 12 Peças', intent: 'kit utensílios cozinha' });
assert.equal(editorial.status, 'classified');
assert.equal(editorial.productType, 'kit_utensilios_cozinha');

console.log(`mercadolivre-canonical-classifier: ${cases.length + 1} casos aprovados`);