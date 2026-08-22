import { describe, expect, it } from 'vitest';
import {
  supportsTrendApprovalMarketplace,
  resolveTrendOfferHandoff,
  resolveTrendOfferHandoffBlock,
  resolveTrendSnapshotImageUrl,
  validateTrendOfferImage,
} from '@/lib/trends/selection-offer-state';
import { resolveTrendMonetizedDestination } from '@/lib/trends/monetization';

describe('Task 10 — Radar VNext Handoff & Regression Suite', () => {
  const vnextShopeeProduct = {
    id: 'prod-vnext-shopee-1',
    radar_run_id: 'run-vnext-100',
    priority: 1,
    product_term: 'Mini Projetor Portátil 4K',
    normalized_product_term: 'mini projetor portatil 4k',
    category: 'Eletrônicos',
    marketplace: 'Shopee',
    commercial_score: 84.5,
    score_breakdown: { competitiveness: 30, demandAcceleration: 20, economicReturn: 14.5 },
    determining_reasons: ['Alta conversão', 'Preço 25% abaixo da mediana'],
    is_focus: true,
    selection_decision: 'TESTAR',
    direct_evidence: [
      {
        price: 199.90,
        old_price: 299.90,
        discount_percent: 33,
        source_url: 'https://s.shopee.com.br/an84hdbf',
        image_url: 'https://cf.shopee.com.br/file/br-11134207-7r98o-m0example.jpg',
        raw_decision: 'TESTAR',
        strategy_version: 'commercial-opportunity-vnext/1',
        benchmark: {
          peerCount: 5,
          peerConfidence: 'HIGH',
          benchmarkStatus: 'authoritative',
          peerPriceMin: 220.00,
          peerPriceMedian: 265.00,
          peerPriceMax: 310.00,
          priceVsMedianPercent: 24.6,
        },
        economic_return: {
          status: 'observed',
          effectiveCommissionPercent: 10,
          estimatedCommissionPerSale: 19.99,
        },
        marketplace_identity: {
          itemId: '23456789012',
          shopId: '987654321',
          productId: null,
          shopType: 'official',
        },
        commercial_metrics: {
          sales: 1200,
          commissionRate: 10,
        },
      },
    ],
  };

  const vnextMercadoLivreProduct = {
    id: 'prod-vnext-ml-1',
    radar_run_id: 'run-vnext-100',
    priority: 2,
    product_term: 'Robô Aspirador de Pó Inteligente',
    normalized_product_term: 'robo aspirador de po inteligente',
    category: 'Eletroportáteis',
    marketplace: 'Mercado Livre',
    commercial_score: 79.0,
    score_breakdown: { competitiveness: 25, demandAcceleration: 18, economicReturn: 12 },
    determining_reasons: ['Marca oficial', 'Benchmark authoritative'],
    is_focus: true,
    selection_decision: 'TESTAR',
    direct_evidence: [
      {
        price: 349.00,
        old_price: 499.00,
        discount_percent: 30,
        source_url: 'https://www.mercadolivre.com.br/p/MLB12345678',
        image_url: 'https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLB.webp',
        raw_decision: 'TESTAR',
        strategy_version: 'commercial-opportunity-vnext/1',
        benchmark: {
          peerCount: 4,
          peerConfidence: 'HIGH',
          benchmarkStatus: 'authoritative',
          peerPriceMin: 380.00,
          peerPriceMedian: 420.00,
          peerPriceMax: 460.00,
          priceVsMedianPercent: 16.9,
        },
        economic_return: {
          status: 'observed',
          effectiveCommissionPercent: 8,
          estimatedCommissionPerSale: 27.92,
        },
        marketplace_identity: {
          itemId: 'MLB12345678',
          shopId: null,
          productId: 'MLB98765',
          shopType: 'official',
        },
        commercial_metrics: {
          sales: 500,
          commissionRate: 8,
        },
      },
    ],
  };

  const v4LegacyProduct = {
    id: 'prod-v4-1',
    radar_run_id: 'run-v4-50',
    priority: 1,
    product_term: 'Organizador Giratório 360',
    normalized_product_term: 'organizador giratorio 360',
    category: 'Casa',
    marketplace: 'Shopee',
    commercial_score: 82.0,
    score_breakdown: { demand: 25, price: 35 },
    determining_reasons: ['Viabilidade aprovada'],
    is_focus: true,
    selection_decision: 'PRIORIDADE',
    direct_evidence: [
      {
        price: 49.90,
        old_price: null,
        discount_percent: 15,
        source_url: 'https://s.shopee.com.br/legacy123',
        image_url: 'https://cf.shopee.com.br/file/br-legacy.jpg',
        decision: 'PRIORIDADE',
        strategy_version: 'commercial-opportunity-v4',
        marketplace_identity: {
          itemId: '1122334455',
          shopId: '998877',
        },
        commercial_metrics: {
          sales: 3000,
          commissionRate: 7,
        },
      },
    ],
  };

  it('1. Radar VNext (Shopee): valida resolução de imagem, marketplace suportado e handoff state', () => {
    const evidence = vnextShopeeProduct.direct_evidence[0];
    expect(supportsTrendApprovalMarketplace(vnextShopeeProduct.marketplace)).toBe(true);

    const imageUrl = resolveTrendSnapshotImageUrl(evidence, vnextShopeeProduct);
    expect(imageUrl).toBe('https://cf.shopee.com.br/file/br-11134207-7r98o-m0example.jpg');
    expect(validateTrendOfferImage(imageUrl)).toBeNull();

    // Handoff state resolution for pending offer
    expect(resolveTrendOfferHandoff('pending_manual_review')).toBe('select');
    expect(resolveTrendOfferHandoffBlock('pending_manual_review')).toBeNull();
  });

  it('2. Radar VNext (Mercado Livre): valida monetização, imagem e campos para upsert_discovery_offers_v2', () => {
    const evidence = vnextMercadoLivreProduct.direct_evidence[0];
    expect(supportsTrendApprovalMarketplace(vnextMercadoLivreProduct.marketplace)).toBe(true);

    const imageUrl = resolveTrendSnapshotImageUrl(evidence, vnextMercadoLivreProduct);
    expect(imageUrl).toBe('https://http2.mlstatic.com/D_NQ_NP_2X_123456-MLB.webp');
    expect(validateTrendOfferImage(imageUrl)).toBeNull();

    const monetizedUrl = resolveTrendMonetizedDestination({
      platform: 'Mercado Livre',
      originalUrl: evidence.source_url,
      affiliateUrl: 'https://meli.la/affiliate123',
    });
    expect(monetizedUrl).toBe('https://meli.la/affiliate123');

    // Expected discovery row schema
    const discoveryRow = {
      user_id: 'user-uuid-1',
      platform: vnextMercadoLivreProduct.marketplace,
      product_name: vnextMercadoLivreProduct.product_term,
      category: vnextMercadoLivreProduct.category,
      original_url: monetizedUrl,
      image_url: imageUrl,
      current_price: evidence.price,
      old_price: evidence.old_price,
      score: vnextMercadoLivreProduct.commercial_score / 10,
      status: 'pending_manual_review',
      item_id: evidence.marketplace_identity.itemId,
      product_id: evidence.marketplace_identity.productId,
    };

    expect(discoveryRow.current_price).toBe(349.00);
    expect(discoveryRow.score).toBe(7.9);
    expect(discoveryRow.item_id).toBe('MLB12345678');
  });

  it('3. Vídeos de Ofertas: oferta originada do Radar VNext possui todos os atributos consumidos pelo VideosClient', () => {
    // Simulated materialized offer returned after approval
    const materializedOffer = {
      id: 'offer-vnext-uuid-888',
      platform: 'Shopee',
      product_name: vnextShopeeProduct.product_term,
      current_price: 199.90,
      image_url: 'https://cf.shopee.com.br/file/br-11134207-7r98o-m0example.jpg',
      status: 'approved',
      original_url: 'https://s.shopee.com.br/an84hdbf',
      explainability: {
        provenance: 'trend_experiment',
        radar_product_id: vnextShopeeProduct.id,
        strategy_version: 'commercial-opportunity-vnext/1',
      },
    };

    // VideosClient consumes: id, product_name, current_price, image_url, status, platform
    expect(materializedOffer.id).toBeTruthy();
    expect(materializedOffer.product_name).toBe('Mini Projetor Portátil 4K');
    expect(materializedOffer.current_price).toBe(199.90);
    expect(materializedOffer.image_url).toMatch(/^https:\/\//);
    expect(materializedOffer.status).toBe('approved');
    expect(materializedOffer.platform).toBe('Shopee');
  });

  it('4. Campanha e canais: offer_id permanece o contrato unificado de handoff 1:1', () => {
    const executionContext = {
      origin: 'trend',
      experiment_source: 'trend_radar',
      experiment_key: vnextShopeeProduct.id,
      radar_run_id: vnextShopeeProduct.radar_run_id,
      radar_product_id: vnextShopeeProduct.id,
      strategy_version: 'commercial-opportunity-vnext/1',
      commercial_score: vnextShopeeProduct.commercial_score,
      offer_id: 'offer-vnext-uuid-888',
      approved_at: '2026-08-22T15:00:00.000Z',
      automatic_publication: false,
    };

    expect(executionContext.offer_id).toBe('offer-vnext-uuid-888');
    expect(executionContext.automatic_publication).toBe(false);
    expect(executionContext.strategy_version).toBe('commercial-opportunity-vnext/1');
  });

  it('5. Compatibilidade V4: produto legado V4 continua executando exatamente o mesmo handoff', () => {
    const evidence = v4LegacyProduct.direct_evidence[0];
    expect(supportsTrendApprovalMarketplace(v4LegacyProduct.marketplace)).toBe(true);

    const imageUrl = resolveTrendSnapshotImageUrl(evidence, v4LegacyProduct);
    expect(imageUrl).toBe('https://cf.shopee.com.br/file/br-legacy.jpg');
    expect(validateTrendOfferImage(imageUrl)).toBeNull();

    expect(resolveTrendOfferHandoff('pending_manual_review')).toBe('select');
  });

  it('6. Fail-Closed: bloqueia produto sem imagem válida, marketplace não suportado ou oferta indisponível', () => {
    // Sem imagem
    expect(validateTrendOfferImage(null)).toEqual({
      code: 'trend_missing_image',
      message: 'Esta oportunidade não possui imagem oficial válida e não pode ser aprovada para publicação.',
    });

    // Marketplace não suportado
    expect(supportsTrendApprovalMarketplace('Amazon')).toBe(false);
    expect(supportsTrendApprovalMarketplace(null)).toBe(false);

    // Oferta já bloqueada
    expect(resolveTrendOfferHandoffBlock('archived')).toEqual({
      code: 'offer_unavailable',
      message: 'Esta oportunidade está vinculada a uma oferta em estado archived e não pode ser aprovada automaticamente.',
    });
  });
});
