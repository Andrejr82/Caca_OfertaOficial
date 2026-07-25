const fs = require('fs');
const { selectCopyQueue } = require('./scripts/oracle-worker-discovery-only.cjs');

const payload = JSON.parse(fs.readFileSync('reports/amazon-native-top20-v5-dry-run.json', 'utf8'));

const penalties = [0, -5, -8, -10, -15];

console.log('| Penalidade | Ranking | Selecionados | Deferred | Rejeitados |');
console.log('| ---------: | ------: | -----------: | -------: | ---------: |');

for (const penalty of penalties) {
  process.env.AMAZON_MISSING_COMMERCIAL_DATA_PENALTY = penalty;
  
  const products = payload.products.map((p, index) => ({
    ...p,
    sourceItemId: p.asin || "mock-" + index,
    sourceUrl: p.canonical_url,
    imageUrl: p.image,
    deterministicScore: p.score || 8, // mocked
    currentPrice: p.price,
    category: { name: p.category, source: 'amazon' },
    discoveredAt: new Date().toISOString(),
    marketplaceMetrics: p.marketplaceMetrics || {}
  }));

  const copyQueueOptions = {
    maxTotal: 50,
    maxPerMarketplace: 50,
    maxPerCategory: 5,
    marketplace: 'Amazon'
  };

  const cycleState = {
    marketplaceCounts: new Map(),
    categoryCounts: new Map(),
    groups: new Set(),
    selectedCount: 0
  };

  const result = selectCopyQueue(products, copyQueueOptions, cycleState, []);
  
  console.log(`| ${penalty} | ${products.length} | ${result.selected.length} | ${result.deferred.length} | ${result.skipped.length} |`);
}
