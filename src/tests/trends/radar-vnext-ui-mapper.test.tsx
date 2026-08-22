import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { mapTrendRadarSnapshotView, type TrendRadarSnapshotView, type TrendRadarSnapshotProductView } from '@/lib/trends/radar-queries';
import { ExecutiveRadarOverview } from '@/components/trends/executive-radar-overview';

describe('Radar VNext UI Query Mapper and Overview Component - Strict Economics', () => {
  const baseRun = {
    id: 'run-1',
    radar_date: '2026-08-22',
    window_start: '2026-08-15T00:00:00Z',
    window_end: '2026-08-22T00:00:00Z',
    strategy_version: 'commercial-opportunity-vnext/1',
    status: 'completed',
    generated_at: '2026-08-22T12:00:00Z',
    source_health: {},
    executive_summary: {},
  };

  it('CASO 1: observed exibe valor factual de comissão e estimativa por venda', () => {
    const productRow = {
      id: 'prod-1',
      priority: 1,
      product_term: 'Fone Bluetooth TWS Pro',
      normalized_product_term: 'fone bluetooth tws pro',
      category: 'Audio',
      marketplace: 'Shopee',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: 77,
      confidence: 85,
      score_breakdown: { competitiveness: 27, demandAcceleration: 15, economicReturn: 7 },
      determining_reasons: ['Preço competitivo', 'Demanda acelerada'],
      is_focus: true,
      opportunity_id: null,
      recommended_channel: null,
      recommended_format: null,
      selection_decision: 'TESTAR',
      selection_decided_at: null,
      selected_offer_id: null,
      execution_context: {},
      direct_evidence: [
        {
          price: 18.90,
          discount_percent: 30,
          raw_decision: 'TESTAR',
          strategy_version: 'commercial-opportunity-vnext/1',
          benchmark: {
            peerCount: 3,
            peerConfidence: 'MEDIUM',
            benchmarkStatus: 'authoritative',
            peerPriceMin: 22.50,
            peerPriceMedian: 24.90,
            peerPriceMax: 26.00,
            priceVsMedianPercent: 24.1,
          },
          economic_return: {
            status: 'observed',
            effectiveCommissionPercent: 8,
            estimatedCommissionPerSale: 1.51,
          },
          marketplace_identity: {
            itemId: '1001',
            shopId: '101',
            productId: null,
            shopType: 'official',
          },
          commercial_metrics: {
            sales: 8000,
            commissionRate: 8,
            sellerCommissionRate: 0,
          },
        },
      ],
    };

    const view = mapTrendRadarSnapshotView(baseRun, [productRow as any]);
    expect(view.products).toHaveLength(1);
    const p = view.products[0];

    expect(p.economicReturn).toEqual({
      status: 'observed',
      effectiveCommissionPercent: 8,
      estimatedCommissionPerSale: 1.51,
    });

    render(
      <ExecutiveRadarOverview
        latestSnapshot={view}
        strongestNiches={[]}
        ranking={[]}
        radarSources={['Shopee']}
        activeExperiments={[]}
      />
    );

    expect(screen.getByText('Comissão 8% · ~R$ 1,51/venda')).toBeTruthy();
  });

  it('CASO 2: economic_return ausente com commercial_metrics.commissionRate = 12 NÃO fabrica comissão e exibe "Comissão não observada"', () => {
    const productRow = {
      id: 'prod-2',
      priority: 1,
      product_term: 'Produto Sem Economic Return',
      normalized_product_term: 'produto sem economic return',
      category: 'Utilidades',
      marketplace: 'Shopee',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: 70,
      confidence: 75,
      score_breakdown: {},
      determining_reasons: [],
      is_focus: true,
      opportunity_id: null,
      recommended_channel: null,
      recommended_format: null,
      selection_decision: 'TESTAR',
      selection_decided_at: null,
      selected_offer_id: null,
      execution_context: {},
      direct_evidence: [
        {
          price: 50.00,
          commercial_metrics: {
            commissionRate: 12,
            sellerCommissionRate: 0,
          },
        },
      ],
    };

    const view = mapTrendRadarSnapshotView(baseRun, [productRow as any]);
    expect(view.products[0].economicReturn).toBe(null);

    render(
      <ExecutiveRadarOverview
        latestSnapshot={view}
        strongestNiches={[]}
        ranking={[]}
        radarSources={['Shopee']}
        activeExperiments={[]}
      />
    );

    expect(screen.getByText('Comissão não observada')).toBeTruthy();
    expect(screen.queryByText('Comissão 12%')).toBeNull();
    expect(screen.queryByText(/12%/)).toBeNull();
  });

  it('CASO 3: economic_return status unknown com commercial_metrics.commissionRate = 15 exibe "Comissão não observada"', () => {
    const productRow = {
      id: 'prod-3',
      priority: 1,
      product_term: 'Smartwatch Status Unknown',
      normalized_product_term: 'smartwatch status unknown',
      category: 'Eletrônicos',
      marketplace: 'Shopee',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: 65,
      confidence: 70,
      score_breakdown: {},
      determining_reasons: [],
      is_focus: true,
      opportunity_id: null,
      recommended_channel: null,
      recommended_format: null,
      selection_decision: 'OBSERVAR',
      selection_decided_at: null,
      selected_offer_id: null,
      execution_context: {},
      direct_evidence: [
        {
          price: 45.00,
          economic_return: {
            status: 'unknown',
            effectiveCommissionPercent: null,
            estimatedCommissionPerSale: null,
          },
          commercial_metrics: {
            commissionRate: 15,
          },
        },
      ],
    };

    const view = mapTrendRadarSnapshotView(baseRun, [productRow as any]);
    expect(view.products[0].economicReturn?.status).toBe('unknown');

    render(
      <ExecutiveRadarOverview
        latestSnapshot={view}
        strongestNiches={[]}
        ranking={[]}
        radarSources={['Shopee']}
        activeExperiments={[]}
      />
    );

    expect(screen.getByText('Comissão não observada')).toBeTruthy();
    expect(screen.queryByText('Comissão 15%')).toBeNull();
    expect(screen.queryByText('Comissão 0%')).toBeNull();
  });

  it('CASO 4: observed com percentual factual 0 exibe "Comissão 0% · ~R$ 0,00/venda"', () => {
    const productRow = {
      id: 'prod-4',
      priority: 1,
      product_term: 'Produto Zero Factual',
      normalized_product_term: 'produto zero factual',
      category: 'Geral',
      marketplace: 'Shopee',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: 55,
      confidence: 60,
      score_breakdown: {},
      determining_reasons: [],
      is_focus: true,
      opportunity_id: null,
      recommended_channel: null,
      recommended_format: null,
      selection_decision: 'OBSERVAR',
      selection_decided_at: null,
      selected_offer_id: null,
      execution_context: {},
      direct_evidence: [
        {
          price: 20.00,
          economic_return: {
            status: 'observed',
            effectiveCommissionPercent: 0,
            estimatedCommissionPerSale: 0,
          },
        },
      ],
    };

    const view = mapTrendRadarSnapshotView(baseRun, [productRow as any]);
    expect(view.products[0].economicReturn?.effectiveCommissionPercent).toBe(0);
    expect(view.products[0].economicReturn?.estimatedCommissionPerSale).toBe(0);

    render(
      <ExecutiveRadarOverview
        latestSnapshot={view}
        strongestNiches={[]}
        ranking={[]}
        radarSources={['Shopee']}
        activeExperiments={[]}
      />
    );

    expect(screen.getByText('Comissão 0% · ~R$ 0,00/venda')).toBeTruthy();
  });

  it('Compatibilidade V4: produto V4 com commission_status observed exibe comissão factual; sem observed exibe não observada', () => {
    const v4ObservedRow = {
      id: 'v4-obs',
      priority: 1,
      product_term: 'Produto V4 Observed',
      normalized_product_term: 'produto v4 observed',
      category: 'Utilidades',
      marketplace: 'Shopee',
      evidence_status: 'verified',
      source_count: 1,
      commercial_score: 85,
      confidence: 80,
      score_breakdown: {},
      determining_reasons: [],
      is_focus: true,
      opportunity_id: null,
      recommended_channel: null,
      recommended_format: null,
      selection_decision: 'PRIORIDADE',
      selection_decided_at: null,
      selected_offer_id: null,
      execution_context: {},
      direct_evidence: [
        {
          price: 40.00,
          commission_status: 'observed',
          effective_commission_percent: 6,
          estimated_commission_per_sale: 2.4,
        },
      ],
    };

    const view = mapTrendRadarSnapshotView({ ...baseRun, strategy_version: 'commercial-opportunity-v4' }, [v4ObservedRow as any]);

    render(
      <ExecutiveRadarOverview
        latestSnapshot={view}
        strongestNiches={[]}
        ranking={[]}
        radarSources={['Shopee']}
        activeExperiments={[]}
      />
    );

    expect(screen.getByText('Comissão 6% · ~R$ 2,40/venda')).toBeTruthy();
  });
});
