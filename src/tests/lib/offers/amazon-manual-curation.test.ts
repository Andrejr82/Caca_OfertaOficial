import { describe, it, expect } from 'vitest';
import { assertAmazonSelected } from '../../../lib/offers/amazon-manual-curation';

describe('Gate de IA Amazon V5', () => {
  it('deve bloquear quando a plataforma for Amazon e status for pending_manual_review', () => {
    expect(() => assertAmazonSelected({ platform: 'Amazon', status: 'pending_manual_review' })).toThrow(/Amazon V5 exige seleção manual/);
  });
  
  it('deve permitir quando a plataforma for Amazon e status for selected', () => {
    expect(() => assertAmazonSelected({ platform: 'Amazon', status: 'selected' })).not.toThrow();
  });
  
  it('deve bloquear quando a plataforma for Amazon e status for null ou outro estado', () => {
    expect(() => assertAmazonSelected({ platform: 'Amazon', status: null })).toThrow(/Amazon V5 exige seleção manual/);
    expect(() => assertAmazonSelected({ platform: 'Amazon', status: 'draft' })).toThrow(/Amazon V5 exige seleção manual/);
  });
  
  it('deve bloquear se a plataforma estiver ausente (null/vazio)', () => {
    expect(() => assertAmazonSelected({ platform: null, status: 'selected' })).toThrow(/Marketplace inválido/);
    expect(() => assertAmazonSelected({ platform: '', status: 'selected' })).toThrow(/Marketplace inválido/);
  });
  
  it('não deve bloquear outros marketplaces (deve passar direto pela assertAmazonSelected)', () => {
    // Other marketplaces should be ignored by the Amazon assert
    expect(() => assertAmazonSelected({ platform: 'Shopee', status: 'pending_manual_review' })).not.toThrow();
    expect(() => assertAmazonSelected({ platform: 'Mercado Livre', status: 'draft' })).not.toThrow();
  });
});
