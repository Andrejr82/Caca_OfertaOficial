const { parseArgs, buildShadowMetadata, selectShadowCandidates } = require('../generate-commercial-curation-shadow.cjs');

const product = (overrides = {}) => ({ marketplace: 'Shopee', title: 'Organizador de gaveta', price: 39, affiliateUrl: 'https://x', imageUrl: 'https://i', rating: 4.8, sales: 300, marketplaceMetrics: { sales: 300 }, ...overrides });

describe('Commercial Curation shadow', () => {
  it('defaults to dry-run and supports explicit write-shadow', () => {
    expect(parseArgs([])).toMatchObject({ mode: 'dry-run', limit: 50 });
    expect(parseArgs(['--write-shadow', '--limit', '3', '--intent', 'tech_de_bolso'])).toMatchObject({ mode: 'write-shadow', limit: 3, intent: 'tech_de_bolso' });
  });
  it('builds panel-ready metadata with suggested copy and no publication action', () => {
    const metadata = buildShadowMetadata(product());
    expect(metadata).toMatchObject({ commercialCurationVersion: 'commercial-curation/v1', copyVersion: 'commercial-copy/v1', sourceOfferId: undefined });
    expect(metadata.suggestedCopy).toContain('🔗 Ver oferta');
    expect(metadata.shadowIdempotencyKey).toMatch(/^commercial-curation-v1:/);
  });
  it('returns ordered candidates and filters by intent', () => {
    const result = selectShadowCandidates([product(), product({ title: 'Carregador USB para celular', price: 25 })], { intent: 'tech_de_bolso', limit: 10 });
    expect(result.every((item) => item.commercialIntent === 'tech_de_bolso')).toBe(true);
  });
});
