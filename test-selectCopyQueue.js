const crypto = require('crypto');

const curationPolicyModulePath = require.resolve('./scripts/curation-policy.cjs');
require(curationPolicyModulePath);
require.cache[curationPolicyModulePath].exports.qualityGate = (product) => {
  if (product.sourceItemId.startsWith('reject')) return { eligible: false, reasons: ['rejected_by_test'] };
  if (product.sourceItemId.startsWith('skip')) return { eligible: false, reasons: ['skipped_by_test'] };
  return { eligible: true, reasons: [] };
};
require.cache[curationPolicyModulePath].exports.scoreCandidate = () => 10;

const { selectCopyQueue } = require('./scripts/oracle-worker-discovery-only.cjs');

const products = [];
// 3 selected
for(let i=1; i<=3; i++) products.push({ sourceItemId: `select_${i}`, title: `Produto Bom ${i}`, price: 100, originalPrice: 200, category: { name: 'Cat1' } });
// 20 deferred
for(let i=1; i<=20; i++) products.push({ sourceItemId: `defer_${i}`, title: `Produto Muito ${i}`, price: 100, originalPrice: 200, category: { name: 'Cat2' } });
// 5 skipped
for(let i=1; i<=5; i++) products.push({ sourceItemId: `skip_${i}`, title: `Produto Skip ${i}`, price: 100, originalPrice: 200, category: { name: 'Cat1' } });
// 4 rejected
for(let i=1; i<=4; i++) products.push({ sourceItemId: `reject_${i}`, title: `Produto Reject ${i}`, price: 100, originalPrice: 200, category: { name: 'Cat1' } });

const options = { maxTotal: 3, maxPerMarketplace: 30, maxPerCategory: 30, marketplace: 'Shopee' };
const result = selectCopyQueue(products, options);

console.log('ENTRADA:', products.length);
console.log('RESULTADO DO SELETOR:');
console.log('  Selected:', result.selected.length);
console.log('  Deferred:', result.deferred.length);
console.log('  Skipped total:', result.skipped.length);
const skipped = result.skipped.filter(s => s.reason === 'skipped_by_test').length;
const rejected = result.skipped.filter(s => s.reason === 'rejected_by_test').length;
console.log('  Skipped By Gate:', skipped);
console.log('  Rejected By Gate:', rejected);
