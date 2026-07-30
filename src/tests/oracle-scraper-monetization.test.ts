import { describe, it, expect } from 'vitest';
const scraper = require('../../scripts/oracle-scraper.cjs');


describe('oracle-scraper.cjs Monetization', () => {
  it('função disponível no carregamento usado por oracle-scraper.cjs', () => {
    expect(scraper.generateMLAffiliateLinkWithId).toBeTypeOf('function');
    expect(scraper.processMonetization).toBeTypeOf('function');
  });

  it('URL Mercado Livre válida gera URL afiliada', () => {
    const originalUrl = 'https://produto.mercadolivre.com.br/MLB-123456789-cafeteira-eletrica-cadence-_JM';
    const affiliateId = 'cacaofertaoficial';
    
    // Testing the inner function directly
    const affiliateUrl = scraper.generateMLAffiliateLinkWithId(originalUrl, affiliateId);
    expect(affiliateUrl).toContain('partner_id=cacaofertaoficial');
    expect(affiliateUrl).toContain('utm_source=caca_oferta');
    expect(affiliateUrl).not.toContain('#');
    
    // Testing the processMonetization integration
    process.env.MERCADO_LIVRE_AFFILIATE_ID = affiliateId;
    const result = scraper.processMonetization('Mercado Livre', originalUrl);
    expect(result.valid).toBe(true);
    expect(result.affiliateUrl).toContain('partner_id=cacaofertaoficial');
  });

  it('URL comum não é tratada como afiliada (Mercado Livre sem partner_id)', () => {
    // If the affiliate generator fails or generates something invalid
    const originalUrl = 'https://produto.mercadolivre.com.br/MLB-123456789';
    // Passing empty affiliate ID should return original url
    const affiliateUrl = scraper.generateMLAffiliateLinkWithId(originalUrl, '');
    expect(affiliateUrl).toBe(originalUrl);
    
    // processMonetization should mark it invalid if partner_id is missing
    process.env.MERCADO_LIVRE_AFFILIATE_ID = ' ';
    const result = scraper.processMonetization('Mercado Livre', originalUrl);
    expect(result.valid).toBe(false);
    expect(result.affiliateUrl).toBe(originalUrl);
  });
});
