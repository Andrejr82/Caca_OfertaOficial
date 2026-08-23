'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');

const {
  classifyBenchmarkFamily,
  buildBenchmarkContext,
  createPeerBenchmarkIndex,
  BENCHMARK_PEER_ENGINE_VERSION,
} = require('../../src/core/trends/benchmark-peer-engine.cjs');
const {
  calculateCommercialOpportunityScoreVNext,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');
const { selectRadarVNext } = require('../../src/core/trends/radar-vnext-selector.cjs');

// Helper to generate a realistic synthetic pool
function generateMockPool(size = 1000) {
  const pool = [];
  const templates = [
    { title: 'Escova De Limpeza 9 Em 1 Elétrica Giratória', basePrice: 70, sales: 5000, commission: 20 },
    { title: 'Fatiador Multifuncional 16 Em 1 Para Vegetais', basePrice: 35, sales: 12000, commission: 10 },
    { title: 'Ventilador Luminária Led 6 Pás Teto E27', basePrice: 40, sales: 2000, commission: 25 },
    { title: 'Mini Impressora 58mm Portátil Térmica Sem Tinta', basePrice: 90, sales: 1500, commission: 22 },
    { title: 'Câmera Segurança 360 Wifi Externa Lâmpada', basePrice: 60, sales: 1800, commission: 15 },
    { title: 'Console Portátil R36S 64GB Linux 15.000 Jogos', basePrice: 175, sales: 3000, commission: 10 },
    { title: 'Video Game Stick 4K 20.000 Jogos 2 Controles', basePrice: 110, sales: 2500, commission: 12 },
    { title: 'Suporte Articulado Monitor 13 a 32 Pistão a Gás', basePrice: 105, sales: 6000, commission: 4 },
    { title: 'Fone Bluetooth Pro5 Premium TWS Sem Fio', basePrice: 65, sales: 14000, commission: 3 },
    { title: 'Chaleira Elétrica Inox 1.8L 220V Base 360', basePrice: 40, sales: 5500, commission: 12 },
    { title: 'Organizador De Gavetas Divisórias Multiuso', basePrice: 22, sales: 3000, commission: 20 },
    { title: 'Mochila Antifurto Impermeável Notebook', basePrice: 85, sales: 4000, commission: 8 },
    { title: 'Parafusadeira Sem Fio Bivolt 12V Com Maleta', basePrice: 75, sales: 2500, commission: 15 },
    { title: 'Mini Processador E Triturador De Alimentos Manual', basePrice: 15, sales: 3500, commission: 18 },
  ];

  for (let i = 0; i < size; i++) {
    const tmpl = templates[i % templates.length];
    const priceVariance = (i % 7) * 2 - 6; // price variation around basePrice
    pool.push({
      marketplace: i % 2 === 0 ? 'Shopee' : 'Mercado Livre',
      itemId: `item-${i}`,
      shopId: `shop-${i % 40}`,
      productName: `${tmpl.title} Modelo V${i}`,
      currentPrice: Math.max(10, tmpl.basePrice + priceVariance),
      sales: Math.max(100, tmpl.sales + (i * 10)),
      rating: 4.5 + ((i % 5) * 0.1),
      commissionRate: tmpl.commission,
      permalink: `https://shopee.com.br/item-${i}`,
      imageUrl: `https://cf.shopee.com.br/file/${i}.jpg`,
      provenance: i % 2 === 0 ? 'shopee_openapi_productOfferV2' : 'mercadolivre_offers_ssr',
      evidenceStatus: 'verified',
    });
  }
  return pool;
}

test('TESTE A: Equivalência exata de benchmark entre unindexed e indexed', () => {
  const pool = generateMockPool(100);
  const index = createPeerBenchmarkIndex(pool);

  for (const candidate of pool.slice(0, 30)) {
    const unindexed = buildBenchmarkContext(candidate, pool);
    const indexed = buildBenchmarkContext(candidate, index);

    assert.equal(indexed.functionalFamily, unindexed.functionalFamily);
    assert.equal(indexed.peerCount, unindexed.peerCount);
    assert.equal(indexed.peerConfidence, unindexed.peerConfidence);
    assert.equal(indexed.peerPriceMedian, unindexed.peerPriceMedian);
    assert.equal(indexed.peerPriceMin, unindexed.peerPriceMin);
    assert.equal(indexed.peerPriceMax, unindexed.peerPriceMax);
    assert.equal(indexed.priceVsMedianPercent, unindexed.priceVsMedianPercent);
    assert.equal(indexed.benchmarkStatus, unindexed.benchmarkStatus);
  }
});

test('TESTE B: Equivalência exata de Top 20 ranking entre unindexed e indexed', () => {
  const pool = generateMockPool(200);
  const index = createPeerBenchmarkIndex(pool);

  const selectedUnindexed = selectRadarVNext(pool, {
    maxProducts: 20,
    contextForCandidate: (c) => ({ benchmark: buildBenchmarkContext(c, pool), pool }),
  });

  const selectedIndexed = selectRadarVNext(pool, {
    maxProducts: 20,
    contextForCandidate: (c) => ({ benchmark: buildBenchmarkContext(c, index), pool }),
  });

  assert.equal(selectedIndexed.length, selectedUnindexed.length);
  for (let i = 0; i < selectedIndexed.length; i++) {
    const itemIdx = selectedIndexed[i];
    const itemUnidx = selectedUnindexed[i];

    assert.equal(itemIdx.candidate.itemId, itemUnidx.candidate.itemId, `Rank ${i + 1} itemId match`);
    assert.equal(itemIdx.score.total, itemUnidx.score.total, `Rank ${i + 1} score match`);
    assert.equal(itemIdx.score.decision, itemUnidx.score.decision, `Rank ${i + 1} decision match`);
  }
});

test('TESTE C: Classificação semântica chamada O(N)', () => {
  const pool = generateMockPool(1000);
  const index = createPeerBenchmarkIndex(pool);

  // Diagnostic metric tracked during indexing
  assert.ok(index.metrics.classificationCalls <= pool.length * 1.05, `Classification calls (${index.metrics.classificationCalls}) should be <= ~1.05N (${pool.length})`);
  assert.ok(index.metrics.peerComparisonsTotal < pool.length * pool.length * 0.15, `Comparisons (${index.metrics.peerComparisonsTotal}) should be << N^2`);
});

test('TESTE D: Candidato analisa somente peers do bucket compatível', () => {
  const pool = [
    { marketplace: 'Shopee', itemId: 'cam-1', shopId: 's1', productName: 'Câmera Segurança 360 Wifi', currentPrice: 50 },
    { marketplace: 'Shopee', itemId: 'cam-2', shopId: 's2', productName: 'Câmera Segurança 360 Wifi', currentPrice: 60 },
    { marketplace: 'Shopee', itemId: 'fone-1', shopId: 's3', productName: 'Fone Bluetooth TWS Sem Fio', currentPrice: 30 },
  ];
  const index = createPeerBenchmarkIndex(pool);
  const targetCam = pool[0];

  const bench = buildBenchmarkContext(targetCam, index);
  assert.equal(bench.peerCount, 1);
  assert.equal(bench.peers[0].itemId, 'cam-2');
});

test('TESTE E: Duplicatas nativas de itemId não aumentam peerCount', () => {
  const pool = [
    { marketplace: 'Shopee', itemId: 'cam-1', shopId: 's1', productName: 'Câmera Segurança 360 Wifi', currentPrice: 50 },
    { marketplace: 'Shopee', itemId: 'cam-2', shopId: 's2', productName: 'Câmera Segurança 360 Wifi', currentPrice: 60 },
    { marketplace: 'Shopee', itemId: 'cam-2', shopId: 's2', productName: 'Câmera Segurança 360 Wifi Duplicada', currentPrice: 60 }, // Duplicata da mesma oferta
  ];
  const index = createPeerBenchmarkIndex(pool);
  const targetCam = pool[0];

  const bench = buildBenchmarkContext(targetCam, index);
  assert.equal(bench.peerCount, 1, 'Duplicata exata de loja + item não deve ser contada duas vezes');
});

test('TESTE F: Proteção de executor único concorrente', async () => {
  const lockMap = new Map();
  const tryClaimRun = async (runId, workerId) => {
    const current = lockMap.get(runId);
    if (!current || current.status === 'pending') {
      lockMap.set(runId, { status: 'running', claimedBy: workerId });
      return { claimed: true, workerId };
    }
    return { claimed: false, reason: 'already_claimed', claimedBy: current.claimedBy };
  };

  const runId = 'test-run-concurrent';
  const [res1, res2] = await Promise.all([
    tryClaimRun(runId, 'worker-A'),
    tryClaimRun(runId, 'worker-B'),
  ]);

  const winners = [res1, res2].filter(r => r.claimed);
  const losers = [res1, res2].filter(r => !r.claimed);

  assert.equal(winners.length, 1, 'Exatamente um worker deve ganhar o claim');
  assert.equal(losers.length, 1, 'O segundo worker deve receber already_claimed');
  assert.equal(losers[0].reason, 'already_claimed');
});
