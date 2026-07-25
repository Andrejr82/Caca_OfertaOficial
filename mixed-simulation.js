const { selectCopyQueue } = require('./scripts/oracle-worker-discovery-only.cjs');
const { scoreCandidate } = require('./scripts/curation-policy.cjs');

function mockProduct(marketplace, id, category, price, discount, rating, amazonMetrics = {}) {
  const p = {
    marketplace,
    sourceItemId: id,
    sourceUrl: `https://${marketplace}.com/dp/${id}`,
    imageUrl: 'https://example.com/img.jpg',
    title: `${marketplace} ${id} - ${category}`,
    currentPrice: price,
    originalPrice: discount > 0 ? price / (1 - discount/100) : null,
    deterministicScore: 8,
    category: { name: category, source: 'mock' },
    discoveredAt: new Date().toISOString(),
    marketplaceMetrics: { rating: rating || 0, sales: 1000, reviewCount: 500, ...amazonMetrics }
  };
  return p;
}

const mixedProducts = [
  // Amazon sem dados comerciais
  mockProduct('Amazon', '12345', 'Gadget', 100, 0, null),
  // ML com os mesmos dados, mas com 5% de desconto
  mockProduct('MercadoLivre', '54321', 'Gadget', 100, 5, 4.5),
  // Outro ML com menos desconto
  mockProduct('MercadoLivre', '99999', 'Gadget', 100, 2, 4.5),
];

const penalties = [0, -5, -8, -10, -15];

console.log('| Penalidade | Selecionados (Top 2) | Deferred |');
console.log('| ---------: | -------------------- | -------- |');

for (const penalty of penalties) {
  process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY = penalty;

  const cycleState = {
    marketplaceCounts: new Map(),
    categoryCounts: new Map(),
    groups: new Set(),
    selectedCount: 0
  };

  const copyQueueOptions = {
    maxTotal: 2, // Apenas os 2 melhores selecionados
    maxPerMarketplace: 5,
    maxPerCategory: 3,
    marketplace: null
  };

  const result = selectCopyQueue(mixedProducts, copyQueueOptions, cycleState, []);
  
  const selectedIds = result.selected.map(p => p.sourceItemId).join(', ');
  const deferredIds = result.deferred.map(p => p.sourceItemId).join(', ');

  console.log(`| ${penalty} | ${selectedIds || '-'} | ${deferredIds || '-'} |`);
}
