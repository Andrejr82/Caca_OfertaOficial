'use strict';

const {
  createPeerBenchmarkIndex,
  buildBenchmarkContext,
} = require('../../src/core/trends/benchmark-peer-engine.cjs');
const {
  calculateCommercialOpportunityScoreVNext,
} = require('../../src/core/trends/commercial-opportunity-score-vnext.cjs');
const { selectRadarVNext } = require('../../src/core/trends/radar-vnext-selector.cjs');

function generateMockPool(size = 1700) {
  const pool = [];
  const templates = [
    { title: 'Escova De Limpeza 9 Em 1 Elétrica Giratória Com Cabo Alongador', basePrice: 70, sales: 5000, commission: 20 },
    { title: 'Fatiador Profissional Multifuncional 16 Em 1 Para Vegetais/Frutas/Legumes', basePrice: 35, sales: 12000, commission: 10 },
    { title: 'Ventilador Luminária Led 6 Pás Lâmpada Soquete Bocal E27 Teto', basePrice: 40, sales: 2000, commission: 25 },
    { title: 'Mini Impressora 58mm Portátil Térmica Sem Fio Bluetooth Sem Tinta', basePrice: 90, sales: 1500, commission: 22 },
    { title: 'Câmera Segurança Prova D\'água Infravermelho 360 Wifi Yoosee', basePrice: 60, sales: 1800, commission: 15 },
    { title: 'Console Portátil R36S 64GB Linux 15.000 Jogos IPS 3.5', basePrice: 175, sales: 3000, commission: 10 },
    { title: 'Video Game Stick 4K 20.000 Jogos 2 Controles Sem Fio', basePrice: 110, sales: 2500, commission: 12 },
    { title: 'Suporte Articulado Para Monitor 13 a 32 Pistão a Gás', basePrice: 105, sales: 6000, commission: 4 },
    { title: 'Fone Bluetooth Pro5 Premium TWS Sem Fio Cancelamento Ruído', basePrice: 65, sales: 14000, commission: 3 },
    { title: 'Chaleira Elétrica Inox 1.8L 220V Base 360 Desligamento Automático', basePrice: 40, sales: 5500, commission: 12 },
    { title: 'Organizador De Gavetas Divisórias Multiuso Para Roupas e Armários', basePrice: 22, sales: 3000, commission: 20 },
    { title: 'Mochila Antifurto Impermeável Notebook Com Saída USB', basePrice: 85, sales: 4000, commission: 8 },
    { title: 'Parafusadeira Sem Fio Bivolt 12V Com Maleta e Acessórios', basePrice: 75, sales: 2500, commission: 15 },
    { title: 'Mini Processador E Triturador De Alimentos Manual 3 Laminas', basePrice: 15, sales: 3500, commission: 18 },
    { title: 'Livro Interativo com Som Bilíngue Português-Inglês Educacional', basePrice: 45, sales: 5000, commission: 15 },
    { title: 'Suporte Tablet e Celular Metálico Rotativo Liga de Alumínio', basePrice: 22, sales: 2500, commission: 20 },
  ];

  for (let i = 0; i < size; i++) {
    const tmpl = templates[i % templates.length];
    const priceVariance = (i % 7) * 2 - 6;
    pool.push({
      marketplace: i % 2 === 0 ? 'Shopee' : 'Mercado Livre',
      itemId: `item-${i}`,
      shopId: `shop-${i % 80}`,
      productName: `${tmpl.title} Modelo V${i}`,
      currentPrice: Math.max(10, tmpl.basePrice + priceVariance),
      sales: Math.max(100, tmpl.sales + (i * 5)),
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

function benchmarkScale(size) {
  const pool = generateMockPool(size);

  const t0 = performance.now();
  const index = createPeerBenchmarkIndex(pool);
  const tIndex = performance.now();

  const benchmarkCache = new Map();
  const contextForCandidate = (c) => {
    let bench = benchmarkCache.get(c);
    if (!bench) {
      bench = buildBenchmarkContext(c, index);
      benchmarkCache.set(c, bench);
    }
    return { benchmark: bench, pool };
  };

  const tBenchStart = performance.now();
  // Benchmark + scoring de todos os candidatos
  for (const c of pool) {
    const ctx = contextForCandidate(c);
    calculateCommercialOpportunityScoreVNext(c, ctx);
  }
  const tScoreEnd = performance.now();

  // Seleção Top 20 com diversidade
  const tSelectStart = performance.now();
  const selected = selectRadarVNext(pool, {
    maxProducts: 20,
    contextForCandidate,
  });
  const tSelectEnd = performance.now();

  const totalMs = tSelectEnd - t0;
  const indexMs = tIndex - t0;
  const scoreMs = tScoreEnd - tBenchStart;
  const selectMs = tSelectEnd - tSelectStart;

  return {
    size,
    selectedCount: selected.length,
    classificationCalls: index.metrics.classificationCalls,
    peerComparisonsTotal: index.metrics.peerComparisonsTotal,
    maxBucketSize: index.metrics.maxBucketSize,
    avgBucketSize: Math.round(index.metrics.avgBucketSize * 10) / 10,
    bucketCount: index.metrics.bucketCount,
    indexMs: Math.round(indexMs * 10) / 10,
    scoreMs: Math.round(scoreMs * 10) / 10,
    selectMs: Math.round(selectMs * 10) / 10,
    totalMs: Math.round(totalMs * 10) / 10,
  };
}

console.log('<<<BENCHMARK_SCALE_START>>>');
const results = [
  benchmarkScale(500),
  benchmarkScale(1000),
  benchmarkScale(1700),
];
console.log(JSON.stringify(results, null, 2));
console.log('<<<BENCHMARK_SCALE_END>>>');
